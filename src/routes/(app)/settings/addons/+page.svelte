<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toast } from 'svelte-sonner';
	import {
		Package,
		Plus,
		Play,
		Square,
		Trash2,
		Settings,
		RefreshCw,
		Terminal,
		Download
	} from 'lucide-svelte';
	import {
		installedAddons,
		fetchAddons,
		installAddon,
		startAddon,
		stopAddon,
		uninstallAddon,
		getAddonLogs,
		updateAddonConfig
	} from '$lib/stores/addons';
	import type { InstalledAddon, AddonContainerStatus } from '$lib/types/addon';
	import type { PageData } from './$types';

	interface AvailableAddon {
		id: string;
		name: string;
		description?: string;
		version?: string;
		dockerImage: string;
		hasManifest: boolean;
	}

	let { data }: { data: PageData } = $props();

	// Available addons from local directory
	let availableAddons = $state<AvailableAddon[]>([]);
	let loadingAvailable = $state(false);

	// Initialize store with server data
	onMount(async () => {
		// Skip initialization if addons are disabled
		if (!data.addonsEnabled) return;

		if (data.addons) {
			installedAddons.set(data.addons);
		}
		await loadAvailableAddons();
	});

	// Load available addons from local directory
	async function loadAvailableAddons() {
		loadingAvailable = true;
		try {
			const response = await fetch('/api/addons/available');
			const result = await response.json();
			if (result.success) {
				availableAddons = result.data;
			}
		} catch (error) {
			console.error('Failed to load available addons:', error);
		} finally {
			loadingAvailable = false;
		}
	}

	// Check if addon is already installed
	function isInstalled(dockerImage: string): boolean {
		return $installedAddons.some(a => a.docker_image === dockerImage);
	}

	// Dialog states
	let installDialogOpen = $state(false);
	let logsDialogOpen = $state(false);
	let uninstallDialogOpen = $state(false);
	let configDialogOpen = $state(false);

	// Form states
	let installing = $state(false);
	let selectedAddon = $state<InstalledAddon | null>(null);
	let logs = $state('');
	let loadingLogs = $state(false);
	let actionLoading = $state<string | null>(null);
	let configValues = $state<Record<string, string | number | boolean>>({});
	let savingConfig = $state(false);

	// Status badge variant
	function getStatusVariant(status: AddonContainerStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
		switch (status) {
			case 'running':
				return 'default';
			case 'stopped':
				return 'secondary';
			case 'failed':
				return 'destructive';
			default:
				return 'outline';
		}
	}

	// Status display text
	function getStatusText(status: AddonContainerStatus): string {
		switch (status) {
			case 'running':
				return 'Running';
			case 'stopped':
				return 'Stopped';
			case 'failed':
				return 'Failed';
			case 'building':
				return 'Building...';
			case 'starting':
				return 'Starting...';
			case 'pending':
				return 'Pending';
			default:
				return status;
		}
	}

	// Install from available addon
	async function handleInstallAvailable(addon: AvailableAddon) {
		installing = true;
		try {
			const installed = await installAddon(addon.dockerImage);
			toast.success(`Addon "${installed.name}" installed successfully`);
			installDialogOpen = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Installation failed');
		} finally {
			installing = false;
		}
	}

	// Handle start
	async function handleStart(addon: InstalledAddon) {
		actionLoading = addon.id;
		try {
			await startAddon(addon.id);
			toast.success(`Addon "${addon.name}" started`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to start addon');
		} finally {
			actionLoading = null;
		}
	}

	// Handle stop
	async function handleStop(addon: InstalledAddon) {
		actionLoading = addon.id;
		try {
			await stopAddon(addon.id);
			toast.success(`Addon "${addon.name}" stopped`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to stop addon');
		} finally {
			actionLoading = null;
		}
	}

	// Handle uninstall
	async function handleUninstall() {
		if (!selectedAddon) return;

		actionLoading = selectedAddon.id;
		try {
			await uninstallAddon(selectedAddon.id);
			toast.success(`Addon "${selectedAddon.name}" uninstalled`);
			uninstallDialogOpen = false;
			selectedAddon = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to uninstall addon');
		} finally {
			actionLoading = null;
		}
	}

	// Show logs
	async function showLogs(addon: InstalledAddon) {
		selectedAddon = addon;
		logsDialogOpen = true;
		loadingLogs = true;
		logs = '';

		try {
			logs = await getAddonLogs(addon.id, 200);
		} catch (error) {
			logs = `Error loading logs: ${error instanceof Error ? error.message : 'Unknown error'}`;
		} finally {
			loadingLogs = false;
		}
	}

	// Refresh addons
	async function handleRefresh() {
		await fetchAddons();
		toast.success('Addons refreshed');
	}

	// Confirm uninstall
	function confirmUninstall(addon: InstalledAddon) {
		selectedAddon = addon;
		uninstallDialogOpen = true;
	}

	// Open config dialog
	function openConfigDialog(addon: InstalledAddon) {
		selectedAddon = addon;
		// Initialize config values from current addon config
		const existingConfig = addon.config as Record<string, string | number | boolean> | undefined;
		configValues = existingConfig ? { ...existingConfig } : {};
		configDialogOpen = true;
	}

	// Save config
	async function handleSaveConfig() {
		if (!selectedAddon) return;

		savingConfig = true;
		try {
			await updateAddonConfig(selectedAddon.id, configValues);
			toast.success('Configuration saved');
			configDialogOpen = false;

			// If addon is running, notify user they may need to restart
			if (selectedAddon.container_status === 'running') {
				toast.info('Restart the addon to apply configuration changes');
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save configuration');
		} finally {
			savingConfig = false;
		}
	}

	// Get config schema for selected addon
	function getConfigSchema() {
		return selectedAddon?.manifest?.config_schema || {};
	}
</script>

<div class="flex flex-col gap-4 p-4">
	<!-- Disabled State -->
	{#if !data.addonsEnabled}
		<div class="flex flex-col gap-2">
			<h2 class="text-2xl font-bold tracking-tight">Addons</h2>
			<p class="text-muted-foreground">Docker-based addon system</p>
		</div>
		<Card class="border-dashed">
			<CardContent class="flex flex-col items-center justify-center py-12">
				<Package class="text-muted-foreground mb-4 h-12 w-12" />
				<h3 class="text-lg font-medium">Addons Disabled</h3>
				<p class="text-muted-foreground mb-2 text-center max-w-md">
					The addon system is disabled on this hosted instance.
				</p>
				<p class="text-muted-foreground text-center text-sm max-w-md">
					Self-hosted deployments can enable addons by setting <code class="bg-muted px-1 rounded">ADDONS_ENABLED=true</code> and mounting the Docker socket.
				</p>
			</CardContent>
		</Card>
	{:else}
	<!-- Header -->
	<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
		<div>
			<h2 class="text-2xl font-bold tracking-tight">Addons</h2>
			<p class="text-muted-foreground">Manage installed Docker-based addons</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={handleRefresh}>
				<RefreshCw class="mr-2 h-4 w-4" />
				Refresh
			</Button>
			<Button onclick={() => (installDialogOpen = true)}>
				<Plus class="mr-2 h-4 w-4" />
				Install Addon
			</Button>
		</div>
	</div>

	<!-- Error message -->
	{#if data.error}
		<Card class="border-destructive">
			<CardContent class="pt-6">
				<p class="text-destructive">{data.error}</p>
			</CardContent>
		</Card>
	{/if}

	<!-- Addons list -->
	{#if $installedAddons.length === 0}
		<Card class="border-dashed">
			<CardContent class="flex flex-col items-center justify-center py-12">
				<Package class="text-muted-foreground mb-4 h-12 w-12" />
				<h3 class="text-lg font-medium">No addons installed</h3>
				<p class="text-muted-foreground mb-4 text-center">
					Install Docker-based addons to extend Tabtin's functionality
				</p>
				<Button onclick={() => (installDialogOpen = true)}>
					<Plus class="mr-2 h-4 w-4" />
					Install your first addon
				</Button>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{#each $installedAddons as addon (addon.id)}
				<Card>
					<CardHeader class="pb-3">
						<div class="flex items-start justify-between">
							<div>
								<CardTitle class="text-lg">{addon.name}</CardTitle>
								<CardDescription class="text-xs">
									{addon.docker_image}
								</CardDescription>
							</div>
							<Badge variant={getStatusVariant(addon.container_status)}>
								{getStatusText(addon.container_status)}
							</Badge>
						</div>
					</CardHeader>
					<CardContent>
						{#if addon.manifest?.description}
							<p class="text-muted-foreground mb-4 text-sm">
								{addon.manifest.description}
							</p>
						{/if}

						{#if addon.error_message}
							<p class="mb-4 text-sm text-red-500">
								{addon.error_message}
							</p>
						{/if}

						<div class="flex flex-wrap gap-2">
							{#if addon.container_status === 'running'}
								<Button
									variant="outline"
									size="sm"
									onclick={() => handleStop(addon)}
									disabled={actionLoading === addon.id}
								>
									{#if actionLoading === addon.id}
										<Spinner class="mr-2 h-4 w-4" />
									{:else}
										<Square class="mr-2 h-4 w-4" />
									{/if}
									Stop
								</Button>
							{:else if addon.container_status === 'stopped' || addon.container_status === 'failed'}
								<Button
									variant="outline"
									size="sm"
									onclick={() => handleStart(addon)}
									disabled={actionLoading === addon.id}
								>
									{#if actionLoading === addon.id}
										<Spinner class="mr-2 h-4 w-4" />
									{:else}
										<Play class="mr-2 h-4 w-4" />
									{/if}
									Start
								</Button>
							{:else}
								<Button variant="outline" size="sm" disabled>
									<Spinner class="mr-2 h-4 w-4" />
									{getStatusText(addon.container_status)}
								</Button>
							{/if}

							<Button variant="ghost" size="sm" onclick={() => showLogs(addon)}>
								<Terminal class="mr-2 h-4 w-4" />
								Logs
							</Button>

							{#if addon.manifest?.config_schema && Object.keys(addon.manifest.config_schema).length > 0}
								<Button variant="ghost" size="sm" onclick={() => openConfigDialog(addon)}>
									<Settings class="mr-2 h-4 w-4" />
									Configure
								</Button>
							{/if}

							<Button
								variant="ghost"
								size="sm"
								class="text-destructive hover:text-destructive"
								onclick={() => confirmUninstall(addon)}
							>
								<Trash2 class="mr-2 h-4 w-4" />
								Uninstall
							</Button>
						</div>
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
	{/if}
</div>

<!-- Install Dialog -->
<Dialog.Root bind:open={installDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Install Addon</Dialog.Title>
			<Dialog.Description>
				Choose an addon from the addons directory to install
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			{#if loadingAvailable}
				<div class="flex items-center justify-center py-8">
					<Spinner class="h-6 w-6" />
				</div>
			{:else if availableAddons.length === 0}
				<div class="text-center py-8">
					<Package class="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
					<p class="text-muted-foreground">No addons found in addons/ directory</p>
					<p class="text-xs text-muted-foreground mt-2">
						Add addon folders with a Dockerfile to make them available
					</p>
				</div>
			{:else}
				<div class="grid gap-3 max-h-[400px] overflow-y-auto">
					{#each availableAddons as addon (addon.id)}
						{@const installed = isInstalled(addon.dockerImage)}
						<Card class="relative {installed ? 'opacity-60' : ''}">
							<CardContent class="flex items-center justify-between p-4">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<h4 class="font-medium truncate">{addon.name}</h4>
										{#if addon.version}
											<Badge variant="outline" class="text-xs">v{addon.version}</Badge>
										{/if}
									</div>
									{#if addon.description}
										<p class="text-sm text-muted-foreground truncate mt-1">
											{addon.description}
										</p>
									{/if}
								</div>
								<div class="ml-4">
									{#if installed}
										<Badge variant="secondary">Installed</Badge>
									{:else}
										<Button
											size="sm"
											onclick={() => handleInstallAvailable(addon)}
											disabled={installing}
										>
											{#if installing}
												<Spinner class="mr-2 h-4 w-4" />
											{:else}
												<Download class="mr-2 h-4 w-4" />
											{/if}
											Install
										</Button>
									{/if}
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (installDialogOpen = false)} disabled={installing}>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Logs Dialog -->
<Dialog.Root bind:open={logsDialogOpen}>
	<Dialog.Content class="max-h-[80vh] sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>
				{selectedAddon?.name} - Logs
			</Dialog.Title>
		</Dialog.Header>
		<div class="max-h-[50vh] overflow-auto rounded bg-black p-4">
			{#if loadingLogs}
				<div class="flex items-center justify-center py-8">
					<Spinner class="h-6 w-6 text-white" />
				</div>
			{:else}
				<pre class="text-xs text-green-400 whitespace-pre-wrap">{logs || 'No logs available'}</pre>
			{/if}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (logsDialogOpen = false)}>
				Close
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Uninstall Confirmation -->
<AlertDialog.Root bind:open={uninstallDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Uninstall {selectedAddon?.name}?</AlertDialog.Title>
			<AlertDialog.Description>
				This will stop the addon container and remove all its data. This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={actionLoading !== null}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				onclick={handleUninstall}
				disabled={actionLoading !== null}
			>
				{#if actionLoading}
					<Spinner class="mr-2 h-4 w-4" />
				{/if}
				Uninstall
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Configuration Dialog -->
<Dialog.Root bind:open={configDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Configure {selectedAddon?.name}</Dialog.Title>
			<Dialog.Description>
				{#if selectedAddon?.manifest?.description}
					{selectedAddon.manifest.description}
				{:else}
					Configure addon settings
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-4">
			{#each Object.entries(getConfigSchema()) as [key, field]}
				<div class="grid gap-2">
					<Label for={`config-${key}`}>
						{field.title}
						{#if field.required}
							<span class="text-destructive">*</span>
						{/if}
					</Label>
					{#if field.type === 'boolean'}
						<div class="flex items-center gap-2">
							<input
								id={`config-${key}`}
								type="checkbox"
								class="h-4 w-4"
								checked={!!configValues[key]}
								onchange={(e) => configValues[key] = (e.target as HTMLInputElement).checked}
								disabled={savingConfig}
							/>
							{#if field.description}
								<span class="text-muted-foreground text-sm">{field.description}</span>
							{/if}
						</div>
					{:else if field.type === 'select' && field.options}
						<select
							id={`config-${key}`}
							class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
							value={configValues[key] ?? field.default ?? ''}
							onchange={(e) => configValues[key] = (e.target as HTMLSelectElement).value}
							disabled={savingConfig}
						>
							<option value="">Select...</option>
							{#each field.options as option}
								<option value={option}>{option}</option>
							{/each}
						</select>
						{#if field.description}
							<p class="text-muted-foreground text-xs">{field.description}</p>
						{/if}
					{:else if field.type === 'number'}
						<Input
							id={`config-${key}`}
							type="number"
							placeholder={field.title}
							value={configValues[key] ?? field.default ?? ''}
							oninput={(e) => configValues[key] = Number((e.target as HTMLInputElement).value)}
							disabled={savingConfig}
						/>
						{#if field.description}
							<p class="text-muted-foreground text-xs">{field.description}</p>
						{/if}
					{:else}
						<Input
							id={`config-${key}`}
							type={field.secret ? 'password' : 'text'}
							placeholder={field.title}
							value={configValues[key] ?? field.default ?? ''}
							oninput={(e) => configValues[key] = (e.target as HTMLInputElement).value}
							disabled={savingConfig}
						/>
						{#if field.description}
							<p class="text-muted-foreground text-xs">{field.description}</p>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (configDialogOpen = false)} disabled={savingConfig}>
				Cancel
			</Button>
			<Button onclick={handleSaveConfig} disabled={savingConfig}>
				{#if savingConfig}
					<Spinner class="mr-2 h-4 w-4" />
					Saving...
				{:else}
					Save Configuration
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
