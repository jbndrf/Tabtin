import type { PageServerLoad } from './$types';
import { ADDONS_ENABLED } from '$lib/server/startup';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Return early if addons are disabled
	if (!ADDONS_ENABLED) {
		return {
			addons: [],
			addonsEnabled: false,
			error: null
		};
	}

	// Fetch addons server-side for initial load
	try {
		const response = await fetch('/api/addons');
		const result = await response.json();

		return {
			addons: result.success ? result.data : [],
			addonsEnabled: true,
			error: result.success ? null : result.error
		};
	} catch (error) {
		return {
			addons: [],
			addonsEnabled: true,
			error: error instanceof Error ? error.message : 'Failed to load addons'
		};
	}
};
