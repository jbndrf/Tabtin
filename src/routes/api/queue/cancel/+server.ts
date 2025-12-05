// API endpoint to cancel queued/processing jobs

import { json } from '@sveltejs/kit';
import { getQueueManager } from '$lib/server/queue';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import PocketBase from 'pocketbase';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		console.log('[cancel endpoint] Starting cancel request');
		const { projectId, batchIds } = await request.json();
		console.log('[cancel endpoint] Request data:', { projectId, batchIds });

		if (!projectId) {
			return json(
				{
					success: false,
					error: 'projectId is required'
				},
				{ status: 400 }
			);
		}

		console.log('[cancel endpoint] Getting queue manager');
		const queueManager = getQueueManager();

		console.log('[cancel endpoint] Authenticating with PocketBase');
		const pocketbaseUrl = publicEnv.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
		const pb = new PocketBase(pocketbaseUrl);
		await pb.collection('_superusers').authWithPassword(
			privateEnv.POCKETBASE_ADMIN_EMAIL || '',
			privateEnv.POCKETBASE_ADMIN_PASSWORD || ''
		);

		console.log('[cancel endpoint] Canceling queue jobs');
		// Cancel queued/processing jobs for this project (optionally filtered by batchIds)
		const canceledCount = await queueManager.cancelQueuedJobs(projectId, batchIds);
		console.log('[cancel endpoint] Canceled', canceledCount, 'queue jobs');

		// Also reset batch statuses to prevent auto-re-queueing
		// Get all batches that are pending or processing for this project
		let filter = `project = "${projectId}" && (status = "pending" || status = "processing")`;
		if (batchIds && batchIds.length > 0) {
			const batchFilter = batchIds.map((id: string) => `id = "${id}"`).join(' || ');
			filter = `${filter} && (${batchFilter})`;
		}

		console.log('[cancel endpoint] Fetching batches with filter:', filter);
		const batches = await pb.collection('image_batches').getFullList({
			filter
		});
		console.log('[cancel endpoint] Found', batches.length, 'batches to reset');

		// Reset batch statuses using batch API for atomic transaction
		if (batches.length > 0) {
			const updateBatch = pb.createBatch();
			for (const batch of batches) {
				updateBatch.collection('image_batches').update(batch.id, {
					status: 'failed',
					error_message: 'Processing canceled by user'
				});
			}
			await updateBatch.send();
			console.log('[cancel endpoint] Reset', batches.length, 'batches using batch API');
		}

		console.log('[cancel endpoint] Success! Returning response');
		return json({
			success: true,
			canceledCount,
			batchesReset: batches.length,
			message: `${canceledCount} job${canceledCount === 1 ? '' : 's'} canceled, ${batches.length} batch${batches.length === 1 ? '' : 'es'} reset`
		});
	} catch (error: any) {
		console.error('Error canceling jobs:', error);
		console.error('Error details:', {
			message: error.message,
			status: error.status,
			response: error.response,
			stack: error.stack
		});
		return json(
			{
				success: false,
				error: error.message || 'Unknown error occurred'
			},
			{ status: 500 }
		);
	}
};
