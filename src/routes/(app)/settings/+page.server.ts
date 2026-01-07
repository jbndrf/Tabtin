import type { PageServerLoad } from './$types';
import { ADDONS_ENABLED } from '$lib/server/startup';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
	const isAdmin = (locals.user as any)?.is_admin === true;
	const allowImportExport = env.ALLOW_IMPORT_EXPORT === 'true';

	return {
		addonsEnabled: ADDONS_ENABLED,
		allowImportExport,
		isAdmin
	};
};
