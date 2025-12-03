import type PocketBase from 'pocketbase';
import type { ExtractionRow, ExtractionResult, ColumnDefinition } from '$lib/types/extraction';
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

/**
 * Load extraction rows with fallback to legacy processed_data format
 */
export async function loadExtractionRowsWithFallback(
	pb: PocketBase,
	batchId: string,
	batch: any
): Promise<ExtractionRow[]> {
	// Try new format first
	const rows = await loadExtractionRows(pb, batchId);

	if (rows.length > 0) {
		return rows;
	}

	// Fallback to old format (processed_data)
	if (
		batch?.processed_data &&
		typeof batch.processed_data === 'object' &&
		'extractions' in batch.processed_data
	) {
		console.log('Using legacy processed_data format');
		return [
			{
				id: null,
				rowIndex: 0,
				data: batch.processed_data.extractions as ExtractionResult[],
				status: batch.status || 'review'
			}
		];
	}

	return [];
}

/**
 * Save all extraction rows for a batch (create/update/delete as needed)
 */
export async function saveExtractionRows(
	pb: PocketBase,
	batchId: string,
	projectId: string,
	rows: ExtractionRow[],
	deletedRowIndices: Set<number>
): Promise<void> {
	// Update/create non-deleted rows
	for (const row of rows) {
		if (deletedRowIndices.has(row.rowIndex)) continue;

		if (row.id) {
			// Update existing row
			await pb.collection('extraction_rows').update(row.id, {
				row_data: row.data,
				status: 'approved',
				approved_at: new Date().toISOString()
			});
		} else {
			// Create new row (manually added)
			await pb.collection('extraction_rows').create({
				batch: batchId,
				project: projectId,
				row_index: row.rowIndex,
				row_data: row.data,
				status: 'approved',
				approved_at: new Date().toISOString()
			});
		}
	}

	// Mark deleted rows
	for (const rowIndex of deletedRowIndices) {
		const row = rows.find((r) => r.rowIndex === rowIndex);
		if (row?.id) {
			await pb.collection('extraction_rows').update(row.id, {
				status: 'deleted',
				deleted_at: new Date().toISOString()
			});
		}
	}
}

/**
 * Create an empty row with null values for all columns
 */
export function createEmptyRow(
	rowIndex: number,
	columns: ColumnDefinition[]
): ExtractionRow {
	const emptyData: ExtractionResult[] = columns.map((col) => ({
		column_id: col.id,
		column_name: col.name,
		value: null,
		image_index: 0,
		bbox_2d: [0, 0, 0, 0],
		confidence: 1.0
	}));

	return {
		id: null,
		rowIndex,
		data: emptyData,
		status: 'review'
	};
}

/**
 * Update a specific field value in a row
 */
export function updateRowFieldValue(
	row: ExtractionRow,
	columnId: string,
	value: string | null
): ExtractionRow {
	const updatedData = row.data.map((extraction) => {
		if (extraction.column_id === columnId) {
			return { ...extraction, value };
		}
		return extraction;
	});

	return {
		...row,
		data: updatedData
	};
}

