<script lang="ts">
	import { X, Check, Loader2 } from 'lucide-svelte';

	interface CapturedImage {
		id: string;
		blob: Blob;
		thumbnailUrl: string;
	}

	interface Props {
		gallery: CapturedImage[];
		approveMode: boolean;
		uploadingCount: number;
		onShutter: () => void;
		onApprove: () => void;
		onDiscard: () => void;
		onRemoveFromGallery: (id: string) => void;
		onClearAll: () => void;
		onUploadBatch: () => void;
	}

	let {
		gallery,
		approveMode,
		uploadingCount,
		onShutter,
		onApprove,
		onDiscard,
		onRemoveFromGallery,
		onClearAll,
		onUploadBatch
	}: Props = $props();

	let galleryStripEl: HTMLDivElement | undefined = $state();

	// Auto-scroll gallery strip to end when new images added
	$effect(() => {
		gallery.length;
		if (galleryStripEl) {
			requestAnimationFrame(() => {
				galleryStripEl!.scrollLeft = galleryStripEl!.scrollWidth;
			});
		}
	});
</script>

<div class="absolute bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
	<div class="bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-16 px-4 pb-4">
		<!-- Uploading indicator -->
		{#if uploadingCount > 0}
			<div class="flex items-center gap-2 justify-center pb-2">
				<Loader2 class="h-3 w-3 animate-spin text-white/50" />
				<span class="text-xs text-white/50">
					Uploading {uploadingCount} batch{uploadingCount === 1 ? '' : 'es'}...
				</span>
			</div>
		{/if}

		<!-- Gallery Strip -->
		{#if gallery.length > 0}
			<div
				bind:this={galleryStripEl}
				class="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
				style="touch-action: pan-x"
			>
				{#each gallery as img (img.id)}
					<div class="relative shrink-0 animate-slide-in">
						<img
							src={img.thumbnailUrl}
							alt=""
							class="h-14 w-14 rounded-lg border-2 border-white/30 object-cover"
						/>
						<button
							class="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center
								{approveMode ? 'pointer-events-none opacity-30' : ''}"
							onclick={() => onRemoveFromGallery(img.id)}
							disabled={approveMode}
						>
							<X class="h-3 w-3 text-white" />
						</button>
					</div>
				{/each}
			</div>

			<!-- Counter + Clear Row -->
			<div class="flex items-center justify-between px-1 py-1">
				<span class="text-sm text-white/70 font-medium">
					{gallery.length} photo{gallery.length === 1 ? '' : 's'}
				</span>
				<button
					class="text-sm text-white/50 hover:text-white/80 transition-colors
						{approveMode ? 'pointer-events-none opacity-30' : ''}"
					onclick={onClearAll}
					disabled={approveMode}
				>
					Clear All
				</button>
			</div>
		{/if}

		<!-- Controls Row -->
		<div class="flex items-center justify-between pt-2">
			<!-- Left: Discard (only in approve mode) -->
			{#if approveMode}
				<button
					class="h-12 w-12 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center transition-opacity duration-150"
					onclick={onDiscard}
				>
					<X class="h-6 w-6 text-white" />
				</button>
			{:else}
				<div class="w-12"></div>
			{/if}

			<!-- Center: Shutter / Approve -->
			{#if approveMode}
				<button
					class="h-[72px] w-[72px] rounded-full bg-green-500 flex items-center justify-center transition-colors duration-150 active:scale-95"
					onclick={onApprove}
				>
					<Check class="h-8 w-8 text-white" />
				</button>
			{:else}
				<button
					class="h-[72px] w-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-[0.85] transition-transform duration-75"
					onclick={onShutter}
					aria-label="Take photo"
				>
					<div class="h-[56px] w-[56px] rounded-full bg-white"></div>
				</button>
			{/if}

			<!-- Right: Upload Batch -->
			<button
				class="rounded-full px-4 h-10 text-sm font-medium transition-colors {gallery.length > 0 && !approveMode
					? 'bg-white text-black'
					: 'bg-white/10 text-white/30 pointer-events-none'}"
				onclick={onUploadBatch}
				disabled={gallery.length === 0 || approveMode}
			>
				Upload ({gallery.length})
			</button>
		</div>
	</div>
</div>

<style>
	@keyframes slide-in {
		from {
			transform: translateX(20px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.animate-slide-in {
		animation: slide-in 200ms ease-out;
	}

	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
