/**
 * Export a project as a .tabtin file (ZIP archive)
 * Requires ALLOW_IMPORT_EXPORT=true env var
 */

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getAdminPb } from '$lib/server/admin-auth';
import { requireProjectAuth } from '$lib/server/authorization';
import type { RequestHandler } from './$types';
import archiver from 'archiver';
import type {
	ProjectsResponse,
	ImageBatchesResponse,
	ImagesResponse,
	ExtractionRowsResponse
} from '$lib/pocketbase-types';

export const GET: RequestHandler = async ({ params, locals }) => {
	// Check feature flag
	if (env.ALLOW_IMPORT_EXPORT !== 'true') {
		throw error(403, 'Import/Export feature is disabled');
	}

	const projectId = params.id;

	// Auth + ownership check
	await requireProjectAuth(locals, projectId);

	const pb = await getAdminPb();

	try {
		// Fetch project
		const project = await pb.collection('projects').getOne<ProjectsResponse>(projectId);

		// Fetch all batches for project
		const batches = await pb.collection('image_batches').getFullList<ImageBatchesResponse>({
			filter: pb.filter('project = {:projectId}', { projectId })
		});

		// Fetch all images for all batches
		const batchIds = batches.map((b) => b.id);
		let images: ImagesResponse[] = [];
		if (batchIds.length > 0) {
			images = await pb.collection('images').getFullList<ImagesResponse>({
				filter: batchIds.map((id) => `batch = "${id}"`).join(' || ')
			});
		}

		// Fetch all extraction rows for project
		const extractionRows = await pb
			.collection('extraction_rows')
			.getFullList<ExtractionRowsResponse>({
				filter: pb.filter('project = {:projectId}', { projectId })
			});

		// Create ZIP archive
		const archive = archiver('zip', { zlib: { level: 5 } });

		// Create manifest
		const manifest = {
			version: '1.0.0',
			format: 'tabtin',
			exportedAt: new Date().toISOString(),
			projectId: project.id,
			projectName: project.name
		};

		// Sanitize project (remove user ID)
		const sanitizedProject = {
			id: project.id,
			name: project.name,
			settings: project.settings,
			schema_chat_history: project.schema_chat_history,
			document_analyses: project.document_analyses,
			created: project.created,
			updated: project.updated
		};

		// Sanitize batches
		const sanitizedBatches = batches.map((b) => ({
			id: b.id,
			project: b.project,
			status: b.status,
			processed_data: b.processed_data,
			row_count: b.row_count,
			error_message: b.error_message,
			created: b.created,
			updated: b.updated
		}));

		// Sanitize images (keep file reference)
		const sanitizedImages = images.map((img) => ({
			id: img.id,
			batch: img.batch,
			image: img.image,
			order: img.order,
			extracted_text: img.extracted_text,
			column_id: img.column_id,
			is_cropped: img.is_cropped,
			parent_image: img.parent_image,
			bbox_used: img.bbox_used
		}));

		// Sanitize extraction rows
		const sanitizedRows = extractionRows.map((row) => ({
			id: row.id,
			batch: row.batch,
			project: row.project,
			row_data: row.row_data,
			row_index: row.row_index,
			status: row.status,
			approved_at: row.approved_at,
			deleted_at: row.deleted_at
		}));

		// Add JSON files to archive
		archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
		archive.append(JSON.stringify(sanitizedProject, null, 2), { name: 'project.json' });
		archive.append(JSON.stringify(sanitizedBatches, null, 2), { name: 'batches.json' });
		archive.append(JSON.stringify(sanitizedImages, null, 2), { name: 'images.json' });
		archive.append(JSON.stringify(sanitizedRows, null, 2), { name: 'extraction_rows.json' });

		// Add image files
		for (const img of images) {
			if (img.image) {
				try {
					const imageUrl = pb.files.getURL(img, img.image);
					const response = await fetch(imageUrl);
					if (response.ok) {
						const buffer = Buffer.from(await response.arrayBuffer());
						archive.append(buffer, { name: `images/${img.id}_${img.image}` });
					}
				} catch (e) {
					console.error(`Failed to fetch image ${img.id}:`, e);
				}
			}
		}

		archive.finalize();

		// Generate filename
		const safeName = project.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
		const date = new Date().toISOString().split('T')[0];
		const filename = `${safeName}-${date}.tabtin`;

		// Stream response
		const stream = archive as unknown as ReadableStream;
		return new Response(stream as BodyInit, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': `attachment; filename="${filename}"`
			}
		});
	} catch (e: any) {
		console.error('Export failed:', e);
		throw error(500, e.message || 'Export failed');
	}
};
