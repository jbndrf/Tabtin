import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	// Fetch addons server-side for initial load
	try {
		const response = await fetch('/api/addons');
		const result = await response.json();

		return {
			addons: result.success ? result.data : [],
			error: result.success ? null : result.error
		};
	} catch (error) {
		return {
			addons: [],
			error: error instanceof Error ? error.message : 'Failed to load addons'
		};
	}
};
