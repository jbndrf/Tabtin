import { z } from 'zod/v4';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getAdminPb, getAppSettings } from '$lib/server/admin-auth';

const registerSchema = z
	.object({
		name: z.string().min(2),
		email: z.string().email(),
		password: z.string().min(8),
		passwordConfirm: z.string().min(8)
	})
	.refine((data) => data.password === data.passwordConfirm, {
		message: 'Passwords do not match',
		path: ['passwordConfirm']
	});

async function checkRegistrationAllowed(): Promise<{ allowed: boolean; isFirstUser: boolean }> {
	const pb = await getAdminPb();
	const users = await pb.collection('users').getList(1, 1);
	const isFirstUser = users.totalItems === 0;

	// First user registration is always allowed
	if (isFirstUser) {
		return { allowed: true, isFirstUser: true };
	}

	// Check app settings
	const settings = await getAppSettings();
	return { allowed: settings.allow_registration, isFirstUser: false };
}

export const load: PageServerLoad = async ({ locals }) => {
	// If user is already authenticated, redirect to dashboard
	if (locals.pb?.authStore?.isValid) {
		throw redirect(303, '/dashboard');
	}

	const { allowed, isFirstUser } = await checkRegistrationAllowed();

	return {
		form: await superValidate(zod4(registerSchema)),
		registrationAllowed: allowed,
		isFirstUser
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(registerSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		// Check if registration is allowed
		const { allowed, isFirstUser } = await checkRegistrationAllowed();
		if (!allowed) {
			return fail(403, {
				form,
				error: 'Registration is currently disabled'
			});
		}

		try {
			// Use admin PB for creating users to set is_admin field
			const pb = await getAdminPb();
			await pb.collection('users').create({
				name: form.data.name,
				email: form.data.email,
				password: form.data.password,
				passwordConfirm: form.data.passwordConfirm,
				// First user becomes admin
				is_admin: isFirstUser,
				// First user is auto-verified
				verified: isFirstUser
			});

			// Authenticate with the user's PB instance
			await locals.pb.collection('users').authWithPassword(form.data.email, form.data.password);
		} catch (error: any) {
			const errorMessage =
				error?.message?.includes('email') || error?.response?.data?.email
					? 'An account with this email already exists'
					: 'An error occurred. Please try again.';

			return fail(400, {
				form,
				error: errorMessage
			});
		}

		throw redirect(303, '/');
	}
};
