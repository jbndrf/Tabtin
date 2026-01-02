/**
 * Addon Lifecycle Management
 * Handles startup and shutdown of addon containers tied to parent container lifecycle
 */

import { getAddonManager } from './manager';
import { stopAllAddonContainers, isDockerAvailable } from './docker';

/**
 * Initialize addon containers on application startup
 * Restarts addons that were previously running
 */
export async function initializeAddons(): Promise<void> {
	console.log('[Addon Lifecycle] Initializing addons...');

	try {
		const manager = getAddonManager();
		await manager.startPreviouslyRunning();
		console.log('[Addon Lifecycle] Addon initialization complete');
	} catch (error) {
		console.error('[Addon Lifecycle] Failed to initialize addons:', error);
	}
}

/**
 * Shutdown all addon containers gracefully
 * Called when the parent application is shutting down
 */
export async function shutdownAddons(timeoutSeconds = 10): Promise<void> {
	console.log('[Addon Lifecycle] Shutting down all addon containers...');

	try {
		if (!(await isDockerAvailable())) {
			console.log('[Addon Lifecycle] Docker not available, nothing to shutdown');
			return;
		}

		await stopAllAddonContainers(timeoutSeconds);
		console.log('[Addon Lifecycle] All addon containers stopped');
	} catch (error) {
		console.error('[Addon Lifecycle] Error during addon shutdown:', error);
	}
}

/**
 * Register process signal handlers for graceful shutdown
 * Should only be called once, not on HMR
 */
export function registerShutdownHandlers(): void {
	const handler = async (signal: string) => {
		console.log(`[Addon Lifecycle] Received ${signal}, initiating shutdown...`);
		await shutdownAddons();
		process.exit(0);
	};

	process.on('SIGTERM', () => handler('SIGTERM'));
	process.on('SIGINT', () => handler('SIGINT'));

	console.log('[Addon Lifecycle] Shutdown handlers registered');
}
