# Multi-Row Extraction Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER UPLOADS DOCUMENT                           │
│                    (e.g., bank statement with 5 transactions)           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (SvelteKit)                           │
│                                                                          │
│  Upload Page:                                                           │
│  - Creates image_batch record (status: 'pending')                       │
│  - Uploads images to PocketBase                                         │
│  - Enqueues processing job                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      QUEUE SYSTEM (BullMQ Worker)                       │
│                                                                          │
│  Worker.processBatch():                                                 │
│  1. Load project (check extraction_mode)                                │
│  2. Load images for batch                                               │
│  3. Call Vision LLM with multi-row prompt                               │
│  4. Parse LLM response:                                                 │
│     ┌─────────────────────────────────────────────────────────┐        │
│     │ parseMultiRowResponse()                                 │        │
│     │                                                          │        │
│     │ Input: LLM JSON response                                │        │
│     │                                                          │        │
│     │ Format Detection:                                       │        │
│     │ ├─ Flat array with row_index? → Group by row_index     │        │
│     │ ├─ Nested with "rows" key? → Process each row          │        │
│     │ └─ Unknown format? → Treat as single row               │        │
│     │                                                          │        │
│     │ Output: Array of row arrays                            │        │
│     │ [ [row0 extractions], [row1 extractions], ... ]        │        │
│     └─────────────────────────────────────────────────────────┘        │
│  5. Create extraction_rows records (one per row)                        │
│  6. Update batch (status: 'review', row_count: N)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      DATABASE (PocketBase SQLite)                       │
│                                                                          │
│  Collections:                                                           │
│                                                                          │
│  ┌─────────────────────┐         ┌──────────────────────┐              │
│  │  image_batches      │────────▶│  extraction_rows     │              │
│  ├─────────────────────┤         ├──────────────────────┤              │
│  │ id                  │         │ id                   │              │
│  │ project   (FK)      │         │ batch        (FK) ───┘              │
│  │ status              │         │ project      (FK)                   │
│  │ row_count   NEW     │         │ row_index    NEW     │              │
│  │ processed_data      │         │ row_data     NEW     │              │
│  │ created             │         │ status               │              │
│  └─────────────────────┘         │ approved_at  NEW     │              │
│           │                       │ deleted_at   NEW     │              │
│           │                       └──────────────────────┘              │
│           │                                                              │
│           │                       Example for bank statement:           │
│           │                       ┌─────────────────────────────┐       │
│           └──────────────────────▶│ Row 0: [date, amount, desc] │       │
│                                   │ Row 1: [date, amount, desc] │       │
│                                   │ Row 2: [date, amount, desc] │       │
│                                   │ Row 3: [date, amount, desc] │       │
│                                   │ Row 4: [date, amount, desc] │       │
│                                   └─────────────────────────────┘       │
│                                                                          │
│  ┌─────────────────────┐                                                │
│  │  projects           │                                                │
│  ├─────────────────────┤                                                │
│  │ id                  │                                                │
│  │ extraction_mode NEW │ ◀── 'single_row' | 'multi_row'                │
│  │ settings            │                                                │
│  └─────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   REVIEW PAGE (Frontend Integration)                    │
│                                                                          │
│  Data Loading:                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │ loadExtractionRowsWithFallback()                           │         │
│  │                                                             │         │
│  │ Try: Load from extraction_rows collection                  │         │
│  │   ├─ Found rows? Return them                               │         │
│  │   └─ Not found? Check batch.processed_data (legacy)        │         │
│  │                                                             │         │
│  │ Result: ExtractionRow[]                                    │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                    │                                     │
│                                    ▼                                     │
│  UI Rendering:                                                          │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │ if (isSingleRowMode) {                                     │         │
│  │   Show 1 card (same as old UI)                             │         │
│  │ } else {                                                   │         │
│  │   Show N cards with headers "Row X of N"                   │         │
│  │   + "Add Missing Row" button                               │         │
│  │   + Delete button per row                                  │         │
│  │ }                                                           │         │
│  └────────────────────────────────────────────────────────────┘         │
│                                                                          │
│  User Actions:                                                          │
│  ├─ Edit field → handleRowEdit(rowIndex, columnId, value)              │
│  ├─ Delete row → handleRowDelete(rowIndex)                              │
│  ├─ Add row → handleRowAdd()                                            │
│  ├─ Mark redo → handleRedoMark(rowIndex, columnId)                      │
│  └─ Approve → saveExtractionRows() → saves all rows                     │
│                                                                          │
│  Component Hierarchy:                                                   │
│  ┌────────────────────────────────────────────────────────────┐         │
│  │ <ExtractionRowsContainer>                                  │         │
│  │   ├─ <ExtractionRowCard row=0 />                           │         │
│  │   ├─ <ExtractionRowCard row=1 />                           │         │
│  │   ├─ <ExtractionRowCard row=2 />                           │         │
│  │   └─ <Button>Add Missing Row</Button>                      │         │
│  └────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                 REDO FLOW (Row-Specific Re-extraction)                  │
│                                                                          │
│  User marks columns for redo in specific rows:                          │
│  redoRequests = Map {                                                   │
│    0 → Set { 'date', 'amount' }  // Row 0 needs date + amount redone    │
│    2 → Set { 'description' }     // Row 2 needs description redone      │
│  }                                                                       │
│                                                                          │
│  Submit Redo:                                                           │
│  FOR EACH (rowIndex, columnIds) in redoRequests:                        │
│    1. Create cropped images for those columns                           │
│    2. POST /api/queue/redo with { rowIndex, columnIds, ... }            │
│    3. Worker.processRedo():                                             │
│       - Load extraction_row WHERE row_index = rowIndex                  │
│       - Keep correct extractions                                        │
│       - Re-extract marked columns via LLM                               │
│       - Merge results                                                   │
│       - Update ONLY that specific extraction_row                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RESULTS PAGE & CSV EXPORT                            │
│                                                                          │
│  Load Data:                                                             │
│  - Query: extraction_rows WHERE project = X AND status = 'approved'     │
│  - Sort by: batch, row_index                                            │
│                                                                          │
│  Display Table:                                                         │
│  ┌──────────┬──────┬────────────┬──────┬────────┬─────────────┐        │
│  │ Batch ID │ Row# │   Created  │ Date │ Amount │ Description │        │
│  ├──────────┼──────┼────────────┼──────┼────────┼─────────────┤        │
│  │ abc123   │  1   │ 2024-01-01 │ ...  │  ...   │    ...      │        │
│  │ abc123   │  2   │ 2024-01-01 │ ...  │  ...   │    ...      │        │
│  │ abc123   │  3   │ 2024-01-01 │ ...  │  ...   │    ...      │        │
│  │ def456   │  1   │ 2024-01-02 │ ...  │  ...   │    ...      │        │
│  └──────────┴──────┴────────────┴──────┴────────┴─────────────┘        │
│                                                                          │
│  CSV Export:                                                            │
│  - Headers: Batch ID, Row #, Created, ...column names                   │
│  - Each extraction_row becomes one CSV row                              │
│  - Row # is 1-based (rowIndex + 1) for human readability                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Comparison: Single-Row vs Multi-Row

### Single-Row Mode (Backward Compatible)

```
Document Upload (1 receipt)
         │
         ▼
Worker processes → Creates 1 extraction_row (row_index: 0)
         │
         ▼
Review Page → Shows 1 card (same UI as before)
         │
         ▼
Approve → Updates extraction_row.status = 'approved'
         │
         ▼
Results Page → Shows 1 row in table
         │
         ▼
CSV Export → 1 row with Row # = 1
```

### Multi-Row Mode (New Functionality)

```
Document Upload (bank statement with 5 transactions)
         │
         ▼
Worker processes → Creates 5 extraction_rows (row_index: 0-4)
         │
         ▼
Review Page → Shows 5 cards stacked vertically
         │           ├─ Row 1 of 5
         │           ├─ Row 2 of 5
         │           ├─ Row 3 of 5
         │           ├─ Row 4 of 5
         │           └─ Row 5 of 5
         ▼
User edits row 2, deletes row 4, adds row 6 manually
         │
         ▼
Approve → saveExtractionRows()
         │  ├─ Updates rows 0, 1, 3 (status: 'approved')
         │  ├─ Updates row 2 with edits (status: 'approved')
         │  ├─ Marks row 4 as deleted (status: 'deleted')
         │  └─ Creates row 5 (manually added, status: 'approved')
         ▼
Results Page → Shows 5 rows in table (row 4 excluded)
         │
         ▼
CSV Export → 5 rows with Row # = 1, 2, 3, 4, 6
```

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│              ExtractionRowsContainer.svelte                     │
│                                                                  │
│  Props:                                                         │
│  - rows: ExtractionRow[]                                        │
│  - columns: ColumnDefinition[]                                  │
│  - isSingleRowMode: boolean                                     │
│  - Event handlers (onRowEdit, onRowDelete, onRowAdd, etc.)      │
│                                                                  │
│  Internal State:                                                │
│  - deletedRowIndices: Set<number>                               │
│  - visibleRows = rows.filter(not deleted)                       │
│                                                                  │
│  Rendering Logic:                                               │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ if (isSingleRowMode && visibleRows.length === 1) {  │       │
│  │   // Show single card without row controls          │       │
│  │   <ExtractionRowCard                                │       │
│  │     rowIndex={0}                                     │       │
│  │     isSingleRowMode={true}                           │       │
│  │     ...                                              │       │
│  │   />                                                 │       │
│  │ } else {                                             │       │
│  │   // Multi-row mode: show all with controls         │       │
│  │   <div class="scrollable">                          │       │
│  │     {#each visibleRows as row}                      │       │
│  │       <ExtractionRowCard                            │       │
│  │         {row}                                        │       │
│  │         isSingleRowMode={false}                      │       │
│  │         onDelete={() => handleDelete(row.rowIndex)} │       │
│  │         ...                                          │       │
│  │       />                                             │       │
│  │     {/each}                                          │       │
│  │     <Button onclick={onRowAdd}>                     │       │
│  │       Add Missing Row                                │       │
│  │     </Button>                                        │       │
│  │   </div>                                             │       │
│  │ }                                                    │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ For each row...
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              ExtractionRowCard.svelte                           │
│                                                                  │
│  Props:                                                         │
│  - rowIndex: number                                             │
│  - rowData: ExtractionResult[]                                  │
│  - columns: ColumnDefinition[]                                  │
│  - totalRows: number                                            │
│  - isSingleRowMode: boolean                                     │
│  - Event handlers                                               │
│                                                                  │
│  Features:                                                      │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ Header (if !isSingleRowMode):                       │       │
│  │   "Row X of N"     [Delete Button]                  │       │
│  │                                                      │       │
│  │ For each column:                                    │       │
│  │   ┌────────────────────────────────────────┐        │       │
│  │   │ Label: Date                            │        │       │
│  │   │ Value: 2024-01-15  [Edit] [Redo]      │        │       │
│  │   │ Confidence: 95%                        │        │       │
│  │   └────────────────────────────────────────┘        │       │
│  │                                                      │       │
│  │ Edit Mode (per field):                              │       │
│  │   <Input value={...} />                             │       │
│  │   [Save] [Cancel]                                   │       │
│  │                                                      │       │
│  │ Redo Marked:                                        │       │
│  │   Orange highlight                                  │       │
│  │   [Undo Redo] button                                │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## State Management Flow

```
Review Page State:
┌─────────────────────────────────────────────────────────┐
│ extractionRows: ExtractionRow[]                         │
│   ┌─────────────────────────────────────────────┐       │
│   │ { id: '1', rowIndex: 0, data: [...], ... } │       │
│   │ { id: '2', rowIndex: 1, data: [...], ... } │       │
│   │ { id: '3', rowIndex: 2, data: [...], ... } │       │
│   └─────────────────────────────────────────────┘       │
│                                                          │
│ deletedRowIndices: Set<number>                          │
│   Set { 1 }  // Row 1 marked for deletion               │
│                                                          │
│ redoRequests: Map<rowIndex, Set<columnId>>              │
│   Map {                                                 │
│     0 → Set { 'date' },  // Row 0: redo date field      │
│     2 → Set { 'amount', 'desc' }  // Row 2: redo 2 cols │
│   }                                                      │
└─────────────────────────────────────────────────────────┘
                      │
        User edits row 0, column 'amount'
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ handleRowEdit(0, 'amount', '150.00')                    │
│   │                                                      │
│   ├─ Find row at index 0                                │
│   ├─ Update field value immutably                       │
│   └─ extractionRows[0] = updatedRow                     │
│                                                          │
│ Result: extractionRows updated, UI re-renders           │
└─────────────────────────────────────────────────────────┘
                      │
        User approves batch
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ handleAccept()                                          │
│   │                                                      │
│   ├─ Call saveExtractionRows(...)                       │
│   │   ├─ For each row NOT in deletedRowIndices:        │
│   │   │   ├─ Has id? → UPDATE record                    │
│   │   │   └─ No id? → CREATE record (manually added)    │
│   │   └─ For each row IN deletedRowIndices:            │
│   │       └─ UPDATE record (status: 'deleted')          │
│   │                                                      │
│   └─ Update batch (status: 'approved')                  │
└─────────────────────────────────────────────────────────┘
```

---

## Database Schema Details

### extraction_rows Collection

```sql
CREATE TABLE extraction_rows (
  id          TEXT PRIMARY KEY,
  batch       TEXT NOT NULL REFERENCES image_batches(id),
  project     TEXT NOT NULL REFERENCES projects(id),
  row_index   INTEGER NOT NULL,
  row_data    TEXT NOT NULL,  -- JSON array of ExtractionResult
  status      TEXT NOT NULL,  -- 'pending' | 'review' | 'approved' | 'deleted'
  approved_at DATETIME,
  deleted_at  DATETIME,
  created     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_extraction_rows_batch ON extraction_rows(batch);
CREATE INDEX idx_extraction_rows_project ON extraction_rows(project);
CREATE INDEX idx_extraction_rows_status ON extraction_rows(status);
```

### Example row_data JSON

```json
[
  {
    "column_id": "date",
    "column_name": "Date",
    "value": "2024-01-15",
    "image_index": 0,
    "bbox_2d": [100, 200, 250, 220],
    "confidence": 0.95,
    "row_index": 0
  },
  {
    "column_id": "amount",
    "column_name": "Amount",
    "value": "150.00",
    "image_index": 0,
    "bbox_2d": [600, 200, 700, 220],
    "confidence": 0.98,
    "row_index": 0
  },
  {
    "column_id": "description",
    "column_name": "Description",
    "value": "Grocery Store",
    "image_index": 0,
    "bbox_2d": [300, 200, 550, 220],
    "confidence": 0.92,
    "row_index": 0
  }
]
```

---

## Key Design Decisions

### 1. Unified Architecture
**Decision**: Treat single-row as multi-row with exactly 1 row
**Rationale**: No dual code paths, same components handle both modes
**Benefit**: Simpler codebase, easier maintenance

### 2. Separate Collection
**Decision**: Create `extraction_rows` collection instead of nested JSON
**Rationale**: Better queryability, clear ownership, easier updates
**Benefit**: Can query/update individual rows efficiently

### 3. Component-Based UI
**Decision**: Create reusable components instead of inline cards
**Rationale**: Separation of concerns, easier testing, reusability
**Benefit**: Review page stays clean, components can be used elsewhere

### 4. Backward Compatibility
**Decision**: Dual-read support with fallback
**Rationale**: Zero downtime migration, gradual rollout
**Benefit**: No breaking changes for existing projects

### 5. Row-Level Redo
**Decision**: Include rowIndex in redo API
**Rationale**: Multi-row documents need per-row re-extraction
**Benefit**: Precise targeting, efficient processing

---

This architecture diagram shows the complete system flow from upload to export, with detailed explanations of each component's role and how data flows through the system.
