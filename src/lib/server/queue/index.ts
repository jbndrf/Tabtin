// Queue system exports and singleton worker

import { QueueWorker } from './worker';
import { QueueManager } from './queue-manager';
import type { WorkerConfig } from './types';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export * from './types';
export { QueueManager } from './queue-manager';
export { QueueWorker } from './worker';
export { ConnectionPool } from './connection-pool';

// Singleton worker instance
let workerInstance: QueueWorker | null = null;
let queueManagerInstance: QueueManager | null = null;

const DEFAULT_CONFIG: WorkerConfig = {
	maxConcurrency: 1, // Process ONE request at a time to avoid overwhelming LLM
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

export function getWorker(): QueueWorker {
	if (!workerInstance) {
		const pocketbaseUrl = publicEnv.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
		const adminEmail = privateEnv.POCKETBASE_ADMIN_EMAIL || 'admin@example.com';
		const adminPassword = privateEnv.POCKETBASE_ADMIN_PASSWORD || 'admin1234';

		workerInstance = new QueueWorker(DEFAULT_CONFIG, pocketbaseUrl, adminEmail, adminPassword);
	}

	return workerInstance;
}

export async function startWorker(): Promise<void> {
	const worker = getWorker();
	await worker.start();
}

export async function stopWorker(): Promise<void> {
	if (workerInstance) {
		await workerInstance.stop();
	}
}
