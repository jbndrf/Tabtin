<script lang="ts">
	import { Card, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Package, FolderSync, BarChart3, Shield, ListTodo } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-col gap-6 p-4">
	<!-- Header -->
	<div>
		<h2 class="text-2xl font-bold tracking-tight">Settings</h2>
		<p class="text-muted-foreground">Manage your application settings and integrations</p>
	</div>

	<!-- Admin (only for admins) -->
	{#if data.isAdmin}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<a href="/admin" class="block">
				<Card class="h-full transition-colors hover:bg-muted/50">
					<CardHeader>
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
								<Shield class="h-5 w-5 text-amber-500" />
							</div>
							<div>
								<CardTitle class="text-base">Admin</CardTitle>
								<CardDescription>Manage users, endpoints, and system settings</CardDescription>
							</div>
						</div>
					</CardHeader>
				</Card>
			</a>
		</div>
	{/if}

	<!-- Features -->
	<div>
		<h3 class="text-sm font-medium text-muted-foreground mb-3">Features</h3>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<!-- Addons -->
			<a href="/settings/addons" class="block">
				<Card class="h-full transition-colors hover:bg-muted/50">
					<CardHeader>
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Package class="h-5 w-5 text-primary" />
							</div>
							<div>
								<div class="flex items-center gap-2">
									<CardTitle class="text-base">Addons</CardTitle>
									{#if !data.addonsEnabled}
										<Badge variant="secondary" class="text-xs">Disabled</Badge>
									{/if}
								</div>
								<CardDescription>Manage Docker-based addons</CardDescription>
							</div>
						</div>
					</CardHeader>
				</Card>
			</a>

			<!-- Project Transfer -->
			<a href="/settings/transfer" class="block">
				<Card class="h-full transition-colors hover:bg-muted/50">
					<CardHeader>
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<FolderSync class="h-5 w-5 text-primary" />
							</div>
							<div>
								<div class="flex items-center gap-2">
									<CardTitle class="text-base">Project Transfer</CardTitle>
									{#if !data.allowImportExport}
										<Badge variant="secondary" class="text-xs">Disabled</Badge>
									{/if}
								</div>
								<CardDescription>Export and import projects</CardDescription>
							</div>
						</div>
					</CardHeader>
				</Card>
			</a>
		</div>
	</div>

	<!-- Monitoring -->
	<div>
		<h3 class="text-sm font-medium text-muted-foreground mb-3">Monitoring</h3>
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			<!-- Metrics -->
			<a href="/metrics" class="block">
				<Card class="h-full transition-colors hover:bg-muted/50">
					<CardHeader>
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<BarChart3 class="h-5 w-5 text-primary" />
							</div>
							<div>
								<CardTitle class="text-base">Metrics</CardTitle>
								<CardDescription>View usage statistics and analytics</CardDescription>
							</div>
						</div>
					</CardHeader>
				</Card>
			</a>

			<!-- Queue -->
			<a href="/queue" class="block">
				<Card class="h-full transition-colors hover:bg-muted/50">
					<CardHeader>
						<div class="flex items-center gap-3">
							<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<ListTodo class="h-5 w-5 text-primary" />
							</div>
							<div>
								<CardTitle class="text-base">Queue</CardTitle>
								<CardDescription>Monitor background job processing</CardDescription>
							</div>
						</div>
					</CardHeader>
				</Card>
			</a>
		</div>
	</div>
</div>
