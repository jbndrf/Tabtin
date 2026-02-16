<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { X, Zap, ZapOff, SwitchCamera } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import CameraViewfinder from '$lib/components/capture/CameraViewfinder.svelte';
	import CaptureControls from '$lib/components/capture/CaptureControls.svelte';
	import { submitCaptureBatch, uploadingBatches, getActiveUploadCount } from '$lib/utils/capture-pipeline.svelte';
	import { currentProject } from '$lib/stores/project-data';
	import { toast } from '$lib/utils/toast';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Camera state
	let facingMode = $state<'user' | 'environment'>('environment');
	let flashEnabled = $state(false);
	let hasFlash = $state(false);
	let cameraReady = $state(false);
	let cameraError = $state<string | null>(null);
	let viewfinder: CameraViewfinder | undefined = $state();

	// Capture state
	let approveMode = $state(false);
	let pendingBlob: Blob | null = $state(null);

	interface CapturedImage {
		id: string;
		blob: Blob;
		thumbnailUrl: string;
	}

	let gallery = $state<CapturedImage[]>([]);

	// Track uploading batches count
	let uploadingCount = $state(0);
	const unsubUploading = uploadingBatches.subscribe((map) => {
		let count = 0;
		for (const b of map.values()) {
			if (b.status === 'resizing' || b.status === 'uploading') count++;
		}
		uploadingCount = count;
	});

	onDestroy(() => {
		unsubUploading();
		// Clean up gallery URLs
		gallery.forEach((img) => URL.revokeObjectURL(img.thumbnailUrl));
	});

	// Warn before closing with pending uploads
	function handleBeforeUnload(e: BeforeUnloadEvent) {
		if (gallery.length > 0 || uploadingCount > 0) {
			e.preventDefault();
		}
	}

	onMount(() => {
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	function handleStreamReady() {
		cameraReady = true;
		cameraError = null;
		// Check flash support after stream is ready
		setTimeout(() => {
			hasFlash = viewfinder?.hasFlashSupport() ?? false;
		}, 100);
	}

	function handleCameraError(error: string) {
		cameraError = error;
		cameraReady = false;
	}

	async function handleShutter() {
		if (!viewfinder) return;
		const blob = await viewfinder.captureFrame();
		if (blob) {
			pendingBlob = blob;
			approveMode = true;
		}
	}

	function handleApprove() {
		if (pendingBlob) {
			const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
			const thumbnailUrl = URL.createObjectURL(pendingBlob);
			gallery = [...gallery, { id, blob: pendingBlob, thumbnailUrl }];
			pendingBlob = null;
		}
		approveMode = false;
		viewfinder?.unfreeze();
	}

	function handleDiscard() {
		pendingBlob = null;
		approveMode = false;
		viewfinder?.unfreeze();
	}

	function handleRemoveFromGallery(id: string) {
		const img = gallery.find((g) => g.id === id);
		if (img) URL.revokeObjectURL(img.thumbnailUrl);
		gallery = gallery.filter((g) => g.id !== id);
	}

	function handleClearAll() {
		gallery.forEach((img) => URL.revokeObjectURL(img.thumbnailUrl));
		gallery = [];
	}

	async function handleUploadBatch() {
		if (gallery.length === 0) return;

		const settings = $currentProject?.settings as any;
		const files = gallery.map(
			(img, i) => new File([img.blob], `capture-${i + 1}.jpg`, { type: 'image/jpeg' })
		);

		// Clear gallery immediately for next batch
		gallery.forEach((img) => URL.revokeObjectURL(img.thumbnailUrl));
		gallery = [];

		// If in approve mode, go back to shutter
		if (approveMode) {
			pendingBlob = null;
			approveMode = false;
			viewfinder?.unfreeze();
		}

		toast.success(`Batch of ${files.length} photo${files.length === 1 ? '' : 's'} queued for upload`);

		// Submit in background
		submitCaptureBatch(data.projectId, files, {
			maxDimension: settings?.imageMaxDimension ?? null,
			resizeOnUpload: settings?.resizeOnUpload !== false
		});
	}

	function handleClose() {
		goto(`/projects/${data.projectId}`);
	}

	function toggleFlash() {
		flashEnabled = !flashEnabled;
	}

	function flipCamera() {
		facingMode = facingMode === 'environment' ? 'user' : 'environment';
	}
</script>

<div class="fixed inset-0 bg-black select-none touch-manipulation">
	{#if cameraError}
		<!-- Fallback UI -->
		<div class="flex items-center justify-center h-full px-6">
			<div class="bg-card rounded-lg p-6 max-w-sm w-full text-center space-y-4">
				<h2 class="text-lg font-semibold">Camera access unavailable</h2>
				<p class="text-sm text-muted-foreground">{cameraError}</p>
				<div class="flex flex-col gap-2">
					<Button onclick={() => goto(`/projects/${data.projectId}/images/add`)}>
						Use System Camera
					</Button>
					<Button variant="outline" onclick={() => goto(`/projects/${data.projectId}/images/add`)}>
						Upload Files
					</Button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Camera viewfinder -->
		<CameraViewfinder
			bind:this={viewfinder}
			{facingMode}
			{flashEnabled}
			frozen={approveMode}
			onStreamReady={handleStreamReady}
			onError={handleCameraError}
		/>

		<!-- Top Bar -->
		<div class="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] mt-2">
			<!-- Close -->
			<button
				class="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
				onclick={handleClose}
			>
				<X class="h-5 w-5 text-white" />
			</button>

			<div class="flex gap-2">
				<!-- Flash toggle -->
				{#if hasFlash}
					<button
						class="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
						onclick={toggleFlash}
					>
						{#if flashEnabled}
							<Zap class="h-5 w-5 text-yellow-400" />
						{:else}
							<ZapOff class="h-5 w-5 text-white" />
						{/if}
					</button>
				{/if}
				<!-- Camera flip -->
				<button
					class="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
					onclick={flipCamera}
				>
					<SwitchCamera class="h-5 w-5 text-white" />
				</button>
			</div>
		</div>

		<!-- Bottom Controls -->
		<CaptureControls
			{gallery}
			{approveMode}
			{uploadingCount}
			onShutter={handleShutter}
			onApprove={handleApprove}
			onDiscard={handleDiscard}
			onRemoveFromGallery={handleRemoveFromGallery}
			onClearAll={handleClearAll}
			onUploadBatch={handleUploadBatch}
		/>
	{/if}
</div>
