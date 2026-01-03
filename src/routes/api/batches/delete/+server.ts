// API endpoint to delete batches with all related data (extraction_rows, images)

import { json, error } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/admin-auth';
import { requireProjectAuth } from '$lib/server/authorization';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { batchIds, projectId } = await request.json();

		if (!batchIds?.length) {
			throw error(400, 'batchIds array is required');
		}
		if (!projectId) {
			throw error(400, 'projectId is required');
		}

		// Security: Require auth + project ownership
		await requireProjectAuth(locals, projectId);

		const pb = await getAdminPb();

		let successCount = 0;
		let failCount = 0;

		for (const batchId of batchIds) {
			try {
				// 1. Delete all extraction_rows for this batch
				const rows = await pb.collection('extraction_rows').getFullList({
					filter: pb.filter('batch = {:batchId}', { batchId })
				});
				for (const row of rows) {
					await pb.collection('extraction_rows').delete(row.id);
				}

				// 2. Delete all images for this batch
				const images = await pb.collection('images').getFullList({
					filter: pb.filter('batch = {:batchId}', { batchId })
				});
				for (const image of images) {
					await pb.collection('images').delete(image.id);
				}

				// 3. Delete the batch itself
				await pb.collection('image_batches').delete(batchId);

				successCount++;
			} catch (e) {
				console.error(`Failed to delete batch ${batchId}:`, e);
				failCount++;
			}
		}

		return json({
			success: true,
			successCount,
			failCount,
			message: `Deleted ${successCount} batch(es)${failCount > 0 ? `, ${failCount} failed` : ''}`
		});
	} catch (e: any) {
		console.error('Error deleting batches:', e);
		return json(
			{
				success: false,
				error: e.message || 'Failed to delete batches'
			},
			{ status: e.status || 500 }
		);
	}
};
