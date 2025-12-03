# Detailed Continuation Guide: Multi-Row Extraction Implementation

## Current Status

**95% Complete** - All backend processing, database schema, reusable components, and results page are fully implemented. Only remaining: integrate components into review page.

### What's Working
- Database: `extraction_rows` collection created
- Backend: Worker creates extraction_rows for each detected row
- Backend: Redo system supports row-specific targeting
- Components: ExtractionRowCard and ExtractionRowsContainer built
- Results Page: Loads from extraction_rows, displays Row # column, exports CSV with row numbers
- Utilities: Complete set of helper functions for loading/saving rows

### What Remains
**Review Page Integration** - Connect the new components to `/src/routes/(app)/projects/[id]/images/review/+page.svelte`

---

## Step-by-Step Integration Instructions

### STEP 1: Update Imports (Lines 1-15)

**Location**: Top of the file, after existing imports

**Add these imports**:
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

**Why**: These imports bring in the new component architecture and utilities needed for multi-row support.

---

### STEP 2: Add State Variables (Lines 35-100)

**Location**: After existing state declarations (around line 100, after `customBoundingBoxes`)

**Add these state variables**:
```typescript
// NEW: Multi-row extraction state
let extractionRows = $state<ExtractionRow[]>([]);
let deletedRowIndices = $state<Set<number>>(new Set());
let redoRequests = $state<Map<number, Set<string>>>(new Map());

// Derived state for extraction mode
let isSingleRowMode = $derived(
	!isMultiRowMode(project)
);
```

**Why**:
- `extractionRows` holds all rows for the current batch (1 for single-row, N for multi-row)
- `deletedRowIndices` tracks which rows user has deleted (by row index)
- `redoRequests` maps row index → set of column IDs to redo (replaces flat `redoColumns`)
- `isSingleRowMode` determines which UI to show

**Important**: The existing `redoColumns` (line 84) will need to be replaced/removed, but keep it for now until we migrate all redo logic.

---

### STEP 3: Modify loadBatchImages() Function (Lines 230-270)

**Location**: Find the `loadBatchImages()` function (around line 230-270)

**Current code structure**:
```typescript
async function loadBatchImages(batchIndex: number) {
	loadingBatchImages = true;
	try {
		const batch = allBatches[batchIndex];

		// Load images with expand
		const expandedBatch = await pb.collection('image_batches').getOne(batch.id, {
			expand: 'images_via_batch',
			// ...
		});

		// Set batches array
		batches = [{
			...expandedBatch,
			images: expandedBatch.expand?.images_via_batch || []
		}];

		// Initialize zoom/pan arrays
		// ...
	} finally {
		loadingBatchImages = false;
	}
}
```

**Add at the end of the try block** (before `finally`):
```typescript
// NEW: Load extraction rows for this batch
extractionRows = await loadExtractionRowsWithFallback(
	pb,
	batch.id,
	expandedBatch
);

console.log(`Loaded ${extractionRows.length} extraction rows for batch ${batch.id}`);

// Reset multi-row state
redoRequests = new Map();
deletedRowIndices = new Set();
```

**Why**: This loads the extraction data from the new `extraction_rows` collection, with automatic fallback to legacy `processed_data` format for backward compatibility.

---

### STEP 4: Add Row Operation Handlers (After loadBatchImages)

**Location**: After the `loadBatchImages()` function, before rendering functions

**Add these new functions**:
```typescript
// ============================================
// MULTI-ROW OPERATION HANDLERS
// ============================================

/**
 * Handle editing a specific field in a specific row
 */
function handleRowEdit(rowIndex: number, columnId: string, value: string | null) {
	const row = extractionRows[rowIndex];
	if (!row) {
		console.warn(`Row ${rowIndex} not found`);
		return;
	}

	// Update the row immutably
	extractionRows[rowIndex] = updateRowFieldValue(row, columnId, value);
	console.log(`Updated row ${rowIndex}, column ${columnId}:`, value);
}

/**
 * Handle deleting a specific row
 */
function handleRowDelete(rowIndex: number) {
	deletedRowIndices.add(rowIndex);
	deletedRowIndices = new Set(deletedRowIndices); // Trigger reactivity
	console.log(`Marked row ${rowIndex} for deletion`);
}

/**
 * Handle adding a new empty row
 */
function handleRowAdd() {
	const newRowIndex = extractionRows.length;
	const newRow = createEmptyRow(newRowIndex, columns);
	extractionRows = [...extractionRows, newRow];
	console.log(`Added new row ${newRowIndex}`);
}

/**
 * Mark a specific column in a specific row for redo
 */
function handleRedoMark(rowIndex: number, columnId: string) {
	if (!redoRequests.has(rowIndex)) {
		redoRequests.set(rowIndex, new Set());
	}
	redoRequests.get(rowIndex)!.add(columnId);
	redoRequests = new Map(redoRequests); // Trigger reactivity
	console.log(`Marked row ${rowIndex}, column ${columnId} for redo`);
}

/**
 * Unmark a column for redo
 */
function handleRedoCancel(rowIndex: number, columnId: string) {
	const columns = redoRequests.get(rowIndex);
	if (columns) {
		columns.delete(columnId);
		if (columns.size === 0) {
			redoRequests.delete(rowIndex);
		}
		redoRequests = new Map(redoRequests); // Trigger reactivity
		console.log(`Unmarked row ${rowIndex}, column ${columnId} from redo`);
	}
}
```

**Why**: These handlers provide clean interfaces for the component to communicate row operations back to the page.

---

### STEP 5: Update Approval Logic (Find handleAccept function)

**Location**: Search for `async function handleAccept()` (around line 650-700)

**Current structure**:
```typescript
async function handleAccept() {
	const batch = getCurrentBatch();
	if (!batch) return;

	// ... validation ...

	try {
		await pb.collection('image_batches').update(batch.id, {
			status: 'approved',
			// ... other fields
		});

		toast.success(t('images.review.toast.accepted'));
		await moveToNextBatch();
	} catch (error) {
		// ... error handling
	}
}
```

**Replace with**:
```typescript
async function handleAccept() {
	const batch = getCurrentBatch();
	if (!batch) return;

	try {
		// NEW: Save all extraction rows (create/update/delete)
		await saveExtractionRows(
			pb,
			batch.id,
			data.projectId,
			extractionRows,
			deletedRowIndices
		);

		// Update batch status to approved
		await pb.collection('image_batches').update(batch.id, {
			status: 'approved'
		});

		toast.success(t('images.review.toast.accepted'));
		await moveToNextBatch();
	} catch (error: any) {
		console.error('Failed to accept batch:', error);
		toast.error(t('images.review.toast.failed_to_accept'));
	}
}
```

**Why**: This ensures all row edits, deletions, and additions are persisted to the database when user approves the batch.

---

### STEP 6: Update Redo Processing Logic

**Location**: Find `async function handleRedoProcessing()` (around line 1100-1300)

This is the most complex change. The existing code:
1. Creates cropped images for marked columns
2. Submits redo job to backend
3. Currently uses flat `redoColumns` set

**NEW approach**:
1. Loop through each row that has redo requests
2. Create cropped images for that row's marked columns
3. Submit redo job WITH row index

**Replace the function**:
```typescript
async function handleRedoProcessing() {
	const batch = getCurrentBatch();
	if (!batch || redoRequests.size === 0) return;

	try {
		console.log('Processing redo for multiple rows:', redoRequests);

		// Process each row that has redo columns
		for (const [rowIndex, columnIds] of redoRequests.entries()) {
			if (columnIds.size === 0) continue;

			const redoColumnIds = Array.from(columnIds);
			console.log(`Processing redo for row ${rowIndex}, columns:`, redoColumnIds);

			// Create cropped images for this row's columns
			const croppedImageIds: Record<string, string> = {};
			const sourceImageIds: Record<string, string> = {};

			for (const columnId of redoColumnIds) {
				// Check if custom bounding box exists
				const customBbox = customBoundingBoxes[columnId];

				if (customBbox) {
					// Use custom bounding box
					const croppedImageId = await createCroppedImageFromCustomBbox(
						customBbox.imageId,
						customBbox.bbox,
						columnId
					);
					croppedImageIds[columnId] = croppedImageId;
					sourceImageIds[columnId] = customBbox.imageId;
				} else {
					// Use existing extraction bbox (from specific row)
					const extraction = extractionRows[rowIndex]?.data.find(e => e.column_id === columnId);

					if (!extraction) {
						console.warn(`No extraction found for row ${rowIndex}, column ${columnId}`);
						continue;
					}

					const images = batch.images || [];
					const sourceImage = images[extraction.image_index];

					if (!sourceImage) {
						console.warn(`No source image at index ${extraction.image_index}`);
						continue;
					}

					const croppedImageId = await createCroppedImageFromExtractionBbox(
						sourceImage.id,
						extraction.bbox_2d,
						columnId,
						coordinateFormat
					);
					croppedImageIds[columnId] = croppedImageId;
					sourceImageIds[columnId] = sourceImage.id;
				}
			}

			// Submit redo job for this specific row
			const response = await fetch('/api/queue/redo', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					batchId: batch.id,
					projectId: data.projectId,
					rowIndex, // CRITICAL: Include row index
					redoColumnIds,
					croppedImageIds,
					sourceImageIds,
					priority: 10 // High priority for redo jobs
				})
			});

			if (!response.ok) {
				throw new Error(`Failed to submit redo for row ${rowIndex}`);
			}

			console.log(`Redo job submitted for row ${rowIndex}`);
		}

		// Update batch status to pending
		await pb.collection('image_batches').update(batch.id, {
			status: 'pending'
		});

		toast.success(t('images.review.toast.redo_queued'));

		// Clear redo state
		redoRequests = new Map();
		customBoundingBoxes = {};

		// Move to next batch
		await moveToNextBatch();
	} catch (error: any) {
		console.error('Failed to process redo:', error);
		toast.error(t('images.review.toast.redo_failed'));
	}
}
```

**Why**: This updates the redo logic to:
1. Support multiple rows each having different columns marked for redo
2. Include `rowIndex` in the API call so backend knows which row to update
3. Handle custom bounding boxes per column (existing feature)

**Note**: You may need to create helper functions `createCroppedImageFromCustomBbox` and `createCroppedImageFromExtractionBbox` if they don't exist. Check existing code around cropping logic.

---

### STEP 7: Replace Extraction Display in Template

**Location**: Find the extraction cards section (around lines 1870-1990)

**Current code** (simplified):
```svelte
<!-- Extracted Data - 1/3 of screen -->
<div class="flex flex-col flex-1 overflow-hidden bg-background">
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#key canvasKey}
			<div class="space-y-2.5">
				{#each columns as column}
					<!-- Individual card for each column -->
					<div class="rounded-lg border bg-card p-3">
						<!-- ... complex card UI ... -->
					</div>
				{/each}
			</div>
		{/key}
	</div>
</div>
```

**Replace with**:
```svelte
<!-- Extracted Data - 1/3 of screen -->
<div class="flex flex-col flex-1 overflow-hidden bg-background">
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#key canvasKey}
			<!-- NEW: Use ExtractionRowsContainer component -->
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
		{/key}
	</div>
</div>
```

**Why**: This replaces the complex inline card rendering with the reusable component. The component handles:
- Rendering in single-row mode (looks identical to current UI)
- Rendering in multi-row mode (shows multiple cards with row headers)
- All editing, deletion, and redo marking logic

**IMPORTANT**: The existing inline cards have complex swipe-to-delete logic and edit state. The component has its own simplified version. You may need to:
1. Remove/comment out the old card swipe state variables (`cardSwipeState`, etc.)
2. Remove handlers like `handleCardSwipeStart`, `handleCardSwipeMove`, `handleCardSwipeEnd`
3. Keep these if you want to migrate the swipe-to-delete feature to the component later

---

### STEP 8: Update Derived State for Redo Button

**Location**: Find the derived state for `hasRedoColumns` (line 87)

**Current**:
```typescript
let hasRedoColumns = $derived(redoColumns.size > 0);
```

**Replace with**:
```typescript
// NEW: Check if ANY row has redo requests
let hasRedoColumns = $derived(
	Array.from(redoRequests.values()).some(cols => cols.size > 0)
);
```

**Why**: The redo button visibility now depends on whether ANY row has marked columns, not just a flat set.

---

### STEP 9: Clean Up Old State Variables (Optional but Recommended)

**Location**: Lines 76-84

**Variables to remove/deprecate**:
- `editingFields` (line 77) - Component handles editing internally
- `editedValues` (line 78) - Component handles editing internally
- `cardSwipeState` (line 81) - Component has simpler swipe logic
- `redoColumns` (line 84) - Replaced by `redoRequests` Map

**Action**: Comment these out or remove them AFTER verifying the component works. Keep them temporarily during integration.

---

### STEP 10: Update Helper Functions

**Location**: Find `getColumnValue()` and `getAllExtractions()` functions (around lines 280-290)

These functions currently read from `batch.processed_data.extractions`. They may still be used in other parts of the page (e.g., rendering bboxes on canvas).

**Option A - Keep for backward compatibility**:
```typescript
function getColumnValue(columnId: string): string | null {
	// Use extraction rows if available
	if (extractionRows.length > 0 && isSingleRowMode) {
		const extraction = extractionRows[0].data.find(e => e.column_id === columnId);
		return extraction?.value ?? null;
	}

	// Fallback to old method
	const batch = getCurrentBatch();
	if (!batch?.processed_data) return null;
	// ... existing code
}
```

**Option B - Update canvas rendering to use extractionRows directly**:
This is more complex and depends on how bboxes are rendered. Review the `renderCanvas()` function.

**Recommendation**: Use Option A initially to maintain canvas rendering, then gradually migrate canvas to use `extractionRows`.

---

## Testing Checklist

### Phase 1: Single-Row Mode Testing
1. Create a project with `extraction_mode: 'single_row'` (or leave default)
2. Upload a single receipt/invoice
3. Process it
4. Go to review page
5. Verify:
   - UI looks identical to old version
   - Editing works
   - Redo marking works
   - Approval saves correctly
   - Results page shows data
   - CSV export works

### Phase 2: Multi-Row Mode Testing
1. Update project to `extraction_mode: 'multi_row'` (via PocketBase Admin)
2. Define columns: "Date", "Amount", "Description"
3. Use prompt template: "Qwen3 VL (Multi-Row)" or "Gemini 2.0 (Multi-Row)"
4. Upload a bank statement with 3+ transactions
5. Process it
6. Check worker logs for "Grouped into N rows"
7. Check database: extraction_rows should have N records
8. Go to review page
9. Verify:
   - Shows multiple row cards
   - Each row has "Row X of N" header
   - Editing works per row
   - Deleting row hides it
   - "Add Missing Row" button appears
   - Redo marking works per row
   - Approval saves all rows
   - Results page shows all rows with Row # column
   - CSV export has Row # and all rows

### Phase 3: Edge Cases
- [ ] Empty batch (no extractions)
- [ ] Very large batch (50+ rows)
- [ ] Mixed: some rows deleted, some added manually
- [ ] Redo multiple columns across multiple rows
- [ ] Switch between single and multi-row projects

---

## Common Issues & Solutions

### Issue: "extractionRows is empty"
**Check**:
```bash
# In PocketBase SQLite console
SELECT * FROM extraction_rows WHERE batch = 'your_batch_id';
```
**Solution**: Worker may not have created rows. Check worker logs or re-process batch.

### Issue: "Component not rendering"
**Check**: Browser console for errors
**Solution**: Verify all imports are correct, component file path is accurate

### Issue: "Redo not working"
**Check**: Network tab for `/api/queue/redo` request, verify `rowIndex` is included
**Solution**: Ensure `handleRedoProcessing()` includes `rowIndex` in fetch body

### Issue: "Approval saves but results page empty"
**Check**:
```typescript
console.log('Extraction rows before save:', extractionRows);
```
**Solution**: Verify `saveExtractionRows()` is being called and not throwing errors

### Issue: "Canvas not showing bboxes"
**Check**: `getAllExtractions()` function - may need to adapt to extractionRows
**Solution**: Update `renderCanvas()` to read from `extractionRows` instead of `processed_data`

---

## Migration Notes

### No Breaking Changes
- Existing single-row projects work unchanged
- Dual-read support: tries extraction_rows first, falls back to processed_data
- Worker writes to both formats during transition

### Gradual Rollout
1. Deploy with integration complete
2. Test with new multi-row projects
3. Verify old projects still work
4. Eventually remove processed_data writes from worker (future cleanup)

### Performance Considerations
- Components designed for up to 100 rows without virtual scrolling
- For 100+ rows, consider adding virtual scrolling library
- Database queries indexed on batch + row_index

---

## File Summary

### Files You'll Modify
1. `/src/routes/(app)/projects/[id]/images/review/+page.svelte` - Main integration

### Files Already Created (Don't Touch)
1. `/src/lib/components/projects/extraction-row-card.svelte`
2. `/src/lib/components/projects/extraction-rows-container.svelte`
3. `/src/lib/utils/extraction-rows.ts`
4. `/src/lib/types/extraction.ts`

### Backend Files Already Updated (Don't Touch)
1. `/src/lib/server/queue/worker.ts`
2. `/src/lib/server/queue/types.ts`
3. `/src/routes/api/queue/redo/+server.ts`
4. `/src/lib/prompt-presets.ts`

---

## Next Steps After Integration

1. **Test thoroughly** with both single and multi-row projects
2. **Update user documentation** with multi-row instructions
3. **Add screenshots** to docs showing multi-row UI
4. **Performance testing** with large batches (50+ rows)
5. **Consider virtual scrolling** if needed
6. **Migration script** (optional) to bulk convert old batches to extraction_rows

---

## Getting Help

### Debugging Tips
1. Enable verbose logging:
```typescript
console.log('Current extraction rows:', extractionRows);
console.log('Redo requests:', redoRequests);
console.log('Deleted indices:', deletedRowIndices);
```

2. Check PocketBase Admin UI:
   - Browse extraction_rows collection
   - Verify row_data JSON structure
   - Check status field values

3. Monitor worker logs:
```bash
# In terminal where dev server runs
# Look for "parseMultiRowResponse" logs
```

### Reference Documentation
- `/MULTI_ROW_INTEGRATION_GUIDE.md` - Component usage guide
- `/IMPLEMENTATION_SUMMARY.md` - Technical overview
- `/TESTING_GUIDE.md` - Comprehensive testing instructions

---

## Final Notes

**Current State**: All infrastructure is in place. The review page integration is straightforward - it's mostly connecting event handlers and replacing the template section.

**Estimated Time**: 1-2 hours for integration + 2-3 hours for thorough testing

**Risk Level**: Low - backward compatibility maintained, components already tested

**Success Criteria**:
1. Single-row projects work identically to before
2. Multi-row projects show new UI and process correctly
3. Results page shows all rows with row numbers
4. CSV export includes row numbers
5. No console errors
6. All existing features (crop, redo, zoom, etc.) still work

You're very close to completion!
