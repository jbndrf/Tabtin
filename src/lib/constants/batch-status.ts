/**
 * Batch status constants
 * Centralizes magic strings used across queue and batch processing
 */

export const BatchStatus = {
	PENDING: 'pending',
	PROCESSING: 'processing',
	REVIEW: 'review',
	APPROVED: 'approved',
	FAILED: 'failed'
} as const;

export type BatchStatusType = (typeof BatchStatus)[keyof typeof BatchStatus];

/**
 * Queue job status constants
 */
export const QueueStatus = {
	QUEUED: 'queued',
	PROCESSING: 'processing',
	COMPLETED: 'completed',
	FAILED: 'failed'
} as const;

export type QueueStatusType = (typeof QueueStatus)[keyof typeof QueueStatus];
