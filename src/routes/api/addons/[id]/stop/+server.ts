// API endpoint to stop an addon

import { json } from '@sveltejs/kit';
import { getAddonManager } from '$lib/server/addons';
import { ADDONS_ENABLED } from '$lib/server/startup';
import type { RequestHandler } from './$types';

/**
 * POST /api/addons/[id]/stop - Stop addon container
 */
export const POST: RequestHandler = async ({ params, locals }) => {
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

		const stopped = await manager.stop(params.id);

		return json({
			success: true,
			data: stopped,
			message: `Addon "${stopped.name}" stopped`
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error stopping addon:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};
