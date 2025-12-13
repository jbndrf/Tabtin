<script lang="ts">
	import { page } from '$app/stores';
	import { Camera, Upload, X, Trash2, FileText, AlertTriangle } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import { pb } from '$lib/stores/auth';
	import { toast } from '$lib/utils/toast';
	import { isPdfFile } from '$lib/utils/pdf-api';
	import type { AddonFileData } from '$lib/types/addon';

	let projectId = $page.params.id as string;

	// Tab state: 'single' = Add Batch, 'bulk' = Bulk Upload
	let activeTab = $state<'single' | 'bulk'>('single');

	// State for managing images
	let selectedImages = $state<{ id: string; url: string; file: File; isPdf?: boolean }[]>([]);
	let fileInput: HTMLInputElement;
	let cameraInput: HTMLInputElement;
	let isSubmitting = $state(false);
	let uploadProgress = $state({ current: 0, total: 0 });

	// Drag and drop state
	let isDragging = $state(false);

	// Handle file selection from gallery
	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			await addFiles(Array.from(input.files));
			// Reset input to allow selecting the same files again
			input.value = '';
		}
	}

	// Handle camera capture
	function handleCameraCapture(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files) {
			addFiles(Array.from(input.files));
			// Reset input to allow capturing again
			input.value = '';
		}
	}

	// Generate a unique ID (fallback for browsers without crypto.randomUUID)
	function generateId(): string {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID();
		}
		return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
	}

	// Add files to the selected images array (handles both images and PDFs)
	async function addFiles(files: File[]) {
		const newFiles = files.map((file) => ({
			id: generateId(),
			url: URL.createObjectURL(file),
			file,
			isPdf: isPdfFile(file)
		}));

		selectedImages = [...selectedImages, ...newFiles];

		// Show info message about PDFs
		const pdfCount = newFiles.filter(f => f.isPdf).length;
		if (pdfCount > 0) {
			toast.info(`${pdfCount} PDF file(s) added. They will be converted to images (600 DPI) during processing.`);
		}
	}

	// Remove a specific image
	function removeImage(id: string) {
		const image = selectedImages.find((img) => img.id === id);
		if (image) {
			URL.revokeObjectURL(image.url);
		}
		selectedImages = selectedImages.filter((img) => img.id !== id);
	}

	// Clear all images
	function clearAll() {
		selectedImages.forEach((img) => URL.revokeObjectURL(img.url));
		selectedImages = [];
	}

	// Drag and drop handlers
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		isDragging = false;

		if (e.dataTransfer?.files?.length) {
			addFiles(Array.from(e.dataTransfer.files));
		}
	}

	// Handle form submission (single batch mode)
	async function handleSubmit() {
		if (selectedImages.length === 0) return;

		try {
			isSubmitting = true;
			uploadProgress = { current: 0, total: selectedImages.length };

			// Step 1: Create a batch record with status 'pending'
			const batch = await pb.collection('image_batches').create({
				project: projectId,
				status: 'pending'
			});

			// Step 2: Upload images in parallel chunks for better performance
			// Using chunks of 3 to balance speed vs server load
			const CHUNK_SIZE = 3;
			let completedCount = 0;

			for (let i = 0; i < selectedImages.length; i += CHUNK_SIZE) {
				const chunk = selectedImages.slice(i, i + CHUNK_SIZE);

				await Promise.all(
					chunk.map(async (img, chunkIdx) => {
						const index = i + chunkIdx;
						const recordData: any = {
							batch: batch.id,
							order: index + 1,
							image: img.file
						};

						try {
							await pb.collection('images').create(recordData, {
								$autoCancel: false // CRITICAL: Disable auto-cancel for parallel requests
							});
							completedCount++;
							uploadProgress = { current: completedCount, total: selectedImages.length };
						} catch (err: any) {
							console.error('Upload error details:', {
								message: err.message,
								status: err.status,
								data: err.data,
								response: err.response
							});
							throw err;
						}
					})
				);
			}

			// Step 3: Add batch to background processing queue
			const enqueueResponse = await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchId: batch.id,
					projectId: projectId,
					priority: 10
				})
			});

			if (!enqueueResponse.ok) {
				const errorData = await enqueueResponse.json().catch(() => ({}));
				console.error('Failed to enqueue batch:', errorData);
				toast.error('Failed to queue batch for processing. Please try again.');
				return;
			}

			const enqueueResult = await enqueueResponse.json();
			if (!enqueueResult.success) {
				console.error('Enqueue failed:', enqueueResult.error);
				toast.error(enqueueResult.error || 'Failed to queue batch');
				return;
			}

			// Step 4: Clear the gallery view
			clearAll();

			// Step 5: Navigate back to project page and scroll to bottom
			window.location.href = `/projects/${projectId}?scrollToBottom=true`;
		} catch (error) {
			console.error('Failed to upload images:', error);
			toast.error('Failed to upload images');
		} finally {
			isSubmitting = false;
			uploadProgress = { current: 0, total: 0 };
		}
	}

	// Handle bulk upload submission (each file = separate batch)
	async function handleBulkSubmit() {
		if (selectedImages.length === 0) return;

		try {
			isSubmitting = true;
			uploadProgress = { current: 0, total: selectedImages.length };

			const createdBatchIds: string[] = [];

			// Process files in parallel chunks for better performance
			const CHUNK_SIZE = 3;
			let completedCount = 0;

			for (let i = 0; i < selectedImages.length; i += CHUNK_SIZE) {
				const chunk = selectedImages.slice(i, i + CHUNK_SIZE);

				const chunkBatchIds = await Promise.all(
					chunk.map(async (img) => {
						// Create batch
						const batch = await pb.collection('image_batches').create({
							project: projectId,
							status: 'pending'
						}, {
							$autoCancel: false
						});

						// Upload single image to batch
						await pb.collection('images').create({
							batch: batch.id,
							order: 1,
							image: img.file
						}, {
							$autoCancel: false
						});

						completedCount++;
						uploadProgress = { current: completedCount, total: selectedImages.length };

						return batch.id;
					})
				);

				createdBatchIds.push(...chunkBatchIds);
			}

			// Enqueue all batches at once
			const enqueueResponse = await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchIds: createdBatchIds,
					projectId: projectId,
					priority: 10
				})
			});

			if (!enqueueResponse.ok) {
				const errorData = await enqueueResponse.json().catch(() => ({}));
				console.error('Failed to enqueue batches:', errorData);
				toast.error('Failed to queue batches for processing. Please try again.');
				return;
			}

			const enqueueResult = await enqueueResponse.json();
			if (!enqueueResult.success) {
				console.error('Enqueue failed:', enqueueResult.error);
				toast.error(enqueueResult.error || 'Failed to queue batches');
				return;
			}

			// Clear and navigate
			clearAll();
			toast.success(`Created ${createdBatchIds.length} batch${createdBatchIds.length === 1 ? '' : 'es'}`);
			window.location.href = `/projects/${projectId}?scrollToBottom=true`;
		} catch (error) {
			console.error('Failed to bulk upload:', error);
			toast.error('Failed to upload files');
		} finally {
			isSubmitting = false;
			uploadProgress = { current: 0, total: 0 };
		}
	}

	// Helper to convert base64 back to File (handles both raw base64 and data URLs)
	function base64ToFile(base64: string, filename: string, mimeType: string): File {
		// Handle both raw base64 and data URL format
		let rawBase64 = base64;
		if (base64.includes(',')) {
			// Data URL format: data:mime/type;base64,ABC123...
			rawBase64 = base64.split(',')[1];
		}
		const bstr = atob(rawBase64);
		let n = bstr.length;
		const u8arr = new Uint8Array(n);
		while (n--) {
			u8arr[n] = bstr.charCodeAt(n);
		}
		return new File([u8arr], filename, { type: mimeType });
	}

	// Load pending images from sessionStorage (from projects page camera capture)
	async function loadPendingImages(filesData: { name: string; type: string; data: string }[]) {
		const files = filesData.map((f) => base64ToFile(f.data, f.name, f.type));
		await addFiles(files);
	}

	// Handle files received from addon panels (via addon-bridge ADDON_FILES message)
	function handleAddonFilesReceived(event: CustomEvent<{ files: AddonFileData[] }>) {
		const { files } = event.detail;
		if (!files || files.length === 0) return;

		// Convert base64 files to File objects and add to queue
		const convertedFiles = files.map((f) => base64ToFile(f.base64, f.filename, f.mimeType));
		addFiles(convertedFiles);

		// Switch to bulk mode so each file becomes its own batch
		activeTab = 'bulk';

		toast.success(`${files.length} document${files.length !== 1 ? 's' : ''} imported`);
	}

	// Load images from sessionStorage if fromCamera parameter is present
	let hasLoadedFromStorage = $state(false);

	$effect(() => {
		if (hasLoadedFromStorage) return;

		const url = new URL(window.location.href);
		const fromCamera = url.searchParams.get('fromCamera');

		if (fromCamera === 'true') {
			hasLoadedFromStorage = true;

			// Clean up URL parameter
			url.searchParams.delete('fromCamera');
			window.history.replaceState({}, '', url.toString());

			// Load images from sessionStorage
			const pendingData = sessionStorage.getItem('pendingImages');
			if (pendingData) {
				sessionStorage.removeItem('pendingImages');
				try {
					const filesData = JSON.parse(pendingData);
					loadPendingImages(filesData);
				} catch (e) {
					console.error('Failed to parse pending images:', e);
				}
			}
		}
	});

	// Listen for camera trigger events from mobile nav (when already on this page)
	$effect(() => {
		function handleTriggerCamera() {
			if (cameraInput) {
				cameraInput.click();
			}
		}

		window.addEventListener('trigger-camera', handleTriggerCamera);

		return () => {
			window.removeEventListener('trigger-camera', handleTriggerCamera);
		};
	});

	// Cleanup URLs on component destroy
	$effect(() => {
		return () => {
			selectedImages.forEach((img) => URL.revokeObjectURL(img.url));
		};
	});

	// Listen for files from addon panels (via addon-bridge)
	$effect(() => {
		window.addEventListener(
			'addon-files-received',
			handleAddonFilesReceived as EventListener
		);

		return () => {
			window.removeEventListener(
				'addon-files-received',
				handleAddonFilesReceived as EventListener
			);
		};
	});
</script>

<!-- Hidden file inputs -->
<input
	bind:this={cameraInput}
	type="file"
	accept="image/*"
	capture="environment"
	multiple
	class="hidden"
	onchange={handleCameraCapture}
/>

<input
	bind:this={fileInput}
	type="file"
	accept="image/*,application/pdf"
	multiple
	class="hidden"
	onchange={handleFileSelect}
/>

<div class="relative flex h-full w-full flex-col">
	<!-- Upload Loading Overlay -->
	{#if isSubmitting}
		<div class="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
			<Card class="w-full max-w-sm">
				<CardContent class="flex flex-col items-center justify-center py-8 text-center">
					<Spinner class="mb-4 h-12 w-12" />
					<h3 class="mb-2 text-lg font-semibold">Uploading Images</h3>
					<p class="text-sm text-muted-foreground">
						{uploadProgress.current} of {uploadProgress.total} uploaded
					</p>
					<div class="mt-4 w-full">
						<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="h-full bg-primary transition-all duration-300"
								style="width: {(uploadProgress.current / uploadProgress.total) * 100}%"
							></div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}

	<!-- Header -->
	<div class="border-b bg-background px-4 py-4">
		<h1 class="text-xl font-semibold">{t('images.add.title')}</h1>
		<p class="mt-1 text-sm text-muted-foreground">{t('images.add.subtitle')}</p>
	</div>

	<!-- Tabs -->
	<div class="border-b bg-background px-4">
		<Tabs.Root bind:value={activeTab}>
			<Tabs.List class="w-full justify-start">
				<Tabs.Trigger value="single">Add Batch</Tabs.Trigger>
				<Tabs.Trigger value="bulk">Bulk Upload</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
	</div>

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto p-4">
		<!-- Bulk Upload Warning -->
		{#if activeTab === 'bulk'}
			<div class="mb-4 flex items-start gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4">
				<AlertTriangle class="h-5 w-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
				<div>
					<p class="font-medium text-yellow-700 dark:text-yellow-300">One file = one batch</p>
					<p class="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
						Each file will become its own batch. The AI will process each file independently and won't know if multiple images belong to the same document.
					</p>
				</div>
			</div>
		{/if}

		{#if selectedImages.length === 0}
			<!-- Empty State with Drag & Drop -->
			<div class="flex h-full min-h-[400px] items-center justify-center">
				<div
					class="w-full max-w-md rounded-lg border-2 border-dashed p-8 transition-colors {isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}"
					ondragover={handleDragOver}
					ondragleave={handleDragLeave}
					ondrop={handleDrop}
					role="region"
					aria-label="Drop zone"
				>
					<div class="flex flex-col items-center justify-center text-center">
						<Camera class="mb-4 h-16 w-16 text-muted-foreground" />
						<h3 class="mb-2 text-lg font-medium">
							{isDragging ? 'Drop files here' : t('images.add.empty_state')}
						</h3>
						<p class="mb-6 text-sm text-muted-foreground">
							{t('images.add.empty_description')}
						</p>
						<div class="flex w-full flex-col gap-3">
							<Button
								size="lg"
								class="w-full"
								onclick={() => cameraInput.click()}
							>
								<Camera class="mr-2 h-5 w-5" />
								{t('images.add.camera_button')}
							</Button>
							<Button
								variant="outline"
								size="lg"
								class="w-full"
								onclick={() => fileInput.click()}
							>
								<Upload class="mr-2 h-5 w-5" />
								Upload Images or PDFs
							</Button>
						</div>
						<p class="mt-4 text-xs text-muted-foreground">
							Supported: JPG, PNG, PDF (auto-converted to images)
						</p>
						<p class="mt-2 text-xs text-muted-foreground">
							Or drag and drop files here
						</p>
					</div>
				</div>
			</div>
		{:else}
			<!-- Image Grid with Drag & Drop -->
			<div
				class="space-y-4"
				ondragover={handleDragOver}
				ondragleave={handleDragLeave}
				ondrop={handleDrop}
			>
				<!-- Action Bar -->
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-muted-foreground">
						{t('images.add.selected_count', { count: selectedImages.length })}
						{#if activeTab === 'bulk'}
							<span class="ml-1">({selectedImages.length} batch{selectedImages.length === 1 ? '' : 'es'} will be created)</span>
						{/if}
					</p>
					<Button variant="ghost" size="sm" onclick={clearAll}>
						<Trash2 class="mr-2 h-4 w-4" />
						{t('images.add.clear_all')}
					</Button>
				</div>

				<!-- Drag indicator -->
				{#if isDragging}
					<div class="rounded-lg border-2 border-dashed border-primary bg-primary/5 p-8 text-center">
						<p class="text-sm font-medium text-primary">Drop files to add more</p>
					</div>
				{/if}

				<!-- Image Grid -->
				<div class="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
					{#each selectedImages as image (image.id)}
						<div class="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
							{#if image.isPdf}
								<!-- PDF file preview -->
								<div class="flex h-full w-full items-center justify-center bg-muted">
									<FileText class="h-16 w-16 text-muted-foreground" />
								</div>
								<div class="absolute bottom-2 left-2 z-10">
									<div class="rounded-md bg-blue-500/90 backdrop-blur-sm px-2 py-1 text-xs font-medium text-white shadow-lg flex items-center gap-1">
										<FileText class="h-3 w-3" />
										<span>PDF</span>
									</div>
								</div>
							{:else}
								<!-- Image file preview -->
								<img
									src={image.url}
									alt="Preview"
									class="h-full w-full object-cover"
								/>
							{/if}
							<!-- Always visible delete button on mobile, hover on desktop -->
							<button
								onclick={() => removeImage(image.id)}
								class="absolute right-2 top-2 rounded-full bg-destructive p-2 text-destructive-foreground shadow-lg transition-all hover:scale-110 active:scale-95 md:opacity-0 md:group-hover:opacity-100"
								aria-label={t('images.add.remove_image')}
							>
								<X class="h-5 w-5" />
							</button>
						</div>
					{/each}
				</div>

				<!-- Add More Button -->
				<div class="flex gap-3">
					<Button
						variant="outline"
						class="flex-1"
						onclick={() => cameraInput.click()}
					>
						<Camera class="mr-2 h-4 w-4" />
						{t('images.add.camera_button')}
					</Button>
					<Button
						variant="outline"
						class="flex-1"
						onclick={() => fileInput.click()}
					>
						<Upload class="mr-2 h-4 w-4" />
						{t('images.add.upload_button')}
					</Button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Bottom Action Bar -->
	{#if selectedImages.length > 0}
		<div class="border-t bg-background p-4">
			<div class="flex gap-3">
				<Button
					variant="outline"
					class="flex-1"
					disabled={isSubmitting}
					onclick={() => (window.location.href = `/projects/${projectId}`)}
				>
					{t('images.add.cancel_button')}
				</Button>
				{#if activeTab === 'single'}
					<Button
						class="flex-1"
						disabled={isSubmitting}
						onclick={handleSubmit}
					>
						{isSubmitting ? 'Uploading...' : t('images.add.submit_button')}
					</Button>
				{:else}
					<Button
						class="flex-1"
						disabled={isSubmitting}
						onclick={handleBulkSubmit}
					>
						{isSubmitting ? 'Uploading...' : `Create ${selectedImages.length} Batch${selectedImages.length === 1 ? '' : 'es'}`}
					</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>
