import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, getAdminPb } from '$lib/server/admin-auth';

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	const pb = await getAdminPb();
	const endpoints = await pb.collection('llm_endpoints').getFullList({
		sort: '+alias'
	});

	const sanitized = endpoints.map((ep) => {
		if (ep.is_predefined) {
			return { ...ep, api_key: '********', endpoint_url: '(managed by instance)' };
		}
		return ep;
	});

	return json({ endpoints: sanitized });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	requireAdmin(locals);

	const body = await request.json();

	// Validate required fields
	if (!body.alias || !body.endpoint_url || !body.api_key || !body.model_name) {
		throw error(400, 'Missing required fields: alias, endpoint_url, api_key, model_name');
	}

	if (
		typeof body.max_input_tokens_per_day !== 'number' ||
		typeof body.max_output_tokens_per_day !== 'number'
	) {
		throw error(400, 'max_input_tokens_per_day and max_output_tokens_per_day are required');
	}

	const pb = await getAdminPb();

	const endpoint = await pb.collection('llm_endpoints').create({
		alias: body.alias,
		endpoint_url: body.endpoint_url,
		api_key: body.api_key,
		model_name: body.model_name,
		max_input_tokens_per_day: body.max_input_tokens_per_day,
		max_output_tokens_per_day: body.max_output_tokens_per_day,
		default_temperature: body.default_temperature,
		default_top_p: body.default_top_p,
		default_top_k: body.default_top_k,
		is_enabled: body.is_enabled ?? true,
		is_predefined: false,
		description: body.description,
		provider_type: body.provider_type
	});

	return json({ endpoint });
};
