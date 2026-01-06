import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, getAdminPb } from '$lib/server/admin-auth';
import { getInstanceLimits } from '$lib/server/instance-config';

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	const pb = await getAdminPb();
	const today = new Date().toISOString().split('T')[0];
	const instanceLimits = getInstanceLimits();

	// Get all enabled endpoints with their usage
	const endpoints = await pb.collection('llm_endpoints').getFullList({
		filter: 'is_enabled = true',
		sort: '+alias'
	});

	// Get today's usage for all endpoints
	const usageRecords = await pb.collection('endpoint_usage').getFullList({
		filter: `date ~ "${today}"`
	});

	const usageMap = new Map(usageRecords.map((u) => [u.endpoint, u]));

	const endpointStats = endpoints.map((endpoint) => {
		const usage = usageMap.get(endpoint.id);
		return {
			id: endpoint.id,
			alias: endpoint.alias,
			model_name: endpoint.model_name,
			provider_type: endpoint.provider_type,
			is_predefined: endpoint.is_predefined,
			limits: {
				max_input_tokens_per_day: endpoint.max_input_tokens_per_day,
				max_output_tokens_per_day: endpoint.max_output_tokens_per_day
			},
			usage: {
				input_tokens_used: usage?.input_tokens_used || 0,
				output_tokens_used: usage?.output_tokens_used || 0,
				request_count: usage?.request_count || 0
			},
			percentages: {
				input: endpoint.max_input_tokens_per_day
					? Math.round(((usage?.input_tokens_used || 0) / endpoint.max_input_tokens_per_day) * 100)
					: 0,
				output: endpoint.max_output_tokens_per_day
					? Math.round(
							((usage?.output_tokens_used || 0) / endpoint.max_output_tokens_per_day) * 100
						)
					: 0
			}
		};
	});

	// Get active jobs count
	const activeJobs = await pb.collection('queue_jobs').getList(1, 1, {
		filter: 'status = "processing"'
	});

	// Get pending jobs count
	const pendingJobs = await pb.collection('queue_jobs').getList(1, 1, {
		filter: 'status = "pending"'
	});

	return json({
		date: today,
		instanceLimits: {
			maxConcurrentProjects: instanceLimits.maxConcurrentProjects,
			maxParallelRequests: instanceLimits.maxParallelRequests,
			maxRequestsPerMinute: instanceLimits.maxRequestsPerMinute
		},
		endpoints: endpointStats,
		jobs: {
			active: activeJobs.totalItems,
			pending: pendingJobs.totalItems
		}
	});
};
