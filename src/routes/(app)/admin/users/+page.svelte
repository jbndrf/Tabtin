<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Input } from '$lib/components/ui/input';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Shield from 'lucide-svelte/icons/shield';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Save from 'lucide-svelte/icons/save';

	interface User {
		id: string;
		email: string;
		name?: string;
		is_admin: boolean;
		verified: boolean;
		created: string;
	}

	interface UserLimits {
		max_concurrent_projects: number | null;
		max_parallel_requests: number | null;
		max_requests_per_minute: number | null;
	}

	interface EndpointLimit {
		endpoint: string;
		endpointAlias: string;
		max_input_tokens_per_day: number | null;
		max_output_tokens_per_day: number | null;
	}

	interface AvailableEndpoint {
		id: string;
		alias: string;
		is_enabled: boolean;
	}

	interface InstanceLimits {
		maxConcurrentProjects: number;
		maxParallelRequests: number;
		maxRequestsPerMinute: number;
	}

	let users: User[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let page = $state(1);
	let perPage = $state(50);
	let totalItems = $state(0);
	let totalPages = $state(0);

	// Expanded rows state
	let expandedUsers = $state<Set<string>>(new Set());
	let userLimitsCache = $state<Map<string, { limits: UserLimits | null; endpointLimits: EndpointLimit[] }>>(new Map());
	let loadingLimits = $state<Set<string>>(new Set());
	let savingLimits = $state<Set<string>>(new Set());
	let availableEndpoints = $state<AvailableEndpoint[]>([]);
	let instanceLimits = $state<InstanceLimits | null>(null);

	// Edit state for user limits
	let editingLimits = $state<Map<string, { limits: UserLimits; endpointLimits: EndpointLimit[] }>>(new Map());

	async function loadUsers() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/admin/users?page=${page}&perPage=${perPage}`);
			if (!res.ok) throw new Error('Failed to load users');
			const data = await res.json();
			users = data.users;
			totalItems = data.totalItems;
			totalPages = data.totalPages;
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function loadUserLimits(userId: string) {
		if (userLimitsCache.has(userId)) return;

		loadingLimits.add(userId);
		loadingLimits = new Set(loadingLimits);

		try {
			const res = await fetch(`/api/admin/users/${userId}/limits`);
			if (!res.ok) throw new Error('Failed to load user limits');
			const data = await res.json();

			userLimitsCache.set(userId, {
				limits: data.limits,
				endpointLimits: data.endpointLimits
			});
			userLimitsCache = new Map(userLimitsCache);

			// Store available endpoints and instance limits (same for all users)
			if (data.availableEndpoints) {
				availableEndpoints = data.availableEndpoints;
			}
			if (data.instanceLimits) {
				instanceLimits = data.instanceLimits;
			}

			// Initialize edit state
			initEditState(userId, data.limits, data.endpointLimits);
		} catch (e: any) {
			console.error('Failed to load user limits:', e);
		} finally {
			loadingLimits.delete(userId);
			loadingLimits = new Set(loadingLimits);
		}
	}

	function initEditState(userId: string, limits: UserLimits | null, endpointLimits: EndpointLimit[]) {
		// Create edit state with all available endpoints
		const allEndpointLimits = availableEndpoints.map(ep => {
			const existing = endpointLimits.find(el => el.endpoint === ep.id);
			return {
				endpoint: ep.id,
				endpointAlias: ep.alias,
				max_input_tokens_per_day: existing?.max_input_tokens_per_day ?? null,
				max_output_tokens_per_day: existing?.max_output_tokens_per_day ?? null
			};
		});

		editingLimits.set(userId, {
			limits: {
				max_concurrent_projects: limits?.max_concurrent_projects ?? null,
				max_parallel_requests: limits?.max_parallel_requests ?? null,
				max_requests_per_minute: limits?.max_requests_per_minute ?? null
			},
			endpointLimits: allEndpointLimits
		});
		editingLimits = new Map(editingLimits);
	}

	async function toggleExpand(user: User) {
		if (expandedUsers.has(user.id)) {
			expandedUsers.delete(user.id);
			expandedUsers = new Set(expandedUsers);
		} else {
			await loadUserLimits(user.id);
			expandedUsers.add(user.id);
			expandedUsers = new Set(expandedUsers);
		}
	}

	async function saveLimits(userId: string) {
		const editState = editingLimits.get(userId);
		if (!editState) return;

		savingLimits.add(userId);
		savingLimits = new Set(savingLimits);

		try {
			const res = await fetch(`/api/admin/users/${userId}/limits`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					limits: editState.limits,
					endpointLimits: editState.endpointLimits
				})
			});

			if (!res.ok) throw new Error('Failed to save limits');

			// Update cache with new values
			userLimitsCache.set(userId, {
				limits: editState.limits,
				endpointLimits: editState.endpointLimits.filter(
					el => el.max_input_tokens_per_day != null || el.max_output_tokens_per_day != null
				)
			});
			userLimitsCache = new Map(userLimitsCache);
		} catch (e: any) {
			error = e.message;
		} finally {
			savingLimits.delete(userId);
			savingLimits = new Set(savingLimits);
		}
	}

	function updateLimit(userId: string, field: keyof UserLimits, value: string) {
		const editState = editingLimits.get(userId);
		if (!editState) return;

		editState.limits[field] = value === '' ? null : parseInt(value, 10);
		editingLimits = new Map(editingLimits);
	}

	function updateEndpointLimit(
		userId: string,
		endpointId: string,
		field: 'max_input_tokens_per_day' | 'max_output_tokens_per_day',
		value: string
	) {
		const editState = editingLimits.get(userId);
		if (!editState) return;

		const epLimit = editState.endpointLimits.find(el => el.endpoint === endpointId);
		if (epLimit) {
			epLimit[field] = value === '' ? null : parseInt(value, 10);
			editingLimits = new Map(editingLimits);
		}
	}

	async function toggleAdmin(user: User) {
		if (user.is_admin) {
			if (!confirm(`Remove admin privileges from ${user.email}?`)) return;
		}

		try {
			const res = await fetch(`/api/admin/users/${user.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_admin: !user.is_admin })
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to update user');
			}

			await loadUsers();
		} catch (e: any) {
			error = e.message;
		}
	}

	async function deleteUser(user: User) {
		if (!confirm(`Delete user ${user.email}? This action cannot be undone.`)) return;

		try {
			const res = await fetch(`/api/admin/users/${user.id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to delete user');
			}

			await loadUsers();
		} catch (e: any) {
			error = e.message;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString();
	}

	function prevPage() {
		if (page > 1) {
			page--;
			loadUsers();
		}
	}

	function nextPage() {
		if (page < totalPages) {
			page++;
			loadUsers();
		}
	}

	function formatLimit(value: number | null | undefined): string {
		return value != null ? value.toString() : '';
	}

	onMount(() => {
		loadUsers();
	});
</script>

<div class="p-6 space-y-6">
	<div>
		<h2 class="text-2xl font-bold">User Management</h2>
		<p class="text-muted-foreground">Manage users, admin privileges, and per-user limits</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<Card.Root>
			<Card.Content class="pt-6">
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin" />
				</div>
			</Card.Content>
		</Card.Root>
	{:else if users.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-center text-muted-foreground py-8">No users found.</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-8"></Table.Head>
						<Table.Head>Email</Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head>Admin</Table.Head>
						<Table.Head>Limits</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each users as user}
						{@const isExpanded = expandedUsers.has(user.id)}
						{@const isLoadingLimits = loadingLimits.has(user.id)}
						{@const isSavingLimits = savingLimits.has(user.id)}
						{@const editState = editingLimits.get(user.id)}
						<!-- Main user row -->
						<Table.Row
							class="cursor-pointer hover:bg-accent/50 transition-colors"
							onclick={() => toggleExpand(user)}
						>
							<Table.Cell class="w-8 px-2">
								{#if isLoadingLimits}
									<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
								{:else}
									<ChevronRight class="h-4 w-4 text-muted-foreground transition-transform {isExpanded ? 'rotate-90' : ''}" />
								{/if}
							</Table.Cell>
							<Table.Cell class="font-medium">{user.email}</Table.Cell>
							<Table.Cell>{user.name || '-'}</Table.Cell>
							<Table.Cell>
								{#if user.verified}
									<Badge variant="secondary">verified</Badge>
								{:else}
									<Badge variant="outline">unverified</Badge>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{formatDate(user.created)}</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-2" onclick={(e) => e.stopPropagation()}>
									<Switch checked={user.is_admin} onCheckedChange={() => toggleAdmin(user)} />
									{#if user.is_admin}
										<Shield class="h-4 w-4 text-amber-500" />
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell onclick={(e) => e.stopPropagation()}>
								{#if editState}
									<div class="flex items-center gap-2">
										<div class="flex items-center gap-1">
											<span class="text-xs text-muted-foreground">Projects:</span>
											<Input
												type="number"
												class="w-16 h-7 text-xs"
												placeholder="-"
												value={formatLimit(editState.limits.max_concurrent_projects)}
												oninput={(e) => updateLimit(user.id, 'max_concurrent_projects', e.currentTarget.value)}
											/>
										</div>
										<div class="flex items-center gap-1">
											<span class="text-xs text-muted-foreground">Parallel:</span>
											<Input
												type="number"
												class="w-16 h-7 text-xs"
												placeholder="-"
												value={formatLimit(editState.limits.max_parallel_requests)}
												oninput={(e) => updateLimit(user.id, 'max_parallel_requests', e.currentTarget.value)}
											/>
										</div>
										<div class="flex items-center gap-1">
											<span class="text-xs text-muted-foreground">RPM:</span>
											<Input
												type="number"
												class="w-16 h-7 text-xs"
												placeholder="-"
												value={formatLimit(editState.limits.max_requests_per_minute)}
												oninput={(e) => updateLimit(user.id, 'max_requests_per_minute', e.currentTarget.value)}
											/>
										</div>
										<Button
											variant="ghost"
											size="sm"
											class="h-7 px-2"
											onclick={() => saveLimits(user.id)}
											disabled={isSavingLimits}
										>
											{#if isSavingLimits}
												<Loader2 class="h-3 w-3 animate-spin" />
											{:else}
												<Save class="h-3 w-3" />
											{/if}
										</Button>
									</div>
								{:else}
									<span class="text-xs text-muted-foreground">Click to expand</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-right" onclick={(e) => e.stopPropagation()}>
								<Button variant="ghost" size="icon" onclick={() => deleteUser(user)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							</Table.Cell>
						</Table.Row>

						<!-- Expanded endpoint limits row -->
						{#if isExpanded && editState && availableEndpoints.length > 0}
							<Table.Row class="bg-muted/30 border-l-2 border-l-primary/30">
								<Table.Cell colspan={8} class="py-4 px-6">
									<div class="space-y-3">
										<div class="flex items-center justify-between">
											<h4 class="text-sm font-medium">Endpoint Token Limits (per day)</h4>
											{#if instanceLimits}
												<span class="text-xs text-muted-foreground">
													Instance limits: {instanceLimits.maxConcurrentProjects} projects, {instanceLimits.maxParallelRequests} parallel, {instanceLimits.maxRequestsPerMinute} RPM
												</span>
											{/if}
										</div>
										<div class="rounded-md border">
											<Table.Root>
												<Table.Header>
													<Table.Row>
														<Table.Head>Endpoint</Table.Head>
														<Table.Head>Input Tokens/Day</Table.Head>
														<Table.Head>Output Tokens/Day</Table.Head>
													</Table.Row>
												</Table.Header>
												<Table.Body>
													{#each editState.endpointLimits as epLimit}
														<Table.Row>
															<Table.Cell class="font-mono text-sm">{epLimit.endpointAlias}</Table.Cell>
															<Table.Cell>
																<Input
																	type="number"
																	class="w-32 h-8"
																	placeholder="Unlimited"
																	value={formatLimit(epLimit.max_input_tokens_per_day)}
																	oninput={(e) => updateEndpointLimit(user.id, epLimit.endpoint, 'max_input_tokens_per_day', e.currentTarget.value)}
																/>
															</Table.Cell>
															<Table.Cell>
																<Input
																	type="number"
																	class="w-32 h-8"
																	placeholder="Unlimited"
																	value={formatLimit(epLimit.max_output_tokens_per_day)}
																	oninput={(e) => updateEndpointLimit(user.id, epLimit.endpoint, 'max_output_tokens_per_day', e.currentTarget.value)}
																/>
															</Table.Cell>
														</Table.Row>
													{/each}
												</Table.Body>
											</Table.Root>
										</div>
										<div class="flex justify-end">
											<Button
												size="sm"
												onclick={() => saveLimits(user.id)}
												disabled={isSavingLimits}
											>
												{#if isSavingLimits}
													<Loader2 class="h-4 w-4 mr-2 animate-spin" />
												{/if}
												Save All Limits
											</Button>
										</div>
									</div>
								</Table.Cell>
							</Table.Row>
						{:else if isExpanded && !isLoadingLimits && availableEndpoints.length === 0}
							<Table.Row class="bg-muted/30 border-l-2 border-l-primary/30">
								<Table.Cell colspan={8} class="text-center text-muted-foreground text-sm py-4">
									No predefined endpoints available. Add endpoints in the Endpoints tab.
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>

		{#if totalPages > 1}
			<div class="flex items-center justify-between">
				<p class="text-sm text-muted-foreground">
					Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, totalItems)} of {totalItems} users
				</p>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={prevPage} disabled={page <= 1}>
						<ChevronLeft class="h-4 w-4 mr-1" />
						Previous
					</Button>
					<Button variant="outline" size="sm" onclick={nextPage} disabled={page >= totalPages}>
						Next
						<ChevronRight class="h-4 w-4 ml-1" />
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
