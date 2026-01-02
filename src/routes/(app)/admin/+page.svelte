<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import { Progress } from '$lib/components/ui/progress';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Activity from 'lucide-svelte/icons/activity';
	import Zap from 'lucide-svelte/icons/zap';
	import Clock from 'lucide-svelte/icons/clock';

	interface EndpointStat {
		id: string;
		alias: string;
		model_name: string;
		provider_type: string;
		is_predefined: boolean;
		limits: {
			max_input_tokens_per_day: number;
			max_output_tokens_per_day: number;
		};
		usage: {
			input_tokens_used: number;
			output_tokens_used: number;
			request_count: number;
		};
		percentages: {
			input: number;
			output: number;
		};
	}

	interface Stats {
		date: string;
		instanceLimits: {
			maxConcurrentJobs: number;
		};
		endpoints: EndpointStat[];
		jobs: {
			active: number;
			pending: number;
		};
	}

	let stats: Stats | null = $state(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	async function loadStats() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/admin/stats');
			if (!res.ok) {
				throw new Error('Failed to load stats');
			}
			stats = await res.json();
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		loadStats();
		// Refresh every 30 seconds
		const interval = setInterval(loadStats, 30000);
		return () => clearInterval(interval);
	});

	function formatNumber(num: number): string {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1) + 'M';
		}
		if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'K';
		}
		return num.toString();
	}
</script>

<div class="p-6 space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">Admin Dashboard</h2>
			<p class="text-muted-foreground">Monitor endpoint usage and system status</p>
		</div>
		<Button variant="outline" size="sm" onclick={loadStats} disabled={loading}>
			<RefreshCw class="h-4 w-4 mr-2 {loading ? 'animate-spin' : ''}" />
			Refresh
		</Button>
	</div>

	{#if error}
		<Card.Root class="border-destructive">
			<Card.Content class="pt-6">
				<p class="text-destructive">{error}</p>
			</Card.Content>
		</Card.Root>
	{:else if loading && !stats}
		<div class="grid gap-4 md:grid-cols-3">
			{#each [1, 2, 3] as _}
				<Card.Root>
					<Card.Content class="pt-6">
						<div class="h-20 bg-muted animate-pulse rounded" />
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if stats}
		<!-- Summary Cards -->
		<div class="grid gap-4 md:grid-cols-3">
			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
					<Card.Title class="text-sm font-medium">Active Jobs</Card.Title>
					<Activity class="h-4 w-4 text-muted-foreground" />
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{stats.jobs.active}</div>
					<p class="text-xs text-muted-foreground">
						of {stats.instanceLimits.maxConcurrentJobs} max concurrent
					</p>
					<Progress value={(stats.jobs.active / stats.instanceLimits.maxConcurrentJobs) * 100} class="mt-2" />
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
					<Card.Title class="text-sm font-medium">Pending Jobs</Card.Title>
					<Clock class="h-4 w-4 text-muted-foreground" />
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{stats.jobs.pending}</div>
					<p class="text-xs text-muted-foreground">waiting in queue</p>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
					<Card.Title class="text-sm font-medium">Active Endpoints</Card.Title>
					<Zap class="h-4 w-4 text-muted-foreground" />
				</Card.Header>
				<Card.Content>
					<div class="text-2xl font-bold">{stats.endpoints.length}</div>
					<p class="text-xs text-muted-foreground">configured endpoints</p>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Endpoint Usage -->
		<Card.Root>
			<Card.Header>
				<Card.Title>Endpoint Usage Today</Card.Title>
				<Card.Description>Daily token usage for {stats.date}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if stats.endpoints.length === 0}
					<p class="text-muted-foreground text-center py-8">
						No endpoints configured. Go to Endpoints to add some.
					</p>
				{:else}
					<div class="space-y-6">
						{#each stats.endpoints as endpoint}
							<div class="space-y-2">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<span class="font-medium">{endpoint.alias}</span>
										<Badge variant="outline" class="text-xs">
											{endpoint.provider_type}
										</Badge>
										{#if endpoint.is_predefined}
											<Badge variant="secondary" class="text-xs">predefined</Badge>
										{/if}
									</div>
									<span class="text-sm text-muted-foreground">
										{endpoint.usage.request_count} requests
									</span>
								</div>
								<div class="grid gap-2 md:grid-cols-2">
									<div>
										<div class="flex justify-between text-xs mb-1">
											<span>Input Tokens</span>
											<span>
												{formatNumber(endpoint.usage.input_tokens_used)} / {formatNumber(endpoint.limits.max_input_tokens_per_day)}
											</span>
										</div>
										<Progress value={endpoint.percentages.input} />
									</div>
									<div>
										<div class="flex justify-between text-xs mb-1">
											<span>Output Tokens</span>
											<span>
												{formatNumber(endpoint.usage.output_tokens_used)} / {formatNumber(endpoint.limits.max_output_tokens_per_day)}
											</span>
										</div>
										<Progress value={endpoint.percentages.output} />
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
