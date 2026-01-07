/**
 * Proxy addon requests from browser to addon container
 * This allows the browser to access addon content without needing direct network access
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAddonManager } from '$lib/server/addons/manager';
import { ADDONS_ENABLED } from '$lib/server/startup';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!ADDONS_ENABLED) {
		throw error(503, 'Addons are disabled on this instance');
	}

	const { addonId, path } = params;

	console.log(`[AddonProxy] GET request - addonId: ${addonId}, path: ${path}, user: ${locals.user?.id || 'none'}`);

	if (!locals.user) {
		console.log('[AddonProxy] No user in locals - returning 401');
		throw error(401, 'Unauthorized');
	}

	try {
		const manager = getAddonManager();
		const addon = await manager.getByManifestId(addonId, locals.user.id);

		if (!addon) {
			throw error(404, 'Addon not found');
		}

		if (addon.container_status !== 'running') {
			throw error(400, 'Addon is not running');
		}

		if (!addon.internal_url) {
			throw error(500, 'Addon has no internal URL');
		}

		// Build the target URL
		const addonPath = '/' + (path || '');
		const targetUrl = new URL(addon.internal_url + addonPath);

		// Forward query params (except internal ones)
		for (const [key, value] of url.searchParams) {
			targetUrl.searchParams.set(key, value);
		}

		console.log(`[AddonProxy] Proxying GET ${addonPath} to ${targetUrl}`);

		// Fetch from addon
		const response = await fetch(targetUrl.toString(), {
			headers: {
				'X-Tabtin-Auth': addon.auth_token || ''
			}
		});

		if (!response.ok) {
			throw error(response.status, `Addon returned ${response.status}`);
		}

		// Get content type
		const contentType = response.headers.get('content-type') || 'application/octet-stream';

		// Return the response with appropriate headers
		const body = await response.arrayBuffer();

		return new Response(body, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'no-cache'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('[AddonProxy] Error:', err);
		throw error(500, 'Proxy error');
	}
};

export const POST: RequestHandler = async ({ params, locals, url, request }) => {
	if (!ADDONS_ENABLED) {
		throw error(503, 'Addons are disabled on this instance');
	}

	const { addonId, path } = params;

	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const manager = getAddonManager();
		const addon = await manager.getByManifestId(addonId, locals.user.id);

		if (!addon) {
			throw error(404, 'Addon not found');
		}

		if (addon.container_status !== 'running') {
			throw error(400, 'Addon is not running');
		}

		if (!addon.internal_url) {
			throw error(500, 'Addon has no internal URL');
		}

		// Build the target URL
		const addonPath = '/' + (path || '');
		const targetUrl = new URL(addon.internal_url + addonPath);

		// Forward query params
		for (const [key, value] of url.searchParams) {
			targetUrl.searchParams.set(key, value);
		}

		console.log(`[AddonProxy] Proxying POST ${addonPath} to ${targetUrl}`);

		// Get request body
		const body = await request.text();

		// Fetch from addon
		const response = await fetch(targetUrl.toString(), {
			method: 'POST',
			headers: {
				'X-Tabtin-Auth': addon.auth_token || '',
				'Content-Type': request.headers.get('content-type') || 'application/json'
			},
			body
		});

		if (!response.ok) {
			throw error(response.status, `Addon returned ${response.status}`);
		}

		// Get content type
		const contentType = response.headers.get('content-type') || 'application/octet-stream';

		// Return the response
		const responseBody = await response.arrayBuffer();

		return new Response(responseBody, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'no-cache'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		console.error('[AddonProxy] Error:', err);
		throw error(500, 'Proxy error');
	}
};
