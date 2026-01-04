/**
 * Instance-level configuration from environment variables
 * These are hard limits set by the deployer, not changeable via UI
 */

import { env } from '$env/dynamic/private';

export interface InstanceLimits {
	/** Max concurrent projects being processed (1 = free tier) */
	maxConcurrentProjects: number;
	/** Max parallel LLM requests per project (caps project settings) */
	maxParallelRequests: number;
	/** Max requests per minute per project (caps project settings) */
	maxRequestsPerMinute: number;
}

export interface PredefinedEndpoint {
	alias: string;
	endpoint: string;
	apiKey: string;
	model: string;
	maxInputTokensPerDay: number;
	maxOutputTokensPerDay: number;
	defaultTemperature?: number;
	defaultTopP?: number;
	defaultTopK?: number;
	description?: string;
	providerType?: 'openai' | 'anthropic' | 'google' | 'custom';
}

/**
 * Get instance-level limits from environment variables
 * These limits cap any project-level settings
 */
export function getInstanceLimits(): InstanceLimits {
	return {
		maxConcurrentProjects: parseInt(env.INSTANCE_MAX_CONCURRENT_PROJECTS || '1', 10),
		maxParallelRequests: parseInt(env.INSTANCE_MAX_PARALLEL_REQUESTS || '10', 10),
		maxRequestsPerMinute: parseInt(env.INSTANCE_MAX_REQUESTS_PER_MINUTE || '60', 10)
	};
}

/**
 * Get predefined endpoints from environment variables
 * These endpoints are defined in .env and synced to the database on startup
 */
export function getPredefinedEndpoints(): PredefinedEndpoint[] {
	if (!env.PREDEFINED_ENDPOINTS) return [];

	try {
		// Coolify escapes quotes in env vars for shell safety, so we need to unescape
		// The value comes as [{"alias":\"...\"} instead of [{"alias":"..."}
		let value = env.PREDEFINED_ENDPOINTS;

		// If the value starts with escaped quotes, unescape them
		if (value.includes('\\"')) {
			value = value.replace(/\\"/g, '"');
		}

		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) {
			console.error('[Config] PREDEFINED_ENDPOINTS must be a JSON array');
			return [];
		}
		return parsed;
	} catch (e) {
		console.error('[Config] Failed to parse PREDEFINED_ENDPOINTS:', e);
		return [];
	}
}

/**
 * Get admin credentials from environment variables
 */
export function getAdminCredentials(): { email: string; password: string } {
	return {
		email: env.POCKETBASE_ADMIN_EMAIL || '',
		password: env.POCKETBASE_ADMIN_PASSWORD || ''
	};
}
