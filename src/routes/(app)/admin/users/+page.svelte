<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Shield from 'lucide-svelte/icons/shield';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';

	interface User {
		id: string;
		email: string;
		name?: string;
		is_admin: boolean;
		verified: boolean;
		created: string;
	}

	let users: User[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let page = $state(1);
	let perPage = $state(50);
	let totalItems = $state(0);
	let totalPages = $state(0);

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

	onMount(() => {
		loadUsers();
	});
</script>

<div class="p-6 space-y-6">
	<div>
		<h2 class="text-2xl font-bold">User Management</h2>
		<p class="text-muted-foreground">Manage users and admin privileges</p>
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
						<Table.Head>Email</Table.Head>
						<Table.Head>Name</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head>Created</Table.Head>
						<Table.Head>Admin</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each users as user}
						<Table.Row>
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
								<div class="flex items-center gap-2">
									<Switch checked={user.is_admin} onCheckedChange={() => toggleAdmin(user)} />
									{#if user.is_admin}
										<Shield class="h-4 w-4 text-amber-500" />
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="text-right">
								<Button variant="ghost" size="icon" onclick={() => deleteUser(user)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							</Table.Cell>
						</Table.Row>
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
