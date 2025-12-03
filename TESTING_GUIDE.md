# Multi-Row Extraction Testing Guide

## Quick Start Testing

### Test 1: Verify Backend is Working

```bash
# 1. Start the development server
npm run dev

# 2. In another terminal, check if worker is running
# The worker should start automatically with the dev server
```

### Test 2: Create a Multi-Row Project

1. Log in to the application
2. Go to Dashboard
3. Create a new project
4. In project settings:
   - Set `extraction_mode` to **"multi_row"** (you may need to manually update via PocketBase Admin)
   - Define columns: "Date", "Amount", "Description"
   - Select prompt template: **"Qwen3 VL (Multi-Row)"** or **"Gemini 2.0 (Multi-Row)"**

### Test 3: Process a Multi-Row Document

**Sample Document**: Create a simple bank statement image with 3 transactions

Upload the document and let it process. Check worker logs:

```
Extraction mode: multi_row
Detected format: Flat array with row_index field
Grouped into 3 rows from LLM response
Created extraction_row 0 with 3 extractions
Created extraction_row 1 with 3 extractions
Created extraction_row 2 with 3 extractions
```

### Test 4: Verify Database

Open PocketBase Admin UI:

```bash
# Navigate to PocketBase admin
open http://127.0.0.1:8090/_/
```

Check `extraction_rows` collection:
- Should see 3 records for the batch
- Each with `row_index`: 0, 1, 2
- Each with `row_data` containing 3 field extractions
- All with `status`: "review"

### Test 5: View Results

1. Go to project results page
2. Should see table with:
   - Column headers: Batch ID, **Row #**, Created, Date, Amount, Description
   - 3 rows from the same batch
   - Row # column showing 1, 2, 3

3. Export CSV
4. Open CSV file
5. Verify:
   - Headers include "Row #"
   - Each transaction is a separate row
   - All 3 rows have same Batch ID

### Test 6: Backward Compatibility (Single-Row)

1. Create a project with `extraction_mode`: **"single_row"** (or leave default)
2. Upload a single receipt/invoice
3. Process it
4. Check database: Should see 1 extraction_row with `row_index`: 0
5. Check results page: Should see 1 row with Row # = 1
6. Export CSV: Should work identically to before

## Component Testing

### Test ExtractionRowCard Component

Create a test page:

```svelte
<script>
	import ExtractionRowCard from '$lib/components/projects/extraction-row-card.svelte';

	const columns = [
		{ id: 'date', name: 'Date', type: 'date' },
		{ id: 'amount', name: 'Amount', type: 'currency' }
	];

	const rowData = [
		{ column_id: 'date', column_name: 'Date', value: '2024-01-15', image_index: 0, bbox_2d: [0,0,0,0], confidence: 0.95 },
		{ column_id: 'amount', column_name: 'Amount', value: '150.00', image_index: 0, bbox_2d: [0,0,0,0], confidence: 0.98 }
	];
</script>

<ExtractionRowCard
	rowIndex={0}
	{rowData}
	{columns}
	totalRows={3}
	isSingleRowMode={false}
	onEdit={(columnId, value) => console.log('Edit:', columnId, value)}
	onDelete={() => console.log('Delete row')}
	onRedo={(columnId) => console.log('Redo:', columnId)}
/>
```

**Expected behavior**:
- Shows "Row 1 of 3"
- Displays Date and Amount fields
- Shows confidence scores
- Edit icon opens inline editor
- Redo icon marks field for redo
- Delete button shows in header

### Test ExtractionRowsContainer Component

```svelte
<script>
	import ExtractionRowsContainer from '$lib/components/projects/extraction-rows-container.svelte';

	const rows = [
		{ id: '1', rowIndex: 0, data: [...], status: 'review' },
		{ id: '2', rowIndex: 1, data: [...], status: 'review' },
		{ id: '3', rowIndex: 2, data: [...], status: 'review' }
	];

	const columns = [...];

	let redoRequests = $state(new Map());
</script>

<ExtractionRowsContainer
	{rows}
	{columns}
	isSingleRowMode={false}
	onRowEdit={(rowIdx, colId, val) => console.log('Edit:', rowIdx, colId, val)}
	onRowDelete={(rowIdx) => console.log('Delete row:', rowIdx)}
	onRowAdd={() => console.log('Add row')}
	onRedoMark={(rowIdx, colId) => console.log('Mark redo:', rowIdx, colId)}
	{redoRequests}
/>
```

**Expected behavior**:
- Shows all 3 rows in scrollable container
- Each row has edit/delete/redo controls
- "Add Missing Row" button at bottom
- Deleted rows hidden but tracked

## Manual Testing Checklist

### Database Layer
- [ ] extraction_rows collection exists
- [ ] projects.extraction_mode field exists
- [ ] image_batches.row_count field exists
- [ ] Types regenerated successfully

### Backend Processing
- [ ] Single-row project processes correctly (row_count = 1)
- [ ] Multi-row project processes correctly (row_count > 1)
- [ ] Worker creates extraction_rows records
- [ ] parseMultiRowResponse handles various formats
- [ ] Redo includes rowIndex in job data
- [ ] Redo updates specific row only

### Components
- [ ] ExtractionRowCard displays single row
- [ ] ExtractionRowCard editing works
- [ ] ExtractionRowCard redo marking works
- [ ] ExtractionRowsContainer displays multiple rows
- [ ] ExtractionRowsContainer scrolls properly
- [ ] ExtractionRowsContainer "Add Row" works
- [ ] Row deletion tracked correctly

### Results & Export
- [ ] Results page loads extraction_rows
- [ ] Results page shows Row # column
- [ ] Multiple rows from same batch displayed
- [ ] CSV export includes Row #
- [ ] CSV export shows all rows
- [ ] CSV export for single-row unchanged

### Integration (Once Review Page Updated)
- [ ] Review page loads extraction_rows
- [ ] Review page displays rows based on mode
- [ ] Single-row mode looks identical to current
- [ ] Multi-row mode shows new UI
- [ ] Approval saves all rows
- [ ] Redo works per row + column
- [ ] Add row creates empty row
- [ ] Delete row marks for deletion

## Common Issues & Solutions

### Issue: Worker not creating extraction_rows

**Check**:
```javascript
// In worker.ts processBatch, add console.log
console.log('Extraction mode:', extractionMode);
console.log('Extracted rows count:', extractedRows.length);
```

**Solution**: Ensure project has `extraction_mode` set correctly

### Issue: Results page empty

**Check**:
```javascript
// In results page, check query
const rows = await pb.collection('extraction_rows').getFullList({
	filter: `project = '${projectId}' && status = 'approved'`
});
console.log('Loaded rows:', rows.length);
```

**Solution**: Verify extraction_rows were created and approved

### Issue: CSV has wrong format

**Check**: Row # column should be 1-based (rowIndex + 1)

**Solution**: Verify exportToCSV function uses `row.rowIndex + 1`

### Issue: LLM not returning row_index

**Check**: Prompt template being used

**Solution**: Use multi-row prompt templates (`qwen3vl_multirow` or `gemini2_multirow`)

## Performance Testing

### Test with Large Batch

1. Create batch with 50+ transactions
2. Verify:
   - All extraction_rows created
   - Review UI scrolls smoothly
   - Results page loads quickly
   - CSV export completes

### Load Testing

```bash
# Create 100 batches with 10 rows each
# Check database performance
# Monitor memory usage
```

## Debugging Tips

### Enable Verbose Logging

In `worker.ts`, all parsing steps already log to console:

```
=== parseMultiRowResponse Debug ===
Input type: array
Detected format: Flat array with row_index field
Grouped into 3 rows
=== End parseMultiRowResponse Debug ===
```

### Check Database Directly

```sql
-- In PocketBase SQLite console
SELECT batch, row_index, status FROM extraction_rows WHERE project = 'xxx';
```

### Verify Components Render

```svelte
<!-- Add debugging to components -->
<script>
	$inspect(rows); // Runes API
	console.log('Current rows:', rows);
</script>
```

## Success Criteria

✅ **Implementation is successful when**:

1. Single-row projects work identically to before
2. Multi-row projects create multiple extraction_rows
3. Results page shows all rows with row numbers
4. CSV export includes row numbers and all rows
5. Components render correctly in both modes
6. No errors in console
7. Database queries are efficient
8. Backward compatibility maintained

## Next Steps After Testing

1. Fix any bugs found during testing
2. Integrate components into review page
3. Test review page integration thoroughly
4. Deploy to staging environment
5. User acceptance testing
6. Document any edge cases discovered
7. Create user-facing documentation
