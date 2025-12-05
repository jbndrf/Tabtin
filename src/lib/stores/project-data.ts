import { writable, derived, get } from 'svelte/store';
import { pb } from './auth';
import type { ProjectsResponse, ImageBatchesResponse, ImagesResponse } from '$lib/pocketbase-types';

export interface ExtractionResult {
	column_id: string;
	column_name: string;
	value: string | null;
	image_index: number;
	bbox_2d: [number, number, number, number];
	confidence: number;
}

export interface BatchWithData extends ImageBatchesResponse {
	images?: ImagesResponse[];
	processed_data: { extractions: ExtractionResult[] } | null;
}

export interface ProjectStats {
	pending: number;
	processing: number;
	review: number;
	approved: number;
	failed: number;
}

interface ProjectCache {
	project: ProjectsResponse | null;
	batches: BatchWithData[];
	stats: ProjectStats;
	isLoading: boolean;
	lastFetched: number;
	currentProjectId: string | null;
}

const CACHE_TTL = 30000; // 30 seconds - after this, data can be refetched

// Create the main store
function createProjectDataStore() {
	const { subscribe, set, update } = writable<ProjectCache>({
		project: null,
		batches: [],
		stats: { pending: 0, processing: 0, review: 0, approved: 0, failed: 0 },
		isLoading: false,
		lastFetched: 0,
		currentProjectId: null
	});

	let unsubscribeBatches: (() => void) | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let isLoadingBatches = false; // Guard against concurrent loads

	async function loadProject(projectId: string, userId: string, force = false) {
		const currentState = get({ subscribe });
		const now = Date.now();

		// If same project and not forced and cache is fresh, skip reload
		if (
			!force &&
			currentState.currentProjectId === projectId &&
			currentState.project &&
			now - currentState.lastFetched < CACHE_TTL
		) {
			return;
		}

		// If switching projects, clean up old subscriptions
		if (currentState.currentProjectId !== projectId) {
			cleanup();
		}

		update((state) => ({ ...state, isLoading: true, currentProjectId: projectId }));

		try {
			// Load project data and batches in parallel
			const [project] = await Promise.all([
				pb.collection('projects').getOne<ProjectsResponse>(projectId, {
					filter: `user = '${userId}'`
				}),
				loadBatchesAndStats(projectId)
			]);

			update((state) => ({
				...state,
				project,
				isLoading: false,
				lastFetched: now
			}));

			// Setup realtime subscription for batches
			await setupRealtimeSubscription(projectId);

			// Setup polling for processing updates (every 3 seconds)
			setupPolling(projectId);
		} catch (error) {
			console.error('Failed to load project:', error);
			update((state) => ({ ...state, isLoading: false }));
			throw error;
		}
	}

	async function loadBatchesAndStats(projectId: string) {
		// Guard against concurrent loads
		if (isLoadingBatches) {
			return;
		}
		isLoadingBatches = true;

		try {
			// Load statistics and batches in parallel with unique request keys to prevent auto-cancellation
			const [pendingCount, processingCount, reviewCount, approvedCount, failedCount, batchList] =
				await Promise.all([
					pb
						.collection('image_batches')
						.getList(1, 1, {
							filter: `project = '${projectId}' && status = "pending"`,
							requestKey: `stats_pending_${projectId}`
						})
						.then((r) => r.totalItems),
					pb
						.collection('image_batches')
						.getList(1, 1, {
							filter: `project = '${projectId}' && status = "processing"`,
							requestKey: `stats_processing_${projectId}`
						})
						.then((r) => r.totalItems),
					pb
						.collection('image_batches')
						.getList(1, 1, {
							filter: `project = '${projectId}' && status = "review"`,
							requestKey: `stats_review_${projectId}`
						})
						.then((r) => r.totalItems),
					pb
						.collection('image_batches')
						.getList(1, 1, {
							filter: `project = '${projectId}' && status = "approved"`,
							requestKey: `stats_approved_${projectId}`
						})
						.then((r) => r.totalItems),
					pb
						.collection('image_batches')
						.getList(1, 1, {
							filter: `project = '${projectId}' && status = "failed"`,
							requestKey: `stats_failed_${projectId}`
						})
						.then((r) => r.totalItems),
					// Load only the most recent 25 batches
					pb.collection('image_batches').getList<ImageBatchesResponse>(1, 25, {
						filter: `project = '${projectId}'`,
						sort: '-id',
						requestKey: `batches_list_${projectId}`
					})
				]);

			// Load images for each batch
			const batchesWithImages: BatchWithData[] = await Promise.all(
				batchList.items.map(async (batch) => {
					const images = await pb.collection('images').getFullList<ImagesResponse>({
						filter: `batch = '${batch.id}'`,
						sort: 'order',
						requestKey: `images_${batch.id}`
					});
					return { ...batch, images } as BatchWithData;
				})
			);

			console.log('[ProjectData] Loaded', batchesWithImages.length, 'batches with stats:', {
				pending: pendingCount,
				processing: processingCount,
				review: reviewCount,
				approved: approvedCount,
				failed: failedCount
			});

			update((state) => ({
				...state,
				batches: batchesWithImages,
				stats: {
					pending: pendingCount,
					processing: processingCount,
					review: reviewCount,
					approved: approvedCount,
					failed: failedCount
				}
			}));
		} catch (error) {
			console.error('Failed to load batches and stats:', error);
		} finally {
			isLoadingBatches = false;
		}
	}

	async function setupRealtimeSubscription(projectId: string) {
		// Subscribe to batch changes for this specific project
		unsubscribeBatches = await pb.collection('image_batches').subscribe('*', async (e) => {
			// Check if this batch belongs to the current project
			// Note: project field can be either a string or an array depending on the record
			const batchProject = Array.isArray(e.record?.project) ? e.record.project[0] : e.record?.project;

			if (batchProject !== projectId) return;

			// Reload batches and stats when any batch changes
			await loadBatchesAndStats(projectId);
		});
	}

	function setupPolling(projectId: string) {
		// Poll every 3 seconds for processing updates
		pollInterval = setInterval(() => {
			const currentState = get({ subscribe });
			// Only poll if we have processing or pending items
			if (currentState.stats.processing > 0 || currentState.stats.pending > 0) {
				loadBatchesAndStats(projectId);
			}
		}, 3000);
	}

	function cleanup() {
		if (unsubscribeBatches) {
			unsubscribeBatches();
			unsubscribeBatches = null;
		}
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	async function invalidate() {
		const currentState = get({ subscribe });
		if (currentState.currentProjectId) {
			await loadBatchesAndStats(currentState.currentProjectId);
		}
	}

	async function refreshProject(userId: string) {
		const currentState = get({ subscribe });
		if (currentState.currentProjectId) {
			await loadProject(currentState.currentProjectId, userId, true);
		}
	}

	return {
		subscribe,
		loadProject,
		invalidate,
		refreshProject,
		cleanup
	};
}

export const projectData = createProjectDataStore();

// Derived stores for easy access
export const currentProject = derived(projectData, ($data) => $data.project);
export const projectBatches = derived(projectData, ($data) => $data.batches);
export const projectStats = derived(projectData, ($data) => $data.stats);
export const isProjectLoading = derived(projectData, ($data) => $data.isLoading);
