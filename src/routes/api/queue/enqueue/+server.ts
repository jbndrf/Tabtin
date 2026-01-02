// API endpoint to enqueue batch processing jobs

import { json } from '@sveltejs/kit';
import { getQueueManager, notifyJobEnqueued } from '$lib/server/queue';
import { checkProjectProcessingLimits } from '$lib/server/admin-auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { batchId, batchIds, projectId, priority = 10 } = await request.json();

		// Check limits before accepting jobs
		const limitCheck = await checkProjectProcessingLimits(projectId);
		if (!limitCheck.allowed) {
			return json(
				{
					success: false,
					error: limitCheck.reason,
					limitExceeded: true
				},
				{ status: 429 }
			);
		}

		const queueManager = getQueueManager();

		if (batchId) {
			// Single batch - cancel existing jobs for this batch first
			const canceledCount = await queueManager.cancelQueuedJobs(projectId, [batchId]);

			const job = await queueManager.enqueueBatch(batchId, projectId, priority);

			// Notify orchestrator to start worker for this project
			await notifyJobEnqueued(projectId);

			return json({
				success: true,
				jobId: job.id,
				canceledCount,
				message: 'Batch enqueued successfully'
			});
		} else if (batchIds && Array.isArray(batchIds)) {
			// Multiple batches - cancel existing jobs for these batches first
			const canceledCount = await queueManager.cancelQueuedJobs(projectId, batchIds);

			const jobs = await queueManager.enqueueMultipleBatches(batchIds, projectId, priority);

			// Notify orchestrator to start worker for this project
			await notifyJobEnqueued(projectId);

			return json({
				success: true,
				jobIds: jobs.map((j) => j.id),
				canceledCount,
				message: `${jobs.length} batches enqueued successfully`
			});
		} else {
			return json(
				{
					success: false,
					error: 'Either batchId or batchIds must be provided'
				},
				{ status: 400 }
			);
		}
	} catch (error: any) {
		console.error('Error enqueueing batch:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
};
