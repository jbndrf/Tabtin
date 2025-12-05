import type PocketBase from 'pocketbase';
import type { ExtractionRow } from '$lib/types/extraction';
import type { ExtractionRowsResponse } from '$lib/pocketbase-types';

/**
 * Load extraction rows for a batch from the database
 */
export async function loadExtractionRows(
	pb: PocketBase,
	batchId: string
): Promise<ExtractionRow[]> {
	try {
		const rows = await pb.collection('extraction_rows').getFullList<ExtractionRowsResponse>({
			filter: `batch = "${batchId}"`,
			sort: '+row_index'
		});

		return rows.map((r) => ({
			id: r.id,
			rowIndex: r.row_index,
			data: (r.row_data as any) || [],
			status: r.status as ExtractionRow['status']
		}));
	} catch (error) {
		console.error('Failed to load extraction rows:', error);
		return [];
	}
}
