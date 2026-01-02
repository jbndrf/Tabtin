/**
 * Admin authentication and authorization utilities
 */

import PocketBase from 'pocketbase';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import { getAdminCredentials } from './instance-config';
import { error } from '@sveltejs/kit';

// Cached admin PocketBase instance
let adminPbInstance: PocketBase | null = null;
let adminAuthTime = 0;
const AUTH_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/** Get today's date in ISO format (YYYY-MM-DD) */
function getTodayISO(): string {
	return new Date().toISOString().split('T')[0];
}

// App settings singleton ID
export const APP_SETTINGS_ID = 'app_settings_singleton';

export interface AppSettings {
	id: string;
	allow_registration: boolean;
	require_email_verification: boolean;
	allow_custom_endpoints: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
	id: APP_SETTINGS_ID,
	allow_registration: true,
	require_email_verification: false,
	allow_custom_endpoints: true
};

/**
 * Get an authenticated admin PocketBase instance
 * Uses cached instance if auth is still valid
 */
export async function getAdminPb(): Promise<PocketBase> {
	const now = Date.now();

	if (adminPbInstance && now - adminAuthTime < AUTH_TIMEOUT) {
		return adminPbInstance;
	}

	const pb = new PocketBase(POCKETBASE_URL);
	pb.autoCancellation(false);

	const { email, password } = getAdminCredentials();

	if (!email || !password) {
		throw new Error('Admin credentials not configured in environment variables');
	}

	await pb.collection('_superusers').authWithPassword(email, password);

	adminPbInstance = pb;
	adminAuthTime = now;
	return pb;
}

/**
 * Require admin access - throws 403 if not admin
 */
export function requireAdmin(locals: App.Locals): void {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	if (!locals.isAdmin) {
		throw error(403, 'Admin access required');
	}
}

/**
 * Get application settings with defaults
 */
export async function getAppSettings(): Promise<AppSettings> {
	try {
		const pb = await getAdminPb();
		const settings = await pb.collection('app_settings').getOne(APP_SETTINGS_ID);
		return {
			id: settings.id,
			allow_registration: settings.allow_registration ?? DEFAULT_APP_SETTINGS.allow_registration,
			require_email_verification:
				settings.require_email_verification ?? DEFAULT_APP_SETTINGS.require_email_verification,
			allow_custom_endpoints:
				settings.allow_custom_endpoints ?? DEFAULT_APP_SETTINGS.allow_custom_endpoints
		};
	} catch (e: any) {
		if (e.status === 404) {
			// Settings don't exist yet, return defaults
			return DEFAULT_APP_SETTINGS;
		}
		console.error('[AdminAuth] Failed to get app settings:', e);
		return DEFAULT_APP_SETTINGS;
	}
}

/**
 * Create or update app settings
 */
export async function upsertAppSettings(
	settings: Partial<Omit<AppSettings, 'id'>>
): Promise<AppSettings> {
	const pb = await getAdminPb();

	try {
		// Try to update existing
		const updated = await pb.collection('app_settings').update(APP_SETTINGS_ID, settings);
		return {
			id: updated.id,
			allow_registration: updated.allow_registration,
			require_email_verification: updated.require_email_verification,
			allow_custom_endpoints: updated.allow_custom_endpoints
		};
	} catch (e: any) {
		if (e.status === 404) {
			// Create new (DEFAULT_APP_SETTINGS already contains id)
			const created = await pb.collection('app_settings').create({
				...DEFAULT_APP_SETTINGS,
				...settings
			});
			return {
				id: created.id,
				allow_registration: created.allow_registration,
				require_email_verification: created.require_email_verification,
				allow_custom_endpoints: created.allow_custom_endpoints
			};
		}
		throw e;
	}
}

export interface LlmEndpoint {
	id: string;
	alias: string;
	endpoint_url: string;
	api_key: string;
	model_name: string;
	max_input_tokens_per_day: number;
	max_output_tokens_per_day: number;
	default_temperature?: number;
	default_top_p?: number;
	default_top_k?: number;
	is_enabled: boolean;
	is_predefined: boolean;
	description?: string;
	provider_type?: string;
}

/**
 * Get an LLM endpoint with its limits
 */
export async function getEndpointWithLimits(endpointId: string): Promise<LlmEndpoint | null> {
	try {
		const pb = await getAdminPb();
		const endpoint = await pb.collection('llm_endpoints').getOne(endpointId);
		return {
			id: endpoint.id,
			alias: endpoint.alias,
			endpoint_url: endpoint.endpoint_url,
			api_key: endpoint.api_key,
			model_name: endpoint.model_name,
			max_input_tokens_per_day: endpoint.max_input_tokens_per_day,
			max_output_tokens_per_day: endpoint.max_output_tokens_per_day,
			default_temperature: endpoint.default_temperature,
			default_top_p: endpoint.default_top_p,
			default_top_k: endpoint.default_top_k,
			is_enabled: endpoint.is_enabled,
			is_predefined: endpoint.is_predefined,
			description: endpoint.description,
			provider_type: endpoint.provider_type
		};
	} catch (e: any) {
		if (e.status === 404) {
			return null;
		}
		throw e;
	}
}

export interface EndpointUsage {
	input_tokens_used: number;
	output_tokens_used: number;
	request_count: number;
}

/**
 * Get today's usage for an endpoint
 */
export async function getEndpointUsageToday(endpointId: string): Promise<EndpointUsage> {
	const pb = await getAdminPb();
	const today = getTodayISO();

	try {
		const usage = await pb.collection('endpoint_usage').getFirstListItem(
			`endpoint = "${endpointId}" && date ~ "${today}"`
		);
		return {
			input_tokens_used: usage.input_tokens_used || 0,
			output_tokens_used: usage.output_tokens_used || 0,
			request_count: usage.request_count || 0
		};
	} catch (e: any) {
		if (e.status === 404) {
			return {
				input_tokens_used: 0,
				output_tokens_used: 0,
				request_count: 0
			};
		}
		throw e;
	}
}

/**
 * Update endpoint usage for today (upsert)
 */
export async function updateEndpointUsage(
	endpointId: string,
	inputTokens: number,
	outputTokens: number
): Promise<void> {
	const pb = await getAdminPb();
	const today = getTodayISO();
	const todayTimestamp = today + ' 00:00:00.000Z';

	try {
		// Try to find existing record
		const existing = await pb.collection('endpoint_usage').getFirstListItem(
			`endpoint = "${endpointId}" && date ~ "${today}"`
		);

		// Update existing
		await pb.collection('endpoint_usage').update(existing.id, {
			input_tokens_used: (existing.input_tokens_used || 0) + inputTokens,
			output_tokens_used: (existing.output_tokens_used || 0) + outputTokens,
			request_count: (existing.request_count || 0) + 1
		});
	} catch (e: any) {
		if (e.status === 404) {
			// Create new record
			await pb.collection('endpoint_usage').create({
				endpoint: endpointId,
				date: todayTimestamp,
				input_tokens_used: inputTokens,
				output_tokens_used: outputTokens,
				request_count: 1
			});
		} else {
			throw e;
		}
	}
}

/**
 * Check if endpoint has capacity for more requests
 */
export async function checkEndpointLimits(
	endpointId: string
): Promise<{ allowed: boolean; reason?: string }> {
	const endpoint = await getEndpointWithLimits(endpointId);

	if (!endpoint) {
		return { allowed: false, reason: 'Endpoint not found' };
	}

	if (!endpoint.is_enabled) {
		return { allowed: false, reason: 'Endpoint is disabled' };
	}

	const usage = await getEndpointUsageToday(endpointId);

	if (usage.input_tokens_used >= endpoint.max_input_tokens_per_day) {
		return {
			allowed: false,
			reason: `Daily input token limit exceeded (${usage.input_tokens_used}/${endpoint.max_input_tokens_per_day})`
		};
	}

	if (usage.output_tokens_used >= endpoint.max_output_tokens_per_day) {
		return {
			allowed: false,
			reason: `Daily output token limit exceeded (${usage.output_tokens_used}/${endpoint.max_output_tokens_per_day})`
		};
	}

	return { allowed: true };
}

/**
 * Pre-enqueue limit check for a project
 * Checks both instance-wide limits and endpoint-specific limits
 * Call this before accepting jobs into the queue to provide immediate feedback
 */
export async function checkProjectProcessingLimits(
	projectId: string
): Promise<{ allowed: boolean; reason?: string }> {
	const pb = await getAdminPb();

	// 1. Check instance-wide concurrent projects limit
	const { getInstanceLimits } = await import('./instance-config');
	const instanceLimits = getInstanceLimits();

	// Get all actively processing jobs and their project IDs
	const activeJobs = await pb.collection('queue_jobs').getFullList({
		filter: 'status = "processing"',
		fields: 'projectId'
	});

	// Count unique projects with active jobs
	const activeProjectIds = new Set(activeJobs.map((j) => j.projectId).filter(Boolean));

	// If this project isn't already processing and we're at the limit, reject
	if (!activeProjectIds.has(projectId) && activeProjectIds.size >= instanceLimits.maxConcurrentProjects) {
		return {
			allowed: false,
			reason: `Instance is at maximum concurrent projects (${activeProjectIds.size}/${instanceLimits.maxConcurrentProjects}). Wait for current project to finish.`
		};
	}

	// 2. Check endpoint-specific limits if project uses managed endpoint
	try {
		const project = await pb.collection('projects').getOne(projectId);
		const settings = project.settings || {};

		if (settings.endpoint_mode === 'managed' && settings.managed_endpoint_id) {
			const endpointCheck = await checkEndpointLimits(settings.managed_endpoint_id);
			if (!endpointCheck.allowed) {
				return endpointCheck;
			}
		}
	} catch (e: any) {
		// Project not found or other error - allow enqueue, worker will handle it
		console.warn(`[PreEnqueue] Could not check project ${projectId} limits:`, e.message);
	}

	return { allowed: true };
}
