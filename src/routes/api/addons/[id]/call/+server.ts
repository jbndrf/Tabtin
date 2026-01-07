// API endpoint to proxy calls to addon endpoints

import { json } from '@sveltejs/kit';
import { getAddonManager } from '$lib/server/addons';
import { ADDONS_ENABLED } from '$lib/server/startup';
import type { RequestHandler } from './$types';

/**
 * POST /api/addons/[id]/call - Call an addon endpoint
 * Body: { endpoint: string, method?: string, data?: unknown }
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
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

		const { endpoint, method = 'POST', data } = await request.json();

		if (!endpoint || typeof endpoint !== 'string') {
			return json(
				{ success: false, error: 'endpoint is required' },
				{ status: 400 }
			);
		}

		const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
		if (!validMethods.includes(method as typeof validMethods[number])) {
			return json(
				{ success: false, error: `Invalid method. Must be one of: ${validMethods.join(', ')}` },
				{ status: 400 }
			);
		}

		const result = await manager.call(
			params.id,
			endpoint,
			method as typeof validMethods[number],
			data
		);

		return json({
			success: true,
			data: result
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error calling addon:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};
