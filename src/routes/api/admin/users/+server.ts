import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin, getAdminPb } from '$lib/server/admin-auth';

export const GET: RequestHandler = async ({ url, locals }) => {
	requireAdmin(locals);

	const pb = await getAdminPb();

	const page = parseInt(url.searchParams.get('page') || '1', 10);
	const perPage = parseInt(url.searchParams.get('perPage') || '50', 10);

	const users = await pb.collection('users').getList(page, perPage, {
		sort: '-created',
		fields: 'id,email,name,is_admin,verified,created,updated'
	});

	return json({
		users: users.items,
		totalItems: users.totalItems,
		totalPages: users.totalPages,
		page: users.page,
		perPage: users.perPage
	});
};
