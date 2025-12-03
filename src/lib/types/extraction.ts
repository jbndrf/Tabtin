export interface ExtractionResult {
	column_id: string;
	column_name: string;
	value: string | null;
	image_index: number;
	bbox_2d: [number, number, number, number];
	confidence: number;
	redone?: boolean;
	row_index?: number; // For multi-row extractions
}

export interface ColumnDefinition {
	id: string;
	name: string;
	type: string;
	description?: string;
	allowedValues?: string;
	regex?: string;
}

export interface ExtractionRow {
	id: string | null; // null for newly added rows not yet saved
	rowIndex: number;
	data: ExtractionResult[];
	status: 'pending' | 'review' | 'approved' | 'deleted';
}

export type CoordinateFormat = 'normalized_1000' | 'normalized_1000_yxyx';
