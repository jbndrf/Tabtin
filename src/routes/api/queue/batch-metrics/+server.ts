// API endpoint to get batch-level metrics with per-request details

import { json, error } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/admin-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Require authentication
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}

		const projectId = url.searchParams.get('projectId');
		const timeRange = url.searchParams.get('timeRange') || '24h';
		const page = parseInt(url.searchParams.get('page') || '1');
		const perPage = parseInt(url.searchParams.get('perPage') || '50');

		// Use admin PB to access metrics (collection is admin-only)
		const pb = await getAdminPb();

		// Get user's project IDs for filtering
		const userProjects = await locals.pb.collection('projects').getFullList({
			fields: 'id'
		});
		const userProjectIds = userProjects.map((p) => p.id);

		// If user has no projects, return empty result
		if (userProjectIds.length === 0) {
			return json({
				success: true,
				batches: [],
				summary: {
					totalBatches: 0,
					totalInputTokens: 0,
					totalOutputTokens: 0,
					totalRequests: 0,
					successCount: 0,
					failedCount: 0
				},
				pagination: {
					page: 1,
					perPage,
					totalPages: 0,
					totalItems: 0
				},
				timeRange
			});
		}

		// Calculate time filter
		let timeFilter = '';
		const now = new Date();
		const timeRangeMs: Record<string, number> = {
			'1h': 1 * 60 * 60 * 1000,
			'6h': 6 * 60 * 60 * 1000,
			'12h': 12 * 60 * 60 * 1000,
			'24h': 24 * 60 * 60 * 1000,
			'7d': 7 * 24 * 60 * 60 * 1000,
			'30d': 30 * 24 * 60 * 60 * 1000
		};

		if (timeRangeMs[timeRange]) {
			const pastTime = new Date(now.getTime() - timeRangeMs[timeRange]);
			// PocketBase requires datetime format with space instead of 'T'
			timeFilter = `created >= "${pastTime.toISOString().replace('T', ' ')}"`;
		}

		// Build filter - only show metrics for user's projects
		let filter = timeFilter;

		// If specific project requested, verify user owns it
		if (projectId) {
			if (!userProjectIds.includes(projectId)) {
				throw error(403, 'Access denied to this project');
			}
			filter = filter ? `${filter} && projectId = "${projectId}"` : `projectId = "${projectId}"`;
		} else {
			// Filter to only user's projects
			const projectFilter = userProjectIds.map((id) => `projectId = "${id}"`).join(' || ');
			filter = filter ? `${filter} && (${projectFilter})` : `(${projectFilter})`;
		}

		// Fetch paginated metrics
		console.log('[batch-metrics] Filter:', filter || 'none');
		const result = await pb.collection('processing_metrics').getList(page, perPage, {
			filter: filter || undefined,
			sort: '-created'
		});
		console.log('[batch-metrics] Found', result.totalItems, 'records');

		// Transform the data
		const batches = result.items.map((m: any) => {
			const requestDetails = m.requestDetails || [];
			return {
				id: m.id,
				batchId: m.batchId,
				projectId: m.projectId,
				jobType: m.jobType,
				status: m.status,
				startTime: m.startTime,
				endTime: m.endTime,
				durationMs: m.durationMs,
				imageCount: m.imageCount,
				extractionCount: m.extractionCount || 0,
				modelUsed: m.modelUsed,
				tokensUsed: m.tokensUsed || 0,
				inputTokens: m.inputTokens || 0,
				outputTokens: m.outputTokens || 0,
				requestCount: requestDetails.length || 1,
				requestDetails: requestDetails,
				errorMessage: m.errorMessage,
				created: m.created
			};
		});

		// Calculate summary stats
		const summary = {
			totalBatches: result.totalItems,
			totalInputTokens: batches.reduce((sum: number, b: any) => sum + b.inputTokens, 0),
			totalOutputTokens: batches.reduce((sum: number, b: any) => sum + b.outputTokens, 0),
			totalRequests: batches.reduce((sum: number, b: any) => sum + b.requestCount, 0),
			successCount: batches.filter((b: any) => b.status === 'success').length,
			failedCount: batches.filter((b: any) => b.status === 'failed').length
		};

		return json({
			success: true,
			batches,
			summary,
			pagination: {
				page: result.page,
				perPage: result.perPage,
				totalPages: result.totalPages,
				totalItems: result.totalItems
			},
			timeRange
		});
	} catch (err: any) {
		console.error('Error fetching batch metrics:', err);
		return json(
			{
				success: false,
				error: err.message
			},
			{ status: err.status || 500 }
		);
	}
};
