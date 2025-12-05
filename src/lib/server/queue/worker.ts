// Background worker that processes queue jobs

import PocketBase from 'pocketbase';
import { QueueManager } from './queue-manager';
import { ConnectionPool } from './connection-pool';
import type { QueueJob, WorkerConfig } from './types';
import { convertPdfToImagesAsync, isPdfFile, type PdfConversionOptions } from '../pdf-converter';
import { buildPromptTemplate, MULTI_ROW_ADDON } from '$lib/prompt-presets';

export class QueueWorker {
	private queueManager: QueueManager;
	private connectionPool: ConnectionPool;
	private pb: PocketBase;
	private isRunning = false;
	private processingLoop: NodeJS.Timeout | null = null;

	constructor(
		private config: WorkerConfig,
		pocketbaseUrl: string,
		adminEmail: string,
		adminPassword: string
	) {
		this.queueManager = new QueueManager(pocketbaseUrl, adminEmail, adminPassword);
		this.connectionPool = new ConnectionPool(
			config.maxConcurrency,
			config.requestsPerMinute
		);
		this.pb = new PocketBase(pocketbaseUrl);
		this.authenticate(adminEmail, adminPassword);
	}

	private async authenticate(email: string, password: string): Promise<void> {
		try {
			await this.pb.collection('_superusers').authWithPassword(email, password);
		} catch (error) {
			console.error('Worker authentication failed:', error);
			throw error;
		}
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			console.log('Worker already running');
			return;
		}

		this.isRunning = true;
		console.log('Queue worker started');

		// Clean up any orphaned "processing" batches from previous runs
		await this.cleanupStaleBatches();

		// Process jobs continuously
		this.processLoop();
	}

	private async cleanupStaleBatches(): Promise<void> {
		try {
			console.log('[Queue] Checking for stale processing batches...');

			// Find all batches stuck in "processing" status
			const staleBatches = await this.pb.collection('image_batches').getFullList({
				filter: 'status = "processing"'
			});

			if (staleBatches.length === 0) {
				console.log('[Queue] No stale batches found');
				return;
			}

			console.log(`[Queue] Found ${staleBatches.length} batches in processing status`);

			// For each stale batch, check if there's an active queue job
			for (const batch of staleBatches) {
				try {
					const activeJobs = await this.pb.collection('queue_jobs').getFullList({
						filter: `status = "processing"`
					});

					// Check if any active job is for this batch
					const hasActiveJob = activeJobs.some(
						(job: any) => job.data?.batchId === batch.id
					);

					if (!hasActiveJob) {
						// No active job - reset batch to pending
						await this.pb.collection('image_batches').update(batch.id, {
							status: 'pending'
						});
						console.log(`[Queue] Reset orphaned batch ${batch.id} to pending`);
					}
				} catch (err) {
					console.error(`[Queue] Error checking batch ${batch.id}:`, err);
				}
			}

			console.log('[Queue] Stale batch cleanup complete');
		} catch (error) {
			console.error('[Queue] Error during stale batch cleanup:', error);
		}
	}

	async stop(): Promise<void> {
		this.isRunning = false;
		if (this.processingLoop) {
			clearTimeout(this.processingLoop);
		}
		console.log('Queue worker stopped');
	}

	private async processLoop(): Promise<void> {
		while (this.isRunning) {
			try {
				const job = await this.queueManager.getNextJob();

				if (job) {
					await this.processJob(job);
				} else {
					// No jobs available, wait before checking again
					await this.sleep(2000);
				}
			} catch (error) {
				console.error('Error in processing loop:', error);
				await this.sleep(5000);
			}
		}
	}

	private async processJob(job: QueueJob): Promise<void> {
		console.log(`Processing job ${job.id} (${job.type})`);

		try {
			switch (job.type) {
				case 'process_batch':
					await this.processBatch(job);
					break;
				case 'reprocess_batch':
					await this.reprocessBatches(job);
					break;
				case 'process_redo':
					await this.processRedo(job);
					break;
				default:
					throw new Error(`Unknown job type: ${job.type}`);
			}

			await this.queueManager.markCompleted(job.id);
			console.log(`Job ${job.id} completed successfully`);
		} catch (error: any) {
			console.error(`Job ${job.id} failed:`, error);
			await this.queueManager.markFailed(job.id, error.message, true);
		}
	}

	private async processBatch(job: QueueJob): Promise<void> {
		const { batchId, projectId } = job.data as any;
		const startTime = Date.now();
		let images: any[] = [];

		// Update batch status to processing
		await this.pb.collection('image_batches').update(batchId, {
			status: 'processing',
			processing_started: new Date().toISOString()
		});

		try {
			// Load project settings
			const project = await this.pb.collection('projects').getOne(projectId);
			const settings = project.settings;

			// Fetch images for batch
			images = await this.pb.collection('images').getFullList({
				filter: `batch = "${batchId}"`,
				sort: '+order'
			});

			// Convert images to base64 and collect extracted text
			// Handle PDFs by converting them to images first
			const imageData: Array<{ dataUrl: string; extractedText: string | null }> = [];

			// Build PDF conversion options from project settings
			const pdfOptions: PdfConversionOptions = {
				scale: (settings.pdfDpi ?? 600) / 72, // Convert DPI to scale factor
				maxWidth: settings.pdfMaxWidth ?? 7100,
				maxHeight: settings.pdfMaxHeight ?? 7100,
				format: settings.pdfFormat ?? 'png',
				quality: (settings.pdfQuality ?? 100) / 100 // Convert percentage to 0-1 range
			};

			for (const img of images) {
				const url = this.pb.files.getURL(img, img.image);
				const response = await fetch(url);
				const blob = await response.blob();

				// Check if this is a PDF file
				if (isPdfFile(img.image)) {
					console.log(`Converting PDF to images: ${img.image} (DPI: ${settings.pdfDpi ?? 600}, Format: ${pdfOptions.format})`);

					// Convert blob to buffer
					const arrayBuffer = await blob.arrayBuffer();
					const buffer = Buffer.from(arrayBuffer);

					// Convert PDF to images using worker thread (non-blocking)
					const convertedPages = await convertPdfToImagesAsync(buffer, img.image, pdfOptions);

					// Add each page as a separate image
					for (const page of convertedPages) {
						const pageDataUrl = `data:${page.mimeType};base64,${page.buffer.toString('base64')}`;
						imageData.push({
							dataUrl: pageDataUrl,
							extractedText: page.extractedText || null
						});
					}

					console.log(`Converted PDF ${img.image} to ${convertedPages.length} images`);
				} else {
					// Regular image - just convert to base64
					const dataUrl = await this.blobToBase64DataUrl(blob);
					imageData.push({
						dataUrl,
						extractedText: img.extracted_text || null
					});
				}
			}

			// Generate prompt
			const bboxOrder = this.getBboxOrder(settings.coordinateFormat);
			const multiRowEnabled = settings.multiRowExtraction || false;
			const prompt = this.generatePrompt(
				settings.columns,
				settings.coordinateFormat,
				bboxOrder,
				multiRowEnabled
			);

			// Build content array with images and extracted text
			const contentArray: any[] = [{ type: 'text', text: prompt }];

			imageData.forEach((img, index) => {
				// Add the image
				contentArray.push({
					type: 'image_url',
					image_url: { url: img.dataUrl }
				});

				// Add extracted text if available
				if (img.extractedText && img.extractedText.trim()) {
					contentArray.push({
						type: 'text',
						text: `[Extracted text from page ${index + 1}]: ${img.extractedText}`
					});
				}
			});

			// Call LLM API using connection pool
			// Use AbortController with configurable timeout (default 10 minutes)
			const timeoutMinutes = settings.requestTimeout ?? 10;
			const result = await this.connectionPool.execute(async () => {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeoutMinutes * 60 * 1000);

				try {
					const response = await fetch(settings.endpoint, {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${settings.apiKey}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							model: settings.modelName,
							messages: [
								{
									role: 'user',
									content: contentArray
								}
							]
						}),
						signal: controller.signal
					});

					if (!response.ok) {
						const errorBody = await response.text();
						throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
					}

					return response.json();
				} finally {
					clearTimeout(timeoutId);
				}
			});

			// Parse response
			let content = result.choices[0].message.content;
			content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

			console.log('=== LLM Response Debugging ===');
			console.log('Raw content:', content);

			let parsedData = JSON.parse(content);
			console.log('Parsed data type:', Array.isArray(parsedData) ? 'array' : typeof parsedData);
			console.log('Parsed data keys:', Object.keys(parsedData));
			console.log('Available columns:', settings.columns.map((c: any) => ({ id: c.id, name: c.name })));

			// Check if the response is wrapped in an "extractions" property
			if (parsedData && typeof parsedData === 'object' && 'extractions' in parsedData) {
				console.log('Detected wrapped format with "extractions" key');
				parsedData = parsedData.extractions;
				console.log('Unwrapped to:', Array.isArray(parsedData) ? `array with ${parsedData.length} items` : typeof parsedData);
			}

			// Check for Gemini simple format
			if (this.isGeminiSimpleFormat(parsedData)) {
				console.log('Detected format: Gemini simple format');
				parsedData = this.transformGeminiFormat(parsedData, settings.columns);
				console.log('Transformed extractions count:', parsedData.length);
			}
			// Check for mixed format (object with column data mixed with metadata)
			else if (!Array.isArray(parsedData) && typeof parsedData === 'object') {
				console.log('Detected format: Mixed format');
				parsedData = this.transformMixedFormat(parsedData, settings.columns);
				console.log('Transformed extractions count:', parsedData.length);
			}
			// Check if already in array format
			else if (Array.isArray(parsedData)) {
				console.log('Detected format: Array of extractions');
				console.log('Array length:', parsedData.length);

				// Check if array items are in mixed format and need transformation
				if (parsedData.length > 0 && parsedData[0] && !parsedData[0].column_id) {
					console.log('Array items need transformation (no column_id found)');
					const transformed = [];
					for (const item of parsedData) {
						const result = this.transformMixedFormat(item, settings.columns);
						transformed.push(...result);
					}
					parsedData = transformed;
					console.log('Transformed array to', parsedData.length, 'extractions');
				}

				console.log('Final extractions count:', parsedData.length);
			}
			else {
				console.log('Unknown format detected!');
			}

			console.log('Final parsedData:', JSON.stringify(parsedData, null, 2));
			console.log('=== End Debugging ===');

			// Always use multi-row parsing (single-row is just multi-row with one item)
			const extractedRows = this.parseMultiRowResponse(parsedData, settings.columns);
			console.log(`Parsed ${extractedRows.length} rows from LLM response`);

			// Create extraction_rows records using batch API for better performance
			// NOTE: PocketBase treats 0 as blank for required numeric fields, so we use 1-based indexing
			const batch = this.pb.createBatch();
			for (let rowIndex = 0; rowIndex < extractedRows.length; rowIndex++) {
				batch.collection('extraction_rows').create({
					batch: batchId,
					project: projectId,
					row_index: rowIndex + 1, // 1-based indexing (PocketBase treats 0 as blank)
					row_data: extractedRows[rowIndex],
					status: 'review'
				});
			}

			try {
				await batch.send();
				console.log(`Created ${extractedRows.length} extraction_rows using batch API`);
			} catch (err: any) {
				console.error('Failed to create extraction_rows:', err);
				console.error('Error details:', JSON.stringify(err.response, null, 2));
				throw err;
			}

			// Update batch with metadata (keep processed_data for backward compatibility during transition)
			await this.pb.collection('image_batches').update(batchId, {
				status: 'review',
				processed_data: { extractions: parsedData }, // Keep for backward compatibility
				row_count: extractedRows.length,
				processing_completed: new Date().toISOString()
			});

			// Record metrics
			const endTime = Date.now();
			await this.pb.collection('processing_metrics').create({
				batchId: String(batchId),
				projectId: String(projectId),
				jobType: 'process_batch',
				startTime: new Date(startTime).toISOString(),
				endTime: new Date(endTime).toISOString(),
				durationMs: Number(endTime - startTime),
				status: 'success',
				imageCount: images.length,
				extractionCount: parsedData.length,
				modelUsed: String(settings.modelName),
				tokensUsed: result.usage?.total_tokens || null
			});
		} catch (error: any) {
			// Mark batch as failed
			await this.pb.collection('image_batches').update(batchId, {
				status: 'failed',
				error_message: error.message
			});

			// Record failure metrics
			const endTime = Date.now();
			try {
				await this.pb.collection('processing_metrics').create({
					batchId: String(batchId),
					projectId: String(projectId),
					jobType: 'process_batch',
					startTime: new Date(startTime).toISOString(),
					endTime: new Date(endTime).toISOString(),
					durationMs: Number(endTime - startTime),
					status: 'failed',
					errorMessage: String(error?.message || 'Unknown error'),
					imageCount: images?.length || 0
				});
			} catch (metricsError: any) {
				console.error('Failed to create failure metrics:', metricsError);
				console.error('Metrics error details:', JSON.stringify(metricsError.response || metricsError, null, 2));
			}

			throw error;
		}
	}

	private async reprocessBatches(job: QueueJob): Promise<void> {
		const { batchIds, projectId } = job.data as any;

		for (const batchId of batchIds) {
			// Delete all existing extraction_rows for this batch using batch API
			const existingRows = await this.pb.collection('extraction_rows').getFullList({
				filter: `batch = "${batchId}"`
			});

			if (existingRows.length > 0) {
				const deleteBatch = this.pb.createBatch();
				for (const row of existingRows) {
					deleteBatch.collection('extraction_rows').delete(row.id);
				}
				await deleteBatch.send();
				console.log(`Deleted ${existingRows.length} extraction_rows using batch API`);
			}

			// Reset batch to pending and clear all processing-related data
			await this.pb.collection('image_batches').update(batchId, {
				status: 'pending',
				processed_data: null,
				row_count: null,
				processing_completed: null,
				error_message: null,
				redo_processed_at: null
			});

			// Enqueue for processing
			await this.queueManager.enqueueBatch(batchId, projectId);
		}
	}

	private async processRedo(job: QueueJob): Promise<void> {
		const { batchId, projectId, rowIndex, redoColumnIds, croppedImageIds, sourceImageIds } = job.data as any;
		const startTime = Date.now();

		try {
			// Load project and batch
			const project = await this.pb.collection('projects').getOne(projectId);
			const settings = project.settings;

			const batch = await this.pb.collection('image_batches').getOne(batchId, {
				expand: 'images'
			});

			// NEW: Load the specific row to redo
			const existingRow = await this.pb.collection('extraction_rows').getFirstListItem(
				`batch = "${batchId}" && row_index = ${rowIndex}`
			);

			// Separate correct and redo extractions for THIS ROW only
			const allExtractions = existingRow.row_data as any[];
			const correctExtractions = allExtractions.filter(
				(e: any) => !redoColumnIds.includes(e.column_id)
			);
			const redoColumns = settings.columns.filter((c: any) => redoColumnIds.includes(c.id));

			console.log(`Processing redo for batch ${batchId}, row ${rowIndex}, columns:`, redoColumnIds);

			// Create a mapping from LLM image_index (0, 1, 2...) to the actual cropped image ID
			const imageIndexToCroppedId: string[] = [];

			// Load cropped images
			const croppedImages: string[] = [];
			for (const columnId of redoColumnIds) {
				const imageId = croppedImageIds[columnId];
				if (!imageId) {
					throw new Error(`No cropped image found for column ${columnId}`);
				}
				const img = await this.pb.collection('images').getOne(imageId);
				const url = this.pb.files.getURL(img, img.image);
				const response = await fetch(url);
				const blob = await response.blob();
				const dataUrl = await this.blobToBase64DataUrl(blob);
				croppedImages.push(dataUrl);

				// Store the cropped image ID for this index
				// The LLM will return image_index: 0 for the first cropped image, etc.
				imageIndexToCroppedId.push(imageId);
			}

			if (croppedImages.length === 0) {
				throw new Error('No cropped images to process');
			}

			// Generate redo prompt
			const prompt = this.generateRedoPrompt(
				settings.reviewPromptTemplate,
				correctExtractions,
				redoColumns,
				settings.coordinateFormat
			);

			// Call LLM API
			// Use AbortController with configurable timeout (default 10 minutes)
			const timeoutMinutes = settings.requestTimeout ?? 10;
			const result = await this.connectionPool.execute(async () => {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), timeoutMinutes * 60 * 1000);

				try {
					const response = await fetch(settings.endpoint, {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${settings.apiKey}`,
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							model: settings.modelName,
							messages: [
								{
									role: 'user',
									content: [
										{ type: 'text', text: prompt },
										...croppedImages.map((url) => ({
											type: 'image_url',
											image_url: { url }
										}))
									]
								}
							]
						}),
						signal: controller.signal
					});

					if (!response.ok) {
						const errorBody = await response.text();
						throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
					}

					return response.json();
				} finally {
					clearTimeout(timeoutId);
				}
			});

			// Parse response
			let content = result.choices[0].message.content;
			content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

			console.log('=== Redo LLM Response Debugging ===');
			console.log('Raw content:', content);

			let redoExtractions = JSON.parse(content);
			console.log('Parsed data type:', Array.isArray(redoExtractions) ? 'array' : typeof redoExtractions);
			console.log('Parsed data keys:', Object.keys(redoExtractions));

			// Check if the response is wrapped in an "extractions" property
			if (redoExtractions && typeof redoExtractions === 'object' && 'extractions' in redoExtractions) {
				console.log('Detected wrapped format with "extractions" key');
				redoExtractions = redoExtractions.extractions;
				console.log('Unwrapped to:', Array.isArray(redoExtractions) ? `array with ${redoExtractions.length} items` : typeof redoExtractions);
			}

			// Check for Gemini simple format
			if (this.isGeminiSimpleFormat(redoExtractions)) {
				console.log('Detected format: Gemini simple format');
				redoExtractions = this.transformGeminiFormat(redoExtractions, redoColumns);
				console.log('Transformed extractions count:', redoExtractions.length);
			}
			// Check for mixed format (object with column data mixed with metadata)
			else if (!Array.isArray(redoExtractions) && typeof redoExtractions === 'object') {
				console.log('Detected format: Mixed format');
				redoExtractions = this.transformMixedFormat(redoExtractions, redoColumns);
				console.log('Transformed extractions count:', redoExtractions.length);
			}
			// Check if already in array format
			else if (Array.isArray(redoExtractions)) {
				console.log('Detected format: Array of extractions');
				console.log('Array length:', redoExtractions.length);

				// Check if array items are in mixed format and need transformation
				if (redoExtractions.length > 0 && redoExtractions[0] && !redoExtractions[0].column_id) {
					console.log('Array items need transformation (no column_id found)');
					const transformed = [];
					for (const item of redoExtractions) {
						const result = this.transformMixedFormat(item, redoColumns);
						transformed.push(...result);
					}
					redoExtractions = transformed;
					console.log('Transformed array to', redoExtractions.length, 'extractions');
				}
			}
			else {
				console.log('Unknown format detected!');
			}

			console.log('Final redoExtractions:', JSON.stringify(redoExtractions, null, 2));
			console.log('=== End Redo Debugging ===');

			// Ensure redoExtractions is an array
			if (!Array.isArray(redoExtractions)) {
				console.error('redoExtractions is not an array after transformation!');
				throw new Error('Failed to parse redo extractions into array format');
			}

			// Map image indices to the correct cropped images in the batch
			// The LLM returns image_index referring to the cropped images we sent (0, 1, 2...),
			// but we need to map those to the actual position of the cropped images in the batch array
			const batchImages = batch.expand?.images || [];
			redoExtractions = redoExtractions.map((e: any) => {
				// Get the cropped image ID for this extraction's image_index
				const croppedImageId = imageIndexToCroppedId[e.image_index];

				if (!croppedImageId) {
					console.warn(`No cropped image ID found for LLM image_index ${e.image_index}, keeping original index`);
					return { ...e, redone: true };
				}

				// Find the index of this cropped image in the batch's image array
				const actualImageIndex = batchImages.findIndex((img: any) => img.id === croppedImageId);

				if (actualImageIndex === -1) {
					console.warn(`Could not find cropped image ${croppedImageId} in batch images, keeping original index ${e.image_index}`);
					return { ...e, redone: true };
				}

				console.log(`Mapping extraction for ${e.column_id}: LLM image_index ${e.image_index} -> cropped image ${croppedImageId} -> batch index ${actualImageIndex}`);

				return {
					...e,
					image_index: actualImageIndex, // Use the actual index of the cropped image in the batch
					redone: true
				};
			});

			// Merge extractions
			const mergedExtractions = [...correctExtractions, ...redoExtractions];

			// NEW: Update only the specific row
			await this.pb.collection('extraction_rows').update(existingRow.id, {
				row_data: mergedExtractions,
				status: 'review'
			});

			// Also update batch (backward compatibility)
			// Note: For multi-row batches, this doesn't fully represent all rows, but kept for transition
			await this.pb.collection('image_batches').update(batchId, {
				status: 'review',
				redo_processed_at: new Date().toISOString()
			});

			console.log(`Updated extraction_row ${existingRow.id} with ${mergedExtractions.length} total extractions`);

			// Record metrics
			const endTime = Date.now();
			const metricsData = {
				batchId: String(batchId),
				projectId: String(projectId),
				jobType: 'process_redo',
				startTime: new Date(startTime).toISOString(),
				endTime: new Date(endTime).toISOString(),
				durationMs: Number(endTime - startTime),
				status: 'success',
				imageCount: croppedImages.length,
				extractionCount: redoExtractions.length,
				modelUsed: String(settings.modelName),
				tokensUsed: result.usage?.total_tokens || null
			};
			console.log('Creating processing_metrics with data:', JSON.stringify(metricsData, null, 2));
			await this.pb.collection('processing_metrics').create(metricsData);
		} catch (error: any) {
			// Record failure metrics
			const endTime = Date.now();
			const failureMetrics = {
				batchId: String(batchId),
				projectId: String(projectId),
				jobType: 'process_redo',
				startTime: new Date(startTime).toISOString(),
				endTime: new Date(endTime).toISOString(),
				durationMs: Number(endTime - startTime),
				status: 'failed',
				errorMessage: String(error?.message || 'Unknown error'),
				imageCount: 0
			};
			console.log('Creating failure metrics with data:', JSON.stringify(failureMetrics, null, 2));

			try {
				await this.pb.collection('processing_metrics').create(failureMetrics);
			} catch (metricsError: any) {
				console.error('Failed to create failure metrics:', metricsError);
				console.error('Metrics error details:', JSON.stringify(metricsError.response || metricsError, null, 2));
			}

			throw error;
		}
	}

	private async blobToBase64DataUrl(blob: Blob): Promise<string> {
		const arrayBuffer = await blob.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const base64 = buffer.toString('base64');
		const mimeType = blob.type || 'image/jpeg';
		return `data:${mimeType};base64,${base64}`;
	}

	private generatePrompt(columns: any[], coordinateFormat: string, bboxOrder: string = '[x1, y1, x2, y2]', multiRowEnabled: boolean = false): string {
		// Build the base template, conditionally adding multi-row instructions
		let prompt = buildPromptTemplate(multiRowEnabled);

		// Generate fields section
		let fieldsSection = '';
		columns.forEach((col, index) => {
			fieldsSection += `Field ${index + 1}:\n`;
			fieldsSection += `  ID: "${col.id}"\n`;
			fieldsSection += `  Name: "${col.name}"\n`;
			fieldsSection += `  Type: ${col.type}\n`;
			if (col.description) {
				fieldsSection += `  Description: ${col.description}\n`;
			}
			if (col.allowedValues) {
				fieldsSection += `  Allowed values: ${col.allowedValues}\n`;
			}
			if (col.regex) {
				fieldsSection += `  Validation pattern: ${col.regex}\n`;
			}
			fieldsSection += '\n';
		});

		// Generate field examples section with actual column IDs/names
		// Include row_index only when multi-row is enabled
		let fieldExamples = '';
		columns.forEach((col, index) => {
			const isLast = index === columns.length - 1;
			fieldExamples += '    {\n';
			if (multiRowEnabled) {
				fieldExamples += '      "row_index": 0,\n';
			}
			fieldExamples += `      "column_id": "${col.id}",\n`;
			fieldExamples += `      "column_name": "${col.name}",\n`;
			fieldExamples += '      "value": "extracted value here",\n';
			fieldExamples += '      "image_index": 0,\n';
			fieldExamples += `      "bbox_2d": ${bboxOrder},\n`;
			fieldExamples += '      "confidence": 0.95\n';
			fieldExamples += `    }${isLast ? '' : ','}\n`;
		});

		// Replace placeholders
		prompt = prompt
			.replace(/\{\{FIELDS\}\}/g, fieldsSection.trim())
			.replace(/\{\{FIELD_EXAMPLES\}\}/g, fieldExamples)
			.replace(/\{\{BBOX_FORMAT\}\}/g, bboxOrder);

		prompt += `\n\nCoordinate Format: ${coordinateFormat}`;

		return prompt;
	}

	private generateRedoPrompt(
		template: string,
		correctExtractions: any[],
		redoColumns: any[],
		coordinateFormat: string
	): string {
		// Start with base template (usually contains general extraction instructions)
		let prompt = template;

		// Build context section showing already-extracted correct values
		const contextText = correctExtractions
			.map((e) => `  - ${e.column_name}: ${e.value}`)
			.join('\n');
		prompt = prompt.replace('{correct_extractions}', contextText || '  (No correct extractions yet)');

		// Build the redo columns list (simple format for template placeholder)
		const redoText = redoColumns
			.map((col) => `- ${col.name} (${col.type}): ${col.description}`)
			.join('\n');
		prompt = prompt.replace('{redo_columns}', redoText);

		// Now add comprehensive context and instructions
		prompt += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
		prompt += `\n📋 REDO EXTRACTION CONTEXT`;
		prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

		prompt += `\nYou are performing a REDO extraction. This means:`;
		prompt += `\n• You previously processed this document and extracted multiple fields`;
		prompt += `\n• Some extractions were correct and are being kept`;
		prompt += `\n• The user has selected ${redoColumns.length} specific field(s) for re-extraction`;
		prompt += `\n• You are receiving ${redoColumns.length} CROPPED image(s) focused on the region(s) of interest\n`;

		prompt += `\n✅ ALREADY EXTRACTED (CORRECT - DO NOT RE-EXTRACT):\n${contextText || '  (None)'}\n`;

		prompt += `\n🔄 FIELDS TO RE-EXTRACT (marked by user for improvement):\n`;
		redoColumns.forEach((col, index) => {
			prompt += `\n${index + 1}. "${col.name}"`;
			prompt += `\n   • Column ID: "${col.id}"`;
			prompt += `\n   • Type: ${col.type}`;
			prompt += `\n   • Description: ${col.description || '(no description)'}`;
			if (col.allowedValues) {
				prompt += `\n   • Allowed Values: ${col.allowedValues}`;
			}
			if (col.regex) {
				prompt += `\n   • Validation Pattern: ${col.regex}`;
			}
			prompt += `\n`;
		});

		prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
		prompt += `\n📝 CRITICAL INSTRUCTIONS`;
		prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

		prompt += `\n1. Extract ONLY the ${redoColumns.length} field(s) listed under "FIELDS TO RE-EXTRACT"`;
		prompt += `\n2. Do NOT re-extract any fields marked as "ALREADY EXTRACTED"`;
		prompt += `\n3. The cropped image(s) you're receiving are focused on specific regions`;
		prompt += `\n4. Pay CLOSE ATTENTION to the field descriptions - they contain formatting requirements`;
		prompt += `\n5. Use the EXACT column_id and column_name from the "FIELDS TO RE-EXTRACT" section\n`;

		prompt += `\n⚠️ SPECIAL FORMATTING REQUIREMENTS:\n`;
		redoColumns.forEach((col) => {
			if (col.description.toLowerCase().includes('json')) {
				prompt += `\n• "${col.name}": Must be formatted as a JSON string (as stated in description)`;
			}
			if (col.description.toLowerCase().includes('separator')) {
				const match = col.description.match(/separator\s+(?:is|:)\s*([^\n.]+)/i);
				if (match) {
					prompt += `\n• "${col.name}": Use separator "${match[1].trim()}"`;
				}
			}
			if (col.allowedValues) {
				prompt += `\n• "${col.name}": Value must be one of: ${col.allowedValues}`;
			}
		});
		prompt += `\n`;

		prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
		prompt += `\n📤 REQUIRED OUTPUT FORMAT`;
		prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

		prompt += `\nReturn ONLY a JSON array in this EXACT structure:\n`;
		prompt += `\n[\n`;
		redoColumns.forEach((col, index) => {
			prompt += `  {\n`;
			prompt += `    "column_id": "${col.id}",      // EXACT ID - do not change\n`;
			prompt += `    "column_name": "${col.name}",  // EXACT name - do not change\n`;
			prompt += `    "value": "your extracted value here following the description requirements",\n`;
			prompt += `    "image_index": 0,\n`;
			prompt += `    "bbox_2d": [y_min, x_min, y_max, x_max],  // Coordinate Format: ${coordinateFormat}\n`;
			prompt += `    "confidence": 0.95\n`;
			prompt += `  }${index < redoColumns.length - 1 ? ',' : ''}\n`;
		});
		prompt += `]\n`;

		prompt += `\n❌ DO NOT:\n`;
		prompt += `• Extract fields not in the "FIELDS TO RE-EXTRACT" list`;
		prompt += `• Use different column_id or column_name values`;
		prompt += `• Wrap response in markdown code blocks or "extractions" object`;
		prompt += `• Add explanations or notes outside the JSON\n`;

		prompt += `\n✅ DO:\n`;
		prompt += `• Follow the exact format requirements in each field's description`;
		prompt += `• Use null if the information is not visible`;
		prompt += `• Provide accurate bounding boxes in ${coordinateFormat} format`;
		prompt += `• Return confidence scores based on clarity of the information\n`;

		return prompt;
	}

	private isGeminiSimpleFormat(data: any): boolean {
		if (Array.isArray(data)) return false;
		if (typeof data !== 'object') return false;

		const hasArrayFields = Object.values(data).some((v) => Array.isArray(v));
		if (hasArrayFields) return false;

		const hasComplexObjects = Object.values(data).some(
			(v) => typeof v === 'object' && v !== null && !Array.isArray(v)
		);
		if (hasComplexObjects) return false;

		return true;
	}

	private transformGeminiFormat(data: any, columns: any[]): any[] {
		const extractions: any[] = [];

		console.log('--- transformGeminiFormat Debug ---');
		console.log('Input data keys:', Object.keys(data));
		console.log('Input columns:', columns.map(c => ({ id: c.id, name: c.name })));

		for (const [key, value] of Object.entries(data)) {
			// Find matching column (case-insensitive matching)
			const column = columns.find((c) => {
				const nameMatch = c.name.toLowerCase() === key.toLowerCase();
				const idMatch = c.id === key;
				return nameMatch || idMatch;
			});

			if (column) {
				console.log(`Matched key "${key}" to column "${column.name}" (${column.id})`);
				extractions.push({
					column_id: column.id,
					column_name: column.name,
					value: value,
					image_index: 0,
					bbox_2d: [0, 0, 1000, 1000],
					confidence: 0.9
				});
			} else {
				console.log(`No matching column found for key: "${key}"`);
			}
		}

		console.log(`Created ${extractions.length} extractions`);
		console.log('--- End transformGeminiFormat Debug ---');

		return extractions;
	}

	private transformMixedFormat(data: any, columns: any[]): any[] {
		const extractions: any[] = [];

		console.log('--- transformMixedFormat Debug ---');
		console.log('Input data keys:', Object.keys(data));
		console.log('Input columns:', columns.map(c => ({ id: c.id, name: c.name })));

		// Check if this is Gemini's field_name/value format
		if ('field_name' in data && 'value' in data) {
			console.log('Detected Gemini field_name/value format');
			const fieldName = data.field_name;
			const fieldValue = data.value;

			// Extract metadata
			const metadata = {
				image_index: data.image_index ?? 0,
				bbox_2d: data.bbox_2d ?? [0, 0, 1000, 1000],
				confidence: data.confidence ?? 0.9
			};
			console.log('Extracted metadata:', metadata);

			// Find matching column for field_name
			const column = columns.find((c) => {
				const nameMatch = c.name.toLowerCase() === fieldName.toLowerCase();
				const idMatch = c.id === fieldName;
				return nameMatch || idMatch;
			});

			if (column) {
				console.log(`Matched field_name "${fieldName}" to column "${column.name}" (${column.id})`);
				extractions.push({
					column_id: column.id,
					column_name: column.name,
					value: fieldValue,
					...metadata
				});
			} else {
				console.log(`No matching column found for field_name: "${fieldName}"`);
			}

			console.log(`Created ${extractions.length} extractions`);
			console.log('--- End transformMixedFormat Debug ---');
			return extractions;
		}

		// Original logic for direct key-value format (Qwen style)
		// Extract metadata fields if present
		const metadataFields = new Set(['bbox_2d', 'confidence', 'image_index']);
		const metadata: any = {};

		// Collect metadata
		for (const key of metadataFields) {
			if (key in data) {
				metadata[key] = data[key];
			}
		}
		console.log('Extracted metadata:', metadata);

		// Process column data
		for (const [key, value] of Object.entries(data)) {
			// Skip metadata fields
			if (metadataFields.has(key)) {
				console.log(`Skipping metadata field: ${key}`);
				continue;
			}

			// Find matching column (case-insensitive matching)
			const column = columns.find((c) => {
				const nameMatch = c.name.toLowerCase() === key.toLowerCase();
				const idMatch = c.id === key;
				return nameMatch || idMatch;
			});

			if (column) {
				console.log(`Matched key "${key}" to column "${column.name}" (${column.id})`);
				extractions.push({
					column_id: column.id,
					column_name: column.name,
					value: value,
					image_index: metadata.image_index ?? 0,
					bbox_2d: metadata.bbox_2d ?? [0, 0, 1000, 1000],
					confidence: metadata.confidence ?? 0.9
				});
			} else {
				console.log(`No matching column found for key: "${key}"`);
			}
		}

		console.log(`Created ${extractions.length} extractions`);
		console.log('--- End transformMixedFormat Debug ---');

		return extractions;
	}

	private parseMultiRowResponse(llmResponse: any, columns: any[]): any[][] {
		console.log('=== parseMultiRowResponse Debug ===');
		console.log('Input type:', Array.isArray(llmResponse) ? 'array' : typeof llmResponse);

		// If llmResponse is already in array format
		if (Array.isArray(llmResponse)) {
			// Check if first element has row_index field
			if (llmResponse.length > 0 && llmResponse[0] && typeof llmResponse[0].row_index === 'number') {
				console.log('Detected format: Flat array with row_index field');

				// Group by row_index
				const groupedByRow = new Map<number, any[]>();
				for (const extraction of llmResponse) {
					const rowIdx = extraction.row_index || 0;
					if (!groupedByRow.has(rowIdx)) {
						groupedByRow.set(rowIdx, []);
					}
					groupedByRow.get(rowIdx)!.push(extraction);
				}

				// Convert to array of arrays, sorted by row_index
				const rows = Array.from(groupedByRow.entries())
					.sort((a, b) => a[0] - b[0])
					.map(([_, extractions]) => extractions);

				console.log(`Grouped into ${rows.length} rows`);
				console.log('=== End parseMultiRowResponse Debug ===');
				return rows;
			}

			// Otherwise, treat entire array as single row
			console.log('Detected format: Array without row_index (single row)');
			console.log('=== End parseMultiRowResponse Debug ===');
			return [llmResponse];
		}

		// If llmResponse has a 'rows' key
		if (llmResponse && typeof llmResponse === 'object' && 'rows' in llmResponse) {
			console.log('Detected format: Nested structure with "rows" key');
			const rows = llmResponse.rows;

			if (!Array.isArray(rows)) {
				console.log('rows key is not an array, treating as single row');
				console.log('=== End parseMultiRowResponse Debug ===');
				return [this.transformMixedFormat(rows, columns)];
			}

			// Process each row
			const processedRows = rows.map((row: any) => {
				if (Array.isArray(row)) return row;
				if (row.fields) return row.fields;
				return this.transformMixedFormat(row, columns);
			});

			console.log(`Processed ${processedRows.length} rows`);
			console.log('=== End parseMultiRowResponse Debug ===');
			return processedRows;
		}

		// Unknown format - treat as single row
		console.log('Detected format: Unknown (treating as single row)');
		console.log('=== End parseMultiRowResponse Debug ===');
		return [this.transformMixedFormat(llmResponse, columns)];
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	updateConfig(config: Partial<WorkerConfig>): void {
		if (config.maxConcurrency !== undefined || config.requestsPerMinute !== undefined) {
			this.connectionPool.updateConfig(
				config.maxConcurrency ?? this.config.maxConcurrency,
				config.requestsPerMinute ?? this.config.requestsPerMinute
			);
		}

		this.config = { ...this.config, ...config };
	}

	getStats() {
		return this.connectionPool.getStats();
	}

	private getBboxOrder(coordinateFormat: string): string {
		// Map coordinate format to bbox order string for prompt examples
		switch (coordinateFormat) {
			case 'normalized_1000_yxyx':
			case 'normalized_1024_yxyx':
				return '[y_min, x_min, y_max, x_max]';
			case 'normalized_1000':
			case 'normalized_1':
			case 'pixels':
			case 'yolo':
			default:
				return '[x1, y1, x2, y2]';
		}
	}
}
