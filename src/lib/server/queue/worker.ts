// Background worker that processes queue jobs

import PocketBase from 'pocketbase';
import { QueueManager } from './queue-manager';
import { ConnectionPool } from './connection-pool';
import type { QueueJob, WorkerConfig } from './types';
import { convertPdfToImages, isPdfFile, type PdfConversionOptions } from '../pdf-converter';
import { scaleImageToMaxDimension } from '../image-scaler';
import { buildModularPrompt, buildPerPagePrompt, formatExtractionsAsToon } from '$lib/prompt-presets';
import { withFeatureFlagDefaults, createExtractionResult, type ExtractionFeatureFlags, type ExtractionResultInput } from '$lib/types/extraction';
import { getBboxOrder } from '$lib/utils/coordinates';
import { findColumnByKeyOrName } from '$lib/utils/column-matcher';
import { BatchStatus } from '$lib/constants/batch-status';
import { decode as decodeToon } from '@toon-format/toon';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import {
	getEndpointWithLimits,
	checkEndpointLimits,
	updateEndpointUsage,
	updateUserEndpointUsage,
	type LlmEndpoint
} from '../admin-auth';
import { getInstanceLimits } from '../instance-config';
import { validateExternalUrl } from '../url-validator';

/** Per-request metric data for tracking individual LLM calls within a batch */
interface RequestDetailData {
	requestIndex: number;
	imageStart: number;
	imageEnd: number;
	inputTokens: number;
	outputTokens: number;
	durationMs: number;
}

/** Represents a single image or PDF being converted before batch LLM processing */
interface ProcessableItem {
	originalIndex: number;
	image: any;
	pages: Array<{ dataUrl: string; extractedText: string | null }>;
}

export class QueueWorker {
	private queueManager: QueueManager;
	private projectPools: Map<string, ConnectionPool> = new Map();
	private projectActiveJobs: Map<string, number> = new Map(); // Track active jobs per project
	private projectMaxConcurrency: Map<string, number> = new Map(); // Cache max concurrency per project
	private projectSettingsLastFetch: Map<string, number> = new Map(); // Track when settings were last fetched
	private projectPoolLastActivity: Map<string, number> = new Map(); // Track last activity per pool
	private readonly SETTINGS_CACHE_TTL = 10000; // Refresh settings every 10 seconds
	private readonly POOL_IDLE_TIMEOUT = 10 * 60 * 1000; // Clean up pools after 10 minutes of inactivity
	private readonly MAX_EMPTY_POLLS = 5; // Stop after 5 consecutive empty polls (10 seconds)
	private lastPoolCleanup = 0; // Track last cleanup time
	private pb: PocketBase;
	private isRunning = false;
	private processingLoop: NodeJS.Timeout | null = null;
	private boundProjectId: string | null = null; // null = global mode, string = per-project mode

	/** Callback for orchestrator cleanup when worker stops */
	public onStopped?: () => void;

	constructor(
		private config: WorkerConfig,
		pocketbaseUrl: string,
		adminEmail: string,
		adminPassword: string,
		projectId?: string // Optional: pass to run in per-project mode
	) {
		this.boundProjectId = projectId || null;
		this.queueManager = new QueueManager(pocketbaseUrl, adminEmail, adminPassword);
		this.pb = new PocketBase(pocketbaseUrl);
		this.authenticate(adminEmail, adminPassword);
	}

	/** Get the project ID this worker is bound to (null if global mode) */
	getBoundProjectId(): string | null {
		return this.boundProjectId;
	}

	/**
	 * Get or create a ConnectionPool for a specific project
	 * Each project has its own pool with its own rate limiting settings
	 */
	private getProjectPool(projectId: string, settings: any): ConnectionPool {
		const maxConcurrency = settings.enableParallelRequests
			? (settings.maxConcurrency || 3)
			: 1;
		const requestsPerMinute = settings.requestsPerMinute || 30;

		if (!this.projectPools.has(projectId)) {
			console.log(`[Pool] Creating new pool for project ${projectId}: maxConcurrency=${maxConcurrency}, rpm=${requestsPerMinute}`);
			this.projectPools.set(projectId, new ConnectionPool(maxConcurrency, requestsPerMinute));
		} else {
			// Update config in case settings changed
			const pool = this.projectPools.get(projectId)!;
			pool.updateConfig(maxConcurrency, requestsPerMinute);
		}

		// Track last activity for cleanup
		this.projectPoolLastActivity.set(projectId, Date.now());

		return this.projectPools.get(projectId)!;
	}

	/**
	 * Clean up idle project pools to free memory
	 */
	private cleanupIdlePools(): void {
		const now = Date.now();

		// Only run cleanup every minute
		if (now - this.lastPoolCleanup < 60000) {
			return;
		}
		this.lastPoolCleanup = now;

		// Log memory usage during cleanup
		this.logMemoryUsage();

		let cleanedCount = 0;
		for (const [projectId, lastActivity] of this.projectPoolLastActivity) {
			// Skip if project has active jobs
			const activeJobs = this.projectActiveJobs.get(projectId) || 0;
			if (activeJobs > 0) {
				continue;
			}

			// Clean up if idle for too long
			if (now - lastActivity > this.POOL_IDLE_TIMEOUT) {
				this.projectPools.delete(projectId);
				this.projectActiveJobs.delete(projectId);
				this.projectMaxConcurrency.delete(projectId);
				this.projectSettingsLastFetch.delete(projectId);
				this.projectPoolLastActivity.delete(projectId);
				cleanedCount++;
			}
		}

		if (cleanedCount > 0) {
			console.log(`[Pool] Cleaned up ${cleanedCount} idle pool(s), ${this.projectPools.size} remaining`);
		}
	}

	/**
	 * Log current memory usage for monitoring
	 */
	private logMemoryUsage(): void {
		const usage = process.memoryUsage();
		console.log(
			`[Memory] Heap: ${Math.round(usage.heapUsed / 1024 / 1024)}MB / ${Math.round(usage.heapTotal / 1024 / 1024)}MB, ` +
			`RSS: ${Math.round(usage.rss / 1024 / 1024)}MB, ` +
			`Pools: ${this.projectPools.size}`
		);
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
		if (this.boundProjectId) {
			console.log(`[Queue] Worker started for project ${this.boundProjectId}`);
		} else {
			console.log('[Queue] Global worker started');
			// Clean up any orphaned "processing" batches from previous runs (only in global mode)
			await this.cleanupStaleBatches();
		}

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
							status: BatchStatus.PENDING
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
		if (this.boundProjectId) {
			console.log(`[Queue] Worker stopped for project ${this.boundProjectId}`);
		} else {
			console.log('[Queue] Global worker stopped');
		}
		// Notify orchestrator that this worker has stopped
		this.onStopped?.();
	}

	private async processLoop(): Promise<void> {
		let consecutiveEmptyPolls = 0;

		while (this.isRunning) {
			try {
				// Periodically clean up idle project pools (only in global mode)
				if (!this.boundProjectId) {
					this.cleanupIdlePools();
				}

				// Use project-specific or global job fetching
				const job = this.boundProjectId
					? await this.queueManager.getNextJobForProject(this.boundProjectId)
					: await this.queueManager.getNextJob();

				if (job) {
					consecutiveEmptyPolls = 0; // Reset counter

					const projectId = (job.data as any)?.projectId || this.boundProjectId;

					if (projectId) {
						// Check if this project has capacity
						const activeForProject = this.projectActiveJobs.get(projectId) || 0;
						let maxForProject: number;

						// Get instance limits to cap project settings
						const instanceLimits = getInstanceLimits();

						// Check concurrent projects limit (free tier = 1 project at a time)
						const activeProjects = new Set(
							Array.from(this.projectActiveJobs.entries())
								.filter(([, count]) => count > 0)
								.map(([id]) => id)
						);
						if (!activeProjects.has(projectId) && activeProjects.size >= instanceLimits.maxConcurrentProjects) {
							// Another project is already processing, wait
							console.log(`[Queue] Instance at max concurrent projects (${activeProjects.size}/${instanceLimits.maxConcurrentProjects}), waiting...`);
							await this.queueManager.requeueJob(job.id);
							await this.sleep(1000);
							continue;
						}

						// Check if we need to refresh settings (cache expired or not set)
						const lastFetch = this.projectSettingsLastFetch.get(projectId) || 0;
						const now = Date.now();
						const needsRefresh = now - lastFetch > this.SETTINGS_CACHE_TTL;

						if (needsRefresh || this.projectMaxConcurrency.get(projectId) === undefined) {
							try {
								const project = await this.pb.collection('projects').getOne(projectId);
								const settings = project.settings || {};
								// Get project setting, but cap at instance limit
								const projectMax = settings.enableParallelRequests ? (settings.maxConcurrency || 3) : 1;
								maxForProject = Math.min(projectMax, instanceLimits.maxParallelRequests);
								this.projectMaxConcurrency.set(projectId, maxForProject);
								this.projectSettingsLastFetch.set(projectId, now);
							} catch (err) {
								console.error(`[Queue] Failed to load project settings for ${projectId}:`, err);
								// Fall back to cached value or default (capped at instance limit)
								maxForProject = Math.min(
									this.projectMaxConcurrency.get(projectId) ?? 1,
									instanceLimits.maxParallelRequests
								);
							}
						} else {
							// Use cached value but still cap at instance limit
							maxForProject = Math.min(
								this.projectMaxConcurrency.get(projectId)!,
								instanceLimits.maxParallelRequests
							);
						}

						if (activeForProject >= maxForProject) {
							// Project at capacity, put job back and wait
							console.log(`[Queue] Project ${projectId} at capacity (${activeForProject}/${maxForProject}), waiting...`);
							await this.queueManager.requeueJob(job.id);
							await this.sleep(500);
							continue;
						}

						// Increment active count for this project
						this.projectActiveJobs.set(projectId, activeForProject + 1);
						console.log(`[Queue] Starting job ${job.id} for project ${projectId} (active: ${activeForProject + 1}/${maxForProject})`);

						// Don't await - let it run concurrently
						this.processJob(job)
							.finally(() => {
								const current = this.projectActiveJobs.get(projectId) || 1;
								this.projectActiveJobs.set(projectId, Math.max(0, current - 1));
								console.log(`[Queue] Job ${job.id} finished for project ${projectId} (active: ${current - 1}/${maxForProject})`);
							});

						// Small delay to avoid hammering the queue
						await this.sleep(50);
					} else {
						// No projectId, just process it
						this.processJob(job);
						await this.sleep(100);
					}
				} else {
					consecutiveEmptyPolls++;

					// In per-project mode, stop after no jobs for a while
					if (this.boundProjectId && consecutiveEmptyPolls >= this.MAX_EMPTY_POLLS) {
						console.log(`[Queue] No more jobs for project ${this.boundProjectId} after ${consecutiveEmptyPolls} polls, stopping worker`);
						this.isRunning = false;
						break;
					}

					// No jobs available, wait before checking again
					await this.sleep(2000);
				}
			} catch (error) {
				console.error('Error in processing loop:', error);
				await this.sleep(5000);
			}
		}

		// Notify orchestrator that this worker has stopped
		this.onStopped?.();
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
		// Declare outside try block for cleanup in finally
		let items: ProcessableItem[] = [];
		let allPages: Array<{ dataUrl: string; extractedText: string | null }> = [];
		let managedEndpointId: string | null = null;

		// Update batch status to processing
		await this.pb.collection('image_batches').update(batchId, {
			status: BatchStatus.PROCESSING,
			processing_started: new Date().toISOString()
		});

		try {
			// Load project settings
			const project = await this.pb.collection('projects').getOne(projectId);
			const settings = project.settings;
			const projectOwnerId = project.owner as string | undefined;

			// Resolve endpoint settings (managed vs custom)
			const endpointSettings = await this.resolveEndpointSettings(settings);
			managedEndpointId = endpointSettings.managedEndpointId;

			// Note: Instance-wide limits are checked at enqueue time in /api/queue/enqueue
			// No need to re-check here since job is already approved and in processing state

			// Merge resolved endpoint settings into settings for use in LLM calls
			const effectiveSettings = {
				...settings,
				endpoint: endpointSettings.endpoint,
				apiKey: endpointSettings.apiKey,
				modelName: endpointSettings.modelName
			};

			// Fetch images for batch
			images = await this.pb.collection('images').getFullList({
				filter: this.pb.filter('batch = {:batchId}', { batchId }),
				sort: '+order'
			});

			// Build PDF conversion options from project settings
			const pdfOptions: PdfConversionOptions = {
				scale: (settings.pdfDpi ?? 600) / 72,
				maxWidth: settings.pdfMaxWidth ?? 7100,
				maxHeight: settings.pdfMaxHeight ?? 7100,
				format: settings.pdfFormat ?? 'png',
				quality: (settings.pdfQuality ?? 100) / 100
			};

			// Extract feature flags and settings
			const featureFlags = withFeatureFlagDefaults(settings.featureFlags);
			const bboxOrder = getBboxOrder(settings.coordinateFormat);
			const includeOcrText = settings.includeOcrText ?? true;
			const maxConcurrency = settings.enableParallelRequests ? (settings.maxConcurrency || 3) : 1;

			// Create ProcessableItem array for parallel conversion
			items = images.map((img, index) => ({
				originalIndex: index,
				image: img,
				pages: []
			}));

			const imageMaxDimension = settings.imageMaxDimension ?? null;
			const imageQuality = settings.imageQuality ?? 85;
			console.log(`[Batch] Converting ${items.length} items (maxConcurrency=${maxConcurrency}, imageMaxDimension=${imageMaxDimension ?? 'original'}, imageQuality=${imageQuality})`);

			// 1. CONVERT ALL IMAGES/PDFs (can parallelize conversion)
			await this.executeWithConcurrencyLimit(
				items,
				async (item) => this.convertSingleItem(item, pdfOptions, imageMaxDimension, imageQuality),
				maxConcurrency
			);

			// 2. COLLECT ALL PAGES INTO SINGLE ARRAY (in original order)
			for (const item of items.sort((a, b) => a.originalIndex - b.originalIndex)) {
				allPages.push(...item.pages);
			}

			console.log(`[Batch] Converted to ${allPages.length} total pages`);

			// 3. PROCESS WITH LLM (single call or per-page depending on settings)
			let parsedData: any[];
			let extractedRows: any[][];
			let totalTokensUsed = 0;
			let totalInputTokens = 0;
			let totalOutputTokens = 0;
			const requestDetails: RequestDetailData[] = [];

			// Check if per-page extraction is enabled and we have multiple pages
			if (featureFlags.perPageExtraction && allPages.length > 1) {
				// Per-page extraction mode: process each page separately with context
				console.log(`[Per-Page Mode] Processing ${allPages.length} pages sequentially`);

				let allExtractions: any[] = [];
				let currentRowIndexOffset = 0;

				for (let pageIdx = 0; pageIdx < allPages.length; pageIdx++) {
					const pageImage = allPages[pageIdx];
					const currentPage = pageIdx + 1;
					const totalPages = allPages.length;

					console.log(`[Per-Page Mode] Processing page ${currentPage}/${totalPages}`);

					// Format previous extractions as TOON for context
					const previousExtractions = allExtractions.length > 0
						? formatExtractionsAsToon(allExtractions, featureFlags, bboxOrder)
						: undefined;

					// Build context-aware prompt for this page
					const pagePrompt = buildPerPagePrompt({
						columns: settings.columns,
						featureFlags,
						bboxOrder,
						currentPage,
						totalPages,
						previousExtractions
					});

					// Build content for single page
					const pageContent: any[] = [
						{ type: 'text', text: pagePrompt },
						{ type: 'image_url', image_url: { url: pageImage.dataUrl } }
					];

					// Add OCR text if available
					if (includeOcrText && pageImage.extractedText?.trim()) {
						pageContent.push({
							type: 'text',
							text: `[OCR reference - this page]: ${pageImage.extractedText}`
						});
					}

					// Call LLM for this page
					const llmStartTime = Date.now();
					const pageResult = await this.callLlmApi(pageContent, effectiveSettings, projectId);
					const llmEndTime = Date.now();

					// Clear pageContent to release base64 string reference
					pageContent.length = 0;

					// Clear the page's dataUrl from allPages to free memory as we go
					(pageImage as any).dataUrl = null;

					const inputTokens = pageResult.usage?.prompt_tokens || 0;
					const outputTokens = pageResult.usage?.completion_tokens || 0;
					totalInputTokens += inputTokens;
					totalOutputTokens += outputTokens;
					totalTokensUsed += inputTokens + outputTokens;

					requestDetails.push({
						requestIndex: pageIdx,
						imageStart: pageIdx,
						imageEnd: pageIdx,
						inputTokens,
						outputTokens,
						durationMs: llmEndTime - llmStartTime
					});

					// Parse response
					const pageRawContent = pageResult.choices[0].message.content;
					const pageExtractions = this.parseAndTransformLLMResponse(
						pageRawContent,
						settings.columns,
						featureFlags,
						settings.coordinateFormat
					);

					console.log(`[Per-Page Mode] Page ${currentPage} returned ${pageExtractions.length} extractions`);

					// Adjust row_index and image_index for this page's extractions
					let maxPageRowIndex = -1;
					const adjustedExtractions = pageExtractions.map((e: any) => {
						const adjustedRowIndex = (e.row_index ?? 0) + currentRowIndexOffset;
						if (e.row_index !== undefined && e.row_index > maxPageRowIndex) {
							maxPageRowIndex = e.row_index;
						}
						return {
							...e,
							row_index: adjustedRowIndex,
							image_index: pageIdx
						};
					});

					allExtractions.push(...adjustedExtractions);

					// Update offset for next page
					if (maxPageRowIndex >= 0) {
						currentRowIndexOffset += maxPageRowIndex + 1;
					}
				}

				parsedData = allExtractions;
				console.log(`[Per-Page Mode] Total extractions from all pages: ${parsedData.length}`);

				// Parse into rows
				extractedRows = this.parseMultiRowResponse(parsedData, settings.columns, featureFlags);
				console.log(`[Per-Page Mode] Grouped into ${extractedRows.length} rows`);

			} else {
				// Standard all-at-once extraction: ALL pages in ONE LLM call
				const prompt = this.generatePrompt(settings.columns, featureFlags, bboxOrder);
				const contentArray: any[] = [{ type: 'text', text: prompt }];

				allPages.forEach((page, index) => {
					contentArray.push({
						type: 'image_url',
						image_url: { url: page.dataUrl }
					});

					if (includeOcrText && page.extractedText?.trim()) {
						contentArray.push({
							type: 'text',
							text: `[OCR reference - page ${index + 1}]: ${page.extractedText}`
						});
					}
				});

				// Add reminder for multi-page documents
				if (allPages.length > 1) {
					contentArray.push({
						type: 'text',
						text: `REMINDER: You have been given ${allPages.length} pages. Extract ALL matching items from ALL ${allPages.length} pages. Do not stop early.`
					});
				}

				// Single LLM call with all pages
				const llmStartTime = Date.now();
				const result = await this.callLlmApi(contentArray, effectiveSettings, projectId);
				const llmEndTime = Date.now();

				// Clear contentArray to release base64 string references
				contentArray.length = 0;

				// Clear allPages to release base64 strings immediately after LLM call
				for (const page of allPages) {
					(page as any).dataUrl = null;
					(page as any).extractedText = null;
				}

				const inputTokens = result.usage?.prompt_tokens || 0;
				const outputTokens = result.usage?.completion_tokens || 0;
				totalInputTokens = inputTokens;
				totalOutputTokens = outputTokens;
				totalTokensUsed = inputTokens + outputTokens;

				requestDetails.push({
					requestIndex: 0,
					imageStart: 0,
					imageEnd: allPages.length - 1,
					inputTokens,
					outputTokens,
					durationMs: llmEndTime - llmStartTime
				});

				// Parse and transform LLM response
				const rawContent = result.choices[0].message.content;
				parsedData = this.parseAndTransformLLMResponse(
					rawContent,
					settings.columns,
					featureFlags,
					settings.coordinateFormat
				);

				// Group into rows
				extractedRows = this.parseMultiRowResponse(parsedData, settings.columns, featureFlags);
				console.log(`[Batch] Parsed ${extractedRows.length} rows from LLM response`);
			}

			// 4. CREATE EXTRACTION ROWS
			const pbBatch = this.pb.createBatch();
			for (let rowIndex = 0; rowIndex < extractedRows.length; rowIndex++) {
				pbBatch.collection('extraction_rows').create({
					batch: batchId,
					project: projectId,
					row_index: rowIndex + 1,
					row_data: extractedRows[rowIndex],
					status: BatchStatus.REVIEW
				});
			}

			try {
				await pbBatch.send();
				console.log(`Created ${extractedRows.length} extraction_rows using batch API`);
			} catch (err: any) {
				console.error('Failed to create extraction_rows:', err);
				console.error('Error details:', JSON.stringify(err.response, null, 2));
				throw err;
			}

			// Update batch with metadata
			await this.pb.collection('image_batches').update(batchId, {
				status: BatchStatus.REVIEW,
				processed_data: { extractions: parsedData },
				row_count: extractedRows.length,
				processing_completed: new Date().toISOString()
			});

			// Record success metrics
			await this.recordMetrics({
				batchId,
				projectId,
				jobType: 'process_batch',
				startTime,
				endTime: Date.now(),
				status: 'success',
				imageCount: images.length,
				extractionCount: parsedData.length,
				modelUsed: effectiveSettings.modelName,
				tokensUsed: totalTokensUsed || null,
				inputTokens: totalInputTokens || null,
				outputTokens: totalOutputTokens || null,
				requestDetails: requestDetails.length > 0 ? requestDetails : undefined
			});

			// Track endpoint usage for managed endpoints (global and per-user)
			await this.trackEndpointUsage(managedEndpointId, totalInputTokens, totalOutputTokens, projectOwnerId);
		} catch (error: any) {
			// Mark batch as failed
			await this.pb.collection('image_batches').update(batchId, {
				status: BatchStatus.FAILED,
				error_message: error.message
			});

			// Record failure metrics
			await this.recordMetrics({
				batchId,
				projectId,
				jobType: 'process_batch',
				startTime,
				endTime: Date.now(),
				status: 'failed',
				imageCount: images?.length || 0,
				errorMessage: error?.message || 'Unknown error'
			});

			throw error;
		} finally {
			// ALWAYS clean up large data structures to prevent memory leaks
			// This runs on both success AND failure paths
			console.log('[Memory] Cleaning up batch processing data...');

			// Clear page data inside each item first (these hold large base64 strings)
			for (const item of items) {
				if (item.pages) {
					for (const page of item.pages) {
						(page as any).dataUrl = null;
						(page as any).extractedText = null;
					}
					item.pages.length = 0;
				}
				(item as any).image = null;
			}
			items.length = 0;

			// Clear allPages array (may already be cleared in success path but ensure on error)
			for (const page of allPages) {
				(page as any).dataUrl = null;
				(page as any).extractedText = null;
			}
			allPages.length = 0;

			// Clear images array
			images.length = 0;

			// Hint to GC that now is a good time to collect
			if (global.gc) {
				global.gc();
			}

			// Log memory after cleanup
			this.logMemoryUsage();
		}
	}

	private async reprocessBatches(job: QueueJob): Promise<void> {
		const { batchIds, projectId } = job.data as any;

		for (const batchId of batchIds) {
			// Delete all existing extraction_rows for this batch using batch API
			const existingRows = await this.pb.collection('extraction_rows').getFullList({
				filter: this.pb.filter('batch = {:batchId}', { batchId })
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
				status: BatchStatus.PENDING,
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
		// Declare outside try block for cleanup in finally
		let croppedImages: string[] = [];
		let redoContent: any[] = [];
		let managedEndpointId: string | null = null;

		try {
			console.log(`[Redo] Starting redo for batch=${batchId}, project=${projectId}, rowIndex=${rowIndex}`);
			console.log(`[Redo] redoColumnIds:`, redoColumnIds);
			console.log(`[Redo] croppedImageIds:`, croppedImageIds);

			// Load project and batch
			const project = await this.pb.collection('projects').getOne(projectId);
			console.log(`[Redo] Loaded project: ${project.id}`);
			const settings = project.settings;
			const projectOwnerId = project.owner as string | undefined;

			// Resolve endpoint settings (managed vs custom)
			const endpointSettings = await this.resolveEndpointSettings(settings);
			managedEndpointId = endpointSettings.managedEndpointId;

			// Note: Instance-wide limits are checked at enqueue time in /api/queue/enqueue
			// No need to re-check here since job is already approved and in processing state

			// Merge resolved endpoint settings into settings for use in LLM calls
			const effectiveSettings = {
				...settings,
				endpoint: endpointSettings.endpoint,
				apiKey: endpointSettings.apiKey,
				modelName: endpointSettings.modelName
			};

			// Extract feature flags from settings
			const featureFlags = withFeatureFlagDefaults(settings.featureFlags);

			const batch = await this.pb.collection('image_batches').getOne(batchId, {
				expand: 'images'
			});
			console.log(`[Redo] Loaded batch: ${batch.id}`);

			// NEW: Load the specific row to redo
			// Note: batch is a multi-relation field, so use ~ (contains) instead of =
			console.log(`[Redo] Looking for extraction_row: batch="${batchId}", row_index=${rowIndex}`);
			let existingRow;
			try {
				// First, let's see ALL extraction_rows for this batch
				const allRows = await this.pb.collection('extraction_rows').getFullList({
					filter: this.pb.filter('batch ~ {:batchId}', { batchId })
				});
				console.log(`[Redo] Found ${allRows.length} extraction_rows for batch ${batchId}:`);
				allRows.forEach((r: any) => console.log(`[Redo]   - id=${r.id}, row_index=${r.row_index}, status=${r.status}`));

				existingRow = await this.pb.collection('extraction_rows').getFirstListItem(
					this.pb.filter('batch ~ {:batchId} && row_index = {:rowIndex}', { batchId, rowIndex })
				);
				console.log(`[Redo] Found extraction_row: ${existingRow.id}`);
			} catch (queryErr: any) {
				console.error(`[Redo] Query failed:`, queryErr.message);
				console.error(`[Redo] Query filter was: batch ~ "${batchId}" && row_index = ${rowIndex}`);
				throw queryErr;
			}

			// Separate correct and redo extractions for THIS ROW only
			const allExtractions = existingRow.row_data as any[];
			const correctExtractions = allExtractions.filter(
				(e: any) => !redoColumnIds.includes(e.column_id)
			);
			const redoColumns = settings.columns.filter((c: any) => redoColumnIds.includes(c.id));

			console.log(`Processing redo for batch ${batchId}, row ${rowIndex}, columns:`, redoColumnIds);
			console.log(`[Redo] croppedImageIds mapping:`, JSON.stringify(croppedImageIds));

			// Create a mapping from LLM image_index (0, 1, 2...) to the actual cropped image ID
			const imageIndexToCroppedId: string[] = [];
			for (const columnId of redoColumnIds) {
				const imageId = croppedImageIds[columnId];
				console.log(`[Redo] Processing column ${columnId}, imageId: ${imageId}`);
				if (!imageId) {
					throw new Error(`No cropped image found for column ${columnId}`);
				}

				let img;
				try {
					img = await this.pb.collection('images').getOne(imageId);
					console.log(`[Redo] Found image record: ${img.id}, file: ${img.image}`);
				} catch (fetchError: any) {
					console.error(`[Redo] Failed to fetch image ${imageId}:`, fetchError.message);
					console.error(`[Redo] Full error:`, JSON.stringify(fetchError, null, 2));
					throw fetchError;
				}

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

			// Build content array for redo request
			redoContent = [
				{ type: 'text', text: prompt },
				...croppedImages.map((url) => ({
					type: 'image_url',
					image_url: { url }
				}))
			];

			// Call LLM API using unified method
			const result = await this.callLlmApi(redoContent, effectiveSettings, projectId);

			// Clear content array and cropped images to release base64 strings
			redoContent.length = 0;
			croppedImages.length = 0;

			// Parse and transform LLM response using unified method
			const rawContent = result.choices[0].message.content;
			let redoExtractions = this.parseAndTransformLLMResponse(rawContent, redoColumns, featureFlags, settings.coordinateFormat);

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

			// Update only the specific row
			await this.pb.collection('extraction_rows').update(existingRow.id, {
				row_data: mergedExtractions,
				status: BatchStatus.REVIEW
			});

			// Also update batch (backward compatibility)
			await this.pb.collection('image_batches').update(batchId, {
				status: BatchStatus.REVIEW,
				redo_processed_at: new Date().toISOString()
			});

			console.log(`Updated extraction_row ${existingRow.id} with ${mergedExtractions.length} total extractions`);

			// Record success metrics
			const inputTokens = result.usage?.prompt_tokens || 0;
			const outputTokens = result.usage?.completion_tokens || 0;
			await this.recordMetrics({
				batchId,
				projectId,
				jobType: 'process_redo',
				startTime,
				endTime: Date.now(),
				status: 'success',
				imageCount: redoColumnIds.length,
				extractionCount: redoExtractions.length,
				modelUsed: effectiveSettings.modelName,
				tokensUsed: inputTokens + outputTokens || null,
				inputTokens: inputTokens || null,
				outputTokens: outputTokens || null,
				requestDetails: [{
					requestIndex: 0,
					imageStart: 0,
					imageEnd: redoColumnIds.length - 1,
					inputTokens,
					outputTokens,
					durationMs: Date.now() - startTime
				}]
			});

			// Track endpoint usage for managed endpoints (global and per-user)
			await this.trackEndpointUsage(managedEndpointId, inputTokens, outputTokens, projectOwnerId);
		} catch (error: any) {
			// Record failure metrics
			await this.recordMetrics({
				batchId,
				projectId,
				jobType: 'process_redo',
				startTime,
				endTime: Date.now(),
				status: 'failed',
				imageCount: 0,
				errorMessage: error?.message || 'Unknown error'
			});

			throw error;
		} finally {
			// ALWAYS clean up large data structures to prevent memory leaks
			// This runs on both success AND failure paths
			croppedImages.length = 0;
			redoContent.length = 0;

			// Hint to GC
			if (global.gc) {
				global.gc();
			}
		}
	}

	private async blobToBase64DataUrl(blob: Blob): Promise<string> {
		const arrayBuffer = await blob.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const base64 = buffer.toString('base64');
		const mimeType = blob.type || 'image/jpeg';
		return `data:${mimeType};base64,${base64}`;
	}

	private generatePrompt(
		columns: any[],
		featureFlags: ExtractionFeatureFlags,
		bboxOrder: string = '[x1, y1, x2, y2]'
	): string {
		return buildModularPrompt({
			columns,
			featureFlags,
			bboxOrder
		});
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

	private transformGeminiFormat(data: any, columns: any[], featureFlags: ExtractionFeatureFlags): any[] {
		const extractions: any[] = [];

		console.log('--- transformGeminiFormat Debug ---');
		console.log('Input data keys:', Object.keys(data));
		console.log('Input columns:', columns.map(c => ({ id: c.id, name: c.name })));

		for (const [key, value] of Object.entries(data)) {
			const column = findColumnByKeyOrName(columns, key);

			if (column) {
				console.log(`Matched key "${key}" to column "${column.name}" (${column.id})`);
				// Gemini simple format doesn't include bbox/confidence, so we pass null
				const extraction = createExtractionResult({
					column_id: column.id,
					column_name: column.name,
					value: value as string | null,
					image_index: 0,
					bbox_2d: null,
					confidence: null
				}, featureFlags);

				extractions.push(extraction);
			} else {
				console.log(`No matching column found for key: "${key}"`);
			}
		}

		console.log(`Created ${extractions.length} extractions`);
		console.log('--- End transformGeminiFormat Debug ---');

		return extractions;
	}

	private transformMixedFormat(data: any, columns: any[], featureFlags: ExtractionFeatureFlags): any[] {
		const extractions: any[] = [];

		console.log('--- transformMixedFormat Debug ---');
		console.log('Input data keys:', Object.keys(data));
		console.log('Input columns:', columns.map(c => ({ id: c.id, name: c.name })));

		// Check if this is Gemini's field_name/value format
		if ('field_name' in data && 'value' in data) {
			console.log('Detected Gemini field_name/value format');
			const fieldName = data.field_name;
			const fieldValue = data.value;

			const column = findColumnByKeyOrName(columns, fieldName);

			if (column) {
				console.log(`Matched field_name "${fieldName}" to column "${column.name}" (${column.id})`);
				const extraction = createExtractionResult({
					column_id: column.id,
					column_name: column.name,
					value: fieldValue,
					image_index: data.image_index ?? 0,
					bbox_2d: data.bbox_2d ?? null,
					confidence: data.confidence ?? null,
					row_index: data.row_index
				}, featureFlags);

				extractions.push(extraction);
			} else {
				console.log(`No matching column found for field_name: "${fieldName}"`);
			}

			console.log(`Created ${extractions.length} extractions`);
			console.log('--- End transformMixedFormat Debug ---');
			return extractions;
		}

		// Original logic for direct key-value format (Qwen style)
		// Extract metadata fields if present
		const metadataFields = new Set(['bbox_2d', 'confidence', 'image_index', 'row_index']);
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

			const column = findColumnByKeyOrName(columns, key);

			if (column) {
				console.log(`Matched key "${key}" to column "${column.name}" (${column.id})`);
				const extraction = createExtractionResult({
					column_id: column.id,
					column_name: column.name,
					value: value as string | null,
					image_index: metadata.image_index ?? 0,
					bbox_2d: metadata.bbox_2d ?? null,
					confidence: metadata.confidence ?? null,
					row_index: metadata.row_index
				}, featureFlags);

				extractions.push(extraction);
			} else {
				console.log(`No matching column found for key: "${key}"`);
			}
		}

		console.log(`Created ${extractions.length} extractions`);
		console.log('--- End transformMixedFormat Debug ---');

		return extractions;
	}

	private parseMultiRowResponse(llmResponse: any, columns: any[], featureFlags: ExtractionFeatureFlags): any[][] {
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
				return [this.transformMixedFormat(rows, columns, featureFlags)];
			}

			// Process each row
			const processedRows = rows.map((row: any) => {
				if (Array.isArray(row)) return row;
				if (row.fields) return row.fields;
				return this.transformMixedFormat(row, columns, featureFlags);
			});

			console.log(`Processed ${processedRows.length} rows`);
			console.log('=== End parseMultiRowResponse Debug ===');
			return processedRows;
		}

		// Unknown format - treat as single row
		console.log('Detected format: Unknown (treating as single row)');
		console.log('=== End parseMultiRowResponse Debug ===');
		return [this.transformMixedFormat(llmResponse, columns, featureFlags)];
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Unified LLM API call method
	 * Handles timeout and error handling using native Node.js http/https modules
	 * This avoids undici dependency issues while supporting configurable timeouts
	 */
	private async callLlmApi(
		content: Array<{ type: string; [key: string]: any }>,
		settings: { endpoint: string; apiKey: string; modelName: string; requestTimeout?: number; enableParallelRequests?: boolean; maxConcurrency?: number; requestsPerMinute?: number; enableDeterministicMode?: boolean; temperature?: number; topK?: number; topP?: number; repetitionPenalty?: number; frequencyPenalty?: number; presencePenalty?: number },
		projectId: string
	): Promise<any> {
		// 0 means unlimited (24 hours max), undefined defaults to 10 minutes
		const requestTimeoutMinutes = settings.requestTimeout ?? 10;
		const timeoutMs = requestTimeoutMinutes === 0
			? 24 * 60 * 60 * 1000  // 24 hours (effectively unlimited)
			: requestTimeoutMinutes * 60 * 1000;

		// Get the project-specific connection pool
		const pool = this.getProjectPool(projectId, settings);

		return pool.execute(async () => {
			return new Promise((resolve, reject) => {
				const url = new URL(settings.endpoint);
				const isHttps = url.protocol === 'https:';
				const client = isHttps ? https : http;

				const body = JSON.stringify({
					model: settings.modelName,
					messages: [{ role: 'user', content }],
					...(settings.enableDeterministicMode && {
						temperature: settings.temperature ?? 0.0,
						top_k: settings.topK ?? 1,
						top_p: settings.topP ?? 1.0,
						repetition_penalty: settings.repetitionPenalty ?? 1.0,
						frequency_penalty: settings.frequencyPenalty ?? 0.0,
						presence_penalty: settings.presencePenalty ?? 0.0
					})
				});

				const options: https.RequestOptions = {
					hostname: url.hostname,
					port: url.port || (isHttps ? 443 : 80),
					path: url.pathname + url.search,
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${settings.apiKey}`,
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(body)
					}
				};

				const req = client.request(options, (res) => {
					let data = '';
					res.on('data', (chunk) => { data += chunk; });
					res.on('end', () => {
						if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
							try {
								resolve(JSON.parse(data));
							} catch (e) {
								reject(new Error(`Failed to parse API response as JSON: ${data.substring(0, 500)}`));
							}
						} else {
							reject(new Error(`API request failed: ${res.statusCode} ${res.statusMessage} - ${data}`));
						}
					});
				});

				req.setTimeout(timeoutMs, () => {
					req.destroy();
					reject(new Error(`Request timeout after ${timeoutMs}ms (${requestTimeoutMinutes} minutes)`));
				});

				req.on('error', (err) => {
					reject(new Error(`API request error: ${err.message}`));
				});

				req.write(body);
				req.end();
			});
		});
	}

	/**
	 * Unified metrics recording method
	 * Handles both success and failure cases
	 */
	private async recordMetrics(data: {
		batchId: string;
		projectId: string;
		jobType: 'process_batch' | 'process_redo';
		startTime: number;
		endTime: number;
		status: 'success' | 'failed';
		imageCount: number;
		extractionCount?: number;
		modelUsed?: string;
		tokensUsed?: number | null;
		inputTokens?: number | null;
		outputTokens?: number | null;
		requestDetails?: RequestDetailData[];
		errorMessage?: string;
	}): Promise<void> {
		try {
			await this.pb.collection('processing_metrics').create({
				batchId: String(data.batchId),
				projectId: String(data.projectId),
				jobType: data.jobType,
				startTime: new Date(data.startTime).toISOString(),
				endTime: new Date(data.endTime).toISOString(),
				durationMs: Number(data.endTime - data.startTime),
				status: data.status,
				imageCount: data.imageCount,
				...(data.extractionCount !== undefined && { extractionCount: data.extractionCount }),
				...(data.modelUsed && { modelUsed: String(data.modelUsed) }),
				...(data.tokensUsed !== undefined && { tokensUsed: data.tokensUsed }),
				...(data.inputTokens !== undefined && { inputTokens: data.inputTokens }),
				...(data.outputTokens !== undefined && { outputTokens: data.outputTokens }),
				...(data.requestDetails && data.requestDetails.length > 0 && { requestDetails: data.requestDetails }),
				...(data.errorMessage && { errorMessage: String(data.errorMessage) })
			});
		} catch (err: any) {
			console.error('Failed to create metrics:', err);
			console.error('Metrics error details:', JSON.stringify(err.response || err, null, 2));
		}
	}

	/**
	 * Resolve endpoint settings - either from managed endpoint or custom settings
	 * Returns the endpoint ID if managed (for usage tracking), or null if custom
	 */
	private async resolveEndpointSettings(settings: any): Promise<{
		endpoint: string;
		apiKey: string;
		modelName: string;
		managedEndpointId: string | null;
	}> {
		// Check if using managed endpoint
		if (settings.endpoint_mode === 'managed' && settings.managed_endpoint_id) {
			const endpoint = await getEndpointWithLimits(settings.managed_endpoint_id);
			if (!endpoint) {
				throw new Error(`Managed endpoint ${settings.managed_endpoint_id} not found`);
			}
			if (!endpoint.is_enabled) {
				throw new Error(`Managed endpoint ${endpoint.alias} is disabled`);
			}
			return {
				endpoint: endpoint.endpoint_url,
				apiKey: endpoint.api_key,
				modelName: endpoint.model_name,
				managedEndpointId: endpoint.id
			};
		}

		// Custom endpoint - validate URL for SSRF protection
		// Only user-provided endpoints need validation; managed endpoints are admin-configured
		const urlValidation = await validateExternalUrl(settings.endpoint);
		if (!urlValidation.allowed) {
			throw new Error(`Invalid custom endpoint URL: ${urlValidation.reason}`);
		}

		return {
			endpoint: settings.endpoint,
			apiKey: settings.apiKey,
			modelName: settings.modelName,
			managedEndpointId: null
		};
	}

	/**
	 * Check if processing is allowed based on instance and endpoint limits
	 */
	private async checkProcessingLimits(managedEndpointId: string | null): Promise<{
		allowed: boolean;
		reason?: string;
	}> {
		// Note: Instance-wide project limits are now enforced in processLoop() before jobs are picked up
		// This function is kept for endpoint-specific token limits only

		// Check endpoint-specific limits if using managed endpoint
		if (managedEndpointId) {
			const endpointCheck = await checkEndpointLimits(managedEndpointId);
			if (!endpointCheck.allowed) {
				return endpointCheck;
			}
		}

		return { allowed: true };
	}

	/**
	 * Track token usage for managed endpoints (both global and per-user)
	 */
	private async trackEndpointUsage(
		managedEndpointId: string | null,
		inputTokens: number,
		outputTokens: number,
		userId?: string
	): Promise<void> {
		if (managedEndpointId && (inputTokens > 0 || outputTokens > 0)) {
			// Track global endpoint usage
			await updateEndpointUsage(managedEndpointId, inputTokens, outputTokens);

			// Track per-user endpoint usage if userId is provided
			if (userId) {
				await updateUserEndpointUsage(userId, managedEndpointId, inputTokens, outputTokens);
			}
		}
	}

	getStats() {
		// Return aggregated stats from all project pools
		const projectStats: Record<string, any> = {};
		let totalActiveJobs = 0;
		let totalActiveRequests = 0;
		let totalQueuedRequests = 0;

		for (const [projectId, pool] of this.projectPools) {
			const poolStats = pool.getStats();
			const activeJobs = this.projectActiveJobs.get(projectId) || 0;
			const maxConcurrency = this.projectMaxConcurrency.get(projectId) || 1;
			totalActiveJobs += activeJobs;
			totalActiveRequests += poolStats.activeRequests;
			totalQueuedRequests += poolStats.queuedRequests;

			projectStats[projectId] = {
				...poolStats,
				activeJobs,
				maxConcurrency
			};
		}

		return {
			totalActiveJobs,
			poolCount: this.projectPools.size,
			totalActiveRequests,
			totalQueuedRequests,
			projectPools: projectStats
		};
	}

	/**
	 * Coordinate field names for different bbox orders
	 */
	private static readonly COORD_FIELDS_XYXY = ['x1', 'y1', 'x2', 'y2'];
	private static readonly COORD_FIELDS_YXYX = ['y_min', 'x_min', 'y_max', 'x_max'];

	/**
	 * Reconstruct bbox_2d array from flattened coordinate fields
	 * For TOON format, coordinates are output as separate fields to keep tabular format compact
	 */
	private reconstructBboxFromFlatCoords(
		extractions: any[],
		coordinateFormat: string
	): any[] {
		// Determine which coordinate fields to look for based on format
		const isYXYX = coordinateFormat.includes('yxyx');
		const coordFields = isYXYX ? QueueWorker.COORD_FIELDS_YXYX : QueueWorker.COORD_FIELDS_XYXY;

		return extractions.map(extraction => {
			// Check if this extraction has flattened coordinate fields
			const hasCoordFields = coordFields.some(field => field in extraction);

			if (hasCoordFields) {
				// Extract coordinate values in order
				const coords = coordFields.map(field => {
					const value = extraction[field];
					return typeof value === 'number' ? value : (parseInt(value, 10) || 0);
				});

				// Create new extraction with bbox_2d array and remove individual coord fields
				const newExtraction = { ...extraction, bbox_2d: coords };
				coordFields.forEach(field => delete newExtraction[field]);

				return newExtraction;
			}

			return extraction;
		});
	}

	/**
	 * Unified LLM response parsing and transformation
	 * Handles TOON/JSON parsing, format detection, and normalization
	 */
	private parseAndTransformLLMResponse(
		rawContent: string,
		columns: any[],
		featureFlags: ExtractionFeatureFlags,
		coordinateFormat: string = 'normalized_1000'
	): any[] {
		// 1. Clean response (remove markdown fences)
		let content = rawContent
			.replace(/```json\n?/g, '')
			.replace(/```toon\n?/g, '')
			.replace(/```\n?/g, '')
			.trim();

		console.log('=== LLM Response Parsing ===');
		console.log('TOON output enabled:', featureFlags.toonOutput);

		// 2. Parse (TOON with JSON fallback)
		let parsedData: any;
		if (featureFlags.toonOutput) {
			// Check if content looks like TOON format (has array declaration syntax)
			// Matches both: extractions[N]{fields}: (tabular) and extractions[N]: (YAML-like)
			if (content.match(/^\w+\[\d+\](\{[^}]+\})?:/m)) {
				console.log('TOON format detected, using official decoder with count fix...');

				// Convert tabs to commas for TOON decoder (we use tabs in prompts to avoid German number format issues)
				const tabsConverted = this.convertToonTabsToCommas(content);

				// Fix array counts before parsing (LLMs often miscount)
				const fixedContent = this.fixToonArrayCounts(tabsConverted);
				// Use official decoder with strict: false for flexibility
				const decoded = decodeToon(fixedContent, { strict: false });
				// Extract the extractions array from the decoded object
				parsedData = (decoded as any)?.extractions ?? decoded;

				// Post-process TOON-decoded values
				if (Array.isArray(parsedData)) {
					parsedData = parsedData.map(item => {
						const processed = { ...item };
						// Unescape JSON string values (they were escaped for TOON parsing)
						if (typeof processed.value === 'string' && processed.value.startsWith('{')) {
							processed.value = processed.value.replace(/\\"/g, '"');
						}
						// Parse bbox_2d from string to array (TOON outputs it as "[120,45,380,195]")
						if (typeof processed.bbox_2d === 'string') {
							try {
								processed.bbox_2d = JSON.parse(processed.bbox_2d);
							} catch {
								// Fallback: try parsing as comma-separated numbers without brackets
								const nums = processed.bbox_2d.replace(/[\[\]]/g, '').split(',').map((s: string) => parseInt(s.trim(), 10) || 0);
								if (nums.length === 4) {
									processed.bbox_2d = nums;
								}
							}
						}
						return processed;
					});
				}
			} else {
				// Content doesn't look like TOON, try JSON
				console.log('Content does not appear to be TOON format, attempting JSON parse...');
				parsedData = JSON.parse(content);
			}
		} else {
			parsedData = JSON.parse(content);
		}

		console.log('Parsed data type:', Array.isArray(parsedData) ? 'array' : typeof parsedData);
		console.log('Parsed data keys:', typeof parsedData === 'object' && parsedData ? Object.keys(parsedData) : 'N/A');

		// 3. Unwrap if wrapped in "extractions" property
		if (parsedData && typeof parsedData === 'object' && 'extractions' in parsedData) {
			console.log('Detected wrapped format with "extractions" key');
			parsedData = parsedData.extractions;
		}

		// 4. Normalize format
		if (this.isGeminiSimpleFormat(parsedData)) {
			console.log('Detected format: Gemini simple format');
			parsedData = this.transformGeminiFormat(parsedData, columns, featureFlags);
		} else if (!Array.isArray(parsedData) && typeof parsedData === 'object') {
			console.log('Detected format: Mixed format');
			parsedData = this.transformMixedFormat(parsedData, columns, featureFlags);
		} else if (Array.isArray(parsedData)) {
			console.log('Detected format: Array of extractions');
			// Check if array items need transformation
			if (parsedData.length > 0 && parsedData[0] && !parsedData[0].column_id) {
				console.log('Array items need transformation (no column_id found)');
				const transformed = [];
				for (const item of parsedData) {
					const result = this.transformMixedFormat(item, columns, featureFlags);
					transformed.push(...result);
				}
				parsedData = transformed;
			}
		}

		// Normalize all extractions to ensure column_id is always a string
		// This handles TOON/JSON parsing differences where column_id might be number or string
		if (Array.isArray(parsedData)) {
			parsedData = parsedData.map(extraction => ({
				...extraction,
				column_id: String(extraction.column_id)
			}));
		}

		// 5. Reconstruct bbox_2d from flattened coordinate fields (fallback for legacy TOON flat format)
		// Only needed if bbox_2d is missing but individual coord fields (x1,y1,x2,y2) exist
		if (featureFlags.toonOutput && featureFlags.boundingBoxes && Array.isArray(parsedData)) {
			const needsReconstruction = parsedData.some(e => !e.bbox_2d && ('x1' in e || 'y_min' in e));
			if (needsReconstruction) {
				console.log('Reconstructing bbox_2d from flattened coordinates (legacy fallback)...');
				parsedData = this.reconstructBboxFromFlatCoords(parsedData, coordinateFormat);
			}
		}

		console.log('Final extractions count:', Array.isArray(parsedData) ? parsedData.length : 'not an array');
		console.log('=== End LLM Response Parsing ===');

		return parsedData;
	}

	/**
	 * Convert tabs to commas in TOON tabular data rows
	 * We use tabs in prompts to avoid issues with German number format (e.g., 97.502,48)
	 * The TOON decoder only supports comma delimiter, so we convert tabs to commas here
	 * Values containing commas are quoted to preserve them
	 */
	private convertToonTabsToCommas(content: string): string {
		const lines = content.split('\n');
		const convertedLines = lines.map(line => {
			// Only convert tabs in data rows (indented lines), not in headers
			if (line.match(/^\s{2,}/) && line.includes('\t')) {
				// Get the indentation
				const indentMatch = line.match(/^(\s+)/);
				const indent = indentMatch ? indentMatch[1] : '';
				const rest = line.substring(indent.length);

				// Split by tabs and quote values containing special characters
				const values = rest.split('\t').map(val => {
					// Already properly quoted - keep as is
					if (val.startsWith('"') && val.endsWith('"')) {
						return val;
					}
					// Needs quoting (contains comma, quote, or looks like JSON)
					if (val.includes(',') || val.includes('"') || val.startsWith('{')) {
						// Escape internal quotes and wrap in quotes
						const escaped = val.replace(/"/g, '\\"');
						return `"${escaped}"`;
					}
					return val;
				});

				const converted = indent + values.join(',');
				console.log('Converting tabs to commas:', rest.substring(0, 40) + '... -> ' + converted.substring(indent.length, indent.length + 50) + '...');
				return converted;
			}
			return line;
		});
		return convertedLines.join('\n');
	}

	/**
	 * Fix TOON array count declarations before parsing
	 * LLMs often miscount (e.g., declaring 3 for 3 rows when there are 18 total items)
	 * This counts actual items and fixes the header before passing to official decoder
	 */
	private fixToonArrayCounts(content: string): string {
		console.log('=== Fixing TOON Array Counts ===');

		// Find all array declarations: arrayName[count]: or arrayName[count]{fields}:
		// and fix their counts based on actual content
		const lines = content.split('\n');
		const fixedLines: string[] = [];

		let i = 0;
		while (i < lines.length) {
			const line = lines[i];

			// Check for array header (with or without field list)
			// Format 1: extractions[N]{field1,field2}:  (tabular CSV)
			// Format 2: extractions[N]:  (YAML-like list)
			const tabularMatch = line.match(/^(\s*)(\w+)\[(\d+)\](\{[^}]+\})?:\s*$/);

			if (tabularMatch) {
				const [, indent, arrayName, declaredCount, fieldList] = tabularMatch;
				const isTabular = !!fieldList;

				// Count actual items
				let actualCount = 0;
				let j = i + 1;

				if (isTabular) {
					// Tabular format: count non-empty indented lines (each line is one item)
					while (j < lines.length) {
						const dataLine = lines[j];
						// Data lines are indented more than the header
						if (dataLine.match(/^\s{2,}/) && dataLine.trim() !== '') {
							// Stop if we hit another array header or same-level key
							if (dataLine.match(/^\s*\w+(\[|\:)/)) break;
							actualCount++;
						} else if (dataLine.trim() !== '' && !dataLine.startsWith(' ')) {
							break; // Hit a non-indented line
						}
						j++;
					}
				} else {
					// YAML-like list format: count lines starting with "  - "
					while (j < lines.length) {
						const dataLine = lines[j];
						if (dataLine.match(/^\s{2}-\s/)) {
							actualCount++;
						} else if (dataLine.trim() !== '' && !dataLine.startsWith(' ')) {
							break; // Hit a non-indented line (new top-level key)
						}
						j++;
					}
				}

				// Fix the count if different
				if (actualCount > 0 && actualCount !== parseInt(declaredCount)) {
					console.log(`Fixing ${arrayName}: declared ${declaredCount}, actual ${actualCount}`);
					const fixedHeader = `${indent}${arrayName}[${actualCount}]${fieldList || ''}:`;
					fixedLines.push(fixedHeader);
				} else {
					fixedLines.push(line);
				}
			} else {
				fixedLines.push(line);
			}
			i++;
		}

		const result = fixedLines.join('\n');
		console.log('=== End Fixing TOON Array Counts ===');
		return result;
	}

	/**
	 * Convert a single image or PDF to base64 data URLs
	 * Populates item.pages with converted images
	 *
	 * Memory management: All intermediate buffers are explicitly nulled to help GC
	 */
	private async convertSingleItem(
		item: ProcessableItem,
		pdfOptions: PdfConversionOptions,
		imageMaxDimension: number | null = null,
		imageQuality: number = 85
	): Promise<void> {
		const url = this.pb.files.getURL(item.image, item.image.image);
		let response: Response | null = await fetch(url);
		let blob: Blob | null = await response.blob();
		response = null; // Release response early

		if (isPdfFile(item.image.image)) {
			console.log(`[Pipeline] Converting PDF: ${item.image.image}`);
			let arrayBuffer: ArrayBuffer | null = await blob.arrayBuffer();
			blob = null; // Release blob early
			let buffer: Buffer | null = Buffer.from(arrayBuffer);
			arrayBuffer = null; // Release arrayBuffer

			const convertedPages = await convertPdfToImages(buffer, item.image.image, pdfOptions);
			buffer = null; // Release buffer after PDF conversion
			const pageCount = convertedPages.length;

			for (const page of convertedPages) {
				const pageDataUrl = `data:${page.mimeType};base64,${page.buffer.toString('base64')}`;
				item.pages.push({
					dataUrl: pageDataUrl,
					extractedText: page.extractedText || null
				});
				// Clear the buffer reference to allow GC
				(page as any).buffer = null;
				(page as any).extractedText = null;
			}
			// Clear the array to release all references
			convertedPages.length = 0;
			console.log(`[Pipeline] PDF ${item.image.image} converted to ${pageCount} pages`);
		} else {
			// Convert blob to buffer for processing
			const mimeType = blob.type || 'image/jpeg';
			let arrayBuffer: ArrayBuffer | null = await blob.arrayBuffer();
			blob = null; // Release blob early
			let imageBuffer: Buffer | null = Buffer.from(arrayBuffer);
			arrayBuffer = null; // Release arrayBuffer

			// Scale/normalize image (handles EXIF rotation + optional max dimension scaling)
			const scaled = await scaleImageToMaxDimension(imageBuffer, imageMaxDimension, imageQuality);
			imageBuffer = null; // Release original
			imageBuffer = scaled.buffer;
			const finalMimeType = scaled.mimeType;

			const dataUrl = `data:${finalMimeType};base64,${imageBuffer.toString('base64')}`;
			imageBuffer = null; // Release buffer after base64 encoding
			item.pages.push({
				dataUrl,
				extractedText: item.image.extracted_text || null
			});
		}
	}

	/**
	 * Execute async operations with a concurrency limit (semaphore pattern)
	 */
	private async executeWithConcurrencyLimit<T>(
		items: T[],
		processor: (item: T) => Promise<void>,
		maxConcurrency: number
	): Promise<void> {
		let active = 0;
		let index = 0;

		return new Promise((resolve, reject) => {
			const errors: Error[] = [];

			const next = () => {
				while (active < maxConcurrency && index < items.length) {
					active++;
					const currentItem = items[index++];
					processor(currentItem)
						.catch((err) => errors.push(err))
						.finally(() => {
							active--;
							if (index >= items.length && active === 0) {
								resolve();
							} else {
								next();
							}
						});
				}
			};

			if (items.length === 0) {
				resolve();
			} else {
				next();
			}
		});
	}
}
