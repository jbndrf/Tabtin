// API endpoints for addon management (list, install)

import { json } from '@sveltejs/kit';
import { getAddonManager } from '$lib/server/addons';
import type { RequestHandler } from './$types';

/**
 * GET /api/addons - List installed addons for current user
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const userId = locals.user?.id;
		if (!userId) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const manager = getAddonManager();
		const addons = await manager.listForUser(userId);

		return json({
			success: true,
			data: addons
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error listing addons:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};

/**
 * POST /api/addons - Install a new addon
 * Body: { dockerImage: string }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const userId = locals.user?.id;
		if (!userId) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { dockerImage } = await request.json();

		if (!dockerImage || typeof dockerImage !== 'string') {
			return json(
				{ success: false, error: 'dockerImage is required' },
				{ status: 400 }
			);
		}

		const manager = getAddonManager();
		const addon = await manager.install(userId, dockerImage);

		return json({
			success: true,
			data: addon,
			message: `Addon "${addon.name}" installed successfully`
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error installing addon:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};
