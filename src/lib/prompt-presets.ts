export type CoordinateFormat = 'pixels' | 'normalized_1000' | 'normalized_1000_yxyx' | 'normalized_1024_yxyx' | 'normalized_1' | 'yolo';

export interface PromptPreset {
	id: string;
	name: string;
	coordinateFormat: CoordinateFormat;
	coordinateDescription: string;
	template: string;
}

export const PROMPT_PRESETS: Record<string, PromptPreset> = {
	qwen3vl: {
		id: 'qwen3vl',
		name: 'Qwen3 VL',
		coordinateFormat: 'normalized_1000',
		coordinateDescription: 'Normalized 0-1000 [x1, y1, x2, y2]',
		template: `You are an AI assistant specialized in extracting structured data from documents that may contain MULTIPLE ITEMS/TRANSACTIONS/ENTRIES.

Instructions:
- Carefully analyze all visible text, labels, and visual elements in the image
- Extract data for each field according to its specific description and requirements
- Follow any format specifications, regex patterns, or allowed values exactly as defined
- If a value is not visible or cannot be determined, use null
- Pay attention to units, separators, and formatting requirements in field descriptions

Return only valid JSON in the exact format specified. Do not include explanations, notes, markdown formatting, or any additional text outside the JSON response.

--- FIELDS TO EXTRACT ---

CRITICAL MULTI-ROW INSTRUCTIONS:
- This document may contain MULTIPLE ITEMS/TRANSACTIONS/ENTRIES (e.g., bank statement with multiple transactions, receipt with multiple line items)
- Each item should be extracted as a SEPARATE ROW
- Add a "row_index" field (starting from 0) to group fields belonging to the same item
- If the document contains only ONE item, still use row_index: 0

For each field extraction, provide:
- row_index: Which row/item this extraction belongs to (0-based)
- The extracted value (text from OCR or visual analysis)
- Image index (0-based) indicating which image contains the information
- Bounding box [x1, y1, x2, y2] in normalized 0-1000 range
- Confidence score (0.0 to 1.0)

{{FIELDS}}

--- EXPECTED OUTPUT FORMAT ---

Return ONLY valid JSON in this exact structure:

{
  "extractions": [
    { "row_index": 0, "column_id": "field1", "column_name": "Field 1", "value": "...", "image_index": 0, "bbox_2d": [x1, y1, x2, y2], "confidence": 0.95 },
    { "row_index": 0, "column_id": "field2", "column_name": "Field 2", "value": "...", "image_index": 0, "bbox_2d": [x1, y1, x2, y2], "confidence": 0.90 },
    { "row_index": 1, "column_id": "field1", "column_name": "Field 1", "value": "...", "image_index": 0, "bbox_2d": [x1, y1, x2, y2], "confidence": 0.92 },
    { "row_index": 1, "column_id": "field2", "column_name": "Field 2", "value": "...", "image_index": 0, "bbox_2d": [x1, y1, x2, y2], "confidence": 0.88 }
  ]
}

Example for bank statement with 3 transactions:
{
  "extractions": [
    { "row_index": 0, "column_id": "date", "value": "2024-01-15", "image_index": 0, "bbox_2d": [100, 200, 250, 220], "confidence": 0.95 },
    { "row_index": 0, "column_id": "amount", "value": "150.00", "image_index": 0, "bbox_2d": [600, 200, 700, 220], "confidence": 0.98 },
    { "row_index": 1, "column_id": "date", "value": "2024-01-16", "image_index": 0, "bbox_2d": [100, 240, 250, 260], "confidence": 0.93 },
    { "row_index": 1, "column_id": "amount", "value": "75.50", "image_index": 0, "bbox_2d": [600, 240, 700, 260], "confidence": 0.96 },
    { "row_index": 2, "column_id": "date", "value": "2024-01-17", "image_index": 0, "bbox_2d": [100, 280, 250, 300], "confidence": 0.94 },
    { "row_index": 2, "column_id": "amount", "value": "200.00", "image_index": 0, "bbox_2d": [600, 280, 700, 300], "confidence": 0.97 }
  ]
}

Important:
- EVERY extraction MUST include a "row_index" field
- Group all fields belonging to the same item/transaction/entry with the same row_index
- row_index starts at 0
- bbox_2d coordinates should be normalized to 0-1000 range [x1, y1, x2, y2]
- If a field's information is NOT present for a specific row, set value to null, bbox_2d to [0, 0, 0, 0], and confidence to 0.0
- Do not include any explanations, notes, or text outside the JSON structure`
	},
	gemini2: {
		id: 'gemini2',
		name: 'Gemini 2.0',
		coordinateFormat: 'normalized_1000_yxyx',
		coordinateDescription: 'Normalized 0-1000 [y_min, x_min, y_max, x_max]',
		template: `You are an AI assistant specialized in extracting structured data from documents that may contain MULTIPLE ITEMS/TRANSACTIONS/ENTRIES.

Instructions:
- Carefully analyze all visible text, labels, and visual elements in the image
- Extract data for each field according to its specific description and requirements
- Follow any format specifications, regex patterns, or allowed values exactly as defined
- If a value is not visible or cannot be determined, use null
- Pay attention to units, separators, and formatting requirements in field descriptions

Return only valid JSON in the exact format specified. Do not include explanations, notes, markdown formatting, or any additional text outside the JSON response.

--- FIELDS TO EXTRACT ---

CRITICAL MULTI-ROW INSTRUCTIONS:
- This document may contain MULTIPLE ITEMS/TRANSACTIONS/ENTRIES (e.g., bank statement with multiple transactions, receipt with multiple line items)
- Each item should be extracted as a SEPARATE ROW
- Add a "row_index" field (starting from 0) to group fields belonging to the same item
- If the document contains only ONE item, still use row_index: 0

For each field extraction, provide:
- row_index: Which row/item this extraction belongs to (0-based)
- The extracted value (text from OCR or visual analysis)
- Image index (0-based) indicating which image contains the information
- Bounding box [y_min, x_min, y_max, x_max] in normalized 0-1000 range
- Confidence score (0.0 to 1.0)

{{FIELDS}}

--- EXPECTED OUTPUT FORMAT ---

Return ONLY valid JSON in this exact structure:

{
  "extractions": [
    { "row_index": 0, "column_id": "field1", "column_name": "Field 1", "value": "...", "image_index": 0, "bbox_2d": [y1, x1, y2, x2], "confidence": 0.95 },
    { "row_index": 0, "column_id": "field2", "column_name": "Field 2", "value": "...", "image_index": 0, "bbox_2d": [y1, x1, y2, x2], "confidence": 0.90 },
    { "row_index": 1, "column_id": "field1", "column_name": "Field 1", "value": "...", "image_index": 0, "bbox_2d": [y1, x1, y2, x2], "confidence": 0.92 },
    { "row_index": 1, "column_id": "field2", "column_name": "Field 2", "value": "...", "image_index": 0, "bbox_2d": [y1, x1, y2, x2], "confidence": 0.88 }
  ]
}

Example for bank statement with 3 transactions:
{
  "extractions": [
    { "row_index": 0, "column_id": "date", "value": "2024-01-15", "image_index": 0, "bbox_2d": [200, 100, 220, 250], "confidence": 0.95 },
    { "row_index": 0, "column_id": "amount", "value": "150.00", "image_index": 0, "bbox_2d": [200, 600, 220, 700], "confidence": 0.98 },
    { "row_index": 1, "column_id": "date", "value": "2024-01-16", "image_index": 0, "bbox_2d": [240, 100, 260, 250], "confidence": 0.93 },
    { "row_index": 1, "column_id": "amount", "value": "75.50", "image_index": 0, "bbox_2d": [240, 600, 260, 700], "confidence": 0.96 },
    { "row_index": 2, "column_id": "date", "value": "2024-01-17", "image_index": 0, "bbox_2d": [280, 100, 300, 250], "confidence": 0.94 },
    { "row_index": 2, "column_id": "amount", "value": "200.00", "image_index": 0, "bbox_2d": [280, 600, 300, 700], "confidence": 0.97 }
  ]
}

Important:
- EVERY extraction MUST include a "row_index" field
- Group all fields belonging to the same item/transaction/entry with the same row_index
- row_index starts at 0
- bbox_2d coordinates should be normalized to 0-1000 range [y_min, x_min, y_max, x_max] (Y-first ordering)
- If a field's information is NOT present for a specific row, set value to null, bbox_2d to [0, 0, 0, 0], and confidence to 0.0
- Do not include any explanations, notes, or text outside the JSON structure`
	}
};

export const DEFAULT_PROMPT_TEMPLATE = PROMPT_PRESETS.qwen3vl.template;

export function getPresetById(id: string): PromptPreset | null {
	return PROMPT_PRESETS[id] || null;
}

export function getAllPresets(): PromptPreset[] {
	return Object.values(PROMPT_PRESETS);
}
