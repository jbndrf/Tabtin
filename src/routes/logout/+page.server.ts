import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ locals, cookies }) => {
		locals.pb.authStore.clear();
		// Explicitly delete the auth cookie
		cookies.delete('pb_auth', { path: '/' });
		throw redirect(303, '/login');
	}
};
