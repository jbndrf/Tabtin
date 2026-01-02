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

// =============================================================================
// CORE CONTEXT (minimal, always included)
// =============================================================================

const CORE_CONTEXT = `Extract structured data from images into a table.
The user has defined a schema with columns and extraction instructions.
Your output will be DISCARDED if it does not match the required format.`;

// =============================================================================
// DO/DON'T RULES - Always included
// =============================================================================

const RULES_ALWAYS = `
GENERAL RULES:
You are extracting data from real documents. The user will review your extractions, so accuracy is critical. Only extract what you can actually see in the images.

DOS:
- DO extract only data visible in the images
- DO use null for values not present or not visible
- DO follow the user's field descriptions exactly
- DO use column_id and column_name EXACTLY as shown in the schema

DONTS:
- DO NOT invent, guess, or hallucinate data not visible in images
- DO NOT copy example values - extract from actual images only
- DO NOT add explanations, markdown, or text outside the output format
- DO NOT modify, abbreviate, or paraphrase column identifiers`;

// =============================================================================
// DO/DON'T RULES - Feature-specific (conditionally included)
// =============================================================================

const RULES_MULTI_ROW = `
MULTI-ROW MODE:
The user expects multiple items (rows) from this document. Each logical item (e.g., a transaction, a line item, a record) should be grouped using row_index. All fields belonging to the same item share the same row_index.

DOS:
- DO use row_index (0, 1, 2...) to group fields of the same logical item
- DO extract ALL matching items from ALL pages - scan every page completely
- DO follow user field descriptions for what constitutes a "row"
- DO follow user field descriptions for which rows each field appears on

DONTS:
- DO NOT stop early - extract until the last item on the last page
- DO NOT create separate rows for document-level fields (unless user description says to)
- DO NOT skip items - incomplete extraction is unacceptable`;

const RULES_TOON_OUTPUT = `
OUTPUT FORMAT: TOON
The user has chosen TOON format instead of JSON. TOON is a compact tabular format that is easier to parse. The header declares the structure, and each indented line is one extraction with TAB-separated values.

DOS:
- DO output in TOON format with TAB character (\\t) as delimiter
- DO match the field count in header exactly
- DO use 2-space indentation for each row

DONTS:
- DO NOT use JSON, markdown, or any other format
- DO NOT use spaces or commas as value delimiters
- DO NOT add any text outside the TOON structure`;

const RULES_JSON_OUTPUT = `
OUTPUT FORMAT: JSON
The user expects a JSON array of extractions. Each extraction is an object with the required fields.

DOS:
- DO output valid JSON in the exact structure shown
- DO include all required fields for each extraction

DONTS:
- DO NOT add markdown code blocks around the JSON
- DO NOT include explanations or comments`;

const RULES_BOUNDING_BOXES = (bboxOrder: string) => `
BOUNDING BOXES:
Provide coordinates showing WHERE each value appears in the image.

COORDINATE SYSTEM:
- Values normalized to 0-1000 range (0=top/left edge, 1000=bottom/right edge)
- Format: ${bboxOrder}
- For multi-line values, use bbox that covers ALL lines

DOS:
- DO provide bbox for the actual text location
- DO use [0, 0, 0, 0] for fields not present in image

DONTS:
- DO NOT guess coordinates for unclear locations
- DO NOT use pixel values - always use 0-1000 normalized range`;

const RULES_BOUNDING_BOXES_TOON = (coordFields: string[]) => `
BOUNDING BOXES:
Provide coordinates showing WHERE each value appears in the image.

COORDINATE SYSTEM:
- Values normalized to 0-1000 range (0=top/left edge, 1000=bottom/right edge)
- Output coordinates as separate fields: ${coordFields.join(', ')}
- For multi-line values, use bbox that covers ALL lines

DOS:
- DO provide bbox for the actual text location
- DO set all coordinate fields to 0 for fields not present in image

DONTS:
- DO NOT guess coordinates for unclear locations
- DO NOT use pixel values - always use 0-1000 normalized range`;

const RULES_CONFIDENCE = `
CONFIDENCE SCORES:
The user wants to know how certain you are about each extracted value. This helps prioritize which extractions need human review. Low confidence values will be flagged for manual verification.

DOS:
- DO use 0.9+ for clearly visible, unambiguous text
- DO use 0.5-0.9 for partially visible or ambiguous text
- DO use 0.0 for fields not present

DONTS:
- DO NOT assign high confidence to guessed values`;

const RULES_OCR_GUIDANCE = `
OCR TEXT GUIDANCE:
Machine-extracted OCR text is provided as supplementary help. Your visual analysis of the images is the primary source of truth.

INPUT STRUCTURE:
- Each page image is followed by its OCR text (if available)
- OCR text is labeled: [OCR reference - page N]: <text>
- Some pages may have no OCR text
- Documents may be PDFs converted to images

DOS:
- DO rely primarily on what you see in the images
- DO use OCR as a helper for small text, unclear characters, or dense content
- DO trust your visual reading when it conflicts with OCR

DONTS:
- DO NOT copy OCR text without visual verification
- DO NOT trust OCR over your own reading of the image
- DO NOT assume OCR is accurate - it often has recognition errors
- DO NOT trust OCR for layout, structure, or table organization - OCR loses spatial relationships`;

const RULES_IMAGE_INDEX = `
IMAGE INDEX:
You may receive one or multiple images. The image_index tells the system which image each extracted value came from. This is used to display the correct image when reviewing extractions.

DOS:
- DO set image_index to the 0-based index of the image where data was found
- DO use 0 for single image
- DO use 0 for first image, 1 for second, etc. when multiple images`;

const RULES_PER_PAGE = (currentPage: number, totalPages: number) => `
PER-PAGE MODE (page ${currentPage} of ${totalPages}):
This document has ${totalPages} pages. Each page is processed separately. You are looking at page ${currentPage} only.

ROW INDEX HANDLING:
- Always start row_index at 0 for THIS page
- The system will add offsets to create global row indices
- You do NOT need to track previous page row counts

DOS:
- DO extract from THIS PAGE ONLY
- DO use row_index starting from 0
- DO use image_index: 0 for all
- DO return empty extraction if page has no extractable items

DONTS:
- DO NOT re-extract items from previous pages
- DO NOT hallucinate items not visible on this page`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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

// =============================================================================
// USER SCHEMA SECTION
// =============================================================================

function generateUserSchemaSection(columns: ColumnDefinition[]): string {
	let section = `--- USER SCHEMA (ABSOLUTE PRIORITY) ---

The user has defined these columns. Follow the user's descriptions exactly.
The descriptions define what to extract and any special handling rules.

`;

	section += columns.map((col, index) => {
		let field = `Column ${index + 1}:\n`;
		field += `  column_id: "${col.id}"\n`;
		field += `  column_name: "${col.name}"\n`;
		field += `  type: ${col.type}`;
		if (col.description) field += `\n  description: ${col.description}`;
		if (col.allowedValues) {
			field += `\n  allowed_values: ${col.allowedValues}`;
			field += `\n  CONSTRAINT: Value MUST be one of these exactly, or null if not found`;
		}
		if (col.regex) field += `\n  validation_pattern: ${col.regex}`;
		return field;
	}).join('\n\n');

	return section;
}

// =============================================================================
// OUTPUT FORMAT SECTION - Abstract placeholders, no domain examples
// =============================================================================

function generateOutputFormatSection(
	columns: ColumnDefinition[],
	featureFlags: ExtractionFeatureFlags,
	bboxOrder: string
): string {
	if (featureFlags.toonOutput) {
		return generateToonFormatSection(columns, featureFlags, bboxOrder);
	}
	return generateJsonFormatSection(columns, featureFlags, bboxOrder);
}

function generateToonFormatSection(
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

	const coordFields = featureFlags.boundingBoxes ? parseBboxOrderToFields(bboxOrder) : [];
	if (featureFlags.boundingBoxes) {
		fieldList.push(...coordFields);
	}

	if (featureFlags.confidenceScores) {
		fieldList.push('confidence');
	}

	// Build abstract example rows using actual column IDs
	const buildAbstractRow = (col: ColumnDefinition, rowIdx: number, imgIdx: number): string => {
		const values: string[] = [];

		if (featureFlags.multiRowExtraction) {
			values.push(String(rowIdx));
		}

		values.push(col.id);
		values.push(col.name);
		values.push('<extracted_value>');
		values.push(String(imgIdx));

		if (featureFlags.boundingBoxes) {
			values.push(...coordFields.map(f => `<${f}>`));
		}

		if (featureFlags.confidenceScores) {
			values.push('<conf>');
		}

		return '  ' + values.join('\t');
	};

	// Generate example rows
	let sampleRows: string[];
	if (featureFlags.multiRowExtraction && columns.length >= 2) {
		// Show 2 logical rows with first 2 columns each
		const cols = columns.slice(0, 2);
		sampleRows = [
			buildAbstractRow(cols[0], 0, 0),
			buildAbstractRow(cols[1], 0, 0),
			buildAbstractRow(cols[0], 1, 0),
			buildAbstractRow(cols[1], 1, 0)
		];
	} else {
		// Single row with all columns
		sampleRows = columns.map(col => buildAbstractRow(col, 0, 0));
	}

	const exampleCount = sampleRows.length;
	const header = `extractions[${exampleCount}]{${fieldList.join(',')}}:`;

	return `--- OUTPUT FORMAT ---

FORMAT EXAMPLE (structure only - replace placeholders with actual extracted data):
\`\`\`
${header}
${sampleRows.join('\n')}
\`\`\`

Replace:
- <extracted_value> with actual data from images (or null if not present)
- <x1>, <y1>, <x2>, <y2> (or similar coordinate fields) with values 0-1000 (or 0 if not present)
- <conf> with confidence 0.0-1.0
- [${exampleCount}] with your actual extraction count`;
}

function generateJsonFormatSection(
	columns: ColumnDefinition[],
	featureFlags: ExtractionFeatureFlags,
	bboxOrder: string
): string {
	const buildAbstractExample = (col: ColumnDefinition, rowIdx: number, imgIdx: number, isLast: boolean): string => {
		let example = '    {\n';

		if (featureFlags.multiRowExtraction) {
			example += `      "row_index": ${rowIdx},\n`;
		}

		example += `      "column_id": "${col.id}",\n`;
		example += `      "column_name": "${col.name}",\n`;
		example += '      "value": "<extracted_value>",\n';
		example += `      "image_index": ${imgIdx}`;

		if (featureFlags.boundingBoxes) {
			example += `,\n      "bbox_2d": ${bboxOrder}`;
		}

		if (featureFlags.confidenceScores) {
			example += ',\n      "confidence": <conf>';
		}

		example += '\n    }' + (isLast ? '' : ',');
		return example;
	};

	let examples: string[];
	if (featureFlags.multiRowExtraction && columns.length >= 2) {
		const cols = columns.slice(0, 2);
		examples = [
			buildAbstractExample(cols[0], 0, 0, false),
			buildAbstractExample(cols[1], 0, 0, false),
			buildAbstractExample(cols[0], 1, 0, false),
			buildAbstractExample(cols[1], 1, 0, true)
		];
	} else {
		examples = columns.map((col, idx) =>
			buildAbstractExample(col, 0, 0, idx === columns.length - 1)
		);
	}

	return `--- OUTPUT FORMAT ---

FORMAT EXAMPLE (structure only - replace placeholders with actual extracted data):
{
  "extractions": [
${examples.join('\n')}
  ]
}

Replace:
- <extracted_value> with actual data from images (or null if not present)
- x1, y1, x2, y2 (or similar coordinate fields) with actual values 0-1000 (or 0 if not present)
- <conf> with confidence 0.0-1.0`;
}

// =============================================================================
// MAIN PROMPT BUILDERS
// =============================================================================

/**
 * Build a complete prompt based on feature flags and columns
 */
export function buildModularPrompt(config: PromptBuilderConfig): string {
	const { columns, featureFlags, bboxOrder = '[x1, y1, x2, y2]' } = config;

	const sections: string[] = [];

	// 1. Core context
	sections.push(CORE_CONTEXT);

	// 2. User schema (absolute priority)
	sections.push(generateUserSchemaSection(columns));

	// 3. Rules - always included
	sections.push(RULES_ALWAYS);

	// 4. Feature-specific rules
	if (featureFlags.multiRowExtraction) {
		sections.push(RULES_MULTI_ROW);
	}

	if (featureFlags.toonOutput) {
		sections.push(RULES_TOON_OUTPUT);
	} else {
		sections.push(RULES_JSON_OUTPUT);
	}

	if (featureFlags.boundingBoxes) {
		if (featureFlags.toonOutput) {
			const coordFields = parseBboxOrderToFields(bboxOrder);
			sections.push(RULES_BOUNDING_BOXES_TOON(coordFields));
		} else {
			sections.push(RULES_BOUNDING_BOXES(bboxOrder));
		}
	}

	if (featureFlags.confidenceScores) {
		sections.push(RULES_CONFIDENCE);
	}

	sections.push(RULES_IMAGE_INDEX);

	// 5. OCR guidance (always included - harmless if OCR is disabled)
	sections.push(RULES_OCR_GUIDANCE);

	// 6. Output format example
	sections.push(generateOutputFormatSection(columns, featureFlags, bboxOrder));

	return sections.join('\n\n');
}

/**
 * Extended config for per-page extraction prompts
 */
export interface PerPagePromptConfig extends PromptBuilderConfig {
	currentPage: number;
	totalPages: number;
	previousExtractions?: string;
}

/**
 * Build a prompt for per-page extraction mode
 */
export function buildPerPagePrompt(config: PerPagePromptConfig): string {
	const { columns, featureFlags, bboxOrder = '[x1, y1, x2, y2]', currentPage, totalPages, previousExtractions } = config;

	const sections: string[] = [];

	// 1. Core context
	sections.push(CORE_CONTEXT);

	// 2. Per-page specific rules
	sections.push(RULES_PER_PAGE(currentPage, totalPages));

	// 3. Previous extractions context
	if (currentPage > 1 && previousExtractions) {
		sections.push(`PREVIOUSLY EXTRACTED (pages 1-${currentPage - 1}):
\`\`\`
${previousExtractions}
\`\`\`
DO NOT re-extract these items.`);
	}

	// 4. User schema (absolute priority)
	sections.push(generateUserSchemaSection(columns));

	// 5. Rules - always included
	sections.push(RULES_ALWAYS);

	// 6. Feature-specific rules (multi-row always enabled in per-page mode)
	sections.push(RULES_MULTI_ROW);

	if (featureFlags.toonOutput) {
		sections.push(RULES_TOON_OUTPUT);
	} else {
		sections.push(RULES_JSON_OUTPUT);
	}

	if (featureFlags.boundingBoxes) {
		if (featureFlags.toonOutput) {
			const coordFields = parseBboxOrderToFields(bboxOrder);
			sections.push(RULES_BOUNDING_BOXES_TOON(coordFields));
		} else {
			sections.push(RULES_BOUNDING_BOXES(bboxOrder));
		}
	}

	if (featureFlags.confidenceScores) {
		sections.push(RULES_CONFIDENCE);
	}

	// 7. OCR guidance (always included - harmless if OCR is disabled)
	sections.push(RULES_OCR_GUIDANCE);

	// 8. Output format example
	sections.push(generateOutputFormatSection(columns, featureFlags, bboxOrder));

	return sections.join('\n\n');
}

/**
 * Format extractions as TOON string for context in per-page mode
 */
export function formatExtractionsAsToon(
	extractions: any[],
	featureFlags: ExtractionFeatureFlags,
	bboxOrder: string = '[x1, y1, x2, y2]'
): string {
	if (!extractions || extractions.length === 0) {
		return '(no extractions yet)';
	}

	// Build field list
	const fieldList: string[] = [];
	if (featureFlags.multiRowExtraction) {
		fieldList.push('row_index');
	}
	fieldList.push('column_id', 'column_name', 'value', 'image_index');

	if (featureFlags.boundingBoxes) {
		const coordFields = parseBboxOrderToFields(bboxOrder);
		fieldList.push(...coordFields);
	}
	if (featureFlags.confidenceScores) {
		fieldList.push('confidence');
	}

	// Build rows
	const rows = extractions.map(e => {
		const values: string[] = [];
		if (featureFlags.multiRowExtraction) {
			values.push(String(e.row_index ?? 0));
		}
		values.push(String(e.column_id));
		values.push(e.column_name);
		values.push(e.value ?? 'null');
		values.push(String(e.image_index ?? 0));

		if (featureFlags.boundingBoxes && e.bbox_2d) {
			values.push(...e.bbox_2d.map((v: number) => String(v)));
		} else if (featureFlags.boundingBoxes) {
			values.push('0', '0', '0', '0');
		}
		if (featureFlags.confidenceScores) {
			values.push(String(e.confidence ?? 0));
		}

		return '  ' + values.join('\t');
	});

	const header = `extractions[${extractions.length}]{${fieldList.join(',')}}:`;
	return header + '\n' + rows.join('\n');
}

// =============================================================================
// PRESETS
// =============================================================================

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
