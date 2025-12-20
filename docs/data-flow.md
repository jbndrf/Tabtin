# Data Flow

Processing pipelines and workflows in the application.

## Batch Processing Pipeline

The main data extraction pipeline from image upload to approved data.

```
1. User uploads images/PDFs
   |
   v
2. API converts PDFs to images (POST /api/pdf/convert)
   |
   v
3. Creates image_batches record (status: pending)
   |
   v
4. Creates images records (linked to batch)
   |
   v
5. User triggers processing (POST /api/queue/enqueue)
   |
   v
6. Creates queue_jobs record (status: queued)
   |
   v
7. QueueWorker picks up job
   |
   v
8. Updates batch (status: processing)
   |
   v
9. Loads images and project schema
   |
   v
10. Calls LLM with images and extraction prompt
    |
    v
11. Parses LLM response into structured data
    |
    v
12. Creates extraction_rows records
    |
    v
13. Updates batch with results (status: review)
    |
    v
14. Records metrics in processing_metrics
    |
    v
15. User reviews extractions via UI
    |
    v
16. User approves/edits (POST /api/batches/status)
    |
    v
17. Updates batch and extraction_rows (status: approved)
```

### Sequence Diagram

```
User          Frontend       API           Queue         Worker        LLM
  |              |            |              |             |            |
  |--upload----->|            |              |             |            |
  |              |--convert-->|              |             |            |
  |              |<--pages----|              |             |            |
  |              |--create--->|              |             |            |
  |              |<--batchId--|              |             |            |
  |--process---->|            |              |             |            |
  |              |--enqueue-->|              |             |            |
  |              |            |--addJob----->|             |            |
  |              |<--jobId----|              |             |            |
  |              |            |              |--poll------>|            |
  |              |            |              |             |--extract-->|
  |              |            |              |             |<--data-----|
  |              |            |              |             |--save----->|
  |              |            |              |<--done------|            |
  |              |<--notify---|<-------------|             |            |
  |<--review-----|            |              |             |            |
  |--approve---->|            |              |             |            |
  |              |--status--->|              |             |            |
  |              |<--success--|              |             |            |
```

---

## Schema Design Pipeline

AI-assisted schema creation workflow.

```
1. User opens Schema Chat
   |
   v
2. User describes document type
   |
   v
3. POST /api/schema-chat (mode='chat')
   |
   v
4. LLM analyzes request and suggests schema
   |
   v
5. LLM returns tool calls (add_column, etc.)
   |
   v
6. Client categorizes tools:
   |
   +-- Pending approval (add/edit/remove column)
   +-- Questions for user (ask_questions)
   +-- Auto-execute (get_current_schema)
   |
   v
7. User reviews proposed changes
   |
   v
8. User approves/rejects each tool call
   |
   v
9. POST /api/schema-chat (mode='execute')
   |
   v
10. Approved tools update project schema
    |
    v
11. Schema saved to project.settings
```

### Tool Flow

```
LLM Response
    |
    +-- Auto-execute tools --> Execute immediately --> Return results
    |
    +-- UI tools (questions) --> Show to user --> Collect answers
    |
    +-- Approval tools --> Show preview --> Wait for approval
                               |
                               v
                         User approves
                               |
                               v
                         Execute tools
                               |
                               v
                         Update schema
```

---

## Redo Processing Pipeline

Re-extract specific columns for a single row.

```
1. User selects row and columns to redo
   |
   v
2. POST /api/queue/redo
   |
   v
3. Creates queue_job (type: process_redo)
   |
   v
4. Worker picks up job
   |
   v
5. Loads specific images for row
   |
   v
6. Calls LLM with just selected columns
   |
   v
7. Merges new results with existing row_data
   |
   v
8. Updates extraction_row (marks columns as redone)
```

---

## Addon Communication Flow

Data flow between main app and addon containers.

```
Browser                  Main Server              Addon Container
   |                         |                          |
   |--iframe request-------->|                          |
   |                         |--proxy request---------->|
   |                         |   (+ X-Tabtin-Auth)      |
   |                         |<--response---------------|
   |<--proxied response------|                          |
   |                         |                          |
   |--postMessage----------->|                          |
   |   (TOAST, NAVIGATE)     |                          |
   |                         |                          |
   |--postMessage----------->|                          |
   |   (ADDON_FILES)         |                          |
   |          |              |                          |
   |          v              |                          |
   |   addon-files-received  |                          |
   |   (custom event)        |                          |
```

---

## Status Transitions

### Batch Status

```
           +------------------+
           |                  |
           v                  |
pending --> processing --> review --> approved
                |            |
                v            v
             failed      pending (revert)
```

### Job Status

```
queued --> processing --> completed
              |
              v
          retrying --> processing
              |
              v (max attempts)
           failed
```

### Addon Container Status

```
pending --> building --> starting --> running <--> stopped
                |            |
                v            v
             failed       failed
```

---

## Data Relationships

### Create Operations

When a user uploads images:
1. Create `image_batch` record
2. Create `image` records for each page
3. Link images to batch

When processing completes:
1. Create `extraction_row` records for each detected row
2. Link rows to batch and project
3. Update batch with processed_data and status

### Delete Operations (Cascading)

When deleting a batch:
1. Delete all `extraction_rows` linked to batch
2. Delete all `images` linked to batch
3. Delete `image_batch` record

When deleting a project:
1. Delete all batches (which cascades to rows and images)
2. Delete project record

---

## Error Handling Flow

### Job Failure

```
Job fails
    |
    v
Increment attempts
    |
    v
attempts < maxAttempts? --Yes--> Set status: retrying
    |                              |
    No                             v
    |                          Wait retryDelayMs
    v                              |
Set status: failed                 v
    |                          Set status: queued
    v                              |
Set batch status: failed           v
    |                          Re-enter queue
    v
Record error in job
```

### Recovery on Startup

```
Worker starts
    |
    v
Find batches with status: processing
    |
    v
For each stale batch:
    |
    v
Reset to status: pending
    |
    v
Cancel associated jobs
```
