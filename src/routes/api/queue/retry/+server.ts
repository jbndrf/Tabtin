// API endpoint to retry failed jobs

import { json, error } from '@sveltejs/kit';
import { getQueueManager } from '$lib/server/queue';
import { checkProjectProcessingLimits, getAdminPb } from '$lib/server/admin-auth';
import { requireAuth, requireProjectOwnership } from '$lib/server/authorization';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Security: Require authentication
		requireAuth(locals);

		const { jobId, projectId, retryAll } = await request.json();
		const queueManager = getQueueManager();

		if (retryAll) {
			// Security: retryAll requires explicit projectId - no global retry allowed
			if (!projectId) {
				throw error(400, 'projectId is required for retryAll');
			}

			// Security: Verify user owns this project
			await requireProjectOwnership(locals.pb, locals.user!.id, projectId);

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

			const count = await queueManager.retryAllFailed(projectId);

			return json({
				success: true,
				message: `${count} failed jobs queued for retry`
			});
		} else if (jobId) {
			// For single job retry, look up the job to get projectId and verify ownership
			const pb = await getAdminPb();
			const job = await pb.collection('queue_jobs').getOne(jobId);
			const jobProjectId = job.projectId;

			if (!jobProjectId) {
				throw error(400, 'Job has no associated project');
			}

			// Security: Verify user owns this job's project
			await requireProjectOwnership(locals.pb, locals.user!.id, jobProjectId);

			const limitCheck = await checkProjectProcessingLimits(jobProjectId);
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

			await queueManager.retryFailed(jobId);

			return json({
				success: true,
				message: 'Job queued for retry'
			});
		} else {
			return json(
				{
					success: false,
					error: 'Either jobId or retryAll must be provided'
				},
				{ status: 400 }
			);
		}
	} catch (error: any) {
		console.error('Error retrying job:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
};
