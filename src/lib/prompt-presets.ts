export type CoordinateFormat = 'pixels' | 'normalized_1000' | 'normalized_1000_yxyx' | 'normalized_1024_yxyx' | 'normalized_1' | 'yolo';

export interface PromptPreset {
	id: string;
	name: string;
	coordinateFormat: CoordinateFormat;
	coordinateDescription: string;
	bboxOrder: string; // e.g., "[x1, y1, x2, y2]" or "[y_min, x_min, y_max, x_max]"
}

// Base template - used for single-row extraction
const BASE_TEMPLATE = `You are an AI assistant specialized in extracting structured data from images.

Instructions:
- Carefully analyze all visible text, labels, and visual elements in the image
- Extract data for each field according to its specific description and requirements
- Follow any format specifications, regex patterns, or allowed values exactly as defined
- If a value is not visible or cannot be determined, use null
- Pay attention to units, separators, and formatting requirements in field descriptions
- If the image contains text in multiple languages, extract from all languages as specified in field descriptions

Return only valid JSON in the exact format specified. Do not include explanations, notes, markdown formatting, or any additional text outside the JSON response.

--- FIELDS TO EXTRACT ---

{{FIELDS}}

--- EXPECTED OUTPUT FORMAT ---

Return ONLY valid JSON in this exact structure. CRITICAL: Use the EXACT column_id and column_name values from the FIELDS section above.

{
  "extractions": [
{{FIELD_EXAMPLES}}
  ]
}

Important:
- bbox_2d coordinates should be normalized to 0-1000 range {{BBOX_FORMAT}}
- If a field's information is NOT present, set value to null, bbox_2d to [0, 0, 0, 0], and confidence to 0.0
- Do not include any explanations, notes, or text outside the JSON structure`;

// Multi-row addon - appended when multiRowExtraction is enabled
export const MULTI_ROW_ADDON = `

--- MULTI-ROW EXTRACTION ---

CRITICAL: This document may contain MULTIPLE ITEMS/TRANSACTIONS/ENTRIES (e.g., bank statement with multiple transactions, receipt with multiple line items, invoice with multiple products).

Multi-row instructions:
- Each distinct item/transaction/entry should be extracted as a SEPARATE ROW
- Add a "row_index" field (starting from 0) to group fields belonging to the same item
- If the document contains only ONE item, still use row_index: 0
- Do NOT treat multilingual text as separate rows - different language versions of the same content belong to the SAME row

Example for document with 3 items:
{
  "extractions": [
    { "row_index": 0, "column_id": "1", "column_name": "Field", "value": "Item 1 value", ... },
    { "row_index": 1, "column_id": "1", "column_name": "Field", "value": "Item 2 value", ... },
    { "row_index": 2, "column_id": "1", "column_name": "Field", "value": "Item 3 value", ... }
  ]
}`;

export const PROMPT_PRESETS: Record<string, PromptPreset> = {
	qwen3vl: {
		id: 'qwen3vl',
		name: 'Qwen3 VL',
		coordinateFormat: 'normalized_1000',
		coordinateDescription: 'Normalized 0-1000 [x1, y1, x2, y2]',
		bboxOrder: '[x1, y1, x2, y2]'
	},
	gemini2: {
		id: 'gemini2',
		name: 'Gemini 2.0',
		coordinateFormat: 'normalized_1000_yxyx',
		coordinateDescription: 'Normalized 0-1000 [y_min, x_min, y_max, x_max]',
		bboxOrder: '[y_min, x_min, y_max, x_max]'
	}
};

export const DEFAULT_PROMPT_TEMPLATE = BASE_TEMPLATE;

export function getPresetById(id: string): PromptPreset | null {
	return PROMPT_PRESETS[id] || null;
}

export function getAllPresets(): PromptPreset[] {
	return Object.values(PROMPT_PRESETS);
}

export function buildPromptTemplate(multiRowEnabled: boolean): string {
	if (multiRowEnabled) {
		return BASE_TEMPLATE + MULTI_ROW_ADDON;
	}
	return BASE_TEMPLATE;
}
