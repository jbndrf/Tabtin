<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		ChevronRight,
		ChevronDown,
		BarChart3,
		Zap,
		Clock,
		CheckCircle2,
		XCircle
	} from 'lucide-svelte';

	interface RequestDetail {
		requestIndex: number;
		imageStart: number;
		imageEnd: number;
		inputTokens: number;
		outputTokens: number;
		durationMs: number;
	}

	interface BatchMetric {
		id: string;
		batchId: string;
		projectId: string;
		jobType: string;
		status: string;
		startTime: string;
		endTime: string;
		durationMs: number;
		imageCount: number;
		extractionCount: number;
		modelUsed: string;
		tokensUsed: number;
		inputTokens: number;
		outputTokens: number;
		requestCount: number;
		requestDetails: RequestDetail[];
		errorMessage?: string;
		created: string;
	}

	let batches: BatchMetric[] = $state([]);
	let summary: any = $state(null);
	let pagination: any = $state(null);
	let timeRange = $state('1h');
	let loading = $state(true);
	let autoRefresh = $state(false);
	let refreshInterval: ReturnType<typeof setInterval> | null = null;
	let expandedBatches: Set<string> = $state(new Set());

	async function fetchBatchMetrics(page = 1) {
		loading = true;
		try {
			const response = await fetch(
				`/api/queue/batch-metrics?timeRange=${timeRange}&page=${page}&perPage=50`
			);
			const data = await response.json();
			if (data.success) {
				batches = data.batches;
				summary = data.summary;
				pagination = data.pagination;
			}
		} catch (error) {
			console.error('Error fetching batch metrics:', error);
		} finally {
			loading = false;
		}
	}

	function toggleExpand(batchId: string) {
		const newSet = new Set(expandedBatches);
		if (newSet.has(batchId)) {
			newSet.delete(batchId);
		} else {
			newSet.add(batchId);
		}
		expandedBatches = newSet;
	}

	function formatDuration(ms: number): string {
		const seconds = ms / 1000;
		if (seconds < 60) {
			return `${seconds.toFixed(1)}s`;
		} else if (seconds < 3600) {
			const minutes = Math.floor(seconds / 60);
			const remainingSeconds = Math.floor(seconds % 60);
			return `${minutes}m ${remainingSeconds}s`;
		} else {
			const hours = Math.floor(seconds / 3600);
			const minutes = Math.floor((seconds % 3600) / 60);
			return `${hours}h ${minutes}m`;
		}
	}

	function formatNumber(num: number): string {
		return new Intl.NumberFormat('en-US').format(num);
	}

	function formatTime(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}

	function getImageRange(detail: RequestDetail): string {
		if (detail.imageStart === detail.imageEnd) {
			return `Image ${detail.imageStart + 1}`;
		}
		return `Images ${detail.imageStart + 1}-${detail.imageEnd + 1}`;
	}

	onMount(() => {
		fetchBatchMetrics();

		return () => {
			if (refreshInterval) clearInterval(refreshInterval);
		};
	});

	$effect(() => {
		if (autoRefresh && !refreshInterval) {
			refreshInterval = setInterval(() => fetchBatchMetrics(), 5000);
		} else if (!autoRefresh && refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	});
</script>

<div class="container mx-auto p-6 space-y-6">
	<div class="flex justify-between items-center">
		<div>
			<h1 class="text-3xl font-bold">Batch Metrics</h1>
			<p class="text-muted-foreground">Per-batch token usage and request details</p>
		</div>

		<div class="flex gap-2">
			<select
				bind:value={timeRange}
				onchange={() => fetchBatchMetrics()}
				class="px-3 py-2 border rounded-md"
			>
				<option value="1h">Last 1 hour</option>
				<option value="6h">Last 6 hours</option>
				<option value="12h">Last 12 hours</option>
				<option value="24h">Last 24 hours</option>
				<option value="7d">Last 7 days</option>
				<option value="30d">Last 30 days</option>
				<option value="all">All time</option>
			</select>

			<Button variant="outline" onclick={() => (autoRefresh = !autoRefresh)}>
				{autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
			</Button>

			<Button onclick={() => fetchBatchMetrics()}>Refresh</Button>
		</div>
	</div>

	{#if loading && !summary}
		<div class="flex justify-center py-12">
			<Spinner />
		</div>
	{:else if summary}
		<!-- Summary Cards -->
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Total Batches</CardTitle>
					<BarChart3 class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{formatNumber(summary.totalBatches)}</div>
					<p class="text-xs text-muted-foreground">
						{summary.successCount} successful, {summary.failedCount} failed
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Input Tokens</CardTitle>
					<Zap class="h-4 w-4 text-blue-500" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{formatNumber(summary.totalInputTokens)}</div>
					<p class="text-xs text-muted-foreground">Prompt tokens sent</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Output Tokens</CardTitle>
					<Zap class="h-4 w-4 text-green-500" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{formatNumber(summary.totalOutputTokens)}</div>
					<p class="text-xs text-muted-foreground">Completion tokens received</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Total Requests</CardTitle>
					<Clock class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{formatNumber(summary.totalRequests)}</div>
					<p class="text-xs text-muted-foreground">Individual LLM calls</p>
				</CardContent>
			</Card>
		</div>

		<!-- Batch Table -->
		<Card>
			<CardHeader>
				<CardTitle>Batch Details</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b">
								<th class="text-left py-3 px-2 w-8"></th>
								<th class="text-left py-3 px-2">Batch ID</th>
								<th class="text-left py-3 px-2">Status</th>
								<th class="text-left py-3 px-2">Duration</th>
								<th class="text-right py-3 px-2">Images</th>
								<th class="text-right py-3 px-2">In Tokens</th>
								<th class="text-right py-3 px-2">Out Tokens</th>
								<th class="text-right py-3 px-2">Requests</th>
								<th class="text-left py-3 px-2">Time</th>
							</tr>
						</thead>
						<tbody>
							{#each batches as batch}
								<tr
									class="border-b hover:bg-muted/50 cursor-pointer"
									onclick={() => batch.requestDetails?.length > 1 && toggleExpand(batch.id)}
								>
									<td class="py-3 px-2">
										{#if batch.requestDetails?.length > 1}
											{#if expandedBatches.has(batch.id)}
												<ChevronDown class="h-4 w-4" />
											{:else}
												<ChevronRight class="h-4 w-4" />
											{/if}
										{/if}
									</td>
									<td class="py-3 px-2 font-mono text-xs">{batch.batchId.slice(0, 8)}...</td>
									<td class="py-3 px-2">
										{#if batch.status === 'success'}
											<Badge variant="success" class="gap-1">
												<CheckCircle2 class="h-3 w-3" />
												Success
											</Badge>
										{:else}
											<Badge variant="destructive" class="gap-1">
												<XCircle class="h-3 w-3" />
												Failed
											</Badge>
										{/if}
									</td>
									<td class="py-3 px-2">{formatDuration(batch.durationMs)}</td>
									<td class="py-3 px-2 text-right">{batch.imageCount}</td>
									<td class="py-3 px-2 text-right font-mono">
										{formatNumber(batch.inputTokens)}
									</td>
									<td class="py-3 px-2 text-right font-mono">
										{formatNumber(batch.outputTokens)}
									</td>
									<td class="py-3 px-2 text-right">
										{batch.requestCount}
									</td>
									<td class="py-3 px-2 text-xs text-muted-foreground">
										{formatTime(batch.created)}
									</td>
								</tr>

								<!-- Expanded request details -->
								{#if expandedBatches.has(batch.id) && batch.requestDetails?.length > 1}
									{#each batch.requestDetails as detail, idx}
										<tr class="bg-muted/30 border-b">
											<td class="py-2 px-2"></td>
											<td class="py-2 px-2 pl-6 text-xs text-muted-foreground" colspan="2">
												Request {idx + 1}: {getImageRange(detail)}
											</td>
											<td class="py-2 px-2 text-xs">{formatDuration(detail.durationMs)}</td>
											<td class="py-2 px-2 text-right text-xs">
												{detail.imageEnd - detail.imageStart + 1}
											</td>
											<td class="py-2 px-2 text-right font-mono text-xs">
												{formatNumber(detail.inputTokens)}
											</td>
											<td class="py-2 px-2 text-right font-mono text-xs">
												{formatNumber(detail.outputTokens)}
											</td>
											<td class="py-2 px-2"></td>
											<td class="py-2 px-2"></td>
										</tr>
									{/each}
								{/if}
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				{#if pagination && pagination.totalPages > 1}
					<div class="flex justify-between items-center mt-4 pt-4 border-t">
						<p class="text-sm text-muted-foreground">
							Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} total)
						</p>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={pagination.page <= 1}
								onclick={() => fetchBatchMetrics(pagination.page - 1)}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={pagination.page >= pagination.totalPages}
								onclick={() => fetchBatchMetrics(pagination.page + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				{/if}
			</CardContent>
		</Card>
	{:else}
		<Card>
			<CardContent class="py-12 text-center text-muted-foreground">
				No batch metrics available for the selected time range.
			</CardContent>
		</Card>
	{/if}
</div>
