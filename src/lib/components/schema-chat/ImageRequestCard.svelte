<script lang="ts">
	import { cn } from '$lib/utils';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Upload, Image, X, Check, FileText } from 'lucide-svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toast } from '$lib/utils/toast';
	import type { ImageRequest } from '$lib/server/schema-chat/types';
	import { convertPdfToImages, isPdfFile } from '$lib/utils/pdf-api';

	interface Props {
		imageRequest: ImageRequest;
		onSubmit: (files: File[]) => void;
		onSkip: () => void;
		disabled?: boolean;
	}

	let { imageRequest, onSubmit, onSkip, disabled = false }: Props = $props();

	let selectedFiles = $state<File[]>([]);
	let pdfFiles = $state<File[]>([]);
	let isDragging = $state(false);
	let isConverting = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);

	const hasFiles = $derived(selectedFiles.length > 0 || pdfFiles.length > 0);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const files = e.dataTransfer?.files;
		if (files) {
			addFiles(Array.from(files));
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files) {
			addFiles(Array.from(input.files));
		}
	}

	function addFiles(files: File[]) {
		const imageFiles = files.filter((f) => f.type.startsWith('image/'));
		const pdfs = files.filter((f) => isPdfFile(f));
		selectedFiles = [...selectedFiles, ...imageFiles];
		pdfFiles = [...pdfFiles, ...pdfs];
	}

	function removeFile(index: number) {
		selectedFiles = selectedFiles.filter((_, i) => i !== index);
	}

	function removePdf(index: number) {
		pdfFiles = pdfFiles.filter((_, i) => i !== index);
	}


	async function handleSubmit() {
		if (!hasFiles) return;

		isConverting = true;
		try {
			const allImages = [...selectedFiles];

			// Convert PDFs to images
			for (const pdf of pdfFiles) {
				toast.info(`Converting ${pdf.name}...`);
				const converted = await convertPdfToImages(pdf);
				allImages.push(...converted);
			}

			onSubmit(allImages);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to process files');
		} finally {
			isConverting = false;
		}
	}

	function openFilePicker() {
		fileInput?.click();
	}
</script>

<Card.Root class="border-primary/50 bg-primary/5">
	<Card.Header class="pb-2">
		<div class="flex items-center gap-2">
			<div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
				<Image class="w-4 h-4 text-primary" />
			</div>
			<Card.Title class="text-sm font-medium">Example Image Requested</Card.Title>
		</div>
	</Card.Header>

	<Card.Content class="space-y-4">
		<p class="text-sm text-muted-foreground">{imageRequest.message}</p>

		{#if imageRequest.lookingFor.length > 0}
			<div class="space-y-1">
				<p class="text-xs font-medium text-muted-foreground">I'll be looking for:</p>
				<ul class="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
					{#each imageRequest.lookingFor as item}
						<li>{item}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Drop zone -->
		<div
			class={cn(
				"border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer",
				isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/25"
			)}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			onclick={openFilePicker}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && openFilePicker()}
		>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*,.pdf"
				multiple
				class="hidden"
				onchange={handleFileSelect}
				disabled={disabled || isConverting}
			/>

			<Upload class="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">
				Drop images or PDFs here, or click to browse
			</p>
			<p class="text-xs text-muted-foreground mt-1">
				PDFs will be converted to images automatically
			</p>
		</div>

		<!-- Selected files preview -->
		{#if hasFiles}
			<div class="space-y-2">
				<p class="text-xs font-medium text-muted-foreground">
					{selectedFiles.length + pdfFiles.length} {selectedFiles.length + pdfFiles.length === 1 ? 'file' : 'files'} selected
				</p>
				<div class="flex flex-wrap gap-2">
					<!-- PDFs -->
					{#each pdfFiles as file, index}
						<div class="relative group">
							<div class="w-16 h-16 rounded border bg-muted overflow-hidden flex items-center justify-center">
								<FileText class="w-8 h-8 text-muted-foreground" />
							</div>
							<button
								type="button"
								class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
								onclick={() => removePdf(index)}
							>
								<X class="w-3 h-3" />
							</button>
							<p class="text-xs truncate w-16 mt-1">{file.name}</p>
						</div>
					{/each}
					<!-- Images -->
					{#each selectedFiles as file, index}
						<div class="relative group">
							<div class="w-16 h-16 rounded border bg-muted overflow-hidden">
								<img
									src={URL.createObjectURL(file)}
									alt={file.name}
									class="w-full h-full object-cover"
								/>
							</div>
							<button
								type="button"
								class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
								onclick={() => removeFile(index)}
							>
								<X class="w-3 h-3" />
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</Card.Content>

	<Card.Footer class="pt-0 gap-2">
		<Button size="sm" variant="default" onclick={handleSubmit} disabled={disabled || !hasFiles || isConverting} class="flex-1">
			{#if isConverting}
				<Spinner class="w-4 h-4 mr-1" />
				Converting...
			{:else}
				<Check class="w-4 h-4 mr-1" />
				Submit {hasFiles ? `(${selectedFiles.length + pdfFiles.length})` : ''}
			{/if}
		</Button>
		<Button size="sm" variant="ghost" onclick={onSkip} disabled={disabled || isConverting}>
			Skip for now
		</Button>
	</Card.Footer>
</Card.Root>
