import { writable } from 'svelte/store';
import { pb } from '$lib/stores/auth';
import { resizeImageFile } from '$lib/utils/client-image-resize';

export interface UploadingBatch {
	id: string;
	pbBatchId: string | null;
	images: File[];
	totalImages: number;
	resizedCount: number;
	uploadedCount: number;
	status: 'resizing' | 'uploading' | 'enqueued' | 'error';
	error: string | null;
}

// Exported writable store -- consumed by project page table
export const uploadingBatches = writable<Map<string, UploadingBatch>>(new Map());

function updateBatch(id: string, updates: Partial<UploadingBatch>) {
	uploadingBatches.update((map) => {
		const batch = map.get(id);
		if (batch) {
			Object.assign(batch, updates);
			return new Map(map);
		}
		return map;
	});
}

function removeBatch(id: string) {
	uploadingBatches.update((map) => {
		map.delete(id);
		return new Map(map);
	});
}

let nextId = 0;

/**
 * Submit a batch of captured images for background processing.
 * Handles: resize -> create PB record -> upload images -> enqueue.
 */
export async function submitCaptureBatch(
	projectId: string,
	images: File[],
	options: { maxDimension?: number | null; resizeOnUpload?: boolean }
): Promise<void> {
	const batchClientId = `capture-${++nextId}-${Date.now()}`;

	const batch: UploadingBatch = {
		id: batchClientId,
		pbBatchId: null,
		images: [...images],
		totalImages: images.length,
		resizedCount: 0,
		uploadedCount: 0,
		status: 'resizing',
		error: null
	};

	uploadingBatches.update((map) => {
		map.set(batchClientId, batch);
		return new Map(map);
	});

	try {
		// Step 1: Resize images (sequential to avoid memory pressure)
		const shouldResize = options.resizeOnUpload !== false && options.maxDimension;
		const resizedImages: File[] = [];

		for (const img of images) {
			const resized = shouldResize
				? await resizeImageFile(img, options.maxDimension!)
				: img;
			resizedImages.push(resized);
			updateBatch(batchClientId, { resizedCount: resizedImages.length });
		}

		// Step 2: Create PB batch record
		updateBatch(batchClientId, { status: 'uploading' });
		const pbBatch = await pb.collection('image_batches').create({
			project: projectId,
			status: 'pending'
		});
		updateBatch(batchClientId, { pbBatchId: pbBatch.id });

		// Step 3: Upload images (concurrency 2)
		let uploadedCount = 0;
		const CONCURRENCY = 2;

		for (let i = 0; i < resizedImages.length; i += CONCURRENCY) {
			const chunk = resizedImages.slice(i, i + CONCURRENCY);
			await Promise.all(
				chunk.map(async (file, chunkIdx) => {
					const order = i + chunkIdx + 1;
					await pb.collection('images').create(
						{
							batch: pbBatch.id,
							order,
							image: file
						},
						{ $autoCancel: false }
					);
					uploadedCount++;
					updateBatch(batchClientId, { uploadedCount });
				})
			);
		}

		// Step 4: Enqueue for processing
		const enqueueResponse = await fetch('/api/queue/enqueue', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				batchId: pbBatch.id,
				projectId,
				priority: 10
			})
		});

		if (!enqueueResponse.ok) {
			throw new Error('Failed to enqueue batch');
		}

		const result = await enqueueResponse.json();
		if (!result.success) {
			throw new Error(result.error || 'Failed to enqueue batch');
		}

		updateBatch(batchClientId, { status: 'enqueued' });

		// Step 5: Remove from store after a short delay
		setTimeout(() => removeBatch(batchClientId), 2000);
	} catch (err: any) {
		console.error('Capture pipeline error:', err);

		// Retry once
		const currentBatch = getCurrentBatch(batchClientId);
		if (currentBatch && !currentBatch.error) {
			updateBatch(batchClientId, { error: err.message || 'Upload failed', status: 'error' });
		}
	}
}

function getCurrentBatch(id: string): UploadingBatch | undefined {
	let result: UploadingBatch | undefined;
	uploadingBatches.subscribe((map) => {
		result = map.get(id);
	})();
	return result;
}

/**
 * Get the number of in-flight batches (resizing or uploading).
 */
export function getActiveUploadCount(): number {
	let count = 0;
	uploadingBatches.subscribe((map) => {
		for (const batch of map.values()) {
			if (batch.status === 'resizing' || batch.status === 'uploading') {
				count++;
			}
		}
	})();
	return count;
}
