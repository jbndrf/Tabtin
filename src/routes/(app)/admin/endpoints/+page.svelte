<script lang="ts">
	import { onMount } from 'svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import Plus from 'lucide-svelte/icons/plus';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import { Check, ChevronsUpDown } from 'lucide-svelte';

	interface LlmEndpoint {
		id: string;
		alias: string;
		endpoint_url: string;
		api_key: string;
		model_name: string;
		max_input_tokens_per_day: number;
		max_output_tokens_per_day: number;
		default_temperature?: number;
		default_top_p?: number;
		default_top_k?: number;
		is_enabled: boolean;
		is_predefined: boolean;
		description?: string;
	}

	let endpoints: LlmEndpoint[] = $state([]);
	let loading = $state(true);
	let syncing = $state(false);
	let error = $state<string | null>(null);

	// Dialog state
	let dialogOpen = $state(false);
	let editing = $state<LlmEndpoint | null>(null);
	let saving = $state(false);

	// Form state
	let formAlias = $state('');
	let formEndpointUrl = $state('');
	let formApiKey = $state('');
	let formModelName = $state('');
	let formMaxInputTokens = $state(100000);
	let formMaxOutputTokens = $state(50000);
	let formTemperature = $state(0.7);
	let formDescription = $state('');
	let formIsEnabled = $state(true);

	// Model fetching state
	let availableModels = $state<Array<{ id: string; name?: string }>>([]);
	let fetchingModels = $state(false);
	let modelComboboxOpen = $state(false);

	async function loadEndpoints() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/admin/endpoints');
			if (!res.ok) throw new Error('Failed to load endpoints');
			const data = await res.json();
			endpoints = data.endpoints;
		} catch (e: any) {
			error = e.message;
		} finally {
			loading = false;
		}
	}

	async function syncPredefined() {
		syncing = true;
		error = null;
		try {
			const res = await fetch('/api/admin/endpoints/sync', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to sync endpoints');
			await loadEndpoints();
		} catch (e: any) {
			error = e.message;
		} finally {
			syncing = false;
		}
	}

	function openCreate() {
		editing = null;
		formAlias = '';
		formEndpointUrl = '';
		formApiKey = '';
		formModelName = '';
		formMaxInputTokens = 100000;
		formMaxOutputTokens = 50000;
		formTemperature = 0.7;
		formDescription = '';
		formIsEnabled = true;
		availableModels = [];
		modelComboboxOpen = false;
		dialogOpen = true;
	}

	function openEdit(endpoint: LlmEndpoint) {
		editing = endpoint;
		formAlias = endpoint.alias;
		formEndpointUrl = endpoint.endpoint_url;
		formApiKey = endpoint.api_key;
		formModelName = endpoint.model_name;
		formMaxInputTokens = endpoint.max_input_tokens_per_day;
		formMaxOutputTokens = endpoint.max_output_tokens_per_day;
		formTemperature = endpoint.default_temperature ?? 0.7;
		formDescription = endpoint.description ?? '';
		formIsEnabled = endpoint.is_enabled;
		availableModels = [];
		modelComboboxOpen = false;
		dialogOpen = true;
	}

	async function saveEndpoint() {
		saving = true;
		error = null;
		try {
			const body = {
				alias: formAlias,
				endpoint_url: formEndpointUrl,
				api_key: formApiKey,
				model_name: formModelName,
				max_input_tokens_per_day: formMaxInputTokens,
				max_output_tokens_per_day: formMaxOutputTokens,
				default_temperature: formTemperature,
				description: formDescription,
				is_enabled: formIsEnabled
			};

			const url = editing ? `/api/admin/endpoints/${editing.id}` : '/api/admin/endpoints';
			const method = editing ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to save endpoint');
			}

			dialogOpen = false;
			await loadEndpoints();
		} catch (e: any) {
			error = e.message;
		} finally {
			saving = false;
		}
	}

	async function deleteEndpoint(endpoint: LlmEndpoint) {
		if (!confirm(`Delete endpoint "${endpoint.alias}"?`)) return;

		try {
			const res = await fetch(`/api/admin/endpoints/${endpoint.id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to delete endpoint');
			}

			await loadEndpoints();
		} catch (e: any) {
			error = e.message;
		}
	}

	async function toggleEnabled(endpoint: LlmEndpoint) {
		try {
			const res = await fetch(`/api/admin/endpoints/${endpoint.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ is_enabled: !endpoint.is_enabled })
			});

			if (!res.ok) throw new Error('Failed to update endpoint');
			await loadEndpoints();
		} catch (e: any) {
			error = e.message;
		}
	}

	function formatNumber(num: number): string {
		if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
		if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
		return num.toString();
	}

	async function fetchModels() {
		if (!formEndpointUrl) {
			error = 'Please enter an endpoint URL first';
			return;
		}

		fetchingModels = true;
		error = null;
		try {
			const response = await fetch('/api/proxy-models', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					endpoint: formEndpointUrl,
					apiKey: formApiKey
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.error || `Failed to fetch models: ${response.statusText}`);
			}

			const data = await response.json();

			if (data.data && Array.isArray(data.data)) {
				availableModels = data.data;
				if (availableModels.length > 0 && !formModelName) {
					formModelName = availableModels[0].id;
				}
			} else {
				error = 'Unexpected response format from endpoint';
			}
		} catch (e: any) {
			error = e.message;
		} finally {
			fetchingModels = false;
		}
	}

	onMount(() => {
		loadEndpoints();
	});
</script>

<div class="p-6 space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold">LLM Endpoints</h2>
			<p class="text-muted-foreground">Manage API endpoints for LLM processing</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={syncPredefined} disabled={syncing}>
				<RefreshCw class="h-4 w-4 mr-2 {syncing ? 'animate-spin' : ''}" />
				Sync Predefined
			</Button>
			<Button onclick={openCreate}>
				<Plus class="h-4 w-4 mr-2" />
				Add Endpoint
			</Button>
		</div>
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
	{:else if endpoints.length === 0}
		<Card.Root>
			<Card.Content class="pt-6">
				<p class="text-center text-muted-foreground py-8">
					No endpoints configured. Click "Add Endpoint" to create one, or "Sync Predefined" to load endpoints from environment.
				</p>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Model</Table.Head>
						<Table.Head>Daily Limits</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each endpoints as endpoint}
						<Table.Row>
							<Table.Cell>
								<div class="flex items-center gap-2">
									<span class="font-medium">{endpoint.alias}</span>
									{#if endpoint.is_predefined}
										<Badge variant="secondary" class="text-xs">predefined</Badge>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="font-mono text-sm">{endpoint.model_name}</Table.Cell>
							<Table.Cell class="text-sm">
								<span class="text-muted-foreground">In:</span> {formatNumber(endpoint.max_input_tokens_per_day)}
								<span class="mx-1">/</span>
								<span class="text-muted-foreground">Out:</span> {formatNumber(endpoint.max_output_tokens_per_day)}
							</Table.Cell>
							<Table.Cell>
								<Switch
									checked={endpoint.is_enabled}
									onCheckedChange={() => toggleEnabled(endpoint)}
								/>
							</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex justify-end gap-1">
									<Button variant="ghost" size="icon" onclick={() => openEdit(endpoint)}>
										<Pencil class="h-4 w-4" />
									</Button>
									{#if !endpoint.is_predefined}
										<Button variant="ghost" size="icon" onclick={() => deleteEndpoint(endpoint)}>
											<Trash2 class="h-4 w-4" />
										</Button>
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Root>
	{/if}
</div>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Edit Endpoint' : 'Add Endpoint'}</Dialog.Title>
			<Dialog.Description>
				{#if editing?.is_predefined}
					This endpoint is managed by the instance hoster. You can toggle its enabled status and edit its description.
				{:else}
					Configure the LLM endpoint settings.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid gap-4 py-4">
			<div class="grid gap-2">
				<Label for="alias">Name</Label>
				<Input
					id="alias"
					bind:value={formAlias}
					placeholder="My OpenAI Endpoint"
					disabled={editing?.is_predefined}
				/>
			</div>

			{#if !editing?.is_predefined}
				<div class="grid gap-2">
					<Label for="endpoint-url">Endpoint URL</Label>
					<Input
						id="endpoint-url"
						bind:value={formEndpointUrl}
						placeholder="https://api.openai.com/v1/chat/completions"
					/>
				</div>

				<div class="grid gap-2">
					<Label for="api-key">API Key</Label>
					<Input
						id="api-key"
						type="password"
						bind:value={formApiKey}
						placeholder="sk-..."
					/>
				</div>

				<div class="grid gap-2">
					<Label for="model-name">Model Name</Label>
					<div class="flex gap-2">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={!formEndpointUrl || fetchingModels}
							onclick={fetchModels}
						>
							{#if fetchingModels}
								<Loader2 class="h-4 w-4 mr-1 animate-spin" />
							{/if}
							{fetchingModels ? 'Fetching...' : 'Fetch Models'}
						</Button>
						{#if availableModels.length > 0}
							<Popover.Root bind:open={modelComboboxOpen}>
								<Popover.Trigger asChild>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											role="combobox"
											aria-expanded={modelComboboxOpen}
											class="flex-1 justify-between"
										>
											<span class="truncate">
												{formModelName
													? availableModels.find((m) => m.id === formModelName)?.name || formModelName
													: 'Select model...'}
											</span>
											<ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
										</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-full p-0" align="start">
									<Command.Root>
										<Command.Input placeholder="Search models..." />
										<Command.List>
											<Command.Empty>No model found.</Command.Empty>
											<Command.Group>
												{#each availableModels as model}
													<Command.Item
														value={model.id}
														onSelect={() => {
															formModelName = model.id;
															modelComboboxOpen = false;
														}}
													>
														<Check
															class="mr-2 h-4 w-4 {formModelName === model.id ? 'opacity-100' : 'opacity-0'}"
														/>
														{model.name || model.id}
													</Command.Item>
												{/each}
											</Command.Group>
										</Command.List>
									</Command.Root>
								</Popover.Content>
							</Popover.Root>
						{:else}
							<Input
								id="model-name"
								bind:value={formModelName}
								placeholder="gpt-4o"
								class="flex-1"
							/>
						{/if}
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="max-input">Max Input Tokens/Day</Label>
						<Input
							id="max-input"
							type="number"
							bind:value={formMaxInputTokens}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="max-output">Max Output Tokens/Day</Label>
						<Input
							id="max-output"
							type="number"
							bind:value={formMaxOutputTokens}
						/>
					</div>
				</div>
			{/if}

			<div class="grid gap-2">
				<Label for="description">Description</Label>
				<Input id="description" bind:value={formDescription} placeholder="Optional description" />
			</div>

			<div class="flex items-center justify-between">
				<Label for="enabled">Enabled</Label>
				<Switch id="enabled" bind:checked={formIsEnabled} />
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
			<Button onclick={saveEndpoint} disabled={saving}>
				{#if saving}
					<Loader2 class="h-4 w-4 mr-2 animate-spin" />
				{/if}
				Save
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
