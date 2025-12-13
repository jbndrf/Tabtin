/**
 * Addon Bridge - handles postMessage communication from addon iframes
 */

import { goto, invalidateAll } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { get } from 'svelte/store';
import { installedAddons, openAddonPanel, closeAddonPanel } from '$lib/stores/addons';
import type { AddonMessage, AddonFileData, AddonPanelSize } from '$lib/types/addon';

let initialized = false;

/**
 * Valid addon origins based on installed addons
 */
function getValidOrigins(): Set<string> {
	const addons = get(installedAddons);
	const origins = new Set<string>();

	for (const addon of addons) {
		if (addon.internal_url) {
			try {
				const url = new URL(addon.internal_url);
				origins.add(url.origin);
			} catch {
				// Invalid URL, skip
			}
		}
	}

	return origins;
}

/**
 * Get addon manifest ID from origin URL
 */
function getAddonManifestIdFromOrigin(origin: string): string | null {
	const addons = get(installedAddons);

	for (const addon of addons) {
		if (addon.internal_url) {
			try {
				const url = new URL(addon.internal_url);
				if (url.origin === origin) {
					// Return manifest ID for consistency with URL routing
					return addon.manifest?.id || addon.id;
				}
			} catch {
				// Invalid URL, skip
			}
		}
	}

	return null;
}

/**
 * Check if message origin is from a valid addon
 */
function isValidAddonOrigin(origin: string): boolean {
	// In development, allow localhost origins
	if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
		return true;
	}

	// Check against installed addon URLs
	const validOrigins = getValidOrigins();
	return validOrigins.has(origin);
}

/**
 * Handle messages from addon iframes
 */
function handleAddonMessage(event: MessageEvent): void {
	// Validate origin
	if (!isValidAddonOrigin(event.origin)) {
		console.warn('[AddonBridge] Message from unknown origin:', event.origin);
		return;
	}

	// Validate message structure
	const message = event.data as AddonMessage;
	if (!message || typeof message !== 'object' || !message.type) {
		return;
	}

	console.log('[AddonBridge] Received message:', message.type);

	// Get addon manifest ID for messages that need it
	const addonId = getAddonManifestIdFromOrigin(event.origin);

	switch (message.type) {
		case 'TOAST':
			handleToast(message.payload);
			break;

		case 'NAVIGATE':
			handleNavigate(message.payload);
			break;

		case 'REFRESH':
			handleRefresh();
			break;

		case 'OPEN_PANEL':
			handleOpenPanel(addonId, message.payload);
			break;

		case 'CLOSE_PANEL':
			handleClosePanel();
			break;

		case 'ADDON_FILES':
			handleAddonFiles(message.payload);
			break;

		default:
			console.warn('[AddonBridge] Unknown message type:', (message as { type: string }).type);
	}
}

/**
 * Show a toast notification
 */
function handleToast(payload: { message: string; variant?: 'success' | 'error' | 'info' }): void {
	const { message, variant = 'info' } = payload;

	switch (variant) {
		case 'success':
			toast.success(message);
			break;
		case 'error':
			toast.error(message);
			break;
		default:
			toast.info(message);
	}
}

/**
 * Navigate to a path
 */
function handleNavigate(payload: { path: string }): void {
	const { path } = payload;

	if (!path.startsWith('/')) {
		console.warn('[AddonBridge] Invalid navigation path:', path);
		return;
	}

	goto(path);
}

/**
 * Refresh current page data
 */
function handleRefresh(): void {
	invalidateAll();
}

/**
 * Open a floating panel for an addon
 */
function handleOpenPanel(
	addonId: string | null,
	payload: { path: string; title?: string; size?: AddonPanelSize }
): void {
	if (!addonId) {
		console.warn('[AddonBridge] Cannot open panel: addon ID not found');
		return;
	}

	const { path, title, size = 'lg' } = payload;

	if (!path.startsWith('/')) {
		console.warn('[AddonBridge] Invalid panel path:', path);
		return;
	}

	openAddonPanel(addonId, path, title, size);
}

/**
 * Close the floating panel
 */
function handleClosePanel(): void {
	closeAddonPanel();
}

/**
 * Handle files received from addons
 * Dispatches a custom event with the files that pages can listen for
 */
function handleAddonFiles(payload: { files: AddonFileData[] }): void {
	const { files } = payload;

	if (!files || files.length === 0) {
		console.warn('[AddonBridge] No files received');
		return;
	}

	console.log('[AddonBridge] Received files from addon:', files.length);

	// Dispatch custom event with the files
	window.dispatchEvent(
		new CustomEvent('addon-files-received', {
			detail: { files }
		})
	);
}

/**
 * Initialize the addon bridge
 * Call this once in your root layout
 */
export function initAddonBridge(): void {
	if (initialized) {
		return;
	}

	if (typeof window === 'undefined') {
		return;
	}

	window.addEventListener('message', handleAddonMessage);
	initialized = true;

	console.log('[AddonBridge] Initialized');
}

/**
 * Cleanup the addon bridge
 */
export function destroyAddonBridge(): void {
	if (typeof window === 'undefined') {
		return;
	}

	window.removeEventListener('message', handleAddonMessage);
	initialized = false;

	console.log('[AddonBridge] Destroyed');
}

/**
 * Send a message to an addon iframe
 */
export function sendToAddon(
	iframe: HTMLIFrameElement,
	message: { type: string; payload?: unknown }
): void {
	if (!iframe.contentWindow) {
		console.warn('[AddonBridge] Iframe has no contentWindow');
		return;
	}

	iframe.contentWindow.postMessage(message, '*');
}
