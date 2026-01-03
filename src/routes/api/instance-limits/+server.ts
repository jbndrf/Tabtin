// API endpoint to expose instance limits to the frontend

import { json } from '@sveltejs/kit';
import { getInstanceLimits } from '$lib/server/instance-config';
import { requireAuth } from '$lib/server/authorization';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	// Security: Require authentication to view instance limits
	requireAuth(locals);

	const limits = getInstanceLimits();

	return json({
		maxConcurrentProjects: limits.maxConcurrentProjects,
		maxParallelRequests: limits.maxParallelRequests,
		maxRequestsPerMinute: limits.maxRequestsPerMinute
	});
};
