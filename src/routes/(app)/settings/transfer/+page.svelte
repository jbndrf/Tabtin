<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import { Download, Upload, Loader2, CheckCircle, AlertTriangle, Lock } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// State
	let selectedProjectId = $state<string>('');
	let isExporting = $state(false);
	let isImporting = $state(false);
	let importFile = $state<File | null>(null);
	let importResult = $state<{
		success: boolean;
		projectId?: string;
		stats?: { batches: number; images: number; extractionRows: number };
		warnings?: string[];
	} | null>(null);

	// Get selected project for display
	const selectedProject = $derived(data.projects.find((p) => p.id === selectedProjectId));

	// Export handler
	async function handleExport() {
		if (!selectedProjectId) {
			toast.error('Please select a project to export');
			return;
		}

		isExporting = true;
		try {
			const response = await fetch(`/api/projects/${selectedProjectId}/export`);

			if (!response.ok) {
				const error = await response.json().catch(() => ({ message: 'Export failed' }));
				throw new Error(error.message || 'Export failed');
			}

			const blob = await response.blob();
			const filename =
				response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
				'project.tabtin';

			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);

			toast.success('Project exported successfully');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to export project');
		} finally {
			isExporting = false;
		}
	}

	// Import handler
	async function handleImport() {
		if (!importFile) {
			toast.error('Please select a .tabtin file');
			return;
		}

		isImporting = true;
		importResult = null;

		try {
			const formData = new FormData();
			formData.append('file', importFile);

			const response = await fetch('/api/projects/import', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.message || result.error || 'Import failed');
			}

			importResult = result;
			toast.success('Project imported successfully');

			// Clear file input
			importFile = null;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Import failed');
		} finally {
			isImporting = false;
		}
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		importFile = target.files?.[0] || null;
		importResult = null;
	}
</script>

<div class="flex flex-col gap-6 p-4">
	<div>
		<h2 class="text-2xl font-bold tracking-tight">Project Transfer</h2>
		<p class="text-muted-foreground">Export and import projects between instances</p>
	</div>

	{#if !data.featureEnabled}
		<Card class="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
			<CardContent class="flex items-center gap-4 pt-6">
				<Lock class="h-8 w-8 text-amber-600" />
				<div>
					<p class="font-medium text-amber-800 dark:text-amber-200">Feature Disabled</p>
					<p class="text-sm text-amber-700 dark:text-amber-300">
						Import/Export is disabled on this instance. Set <code class="rounded bg-amber-200 px-1 dark:bg-amber-800">ALLOW_IMPORT_EXPORT=true</code> environment variable to enable.
					</p>
				</div>
			</CardContent>
		</Card>
	{:else}
		<div class="grid gap-6 md:grid-cols-2">
			<!-- Export Card -->
			<Card>
				<CardHeader>
					<div class="flex items-center gap-3">
						<Download class="h-5 w-5 text-primary" />
						<div>
							<CardTitle class="text-base">Export Project</CardTitle>
							<CardDescription>Download a complete project backup</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent class="space-y-4">
					<Select.Root
						type="single"
						onValueChange={(v) => (selectedProjectId = v)}
					>
						<Select.Trigger class="w-full">
							{#if selectedProject}
								{selectedProject.name}
							{:else}
								<span class="text-muted-foreground">Select a project...</span>
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#each data.projects as project}
								<Select.Item value={project.id}>{project.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>

					<Button onclick={handleExport} disabled={!selectedProjectId || isExporting} class="w-full">
						{#if isExporting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Exporting...
						{:else}
							<Download class="mr-2 h-4 w-4" />
							Export Project
						{/if}
					</Button>

					<p class="text-xs text-muted-foreground">
						Includes all settings, images, batches, and extraction results.
					</p>
				</CardContent>
			</Card>

			<!-- Import Card -->
			<Card>
				<CardHeader>
					<div class="flex items-center gap-3">
						<Upload class="h-5 w-5 text-primary" />
						<div>
							<CardTitle class="text-base">Import Project</CardTitle>
							<CardDescription>Restore from a .tabtin file</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent class="space-y-4">
					<Input
						type="file"
						accept=".tabtin,.zip"
						onchange={handleFileChange}
						disabled={isImporting}
					/>

					<Button onclick={handleImport} disabled={!importFile || isImporting} class="w-full">
						{#if isImporting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Importing...
						{:else}
							<Upload class="mr-2 h-4 w-4" />
							Import Project
						{/if}
					</Button>

					{#if importResult?.success}
						<div class="rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950">
							<div class="flex items-center gap-2 text-green-700 dark:text-green-300">
								<CheckCircle class="h-4 w-4" />
								<span>
									Imported: {importResult.stats?.batches} batches, {importResult.stats?.images} images, {importResult.stats?.extractionRows} rows
								</span>
							</div>
							{#if importResult.warnings?.length}
								<ul class="mt-2 space-y-1 text-amber-600 dark:text-amber-400">
									{#each importResult.warnings as warning}
										<li class="flex items-start gap-1">
											<AlertTriangle class="mt-0.5 h-3 w-3 shrink-0" />
											{warning}
										</li>
									{/each}
								</ul>
							{/if}
							<Button
								variant="link"
								class="mt-2 h-auto p-0 text-primary"
								onclick={() => goto(`/projects/${importResult?.projectId}`)}
							>
								Open imported project
							</Button>
						</div>
					{/if}

					<p class="text-xs text-muted-foreground">
						You may need to reconfigure LLM endpoints after import.
					</p>
				</CardContent>
			</Card>
		</div>
	{/if}
</div>
