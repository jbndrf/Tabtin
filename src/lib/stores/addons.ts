/**
 * Addons store - client-side state for installed addons
 */

import { writable, derived, get } from 'svelte/store';
import type {
	InstalledAddon,
	AddonMenuSection,
	AddonMenuItem,
	AddonPanelState,
	AddonPanelSize
} from '$lib/types/addon';

// Store for all installed addons
export const installedAddons = writable<InstalledAddon[]>([]);

// Loading state
export const addonsLoading = writable(false);

// Error state
export const addonsError = writable<string | null>(null);

// Currently open panel
export const addonPanel = writable<AddonPanelState | null>(null);

/**
 * Derived store: only running addons
 */
export const runningAddons = derived(installedAddons, ($addons) =>
	$addons.filter((a) => a.container_status === 'running')
);

/**
 * Get menu items for a specific section from running addons
 */
export function menuItemsForSection(section: AddonMenuSection) {
	return derived(runningAddons, ($addons) => {
		const items: { addon: InstalledAddon; item: AddonMenuItem }[] = [];

		for (const addon of $addons) {
			const menuItems = addon.manifest?.ui?.menuItems || [];
			for (const item of menuItems) {
				if (item.section === section) {
					items.push({ addon, item });
				}
			}
		}

		return items;
	});
}

/**
 * Get all menu items from running addons
 */
export const allMenuItems = derived(runningAddons, ($addons) => {
	const items: { addon: InstalledAddon; item: AddonMenuItem }[] = [];

	for (const addon of $addons) {
		const menuItems = addon.manifest?.ui?.menuItems || [];
		for (const item of menuItems) {
			items.push({ addon, item });
		}
	}

	return items;
});

/**
 * Open an addon panel
 */
export function openAddonPanel(
	addonId: string,
	path: string,
	title?: string,
	size: AddonPanelSize = 'lg'
): void {
	addonPanel.set({ addonId, path, title, size });
}

/**
 * Close the addon panel
 */
export function closeAddonPanel(): void {
	addonPanel.set(null);
}

/**
 * Get addon by database ID from store
 */
export function getAddonById(addonId: string): InstalledAddon | undefined {
	return get(installedAddons).find((a) => a.id === addonId);
}

/**
 * Get addon by manifest ID from store
 */
export function getAddonByManifestId(manifestId: string): InstalledAddon | undefined {
	return get(installedAddons).find((a) => a.manifest?.id === manifestId);
}

/**
 * Fetch addons from API
 */
export async function fetchAddons(): Promise<void> {
	addonsLoading.set(true);
	addonsError.set(null);

	try {
		const response = await fetch('/api/addons');
		const result = await response.json();

		if (result.success) {
			installedAddons.set(result.data);
		} else {
			addonsError.set(result.error);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to fetch addons';
		addonsError.set(message);
	} finally {
		addonsLoading.set(false);
	}
}

/**
 * Install an addon
 */
export async function installAddon(dockerImage: string): Promise<InstalledAddon> {
	const response = await fetch('/api/addons', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ dockerImage })
	});

	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	// Add to store
	installedAddons.update((addons) => [result.data, ...addons]);

	return result.data;
}

/**
 * Start an addon
 */
export async function startAddon(addonId: string): Promise<InstalledAddon> {
	const response = await fetch(`/api/addons/${addonId}/start`, {
		method: 'POST'
	});

	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	// Update in store
	installedAddons.update((addons) =>
		addons.map((a) => (a.id === addonId ? result.data : a))
	);

	return result.data;
}

/**
 * Stop an addon
 */
export async function stopAddon(addonId: string): Promise<InstalledAddon> {
	const response = await fetch(`/api/addons/${addonId}/stop`, {
		method: 'POST'
	});

	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	// Update in store
	installedAddons.update((addons) =>
		addons.map((a) => (a.id === addonId ? result.data : a))
	);

	return result.data;
}

/**
 * Uninstall an addon
 */
export async function uninstallAddon(addonId: string): Promise<void> {
	const response = await fetch(`/api/addons/${addonId}`, {
		method: 'DELETE'
	});

	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	// Remove from store
	installedAddons.update((addons) => addons.filter((a) => a.id !== addonId));
}

/**
 * Update addon configuration
 */
export async function updateAddonConfig(
	addonId: string,
	config: Record<string, unknown>
): Promise<InstalledAddon> {
	const response = await fetch(`/api/addons/${addonId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ config })
	});

	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	// Update in store
	installedAddons.update((addons) =>
		addons.map((a) => (a.id === addonId ? result.data : a))
	);

	return result.data;
}

/**
 * Call an addon endpoint
 */
export async function callAddon<T = unknown>(
	addonId: string,
	endpoint: string,
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'POST',
	data?: unknown
): Promise<T> {
	const response = await fetch(`/api/addons/${addonId}/call`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ endpoint, method, data })
	});

	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	return result.data;
}

/**
 * Get addon logs
 */
export async function getAddonLogs(addonId: string, tail = 100): Promise<string> {
	const response = await fetch(`/api/addons/${addonId}/logs?tail=${tail}`);
	const result = await response.json();

	if (!result.success) {
		throw new Error(result.error);
	}

	return result.data.logs;
}
