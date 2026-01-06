import { pb } from '$lib/stores/auth';

let processingProjectIds = $state<string[]>([]);
let unsubscribe: (() => void) | null = null;
let initialized = $state(false);

async function fetchProjectsWithActiveBatches(): Promise<string[]> {
	try {
		const result = await pb.collection('image_batches').getList(1, 500, {
			filter: 'status = "pending" || status = "processing"',
			fields: 'project'
		});
		const projectIds = [...new Set(result.items.map((b) => b.project).filter(Boolean))];
		return projectIds;
	} catch (err) {
		console.error('Failed to fetch active batches:', err);
		return [];
	}
}

export const processingStatusStore = {
	get processingProjectIds() {
		return processingProjectIds;
	},

	get initialized() {
		return initialized;
	},

	isProcessing(projectId: string): boolean {
		return processingProjectIds.includes(projectId);
	},

	async init() {
		if (initialized) return;

		// Initial fetch
		processingProjectIds = await fetchProjectsWithActiveBatches();
		initialized = true;

		// Subscribe to realtime updates on image_batches
		try {
			unsubscribe = await pb.collection('image_batches').subscribe('*', async (e) => {
				// On any batch change, refresh the list
				if (e.action === 'create' || e.action === 'update' || e.action === 'delete') {
					processingProjectIds = await fetchProjectsWithActiveBatches();
				}
			});
		} catch (err) {
			console.error('Failed to subscribe to image_batches:', err);
		}
	},

	cleanup() {
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
		processingProjectIds = [];
		initialized = false;
	}
};
