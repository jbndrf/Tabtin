// Queue job types and interfaces

export type JobType = 'process_batch' | 'reprocess_batch' | 'process_redo';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying';

export interface QueueJob {
	id: string;
	type: JobType;
	status: JobStatus;
	data: ProcessBatchJobData | ReprocessBatchJobData | ProcessRedoJobData;
	priority: number; // Lower number = higher priority
	attempts: number;
	maxAttempts: number;
	lastError?: string;
	createdAt: string;
	queuedAt?: string;
	startedAt?: string;
	completedAt?: string;
	projectId: string;
}

export interface ProcessBatchJobData {
	batchId: string;
	projectId: string;
}

export interface ReprocessBatchJobData {
	batchIds: string[];
	projectId: string;
}

export interface ProcessRedoJobData {
	batchId: string;
	projectId: string;
	rowIndex: number; // Which row to redo (0-based index)
	redoColumnIds: string[];
	croppedImageIds: Record<string, string>;
	sourceImageIds?: Record<string, string>; // Maps column IDs to source image IDs
}

export interface QueueStats {
	queued: number;
	processing: number;
	completed: number;
	failed: number;
	totalJobs: number;
}

export interface WorkerConfig {
	maxConcurrency: number;
	requestsPerMinute: number;
	retryDelayMs: number;
	maxRetries: number;
}
