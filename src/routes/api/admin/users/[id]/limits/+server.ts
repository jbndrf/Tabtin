/**
 * API endpoint for managing user limits
 * GET: Fetch user's limits and endpoint limits
 * PUT: Update user's limits
 */

import { json, error } from '@sveltejs/kit';
import {
	requireAdmin,
	getUserLimits,
	upsertUserLimits,
	deleteUserLimits,
	getUserEndpointLimits,
	upsertUserEndpointLimit,
	deleteUserEndpointLimit,
	getAdminPb
} from '$lib/server/admin-auth';
import { getInstanceLimits } from '$lib/server/instance-config';
import type { RequestHandler } from './$types';

export interface UserLimitsResponse {
	limits: {
		max_concurrent_projects: number | null;
		max_parallel_requests: number | null;
		max_requests_per_minute: number | null;
	} | null;
	endpointLimits: Array<{
		endpoint: string;
		endpointAlias: string;
		max_input_tokens_per_day: number | null;
		max_output_tokens_per_day: number | null;
	}>;
	instanceLimits: {
		maxConcurrentProjects: number;
		maxParallelRequests: number;
		maxRequestsPerMinute: number;
	};
	availableEndpoints: Array<{
		id: string;
		alias: string;
		is_enabled: boolean;
	}>;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);

	const userId = params.id;

	try {
		const pb = await getAdminPb();

		// Get user limits
		const userLimits = await getUserLimits(userId);

		// Get user's endpoint-specific limits
		const userEndpointLimits = await getUserEndpointLimits(userId);

		// Get all available endpoints for the dropdown (all enabled endpoints, not just predefined)
		const endpoints = await pb.collection('llm_endpoints').getFullList({
			filter: 'is_enabled = true',
			sort: 'alias'
		});

		// Map endpoint limits with aliases
		const endpointLimitsWithAliases = await Promise.all(
			userEndpointLimits.map(async (limit) => {
				const endpoint = endpoints.find(e => e.id === limit.endpoint);
				return {
					endpoint: limit.endpoint,
					endpointAlias: endpoint?.alias || 'Unknown',
					max_input_tokens_per_day: limit.max_input_tokens_per_day,
					max_output_tokens_per_day: limit.max_output_tokens_per_day
				};
			})
		);

		const response: UserLimitsResponse = {
			limits: userLimits ? {
				max_concurrent_projects: userLimits.max_concurrent_projects,
				max_parallel_requests: userLimits.max_parallel_requests,
				max_requests_per_minute: userLimits.max_requests_per_minute
			} : null,
			endpointLimits: endpointLimitsWithAliases,
			instanceLimits: getInstanceLimits(),
			availableEndpoints: endpoints.map(e => ({
				id: e.id,
				alias: e.alias,
				is_enabled: e.is_enabled
			}))
		};

		return json(response);
	} catch (e: any) {
		console.error('Failed to get user limits:', e);
		throw error(500, 'Failed to get user limits');
	}
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	requireAdmin(locals);

	const userId = params.id;

	try {
		const body = await request.json();
		const { limits, endpointLimits } = body;

		// Update general limits
		if (limits !== undefined) {
			// Check if all limits are null/empty - if so, delete the record
			const hasAnyLimit = limits.max_concurrent_projects != null ||
				limits.max_parallel_requests != null ||
				limits.max_requests_per_minute != null;

			if (hasAnyLimit) {
				await upsertUserLimits(userId, {
					max_concurrent_projects: limits.max_concurrent_projects || null,
					max_parallel_requests: limits.max_parallel_requests || null,
					max_requests_per_minute: limits.max_requests_per_minute || null
				});
			} else {
				// All limits are empty, delete the record
				await deleteUserLimits(userId);
			}
		}

		// Update endpoint limits
		if (endpointLimits !== undefined && Array.isArray(endpointLimits)) {
			for (const epLimit of endpointLimits) {
				const hasAnyEndpointLimit = epLimit.max_input_tokens_per_day != null ||
					epLimit.max_output_tokens_per_day != null;

				if (hasAnyEndpointLimit) {
					await upsertUserEndpointLimit(userId, epLimit.endpoint, {
						max_input_tokens_per_day: epLimit.max_input_tokens_per_day || null,
						max_output_tokens_per_day: epLimit.max_output_tokens_per_day || null
					});
				} else {
					// All limits are empty, delete the record
					await deleteUserEndpointLimit(userId, epLimit.endpoint);
				}
			}
		}

		return json({ success: true });
	} catch (e: any) {
		console.error('Failed to update user limits:', e);
		throw error(500, 'Failed to update user limits');
	}
};
