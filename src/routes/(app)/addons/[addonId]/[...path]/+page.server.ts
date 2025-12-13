import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAddonManager } from '$lib/server/addons/manager';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { addonId, path } = params;

	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const manager = getAddonManager();

		console.log(`[AddonPage] Looking up addon by manifest ID: ${addonId} for user: ${locals.user.id}`);

		// addonId in URL is the manifest ID (e.g., "paperless-ngx"), not the database ID
		const addon = await manager.getByManifestId(addonId, locals.user.id);

		console.log(`[AddonPage] Found addon:`, addon ? addon.name : 'null');

		if (!addon) {
			throw error(404, 'Addon not found');
		}

		// Check addon is running
		if (addon.container_status !== 'running') {
			throw error(400, `Addon is not running (status: ${addon.container_status})`);
		}

		if (!addon.internal_url) {
			throw error(500, 'Addon has no internal URL');
		}

		// Find the page title from manifest
		const addonPath = '/' + (path || '');
		const pageConfig = addon.manifest?.ui?.pages?.find((p) => p.path === addonPath);
		const title = pageConfig?.title || addon.manifest?.name || addon.name;

		return {
			addon: {
				id: addon.id,
				manifestId: addon.manifest?.id || addon.id,
				name: addon.name,
				internal_url: addon.internal_url,
				auth_token: addon.auth_token,
				manifest: addon.manifest
			},
			path: addonPath,
			title,
			userId: locals.user.id
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('[AddonPage] Error loading addon:', err);
		throw error(404, 'Addon not found');
	}
};
