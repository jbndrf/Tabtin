// Queue system exports and orchestrator management

import { WorkerOrchestrator } from './worker-orchestrator';
import { QueueManager } from './queue-manager';
import type { WorkerConfig } from './types';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export * from './types';
export { QueueManager } from './queue-manager';
export { QueueWorker } from './worker';
export { WorkerOrchestrator } from './worker-orchestrator';
export { ConnectionPool } from './connection-pool';

// Singleton instances
let orchestratorInstance: WorkerOrchestrator | null = null;
let queueManagerInstance: QueueManager | null = null;

const DEFAULT_CONFIG: WorkerConfig = {
	maxConcurrency: 1, // Default per-project concurrency
	requestsPerMinute: 30,
	retryDelayMs: 2000,
	maxRetries: 3
};

export function getQueueManager(): QueueManager {
	if (!queueManagerInstance) {
		const pocketbaseUrl = publicEnv.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
		const adminEmail = privateEnv.POCKETBASE_ADMIN_EMAIL || 'admin@example.com';
		const adminPassword = privateEnv.POCKETBASE_ADMIN_PASSWORD || 'admin1234';

		queueManagerInstance = new QueueManager(pocketbaseUrl, adminEmail, adminPassword);
	}

	return queueManagerInstance;
}

export function getOrchestrator(): WorkerOrchestrator {
	if (!orchestratorInstance) {
		const pocketbaseUrl = publicEnv.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
		const adminEmail = privateEnv.POCKETBASE_ADMIN_EMAIL || 'admin@example.com';
		const adminPassword = privateEnv.POCKETBASE_ADMIN_PASSWORD || 'admin1234';

		orchestratorInstance = new WorkerOrchestrator(
			DEFAULT_CONFIG,
			pocketbaseUrl,
			adminEmail,
			adminPassword
		);
	}

	return orchestratorInstance;
}

/**
 * Start the worker orchestrator (backward compatible with old startWorker)
 */
export async function startWorker(): Promise<void> {
	const orchestrator = getOrchestrator();
	await orchestrator.start();
}

/**
 * Stop the worker orchestrator (backward compatible with old stopWorker)
 */
export async function stopWorker(): Promise<void> {
	if (orchestratorInstance) {
		await orchestratorInstance.stop();
	}
}

/**
 * Notify orchestrator when jobs are enqueued for a project
 * This ensures a worker is immediately started for the project
 */
export async function notifyJobEnqueued(projectId: string): Promise<void> {
	if (orchestratorInstance) {
		await orchestratorInstance.ensureWorkerForProject(projectId);
	}
}
