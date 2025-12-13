/**
 * Addon Manager - orchestrates addon container lifecycle
 */

import PocketBase from 'pocketbase';
import { randomBytes } from 'crypto';
import type { InstalledAddon, AddonManifest, AddonContainerStatus } from '$lib/types/addon';
import { POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD } from '$env/static/private';
import { POCKETBASE_URL } from '$lib/config/pocketbase';
import {
	buildImage,
	createContainer,
	startContainer,
	stopContainer,
	removeContainer,
	removeImage,
	removeAddonData,
	fetchManifest,
	waitForHealth,
	getContainerStatus,
	getContainerLogs,
	getContainerName,
	isDockerAvailable
} from './docker';

export class AddonManager {
	private pb: PocketBase;
	private isAuthenticated = false;

	constructor(
		private pocketbaseUrl: string,
		private adminEmail: string,
		private adminPassword: string
	) {
		this.pb = new PocketBase(pocketbaseUrl);
	}

	/**
	 * Authenticate with PocketBase as admin
	 */
	private async authenticate(): Promise<void> {
		if (this.isAuthenticated) return;

		try {
			await this.pb.collection('_superusers').authWithPassword(
				this.adminEmail,
				this.adminPassword
			);
			this.isAuthenticated = true;
			console.log('[AddonManager] Authenticated with PocketBase');
		} catch (error) {
			console.error('[AddonManager] Authentication failed:', error);
			throw error;
		}
	}

	/**
	 * Generate a secure auth token for addon communication
	 */
	private generateAuthToken(): string {
		return randomBytes(32).toString('hex');
	}

	/**
	 * Install an addon from a Docker image
	 */
	async install(userId: string, dockerImage: string): Promise<InstalledAddon> {
		await this.authenticate();

		console.log(`[AddonManager] Installing addon from image: ${dockerImage}`);

		// Check if Docker is available
		if (!(await isDockerAvailable())) {
			throw new Error('Docker is not available. Make sure the Docker socket is mounted.');
		}

		// Create initial record with pending status
		const authToken = this.generateAuthToken();
		let record = await this.pb.collection('installed_addons').create({
			user: userId,
			name: 'Loading...',
			docker_image: dockerImage,
			container_status: 'building' as AddonContainerStatus,
			auth_token: authToken,
			config: {}
		});

		try {
			// Build the image from local addons directory
			await this.updateStatus(record.id, 'building');
			await buildImage(dockerImage);

			// Create and start container to fetch manifest
			await this.updateStatus(record.id, 'starting');

			// We need a temporary port to start the container and fetch manifest
			// Default to 8080, will be updated from manifest
			const tempPort = 8080;
			const containerInfo = await createContainer({
				addonId: record.id,
				userId,
				dockerImage,
				port: tempPort,
				authToken
			});

			// Wait for container to be healthy
			const isHealthy = await waitForHealth(containerInfo.internalUrl);
			if (!isHealthy) {
				throw new Error('Addon health check failed');
			}

			// Fetch manifest
			const manifest = await fetchManifest(containerInfo.internalUrl);
			console.log(`[AddonManager] Fetched manifest for addon: ${manifest.name}`);

			// Update record with full info
			record = await this.pb.collection('installed_addons').update(record.id, {
				name: manifest.name,
				container_id: containerInfo.containerId,
				container_status: 'running' as AddonContainerStatus,
				internal_url: containerInfo.internalUrl,
				manifest
			});

			console.log(`[AddonManager] Addon installed successfully: ${manifest.name}`);
			return record as unknown as InstalledAddon;
		} catch (error) {
			// Clean up on failure
			console.error('[AddonManager] Installation failed:', error);

			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.pb.collection('installed_addons').update(record.id, {
				container_status: 'failed' as AddonContainerStatus,
				error_message: errorMessage
			});

			// Try to remove any created container
			try {
				const containerName = getContainerName(record.id, userId);
				await removeContainer(containerName);
			} catch {
				// Ignore cleanup errors
			}

			throw error;
		}
	}

	/**
	 * Start an installed addon (recreates container with current config)
	 */
	async start(addonId: string): Promise<InstalledAddon> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		console.log(`[AddonManager] Starting addon: ${addon.name}`);

		await this.updateStatus(addonId, 'starting');

		try {
			// Recreate container with current config to apply any config changes
			const port = addon.manifest?.port || 8080;
			const containerInfo = await createContainer({
				addonId: addon.id,
				userId: addon.user,
				dockerImage: addon.docker_image,
				port,
				authToken: addon.auth_token || this.generateAuthToken(),
				addonConfig: addon.config as Record<string, unknown>
			});

			// Wait for health check
			const isHealthy = await waitForHealth(containerInfo.internalUrl);
			if (!isHealthy) {
				throw new Error('Addon health check failed after start');
			}

			// Update record with new container info
			const updated = await this.pb.collection('installed_addons').update(addonId, {
				container_id: containerInfo.containerId,
				container_status: 'running' as AddonContainerStatus,
				internal_url: containerInfo.internalUrl,
				error_message: null
			});

			return updated as unknown as InstalledAddon;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			await this.pb.collection('installed_addons').update(addonId, {
				container_status: 'failed' as AddonContainerStatus,
				error_message: errorMessage
			});
			throw error;
		}
	}

	/**
	 * Stop an installed addon
	 */
	async stop(addonId: string): Promise<InstalledAddon> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		if (!addon.container_id) {
			throw new Error('Addon has no container');
		}

		console.log(`[AddonManager] Stopping addon: ${addon.name}`);

		await stopContainer(addon.container_id);
		return await this.updateStatus(addonId, 'stopped');
	}

	/**
	 * Uninstall an addon completely
	 */
	async uninstall(addonId: string): Promise<void> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		console.log(`[AddonManager] Uninstalling addon: ${addon.name}`);

		// Remove container if exists
		if (addon.container_id) {
			try {
				await removeContainer(addon.container_id);
			} catch (error) {
				console.warn('[AddonManager] Failed to remove container:', error);
			}
		}

		// Remove Docker image to clear cache
		if (addon.docker_image) {
			try {
				await removeImage(addon.docker_image);
			} catch (error) {
				console.warn('[AddonManager] Failed to remove image:', error);
			}
		}

		// Remove addon data directory
		try {
			removeAddonData(addon.id, addon.user);
		} catch (error) {
			console.warn('[AddonManager] Failed to remove addon data:', error);
		}

		// Delete record
		await this.pb.collection('installed_addons').delete(addonId);

		console.log(`[AddonManager] Addon uninstalled: ${addon.name}`);
	}

	/**
	 * Update addon configuration
	 */
	async updateConfig(
		addonId: string,
		config: Record<string, unknown>
	): Promise<InstalledAddon> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		console.log(`[AddonManager] Updating config for addon: ${addon.name}`);

		const updated = await this.pb.collection('installed_addons').update(addonId, {
			config
		});

		return updated as unknown as InstalledAddon;
	}

	/**
	 * Call an addon endpoint
	 */
	async call<T = unknown>(
		addonId: string,
		endpoint: string,
		method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'POST',
		data?: unknown
	): Promise<T> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		if (addon.container_status !== 'running') {
			throw new Error(`Addon is not running (status: ${addon.container_status})`);
		}

		if (!addon.internal_url || !addon.auth_token) {
			throw new Error('Addon is not properly configured');
		}

		const url = `${addon.internal_url}${endpoint}`;
		console.log(`[AddonManager] Calling addon endpoint: ${method} ${url}`);

		const response = await fetch(url, {
			method,
			headers: {
				'Content-Type': 'application/json',
				'X-Tabtin-Auth': addon.auth_token
			},
			body: data ? JSON.stringify(data) : undefined,
			signal: AbortSignal.timeout(30000) // 30 second timeout
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`Addon call failed: ${response.status} ${response.statusText} - ${text}`);
		}

		return response.json();
	}

	/**
	 * Get addon logs
	 */
	async getLogs(addonId: string, tail = 100): Promise<string> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		if (!addon.container_id) {
			throw new Error('Addon has no container');
		}

		return getContainerLogs(addon.container_id, tail);
	}

	/**
	 * List all addons for a user
	 */
	async listForUser(userId: string): Promise<InstalledAddon[]> {
		await this.authenticate();

		const records = await this.pb.collection('installed_addons').getFullList({
			filter: `user = "${userId}"`,
			sort: '-created'
		});

		return records as unknown as InstalledAddon[];
	}

	/**
	 * Get a single addon by database ID
	 */
	async get(addonId: string): Promise<InstalledAddon> {
		await this.authenticate();

		const record = await this.pb.collection('installed_addons').getOne(addonId);
		return record as unknown as InstalledAddon;
	}

	/**
	 * Get a single addon by manifest ID (the id field in manifest.json)
	 */
	async getByManifestId(manifestId: string, userId: string): Promise<InstalledAddon | null> {
		await this.authenticate();

		try {
			// Fetch all addons for user and filter by manifest ID in code
			// PocketBase JSON field filtering can be unreliable
			// Use unique requestKey to prevent auto-cancellation of parallel requests
			const requestKey = `getByManifestId_${manifestId}_${userId}_${Date.now()}`;

			const records = await this.pb.collection('installed_addons').getFullList({
				filter: `user = "${userId}"`,
				requestKey
			});

			const addon = records.find(
				(r) => (r as unknown as InstalledAddon).manifest?.id === manifestId
			);

			if (!addon) {
				return null;
			}

			return addon as unknown as InstalledAddon;
		} catch (err) {
			console.error('[AddonManager] Error in getByManifestId:', err);
			return null;
		}
	}

	/**
	 * Sync addon status with actual container status
	 */
	async syncStatus(addonId: string): Promise<InstalledAddon> {
		await this.authenticate();

		const addon = await this.pb
			.collection('installed_addons')
			.getOne(addonId) as unknown as InstalledAddon;

		if (!addon.container_id) {
			return addon;
		}

		const actualStatus = await getContainerStatus(addon.container_id);

		let newStatus: AddonContainerStatus;
		switch (actualStatus) {
			case 'running':
				newStatus = 'running';
				break;
			case 'stopped':
				newStatus = 'stopped';
				break;
			case 'not_found':
				newStatus = 'failed';
				break;
		}

		if (newStatus !== addon.container_status) {
			return await this.updateStatus(addonId, newStatus);
		}

		return addon;
	}

	/**
	 * Update addon status in database
	 */
	private async updateStatus(
		addonId: string,
		status: AddonContainerStatus
	): Promise<InstalledAddon> {
		const updated = await this.pb.collection('installed_addons').update(addonId, {
			container_status: status,
			error_message: status === 'running' ? null : undefined
		});
		return updated as unknown as InstalledAddon;
	}
}

// Singleton instance
let addonManagerInstance: AddonManager | null = null;

/**
 * Get or create the addon manager instance
 */
export function getAddonManager(): AddonManager {
	if (!addonManagerInstance) {
		if (!POCKETBASE_ADMIN_EMAIL || !POCKETBASE_ADMIN_PASSWORD) {
			throw new Error('POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD environment variables are required');
		}

		addonManagerInstance = new AddonManager(POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD);
	}

	return addonManagerInstance;
}
