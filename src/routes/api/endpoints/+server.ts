import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAdminPb } from '$lib/server/admin-auth';

export const GET: RequestHandler = async ({ locals }) => {
	// Require authenticated user
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	const pb = await getAdminPb();

	const endpoints = await pb.collection('llm_endpoints').getFullList({
		filter: 'is_enabled = true',
		sort: '+alias'
	});

	// Return endpoints without sensitive fields (api_key)
	const safeEndpoints = endpoints.map((endpoint) => ({
		id: endpoint.id,
		alias: endpoint.alias,
		model_name: endpoint.model_name,
		provider_type: endpoint.provider_type,
		description: endpoint.description,
		default_temperature: endpoint.default_temperature,
		default_top_p: endpoint.default_top_p,
		default_top_k: endpoint.default_top_k
	}));

	return json({ endpoints: safeEndpoints });
};
