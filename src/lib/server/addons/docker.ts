/**
 * Docker helper for addon container management
 * All addons are built locally from the addons/ directory
 */

import Docker from 'dockerode';
import type { AddonManifest } from '$lib/types/addon';

import { resolve } from 'path';
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Network name - can be set via env var for Docker Compose projects
const ADDON_NETWORK = process.env.ADDON_NETWORK || 'bridge';
// Must be absolute path for Docker bind mounts
const ADDON_DATA_PATH = process.env.ADDON_DATA_PATH || resolve(process.cwd(), 'data/addons');
// Path to local addons directory
const ADDONS_DIR = process.env.ADDONS_DIR || resolve(process.cwd(), 'addons');
const CONTAINER_MEMORY_LIMIT = 512 * 1024 * 1024; // 512MB
const CONTAINER_CPU_QUOTA = 50000; // 50% of one CPU

export interface ContainerConfig {
	addonId: string;
	userId: string;
	dockerImage: string;
	port: number;
	authToken: string;
	addonConfig?: Record<string, unknown>;
}

export interface ContainerInfo {
	containerId: string;
	containerName: string;
	internalUrl: string;
}

/**
 * Generate a unique container name for an addon instance
 */
export function getContainerName(addonId: string, userId: string): string {
	const shortUserId = userId.substring(0, 8);
	return `tabtin-addon-${addonId}-${shortUserId}`;
}

/**
 * Check if an image exists locally
 */
async function imageExistsLocally(imageName: string): Promise<boolean> {
	try {
		const images = await docker.listImages({
			filters: { reference: [imageName] }
		});
		return images.length > 0;
	} catch {
		return false;
	}
}

/**
 * Extract addon name from image name (e.g., "tabtin-addon-paperless-ngx" -> "paperless-ngx")
 */
function getAddonDirName(imageName: string): string {
	// Remove "tabtin-addon-" prefix if present
	return imageName.replace(/^tabtin-addon-/, '');
}

/**
 * Build a Docker image from local addons directory
 * Always builds locally - no Docker Hub pulls
 */
export async function buildImage(imageName: string, force = false): Promise<void> {
	// Check if image exists locally first (unless force rebuild)
	if (!force) {
		const existsLocally = await imageExistsLocally(imageName);
		if (existsLocally) {
			console.log(`[Addon] Image exists locally: ${imageName}`);
			return;
		}
	}

	const addonDir = getAddonDirName(imageName);
	const buildContext = resolve(ADDONS_DIR, addonDir);

	// Check if addon directory exists
	if (!existsSync(buildContext)) {
		throw new Error(`Addon directory not found: ${buildContext}. Available addons are in the addons/ directory.`);
	}

	// Check if Dockerfile exists
	const dockerfilePath = resolve(buildContext, 'Dockerfile');
	if (!existsSync(dockerfilePath)) {
		throw new Error(`Dockerfile not found in ${buildContext}`);
	}

	console.log(`[Addon] Building image: ${imageName} from ${buildContext}`);

	return new Promise((resolve, reject) => {
		docker.buildImage(
			{
				context: buildContext,
				src: ['.']
			},
			{
				t: imageName,
				dockerfile: 'Dockerfile'
			},
			(err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
				if (err) {
					console.error(`[Addon] Failed to start build: ${err.message}`);
					return reject(err);
				}

				if (!stream) {
					return reject(new Error('No build stream returned'));
				}

				docker.modem.followProgress(
					stream,
					(err: Error | null, output: Array<{ stream?: string; error?: string }>) => {
						if (err) {
							console.error(`[Addon] Build failed: ${err.message}`);
							reject(err);
						} else {
							// Check for build errors in output
							const errorOutput = output.find((o) => o.error);
							if (errorOutput) {
								console.error(`[Addon] Build error: ${errorOutput.error}`);
								reject(new Error(errorOutput.error));
							} else {
								console.log(`[Addon] Image built successfully: ${imageName}`);
								resolve();
							}
						}
					},
					(event: { stream?: string; status?: string; progress?: string }) => {
						if (event.stream) {
							process.stdout.write(`[Addon Build] ${event.stream}`);
						} else if (event.status) {
							console.log(`[Addon] ${event.status} ${event.progress || ''}`);
						}
					}
				);
			}
		);
	});
}

/**
 * @deprecated Use buildImage instead - all addons are built locally
 */
export async function pullImage(imageName: string): Promise<void> {
	// Redirect to buildImage for backwards compatibility
	return buildImage(imageName);
}

/**
 * Fetch manifest from a running container
 */
export async function fetchManifest(internalUrl: string): Promise<AddonManifest> {
	const response = await fetch(`${internalUrl}/manifest.json`, {
		signal: AbortSignal.timeout(10000)
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

/**
 * Wait for container health check to pass
 */
export async function waitForHealth(
	internalUrl: string,
	maxAttempts = 30,
	intervalMs = 1000
): Promise<boolean> {
	console.log(`[Addon] Waiting for health check at ${internalUrl}/health`);

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const response = await fetch(`${internalUrl}/health`, {
				signal: AbortSignal.timeout(5000)
			});

			if (response.ok) {
				console.log(`[Addon] Health check passed on attempt ${attempt}`);
				return true;
			}
		} catch {
			// Ignore errors, container may not be ready yet
		}

		if (attempt < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, intervalMs));
		}
	}

	console.error(`[Addon] Health check failed after ${maxAttempts} attempts`);
	return false;
}

/**
 * Find an available port for addon container
 */
async function findAvailablePort(startPort = 9000): Promise<number> {
	const containers = await docker.listContainers({ all: true });
	const usedPorts = new Set<number>();

	for (const container of containers) {
		if (container.Ports) {
			for (const port of container.Ports) {
				if (port.PublicPort) {
					usedPorts.add(port.PublicPort);
				}
			}
		}
	}

	let port = startPort;
	while (usedPorts.has(port)) {
		port++;
	}
	return port;
}

/**
 * Create and start a container for an addon
 */
export async function createContainer(config: ContainerConfig): Promise<ContainerInfo> {
	const containerName = getContainerName(config.addonId, config.userId);
	const dataVolumePath = `${ADDON_DATA_PATH}/${config.addonId}-${config.userId.substring(0, 8)}`;

	console.log(`[Addon] Creating container: ${containerName}`);

	// Check if container already exists
	try {
		const existingContainer = docker.getContainer(containerName);
		const info = await existingContainer.inspect();
		if (info) {
			console.log(`[Addon] Container already exists, removing: ${containerName}`);
			await existingContainer.stop().catch(() => {});
			await existingContainer.remove();
		}
	} catch {
		// Container doesn't exist, continue
	}

	// Build environment variables from config
	const envVars = [
		`TABTIN_AUTH_TOKEN=${config.authToken}`,
		`TABTIN_ADDON_ID=${config.addonId}`,
		`PORT=${config.port}`
	];

	// Add addon config as ADDON_* environment variables
	if (config.addonConfig) {
		for (const [key, value] of Object.entries(config.addonConfig)) {
			if (value !== undefined && value !== null) {
				const envKey = `ADDON_${key.toUpperCase()}`;
				envVars.push(`${envKey}=${String(value)}`);
			}
		}
	}

	// Determine if we need port mapping (when using bridge network in dev mode)
	const useBridge = ADDON_NETWORK === 'bridge';
	const hostPort = useBridge ? await findAvailablePort() : undefined;

	const container = await docker.createContainer({
		Image: config.dockerImage,
		name: containerName,
		Env: envVars,
		ExposedPorts: {
			[`${config.port}/tcp`]: {}
		},
		HostConfig: {
			NetworkMode: ADDON_NETWORK,
			PortBindings: useBridge
				? { [`${config.port}/tcp`]: [{ HostPort: String(hostPort) }] }
				: undefined,
			Binds: [`${dataVolumePath}:/data:rw`],
			Memory: CONTAINER_MEMORY_LIMIT,
			CpuQuota: CONTAINER_CPU_QUOTA,
			RestartPolicy: {
				Name: 'unless-stopped'
			}
		},
		Labels: {
			'tabtin.addon': 'true',
			'tabtin.addon.id': config.addonId,
			'tabtin.addon.user': config.userId
		}
	});

	console.log(`[Addon] Starting container: ${containerName}`);
	await container.start();

	// When using bridge network, access via localhost:hostPort
	// When using custom network, access via container name
	const internalUrl = useBridge
		? `http://127.0.0.1:${hostPort}`
		: `http://${containerName}:${config.port}`;

	return {
		containerId: container.id,
		containerName,
		internalUrl
	};
}

/**
 * Stop a container
 */
export async function stopContainer(containerIdOrName: string): Promise<void> {
	console.log(`[Addon] Stopping container: ${containerIdOrName}`);

	try {
		const container = docker.getContainer(containerIdOrName);
		await container.stop({ t: 10 }); // 10 second timeout for graceful shutdown
		console.log(`[Addon] Container stopped: ${containerIdOrName}`);
	} catch (error: unknown) {
		const err = error as { statusCode?: number };
		if (err.statusCode === 304) {
			// Container already stopped
			console.log(`[Addon] Container already stopped: ${containerIdOrName}`);
		} else {
			throw error;
		}
	}
}

/**
 * Start an existing container
 */
export async function startContainer(containerIdOrName: string): Promise<void> {
	console.log(`[Addon] Starting container: ${containerIdOrName}`);

	try {
		const container = docker.getContainer(containerIdOrName);
		await container.start();
		console.log(`[Addon] Container started: ${containerIdOrName}`);
	} catch (error: unknown) {
		const err = error as { statusCode?: number };
		if (err.statusCode === 304) {
			// Container already running
			console.log(`[Addon] Container already running: ${containerIdOrName}`);
		} else {
			throw error;
		}
	}
}

/**
 * Remove a container
 */
export async function removeContainer(containerIdOrName: string): Promise<void> {
	console.log(`[Addon] Removing container: ${containerIdOrName}`);

	try {
		const container = docker.getContainer(containerIdOrName);

		// Stop first if running
		try {
			await container.stop({ t: 5 });
		} catch {
			// Ignore stop errors
		}

		await container.remove({ force: true });
		console.log(`[Addon] Container removed: ${containerIdOrName}`);
	} catch (error: unknown) {
		const err = error as { statusCode?: number };
		if (err.statusCode === 404) {
			console.log(`[Addon] Container not found: ${containerIdOrName}`);
		} else {
			throw error;
		}
	}
}

/**
 * Remove a Docker image
 */
export async function removeImage(imageName: string): Promise<void> {
	console.log(`[Addon] Removing image: ${imageName}`);

	try {
		const image = docker.getImage(imageName);
		await image.remove({ force: true });
		console.log(`[Addon] Image removed: ${imageName}`);
	} catch (error: unknown) {
		const err = error as { statusCode?: number };
		if (err.statusCode === 404) {
			console.log(`[Addon] Image not found: ${imageName}`);
		} else if (err.statusCode === 409) {
			console.log(`[Addon] Image in use, skipping removal: ${imageName}`);
		} else {
			throw error;
		}
	}
}

/**
 * Remove addon data directory
 */
export function removeAddonData(addonId: string, userId: string): void {
	const dataPath = `${ADDON_DATA_PATH}/${addonId}-${userId.substring(0, 8)}`;
	console.log(`[Addon] Removing addon data: ${dataPath}`);

	try {
		if (existsSync(dataPath)) {
			rmSync(dataPath, { recursive: true, force: true });
			console.log(`[Addon] Addon data removed: ${dataPath}`);
		} else {
			console.log(`[Addon] Addon data not found: ${dataPath}`);
		}
	} catch (error) {
		console.warn(`[Addon] Failed to remove addon data: ${error}`);
	}
}

/**
 * Get container status
 */
export async function getContainerStatus(
	containerIdOrName: string
): Promise<'running' | 'stopped' | 'not_found'> {
	try {
		const container = docker.getContainer(containerIdOrName);
		const info = await container.inspect();

		if (info.State.Running) {
			return 'running';
		}
		return 'stopped';
	} catch (error: unknown) {
		const err = error as { statusCode?: number };
		if (err.statusCode === 404) {
			return 'not_found';
		}
		throw error;
	}
}

/**
 * Get container logs
 */
export async function getContainerLogs(
	containerIdOrName: string,
	tail = 100
): Promise<string> {
	const container = docker.getContainer(containerIdOrName);

	const logs = await container.logs({
		stdout: true,
		stderr: true,
		tail,
		timestamps: true
	});

	return logs.toString('utf-8');
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
	try {
		await docker.ping();
		return true;
	} catch {
		return false;
	}
}

/**
 * Available addon info from local addons directory
 */
export interface AvailableAddon {
	id: string;
	name: string;
	description?: string;
	version?: string;
	dockerImage: string;
	hasManifest: boolean;
	configSchema?: Record<string, unknown>;
}

/**
 * List available addons from the local addons directory
 * Scans for directories with a Dockerfile
 */
export function listAvailableAddons(): AvailableAddon[] {
	const addons: AvailableAddon[] = [];

	if (!existsSync(ADDONS_DIR)) {
		console.log(`[Addon] Addons directory not found: ${ADDONS_DIR}`);
		return addons;
	}

	const entries = readdirSync(ADDONS_DIR, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;

		const addonDir = resolve(ADDONS_DIR, entry.name);
		const dockerfilePath = resolve(addonDir, 'Dockerfile');
		const manifestPath = resolve(addonDir, 'manifest.json');

		// Must have a Dockerfile
		if (!existsSync(dockerfilePath)) continue;

		const dockerImage = `tabtin-addon-${entry.name}`;
		let manifest: Partial<AddonManifest> | null = null;

		// Try to read manifest for metadata
		if (existsSync(manifestPath)) {
			try {
				const content = readFileSync(manifestPath, 'utf-8');
				manifest = JSON.parse(content);
			} catch (err) {
				console.warn(`[Addon] Failed to parse manifest for ${entry.name}:`, err);
			}
		}

		addons.push({
			id: entry.name,
			name: manifest?.name || entry.name,
			description: manifest?.description,
			version: manifest?.version,
			dockerImage,
			hasManifest: !!manifest,
			configSchema: manifest?.config_schema
		});
	}

	return addons;
}
