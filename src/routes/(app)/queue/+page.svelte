<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Activity, Clock, CheckCircle2, XCircle, BarChart3, Zap } from 'lucide-svelte';

	let stats: any = $state(null);
	let queueStats: any = $state(null);
	let workerStats: any = $state(null);
	let timeRange = $state('24h');
	let loading = $state(true);
	let autoRefresh = $state(true);
	let refreshInterval: NodeJS.Timeout | null = null;

	async function fetchStats() {
		loading = true;
		try {
			// Fetch metrics
			const metricsResponse = await fetch(`/api/queue/metrics?timeRange=${timeRange}`);
			const metricsData = await metricsResponse.json();
			stats = metricsData.stats;

			// Fetch queue stats
			const queueResponse = await fetch('/api/queue/stats');
			const queueData = await queueResponse.json();
			queueStats = queueData.queue;
			workerStats = queueData.worker;
		} catch (error) {
			console.error('Error fetching stats:', error);
		} finally {
			loading = false;
		}
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) {
			return `${seconds}s`;
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

	onMount(() => {
		fetchStats();

		if (autoRefresh) {
			refreshInterval = setInterval(fetchStats, 5000);
		}

		return () => {
			if (refreshInterval) clearInterval(refreshInterval);
		};
	});

	$effect(() => {
		if (autoRefresh && !refreshInterval) {
			refreshInterval = setInterval(fetchStats, 5000);
		} else if (!autoRefresh && refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	});
</script>

<div class="container mx-auto p-6 space-y-6">
	<div class="flex justify-between items-center">
		<div>
			<h1 class="text-3xl font-bold">Queue Monitoring</h1>
			<p class="text-muted-foreground">Real-time processing statistics and queue status</p>
		</div>

		<div class="flex gap-2">
			<select
				bind:value={timeRange}
				onchange={() => fetchStats()}
				class="px-3 py-2 border rounded-md"
			>
				<option value="24h">Last 24 hours</option>
				<option value="7d">Last 7 days</option>
				<option value="30d">Last 30 days</option>
				<option value="all">All time</option>
			</select>

			<Button variant="outline" onclick={() => (autoRefresh = !autoRefresh)}>
				{autoRefresh ? 'Auto-refresh: ON' : 'Auto-refresh: OFF'}
			</Button>

			<Button onclick={() => fetchStats()}>Refresh</Button>
		</div>
	</div>

	{#if loading && !stats}
		<div class="flex justify-center items-center h-64">
			<Spinner />
		</div>
	{:else if stats}
		<!-- Queue Status Cards -->
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Queued</CardTitle>
					<Clock class="h-4 w-4 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{queueStats?.queued || 0}</div>
					<p class="text-xs text-muted-foreground">Waiting for processing</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Processing</CardTitle>
					<Activity class="h-4 w-4 text-blue-500" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{queueStats?.processing || 0}</div>
					<p class="text-xs text-muted-foreground">Currently processing</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Completed</CardTitle>
					<CheckCircle2 class="h-4 w-4 text-green-500" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{queueStats?.completed || 0}</div>
					<p class="text-xs text-muted-foreground">Successfully processed</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle class="text-sm font-medium">Failed</CardTitle>
					<XCircle class="h-4 w-4 text-red-500" />
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{queueStats?.failed || 0}</div>
					<p class="text-xs text-muted-foreground">Processing errors</p>
				</CardContent>
			</Card>
		</div>

		<!-- Worker Status -->
		{#if workerStats}
			<Card>
				<CardHeader>
					<CardTitle>Worker Status</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid grid-cols-4 gap-4 mb-4">
						<div>
							<p class="text-sm text-muted-foreground">Active Jobs</p>
							<p class="text-2xl font-bold">{workerStats.totalActiveJobs || 0}</p>
						</div>
						<div>
							<p class="text-sm text-muted-foreground">Active LLM Requests</p>
							<p class="text-2xl font-bold">{workerStats.totalActiveRequests || 0}</p>
						</div>
						<div>
							<p class="text-sm text-muted-foreground">Queued in Pool</p>
							<p class="text-2xl font-bold">{workerStats.totalQueuedRequests || 0}</p>
						</div>
						<div>
							<p class="text-sm text-muted-foreground">Active Projects</p>
							<p class="text-2xl font-bold">{workerStats.poolCount || 0}</p>
						</div>
					</div>

					{#if workerStats.projectPools && Object.keys(workerStats.projectPools).length > 0}
						<div class="border-t pt-4">
							<p class="text-sm font-medium text-muted-foreground mb-2">Per-Project Status</p>
							<div class="space-y-2">
								{#each Object.entries(workerStats.projectPools) as [projectId, poolStats]}
								{@const stats = poolStats as { activeJobs: number; maxConcurrency: number; activeRequests: number; queuedRequests: number; requestsInLastMinute: number; requestsPerMinute: number }}
									<div class="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2">
										<span class="font-mono text-xs">{projectId.substring(0, 8)}...</span>
										<div class="flex gap-4 text-xs">
											<span class="font-medium">Jobs: {stats.activeJobs}/{stats.maxConcurrency}</span>
											<span>LLM: {stats.activeRequests}</span>
											<span>Queued: {stats.queuedRequests}</span>
											<span>RPM: {stats.requestsInLastMinute}/{stats.requestsPerMinute}</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/if}

		<!-- Processing Statistics -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<Card>
				<CardHeader>
					<CardTitle>Success Rate</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-4xl font-bold text-green-600">{stats.successRate}%</div>
					<p class="text-sm text-muted-foreground">
						{stats.successful} successful / {stats.failed} failed
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Average Duration</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-4xl font-bold">{formatDuration(stats.averageDuration)}</div>
					<p class="text-sm text-muted-foreground">
						Min: {formatDuration(stats.minDuration)} | Max: {formatDuration(stats.maxDuration)}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Total Processed</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-4xl font-bold">{formatNumber(stats.total)}</div>
					<p class="text-sm text-muted-foreground">{formatNumber(stats.totalImages)} images</p>
				</CardContent>
			</Card>
		</div>

		<!-- Extraction Statistics -->
		<Card>
			<CardHeader>
				<CardTitle>Extraction Statistics</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
					<div>
						<p class="text-sm text-muted-foreground">Total Extractions</p>
						<p class="text-2xl font-bold">{formatNumber(stats.totalExtractions)}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Avg per Batch</p>
						<p class="text-2xl font-bold">{stats.averageExtractionsPerBatch}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Total Tokens</p>
						<p class="text-2xl font-bold">{formatNumber(stats.totalTokens)}</p>
					</div>
					<div>
						<p class="text-sm text-muted-foreground">Avg Tokens/Batch</p>
						<p class="text-2xl font-bold">{formatNumber(stats.averageTokensPerBatch)}</p>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Job Type Breakdown -->
		<Card>
			<CardHeader>
				<CardTitle>Job Type Distribution</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="space-y-2">
					<div class="flex justify-between items-center">
						<span>Batch Processing</span>
						<span class="font-bold">{stats.batchProcessing}</span>
					</div>
					<div class="w-full bg-gray-200 rounded-full h-2">
						<div
							class="bg-blue-600 h-2 rounded-full"
							style="width: {(stats.batchProcessing / stats.total) * 100}%"
						></div>
					</div>

					<div class="flex justify-between items-center mt-4">
						<span>Redo Processing</span>
						<span class="font-bold">{stats.redoProcessing}</span>
					</div>
					<div class="w-full bg-gray-200 rounded-full h-2">
						<div
							class="bg-purple-600 h-2 rounded-full"
							style="width: {(stats.redoProcessing / stats.total) * 100}%"
						></div>
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Model Usage -->
		{#if stats.modelUsage && Object.keys(stats.modelUsage).length > 0}
			<Card>
				<CardHeader>
					<CardTitle>Model Usage</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-3">
						{#each Object.entries(stats.modelUsage) as [model, count]}
							<div>
								<div class="flex justify-between items-center mb-1">
									<span class="text-sm">{model}</span>
									<span class="font-bold">{count}</span>
								</div>
								<div class="w-full bg-gray-200 rounded-full h-2">
									<div
										class="bg-green-600 h-2 rounded-full"
										style="width: {((count as number) / stats.total) * 100}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Hourly Breakdown (24h only) -->
		{#if stats.hourlyBreakdown}
			<Card>
				<CardHeader>
					<CardTitle>Hourly Activity (Last 24 Hours)</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="space-y-1">
						{#each stats.hourlyBreakdown as hourData}
							<div class="flex items-center gap-2">
								<span class="text-sm w-16">{hourData.hour}</span>
								<div class="flex-1 flex gap-1">
									<div
										class="bg-green-500 h-6"
										style="width: {(hourData.successful / Math.max(...stats.hourlyBreakdown.map((h: any) => h.count))) * 100}%"
										title="Successful: {hourData.successful}"
									></div>
									<div
										class="bg-red-500 h-6"
										style="width: {(hourData.failed / Math.max(...stats.hourlyBreakdown.map((h: any) => h.count))) * 100}%"
										title="Failed: {hourData.failed}"
									></div>
								</div>
								<span class="text-sm w-12 text-right">{hourData.count}</span>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Recent Metrics -->
		<Card>
			<CardHeader>
				<CardTitle>Recent Processing Jobs</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b">
								<th class="text-left p-2">Batch ID</th>
								<th class="text-left p-2">Type</th>
								<th class="text-left p-2">Status</th>
								<th class="text-right p-2">Duration</th>
								<th class="text-right p-2">Images</th>
								<th class="text-right p-2">Extractions</th>
								<th class="text-left p-2">Model</th>
								<th class="text-left p-2">Time</th>
							</tr>
						</thead>
						<tbody>
							{#each stats.recentMetrics as metric}
								<tr class="border-b hover:bg-gray-50">
									<td class="p-2 font-mono text-xs">{metric.batchId.slice(0, 8)}...</td>
									<td class="p-2">
										<span
											class="px-2 py-1 rounded text-xs {metric.jobType === 'process_batch'
												? 'bg-blue-100 text-blue-800'
												: 'bg-purple-100 text-purple-800'}"
										>
											{metric.jobType === 'process_batch' ? 'Batch' : 'Redo'}
										</span>
									</td>
									<td class="p-2">
										<span
											class="px-2 py-1 rounded text-xs {metric.status === 'success'
												? 'bg-green-100 text-green-800'
												: 'bg-red-100 text-red-800'}"
										>
											{metric.status}
										</span>
									</td>
									<td class="p-2 text-right">{formatDuration(metric.durationMs / 1000)}</td>
									<td class="p-2 text-right">{metric.imageCount}</td>
									<td class="p-2 text-right">{metric.extractionCount || '-'}</td>
									<td class="p-2 text-xs">{metric.modelUsed || '-'}</td>
									<td class="p-2 text-xs">{new Date(metric.created).toLocaleString()}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
