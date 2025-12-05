import PocketBase from 'pocketbase';
import { writable } from 'svelte/store';
import { POCKETBASE_URL } from '$lib/config/pocketbase';

export const pb = new PocketBase(POCKETBASE_URL);

// Disable auto-cancellation to prevent bulk operations from cancelling each other
pb.autoCancellation(false);

export const currentUser = writable(pb.authStore.model);

// Function to save auth to cookies
function saveAuthToCookie() {
	if (typeof document !== 'undefined') {
		// Only use Secure flag on HTTPS connections
		const isSecure = window.location.protocol === 'https:';
		const cookieStr = pb.authStore.exportToCookie({
			httpOnly: false,
			secure: isSecure
		});
		console.log('[Client Auth] Setting cookie:', cookieStr);
		document.cookie = cookieStr;
		console.log('[Client Auth] All cookies after setting:', document.cookie);
	}
}

// Save auth to cookies whenever it changes (so server can read it)
pb.authStore.onChange((auth) => {
	console.log('[Client Auth] onChange fired:', auth);
	currentUser.set(pb.authStore.model);
	saveAuthToCookie();
});

// Also save on initial load if already authenticated
if (typeof window !== 'undefined' && pb.authStore.isValid) {
	console.log('[Client Auth] Initial auth detected, saving to cookie');
	saveAuthToCookie();
}

// Setup auto-refresh for remember me sessions
if (typeof window !== 'undefined') {
	const rememberMe = localStorage.getItem('pb_remember_me') === 'true';

	if (rememberMe && pb.authStore.isValid) {
		// Refresh token every 24 hours for remember me sessions
		setInterval(async () => {
			try {
				if (pb.authStore.isValid && localStorage.getItem('pb_remember_me') === 'true') {
					await pb.collection('users').authRefresh();
					console.log('Token refreshed successfully');
				}
			} catch (error) {
				console.error('Failed to refresh token:', error);
				localStorage.removeItem('pb_remember_me');
			}
		}, 24 * 60 * 60 * 1000); // 24 hours
	}
}
