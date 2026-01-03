// API endpoint to change batch status with proper extraction_rows sync

import { json, error } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/admin-auth';
import { requireProjectAuth } from '$lib/server/authorization';
import type { RequestHandler } from './$types';

const VALID_STATUSES = ['pending', 'review', 'approved', 'failed'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { batchIds, targetStatus, projectId } = await request.json();

		// Validate
		if (!batchIds?.length) {
			throw error(400, 'batchIds array is required');
		}
		if (!VALID_STATUSES.includes(targetStatus)) {
			throw error(400, `Invalid targetStatus. Must be one of: ${VALID_STATUSES.join(', ')}`);
		}
		if (!projectId) {
			throw error(400, 'projectId is required');
		}

		// Security: Require auth + project ownership
		await requireProjectAuth(locals, projectId);

		const pb = await getAdminPb();

		let successCount = 0;
		let failCount = 0;
		const now = new Date().toISOString();

		for (const batchId of batchIds) {
			try {
				if (targetStatus === 'pending' || targetStatus === 'failed') {
					// Delete all extraction_rows for this batch
					const rows = await pb.collection('extraction_rows').getFullList({
						filter: pb.filter('batch = {:batchId}', { batchId })
					});

					// Delete rows in a batch operation
					if (rows.length > 0) {
						const deleteBatch = pb.createBatch();
						for (const row of rows) {
							deleteBatch.collection('extraction_rows').delete(row.id);
						}
						await deleteBatch.send();
					}

					// Delete cropped images (from redo operations) for this batch
					const croppedImages = await pb.collection('images').getFullList({
						filter: pb.filter('batch = {:batchId} && is_cropped = true', { batchId })
					});

					if (croppedImages.length > 0) {
						const deleteImagesBatch = pb.createBatch();
						for (const img of croppedImages) {
							deleteImagesBatch.collection('images').delete(img.id);
						}
						await deleteImagesBatch.send();
					}

					// Update batch status and clear data
					await pb.collection('image_batches').update(batchId, {
						status: targetStatus,
						row_count: 0,
						processed_data: null
					});
				} else if (targetStatus === 'review') {
					// Set all non-deleted rows to review, clear approved_at
					const rows = await pb.collection('extraction_rows').getFullList({
						filter: pb.filter('batch = {:batchId} && status != "deleted"', { batchId })
					});

					if (rows.length > 0) {
						const updateBatch = pb.createBatch();
						for (const row of rows) {
							updateBatch.collection('extraction_rows').update(row.id, {
								status: 'review',
								approved_at: null
							});
						}
						await updateBatch.send();
					}

					await pb.collection('image_batches').update(batchId, { status: 'review' });
				} else if (targetStatus === 'approved') {
					// Set all non-deleted rows to approved with timestamp
					const rows = await pb.collection('extraction_rows').getFullList({
						filter: pb.filter('batch = {:batchId} && status != "deleted"', { batchId })
					});

					if (rows.length > 0) {
						const updateBatch = pb.createBatch();
						for (const row of rows) {
							updateBatch.collection('extraction_rows').update(row.id, {
								status: 'approved',
								approved_at: now
							});
						}
						await updateBatch.send();
					}

					await pb.collection('image_batches').update(batchId, { status: 'approved' });
				}

				successCount++;
			} catch (e) {
				console.error(`Failed to update batch ${batchId}:`, e);
				failCount++;
			}
		}

		return json({
			success: true,
			successCount,
			failCount,
			message: `Updated ${successCount} batch(es) to ${targetStatus}${failCount > 0 ? `, ${failCount} failed` : ''}`
		});
	} catch (e: any) {
		console.error('Error changing batch status:', e);
		return json(
			{
				success: false,
				error: e.message || 'Failed to change batch status'
			},
			{ status: e.status || 500 }
		);
	}
};
