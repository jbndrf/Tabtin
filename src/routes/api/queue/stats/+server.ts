// API endpoint to get queue statistics

import { json } from '@sveltejs/kit';
import { getQueueManager, getOrchestrator } from '$lib/server/queue';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const projectId = url.searchParams.get('projectId');
		const queueManager = getQueueManager();
		const orchestrator = getOrchestrator();

		let stats;
		if (projectId) {
			stats = await queueManager.getProjectStats(projectId);
		} else {
			stats = await queueManager.getStats();
		}

		const orchestratorStats = orchestrator.getStats();

		return json({
			success: true,
			queue: stats,
			orchestrator: orchestratorStats
		});
	} catch (error: any) {
		console.error('Error getting queue stats:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
};
