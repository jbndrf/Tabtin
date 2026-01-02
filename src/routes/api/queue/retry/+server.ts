// API endpoint to retry failed jobs

import { json } from '@sveltejs/kit';
import { getQueueManager } from '$lib/server/queue';
import { checkProjectProcessingLimits, getAdminPb } from '$lib/server/admin-auth';
import { getInstanceLimits } from '$lib/server/instance-config';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { jobId, projectId, retryAll } = await request.json();
		const queueManager = getQueueManager();

		if (retryAll) {
			// For retryAll, check project limits if projectId provided, otherwise check instance limits
			if (projectId) {
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
			} else {
				// Check instance-wide limits for global retry
				const pb = await getAdminPb();
				const instanceLimits = getInstanceLimits();
				const activeJobs = await pb.collection('queue_jobs').getFullList({
					filter: 'status = "processing"',
					fields: 'projectId'
				});
				const activeProjectIds = new Set(activeJobs.map((j) => j.projectId).filter(Boolean));

				if (activeProjectIds.size >= instanceLimits.maxConcurrentProjects) {
					return json(
						{
							success: false,
							error: `Instance is at maximum concurrent projects (${activeProjectIds.size}/${instanceLimits.maxConcurrentProjects})`,
							limitExceeded: true
						},
						{ status: 429 }
					);
				}
			}

			const count = await queueManager.retryAllFailed(projectId);

			return json({
				success: true,
				message: `${count} failed jobs queued for retry`
			});
		} else if (jobId) {
			// For single job retry, look up the job to get projectId and check limits
			const pb = await getAdminPb();
			try {
				const job = await pb.collection('queue_jobs').getOne(jobId);
				const jobProjectId = job.data?.projectId;

				if (jobProjectId) {
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
				}
			} catch (e: any) {
				// Job not found or other error - let retryFailed handle it
				console.warn(`[Retry] Could not check limits for job ${jobId}:`, e.message);
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
