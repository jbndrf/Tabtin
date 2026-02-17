<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { on } from 'svelte/events';

	interface Props {
		facingMode: 'user' | 'environment';
		flashEnabled: boolean;
		frozen: boolean;
		captureMaxDimension?: number | null;
		captureQuality?: number; // 0-1, default 0.92
		onStreamReady?: (stream: MediaStream) => void;
		onError?: (error: string) => void;
		onZoomChange?: (level: number) => void;
	}

	let { facingMode, flashEnabled, frozen, captureMaxDimension, captureQuality, onStreamReady, onError, onZoomChange }: Props = $props();

	let videoEl: HTMLVideoElement | undefined = $state();
	let canvasEl: HTMLCanvasElement | undefined = $state();
	let containerEl: HTMLDivElement | undefined = $state();
	let stream: MediaStream | null = $state(null);
	let flashOverlayVisible = $state(false);
	let frozenImageUrl: string | null = $state(null);

	// Zoom state
	let currentZoom = $state(1);
	let zoomMin = $state(1);
	let zoomMax = $state(1);
	let supportsHardwareZoom = $state(false);
	let supportsFocusMode = $state(false);
	let supportsPointsOfInterest = $state(false);
	let isPinching = $state(false);
	let lastPinchDistance = 0;
	let pinchBaseZoom = 1;

	// Tap-to-focus state
	let focusPos = $state<{ x: number; y: number } | null>(null);
	let focusKey = $state(0);
	let tapStartTime = 0;
	let tapStartX = 0;
	let tapStartY = 0;
	let wasPinching = false;
	let focusTimeout: ReturnType<typeof setTimeout> | null = null;

	async function initStream() {
		try {
			// Stop existing stream
			if (stream) {
				stream.getTracks().forEach((t) => t.stop());
				stream = null;
			}

			// Reset zoom/focus state
			currentZoom = 1;
			zoomMin = 1;
			zoomMax = 1;
			supportsHardwareZoom = false;
			supportsFocusMode = false;
			supportsPointsOfInterest = false;

			const constraints: MediaStreamConstraints = {
				video: {
					facingMode: { ideal: facingMode },
					width: { ideal: 1080 },
					height: { ideal: 1920 }
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

			// Detect zoom capabilities
			const track = newStream.getVideoTracks()[0];
			if (track) {
				const capabilities = track.getCapabilities?.() as any;
				if (capabilities?.zoom) {
					supportsHardwareZoom = true;
					zoomMin = capabilities.zoom.min;
					zoomMax = capabilities.zoom.max;
					// Force 1x zoom -- some phones default to 2x telephoto
					track.applyConstraints({
						advanced: [{ zoom: capabilities.zoom.min } as any]
					}).catch(() => {});
				}
				if (capabilities?.focusMode?.length > 0) {
					supportsFocusMode = true;
				}
				if (capabilities?.pointsOfInterest) {
					supportsPointsOfInterest = true;
				}
			}

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

	function applyZoom(level: number) {
		if (supportsHardwareZoom) {
			const clamped = Math.min(Math.max(level, zoomMin), zoomMax);
			currentZoom = clamped;
			const track = stream?.getVideoTracks()[0];
			if (track) {
				track.applyConstraints({
					advanced: [{ zoom: clamped } as any]
				}).catch(() => {});
			}
		} else {
			// Digital zoom fallback -- clamp 1x to 5x
			currentZoom = Math.min(Math.max(level, 1), 5);
		}
		onZoomChange?.(currentZoom);
	}

	// Pinch helpers
	function getPinchDistance(t1: Touch, t2: Touch): number {
		const dx = t1.clientX - t2.clientX;
		const dy = t1.clientY - t2.clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function handleTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) {
			isPinching = true;
			wasPinching = true;
			lastPinchDistance = getPinchDistance(e.touches[0], e.touches[1]);
			pinchBaseZoom = currentZoom;
		} else if (e.touches.length === 1) {
			wasPinching = false;
			tapStartTime = Date.now();
			tapStartX = e.touches[0].clientX;
			tapStartY = e.touches[0].clientY;
		}
	}

	function handleTouchMove(e: TouchEvent) {
		if (e.touches.length === 2 && isPinching) {
			e.preventDefault();
			const distance = getPinchDistance(e.touches[0], e.touches[1]);
			const scale = distance / lastPinchDistance;
			applyZoom(pinchBaseZoom * scale);
			lastPinchDistance = distance;
			pinchBaseZoom = currentZoom;
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (e.touches.length < 2) {
			isPinching = false;
		}
		// Tap-to-focus detection: single finger, short duration, minimal movement
		if (e.touches.length === 0 && !wasPinching) {
			const elapsed = Date.now() - tapStartTime;
			const changedTouch = e.changedTouches[0];
			if (changedTouch && elapsed < 300) {
				const dx = changedTouch.clientX - tapStartX;
				const dy = changedTouch.clientY - tapStartY;
				if (Math.sqrt(dx * dx + dy * dy) < 15) {
					handleTapToFocus(changedTouch.clientX, changedTouch.clientY);
				}
			}
		}
	}

	async function handleTapToFocus(clientX: number, clientY: number) {
		if (!containerEl || !videoEl) return;

		const rect = containerEl.getBoundingClientRect();

		// Show focus ring at tap position (relative to container)
		focusPos = { x: clientX - rect.left, y: clientY - rect.top };
		focusKey++;

		// Auto-hide
		if (focusTimeout) clearTimeout(focusTimeout);
		focusTimeout = setTimeout(() => {
			focusPos = null;
		}, 1200);

		// Calculate normalized coordinates (0-1) accounting for object-cover crop
		const containerW = rect.width;
		const containerH = rect.height;
		const vw = videoEl.videoWidth;
		const vh = videoEl.videoHeight;
		if (!vw || !vh) return;

		const containerAspect = containerW / containerH;
		const videoAspect = vw / vh;

		let displayW: number, displayH: number, offsetX: number, offsetY: number;

		if (videoAspect > containerAspect) {
			// Video wider -- cropped left/right
			displayH = containerH;
			displayW = containerH * videoAspect;
			offsetX = (containerW - displayW) / 2;
			offsetY = 0;
		} else {
			// Video taller -- cropped top/bottom
			displayW = containerW;
			displayH = containerW / videoAspect;
			offsetX = 0;
			offsetY = (containerH - displayH) / 2;
		}

		const normX = Math.max(0, Math.min(1, (clientX - rect.left - offsetX) / displayW));
		const normY = Math.max(0, Math.min(1, (clientY - rect.top - offsetY) / displayH));

		// Apply focus (only when device actually supports it)
		const track = stream?.getVideoTracks()[0];
		if (track && supportsFocusMode) {
			try {
				const focusConstraints: any = { focusMode: 'single-shot' };
				if (supportsPointsOfInterest) {
					focusConstraints.pointsOfInterest = [{ x: normX, y: normY }];
				}
				await track.applyConstraints({ advanced: [focusConstraints] });
			} catch {
				// Silently ignore unsupported focus
			}
		}
	}

	// Register touch handlers with passive: false for touchmove
	$effect(() => {
		if (!containerEl) return;
		const offStart = on(containerEl, 'touchstart', handleTouchStart);
		const offMove = on(containerEl, 'touchmove', handleTouchMove, { passive: false });
		const offEnd = on(containerEl, 'touchend', handleTouchEnd);
		return () => {
			offStart();
			offMove();
			offEnd();
		};
	});

	// Re-apply flash when toggle changes
	$effect(() => {
		flashEnabled;
		applyFlash();
	});

	// Re-init stream when facingMode changes
	$effect(() => {
		facingMode;
		const el = videoEl;
		if (el) {
			untrack(() => initStream());
		}
	});

	// Handle visibility change (iOS pauses streams)
	function handleVisibilityChange() {
		if (document.visibilityState === 'visible' && !frozen) {
			initStream();
		}
	}

	onMount(() => {
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (stream) {
				stream.getTracks().forEach((t) => t.stop());
			}
			if (frozenImageUrl) {
				URL.revokeObjectURL(frozenImageUrl);
			}
			if (focusTimeout) clearTimeout(focusTimeout);
		};
	});

	/**
	 * Capture a frame from the video as a Blob.
	 * Captures only the visible crop (matching object-cover display) and accounts for digital zoom.
	 */
	export async function captureFrame(): Promise<Blob | null> {
		if (!videoEl || !canvasEl) return null;

		const vw = videoEl.videoWidth;
		const vh = videoEl.videoHeight;
		if (!vw || !vh) return null;

		const container = videoEl.parentElement!;
		const containerW = container.offsetWidth;
		const containerH = container.offsetHeight;
		const containerAspect = containerW / containerH;
		const videoAspect = vw / vh;

		let sx: number, sy: number, sw: number, sh: number;

		if (videoAspect > containerAspect) {
			// Video wider than container -- crop left/right
			sh = vh;
			sw = vh * containerAspect;
			sx = (vw - sw) / 2;
			sy = 0;
		} else {
			// Video taller than container -- crop top/bottom
			sw = vw;
			sh = vw / containerAspect;
			sx = 0;
			sy = (vh - sh) / 2;
		}

		// Account for digital zoom (CSS transform fallback)
		if (!supportsHardwareZoom && currentZoom > 1) {
			const zoomedW = sw / currentZoom;
			const zoomedH = sh / currentZoom;
			sx += (sw - zoomedW) / 2;
			sy += (sh - zoomedH) / 2;
			sw = zoomedW;
			sh = zoomedH;
		}

		sx = Math.round(sx);
		sy = Math.round(sy);
		sw = Math.round(sw);
		sh = Math.round(sh);

		// Downscale to target dimension if configured
		let outW = sw;
		let outH = sh;
		if (captureMaxDimension && Math.max(sw, sh) > captureMaxDimension) {
			const scale = captureMaxDimension / Math.max(sw, sh);
			outW = Math.round(sw * scale);
			outH = Math.round(sh * scale);
		}

		canvasEl.width = outW;
		canvasEl.height = outH;
		const ctx = canvasEl.getContext('2d')!;
		ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, outW, outH);

		// Flash animation
		flashOverlayVisible = true;
		setTimeout(() => (flashOverlayVisible = false), 150);

		// Freeze: show captured frame
		const blob = await new Promise<Blob | null>((resolve) =>
			canvasEl!.toBlob((b) => resolve(b), 'image/jpeg', captureQuality ?? 0.92)
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

<div class="absolute inset-0 bg-black" bind:this={containerEl} style="touch-action: none">
	<!-- Live video feed -->
	<video
		bind:this={videoEl}
		class="absolute inset-0 w-full h-full object-cover"
		class:invisible={frozen && frozenImageUrl}
		style={!supportsHardwareZoom && currentZoom > 1 ? `transform: scale(${currentZoom}); transform-origin: center center;` : ''}
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

	<!-- Focus ring -->
	{#if focusPos}
		{#key focusKey}
			<div
				class="focus-ring"
				style="left: {focusPos.x}px; top: {focusPos.y}px;"
			></div>
		{/key}
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

<style>
	.focus-ring {
		position: absolute;
		width: 64px;
		height: 64px;
		margin-left: -32px;
		margin-top: -32px;
		border: 2px solid white;
		border-radius: 8px;
		pointer-events: none;
		z-index: 10;
		animation: focus-animate 1.2s ease-out forwards;
	}

	@keyframes focus-animate {
		0% { transform: scale(1.3); opacity: 1; }
		30% { transform: scale(1); opacity: 1; }
		70% { transform: scale(1); opacity: 0.7; }
		100% { transform: scale(0.95); opacity: 0; }
	}
</style>
