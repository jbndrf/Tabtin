// API endpoint for listing available (installable) addons from local directory

import { json } from '@sveltejs/kit';
import { listAvailableAddons } from '$lib/server/addons/docker';
import { ADDONS_ENABLED } from '$lib/server/startup';
import type { RequestHandler } from './$types';

/**
 * GET /api/addons/available - List available addons from addons/ directory
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!ADDONS_ENABLED) {
		return json({ success: false, error: 'Addons are disabled on this instance' }, { status: 503 });
	}

	try {
		const userId = locals.user?.id;
		if (!userId) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const available = listAvailableAddons();

		return json({
			success: true,
			data: available
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error listing available addons:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};
