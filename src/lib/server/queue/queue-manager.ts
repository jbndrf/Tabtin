// Persistent queue manager using PocketBase as storage

import PocketBase from 'pocketbase';
import type {
	QueueJob,
	JobType,
	JobStatus,
	ProcessBatchJobData,
	ReprocessBatchJobData,
	ProcessRedoJobData,
	QueueStats
} from './types';

const QUEUE_COLLECTION = 'queue_jobs';

export class QueueManager {
	private pocketbaseUrl: string;
	private adminEmail: string;
	private adminPassword: string;

	constructor(pocketbaseUrl: string, adminEmail: string, adminPassword: string) {
		this.pocketbaseUrl = pocketbaseUrl;
		this.adminEmail = adminEmail;
		this.adminPassword = adminPassword;
	}

	private async getPocketBase(): Promise<PocketBase> {
		const pb = new PocketBase(this.pocketbaseUrl);
		pb.autoCancellation(false); // Disable auto-cancellation
		try {
			await pb.collection('_superusers').authWithPassword(this.adminEmail, this.adminPassword);
		} catch (error) {
			console.error('Queue manager authentication failed:', error);
			throw error;
		}
		return pb;
	}

	async enqueue(
		type: JobType,
		data: ProcessBatchJobData | ReprocessBatchJobData | ProcessRedoJobData,
		priority: number = 10,
		maxAttempts: number = 3
	): Promise<QueueJob> {
		const pb = await this.getPocketBase();
		const job = {
			type,
			status: 'queued',
			data,
			priority: Number(priority),
			attempts: 0,
			maxAttempts: Number(maxAttempts),
			projectId: data.projectId
		};

		try {
			const record = await pb.collection(QUEUE_COLLECTION).create(job);
			return this.mapRecordToJob(record);
		} catch (error: any) {
			console.error('Failed to create queue job:', {
				job,
				errorData: JSON.stringify(error.response?.data || error, null, 2)
			});
			throw error;
		}
	}

	async enqueueBatch(batchId: string, projectId: string, priority: number = 10): Promise<QueueJob> {
		return this.enqueue('process_batch', { batchId, projectId }, priority);
	}

	async enqueueMultipleBatches(
		batchIds: string[],
		projectId: string,
		priority: number = 10
	): Promise<QueueJob[]> {
		const jobs: Promise<QueueJob>[] = [];

		for (const batchId of batchIds) {
			jobs.push(this.enqueueBatch(batchId, projectId, priority));
		}

		return Promise.all(jobs);
	}

	async getNextJob(): Promise<QueueJob | null> {
		try {
			const pb = await this.getPocketBase();

			// Use atomic update with filter to prevent race conditions
			// Only get jobs that are still "queued" - if another worker grabbed it, this will fail
			const records = await pb.collection(QUEUE_COLLECTION).getList(1, 1, {
				filter: 'status = "queued"',
				sort: '+priority,+created' // Also sort by created for FIFO within same priority
			});

			if (records.items.length === 0) {
				return null;
			}

			const record = records.items[0];

			// Attempt to atomically claim this job by updating only if still queued
			// PocketBase doesn't have native atomic updates, so we use optimistic locking
			// Re-fetch to check if it's still queued before updating
			try {
				const freshRecord = await pb.collection(QUEUE_COLLECTION).getOne(record.id);
				if (freshRecord.status !== 'queued') {
					// Job was already claimed by another worker
					console.log(`[Queue] Job ${record.id} already claimed by another worker, skipping`);
					return null;
				}

				const updated = await pb.collection(QUEUE_COLLECTION).update(record.id, {
					status: 'processing',
					startedAt: new Date().toISOString(),
					attempts: freshRecord.attempts + 1
				});

				return this.mapRecordToJob(updated);
			} catch (updateError: any) {
				// If update fails (e.g., record modified by another process), return null
				if (updateError.status === 404 || updateError.status === 409) {
					console.log(`[Queue] Job ${record.id} was modified/deleted by another process`);
					return null;
				}
				throw updateError;
			}
		} catch (error) {
			console.error('Error getting next job:', error);
			return null;
		}
	}

	async markCompleted(jobId: string): Promise<void> {
		try {
			const pb = await this.getPocketBase();
			await pb.collection(QUEUE_COLLECTION).update(jobId, {
				status: 'completed',
				completedAt: new Date().toISOString()
			});
		} catch (error: any) {
			// If job was deleted (e.g., by cancel operation), silently ignore
			if (error.status === 404) {
				console.log(`Job ${jobId} was already deleted (likely canceled)`);
				return;
			}
			throw error;
		}
	}

	async markFailed(jobId: string, error: string, retry: boolean = false): Promise<void> {
		try {
			const pb = await this.getPocketBase();
			const job = await pb.collection(QUEUE_COLLECTION).getOne(jobId);

			if (retry && job.attempts < job.maxAttempts) {
				const retryDelayMs = Math.pow(2, job.attempts) * 1000;
				await new Promise((resolve) => setTimeout(resolve, retryDelayMs));

				await pb.collection(QUEUE_COLLECTION).update(jobId, {
					status: 'queued',
					lastError: error
				});
			} else {
				await pb.collection(QUEUE_COLLECTION).update(jobId, {
					status: 'failed',
					lastError: error,
					completedAt: new Date().toISOString()
				});
			}
		} catch (error: any) {
			// If job was deleted (e.g., by cancel operation), silently ignore
			if (error.status === 404) {
				console.log(`Job ${jobId} was already deleted (likely canceled)`);
				return;
			}
			throw error;
		}
	}

	async getJob(jobId: string): Promise<QueueJob | null> {
		try {
			const pb = await this.getPocketBase();
			const record = await pb.collection(QUEUE_COLLECTION).getOne(jobId);
			return this.mapRecordToJob(record);
		} catch (error) {
			return null;
		}
	}

	async getJobsByProject(projectId: string, status?: JobStatus): Promise<QueueJob[]> {
		const pb = await this.getPocketBase();
		const filter = status
			? `projectId = "${projectId}" && status = "${status}"`
			: `projectId = "${projectId}"`;

		const records = await pb.collection(QUEUE_COLLECTION).getFullList({
			filter,
			sort: '-id'
		});

		return records.map(this.mapRecordToJob);
	}

	async getStats(): Promise<QueueStats> {
		const pb = await this.getPocketBase();
		const statuses = ['queued', 'processing', 'completed', 'failed'];
		const counts: Record<string, number> = {};

		for (const status of statuses) {
			const records = await pb.collection(QUEUE_COLLECTION).getList(1, 1, {
				filter: `status = "${status}"`
			});
			counts[status] = records.totalItems;
		}

		return {
			queued: counts.queued || 0,
			processing: counts.processing || 0,
			completed: counts.completed || 0,
			failed: counts.failed || 0,
			totalJobs: Object.values(counts).reduce((sum, count) => sum + count, 0)
		};
	}

	async getProjectStats(projectId: string): Promise<QueueStats> {
		const pb = await this.getPocketBase();
		const statuses = ['queued', 'processing', 'completed', 'failed'];
		const counts: Record<string, number> = {};

		for (const status of statuses) {
			const records = await pb.collection(QUEUE_COLLECTION).getList(1, 1, {
				filter: `projectId = "${projectId}" && status = "${status}"`
			});
			counts[status] = records.totalItems;
		}

		return {
			queued: counts.queued || 0,
			processing: counts.processing || 0,
			completed: counts.completed || 0,
			failed: counts.failed || 0,
			totalJobs: Object.values(counts).reduce((sum, count) => sum + count, 0)
		};
	}

	async clearCompleted(olderThanDays: number = 7): Promise<number> {
		const pb = await this.getPocketBase();
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

		const records = await pb.collection(QUEUE_COLLECTION).getFullList({
			filter: `status = "completed" && completedAt < "${cutoffDate.toISOString()}"`
		});

		for (const record of records) {
			await pb.collection(QUEUE_COLLECTION).delete(record.id);
		}

		return records.length;
	}

	async retryFailed(jobId: string): Promise<void> {
		const pb = await this.getPocketBase();
		await pb.collection(QUEUE_COLLECTION).update(jobId, {
			status: 'queued',
			attempts: 0,
			lastError: null
		});
	}

	async retryAllFailed(projectId?: string): Promise<number> {
		const pb = await this.getPocketBase();
		const filter = projectId
			? `status = "failed" && projectId = "${projectId}"`
			: `status = "failed"`;

		const records = await pb.collection(QUEUE_COLLECTION).getFullList({
			filter
		});

		for (const record of records) {
			await this.retryFailed(record.id);
		}

		return records.length;
	}

	async cancelQueuedJobs(projectId: string, batchIds?: string[]): Promise<number> {
		const pb = await this.getPocketBase();

		// Only cancel queued jobs, not processing ones (to avoid orphaned batch statuses)
		const filter = `projectId = "${projectId}" && status = "queued"`;

		console.log('[cancelQueuedJobs] Starting with filter:', filter);

		// Get all matching records
		const records = await pb.collection(QUEUE_COLLECTION).getFullList({
			filter
		});

		console.log('[cancelQueuedJobs] Found', records.length, 'queue jobs to process');

		// Filter in memory if batchIds provided
		const recordsToDelete = batchIds && batchIds.length > 0
			? records.filter(record => {
				const batchId = record.data?.batchId;
				return batchId && batchIds.includes(batchId);
			})
			: records;

		console.log('[cancelQueuedJobs] Will delete', recordsToDelete.length, 'queue jobs');

		// Delete records in parallel batches to improve performance
		const deletePromises = recordsToDelete.map(record =>
			pb.collection(QUEUE_COLLECTION).delete(record.id).catch(err => {
				// If already deleted, ignore the error
				if (err.status !== 404) {
					console.error(`Failed to delete queue job ${record.id}:`, err);
				}
			})
		);

		await Promise.all(deletePromises);

		console.log('[cancelQueuedJobs] Successfully deleted', recordsToDelete.length, 'queue jobs');

		return recordsToDelete.length;
	}

	private mapRecordToJob(record: any): QueueJob {
		return {
			id: record.id,
			type: record.type,
			status: record.status,
			data: record.data,
			priority: record.priority,
			attempts: record.attempts,
			maxAttempts: record.maxAttempts,
			lastError: record.lastError,
			createdAt: record.created,
			startedAt: record.startedAt,
			completedAt: record.completedAt,
			projectId: record.projectId
		};
	}
}
