import { POCKETBASE_URL } from '$lib/config/pocketbase';
import PocketBase from 'pocketbase';
import { redirect, type Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { startWorker } from '$lib/server/queue';
import { runStartupTasks, initShutdownHandlers } from '$lib/server/startup';

// Global flags to track worker state across hot-reloads
declare global {
	// eslint-disable-next-line no-var
	var __queueWorkerStarted: boolean;
	// eslint-disable-next-line no-var
	var __queueWorkerStarting: boolean;
}

globalThis.__queueWorkerStarted = globalThis.__queueWorkerStarted ?? false;
globalThis.__queueWorkerStarting = globalThis.__queueWorkerStarting ?? false;

// Register shutdown handlers once (persists across HMR)
initShutdownHandlers();

// Start the background worker on server startup (only once)
if (!globalThis.__queueWorkerStarted && !globalThis.__queueWorkerStarting) {
	globalThis.__queueWorkerStarting = true;

	// Run startup tasks first, then start worker
	runStartupTasks()
		.then(() => startWorker())
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
	console.log('[hooks] START', event.request.method, event.url.pathname);

	event.locals.pb = new PocketBase(POCKETBASE_URL);

	// Load the auth cookie into the PocketBase instance
	try {
		event.locals.pb.authStore.loadFromCookie(event.request.headers.get('cookie') || '');
		console.log('[hooks] Cookie loaded, isValid:', event.locals.pb.authStore.isValid);
	} catch (e) {
		console.error('[hooks] Failed to parse auth cookie:', e);
		event.locals.pb.authStore.clear();
	}

	// Verify and refresh the auth token if it's valid
	try {
		if (event.locals.pb.authStore.isValid) {
			console.log('[hooks] Refreshing auth...');
			await event.locals.pb.collection('users').authRefresh();
			console.log('[hooks] Auth refreshed');
			// Set the user in locals for API routes
			event.locals.user = event.locals.pb.authStore.record;
			// Set admin status from user record
			event.locals.isAdmin = event.locals.user?.is_admin === true;
		} else {
			event.locals.isAdmin = false;
		}
	} catch (e) {
		// Clear auth store if refresh fails (token expired or invalid)
		console.log('[hooks] Auth refresh failed:', e);
		event.locals.pb.authStore.clear();
		event.locals.user = null;
		event.locals.isAdmin = false;
	}

	// Redirect unauthenticated users to login (except for public routes)
	if (!event.locals.pb.authStore.isValid && !isPublicRoute(event.url.pathname)) {
		console.log('[hooks] Redirecting to login');
		throw redirect(303, '/login');
	}

	console.log('[hooks] Calling resolve...');
	const response = await resolve(event);
	console.log('[hooks] Resolve done');

	// Sync the auth state back to cookies
	// Security: httpOnly prevents XSS from stealing session, secure ensures HTTPS only, sameSite prevents CSRF
	const pbCookie = event.locals.pb.authStore.exportToCookie({
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax'
	});

	// Only set the cookie if it's not empty
	if (pbCookie) {
		response.headers.append('set-cookie', pbCookie);
	}

	console.log('[hooks] END');
	return response;
};
