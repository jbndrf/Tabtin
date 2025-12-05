<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Badge from '$lib/components/ui/badge';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import BatchDataViewer from '$lib/components/projects/batch-data-viewer.svelte';
	import { t } from '$lib/i18n';
	import { ArrowLeft, Play, Eye, Trash2, Image as ImageIcon, RefreshCcw, ChevronDown } from 'lucide-svelte';
	import type { PageData } from './$types';
	import { pb, currentUser } from '$lib/stores/auth';
	import type { ImageBatchesResponse, ImagesResponse } from '$lib/pocketbase-types';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/utils/toast';

	let { data }: { data: PageData } = $props();

	let batch = $state<ImageBatchesResponse | null>(null);
	let images = $state<ImagesResponse[]>([]);
	let isLoading = $state(true);
	let isProcessing = $state(false);
	let viewerOpen = $state(false);

	onMount(async () => {
		await loadBatch();
	});

	async function loadBatch() {
		try {
			batch = await pb.collection('image_batches').getOne<ImageBatchesResponse>(data.batchId);

			// Load all images for this batch
			images = await pb.collection('images').getFullList<ImagesResponse>({
				filter: `batch = '${data.batchId}'`,
				sort: 'order'
			});
		} catch (error) {
			console.error('Failed to load batch:', error);
			toast.error('Failed to load batch');
			goto(`/projects/${data.projectId}/images`);
		} finally {
			isLoading = false;
		}
	}

	async function processBatch() {
		if (!batch) return;

		try {
			isProcessing = true;
			toast.info('Processing batch...');

			// First, reset to pending (this deletes extraction_rows via the status API)
			const statusResponse = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds: [batch.id],
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
					batchId: batch.id,
					projectId: data.projectId,
					priority: 10
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to enqueue batch');
			}

			toast.success('Batch enqueued for processing!');
			await loadBatch();
		} catch (error) {
			console.error('Failed to process batch:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to process batch');
			await loadBatch();
		} finally {
			isProcessing = false;
		}
	}

	async function deleteBatch() {
		if (!batch || !confirm('Delete this batch? All images and extraction data will be permanently deleted.')) {
			return;
		}

		try {
			const response = await fetch('/api/batches/delete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds: [batch.id],
					projectId: data.projectId
				})
			});

			if (!response.ok) {
				const result = await response.json();
				throw new Error(result.error || 'Failed to delete batch');
			}

			toast.success('Batch deleted');
			goto(`/projects/${data.projectId}/images`);
		} catch (error) {
			console.error('Failed to delete batch:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to delete batch');
		}
	}

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

	async function changeBatchStatus(targetStatus: 'pending' | 'review' | 'approved' | 'failed') {
		if (!batch) return;

		const isDestructive = targetStatus === 'pending' || targetStatus === 'failed';
		if (isDestructive && !confirm('This will delete all extraction data for this batch. Continue?')) {
			return;
		}

		isProcessing = true;

		try {
			const response = await fetch('/api/batches/status', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds: [batch.id],
					targetStatus,
					projectId: data.projectId
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to change status');
			}

			toast.success(`Batch status changed to ${targetStatus}`);
			await loadBatch();
		} catch (error) {
			console.error('Failed to change status:', error);
			toast.error(error instanceof Error ? error.message : 'Failed to change batch status');
		} finally {
			isProcessing = false;
		}
	}
</script>

{#if isLoading}
	<div class="flex items-center justify-center p-8">
		<p class="text-muted-foreground">{t('images.gallery.loading')}</p>
	</div>
{:else if batch}
	<div class="flex h-full flex-col">
		<!-- Header -->
		<div class="border-b bg-background px-4 py-3">
			<div class="flex items-center gap-4">
				<Button variant="ghost" size="icon" href="/projects/{data.projectId}/images">
					<ArrowLeft class="h-4 w-4" />
				</Button>
				<div class="flex-1">
					<div class="flex items-center gap-2">
						<h1 class="text-lg font-semibold md:text-xl">Batch {batch.id.slice(0, 8)}</h1>
						<Badge.Root class={`${getBatchStatusColor(batch.status)} border-none text-white`}>
							{getBatchStatusLabel(batch.status)}
						</Badge.Root>
					</div>
					<p class="text-sm text-muted-foreground">
						{new Date(batch.created).toLocaleDateString()} • {images.length} image{images.length === 1 ? '' : 's'}
					</p>
				</div>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-4">
			<div class="mx-auto max-w-4xl space-y-6">
				<!-- Actions -->
				<Card>
					<CardHeader>
						<CardTitle class="text-base">Actions</CardTitle>
					</CardHeader>
					<CardContent class="flex flex-col gap-2 sm:flex-row">
						{#if batch.status === 'pending'}
							<Button
								class="w-full sm:w-auto"
								disabled={isProcessing}
								onclick={processBatch}
							>
								<Play class="mr-2 h-4 w-4" />
								{t('images.actions.process')}
							</Button>
						{:else if batch.status === 'review'}
							<Button
								class="w-full sm:w-auto"
								variant="outline"
								href="/projects/{data.projectId}/images/review"
							>
								<Eye class="mr-2 h-4 w-4" />
								{t('images.actions.review')}
							</Button>
							<Button
								class="w-full sm:w-auto"
								variant="outline"
								disabled={isProcessing}
								onclick={processBatch}
							>
								<Play class="mr-2 h-4 w-4" />
								{t('images.actions.process_again')}
							</Button>
						{:else if batch.status === 'approved'}
							<Button
								class="w-full sm:w-auto"
								variant="outline"
								onclick={() => viewerOpen = true}
							>
								<Eye class="mr-2 h-4 w-4" />
								{t('images.actions.view_data')}
							</Button>
							<Button
								class="w-full sm:w-auto"
								variant="outline"
								disabled={isProcessing}
								onclick={processBatch}
							>
								<Play class="mr-2 h-4 w-4" />
								{t('images.actions.process_again')}
							</Button>
						{:else if batch.status === 'processing'}
							<Button
								class="w-full sm:w-auto"
								variant="outline"
								disabled={isProcessing}
								onclick={processBatch}
							>
								<Play class="mr-2 h-4 w-4" />
								{isProcessing ? 'Processing...' : t('images.actions.retry')}
							</Button>
						{:else if batch.status === 'failed'}
							<Button
								class="w-full sm:w-auto"
								variant="outline"
								disabled={isProcessing}
								onclick={processBatch}
							>
								<Play class="mr-2 h-4 w-4" />
								{t('images.actions.retry')}
							</Button>
						{/if}

						<!-- Change Status Dropdown -->
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="outline" class="w-full sm:w-auto" disabled={isProcessing}>
										<RefreshCcw class="mr-2 h-4 w-4" />
										Change Status
										<ChevronDown class="ml-1 h-3 w-3" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="start" class="w-56">
								<DropdownMenu.Label>Set Status</DropdownMenu.Label>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									onclick={() => changeBatchStatus('pending')}
									disabled={batch.status === 'pending'}
								>
									Set to Pending (deletes data)
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onclick={() => changeBatchStatus('review')}
									disabled={batch.status === 'review'}
								>
									Set to Review
								</DropdownMenu.Item>
								<DropdownMenu.Item
									onclick={() => changeBatchStatus('approved')}
									disabled={batch.status === 'approved'}
								>
									Set to Approved
								</DropdownMenu.Item>
								<DropdownMenu.Separator />
								<DropdownMenu.Item
									onclick={() => changeBatchStatus('failed')}
									disabled={batch.status === 'failed'}
									class="text-destructive focus:text-destructive"
								>
									Set to Failed (deletes data)
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						<div class="flex-1"></div>

						<Button
							class="w-full sm:w-auto"
							variant="destructive"
							onclick={deleteBatch}
						>
							<Trash2 class="mr-2 h-4 w-4" />
							{t('images.actions.delete')}
						</Button>
					</CardContent>
				</Card>

				<!-- Images Grid -->
				<Card>
					<CardHeader>
						<CardTitle class="text-base">Images</CardTitle>
					</CardHeader>
					<CardContent>
						{#if images.length === 0}
							<div class="flex flex-col items-center justify-center py-8 text-muted-foreground">
								<ImageIcon class="mb-2 h-8 w-8" />
								<p>No images in this batch</p>
							</div>
						{:else}
							<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
								{#each images as image, index}
									<div class="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
										<img
											src={pb.files.getUrl(image, image.image, { thumb: '300x300' })}
											alt="Image {index + 1}"
											class="h-full w-full object-cover transition-transform group-hover:scale-105"
										/>
										<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
											<p class="text-xs text-white">Image {index + 1}</p>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</CardContent>
				</Card>
			</div>
		</div>
	</div>
{/if}

<!-- Batch Data Viewer Dialog -->
{#if batch && batch.processed_data}
	<BatchDataViewer
		bind:open={viewerOpen}
		batchId={batch.id}
		extractedData={batch.processed_data}
		images={images}
		onClose={() => viewerOpen = false}
	/>
{/if}
