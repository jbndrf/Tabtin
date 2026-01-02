import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Require authentication
	if (!locals.user) {
		throw redirect(303, '/login');
	}

	// Require admin privileges
	if (!locals.isAdmin) {
		throw redirect(303, '/dashboard');
	}

	return {
		isAdmin: true
	};
};
