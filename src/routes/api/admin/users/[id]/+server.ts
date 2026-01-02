import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, getAdminPb } from '$lib/server/admin-auth';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	requireAdmin(locals);

	const body = await request.json();
	const pb = await getAdminPb();

	// Prevent self-demotion
	if (params.id === locals.user?.id && body.is_admin === false) {
		throw error(400, 'Cannot remove your own admin privileges');
	}

	try {
		const updates: Record<string, any> = {};

		// Only allow updating is_admin for now
		if (typeof body.is_admin === 'boolean') {
			updates.is_admin = body.is_admin;
		}

		if (Object.keys(updates).length === 0) {
			throw error(400, 'No valid fields to update');
		}

		const user = await pb.collection('users').update(params.id, updates);

		return json({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				is_admin: user.is_admin,
				verified: user.verified,
				created: user.created,
				updated: user.updated
			}
		});
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'User not found');
		}
		throw e;
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);

	// Prevent self-deletion
	if (params.id === locals.user?.id) {
		throw error(400, 'Cannot delete your own account');
	}

	const pb = await getAdminPb();

	try {
		await pb.collection('users').delete(params.id);
		return json({ success: true });
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'User not found');
		}
		throw e;
	}
};
