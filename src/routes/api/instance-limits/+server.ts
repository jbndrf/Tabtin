// API endpoint to expose instance limits to the frontend

import { json } from '@sveltejs/kit';
import { getInstanceLimits } from '$lib/server/instance-config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const limits = getInstanceLimits();

	return json({
		maxConcurrentProjects: limits.maxConcurrentProjects,
		maxParallelRequests: limits.maxParallelRequests,
		maxRequestsPerMinute: limits.maxRequestsPerMinute
	});
};
