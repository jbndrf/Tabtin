import type { ExtractionFeatureFlags, ColumnDefinition } from './types/extraction';

export type CoordinateFormat = 'pixels' | 'normalized_1000' | 'normalized_1000_yxyx' | 'normalized_1024_yxyx' | 'normalized_1' | 'yolo';

export interface PromptPreset {
	id: string;
	name: string;
	coordinateFormat: CoordinateFormat;
	coordinateDescription: string;
	bboxOrder: string;
}

export interface PromptBuilderConfig {
	columns: ColumnDefinition[];
	featureFlags: ExtractionFeatureFlags;
	coordinateFormat?: CoordinateFormat;
	bboxOrder?: string;
}

// Core extraction instructions (always included)
const CORE_INSTRUCTIONS = `You are an AI assistant specialized in extracting structured data from images.

Instructions:
- Carefully analyze all visible text, labels, and visual elements in the image
- Extract data for each field according to its specific description and requirements
- Follow any format specifications, regex patterns, or allowed values exactly as defined
- If a value is not visible or cannot be determined, use null
- Pay attention to units, separators, and formatting requirements in field descriptions
- If the image contains text in multiple languages, extract from all languages as specified in field descriptions

Return only valid JSON in the exact format specified. Do not include explanations, notes, markdown formatting, or any additional text outside the JSON response.`;

// Bounding box instructions for JSON format
const BBOX_INSTRUCTIONS_JSON = (bboxOrder: string) => `

Bounding Box Instructions:
- bbox_2d coordinates should be normalized to 0-1000 range ${bboxOrder}
- If a field's information is NOT present, set bbox_2d to [0, 0, 0, 0]`;

// Bounding box instructions for TOON format (flattened coordinates)
const BBOX_INSTRUCTIONS_TOON = (coordFields: string[]) => `

Bounding Box Instructions:
- Coordinates should be normalized to 0-1000 range
- Output coordinates as separate fields: ${coordFields.join(', ')}
- If a field's information is NOT present, set all coordinates to 0`;

/**
 * Parse bboxOrder string to extract coordinate field names
 * e.g., "[x1, y1, x2, y2]" -> ["x1", "y1", "x2", "y2"]
 */
function parseBboxOrderToFields(bboxOrder: string): string[] {
	return bboxOrder
		.replace(/[\[\]]/g, '')
		.split(',')
		.map(s => s.trim());
}

// Confidence score instructions (conditionally included)
const CONFIDENCE_INSTRUCTIONS = `

Confidence Score Instructions:
- Provide a confidence score (0.0 to 1.0) indicating extraction certainty
- Use 0.9+ for clearly visible, unambiguous text
- Use 0.5-0.9 for partially visible or ambiguous text
- Use 0.0-0.5 for guessed or unclear values
- If a field's information is NOT present, set confidence to 0.0`;

// Multi-row instructions (conditionally included)
const MULTI_ROW_INSTRUCTIONS = `

MULTI-ROW EXTRACTION - EXHAUSTIVE:
CRITICAL: You MUST extract EVERY SINGLE matching item visible across ALL pages. Do NOT stop early.

Exhaustive extraction rules:
- Scan EVERY page in the document from start to finish
- Extract ALL items that match the schema from EVERY page
- Continue until you have captured the LAST item on the LAST page
- Do NOT stop after processing the first page or first few items
- If there are multiple pages, ensure EACH page is fully processed

Row indexing:
- Each distinct item should be extracted as a SEPARATE ROW
- Add a "row_index" field (starting from 0) to group fields belonging to the same item
- If the document contains only ONE item, still use row_index: 0
- Do NOT treat multilingual text as separate rows - different language versions of the same content belong to the SAME row

INCOMPLETE EXTRACTION IS UNACCEPTABLE. Verify every page has been processed.`;

// Image index instructions (always included since image_index is in output format)
const IMAGE_INDEX_INSTRUCTIONS = `

IMAGE INDEX:
- image_index indicates which image (0-based) the data was extracted from
- Single image: use image_index: 0 for all extractions
- Multiple images: use the index of the image where the data appears
- Example: Data from first image = 0, data from second image = 1`;

// TOON format instructions (conditionally included)
const TOON_INSTRUCTIONS = `

OUTPUT FORMAT: TOON (Token-Oriented Object Notation) with TAB delimiter
You MUST output in TOON format, NOT JSON. TOON is a compact tabular format:
- Header declares array length and fields: arrayName[COUNT]{field1,field2,...}:
- Each row uses 2-space indentation with TAB-separated values (use actual tab character, not spaces)
- null values are written as null
- CRITICAL: Use TAB character (\\t) between values, NOT commas - this avoids issues with numbers like 97.502,48`;

function generateFieldsSection(columns: ColumnDefinition[]): string {
	return columns.map((col, index) => {
		let field = `Field ${index + 1}:\n`;
		field += `  ID: "${col.id}"\n`;
		field += `  Name: "${col.name}"\n`;
		field += `  Type: ${col.type}`;
		if (col.description) field += `\n  Description: ${col.description}`;
		if (col.allowedValues) field += `\n  Allowed values: ${col.allowedValues}`;
		if (col.regex) field += `\n  Validation pattern: ${col.regex}`;
		return field;
	}).join('\n\n');
}

function generateOutputFormatSection(
	columns: ColumnDefinition[],
	featureFlags: ExtractionFeatureFlags,
	bboxOrder: string
): string {
	// Use TOON format if enabled
	if (featureFlags.toonOutput) {
		return generateToonOutputFormatSection(columns, featureFlags, bboxOrder);
	}

	// Helper to build a single JSON example object
	const buildJsonExample = (col: ColumnDefinition, rowIndex: number, imageIndex: number, isLast: boolean): string => {
		let example = '    {\n';

		if (featureFlags.multiRowExtraction) {
			example += `      "row_index": ${rowIndex},\n`;
		}

		example += `      "column_id": "${col.id}",\n`;
		example += `      "column_name": "${col.name}",\n`;
		example += '      "value": "extracted value here",\n';
		example += `      "image_index": ${imageIndex}`;

		if (featureFlags.boundingBoxes) {
			example += `,\n      "bbox_2d": ${bboxOrder}`;
		}

		if (featureFlags.confidenceScores) {
			example += ',\n      "confidence": 0.95';
		}

		example += '\n    }' + (isLast ? '' : ',');
		return example;
	};

	// Default JSON format
	let format = `Return ONLY valid JSON in this exact structure. CRITICAL: Use the EXACT column_id and column_name values from the FIELDS section above.

{
  "extractions": [
`;

	if (featureFlags.multiRowExtraction) {
		// Show 2 rows with first 2 columns each to demonstrate row_index incrementing
		const columnsToShow = columns.slice(0, Math.min(2, columns.length));
		const examples: string[] = [];
		// Row 0 (from image 0)
		for (let colIdx = 0; colIdx < columnsToShow.length; colIdx++) {
			examples.push(buildJsonExample(columnsToShow[colIdx], 0, 0, false));
		}
		// Row 1 (from image 1, to also show image_index varying)
		for (let colIdx = 0; colIdx < columnsToShow.length; colIdx++) {
			const isLast = colIdx === columnsToShow.length - 1;
			examples.push(buildJsonExample(columnsToShow[colIdx], 1, 1, isLast));
		}
		format += examples.join('\n');
	} else {
		// Single row: show all columns
		format += columns.map((col, index) => {
			const isLast = index === columns.length - 1;
			return buildJsonExample(col, 0, 0, isLast);
		}).join('\n');
	}

	format += '\n  ]\n}';

	if (featureFlags.multiRowExtraction) {
		format += `

Note: row_index groups fields belonging to the same item (0 for first item, 1 for second, etc.)`;
	}

	return format;
}

function generateToonOutputFormatSection(
	columns: ColumnDefinition[],
	featureFlags: ExtractionFeatureFlags,
	bboxOrder: string
): string {
	// Build field list for TOON header
	const fieldList: string[] = [];

	if (featureFlags.multiRowExtraction) {
		fieldList.push('row_index');
	}

	fieldList.push('column_id', 'column_name', 'value', 'image_index');

	// For TOON, flatten bbox into separate coordinate fields
	const coordFields = featureFlags.boundingBoxes ? parseBboxOrderToFields(bboxOrder) : [];
	if (featureFlags.boundingBoxes) {
		fieldList.push(...coordFields);
	}

	if (featureFlags.confidenceScores) {
		fieldList.push('confidence');
	}

	// Helper to build a single sample row
	const buildSampleRow = (col: ColumnDefinition, colIndex: number, rowIndex: number, imageIndex: number): string => {
		const values: string[] = [];

		if (featureFlags.multiRowExtraction) {
			values.push(String(rowIndex));
		}

		values.push(col.id);
		values.push(col.name);
		// Show example value - with tabs, commas in values are safe
		values.push(colIndex === 0 && rowIndex === 0 ? '1.234,56' : `sample_value_${colIndex + 1}`);
		values.push(String(imageIndex));

		if (featureFlags.boundingBoxes) {
			const coordFields = parseBboxOrderToFields(bboxOrder);
			values.push(...coordFields.map(f => `<${f}>`));
		}

		if (featureFlags.confidenceScores) {
			values.push('0.95');
		}

		return '  ' + values.join('\t');
	};

	// Build sample rows
	let sampleRows: string[];
	let extractionCount: number;

	if (featureFlags.multiRowExtraction) {
		// Show 2 rows with first 2 columns each to demonstrate row_index incrementing
		const columnsToShow = columns.slice(0, Math.min(2, columns.length));
		sampleRows = [];
		// Row 0 (from image 0)
		for (let colIdx = 0; colIdx < columnsToShow.length; colIdx++) {
			sampleRows.push(buildSampleRow(columnsToShow[colIdx], colIdx, 0, 0));
		}
		// Row 1 (from image 1, to also show image_index varying)
		for (let colIdx = 0; colIdx < columnsToShow.length; colIdx++) {
			sampleRows.push(buildSampleRow(columnsToShow[colIdx], colIdx, 1, 1));
		}
		extractionCount = sampleRows.length;
	} else {
		// Single row: show all columns
		sampleRows = columns.map((col, index) => buildSampleRow(col, index, 0, 0));
		extractionCount = columns.length;
	}

	const header = `extractions[${extractionCount}]{${fieldList.join(',')}}:`;
	const toonExample = header + '\n' + sampleRows.join('\n');

	let format = `Return ONLY valid TOON (NOT JSON). CRITICAL: Use the EXACT column_id and column_name values from the FIELDS section above.

TOON Example with ${extractionCount} extraction(s):
\`\`\`
${toonExample}
\`\`\`

Important TOON rules:
- The [${extractionCount}] declares the array length - adjust based on actual extraction count
- Each indented line is one extraction (2 spaces indent, TAB-separated values)
- Values are in field order as declared in the header
- Use TAB character between values (numbers like 97.502,48 are safe with tabs)
- Use null for missing values`;

	if (featureFlags.multiRowExtraction) {
		format += `
- row_index groups fields belonging to the same item (0 for first item, 1 for second, etc.)`;
	}

	return format;
}

function generateImportantNotes(featureFlags: ExtractionFeatureFlags, isToon: boolean = false): string {
	let notes = '\n\nImportant:';

	if (featureFlags.boundingBoxes) {
		if (isToon) {
			notes += '\n- If a field\'s information is NOT present, set all coordinate fields to 0';
		} else {
			notes += '\n- If a field\'s information is NOT present, set bbox_2d to [0, 0, 0, 0]';
		}
	}

	if (featureFlags.confidenceScores) {
		notes += '\n- If a field\'s information is NOT present, set confidence to 0.0';
	}

	notes += '\n- If a field\'s value is not visible, set value to null';

	if (isToon) {
		notes += '\n- Do not include any explanations, notes, or text outside the TOON structure';
	} else {
		notes += '\n- Do not include any explanations, notes, or text outside the JSON structure';
	}

	return notes;
}

/**
 * Build a complete prompt based on feature flags and columns
 */
export function buildModularPrompt(config: PromptBuilderConfig): string {
	const { columns, featureFlags, bboxOrder = '[x1, y1, x2, y2]' } = config;

	let prompt = CORE_INSTRUCTIONS;

	// Conditionally add feature-specific instructions
	if (featureFlags.boundingBoxes) {
		if (featureFlags.toonOutput) {
			// TOON uses flattened coordinate fields
			const coordFields = parseBboxOrderToFields(bboxOrder);
			prompt += BBOX_INSTRUCTIONS_TOON(coordFields);
		} else {
			// JSON uses bbox_2d array
			prompt += BBOX_INSTRUCTIONS_JSON(bboxOrder);
		}
	}

	if (featureFlags.confidenceScores) {
		prompt += CONFIDENCE_INSTRUCTIONS;
	}

	if (featureFlags.multiRowExtraction) {
		prompt += MULTI_ROW_INSTRUCTIONS;
	}

	// Always include image_index instructions since it's in the output format
	prompt += IMAGE_INDEX_INSTRUCTIONS;

	if (featureFlags.toonOutput) {
		prompt += TOON_INSTRUCTIONS;
	}

	// Add fields section
	prompt += '\n\n--- FIELDS TO EXTRACT ---\n\n';
	prompt += generateFieldsSection(columns);

	// Add expected output format
	prompt += '\n\n--- EXPECTED OUTPUT FORMAT ---\n\n';
	prompt += generateOutputFormatSection(columns, featureFlags, bboxOrder);

	// Add final important notes
	prompt += generateImportantNotes(featureFlags, featureFlags.toonOutput);

	return prompt;
}

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

export function getPresetById(id: string): PromptPreset | null {
	return PROMPT_PRESETS[id] || null;
}

export function getAllPresets(): PromptPreset[] {
	return Object.values(PROMPT_PRESETS);
}
