<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Loader2, X, Plus, Camera, ChevronDown, ChevronRight, Images } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, projectBatches, projectStats, isProjectLoading, type BatchWithData } from '$lib/stores/project-data';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/utils/toast';
	import { loadExtractionRows } from '$lib/utils/extraction-rows';
	import type { ExtractionRow } from '$lib/types/extraction';

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

	// Expanded rows state - tracks which batches are expanded
	let expandedBatches = $state<Set<string>>(new Set());
	// Cache for loaded extraction rows per batch
	let batchExtractionRows = $state<Map<string, ExtractionRow[]>>(new Map());
	// Loading state for extraction rows
	let loadingExtractionRows = $state<Set<string>>(new Set());

	// Batch images modal state
	let batchImagesModalOpen = $state(false);
	let selectedBatchForImages = $state<BatchWithData | null>(null);

	async function toggleBatchExpand(batch: BatchWithData) {
		const batchId = batch.id;

		if (expandedBatches.has(batchId)) {
			// Collapse
			expandedBatches.delete(batchId);
			expandedBatches = new Set(expandedBatches);
		} else {
			// Expand - load extraction rows if not already loaded
			if (!batchExtractionRows.has(batchId)) {
				loadingExtractionRows.add(batchId);
				loadingExtractionRows = new Set(loadingExtractionRows);

				try {
					const rows = await loadExtractionRows(pb, batchId);
					batchExtractionRows.set(batchId, rows);
					batchExtractionRows = new Map(batchExtractionRows);
				} catch (error) {
					console.error('Failed to load extraction rows:', error);
					toast.error('Failed to load extraction rows');
				} finally {
					loadingExtractionRows.delete(batchId);
					loadingExtractionRows = new Set(loadingExtractionRows);
				}
			}

			expandedBatches.add(batchId);
			expandedBatches = new Set(expandedBatches);
		}
	}

	function openBatchImagesModal(batch: BatchWithData, e: Event) {
		e.stopPropagation();
		selectedBatchForImages = batch;
		batchImagesModalOpen = true;
	}

	function getImageUrl(image: any) {
		return pb.files.getURL(image, image.image);
	}

	function isPdf(filename: string): boolean {
		return filename?.toLowerCase().endsWith('.pdf');
	}

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
		// For multi-row batches, show first row (row_index 0) data
		const extraction = batch.processed_data.extractions?.find(
			e => e.column_id === columnId && (e.row_index === 0 || e.row_index === undefined)
		);
		return extraction?.value ?? '';
	}

	function deduplicateRows(rows: ExtractionRow[]): ExtractionRow[] {
		// Remove duplicate rows with the same row_index, keeping the first occurrence
		const seen = new Set<number>();
		return rows.filter(row => {
			if (seen.has(row.rowIndex)) {
				return false;
			}
			seen.add(row.rowIndex);
			return true;
		});
	}

	// Track last loaded project to prevent duplicate loads
	let lastLoadedProjectId: string | null = null;

	async function loadProjectData(projectId: string, force = false) {
		// Prevent duplicate loads for the same project
		if (!force && lastLoadedProjectId === projectId) {
			return;
		}
		lastLoadedProjectId = projectId;

		try {
			// Clear extraction rows cache when reloading project data
			batchExtractionRows.clear();
			batchExtractionRows = new Map();
			expandedBatches.clear();
			expandedBatches = new Set();

			// Load project data from store
			await projectData.loadProject(projectId, $currentUser?.id || '', force);

			if ($currentProject?.settings?.columns) {
				columns = $currentProject.settings.columns;
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

	// Clear extraction rows cache when batches change (after reprocessing, etc.)
	$effect(() => {
		// Watch for changes to the batches array
		const batches = $projectBatches;

		// Clear cache for any batches that no longer exist or have changed status to pending
		const currentBatchIds = new Set(batches.map(b => b.id));
		const pendingBatchIds = new Set(batches.filter(b => b.status === 'pending').map(b => b.id));

		// Remove cached data for batches that are now pending (being reprocessed)
		let hasChanges = false;
		for (const batchId of batchExtractionRows.keys()) {
			if (!currentBatchIds.has(batchId) || pendingBatchIds.has(batchId)) {
				batchExtractionRows.delete(batchId);
				expandedBatches.delete(batchId);
				hasChanges = true;
			}
		}

		// Only trigger reactivity if something actually changed
		if (hasChanges) {
			batchExtractionRows = new Map(batchExtractionRows);
			expandedBatches = new Set(expandedBatches);
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
										<Table.Head class="bg-background border-b w-8"></Table.Head>
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
										{@const isExpanded = expandedBatches.has(batch.id)}
										{@const isLoading = loadingExtractionRows.has(batch.id)}
										{@const rawExtractionRows = batchExtractionRows.get(batch.id) || []}
										{@const extractionRows = deduplicateRows(rawExtractionRows)}
										{@const additionalRows = extractionRows.slice(1)}
										<!-- Main batch row -->
										<Table.Row
											class="{getStatusColors(batch.status)} cursor-pointer hover:bg-accent/50 transition-colors"
											onclick={() => toggleBatchExpand(batch)}
										>
											<Table.Cell class="w-8 px-2">
												{#if isLoading}
													<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
												{:else if isExpanded}
													<ChevronDown class="h-4 w-4 text-muted-foreground" />
												{:else}
													<ChevronRight class="h-4 w-4 text-muted-foreground" />
												{/if}
											</Table.Cell>
											<Table.Cell class="font-mono text-xs">
												<button
													class="hover:underline hover:text-primary flex items-center gap-1"
													onclick={(e) => openBatchImagesModal(batch, e)}
												>
													<Images class="h-3 w-3" />
													{batch.id.slice(0, 8)}
												</button>
											</Table.Cell>
											<Table.Cell class="text-xs">{new Date(batch.created).toLocaleDateString()}</Table.Cell>
											<Table.Cell>
												<div class="flex items-center gap-2">
													<Badge class="{getStatusBadgeColor(batch.status)} text-xs">
														{batch.status}
													</Badge>
													{#if (batch.row_count ?? 1) > 1}
														<span class="text-xs text-muted-foreground">
															({batch.row_count} rows)
														</span>
													{/if}
												</div>
											</Table.Cell>
											{#each columns as column}
												<Table.Cell>{getValueForColumn(batch, column.id) || '-'}</Table.Cell>
											{/each}
										</Table.Row>
										<!-- Expanded extraction rows (skip first row since it's shown in main row) -->
										{#if isExpanded && additionalRows.length > 0}
											{#each additionalRows as row, rowIdx}
												<Table.Row class="bg-muted/30 border-l-2 border-l-primary/30">
													<Table.Cell class="w-8 px-2"></Table.Cell>
													<Table.Cell class="font-mono text-xs text-muted-foreground pl-6">
														Row {row.rowIndex + 1}
													</Table.Cell>
													<Table.Cell class="text-xs text-muted-foreground">-</Table.Cell>
													<Table.Cell>
														<Badge variant="outline" class="text-xs">
															{row.status}
														</Badge>
													</Table.Cell>
													{#each columns as column}
														{@const extraction = row.data.find(e => e.column_id === column.id)}
														<Table.Cell class="text-sm">
															{extraction?.value || '-'}
														</Table.Cell>
													{/each}
												</Table.Row>
											{/each}
										{:else if isExpanded && additionalRows.length === 0 && !isLoading}
											<Table.Row class="bg-muted/30 border-l-2 border-l-primary/30">
												<Table.Cell colspan={columns.length + 4} class="text-center text-muted-foreground text-sm py-2">
													No additional rows
												</Table.Cell>
											</Table.Row>
										{/if}
									{/each}
									<!-- Empty row for spacing to prevent last row from being hidden by scrollbar -->
									<Table.Row class="h-4 hover:bg-transparent">
										<Table.Cell colspan={columns.length + 4} class="p-0"></Table.Cell>
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

<!-- Batch Images Modal -->
<Dialog.Root bind:open={batchImagesModalOpen}>
	<Dialog.Content class="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
		<Dialog.Header>
			<Dialog.Title>
				Batch Images - {selectedBatchForImages?.id.slice(0, 8)}
			</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto py-4">
			{#if selectedBatchForImages?.images && selectedBatchForImages.images.length > 0}
				<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
					{#each selectedBatchForImages.images as image, idx}
						{@const imageUrl = getImageUrl(image)}
						{@const isFilePdf = isPdf(image.image)}
						<div class="relative aspect-square rounded-lg overflow-hidden border bg-muted">
							{#if isFilePdf}
								<!-- PDF file - show iframe or fallback -->
								<a
									href={imageUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="w-full h-full flex flex-col items-center justify-center bg-muted hover:bg-muted/80 transition-colors"
								>
									<svg class="h-12 w-12 text-muted-foreground mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
									</svg>
									<span class="text-xs text-muted-foreground text-center px-2">PDF Document</span>
									<span class="text-xs text-primary mt-1">Click to open</span>
								</a>
							{:else}
								<!-- Regular image -->
								<img
									src={imageUrl}
									alt="Batch image {idx + 1}"
									class="w-full h-full object-cover"
								/>
							{/if}
							<div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1">
								{isFilePdf ? 'PDF' : 'Image'} {idx + 1}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center text-muted-foreground py-8">
					No images found for this batch
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => batchImagesModalOpen = false}>
				Close
			</Button>
			{#if selectedBatchForImages}
				<Button onclick={() => goto(`/projects/${data.projectId}/images/${selectedBatchForImages?.id}`)}>
					View Details
				</Button>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
