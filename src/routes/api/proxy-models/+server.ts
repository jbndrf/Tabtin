import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/authorization';
import { validateExternalUrl } from '$lib/server/url-validator';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Security: Require authentication
		requireAuth(locals);

		const { endpoint, apiKey } = await request.json();

		if (!endpoint) {
			return json({ error: 'Endpoint is required' }, { status: 400 });
		}

		// Security: SSRF protection - validate URL before fetching
		const urlValidation = await validateExternalUrl(endpoint);
		if (!urlValidation.allowed) {
			return json(
				{ error: `Invalid endpoint URL: ${urlValidation.reason}` },
				{ status: 400 }
			);
		}

		// Convert endpoint to models endpoint
		let modelsUrl = endpoint;

		// If endpoint contains /chat/completions, replace with /models
		if (modelsUrl.includes('/chat/completions')) {
			modelsUrl = modelsUrl.replace('/chat/completions', '/models');
		}
		// If endpoint ends with /v1, append /models
		else if (modelsUrl.endsWith('/v1')) {
			modelsUrl = modelsUrl + '/models';
		}
		// If endpoint doesn't have /models, try to append it intelligently
		else if (!modelsUrl.includes('/models')) {
			// Remove trailing slash if present
			modelsUrl = modelsUrl.replace(/\/$/, '');
			// Add /v1/models if it doesn't have /v1
			if (!modelsUrl.includes('/v1')) {
				modelsUrl = modelsUrl + '/v1/models';
			} else {
				modelsUrl = modelsUrl + '/models';
			}
		}

		// Fetch models from the API
		const response = await fetch(modelsUrl, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
			}
		});

		if (!response.ok) {
			const errorText = await response.text();
			return json(
				{ error: `Failed to fetch models: ${response.statusText}`, details: errorText },
				{ status: response.status }
			);
		}

		const data = await response.json();
		return json(data);
	} catch (err) {
		console.error('Proxy error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch models' },
			{ status: 500 }
		);
	}
};
