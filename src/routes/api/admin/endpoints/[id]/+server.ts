import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, getAdminPb } from '$lib/server/admin-auth';

export const GET: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);

	const pb = await getAdminPb();

	try {
		const endpoint = await pb.collection('llm_endpoints').getOne(params.id);
		return json({ endpoint });
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'Endpoint not found');
		}
		throw e;
	}
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	requireAdmin(locals);

	const body = await request.json();
	const pb = await getAdminPb();

	try {
		const existing = await pb.collection('llm_endpoints').getOne(params.id);

		// Build update object
		const updates: Record<string, any> = {};

		// Fields that can always be updated
		const alwaysAllowed = ['is_enabled', 'description'];
		for (const field of alwaysAllowed) {
			if (field in body) {
				updates[field] = body[field];
			}
		}

		// For predefined endpoints, only allow toggling is_enabled and description
		// For custom endpoints, allow all fields
		if (!existing.is_predefined) {
			const customAllowed = [
				'alias',
				'endpoint_url',
				'api_key',
				'model_name',
				'max_input_tokens_per_day',
				'max_output_tokens_per_day',
				'default_temperature',
				'default_top_p',
				'default_top_k',
				'provider_type'
			];
			for (const field of customAllowed) {
				if (field in body) {
					updates[field] = body[field];
				}
			}
		}

		const endpoint = await pb.collection('llm_endpoints').update(params.id, updates);
		return json({ endpoint });
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'Endpoint not found');
		}
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);

	const pb = await getAdminPb();

	try {
		const existing = await pb.collection('llm_endpoints').getOne(params.id);

		// Cannot delete predefined endpoints
		if (existing.is_predefined) {
			throw error(403, 'Cannot delete predefined endpoints. You can disable them instead.');
		}

		await pb.collection('llm_endpoints').delete(params.id);
		return json({ success: true });
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'Endpoint not found');
		}
		throw e;
	}
};
