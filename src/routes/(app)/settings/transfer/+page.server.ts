import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import type { ProjectsResponse } from '$lib/pocketbase-types';

export const load: PageServerLoad = async ({ locals }) => {
	// Check if feature is enabled
	const featureEnabled = env.ALLOW_IMPORT_EXPORT === 'true';

	if (!featureEnabled) {
		// Still allow viewing the page to show "disabled" message
		return {
			featureEnabled: false,
			projects: []
		};
	}

	if (!locals.user) {
		redirect(302, '/login');
	}

	// Load user's projects
	const projects = await locals.pb.collection('projects').getFullList<ProjectsResponse>({
		filter: locals.pb.filter('user = {:userId}', { userId: locals.user.id }),
		sort: '-created'
	});

	return {
		featureEnabled: true,
		projects: projects.map((p) => ({
			id: p.id,
			name: p.name,
			created: p.created
		}))
	};
};
