export interface ExtractionFeatureFlags {
	boundingBoxes: boolean;
	confidenceScores: boolean;
	multiRowExtraction: boolean;
	toonOutput: boolean;
}

export const DEFAULT_FEATURE_FLAGS: ExtractionFeatureFlags = {
	boundingBoxes: true,
	confidenceScores: true,
	multiRowExtraction: false,
	toonOutput: false
};

export function withFeatureFlagDefaults(
	partial?: Partial<ExtractionFeatureFlags>
): ExtractionFeatureFlags {
	return { ...DEFAULT_FEATURE_FLAGS, ...partial };
}

export interface ExtractionResult {
	column_id: string;
	column_name: string;
	value: string | null;
	image_index: number;
	bbox_2d?: [number, number, number, number];
	confidence?: number;
	redone?: boolean;
	row_index?: number;
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

export interface ExtractionResultInput {
	column_id: string;
	column_name: string;
	value: string | null;
	image_index?: number;
	bbox_2d?: [number, number, number, number] | null;
	confidence?: number | null;
	row_index?: number;
	redone?: boolean;
}

export function createExtractionResult(
	input: ExtractionResultInput,
	featureFlags: ExtractionFeatureFlags
): ExtractionResult {
	const result: ExtractionResult = {
		// Ensure column_id is always a string for consistency across JSON/TOON parsing
		column_id: String(input.column_id),
		column_name: input.column_name,
		value: input.value,
		image_index: input.image_index ?? 0
	};

	if (featureFlags.boundingBoxes && input.bbox_2d !== undefined) {
		result.bbox_2d = input.bbox_2d ?? undefined;
	}

	if (featureFlags.confidenceScores && input.confidence !== undefined) {
		result.confidence = input.confidence ?? undefined;
	}

	if (featureFlags.multiRowExtraction && input.row_index !== undefined) {
		result.row_index = input.row_index;
	}

	if (input.redone !== undefined) {
		result.redone = input.redone;
	}

	return result;
}
