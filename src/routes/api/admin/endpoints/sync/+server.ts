import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, getAdminPb } from '$lib/server/admin-auth';
import { getPredefinedEndpoints } from '$lib/server/instance-config';

export const POST: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	const predefined = getPredefinedEndpoints();
	const pb = await getAdminPb();

	const results = {
		created: [] as string[],
		updated: [] as string[],
		errors: [] as string[]
	};

	for (const endpoint of predefined) {
		try {
			// Check if endpoint with this alias exists
			const existing = await pb
				.collection('llm_endpoints')
				.getFirstListItem(`alias = "${endpoint.alias}"`);

			// Update existing (but preserve is_enabled status)
			await pb.collection('llm_endpoints').update(existing.id, {
				endpoint_url: endpoint.endpoint,
				api_key: endpoint.apiKey,
				model_name: endpoint.model,
				max_input_tokens_per_day: endpoint.maxInputTokensPerDay,
				max_output_tokens_per_day: endpoint.maxOutputTokensPerDay,
				default_temperature: endpoint.defaultTemperature,
				default_top_p: endpoint.defaultTopP,
				default_top_k: endpoint.defaultTopK,
				description: endpoint.description,
				provider_type: endpoint.providerType,
				is_predefined: true
			});
			results.updated.push(endpoint.alias);
		} catch (e: any) {
			if (e.status === 404) {
				// Create new
				await pb.collection('llm_endpoints').create({
					alias: endpoint.alias,
					endpoint_url: endpoint.endpoint,
					api_key: endpoint.apiKey,
					model_name: endpoint.model,
					max_input_tokens_per_day: endpoint.maxInputTokensPerDay,
					max_output_tokens_per_day: endpoint.maxOutputTokensPerDay,
					default_temperature: endpoint.defaultTemperature,
					default_top_p: endpoint.defaultTopP,
					default_top_k: endpoint.defaultTopK,
					description: endpoint.description,
					provider_type: endpoint.providerType,
					is_enabled: true,
					is_predefined: true
				});
				results.created.push(endpoint.alias);
			} else {
				results.errors.push(`${endpoint.alias}: ${e.message}`);
			}
		}
	}

	return json(results);
};
