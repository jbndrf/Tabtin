<script lang="ts">
	import { page } from '$app/stores';
	import { Camera, Upload, X, Trash2, FileText } from 'lucide-svelte';
	import { t } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Spinner } from '$lib/components/ui/spinner';
	import { pb } from '$lib/stores/auth';
	import { toast } from '$lib/utils/toast';

	// Helper to check if file is PDF
	function isPdfFile(file: File): boolean {
		return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
	}

	let projectId = $page.params.id as string;

	// State for managing images
	let selectedImages = $state<{ id: string; url: string; file: File; isPdf?: boolean }[]>([]);
	let fileInput: HTMLInputElement;
	let cameraInput: HTMLInputElement;
	let isSubmitting = $state(false);
	let uploadProgress = $state({ current: 0, total: 0 });

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

	// Handle form submission
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

			// Step 2: Upload all images to the batch sequentially with progress tracking
			for (let index = 0; index < selectedImages.length; index++) {
				const img = selectedImages[index];

				// Create record data with file
				// Note: order starts at 1 because PocketBase treats 0 as blank for required number fields
				const recordData: any = {
					batch: batch.id,
					order: index + 1,
					image: img.file
				};

				console.log('Uploading image:', { batchId: batch.id, fileName: img.file.name, order: index });
				console.log('Record data:', recordData);

				try {
					const result = await pb.collection('images').create(recordData);
					console.log('Upload result:', result);
				} catch (err: any) {
					console.error('Upload error details:', {
						message: err.message,
						status: err.status,
						data: err.data,
						response: err.response
					});
					console.error('Detailed data object:', JSON.stringify(err.data, null, 2));
					throw err;
				}

				// Update progress
				uploadProgress = { current: index + 1, total: selectedImages.length };
			}

			// Step 3: Add batch to background processing queue
			await fetch('/api/queue/enqueue', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchId: batch.id,
					projectId: projectId,
					priority: 10
				})
			});

			// Step 4: Clear the gallery view
			clearAll();

			// Step 5: Navigate back to project page and scroll to bottom
			window.location.href = `/projects/${projectId}?scrollToBottom=true`;
		} catch (error) {
			console.error('Failed to upload images:', error);
			// TODO: Show error toast/notification
		} finally {
			isSubmitting = false;
			uploadProgress = { current: 0, total: 0 };
		}
	}

	// Auto-trigger camera if autoCamera parameter is present
	let hasAutoTriggered = $state(false);

	$effect(() => {
		if (hasAutoTriggered) return;

		const url = new URL(window.location.href);
		const autoCamera = url.searchParams.get('autoCamera');

		if (autoCamera === 'true' && cameraInput) {
			hasAutoTriggered = true;

			// Clean up URL parameter immediately
			url.searchParams.delete('autoCamera');
			window.history.replaceState({}, '', url.toString());

			// Trigger camera after a short delay to ensure input is mounted
			setTimeout(() => {
				cameraInput.click();
			}, 150);
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

	<!-- Main Content -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if selectedImages.length === 0}
			<!-- Empty State -->
			<div class="flex h-full min-h-[400px] items-center justify-center">
				<Card class="w-full max-w-md border-dashed">
					<CardContent class="flex flex-col items-center justify-center py-12 text-center">
						<Camera class="mb-4 h-16 w-16 text-muted-foreground" />
						<h3 class="mb-2 text-lg font-medium">{t('images.add.empty_state')}</h3>
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
					</CardContent>
				</Card>
			</div>
		{:else}
			<!-- Image Grid -->
			<div class="space-y-4">
				<!-- Action Bar -->
				<div class="flex items-center justify-between">
					<p class="text-sm font-medium text-muted-foreground">
						{t('images.add.selected_count', { count: selectedImages.length })}
					</p>
					<Button variant="ghost" size="sm" onclick={clearAll}>
						<Trash2 class="mr-2 h-4 w-4" />
						{t('images.add.clear_all')}
					</Button>
				</div>

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
				<Button
					class="flex-1"
					disabled={isSubmitting}
					onclick={handleSubmit}
				>
					{isSubmitting ? 'Uploading...' : t('images.add.submit_button')}
				</Button>
			</div>
		</div>
	{/if}
</div>
