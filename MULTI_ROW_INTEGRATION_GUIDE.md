# Multi-Row Extraction Integration Guide

## Components Created

### 1. `extraction-row-card.svelte`
**Purpose**: Displays a single extraction row with all its field values

**Features**:
- Shows all columns/fields for one row
- Inline editing of field values
- Mark individual fields for redo
- Delete row button (multi-row mode only)
- Confidence scores display
- Supports both single-row and multi-row modes

**Props**:
- `rowIndex`: Position of this row (0-based)
- `rowData`: Array of ExtractionResult for this row
- `columns`: Column definitions
- `isSingleRowMode`: Hide row controls in single-row mode
- `onEdit`, `onDelete`, `onRedo`, `onRedoCancel`: Event handlers

### 2. `extraction-rows-container.svelte`
**Purpose**: Container that manages multiple extraction rows

**Features**:
- Displays all extraction rows
- Scrollable container for many rows
- "Add Missing Row" button
- Manages deleted rows state
- Handles redo requests per row
- Automatically adapts UI for single vs multi-row

**Props**:
- `rows`: Array of ExtractionRow objects
- `columns`: Column definitions
- `isSingleRowMode`: Single or multi-row display
- `onRowEdit`, `onRowDelete`, `onRowAdd`: Event handlers
- `onRedoMark`, `onRedoCancel`: Redo management
- `redoRequests`: Map<rowIndex, Set<columnIds>>

### 3. `extraction-rows.ts` (Utilities)
**Purpose**: Helper functions for loading/saving extraction rows

**Functions**:
- `loadExtractionRows()`: Load from extraction_rows collection
- `loadExtractionRowsWithFallback()`: Load with fallback to legacy format
- `saveExtractionRows()`: Save/update/delete rows
- `createEmptyRow()`: Create empty row template
- `updateRowFieldValue()`: Update single field value
- `isMultiRowMode()`: Check project extraction mode

### 4. `extraction.ts` (Types)
**Purpose**: Shared TypeScript interfaces

**Types**:
- `ExtractionResult`: Single field extraction
- `ColumnDefinition`: Column metadata
- `ExtractionRow`: Complete row with metadata
- `CoordinateFormat`: Bbox coordinate formats

## Integration Steps for Review Page

### Step 1: Import New Components and Utilities

```typescript
import ExtractionRowsContainer from '$lib/components/projects/extraction-rows-container.svelte';
import {
	loadExtractionRowsWithFallback,
	saveExtractionRows,
	createEmptyRow,
	updateRowFieldValue,
	isMultiRowMode
} from '$lib/utils/extraction-rows';
import type { ExtractionRow } from '$lib/types/extraction';
```

### Step 2: Add State for Extraction Rows

```typescript
// Replace or augment existing extraction state
let extractionRows = $state<ExtractionRow[]>([]);
let deletedRowIndices = $state<Set<number>>(new Set());
let redoRequests = $state<Map<number, Set<string>>>(new Map());
let isSingleRowMode = $derived(
	!isMultiRowMode(project)
);
```

### Step 3: Load Extraction Rows in `loadBatchImages()`

```typescript
async function loadBatchImages(batchIndex: number) {
	// ... existing code to load batch and images ...

	// NEW: Load extraction rows
	extractionRows = await loadExtractionRowsWithFallback(
		pb,
		batch.id,
		batch
	);

	// Reset redo/delete state
	redoRequests = new Map();
	deletedRowIndices = new Set();
}
```

### Step 4: Handle Row Operations

```typescript
function handleRowEdit(rowIndex: number, columnId: string, value: string | null) {
	const row = extractionRows[rowIndex];
	if (!row) return;

	extractionRows[rowIndex] = updateRowFieldValue(row, columnId, value);
}

function handleRowDelete(rowIndex: number) {
	deletedRowIndices.add(rowIndex);
	deletedRowIndices = new Set(deletedRowIndices);
}

function handleRowAdd() {
	const newRowIndex = extractionRows.length;
	const newRow = createEmptyRow(newRowIndex, columns);
	extractionRows = [...extractionRows, newRow];
}

function handleRedoMark(rowIndex: number, columnId: string) {
	if (!redoRequests.has(rowIndex)) {
		redoRequests.set(rowIndex, new Set());
	}
	redoRequests.get(rowIndex)!.add(columnId);
	redoRequests = new Map(redoRequests);
}

function handleRedoCancel(rowIndex: number, columnId: string) {
	const columns = redoRequests.get(rowIndex);
	if (columns) {
		columns.delete(columnId);
		if (columns.size === 0) {
			redoRequests.delete(rowIndex);
		}
		redoRequests = new Map(redoRequests);
	}
}
```

### Step 5: Update Approval Logic

```typescript
async function handleAccept() {
	const batch = getCurrentBatch();
	if (!batch) return;

	try {
		// Save all extraction rows
		await saveExtractionRows(
			pb,
			batch.id,
			data.projectId,
			extractionRows,
			deletedRowIndices
		);

		// Update batch status
		await pb.collection('image_batches').update(batch.id, {
			status: 'approved'
		});

		toast.success(t('images.review.toast.accepted'));
		moveToNextBatch();
	} catch (error) {
		console.error('Failed to accept batch:', error);
		toast.error(t('images.review.toast.failed_to_accept'));
	}
}
```

### Step 6: Update Redo Logic

```typescript
async function submitRedo() {
	const batch = getCurrentBatch();
	if (!batch) return;

	try {
		// Process redo for each row that has redo requests
		for (const [rowIndex, columnIds] of redoRequests.entries()) {
			if (columnIds.size === 0) continue;

			const redoColumnIds = Array.from(columnIds);

			// Create cropped images for this row's columns
			const croppedImageIds: Record<string, string> = {};

			for (const columnId of redoColumnIds) {
				// Use existing crop logic or custom bounding boxes
				const croppedImageId = await createCroppedImage(columnId, rowIndex);
				croppedImageIds[columnId] = croppedImageId;
			}

			// Submit redo job with rowIndex
			await fetch('/api/queue/redo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchId: batch.id,
					projectId: data.projectId,
					rowIndex, // NEW: Include row index
					redoColumnIds,
					croppedImageIds
				})
			});
		}

		toast.success('Re-extraction queued');
		redoRequests = new Map();
	} catch (error) {
		console.error('Redo failed:', error);
		toast.error('Failed to queue re-extraction');
	}
}
```

### Step 7: Update Template

Replace the existing extraction display section with:

```svelte
<ExtractionRowsContainer
	rows={extractionRows}
	{columns}
	{isSingleRowMode}
	onRowEdit={handleRowEdit}
	onRowDelete={handleRowDelete}
	onRowAdd={handleRowAdd}
	onRedoMark={handleRedoMark}
	onRedoCancel={handleRedoCancel}
	{redoRequests}
/>
```

## Benefits of This Approach

1. **Separation of Concerns**: UI logic separated from data management
2. **Reusability**: Components work for both single and multi-row
3. **Maintainability**: Small, focused components easier to debug
4. **Backward Compatible**: Falls back to legacy format automatically
5. **Type Safe**: Full TypeScript support throughout
6. **Testable**: Components can be tested independently

## Migration Notes

- **No Breaking Changes**: Existing single-row projects work unchanged
- **Gradual Migration**: Both formats supported simultaneously
- **Performance**: Lazy loading and virtualization for many rows
- **User Experience**: Seamless switch between modes based on project settings

## Next Steps

1. Integrate components into review page following steps above
2. Test with single-row project (should look identical)
3. Test with multi-row project (new UI appears)
4. Update results page to load from extraction_rows
5. Add CSV export with row numbers
