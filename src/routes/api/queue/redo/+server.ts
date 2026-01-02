// API endpoint to enqueue redo processing jobs

import { json } from '@sveltejs/kit';
import { getQueueManager, notifyJobEnqueued } from '$lib/server/queue';
import { checkProjectProcessingLimits } from '$lib/server/admin-auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { batchId, projectId, rowIndex = 0, redoColumnIds, croppedImageIds, sourceImageIds, priority = 5 } =
			await request.json();

		if (!batchId || !projectId || rowIndex === undefined || !redoColumnIds || !croppedImageIds) {
			return json(
				{
					success: false,
					error: 'Missing required fields (batchId, projectId, rowIndex, redoColumnIds, croppedImageIds required)'
				},
				{ status: 400 }
			);
		}

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

		const job = await queueManager.enqueue(
			'process_redo',
			{
				batchId,
				projectId,
				rowIndex, // NEW: Which row to redo
				redoColumnIds,
				croppedImageIds,
				sourceImageIds // Pass source image IDs to the worker
			},
			priority
		);

		// Notify orchestrator to start worker for this project
		await notifyJobEnqueued(projectId);

		return json({
			success: true,
			jobId: job.id,
			message: 'Redo processing enqueued successfully'
		});
	} catch (error: any) {
		console.error('Error enqueueing redo processing:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
};
