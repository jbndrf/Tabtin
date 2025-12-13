// API endpoints for single addon operations (get, update config, delete)

import { json } from '@sveltejs/kit';
import { getAddonManager } from '$lib/server/addons';
import type { RequestHandler } from './$types';

/**
 * GET /api/addons/[id] - Get addon details
 */
export const GET: RequestHandler = async ({ params, locals }) => {
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

		// Sync status with actual container
		const synced = await manager.syncStatus(params.id);

		return json({
			success: true,
			data: synced
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error getting addon:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};

/**
 * PUT /api/addons/[id] - Update addon configuration
 * Body: { config: Record<string, unknown> }
 */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
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

		const { config } = await request.json();

		if (!config || typeof config !== 'object') {
			return json(
				{ success: false, error: 'config object is required' },
				{ status: 400 }
			);
		}

		const updated = await manager.updateConfig(params.id, config);

		return json({
			success: true,
			data: updated,
			message: 'Configuration updated'
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error updating addon config:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};

/**
 * DELETE /api/addons/[id] - Uninstall addon
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
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

		await manager.uninstall(params.id);

		return json({
			success: true,
			message: `Addon "${addon.name}" uninstalled`
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error('Error uninstalling addon:', error);
		return json({ success: false, error: message }, { status: 500 });
	}
};
