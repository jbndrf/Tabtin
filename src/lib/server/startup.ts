/**
 * Server startup tasks
 * Handles admin user creation, endpoint syncing, and addon initialization
 */

import { getAdminPb } from './admin-auth';
import { getAdminCredentials, getPredefinedEndpoints } from './instance-config';
import { initializeAddons, registerShutdownHandlers } from './addons/lifecycle';

/**
 * Feature flag for addon system
 * When false, addon initialization is skipped and API routes return 503
 * Set via ADDONS_ENABLED env var (default: true)
 */
export const ADDONS_ENABLED = process.env.ADDONS_ENABLED !== 'false';

// Global flags to prevent re-running startup tasks on HMR
declare global {
	// eslint-disable-next-line no-var
	var __adminUserChecked: boolean;
	// eslint-disable-next-line no-var
	var __endpointsSynced: boolean;
	// eslint-disable-next-line no-var
	var __addonLifecycleInitialized: boolean;
	// eslint-disable-next-line no-var
	var __shutdownHandlersRegistered: boolean;
}

globalThis.__adminUserChecked = globalThis.__adminUserChecked ?? false;
globalThis.__endpointsSynced = globalThis.__endpointsSynced ?? false;
globalThis.__addonLifecycleInitialized = globalThis.__addonLifecycleInitialized ?? false;
globalThis.__shutdownHandlersRegistered = globalThis.__shutdownHandlersRegistered ?? false;

/**
 * Ensure admin user exists on startup
 * Creates first user with same credentials as PocketBase superuser
 */
async function ensureAdminUser(): Promise<void> {
	const { email, password } = getAdminCredentials();

	if (!email || !password) {
		console.warn('[Setup] Admin credentials not configured, skipping admin user creation');
		return;
	}

	try {
		const pb = await getAdminPb();

		// Check if any users exist
		const users = await pb.collection('users').getList(1, 1);

		if (users.totalItems === 0) {
			// Create first user with admin privileges
			await pb.collection('users').create({
				email: email,
				password: password,
				passwordConfirm: password,
				is_admin: true,
				verified: true
			});
			console.log('[Setup] Admin user created with email:', email);
		}
	} catch (error: any) {
		// Ignore if superuser doesn't exist yet (first run)
		if (error.status !== 400 && error.status !== 404) {
			console.error('[Setup] Failed to ensure admin user:', error.message);
		}
	}
}

/**
 * Sync predefined endpoints from .env to database
 */
async function syncPredefinedEndpoints(): Promise<void> {
	const predefined = getPredefinedEndpoints();

	if (predefined.length === 0) {
		return;
	}

	const { email, password } = getAdminCredentials();

	if (!email || !password) {
		return;
	}

	try {
		const pb = await getAdminPb();

		for (const endpoint of predefined) {
			try {
				// Check if endpoint with this alias exists
				const existing = await pb
					.collection('llm_endpoints')
					.getFirstListItem(`alias = "${endpoint.alias}"`);

				// Update existing (but preserve is_enabled status)
				await pb.collection('llm_endpoints').update(existing.id, {
					endpoint_url: endpoint.endpoint,
					api_key: endpoint.apiKey,
					model_name: endpoint.model,
					max_input_tokens_per_day: endpoint.maxInputTokensPerDay,
					max_output_tokens_per_day: endpoint.maxOutputTokensPerDay,
					default_temperature: endpoint.defaultTemperature,
					default_top_p: endpoint.defaultTopP,
					default_top_k: endpoint.defaultTopK,
					description: endpoint.description,
					provider_type: endpoint.providerType,
					is_predefined: true
				});
				console.log('[Setup] Updated predefined endpoint:', endpoint.alias);
			} catch (e: any) {
				if (e.status === 404) {
					// Create new
					await pb.collection('llm_endpoints').create({
						alias: endpoint.alias,
						endpoint_url: endpoint.endpoint,
						api_key: endpoint.apiKey,
						model_name: endpoint.model,
						max_input_tokens_per_day: endpoint.maxInputTokensPerDay,
						max_output_tokens_per_day: endpoint.maxOutputTokensPerDay,
						default_temperature: endpoint.defaultTemperature,
						default_top_p: endpoint.defaultTopP,
						default_top_k: endpoint.defaultTopK,
						description: endpoint.description,
						provider_type: endpoint.providerType,
						is_enabled: true,
						is_predefined: true
					});
					console.log('[Setup] Created predefined endpoint:', endpoint.alias);
				} else {
					console.error('[Setup] Failed to sync endpoint:', endpoint.alias, e.message);
				}
			}
		}
	} catch (error: any) {
		console.error('[Setup] Failed to sync predefined endpoints:', error.message);
	}
}

/**
 * Run all startup tasks (called before worker starts)
 */
export async function runStartupTasks(): Promise<void> {
	if (!globalThis.__adminUserChecked) {
		globalThis.__adminUserChecked = true;
		await ensureAdminUser();
	}

	if (!globalThis.__endpointsSynced) {
		globalThis.__endpointsSynced = true;
		await syncPredefinedEndpoints();
	}

	// Initialize addon containers (restart previously running)
	if (ADDONS_ENABLED && !globalThis.__addonLifecycleInitialized) {
		globalThis.__addonLifecycleInitialized = true;
		await initializeAddons();
	} else if (!ADDONS_ENABLED) {
		console.log('[Setup] Addon system disabled (ADDONS_ENABLED=false)');
	}
}

/**
 * Initialize shutdown handlers (call once at module load)
 * Only registers addon shutdown handlers if addons are enabled
 */
export function initShutdownHandlers(): void {
	if (ADDONS_ENABLED && !globalThis.__shutdownHandlersRegistered) {
		globalThis.__shutdownHandlersRegistered = true;
		registerShutdownHandlers();
	}
}
