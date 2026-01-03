/**
 * Authorization utilities for API endpoints
 * Handles authentication and ownership verification
 */

import { error } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';

/**
 * Require user to be authenticated
 * Throws 401 if not authenticated
 */
export function requireAuth(locals: App.Locals): void {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}
}

/**
 * Verify user owns a project
 * Throws 403 if not owner, 404 if project not found
 */
export async function requireProjectOwnership(
	pb: PocketBase,
	userId: string,
	projectId: string
): Promise<void> {
	try {
		const project = await pb.collection('projects').getOne(projectId);
		if (project.user !== userId) {
			throw error(403, 'You do not have access to this project');
		}
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'Project not found');
		}
		throw e;
	}
}

/**
 * Verify user owns a batch (via its project)
 * Throws 403 if not owner, 404 if batch/project not found
 */
export async function requireBatchOwnership(
	pb: PocketBase,
	userId: string,
	batchId: string
): Promise<void> {
	try {
		const batch = await pb.collection('image_batches').getOne(batchId, {
			expand: 'project'
		});
		const project = batch.expand?.project;
		if (!project || project.user !== userId) {
			throw error(403, 'You do not have access to this batch');
		}
	} catch (e: any) {
		if (e.status === 404) {
			throw error(404, 'Batch not found');
		}
		throw e;
	}
}

/**
 * Combined auth + project ownership check
 * Use this in API endpoints that require both authentication and project access
 *
 * @returns The authenticated user ID
 */
export async function requireProjectAuth(
	locals: App.Locals,
	projectId: string
): Promise<string> {
	requireAuth(locals);
	const userId = locals.user!.id;
	await requireProjectOwnership(locals.pb, userId, projectId);
	return userId;
}

/**
 * Combined auth + batch ownership check
 * Use this in API endpoints that require both authentication and batch access
 *
 * @returns The authenticated user ID
 */
export async function requireBatchAuth(
	locals: App.Locals,
	batchId: string
): Promise<string> {
	requireAuth(locals);
	const userId = locals.user!.id;
	await requireBatchOwnership(locals.pb, userId, batchId);
	return userId;
}
