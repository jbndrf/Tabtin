/**
 * Addon manifest served by addon containers at GET /manifest.json
 */
export interface AddonManifest {
	id: string;
	name: string;
	version: string;
	description?: string;
	port: number;
	endpoints?: AddonEndpoint[];
	ui?: AddonUI;
	config_schema?: Record<string, AddonConfigField>;
}

export interface AddonEndpoint {
	path: string;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	description?: string;
}

/**
 * UI capabilities that addons can declare
 */
export interface AddonUI {
	menuItems?: AddonMenuItem[];
	pages?: AddonPage[];
}

/**
 * Menu item that appears in the sidebar navigation
 */
export interface AddonMenuItem {
	id: string;
	label: string;
	icon?: string;
	href: string;
	section: AddonMenuSection;
}

export type AddonMenuSection = 'main' | 'projects' | 'footer';

/**
 * Full page that the addon provides
 */
export interface AddonPage {
	id: string;
	path: string;
	title: string;
}

export interface AddonConfigField {
	type: 'string' | 'number' | 'boolean' | 'select';
	title: string;
	description?: string;
	secret?: boolean;
	required?: boolean;
	default?: string | number | boolean;
	options?: string[]; // For select type
}

/**
 * Container status for installed addons
 */
export type AddonContainerStatus =
	| 'pending'
	| 'building'
	| 'starting'
	| 'running'
	| 'stopped'
	| 'failed';

/**
 * Installed addon record from PocketBase
 */
export interface InstalledAddon {
	id: string;
	user: string;
	name: string;
	docker_image: string;
	container_id?: string;
	container_status: AddonContainerStatus;
	internal_url?: string;
	manifest?: AddonManifest;
	config?: Record<string, unknown>;
	auth_token?: string;
	error_message?: string;
	created: string;
	updated: string;
}

/**
 * Context passed to addon iframes via query params
 */
export interface AddonContext {
	addonId: string;
	userId: string;
	projectId?: string;
	batchId?: string;
	[key: string]: unknown;
}

/**
 * File data transferred from addons
 */
export interface AddonFileData {
	filename: string;
	mimeType: string;
	base64: string;
}

/**
 * Panel size options for floating panels
 */
export type AddonPanelSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * State for an open addon panel
 */
export interface AddonPanelState {
	addonId: string;
	path: string;
	title?: string;
	size: AddonPanelSize;
}

/**
 * Messages sent from addon iframes to host via postMessage
 */
export type AddonMessage =
	| { type: 'TOAST'; payload: { message: string; variant?: 'success' | 'error' | 'info' } }
	| { type: 'NAVIGATE'; payload: { path: string } }
	| { type: 'REFRESH' }
	| { type: 'OPEN_PANEL'; payload: { path: string; title?: string; size?: AddonPanelSize } }
	| { type: 'CLOSE_PANEL' }
	| { type: 'ADDON_FILES'; payload: { files: AddonFileData[] } };

/**
 * Request payload for calling addon endpoints via proxy
 */
export interface AddonCallRequest {
	endpoint: string;
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	data?: unknown;
}

/**
 * Response from addon endpoints
 */
export interface AddonCallResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}
