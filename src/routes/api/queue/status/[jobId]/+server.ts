// API endpoint to get job status

import { json, error } from '@sveltejs/kit';
import { getQueueManager } from '$lib/server/queue';
import { requireAuth, requireProjectOwnership } from '$lib/server/authorization';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		// Security: Require authentication
		requireAuth(locals);

		const { jobId } = params;
		const queueManager = getQueueManager();

		const job = await queueManager.getJob(jobId);

		if (!job) {
			return json(
				{
					success: false,
					error: 'Job not found'
				},
				{ status: 404 }
			);
		}

		// Security: Job must have a projectId and user must own it
		const projectId = job.data?.projectId || job.projectId;
		if (!projectId) {
			// Jobs without projects should not be accessible via this endpoint
			throw error(403, 'Access denied');
		}
		await requireProjectOwnership(locals.pb, locals.user!.id, projectId);

		return json({
			success: true,
			job
		});
	} catch (err: any) {
		if (err.status) {
			throw err; // Re-throw SvelteKit errors
		}
		console.error('Error getting job status:', err);
		return json(
			{
				success: false,
				error: err.message
			},
			{ status: 500 }
		);
	}
};
