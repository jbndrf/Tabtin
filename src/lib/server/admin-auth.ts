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

	// 3. Check user-specific limits
	try {
		const project = await pb.collection('projects').getOne(projectId);
		const userId = project.owner;

		if (userId) {
			const userLimitsCheck = await checkUserProcessingLimits(userId, instanceLimits);
			if (!userLimitsCheck.allowed) {
				return userLimitsCheck;
			}

			// Check user endpoint limits if using managed endpoint
			const settings = project.settings || {};
			if (settings.endpoint_mode === 'managed' && settings.managed_endpoint_id) {
				const userEndpointCheck = await checkUserEndpointLimits(userId, settings.managed_endpoint_id);
				if (!userEndpointCheck.allowed) {
					return userEndpointCheck;
				}
			}
		}
	} catch (e: any) {
		// Continue if user limit check fails - instance limits still apply
		console.warn(`[PreEnqueue] Could not check user limits for project ${projectId}:`, e.message);
	}

	return { allowed: true };
}

// ============================================================================
// User Limits
// ============================================================================

export interface UserLimits {
	id: string;
	user: string;
	max_concurrent_projects: number | null;
	max_parallel_requests: number | null;
	max_requests_per_minute: number | null;
}

export interface UserEndpointLimit {
	id: string;
	user: string;
	endpoint: string;
	max_input_tokens_per_day: number | null;
	max_output_tokens_per_day: number | null;
}

export interface EffectiveUserLimits {
	maxConcurrentProjects: number;
	maxParallelRequests: number;
	maxRequestsPerMinute: number;
}

/**
 * Get user limits from database
 * Returns null if no limits are set (user has unlimited access up to instance limits)
 */
export async function getUserLimits(userId: string): Promise<UserLimits | null> {
	try {
		const pb = await getAdminPb();
		const limits = await pb.collection('user_limits').getFirstListItem(
			`user = "${userId}"`
		);
		return {
			id: limits.id,
			user: limits.user,
			max_concurrent_projects: limits.max_concurrent_projects,
			max_parallel_requests: limits.max_parallel_requests,
			max_requests_per_minute: limits.max_requests_per_minute
		};
	} catch (e: any) {
		if (e.status === 404) {
			return null;
		}
		throw e;
	}
}

/**
 * Get or create user limits record
 */
export async function upsertUserLimits(
	userId: string,
	limits: Partial<Omit<UserLimits, 'id' | 'user'>>
): Promise<UserLimits> {
	const pb = await getAdminPb();

	try {
		const existing = await pb.collection('user_limits').getFirstListItem(
			`user = "${userId}"`
		);
		const updated = await pb.collection('user_limits').update(existing.id, limits);
		return {
			id: updated.id,
			user: updated.user,
			max_concurrent_projects: updated.max_concurrent_projects,
			max_parallel_requests: updated.max_parallel_requests,
			max_requests_per_minute: updated.max_requests_per_minute
		};
	} catch (e: any) {
		if (e.status === 404) {
			const created = await pb.collection('user_limits').create({
				user: userId,
				...limits
			});
			return {
				id: created.id,
				user: created.user,
				max_concurrent_projects: created.max_concurrent_projects,
				max_parallel_requests: created.max_parallel_requests,
				max_requests_per_minute: created.max_requests_per_minute
			};
		}
		throw e;
	}
}

/**
 * Delete user limits record (restores unlimited access)
 */
export async function deleteUserLimits(userId: string): Promise<boolean> {
	try {
		const pb = await getAdminPb();
		const existing = await pb.collection('user_limits').getFirstListItem(
			`user = "${userId}"`
		);
		await pb.collection('user_limits').delete(existing.id);
		return true;
	} catch (e: any) {
		if (e.status === 404) {
			return false;
		}
		throw e;
	}
}

/**
 * Get effective limits for a user (min of instance and user limits)
 * null user limit = unlimited (uses instance limit)
 */
export async function getEffectiveUserLimits(userId: string): Promise<EffectiveUserLimits> {
	const { getInstanceLimits } = await import('./instance-config');
	const instanceLimits = getInstanceLimits();
	const userLimits = await getUserLimits(userId);

	return {
		maxConcurrentProjects: userLimits?.max_concurrent_projects != null
			? Math.min(userLimits.max_concurrent_projects, instanceLimits.maxConcurrentProjects)
			: instanceLimits.maxConcurrentProjects,
		maxParallelRequests: userLimits?.max_parallel_requests != null
			? Math.min(userLimits.max_parallel_requests, instanceLimits.maxParallelRequests)
			: instanceLimits.maxParallelRequests,
		maxRequestsPerMinute: userLimits?.max_requests_per_minute != null
			? Math.min(userLimits.max_requests_per_minute, instanceLimits.maxRequestsPerMinute)
			: instanceLimits.maxRequestsPerMinute
	};
}

/**
 * Check user's processing limits (concurrent projects)
 */
async function checkUserProcessingLimits(
	userId: string,
	instanceLimits: { maxConcurrentProjects: number }
): Promise<{ allowed: boolean; reason?: string }> {
	const userLimits = await getUserLimits(userId);

	// If no user limits set, they're unlimited (up to instance limits)
	if (!userLimits || userLimits.max_concurrent_projects == null) {
		return { allowed: true };
	}

	const pb = await getAdminPb();

	// Get user's active projects count
	const activeJobs = await pb.collection('queue_jobs').getFullList({
		filter: 'status = "processing"',
		fields: 'projectId'
	});

	// Get projects owned by this user
	const userProjects = await pb.collection('projects').getFullList({
		filter: pb.filter('owner = {:userId}', { userId }),
		fields: 'id'
	});
	const userProjectIds = new Set(userProjects.map(p => p.id));

	// Count active jobs for user's projects
	const userActiveProjectIds = new Set(
		activeJobs
			.filter(j => userProjectIds.has(j.projectId))
			.map(j => j.projectId)
	);

	const effectiveLimit = Math.min(userLimits.max_concurrent_projects, instanceLimits.maxConcurrentProjects);

	if (userActiveProjectIds.size >= effectiveLimit) {
		return {
			allowed: false,
			reason: 'You have reached your processing limit. Contact admin.'
		};
	}

	return { allowed: true };
}

// ============================================================================
// User Endpoint Limits
// ============================================================================

/**
 * Get user's endpoint-specific limit
 */
export async function getUserEndpointLimit(
	userId: string,
	endpointId: string
): Promise<UserEndpointLimit | null> {
	try {
		const pb = await getAdminPb();
		const limit = await pb.collection('user_endpoint_limits').getFirstListItem(
			`user = "${userId}" && endpoint = "${endpointId}"`
		);
		return {
			id: limit.id,
			user: limit.user,
			endpoint: limit.endpoint,
			max_input_tokens_per_day: limit.max_input_tokens_per_day,
			max_output_tokens_per_day: limit.max_output_tokens_per_day
		};
	} catch (e: any) {
		if (e.status === 404) {
			return null;
		}
		throw e;
	}
}

/**
 * Get all endpoint limits for a user
 */
export async function getUserEndpointLimits(userId: string): Promise<UserEndpointLimit[]> {
	try {
		const pb = await getAdminPb();
		const limits = await pb.collection('user_endpoint_limits').getFullList({
			filter: pb.filter('user = {:userId}', { userId })
		});
		return limits.map(limit => ({
			id: limit.id,
			user: limit.user,
			endpoint: limit.endpoint,
			max_input_tokens_per_day: limit.max_input_tokens_per_day,
			max_output_tokens_per_day: limit.max_output_tokens_per_day
		}));
	} catch (e: any) {
		return [];
	}
}

/**
 * Upsert user endpoint limit
 */
export async function upsertUserEndpointLimit(
	userId: string,
	endpointId: string,
	limits: { max_input_tokens_per_day?: number | null; max_output_tokens_per_day?: number | null }
): Promise<UserEndpointLimit> {
	const pb = await getAdminPb();

	try {
		const existing = await pb.collection('user_endpoint_limits').getFirstListItem(
			`user = "${userId}" && endpoint = "${endpointId}"`
		);
		const updated = await pb.collection('user_endpoint_limits').update(existing.id, limits);
		return {
			id: updated.id,
			user: updated.user,
			endpoint: updated.endpoint,
			max_input_tokens_per_day: updated.max_input_tokens_per_day,
			max_output_tokens_per_day: updated.max_output_tokens_per_day
		};
	} catch (e: any) {
		if (e.status === 404) {
			const created = await pb.collection('user_endpoint_limits').create({
				user: userId,
				endpoint: endpointId,
				...limits
			});
			return {
				id: created.id,
				user: created.user,
				endpoint: created.endpoint,
				max_input_tokens_per_day: created.max_input_tokens_per_day,
				max_output_tokens_per_day: created.max_output_tokens_per_day
			};
		}
		throw e;
	}
}

/**
 * Delete user endpoint limit
 */
export async function deleteUserEndpointLimit(userId: string, endpointId: string): Promise<boolean> {
	try {
		const pb = await getAdminPb();
		const existing = await pb.collection('user_endpoint_limits').getFirstListItem(
			`user = "${userId}" && endpoint = "${endpointId}"`
		);
		await pb.collection('user_endpoint_limits').delete(existing.id);
		return true;
	} catch (e: any) {
		if (e.status === 404) {
			return false;
		}
		throw e;
	}
}

// ============================================================================
// User Endpoint Usage Tracking
// ============================================================================

/**
 * Get user's endpoint usage for today
 */
export async function getUserEndpointUsageToday(
	userId: string,
	endpointId: string
): Promise<EndpointUsage> {
	const pb = await getAdminPb();
	const today = getTodayISO();

	try {
		const usage = await pb.collection('user_endpoint_usage').getFirstListItem(
			`user = "${userId}" && endpoint = "${endpointId}" && date ~ "${today}"`
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
 * Update user endpoint usage for today (upsert)
 */
export async function updateUserEndpointUsage(
	userId: string,
	endpointId: string,
	inputTokens: number,
	outputTokens: number
): Promise<void> {
	const pb = await getAdminPb();
	const today = getTodayISO();
	const todayTimestamp = today + ' 00:00:00.000Z';

	try {
		const existing = await pb.collection('user_endpoint_usage').getFirstListItem(
			`user = "${userId}" && endpoint = "${endpointId}" && date ~ "${today}"`
		);

		await pb.collection('user_endpoint_usage').update(existing.id, {
			input_tokens_used: (existing.input_tokens_used || 0) + inputTokens,
			output_tokens_used: (existing.output_tokens_used || 0) + outputTokens,
			request_count: (existing.request_count || 0) + 1
		});
	} catch (e: any) {
		if (e.status === 404) {
			await pb.collection('user_endpoint_usage').create({
				user: userId,
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
 * Check if user has capacity for endpoint usage
 * Checks both endpoint-level limits and user-specific limits
 */
export async function checkUserEndpointLimits(
	userId: string,
	endpointId: string
): Promise<{ allowed: boolean; reason?: string }> {
	// First check global endpoint limits
	const endpointCheck = await checkEndpointLimits(endpointId);
	if (!endpointCheck.allowed) {
		return endpointCheck;
	}

	// Then check user-specific limits
	const userLimit = await getUserEndpointLimit(userId, endpointId);

	// If no user-specific limit, they're unlimited (up to endpoint limits)
	if (!userLimit) {
		return { allowed: true };
	}

	const usage = await getUserEndpointUsageToday(userId, endpointId);

	if (userLimit.max_input_tokens_per_day != null &&
		usage.input_tokens_used >= userLimit.max_input_tokens_per_day) {
		return {
			allowed: false,
			reason: 'You have reached your processing limit. Contact admin.'
		};
	}

	if (userLimit.max_output_tokens_per_day != null &&
		usage.output_tokens_used >= userLimit.max_output_tokens_per_day) {
		return {
			allowed: false,
			reason: 'You have reached your processing limit. Contact admin.'
		};
	}

	return { allowed: true };
}
