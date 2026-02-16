<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		facingMode: 'user' | 'environment';
		flashEnabled: boolean;
		frozen: boolean;
		onStreamReady?: (stream: MediaStream) => void;
		onError?: (error: string) => void;
	}

	let { facingMode, flashEnabled, frozen, onStreamReady, onError }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let stream: MediaStream | null = $state(null);
	let flashOverlayVisible = $state(false);
	let frozenImageUrl: string | null = $state(null);

	async function initStream() {
		try {
			// Stop existing stream
			if (stream) {
				stream.getTracks().forEach((t) => t.stop());
				stream = null;
			}

			const constraints: MediaStreamConstraints = {
				video: {
					facingMode: { ideal: facingMode },
					width: { ideal: 1920 },
					height: { ideal: 1080 }
				},
				audio: false
			};

			const newStream = await navigator.mediaDevices.getUserMedia(constraints);
			stream = newStream;

			if (videoEl) {
				videoEl.srcObject = newStream;
				await videoEl.play();
			}

			// Try to enable torch if flash is requested
			applyFlash();

			onStreamReady?.(newStream);
		} catch (err: any) {
			console.error('Camera init failed:', err);
			onError?.(err.message || 'Camera access denied');
		}
	}

	function applyFlash() {
		if (!stream) return;
		const track = stream.getVideoTracks()[0];
		if (!track) return;

		const capabilities = track.getCapabilities?.() as any;
		if (capabilities?.torch) {
			track.applyConstraints({
				advanced: [{ torch: flashEnabled } as any]
			}).catch(() => {});
		}
	}

	// Re-apply flash when toggle changes
	$effect(() => {
		flashEnabled;
		applyFlash();
	});

	// Re-init stream when facingMode changes
	$effect(() => {
		facingMode;
		if (videoEl) initStream();
	});

	// Handle visibility change (iOS pauses streams)
	function handleVisibilityChange() {
		if (document.visibilityState === 'visible' && !frozen) {
			initStream();
		}
	}

	onMount(() => {
		initStream();
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (stream) {
				stream.getTracks().forEach((t) => t.stop());
			}
			if (frozenImageUrl) {
				URL.revokeObjectURL(frozenImageUrl);
			}
		};
	});

	/**
	 * Capture a frame from the video as a Blob.
	 * Shows flash animation and freezes the frame.
	 */
	export async function captureFrame(): Promise<Blob | null> {
		if (!videoEl || !canvasEl) return null;

		const vw = videoEl.videoWidth;
		const vh = videoEl.videoHeight;
		if (!vw || !vh) return null;

		canvasEl.width = vw;
		canvasEl.height = vh;
		const ctx = canvasEl.getContext('2d')!;
		ctx.drawImage(videoEl, 0, 0, vw, vh);

		// Flash animation
		flashOverlayVisible = true;
		setTimeout(() => (flashOverlayVisible = false), 150);

		// Freeze: show captured frame
		const blob = await new Promise<Blob | null>((resolve) =>
			canvasEl!.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
		);

		if (blob) {
			if (frozenImageUrl) URL.revokeObjectURL(frozenImageUrl);
			frozenImageUrl = URL.createObjectURL(blob);
		}

		return blob;
	}

	/**
	 * Unfreeze the viewfinder -- resume live video.
	 */
	export function unfreeze() {
		if (frozenImageUrl) {
			URL.revokeObjectURL(frozenImageUrl);
			frozenImageUrl = null;
		}
	}

	export function hasFlashSupport(): boolean {
		if (!stream) return false;
		const track = stream.getVideoTracks()[0];
		if (!track) return false;
		const capabilities = track.getCapabilities?.() as any;
		return !!capabilities?.torch;
	}
</script>

<div class="absolute inset-0 bg-black">
	<!-- Live video feed -->
	<video
		bind:this={videoEl}
		class="absolute inset-0 w-full h-full object-cover"
		class:invisible={frozen && frozenImageUrl}
		autoplay
		playsinline
		muted
	></video>

	<!-- Frozen frame overlay -->
	{#if frozen && frozenImageUrl}
		<img
			src={frozenImageUrl}
			alt=""
			class="absolute inset-0 w-full h-full object-cover"
		/>
	{/if}

	<!-- Flash animation overlay -->
	<div
		class="absolute inset-0 bg-white pointer-events-none transition-opacity duration-150"
		class:opacity-0={!flashOverlayVisible}
		class:opacity-60={flashOverlayVisible}
	></div>

	<!-- Hidden canvas for frame capture -->
	<canvas bind:this={canvasEl} class="hidden"></canvas>
</div>
