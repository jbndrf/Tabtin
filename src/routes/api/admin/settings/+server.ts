import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	requireAdmin,
	getAppSettings,
	upsertAppSettings,
	type AppSettings
} from '$lib/server/admin-auth';
import { getInstanceLimits } from '$lib/server/instance-config';

export const GET: RequestHandler = async ({ locals }) => {
	requireAdmin(locals);

	const settings = await getAppSettings();
	const instanceLimits = getInstanceLimits();

	return json({
		settings,
		instanceLimits
	});
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	requireAdmin(locals);

	const body = await request.json();

	// Only allow updating admin-configurable fields
	const allowedFields: (keyof Omit<AppSettings, 'id'>)[] = [
		'allow_registration',
		'require_email_verification',
		'allow_custom_endpoints'
	];

	const updates: Partial<Omit<AppSettings, 'id'>> = {};
	for (const field of allowedFields) {
		if (field in body) {
			updates[field] = body[field];
		}
	}

	const settings = await upsertAppSettings(updates);

	return json({ settings });
};
