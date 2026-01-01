// Orchestrates per-project queue workers
// Each project gets its own worker instance with isolated processing

import { QueueWorker } from './worker';
import { QueueManager } from './queue-manager';
import type { WorkerConfig } from './types';

export class WorkerOrchestrator {
	private projectWorkers: Map<string, QueueWorker> = new Map();
	private queueManager: QueueManager;
	private discoveryLoop: NodeJS.Timeout | null = null;
	private isRunning = false;

	private pocketbaseUrl: string;
	private adminEmail: string;
	private adminPassword: string;
	private config: WorkerConfig;

	constructor(
		config: WorkerConfig,
		pocketbaseUrl: string,
		adminEmail: string,
		adminPassword: string
	) {
		this.config = config;
		this.pocketbaseUrl = pocketbaseUrl;
		this.adminEmail = adminEmail;
		this.adminPassword = adminPassword;
		this.queueManager = new QueueManager(pocketbaseUrl, adminEmail, adminPassword);
	}

	async start(): Promise<void> {
		if (this.isRunning) {
			console.log('[Orchestrator] Already running');
			return;
		}

		this.isRunning = true;
		console.log('[Orchestrator] Starting...');

		// Initial discovery - start workers for all projects with queued jobs
		await this.discoverAndStartWorkers();

		// Start periodic discovery loop (check every 5 seconds for new projects)
		this.discoveryLoop = setInterval(async () => {
			await this.discoverAndStartWorkers();
		}, 5000);

		console.log('[Orchestrator] Started successfully');
	}

	async stop(): Promise<void> {
		this.isRunning = false;

		if (this.discoveryLoop) {
			clearInterval(this.discoveryLoop);
			this.discoveryLoop = null;
		}

		// Stop all project workers
		const stopPromises = Array.from(this.projectWorkers.values()).map((w) => w.stop());
		await Promise.all(stopPromises);

		this.projectWorkers.clear();
		console.log('[Orchestrator] Stopped all workers');
	}

	private async discoverAndStartWorkers(): Promise<void> {
		if (!this.isRunning) return;

		try {
			const projectIds = await this.queueManager.getProjectsWithQueuedJobs();

			for (const projectId of projectIds) {
				if (!this.projectWorkers.has(projectId)) {
					await this.startWorkerForProject(projectId);
				}
			}
		} catch (error) {
			console.error('[Orchestrator] Error discovering projects:', error);
		}
	}

	private async startWorkerForProject(projectId: string): Promise<void> {
		if (this.projectWorkers.has(projectId)) {
			console.log(`[Orchestrator] Worker for project ${projectId} already exists`);
			return;
		}

		console.log(`[Orchestrator] Starting worker for project ${projectId}`);

		const worker = new QueueWorker(
			this.config,
			this.pocketbaseUrl,
			this.adminEmail,
			this.adminPassword,
			projectId // Pass projectId for per-project mode
		);

		// Set up cleanup callback when worker stops
		worker.onStopped = () => {
			console.log(`[Orchestrator] Worker for project ${projectId} stopped, removing from pool`);
			this.projectWorkers.delete(projectId);
		};

		this.projectWorkers.set(projectId, worker);

		// Start the worker (async, don't await)
		worker.start().catch((err) => {
			console.error(`[Orchestrator] Failed to start worker for project ${projectId}:`, err);
			this.projectWorkers.delete(projectId);
		});
	}

	/**
	 * Manually trigger worker start for a project (called when jobs are enqueued)
	 */
	async ensureWorkerForProject(projectId: string): Promise<void> {
		if (!this.projectWorkers.has(projectId)) {
			await this.startWorkerForProject(projectId);
		}
	}

	/**
	 * Get statistics about all active workers
	 */
	getStats() {
		const stats: Record<string, any> = {};
		for (const [projectId, worker] of this.projectWorkers) {
			stats[projectId] = worker.getStats();
		}
		return {
			activeProjects: this.projectWorkers.size,
			projectStats: stats
		};
	}

	/**
	 * Get list of active project IDs
	 */
	getActiveProjectIds(): string[] {
		return Array.from(this.projectWorkers.keys());
	}
}
