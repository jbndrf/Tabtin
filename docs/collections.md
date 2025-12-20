# PocketBase Collections

Database schema and collection definitions for the application.

## Collections Overview

| Collection | Type | Description |
|------------|------|-------------|
| `_superusers` | auth | Admin authentication |
| `users` | auth | User accounts |
| `projects` | base | User projects with schema and settings |
| `image_batches` | base | Batch processing with status tracking |
| `images` | base | Individual images with bounding box data |
| `extraction_rows` | base | Extracted data rows with approval status |
| `queue_jobs` | base | Job queue for batch processing |
| `processing_metrics` | base | Performance metrics for jobs |
| `installed_addons` | base | Installed addon records |

---

## projects

User projects containing extraction schema and settings.

| Field | Type | Description |
|-------|------|-------------|
| name | text | Project name |
| user | relation | Project owner reference |
| settings | json | Extraction and prompt settings |
| schema_chat_history | json | Assistant conversation history |
| document_analyses | json | Analyzed document metadata |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

### Settings JSON Structure

```json
{
  "columns": [
    {
      "id": "col_123",
      "name": "Invoice Number",
      "type": "text",
      "description": "Extract the invoice number"
    }
  ],
  "featureFlags": {
    "boundingBoxes": true,
    "confidenceScores": true,
    "multiRowExtraction": false,
    "toonOutput": false
  },
  "llm": {
    "model": "gpt-4-vision",
    "endpoint": "https://api.openai.com/v1/chat/completions"
  }
}
```

---

## image_batches

Batch records for grouped image processing.

| Field | Type | Description |
|-------|------|-------------|
| status | select | `pending`, `processing`, `review`, `approved`, `failed` |
| project | relation | References projects collection |
| row_count | number | Count of extraction rows |
| processed_data | json | Structured extraction results |
| error_message | text | Error details if processing failed |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Waiting to be processed |
| `processing` | Currently being processed by worker |
| `review` | Processing complete, awaiting review |
| `approved` | User has approved the results |
| `failed` | Processing failed with error |

---

## images

Individual image records with metadata.

| Field | Type | Description |
|-------|------|-------------|
| batch | relation | References image_batches |
| file | file | Image file |
| order | number | Display order within batch |
| width | number | Image width in pixels |
| height | number | Image height in pixels |
| created | autodate | Creation timestamp |

---

## extraction_rows

Extracted data rows from batch processing.

| Field | Type | Description |
|-------|------|-------------|
| status | select | `pending`, `review`, `approved`, `deleted` |
| batch | relation | References image_batches |
| project | relation | References projects |
| row_data | json | Extraction results for row |
| row_index | number | Row position (0-based) |
| approved_at | date | Approval timestamp |
| deleted_at | date | Deletion timestamp |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

### row_data JSON Structure

```json
{
  "col_123": {
    "value": "INV-2024-001",
    "confidence": 0.95,
    "bbox_2d": [100, 200, 300, 250],
    "image_index": 0
  },
  "col_456": {
    "value": "2024-01-15",
    "confidence": 0.88,
    "bbox_2d": [100, 260, 250, 290],
    "image_index": 0
  }
}
```

---

## queue_jobs

Job queue for background processing.

| Field | Type | Description |
|-------|------|-------------|
| type | select | `process_batch`, `reprocess_batch`, `process_redo` |
| status | select | `queued`, `processing`, `completed`, `failed`, `retrying` |
| data | json | Job-specific data |
| priority | number | Lower = higher priority |
| projectId | text | Project reference |
| attempts | number | Current attempt count |
| maxAttempts | number | Maximum retry attempts |
| createdAt | date | Creation timestamp |
| startedAt | date | Processing start timestamp |
| completedAt | date | Completion timestamp |
| error | text | Error message if failed |

### Job Types

| Type | Description |
|------|-------------|
| `process_batch` | Process a new batch |
| `reprocess_batch` | Reprocess an existing batch |
| `process_redo` | Redo specific columns in a row |

### Job Data Structure

```json
// process_batch / reprocess_batch
{
  "batchId": "abc123",
  "projectId": "proj456"
}

// process_redo
{
  "batchId": "abc123",
  "projectId": "proj456",
  "rowIndex": 0,
  "redoColumnIds": ["col_123", "col_456"],
  "croppedImageIds": {
    "col_123": "img_789"
  }
}
```

---

## processing_metrics

Performance metrics for job processing.

| Field | Type | Description |
|-------|------|-------------|
| jobType | select | `process_batch`, `process_redo` |
| status | select | `success`, `failed` |
| durationMs | number | Execution time in milliseconds |
| imageCount | number | Number of images processed |
| extractionCount | number | Number of extractions performed |
| modelUsed | text | LLM model identifier |
| tokensUsed | number | Token consumption |
| batchId | text | Batch reference |
| projectId | text | Project reference |
| created | autodate | Creation timestamp |

---

## installed_addons

Installed addon records for users.

| Field | Type | Description |
|-------|------|-------------|
| user | relation | Reference to users collection |
| name | text | Addon display name |
| docker_image | text | Docker image name |
| container_id | text | Docker container ID |
| container_status | select | `pending`, `building`, `starting`, `running`, `stopped`, `failed` |
| internal_url | text | Internal container URL |
| manifest | json | Full manifest object |
| config | json | User configuration values |
| auth_token | text | Secure authentication token |
| error_message | text | Error details if failed |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

### Access Rules

| Rule | Expression |
|------|------------|
| Create | `@request.auth.id != ""` |
| View | `@request.auth.id != "" && user.id = @request.auth.id` |
| Update | `@request.auth.id != "" && user.id = @request.auth.id` |
| Delete | `@request.auth.id != "" && user.id = @request.auth.id` |

See [Addon Types](./addons/types.md) for detailed type definitions.

---

## Relationships

```
users
  |
  +-- projects (1:many)
  |     |
  |     +-- image_batches (1:many)
  |     |     |
  |     |     +-- images (1:many)
  |     |     +-- extraction_rows (1:many)
  |     |
  |     +-- queue_jobs (1:many, via projectId)
  |     +-- processing_metrics (1:many, via projectId)
  |
  +-- installed_addons (1:many)
```
