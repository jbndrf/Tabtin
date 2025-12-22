// API endpoint to get processing metrics and statistics

import { json } from '@sveltejs/kit';
import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const projectId = url.searchParams.get('projectId');
		const timeRange = url.searchParams.get('timeRange') || '24h'; // 24h, 7d, 30d, all

		const pb = new PocketBase(POCKETBASE_URL);

		// Calculate time filter
		// PocketBase requires datetime format with space instead of 'T'
		let timeFilter = '';
		const now = new Date();
		if (timeRange === '24h') {
			const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			timeFilter = `created >= "${past24h.toISOString().replace('T', ' ')}"`;
		} else if (timeRange === '7d') {
			const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			timeFilter = `created >= "${past7d.toISOString().replace('T', ' ')}"`;
		} else if (timeRange === '30d') {
			const past30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			timeFilter = `created >= "${past30d.toISOString().replace('T', ' ')}"`;
		}

		// Build filter
		let filter = timeFilter;
		if (projectId) {
			filter = filter ? `${filter} && projectId = "${projectId}"` : `projectId = "${projectId}"`;
		}

		// Fetch all metrics
		const metrics = await pb.collection('processing_metrics').getFullList({
			filter: filter || undefined,
			sort: '-id'
		});

		// Calculate statistics
		const stats = {
			total: metrics.length,
			successful: metrics.filter((m: any) => m.status === 'success').length,
			failed: metrics.filter((m: any) => m.status === 'failed').length,
			successRate:
				metrics.length > 0
					? ((metrics.filter((m: any) => m.status === 'success').length / metrics.length) * 100).toFixed(1)
					: 0,

			// Duration statistics (in seconds)
			averageDuration:
				metrics.length > 0
					? (
							metrics.reduce((sum: number, m: any) => sum + m.durationMs, 0) /
							metrics.length /
							1000
						).toFixed(2)
					: 0,
			minDuration:
				metrics.length > 0 ? (Math.min(...metrics.map((m: any) => m.durationMs)) / 1000).toFixed(2) : 0,
			maxDuration:
				metrics.length > 0 ? (Math.max(...metrics.map((m: any) => m.durationMs)) / 1000).toFixed(2) : 0,

			// Image and extraction counts
			totalImages: metrics.reduce((sum: number, m: any) => sum + m.imageCount, 0),
			totalExtractions: metrics.reduce((sum: number, m: any) => sum + (m.extractionCount || 0), 0),
			averageExtractionsPerBatch:
				metrics.length > 0
					? (
							metrics.reduce((sum: number, m: any) => sum + (m.extractionCount || 0), 0) /
							metrics.length
						).toFixed(1)
					: 0,

			// Token usage (if available)
			totalTokens: metrics.reduce((sum: number, m: any) => sum + (m.tokensUsed || 0), 0),
			totalInputTokens: metrics.reduce((sum: number, m: any) => sum + (m.inputTokens || 0), 0),
			totalOutputTokens: metrics.reduce((sum: number, m: any) => sum + (m.outputTokens || 0), 0),
			averageTokensPerBatch:
				metrics.filter((m: any) => m.tokensUsed).length > 0
					? (
							metrics.reduce((sum: number, m: any) => sum + (m.tokensUsed || 0), 0) /
							metrics.filter((m: any) => m.tokensUsed).length
						).toFixed(0)
					: 0,
			averageInputTokensPerBatch:
				metrics.filter((m: any) => m.inputTokens).length > 0
					? (
							metrics.reduce((sum: number, m: any) => sum + (m.inputTokens || 0), 0) /
							metrics.filter((m: any) => m.inputTokens).length
						).toFixed(0)
					: 0,
			averageOutputTokensPerBatch:
				metrics.filter((m: any) => m.outputTokens).length > 0
					? (
							metrics.reduce((sum: number, m: any) => sum + (m.outputTokens || 0), 0) /
							metrics.filter((m: any) => m.outputTokens).length
						).toFixed(0)
					: 0,

			// Job type breakdown
			batchProcessing: metrics.filter((m: any) => m.jobType === 'process_batch').length,
			redoProcessing: metrics.filter((m: any) => m.jobType === 'process_redo').length,

			// Model usage
			modelUsage: metrics.reduce(
				(acc: any, m: any) => {
					if (m.modelUsed) {
						acc[m.modelUsed] = (acc[m.modelUsed] || 0) + 1;
					}
					return acc;
				},
				{} as Record<string, number>
			),

			// Hourly breakdown (last 24 hours)
			hourlyBreakdown: generateHourlyBreakdown(metrics, timeRange),

			// Recent metrics
			recentMetrics: metrics.slice(0, 10).map((m: any) => ({
				id: m.id,
				batchId: m.batchId,
				jobType: m.jobType,
				status: m.status,
				durationMs: m.durationMs,
				imageCount: m.imageCount,
				extractionCount: m.extractionCount,
				modelUsed: m.modelUsed,
				created: m.created,
				errorMessage: m.errorMessage
			}))
		};

		return json({
			success: true,
			stats,
			timeRange
		});
	} catch (error: any) {
		console.error('Error fetching metrics:', error);
		return json(
			{
				success: false,
				error: error.message
			},
			{ status: 500 }
		);
	}
};

function generateHourlyBreakdown(metrics: any[], timeRange: string) {
	if (timeRange !== '24h') return null;

	const now = new Date();
	const breakdown: Record<string, { successful: number; failed: number; count: number }> = {};

	// Initialize last 24 hours
	for (let i = 0; i < 24; i++) {
		const hour = new Date(now.getTime() - i * 60 * 60 * 1000);
		const key = `${hour.getHours()}:00`;
		breakdown[key] = { successful: 0, failed: 0, count: 0 };
	}

	// Fill with actual data
	metrics.forEach((m: any) => {
		const created = new Date(m.created);
		const key = `${created.getHours()}:00`;
		if (breakdown[key]) {
			breakdown[key].count++;
			if (m.status === 'success') {
				breakdown[key].successful++;
			} else {
				breakdown[key].failed++;
			}
		}
	});

	return Object.entries(breakdown)
		.map(([hour, data]) => ({ hour, ...data }))
		.reverse();
}
