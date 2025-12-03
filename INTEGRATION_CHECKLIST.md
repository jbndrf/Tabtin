# Review Page Integration Checklist

Use this checklist to track your progress integrating multi-row extraction into the review page.

## Pre-Integration

- [ ] Read `/CONTINUATION_GUIDE.md` thoroughly
- [ ] Review `/ARCHITECTURE_DIAGRAM.md` for understanding
- [ ] Backup current review page file
- [ ] Create a git branch for this work: `git checkout -b feature/multi-row-review-integration`

## Code Changes

### Imports (Lines 1-15)
- [ ] Add `ExtractionRowsContainer` import
- [ ] Add utility imports from `extraction-rows.ts`
- [ ] Add `ExtractionRow` type import

### State Variables (After line 100)
- [ ] Add `extractionRows` state
- [ ] Add `deletedRowIndices` state
- [ ] Add `redoRequests` Map state
- [ ] Add `isSingleRowMode` derived state

### Load Data (loadBatchImages function)
- [ ] Add `loadExtractionRowsWithFallback()` call
- [ ] Add console log for loaded rows count
- [ ] Reset `redoRequests` Map
- [ ] Reset `deletedRowIndices` Set

### Event Handlers (After loadBatchImages)
- [ ] Add `handleRowEdit()` function
- [ ] Add `handleRowDelete()` function
- [ ] Add `handleRowAdd()` function
- [ ] Add `handleRedoMark()` function
- [ ] Add `handleRedoCancel()` function

### Approval Logic (handleAccept function)
- [ ] Replace body with `saveExtractionRows()` call
- [ ] Keep batch status update
- [ ] Keep toast messages
- [ ] Keep navigation logic

### Redo Logic (handleRedoProcessing function)
- [ ] Replace with row-aware redo processing
- [ ] Loop through `redoRequests` Map
- [ ] Include `rowIndex` in API calls
- [ ] Handle cropped images per row
- [ ] Clear `redoRequests` after submission

### Template Changes (Lines 1870-1990)
- [ ] Find extraction cards section
- [ ] Replace with `<ExtractionRowsContainer />` component
- [ ] Pass all required props
- [ ] Verify event handler bindings

### Derived State
- [ ] Update `hasRedoColumns` to check Map values

### Cleanup (Optional)
- [ ] Comment out/remove `editingFields` if unused
- [ ] Comment out/remove `editedValues` if unused
- [ ] Comment out/remove `cardSwipeState` if unused
- [ ] Comment out/remove old `redoColumns` Set

## Testing

### Single-Row Mode Tests
- [ ] Create test project with `extraction_mode: 'single_row'`
- [ ] Upload single document (receipt/invoice)
- [ ] Process and verify batch created
- [ ] Go to review page
- [ ] **Visual**: UI looks identical to old version
- [ ] **Functional**: Edit field works
- [ ] **Functional**: Redo marking works
- [ ] **Functional**: Approve batch works
- [ ] Check database: extraction_row created with status 'approved'
- [ ] Go to results page: verify data shows
- [ ] Export CSV: verify format correct

### Multi-Row Mode Tests
- [ ] Create test project with `extraction_mode: 'multi_row'`
- [ ] Set columns: Date, Amount, Description
- [ ] Select prompt: "Qwen3 VL (Multi-Row)" or "Gemini 2.0 (Multi-Row)"
- [ ] Upload bank statement with 3+ transactions
- [ ] Process batch
- [ ] Check worker logs: "Grouped into N rows"
- [ ] Check database: N extraction_rows created
- [ ] Go to review page
- [ ] **Visual**: Multiple row cards shown
- [ ] **Visual**: Each card has "Row X of N" header
- [ ] **Visual**: "Add Missing Row" button visible
- [ ] **Functional**: Edit field in row 1
- [ ] **Functional**: Delete row 2
- [ ] **Functional**: Mark redo for column in row 0
- [ ] **Functional**: Add new row manually
- [ ] **Functional**: Approve batch
- [ ] Check database: rows saved correctly
- [ ] Check database: deleted row has status 'deleted'
- [ ] Go to results page: verify all rows shown with Row #
- [ ] Export CSV: verify Row # column and all rows present

### Edge Cases
- [ ] Empty batch (no extractions) - should not crash
- [ ] Very large batch (20+ rows) - should scroll smoothly
- [ ] Delete all rows - should handle gracefully
- [ ] Add row then delete it - state management works
- [ ] Mark redo on multiple rows - all tracked correctly
- [ ] Switch between projects with different modes

### Canvas & Bounding Boxes
- [ ] Bboxes render correctly on images
- [ ] Bbox labels show correct values
- [ ] Zoom/pan still works
- [ ] Image carousel still works
- [ ] Crop mode for redo still works

### Integration Points
- [ ] Approval flow works end-to-end
- [ ] Redo flow works with rowIndex
- [ ] Decline batch still works
- [ ] Exit button still works
- [ ] Keyboard shortcuts still work (Escape for crop mode)

## Browser Testing

- [ ] Test in Chrome/Edge
- [ ] Test in Firefox
- [ ] Test in Safari (if available)
- [ ] Test on mobile viewport (responsive)
- [ ] No console errors
- [ ] No TypeScript errors (`npm run check`)

## Performance

- [ ] Review page loads quickly
- [ ] Scrolling is smooth with 10+ rows
- [ ] No memory leaks (check DevTools)
- [ ] Canvas rendering performant

## Documentation

- [ ] Update user guide (if exists) with multi-row instructions
- [ ] Add screenshots of multi-row UI
- [ ] Document any gotchas discovered

## Deployment Prep

- [ ] All tests passing
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Code reviewed (self or peer)
- [ ] Git commit with clear message
- [ ] Consider creating PR for review

## Post-Deployment Verification

- [ ] Test in production/staging environment
- [ ] Verify existing projects still work
- [ ] Verify new multi-row projects work
- [ ] Monitor for errors in logs
- [ ] Gather user feedback

---

## Quick Command Reference

### Start Dev Server
```bash
npm run dev
```

### Type Check
```bash
npm run check
```

### View PocketBase Admin
```bash
# Navigate to:
http://127.0.0.1:8090/_/
```

### Check Extraction Rows in Database
```sql
-- In PocketBase SQL console
SELECT batch, row_index, status
FROM extraction_rows
WHERE project = 'your_project_id'
ORDER BY batch, row_index;
```

### View Worker Logs
```bash
# In terminal where dev server runs
# Look for lines containing:
# - "parseMultiRowResponse"
# - "Created extraction_row"
# - "Grouped into N rows"
```

---

## Troubleshooting Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| Component not rendering | Browser console | Verify import paths |
| extractionRows empty | Database | Re-process batch |
| Edit not saving | Console logs | Check handleRowEdit |
| Redo not working | Network tab | Verify rowIndex in request |
| Canvas not showing | getAllExtractions | Update to use extractionRows |
| Type errors | npm run check | Fix type mismatches |

---

## Success Criteria

All items must be checked before considering integration complete:

- [ ] Single-row projects work identically to before
- [ ] Multi-row projects show new UI and process correctly
- [ ] All existing features still work (zoom, crop, redo, etc.)
- [ ] Results page shows all rows with row numbers
- [ ] CSV export includes row numbers and all rows
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Database queries efficient (no N+1 problems)
- [ ] Backward compatibility maintained

---

## Estimated Time

- **Reading docs**: 30 minutes
- **Code changes**: 1-2 hours
- **Testing**: 2-3 hours
- **Fixes & polish**: 1 hour
- **Total**: 4-6 hours

---

## Need Help?

1. Check `/CONTINUATION_GUIDE.md` for detailed steps
2. Check `/ARCHITECTURE_DIAGRAM.md` for system understanding
3. Check `/TESTING_GUIDE.md` for comprehensive test cases
4. Check browser console for error messages
5. Check worker logs for backend issues
6. Check PocketBase admin UI for database state

---

**Current Status**: Ready to begin integration
**Next Step**: Start with Step 1 - Update Imports
