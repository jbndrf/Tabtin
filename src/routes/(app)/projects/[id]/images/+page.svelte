<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import * as Badge from '$lib/components/ui/badge';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { t } from '$lib/i18n';
	import { Upload, ImageIcon, Play, Trash2, X, Check, RotateCw, ChevronDown, RefreshCcw, CheckSquare, FileText } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { pb, currentUser } from '$lib/stores/auth';
	import { projectData, currentProject, isProjectLoading } from '$lib/stores/project-data';
	import type { ImageBatchesResponse, ImagesResponse } from '$lib/pocketbase-types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from '$lib/utils/toast';

	let { data }: { data: PageData } = $props();

	let allBatches = $state<(ImageBatchesResponse & { firstImage?: ImagesResponse })[]>([]);
	let filteredBatches = $state<(ImageBatchesResponse & { firstImage?: ImagesResponse })[]>([]);
	let displayedBatches = $state<(ImageBatchesResponse & { firstImage?: ImagesResponse })[]>([]);
	let selectedTab = $state<string>($page.url.searchParams.get('status') || 'all');
	let selectionMode = $state(false);
	let selectedBatches = $state<Set<string>>(new Set());
	let isProcessing = $state(false);
	let batchesPerPage = $state(50);
	let currentPage = $state(1);
	let imagesLoaded = $state(false);
	let loadedImages = $state<Set<string>>(new Set());

	function handleImageLoad(batchId: string) {
		loadedImages = new Set([...loadedImages, batchId]);
	}

	// Check if project has a model configured
	let hasModelConfigured = $derived(
		$currentProject?.settings && typeof $currentProject.settings === 'object' && 'modelName' in $currentProject.settings && Boolean($currentProject.settings.modelName)
	);

	// Status counts
	let statusCounts = $derived({
		all: allBatches.length,
		pending: allBatches.filter((b) => b.status === 'pending').length,
		processing: allBatches.filter((b) => b.status === 'processing').length,
		review: allBatches.filter((b) => b.status === 'review').length,
		approved: allBatches.filter((b) => b.status === 'approved').length,
		failed: allBatches.filter((b) => b.status === 'failed').length
	});

	onMount(async () => {
		try {
			// Load project data from store (will use cache if available)
			await projectData.loadProject(data.projectId, $currentUser?.id || '');

			// Load full batch list with images for gallery
			await loadAllBatchesWithImages();
		} catch (error) {
			console.error('Failed to load project:', error);
			goto('/dashboard');
		}
	});

	async function loadAllBatchesWithImages() {
		try {
			// Load all batches for complete gallery
			const batchList = await pb.collection('image_batches').getFullList<ImageBatchesResponse>({
				filter: `project = '${data.projectId}'`,
				sort: '-id'
			});

			// Load first image for each batch in chunks to avoid overwhelming the browser
			const chunkSize = 50;
			const loadedBatches: (ImageBatchesResponse & { firstImage?: ImagesResponse })[] = [];

			for (let i = 0; i < batchList.length; i += chunkSize) {
				const chunk = batchList.slice(i, i + chunkSize);
				const batchesWithImages = await Promise.all(
					chunk.map(async (batch) => {
						try {
							const firstImage = await pb.collection('images').getFirstListItem<ImagesResponse>(`batch = '${batch.id}'`, {
								sort: 'order'
							});
							return { ...batch, firstImage };
						} catch {
							return { ...batch, firstImage: undefined };
						}
					})
				);
				loadedBatches.push(...batchesWithImages);
			}

			allBatches = loadedBatches;
			imagesLoaded = true;

			// Apply initial filter
			filterBatches(selectedTab);
		} catch (error) {
			console.error('Failed to load batches:', error);
			toast.error(t('images.gallery.error_loading'));
		}
	}

	function filterBatches(status: string) {
		selectedTab = status;
		currentPage = 1;
		if (status === 'all') {
			filteredBatches = allBatches;
		} else {
			filteredBatches = allBatches.filter((b) => b.status === status);
		}
		updateDisplayedBatches();
		// Clear selection when changing tabs
		exitSelectionMode();
	}

	function updateDisplayedBatches() {
		const startIndex = 0;
		const endIndex = currentPage * batchesPerPage;
		displayedBatches = filteredBatches.slice(startIndex, endIndex);
	}

	function loadMoreBatches() {
		currentPage += 1;
		updateDisplayedBatches();
	}

	$effect(() => {
		// Update displayed batches when filtered batches change
		if (filteredBatches) {
			updateDisplayedBatches();
		}
	});

	function getBatchStatusColor(status: string) {
		switch (status) {
			case 'pending':
				return 'bg-yellow-500 dark:bg-yellow-600';
			case 'processing':
				return 'bg-blue-500 dark:bg-blue-600';
			case 'review':
				return 'bg-orange-500 dark:bg-orange-600';
			case 'approved':
				return 'bg-green-500 dark:bg-green-600';
			case 'failed':
				return 'bg-red-500 dark:bg-red-600';
			default:
				return 'bg-gray-500 dark:bg-gray-600';
		}
	}

	function getBatchStatusLabel(status: string) {
		return t(`images.gallery.status.${status}`);
	}

	function isPdfFile(filename: string): boolean {
		return filename?.toLowerCase().endsWith('.pdf');
	}

	function handleBatchClick(batchId: string, event: MouseEvent) {
		// Ctrl+Click or Cmd+Click to select (PC support)
		if (event.ctrlKey || event.metaKey) {
			if (!selectionMode) {
				enterSelectionMode();
			}
			toggleBatchSelection(batchId);
			return;
		}

		if (selectionMode) {
			toggleBatchSelection(batchId);
		} else {
			goto(`/projects/${data.projectId}/images/${batchId}`);
		}
	}

	function handleBatchLongPress(batchId: string) {
		if (!selectionMode) {
			enterSelectionMode();
		}
		toggleBatchSelection(batchId);
	}

	function enterSelectionMode() {
		selectionMode = true;
		selectedBatches = new Set();
	}

	function exitSelectionMode() {
		selectionMode = false;
		selectedBatches = new Set();
	}

	function toggleBatchSelection(batchId: string) {
		if (selectedBatches.has(batchId)) {
			selectedBatches.delete(batchId);
			selectedBatches = new Set(selectedBatches);
		} else {
			selectedBatches.add(batchId);
			selectedBatches = new Set(selectedBatches);
		}

		// Exit selection mode if no batches selected
		if (selectedBatches.size === 0) {
			exitSelectionMode();
		}
	}

	function selectAll() {
		selectedBatches = new Set(filteredBatches.map(b => b.id));
	}

	async function processSelectedBatches() {
		if (selectedBatches.size === 0) return;

		isProcessing = true;

		try {
			const batchIds = Array.from(selectedBatches);

			toast.info(`Processing ${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'}...`);

			// Enqueue all selected batches via backend queue
			const response = await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					projectId: data.projectId,
					priority: 10
				})
			});

			if (!response.ok) {
				throw new Error('Failed to enqueue batches');
			}

			const result = await response.json();
			if (result.canceledCount > 0) {
				toast.info(`Canceled ${result.canceledCount} existing job${result.canceledCount === 1 ? '' : 's'}`);
			}

			toast.success(`Processing ${batchIds.length} batch${batchIds.length === 1 ? '' : 'es'}`);
			exitSelectionMode();
			await loadAllBatchesWithImages();
			await projectData.invalidate();
		} catch (error) {
			console.error('Failed to process selected batches:', error);
			toast.error('Failed to start processing');
		} finally {
			isProcessing = false;
		}
	}

	async function deleteSelectedBatches() {
		if (selectedBatches.size === 0) return;

		if (!confirm(`Delete ${selectedBatches.size} batch${selectedBatches.size === 1 ? '' : 'es'}? All images and extraction data will be permanently deleted.`)) {
			return;
		}

		isProcessing = true;

		try {
			const batchIds = Array.from(selectedBatches);

			const response = await fetch('/api/batches/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					projectId: data.projectId
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete batches');
			}

			await loadAllBatchesWithImages();
			await projectData.invalidate();
			exitSelectionMode();

			if (result.failCount > 0) {
				toast.warning(`Deleted ${result.successCount} batch(es), ${result.failCount} failed`);
			} else {
				toast.success(`Deleted ${result.successCount} batch${result.successCount === 1 ? '' : 'es'}`);
			}
		} catch (error) {
			console.error('Failed to delete batches:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to delete batches');
		} finally {
			isProcessing = false;
		}
	}

	// Long press handling
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressStarted = $state(false);

	function handleTouchStart(batchId: string) {
		longPressStarted = true;
		longPressTimer = setTimeout(() => {
			if (longPressStarted) {
				handleBatchLongPress(batchId);
			}
		}, 500); // 500ms for long press
	}

	function handleTouchEnd() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		longPressStarted = false;
	}

	function handleTouchMove() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		longPressStarted = false;
	}

	// Reprocess functions - clears extraction data and enqueues for processing
	async function reprocessSelected() {
		if (selectedBatches.size === 0) {
			toast.error('No batches selected');
			return;
		}

		try {
			const batchIds = Array.from(selectedBatches);

			// First, reset to pending (this deletes extraction_rows via the status API)
			const statusResponse = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					targetStatus: 'pending',
					projectId: data.projectId
				})
			});

			if (!statusResponse.ok) {
				throw new Error('Failed to reset batch status');
			}

			// Then enqueue for processing
			const response = await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					projectId: data.projectId,
					priority: 10
				})
			});

			if (!response.ok) {
				throw new Error('Failed to enqueue batches');
			}

			const result = await response.json();
			if (result.canceledCount > 0) {
				toast.info(`Canceled ${result.canceledCount} existing job${result.canceledCount === 1 ? '' : 's'}`);
			}

			toast.success(`Reprocessing ${batchIds.length} selected batch${batchIds.length === 1 ? '' : 'es'}`);
			exitSelectionMode();
			await loadAllBatchesWithImages();
			await projectData.invalidate();
		} catch (error) {
			console.error('Failed to reprocess selected batches:', error);
			toast.error('Failed to start reprocessing');
		}
	}

	async function reprocessByStatus(status: string) {
		try {
			// Get batches with the specified status
			const batches = await pb.collection('image_batches').getFullList({
				filter: `project = "${data.projectId}" && status = "${status}"`,
				sort: '+id'
			});

			if (batches.length === 0) {
				toast.info(`No batches found with status: ${status}`);
				return;
			}

			const batchIds = batches.map(b => b.id);

			// First, reset to pending (this deletes extraction_rows via the status API)
			const statusResponse = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					targetStatus: 'pending',
					projectId: data.projectId
				})
			});

			if (!statusResponse.ok) {
				throw new Error('Failed to reset batch status');
			}

			// Then enqueue for processing
			const response = await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					projectId: data.projectId,
					priority: 10
				})
			});

			if (!response.ok) {
				throw new Error('Failed to enqueue batches');
			}

			const result = await response.json();
			if (result.canceledCount > 0) {
				toast.info(`Canceled ${result.canceledCount} existing job${result.canceledCount === 1 ? '' : 's'}`);
			}

			toast.success(`Reprocessing ${batches.length} batch${batches.length === 1 ? '' : 'es'} with status: ${status}`);
			await loadAllBatchesWithImages();
			await projectData.invalidate();
		} catch (error) {
			console.error(`Failed to reprocess batches with status ${status}:`, error);
			toast.error('Failed to start reprocessing');
		}
	}

	async function reprocessAll() {
		if (!confirm('Reprocess ALL batches? This will delete all extraction data and reprocess everything.')) {
			return;
		}

		try {
			// Get all batches for this project
			const batches = await pb.collection('image_batches').getFullList({
				filter: `project = "${data.projectId}"`,
				sort: '+id'
			});

			if (batches.length === 0) {
				toast.info('No batches found to reprocess');
				return;
			}

			const batchIds = batches.map(b => b.id);

			// First, reset to pending (this deletes extraction_rows via the status API)
			const statusResponse = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					targetStatus: 'pending',
					projectId: data.projectId
				})
			});

			if (!statusResponse.ok) {
				throw new Error('Failed to reset batch status');
			}

			// Then enqueue for processing
			const response = await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					projectId: data.projectId,
					priority: 10
				})
			});

			if (!response.ok) {
				throw new Error('Failed to enqueue batches');
			}

			const result = await response.json();
			if (result.canceledCount > 0) {
				toast.info(`Canceled ${result.canceledCount} existing job${result.canceledCount === 1 ? '' : 's'}`);
			}

			toast.success(`Reprocessing all ${batches.length} batch${batches.length === 1 ? '' : 'es'}`);
			await loadAllBatchesWithImages();
			await projectData.invalidate();
		} catch (error) {
			console.error('Failed to reprocess all batches:', error);
			toast.error('Failed to start reprocessing');
		}
	}

	async function approveAllReviewBatches() {
		const reviewBatches = allBatches.filter((b) => b.status === 'review');

		if (reviewBatches.length === 0) {
			toast.info('No batches in review status to approve');
			return;
		}

		if (!confirm(`Approve all ${reviewBatches.length} batch${reviewBatches.length === 1 ? '' : 'es'} in review?`)) {
			return;
		}

		toast.info(`Approving ${reviewBatches.length} batch${reviewBatches.length === 1 ? '' : 'es'}...`);

		try {
			const batchIds = reviewBatches.map((b) => b.id);

			// Use our status API to approve all batches
			const response = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds,
					targetStatus: 'approved',
					projectId: data.projectId
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to approve batches');
			}

			await loadAllBatchesWithImages();
			await projectData.invalidate();

			if (result.failCount > 0) {
				toast.warning(`Approved ${result.successCount} batch(es), ${result.failCount} failed`);
			} else {
				toast.success(`Successfully approved ${result.successCount} batch${result.successCount === 1 ? '' : 'es'}!`);
			}
		} catch (error) {
			console.error('Failed to approve batches:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to approve batches');
		}
	}

	async function changeStatus(targetStatus: 'pending' | 'review' | 'approved' | 'failed') {
		if (selectedBatches.size === 0) return;

		const isDestructive = targetStatus === 'pending' || targetStatus === 'failed';
		if (isDestructive && !confirm(`This will delete all extraction data for ${selectedBatches.size} batch(es). Continue?`)) {
			return;
		}

		isProcessing = true;

		try {
			const response = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds: Array.from(selectedBatches),
					targetStatus,
					projectId: data.projectId
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to change status');
			}

			if (result.failCount > 0) {
				toast.warning(`Updated ${result.successCount}, failed ${result.failCount}`);
			} else {
				toast.success(`Updated ${result.successCount} batch(es) to ${targetStatus}`);
			}

			exitSelectionMode();
			await loadAllBatchesWithImages();
			await projectData.invalidate();
		} catch (error) {
			console.error('Failed to change status:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to change batch status');
		} finally {
			isProcessing = false;
		}
	}
</script>

{#if $isProjectLoading && !imagesLoaded}
	<div class="flex items-center justify-center p-8">
		<p class="text-muted-foreground">{t('images.gallery.loading')}</p>
	</div>
{:else if $currentProject}
	<div class="fixed inset-0 top-16 flex flex-col md:relative md:inset-auto md:top-auto md:h-auto">
		<!-- Header -->
		<div class="border-b bg-background px-4 py-3">
			<div class="flex items-center justify-between">
				{#if selectionMode}
					<div class="flex items-center gap-3">
						<Button variant="ghost" size="icon" onclick={exitSelectionMode}>
							<X class="h-4 w-4" />
						</Button>
						<div>
							<h1 class="text-lg font-semibold">{selectedBatches.size} selected</h1>
						</div>
					</div>
					<Button variant="ghost" size="sm" onclick={selectAll}>
						Select All
					</Button>
				{:else}
					<div>
						<h1 class="text-lg font-semibold md:text-xl">{t('images.gallery.title')}</h1>
						<p class="text-sm text-muted-foreground">{$currentProject.name}</p>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={statusCounts.all === 0}
							onclick={enterSelectionMode}
						>
							<CheckSquare class="mr-2 h-4 w-4" />
							<span class="hidden sm:inline">Select</span>
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={statusCounts.review === 0}
							onclick={approveAllReviewBatches}
						>
							<Check class="mr-2 h-4 w-4" />
							<span class="hidden sm:inline">Approve All</span>
							<span class="sm:hidden">Approve</span>
							{#if statusCounts.review > 0}
								<span class="ml-1">({statusCounts.review})</span>
							{/if}
						</Button>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="outline" size="sm" disabled={!hasModelConfigured}>
										<RotateCw class="mr-2 h-4 w-4" />
										<span class="hidden sm:inline">Reprocess</span>
										<ChevronDown class="ml-1 h-3 w-3" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="w-56">
								<DropdownMenu.Group>
									<DropdownMenu.Label>Reprocess Options</DropdownMenu.Label>
									<DropdownMenu.Separator />
									<DropdownMenu.Item onclick={() => {selectionMode = true}}>
										<Check class="mr-2 h-4 w-4" />
										Reprocess Selected
									</DropdownMenu.Item>
								</DropdownMenu.Group>
								<DropdownMenu.Separator />
								<DropdownMenu.Group>
									<DropdownMenu.Label>By Status</DropdownMenu.Label>
									<DropdownMenu.Item onclick={() => reprocessByStatus('pending')} disabled={statusCounts.pending === 0}>
										Reprocess Pending ({statusCounts.pending})
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => reprocessByStatus('processing')} disabled={statusCounts.processing === 0}>
										Reprocess Processing ({statusCounts.processing})
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => reprocessByStatus('review')} disabled={statusCounts.review === 0}>
										Reprocess Review ({statusCounts.review})
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => reprocessByStatus('approved')} disabled={statusCounts.approved === 0}>
										Reprocess Approved ({statusCounts.approved})
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => reprocessByStatus('failed')} disabled={statusCounts.failed === 0}>
										Reprocess Failed ({statusCounts.failed})
									</DropdownMenu.Item>
								</DropdownMenu.Group>
								<DropdownMenu.Separator />
								<DropdownMenu.Item onclick={reprocessAll} disabled={statusCounts.all === 0} class="text-destructive focus:text-destructive">
									Reprocess All Batches ({statusCounts.all})
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
						<Button
							href={hasModelConfigured ? `/projects/${$currentProject.id}/images/add` : undefined}
							size="sm"
							disabled={!hasModelConfigured}
							onclick={!hasModelConfigured ? () => toast.error(t('images.gallery.model_not_configured')) : undefined}
							class={!hasModelConfigured ? 'opacity-50 cursor-not-allowed' : ''}
						>
							<Upload class="mr-2 h-4 w-4" />
							<span class="hidden sm:inline">{t('images.gallery.upload_button')}</span>
							<span class="sm:hidden">{t('images.gallery.upload_button_short')}</span>
						</Button>
					</div>
				{/if}
			</div>
		</div>

		<!-- Tabs for filtering -->
		<Tabs.Root value={selectedTab} onValueChange={(v) => v && filterBatches(v)} class="flex-1 overflow-hidden">
			<div class="border-b bg-background px-4">
				<Tabs.List class="w-full justify-start overflow-x-auto">
					<Tabs.Trigger value="all" class="flex-shrink-0">
						{t('images.gallery.tabs.all')}
						<span class="ml-1.5 text-xs text-muted-foreground">({statusCounts.all})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="pending" class="flex-shrink-0">
						{t('images.gallery.tabs.pending')}
						<span class="ml-1.5 text-xs text-muted-foreground">({statusCounts.pending})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="processing" class="flex-shrink-0">
						{t('images.gallery.tabs.processing')}
						<span class="ml-1.5 text-xs text-muted-foreground">({statusCounts.processing})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="review" class="flex-shrink-0">
						{t('images.gallery.tabs.review')}
						<span class="ml-1.5 text-xs text-muted-foreground">({statusCounts.review})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="approved" class="flex-shrink-0">
						{t('images.gallery.tabs.approved')}
						<span class="ml-1.5 text-xs text-muted-foreground">({statusCounts.approved})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="failed" class="flex-shrink-0">
						{t('images.gallery.tabs.failed')}
						<span class="ml-1.5 text-xs text-muted-foreground">({statusCounts.failed})</span>
					</Tabs.Trigger>
				</Tabs.List>
			</div>

			<!-- Content -->
			<div class="overflow-y-auto p-4 mb-16 md:mb-0 {selectionMode && selectedBatches.size > 0 ? 'pb-24' : ''}">
				{#if filteredBatches.length === 0}
					<!-- Empty State -->
					<Card class="border-dashed">
						<CardContent class="flex flex-col items-center justify-center py-12">
							<ImageIcon class="mb-4 h-12 w-12 text-muted-foreground" />
							<h3 class="mb-2 text-lg font-semibold">{t('images.gallery.empty_state.title')}</h3>
							<p class="mb-4 text-center text-sm text-muted-foreground">
								{selectedTab === 'all' ? t('images.gallery.empty_state.description_all') : t('images.gallery.empty_state.description_filtered', { status: selectedTab })}
							</p>
							{#if selectedTab === 'all'}
								<Button
									href={hasModelConfigured ? `/projects/${$currentProject.id}/images/add` : undefined}
									size="sm"
									disabled={!hasModelConfigured}
									onclick={!hasModelConfigured ? () => toast.error(t('images.gallery.model_not_configured')) : undefined}
									class={!hasModelConfigured ? 'opacity-50 cursor-not-allowed' : ''}
								>
									<Upload class="mr-2 h-4 w-4" />
									{t('images.gallery.empty_state.upload_button')}
								</Button>
							{/if}
						</CardContent>
					</Card>
				{:else}
					<!-- Gallery Grid -->
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
						{#each displayedBatches as batch (batch.id)}
							<button
								onclick={(e) => handleBatchClick(batch.id, e)}
								ontouchstart={() => handleTouchStart(batch.id)}
								ontouchend={handleTouchEnd}
								ontouchmove={handleTouchMove}
								class="group relative aspect-square overflow-hidden rounded-lg border bg-muted transition-all hover:border-primary hover:shadow-md active:scale-95 {selectedBatches.has(batch.id) ? 'ring-2 ring-primary ring-offset-2' : ''}"
							>
								<!-- Image -->
								{#if batch.firstImage}
									{#if isPdfFile(batch.firstImage.image)}
										<div class="flex h-full w-full flex-col items-center justify-center bg-muted {selectedBatches.has(batch.id) ? 'opacity-60' : ''}">
											<FileText class="h-12 w-12 text-muted-foreground" />
											<span class="mt-2 text-xs font-medium text-muted-foreground">PDF</span>
										</div>
									{:else}
										<div class="relative h-full w-full">
											{#if !loadedImages.has(batch.id)}
												<Skeleton class="absolute inset-0 h-full w-full rounded-none" />
											{/if}
											<img
												src={pb.files.getUrl(batch.firstImage, batch.firstImage.image, { thumb: '300x300' })}
												alt={t('images.gallery.batch_thumbnail')}
												loading="lazy"
												decoding="async"
												onload={() => handleImageLoad(batch.id)}
												class="h-full w-full object-cover transition-transform group-hover:scale-105 {selectedBatches.has(batch.id) ? 'opacity-60' : ''} {loadedImages.has(batch.id) ? 'opacity-100' : 'opacity-0'}"
											/>
										</div>
									{/if}
								{:else}
									<div class="flex h-full w-full items-center justify-center">
										<ImageIcon class="h-8 w-8 text-muted-foreground" />
									</div>
								{/if}

								<!-- Selection Checkbox -->
								{#if selectionMode}
									<div class="absolute left-2 top-2">
										<div class="flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-md {selectedBatches.has(batch.id) ? 'bg-primary text-primary-foreground' : ''}">
											{#if selectedBatches.has(batch.id)}
												<Check class="h-4 w-4" />
											{/if}
										</div>
									</div>
								{/if}

								<!-- Status Badge Overlay -->
								{#if !selectionMode}
									<div class="absolute right-2 top-2">
										<Badge.Root class={`${getBatchStatusColor(batch.status)} border-none text-xs text-white shadow-md`}>
											{getBatchStatusLabel(batch.status)}
										</Badge.Root>
									</div>
								{/if}

								<!-- Date Overlay -->
								<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
									<p class="text-xs text-white">
										{batch.created ? new Date(batch.created).toLocaleDateString() : 'No date'}
									</p>
								</div>
							</button>
						{/each}
					</div>

					<!-- Load More Button -->
					{#if displayedBatches.length < filteredBatches.length}
						<div class="mt-6 flex justify-center">
							<Button variant="outline" onclick={loadMoreBatches}>
								Load More ({filteredBatches.length - displayedBatches.length} remaining)
							</Button>
						</div>
					{/if}
				{/if}
			</div>
		</Tabs.Root>

		<!-- Floating Action Bar -->
		{#if selectionMode && selectedBatches.size > 0}
			<div class="fixed bottom-16 left-0 right-0 z-40 border-t bg-background p-4 shadow-2xl backdrop-blur-sm md:bottom-0">
				<div class="mx-auto flex max-w-4xl gap-2">
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<Button {...props} variant="outline" class="flex-1" disabled={isProcessing}>
									<RefreshCcw class="mr-2 h-4 w-4" />
									<span class="hidden sm:inline">Change Status</span>
									<span class="sm:hidden">Status</span>
									<ChevronDown class="ml-1 h-3 w-3" />
								</Button>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start" class="w-56">
							<DropdownMenu.Label>Set Status</DropdownMenu.Label>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={() => changeStatus('pending')}>
								Set to Pending (deletes data)
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => changeStatus('review')}>
								Set to Review
							</DropdownMenu.Item>
							<DropdownMenu.Item onclick={() => changeStatus('approved')}>
								Set to Approved
							</DropdownMenu.Item>
							<DropdownMenu.Separator />
							<DropdownMenu.Item onclick={() => changeStatus('failed')} class="text-destructive focus:text-destructive">
								Set to Failed (deletes data)
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
					<Button
						class="flex-1"
						disabled={isProcessing}
						onclick={reprocessSelected}
					>
						<RotateCw class="mr-2 h-4 w-4" />
						<span class="hidden sm:inline">Reprocess</span>
						<span class="sm:hidden">Reprocess</span>
						<span class="ml-1">({selectedBatches.size})</span>
					</Button>
					<Button
						class="flex-1"
						variant="destructive"
						disabled={isProcessing}
						onclick={deleteSelectedBatches}
					>
						<Trash2 class="mr-2 h-4 w-4" />
						<span class="hidden sm:inline">{t('images.actions.delete')}</span>
						<span class="sm:hidden">Delete</span>
						<span class="ml-1">({selectedBatches.size})</span>
					</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}
