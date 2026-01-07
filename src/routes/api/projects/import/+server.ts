/**
 * Import a project from a .tabtin file (ZIP archive)
 * Requires ALLOW_IMPORT_EXPORT=true env var
 */

import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAdminPb } from '$lib/server/admin-auth';
import { requireAuth } from '$lib/server/authorization';
import type { RequestHandler } from './$types';
import unzipper from 'unzipper';
import { Readable } from 'stream';

interface ImportManifest {
	version: string;
	format: string;
	exportedAt: string;
	projectId: string;
	projectName: string;
}

interface ImportedProject {
	id: string;
	name: string;
	settings: unknown;
	schema_chat_history?: unknown;
	document_analyses?: unknown;
}

interface ImportedBatch {
	id: string;
	project: string[];
	status: string;
	processed_data?: unknown;
	row_count?: number;
	error_message?: string;
}

interface ImportedImage {
	id: string;
	batch: string[];
	image: string;
	order: number;
	extracted_text?: string;
	column_id?: string;
	is_cropped?: boolean;
	parent_image?: string[];
	bbox_used?: unknown;
}

interface ImportedRow {
	id: string;
	batch: string[];
	project: string[];
	row_data: unknown;
	row_index: number;
	status: string;
	approved_at?: string;
	deleted_at?: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check feature flag
	if (env.ALLOW_IMPORT_EXPORT !== 'true') {
		throw error(403, 'Import/Export feature is disabled');
	}

	// Require auth
	requireAuth(locals);
	const userId = locals.user!.id;

	const pb = await getAdminPb();

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File | null;

		if (!file) {
			throw error(400, 'No file provided');
		}

		// Basic validation
		if (!file.name.endsWith('.tabtin') && !file.name.endsWith('.zip')) {
			throw error(400, 'Invalid file type. Expected .tabtin file');
		}

		// Size limit: 500MB
		if (file.size > 500 * 1024 * 1024) {
			throw error(413, 'File too large. Max 500MB');
		}

		// Parse ZIP
		const buffer = Buffer.from(await file.arrayBuffer());
		const directory = await unzipper.Open.buffer(buffer);

		// Extract files
		const files: Record<string, Buffer> = {};
		const imageFiles: Record<string, Buffer> = {};

		for (const entry of directory.files) {
			// Basic path traversal protection
			if (entry.path.includes('..')) {
				throw error(400, 'Invalid file path in archive');
			}

			if (entry.type === 'File') {
				const content = await entry.buffer();

				if (entry.path.startsWith('images/')) {
					imageFiles[entry.path] = content;
				} else {
					files[entry.path] = content;
				}
			}
		}

		// Validate required files
		const requiredFiles = ['manifest.json', 'project.json', 'batches.json', 'images.json', 'extraction_rows.json'];
		for (const required of requiredFiles) {
			if (!files[required]) {
				throw error(400, `Missing required file: ${required}`);
			}
		}

		// Parse JSON files
		const manifest: ImportManifest = JSON.parse(files['manifest.json'].toString());
		const projectData: ImportedProject = JSON.parse(files['project.json'].toString());
		const batchesData: ImportedBatch[] = JSON.parse(files['batches.json'].toString());
		const imagesData: ImportedImage[] = JSON.parse(files['images.json'].toString());
		const rowsData: ImportedRow[] = JSON.parse(files['extraction_rows.json'].toString());

		// Validate manifest
		if (manifest.format !== 'tabtin') {
			throw error(400, 'Invalid archive format');
		}

		// ID mapping: old ID -> new ID
		const idMap = {
			project: new Map<string, string>(),
			batch: new Map<string, string>(),
			image: new Map<string, string>()
		};

		// 1. Create project
		const newProject = await pb.collection('projects').create({
			name: projectData.name,
			user: userId,
			settings: projectData.settings,
			schema_chat_history: projectData.schema_chat_history,
			document_analyses: projectData.document_analyses
		});
		idMap.project.set(projectData.id, newProject.id);

		// 2. Create batches
		for (const batch of batchesData) {
			const newBatch = await pb.collection('image_batches').create({
				project: [newProject.id],
				status: batch.status,
				processed_data: batch.processed_data,
				row_count: batch.row_count,
				error_message: batch.error_message
			});
			idMap.batch.set(batch.id, newBatch.id);
		}

		// 3. Create images (with files)
		for (const img of imagesData) {
			const newBatchId = idMap.batch.get(img.batch[0]);
			if (!newBatchId) {
				console.warn(`Skipping image ${img.id}: batch not found`);
				continue;
			}

			// Find image file
			const imageFilename = `images/${img.id}_${img.image}`;
			const imageBuffer = imageFiles[imageFilename];

			if (!imageBuffer) {
				console.warn(`Skipping image ${img.id}: file not found in archive`);
				continue;
			}

			// Create FormData for image upload
			const imageFormData = new FormData();
			imageFormData.append('batch', newBatchId);
			imageFormData.append('order', String(img.order));
			imageFormData.append('image', new Blob([new Uint8Array(imageBuffer)]), img.image);

			if (img.extracted_text) {
				imageFormData.append('extracted_text', img.extracted_text);
			}
			if (img.column_id) {
				imageFormData.append('column_id', img.column_id);
			}
			if (img.is_cropped !== undefined) {
				imageFormData.append('is_cropped', String(img.is_cropped));
			}
			if (img.bbox_used) {
				imageFormData.append('bbox_used', JSON.stringify(img.bbox_used));
			}

			const newImage = await pb.collection('images').create(imageFormData);
			idMap.image.set(img.id, newImage.id);
		}

		// Update parent_image references
		for (const img of imagesData) {
			if (img.parent_image?.length) {
				const newImageId = idMap.image.get(img.id);
				const newParentId = idMap.image.get(img.parent_image[0]);
				if (newImageId && newParentId) {
					await pb.collection('images').update(newImageId, {
						parent_image: [newParentId]
					});
				}
			}
		}

		// 4. Create extraction rows
		for (const row of rowsData) {
			const newBatchId = idMap.batch.get(row.batch[0]);
			if (!newBatchId) {
				console.warn(`Skipping row ${row.id}: batch not found`);
				continue;
			}

			await pb.collection('extraction_rows').create({
				batch: [newBatchId],
				project: [newProject.id],
				row_data: row.row_data,
				row_index: row.row_index,
				status: row.status,
				approved_at: row.approved_at,
				deleted_at: row.deleted_at
			});
		}

		const warnings: string[] = [];

		// Check if any settings reference managed endpoints
		const settings = projectData.settings as Record<string, unknown> | null;
		if (settings?.managedEndpointId) {
			warnings.push('LLM endpoint reference was reset - please configure in project settings');
		}

		return json({
			success: true,
			projectId: newProject.id,
			stats: {
				batches: batchesData.length,
				images: imagesData.length,
				extractionRows: rowsData.length
			},
			warnings
		});
	} catch (e: any) {
		console.error('Import failed:', e);

		if (e.status) {
			throw e; // Re-throw SvelteKit errors
		}

		throw error(500, e.message || 'Import failed');
	}
};
