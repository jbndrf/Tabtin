import { POCKETBASE_URL } from '$lib/config/pocketbase';
import PocketBase from 'pocketbase';
import { redirect, type Handle } from '@sveltejs/kit';
import { startWorker, stopWorker } from '$lib/server/queue';

// Use a global variable to track worker state across hot-reloads
// This is necessary because module-level variables are reset on hot-reload
declare global {
	// eslint-disable-next-line no-var
	var __queueWorkerStarted: boolean;
	// eslint-disable-next-line no-var
	var __queueWorkerStarting: boolean;
}

// Initialize globals if they don't exist
globalThis.__queueWorkerStarted = globalThis.__queueWorkerStarted ?? false;
globalThis.__queueWorkerStarting = globalThis.__queueWorkerStarting ?? false;

// Start the background worker on server startup (only once)
if (!globalThis.__queueWorkerStarted && !globalThis.__queueWorkerStarting) {
	globalThis.__queueWorkerStarting = true;
	startWorker()
		.then(() => {
			console.log('[Queue] Background worker started successfully');
			globalThis.__queueWorkerStarted = true;
			globalThis.__queueWorkerStarting = false;
		})
		.catch((error) => {
			console.error('[Queue] Failed to start background worker:', error);
			globalThis.__queueWorkerStarting = false;
		});
}

// Routes that don't require authentication
const publicRoutes = ['/login', '/register', '/logout'];

function isPublicRoute(pathname: string): boolean {
	// Allow public routes
	if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/'))) {
		return true;
	}
	// Allow API routes (they handle their own auth)
	if (pathname.startsWith('/api/')) {
		return true;
	}
	// Allow static assets
	if (pathname.startsWith('/_app/') || pathname.startsWith('/favicon')) {
		return true;
	}
	return false;
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = new PocketBase(POCKETBASE_URL);

	// Load the auth cookie into the PocketBase instance
	event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');

	// Verify and refresh the auth token if it's valid
	try {
		if (event.locals.pb.authStore.isValid) {
			await event.locals.pb.collection('users').authRefresh();
		}
	} catch (_) {
		// Clear auth store if refresh fails (token expired or invalid)
		event.locals.pb.authStore.clear();
	}

	// Redirect unauthenticated users to login (except for public routes)
	if (!event.locals.pb.authStore.isValid && !isPublicRoute(event.url.pathname)) {
		throw redirect(303, '/login');
	}

	const response = await resolve(event);

	// Sync the auth state back to cookies
	const pbCookie = event.locals.pb.authStore.exportToCookie({ httpOnly: false });

	// Only set the cookie if it's not empty
	if (pbCookie) {
		response.headers.append('set-cookie', pbCookie);
	}

	return response;
};
