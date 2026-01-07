// API endpoint to get addon container logs

import { json } from '@sveltejs/kit';
import { getAddonManager } from '$lib/server/addons';
import { ADDONS_ENABLED } from '$lib/server/startup';
import type { RequestHandler } from './$types';

/**
 * GET /api/addons/[id]/logs - Get addon container logs
 * Query params: ?tail=100
 */
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!ADDONS_ENABLED) {
		return json({ success: false, error: 'Addons are disabled on this instance' }, { status: 503 });
	}

	try {
		const userId = locals.user?.id;
		if (!userId) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const manager = getAddonManager();
		const addon = await manager.get(params.id);

		// Verify ownership
		if (addon.user !== userId) {
			return json({ success: false, error: 'Not found' }, { status: 404 });
		}

		const tail = parseInt(url.searchParams.get('tail') || '100', 10);
		const logs = await manager.getLogs(params.id, tail);

		return json({
			success: true,
			data: {
				logs,
				addonName: addon.name,
				containerStatus: addon.container_status
			}
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error getting addon logs:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};
