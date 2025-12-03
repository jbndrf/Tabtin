<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import { Loader2, X, Plus, Camera } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, projectBatches, projectStats, isProjectLoading, type BatchWithData } from '$lib/stores/project-data';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/utils/toast';

	// Camera input reference
	let cameraInput: HTMLInputElement;

	// Helper to convert file to base64
	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	// Handle camera capture on projects page
	async function handleCameraCapture(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.length) {
			try {
				// Convert files to base64 for sessionStorage
				const filesData = await Promise.all(
					Array.from(input.files).map(async (file) => ({
						name: file.name,
						type: file.type,
						data: await fileToBase64(file)
					}))
				);
				sessionStorage.setItem('pendingImages', JSON.stringify(filesData));
				goto(`/projects/${data.projectId}/images/add?fromCamera=true`);
			} catch (error) {
				console.error('Failed to process camera capture:', error);
				toast.error('Failed to process captured image');
			}
			// Reset input
			input.value = '';
		}
	}

	interface ColumnDefinition {
		id: string;
		name: string;
		type: string;
		description?: string;
	}

	let { data }: { data: PageData } = $props();

	let columns = $state<ColumnDefinition[]>([]);
	let tableScrollContainer: HTMLDivElement | undefined = $state();

	// Status color schemes with transparent backgrounds
	function getStatusColors(status: string): string {
		switch(status) {
			case 'pending': return 'bg-gray-500/10';
			case 'processing': return 'bg-blue-500/10';
			case 'review': return 'bg-yellow-500/10';
			case 'approved': return 'bg-green-500/10';
			case 'failed': return 'bg-red-500/10';
			default: return 'bg-gray-500/10';
		}
	}

	function getStatusBadgeColor(status: string): string {
		switch(status) {
			case 'pending': return 'bg-gray-500 text-white';
			case 'processing': return 'bg-blue-500 text-white';
			case 'review': return 'bg-yellow-500 text-white';
			case 'approved': return 'bg-green-500 text-white';
			case 'failed': return 'bg-red-500 text-white';
			default: return 'bg-gray-500 text-white';
		}
	}

	function getValueForColumn(batch: BatchWithData, columnId: string): string {
		if (!batch.processed_data) return '';
		const extraction = batch.processed_data.extractions?.find(e => e.column_id === columnId);
		return extraction?.value ?? '';
	}

	async function loadProjectData(projectId: string) {
		try {
			// Load project data from store (force reload when projectId changes)
			await projectData.loadProject(projectId, $currentUser?.id || '', true);

			if ($currentProject?.settings?.columns) {
				columns = $currentProject.settings.columns;
			}

			// Load pending batches and enqueue them for automatic processing
			const pendingBatches = await pb.collection('image_batches').getFullList({
				filter: `project = "${projectId}" && status = "pending"`,
				sort: '+id'
			});

			if (pendingBatches.length > 0) {
				await fetch('/api/queue/enqueue', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						batchIds: pendingBatches.map(b => b.id),
						projectId: projectId,
						priority: 10
					})
				});
			}

			// Scroll table to bottom after content is loaded
			setTimeout(() => {
				if (tableScrollContainer) {
					tableScrollContainer.scrollTop = tableScrollContainer.scrollHeight;
				}
			}, 100);
		} catch (error) {
			console.error('Failed to load project:', error);
			toast.error('Failed to load project data');
		}
	}

	// React to projectId changes (handles both initial load and navigation between projects)
	$effect(() => {
		const projectId = data.projectId;
		if (projectId && $currentUser?.id) {
			loadProjectData(projectId);
		}
	});

	async function cancelProcessing() {
		try {
			const response = await fetch('/api/queue/cancel', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					projectId: data.projectId
				})
			});

			if (!response.ok) {
				throw new Error('Failed to cancel processing');
			}

			const result = await response.json();
			if (result.canceledCount > 0) {
				toast.success(`Canceled ${result.canceledCount} job${result.canceledCount === 1 ? '' : 's'}`);
			} else {
				toast.info('No jobs to cancel');
			}

			await projectData.invalidate();
		} catch (error) {
			console.error('Failed to cancel processing:', error);
			toast.error('Failed to cancel processing');
		}
	}

</script>

{#if $isProjectLoading}
	<div class="flex items-center justify-center p-8">
		<p>Loading...</p>
	</div>
{:else if $currentProject}
	<!-- Full Height Container - No Scroll -->
	<div class="fixed inset-0 top-16 flex flex-col md:relative md:inset-auto md:top-auto md:h-auto">
		<!-- Statistics Section - Always on Top -->
		<div class="bg-background pb-3 pt-4 px-4 border-b shrink-0">
			{#if $currentProject.settings?.description}
				<p class="text-sm text-muted-foreground mb-3">{$currentProject.settings.description}</p>
			{/if}

			<!-- Compact Statistics Boxes -->
			<div class="flex flex-wrap items-center gap-2">
				<!-- Processing Status -->
				{#if $projectStats.processing > 0 || $projectStats.pending > 0}
					<div class="flex items-center gap-2">
						<Badge class="bg-blue-500 text-white dark:bg-blue-600">
							<Loader2 class="mr-1.5 h-3 w-3 animate-spin" />
							Processing {$projectStats.processing + $projectStats.pending}
						</Badge>
						<Button variant="ghost" size="sm" onclick={cancelProcessing} class="h-7 px-2">
							<X class="h-4 w-4" />
							<span class="ml-1 text-xs">Cancel</span>
						</Button>
					</div>
				{/if}

				<!-- Stat Boxes -->
				<div class="flex items-center gap-1.5">
					<!-- Pending -->
					<button
						onclick={() => goto(`/projects/${data.projectId}/images?status=pending`)}
						class="flex h-9 min-w-[3rem] items-center justify-center rounded-md bg-gray-500/20 px-3 transition-all hover:bg-gray-500/30 hover:scale-105 active:scale-95"
					>
						<span class="text-sm font-semibold text-gray-700 dark:text-gray-300">
							{$projectStats.pending}
						</span>
					</button>

					<!-- Processing -->
					<button
						onclick={() => goto(`/projects/${data.projectId}/images?status=processing`)}
						class="flex h-9 min-w-[3rem] items-center justify-center rounded-md bg-blue-500/20 px-3 transition-all hover:bg-blue-500/30 hover:scale-105 active:scale-95"
					>
						<span class="text-sm font-semibold text-blue-700 dark:text-blue-300">
							{$projectStats.processing}
						</span>
					</button>

					<!-- Review -->
					<button
						onclick={() => goto(`/projects/${data.projectId}/images?status=review`)}
						class="flex h-9 min-w-[3rem] items-center justify-center rounded-md bg-yellow-500/20 px-3 transition-all hover:bg-yellow-500/30 hover:scale-105 active:scale-95"
					>
						<span class="text-sm font-semibold text-yellow-700 dark:text-yellow-300">
							{$projectStats.review}
						</span>
					</button>

					<!-- Approved -->
					<button
						onclick={() => goto(`/projects/${data.projectId}/images?status=approved`)}
						class="flex h-9 min-w-[3rem] items-center justify-center rounded-md bg-green-500/20 px-3 transition-all hover:bg-green-500/30 hover:scale-105 active:scale-95"
					>
						<span class="text-sm font-semibold text-green-700 dark:text-green-300">
							{$projectStats.approved}
						</span>
					</button>

					<!-- Failed -->
					<button
						onclick={() => goto(`/projects/${data.projectId}/images?status=failed`)}
						class="flex h-9 min-w-[3rem] items-center justify-center rounded-md bg-red-500/20 px-3 transition-all hover:bg-red-500/30 hover:scale-105 active:scale-95"
					>
						<span class="text-sm font-semibold text-red-700 dark:text-red-300">
							{$projectStats.failed}
						</span>
					</button>
				</div>
			</div>
		</div>

		<!-- Table Section - Fills Remaining Space with Independent Scroll -->
		<div class="flex-1 min-h-0 mb-16 md:mb-0 flex flex-col">
			{#if $projectBatches.length === 0}
				<div class="flex items-center justify-center h-full text-muted-foreground">
					<p>No batches yet. Click the + button below to add your first batch.</p>
				</div>
			{:else}
				<div class="flex-1 min-h-0 flex flex-col pt-4 px-4">
					<div class="rounded-lg border block" style="max-height: calc(100vh - 16rem);">
						<div class="overflow-auto max-h-full" bind:this={tableScrollContainer}>
							<Table.Root>
								<Table.Header class="sticky top-0 z-10 bg-background border-b">
									<Table.Row>
										<Table.Head class="bg-background border-b">Batch</Table.Head>
										<Table.Head class="bg-background border-b">Created</Table.Head>
										<Table.Head class="bg-background border-b">Status</Table.Head>
										{#each columns as column}
											<Table.Head class="bg-background border-b">{column.name}</Table.Head>
										{/each}
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each $projectBatches.slice().reverse() as batch}
										<Table.Row class={getStatusColors(batch.status)}>
											<Table.Cell class="font-mono text-xs">{batch.id.slice(0, 8)}</Table.Cell>
											<Table.Cell class="text-xs">{new Date(batch.created).toLocaleDateString()}</Table.Cell>
											<Table.Cell>
												<Badge class="{getStatusBadgeColor(batch.status)} text-xs">
													{batch.status}
												</Badge>
											</Table.Cell>
											{#each columns as column}
												<Table.Cell>{getValueForColumn(batch, column.id) || '-'}</Table.Cell>
											{/each}
										</Table.Row>
									{/each}
									<!-- Empty row for spacing to prevent last row from being hidden by scrollbar -->
									<Table.Row class="h-4 hover:bg-transparent">
										<Table.Cell colspan={columns.length + 3} class="p-0"></Table.Cell>
									</Table.Row>
								</Table.Body>
							</Table.Root>
						</div>
					</div>
					<div class="pt-2 pb-2">
						<p class="text-xs text-muted-foreground text-center">
							Showing most recent 25 batches
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Hidden Camera Input -->
		<input
			bind:this={cameraInput}
			type="file"
			accept="image/*"
			capture="environment"
			multiple
			class="hidden"
			onchange={handleCameraCapture}
		/>

		<!-- Add Batch Button - Fixed at Bottom (Above Mobile Nav) -->
		<div class="fixed bottom-16 left-0 right-0 bg-background border-t px-4 py-3 shrink-0 md:relative md:bottom-auto md:left-auto md:right-auto">
			<Button
				onclick={() => cameraInput.click()}
				size="sm"
				variant="outline"
				class="gap-2"
			>
				<Camera class="h-4 w-4" />
				Add Batch
			</Button>
		</div>
	</div>
{/if}
