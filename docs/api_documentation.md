# API Documentation

This document provides comprehensive documentation for all API endpoints, PocketBase collections, server-side utilities, and data types used in this application.

---

## Table of Contents

1. [REST API Endpoints](#rest-api-endpoints)
   - [Queue Management](#queue-management)
   - [Batch Management](#batch-management)
   - [PDF Processing](#pdf-processing)
   - [Schema Chat](#schema-chat)
   - [LLM Proxy](#llm-proxy)
2. [PocketBase Collections](#pocketbase-collections)
3. [Server-Side Utilities](#server-side-utilities)
4. [Type Definitions](#type-definitions)
5. [Authentication](#authentication)
6. [Data Flow](#data-flow)

---

## REST API Endpoints

### Queue Management

#### POST /api/queue/enqueue

Enqueue batch processing jobs.

**File:** `src/routes/api/queue/enqueue/+server.ts`

**Request Body:**
```json
{
  "batchId": "string",
  "batchIds": ["string"],
  "projectId": "string",
  "priority": 10
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| batchId | string | No | - | Single batch ID to enqueue |
| batchIds | string[] | No | - | Multiple batch IDs to enqueue |
| projectId | string | Yes | - | Project identifier |
| priority | number | No | 10 | Job priority (lower = higher priority) |

**Response:**
```json
{
  "success": true,
  "jobId": "string",
  "jobIds": ["string"],
  "canceledCount": 0,
  "message": "string"
}
```

---

#### GET /api/queue/status/[jobId]

Get individual job status.

**File:** `src/routes/api/queue/status/[jobId]/+server.ts`

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| jobId | string | The job ID to query |

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "string",
    "type": "process_batch",
    "status": "queued",
    "priority": 10,
    "data": {},
    "attempts": 0,
    "maxAttempts": 3,
    "createdAt": "ISO timestamp",
    "startedAt": "ISO timestamp",
    "completedAt": "ISO timestamp",
    "error": "string"
  }
}
```

---

#### POST /api/queue/retry

Retry failed jobs.

**File:** `src/routes/api/queue/retry/+server.ts`

**Request Body:**
```json
{
  "jobId": "string",
  "projectId": "string",
  "retryAll": false
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| jobId | string | No | Single job ID to retry |
| projectId | string | Yes | Project identifier |
| retryAll | boolean | No | Retry all failed jobs for the project |

**Response:**
```json
{
  "success": true,
  "message": "string"
}
```

---

#### POST /api/queue/redo

Enqueue redo processing jobs for specific rows.

**File:** `src/routes/api/queue/redo/+server.ts`

**Request Body:**
```json
{
  "batchId": "string",
  "projectId": "string",
  "rowIndex": 0,
  "redoColumnIds": ["string"],
  "croppedImageIds": {
    "column_id": "image_id"
  },
  "sourceImageIds": {
    "column_id": "image_id"
  },
  "priority": 5
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| batchId | string | Yes | - | Batch identifier |
| projectId | string | Yes | - | Project identifier |
| rowIndex | number | Yes | - | Row to redo (0-based) |
| redoColumnIds | string[] | Yes | - | Column IDs to reprocess |
| croppedImageIds | Record<string, string> | Yes | - | Mapping of column to image IDs |
| sourceImageIds | Record<string, string> | No | - | Optional source image mappings |
| priority | number | No | 5 | Job priority |

**Response:**
```json
{
  "success": true,
  "jobId": "string",
  "message": "string"
}
```

---

#### POST /api/queue/cancel

Cancel queued/processing jobs.

**File:** `src/routes/api/queue/cancel/+server.ts`

**Request Body:**
```json
{
  "projectId": "string",
  "batchIds": ["string"]
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project identifier |
| batchIds | string[] | No | Specific batches to cancel (all if omitted) |

**Response:**
```json
{
  "success": true,
  "canceledCount": 0,
  "batchesReset": 0,
  "message": "string"
}
```

---

#### GET /api/queue/stats

Get queue statistics.

**File:** `src/routes/api/queue/stats/+server.ts`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | No | Filter stats to specific project |

**Response:**
```json
{
  "success": true,
  "queue": {
    "queued": 0,
    "processing": 0,
    "completed": 0,
    "failed": 0,
    "totalJobs": 0
  },
  "worker": {
    "isRunning": true,
    "activeJobs": 0,
    "requestsPerMinute": 30,
    "maxConcurrency": 1
  }
}
```

---

#### GET /api/queue/metrics

Get processing metrics and statistics.

**File:** `src/routes/api/queue/metrics/+server.ts`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | No | Filter to specific project |
| timeRange | string | No | '24h', '7d', '30d', or 'all' |

**Response:**
```json
{
  "success": true,
  "stats": {
    "successRate": 0.95,
    "avgDuration": 5000,
    "minDuration": 1000,
    "maxDuration": 15000,
    "totalTokens": 50000,
    "hourlyBreakdown": []
  }
}
```

---

### Batch Management

#### POST /api/batches/status

Change batch status with extraction_rows sync.

**File:** `src/routes/api/batches/status/+server.ts`

**Request Body:**
```json
{
  "batchIds": ["string"],
  "targetStatus": "pending",
  "projectId": "string"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| batchIds | string[] | Yes | Batch IDs to update |
| targetStatus | string | Yes | 'pending', 'review', 'approved', or 'failed' |
| projectId | string | Yes | Project identifier |

**Features:**
- Syncs extraction_rows status with batch status
- Manages row data clearing when reverting to pending
- Sets approval timestamps when approving

**Response:**
```json
{
  "success": true,
  "successCount": 0,
  "failCount": 0,
  "message": "string"
}
```

---

#### POST /api/batches/delete

Delete batches with all related data.

**File:** `src/routes/api/batches/delete/+server.ts`

**Request Body:**
```json
{
  "batchIds": ["string"],
  "projectId": "string"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| batchIds | string[] | Yes | Batch IDs to delete |
| projectId | string | Yes | Project identifier |

**Cascading Deletes:**
- Deletes extraction_rows related to batches
- Deletes images associated with batches
- Deletes batch records

**Response:**
```json
{
  "success": true,
  "successCount": 0,
  "failCount": 0,
  "message": "string"
}
```

---

### PDF Processing

#### POST /api/pdf/convert

Convert PDF to images.

**File:** `src/routes/api/pdf/convert/+server.ts`

**Request:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pdf | File | Yes | PDF file to convert |
| options | JSON string | No | Conversion options |

**Options Object:**
```json
{
  "dpi": 150,
  "maxWidth": 2000,
  "maxHeight": 2000,
  "format": "png",
  "quality": 0.9
}
```

**Response:**
```json
{
  "success": true,
  "pages": [
    {
      "pageNumber": 1,
      "width": 800,
      "height": 1200,
      "data": "base64-encoded-image"
    }
  ],
  "totalPages": 5
}
```

---

### Schema Chat

#### POST /api/schema-chat

LLM-powered schema design assistant.

**File:** `src/routes/api/schema-chat/+server.ts`

**Chat Mode Request:**
```json
{
  "mode": "chat",
  "messages": [
    {
      "role": "user",
      "content": "string"
    }
  ],
  "settings": {
    "model": "string",
    "apiKey": "string",
    "endpoint": "string"
  },
  "currentColumns": [],
  "projectDescription": "string",
  "multiRowExtraction": false,
  "documentAnalyses": [],
  "featureFlags": {}
}
```

**Execute Mode Request:**
```json
{
  "mode": "execute",
  "toolDecisions": [
    {
      "toolCallId": "string",
      "approved": true
    }
  ],
  "currentColumns": [],
  "projectDescription": "string",
  "featureFlags": {}
}
```

**Tool Categories:**
- **Approval-Required:** `add_column`, `edit_column`, `remove_column`, `update_project_description`, `set_multi_row_mode`, `set_feature_flags`
- **Special UI:** `ask_questions`, `request_example_image`
- **Auto-Execute:** `get_current_schema`, `get_project_settings`, `get_feature_flags`, `analyze_document`

**Response:**
```json
{
  "success": true,
  "pendingTools": [],
  "questions": [],
  "imageRequests": [],
  "autoExecuteResults": {},
  "assistantMessage": "string"
}
```

---

### LLM Proxy

#### POST /api/proxy-models

Fetch available models from LLM providers.

**File:** `src/routes/api/proxy-models/+server.ts`

**Request Body:**
```json
{
  "endpoint": "string",
  "apiKey": "string"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| endpoint | string | Yes | LLM API endpoint |
| apiKey | string | No | API authentication key |

**Notes:**
- Automatically converts endpoints (e.g., `/chat/completions` to `/models`)
- Supports various LLM providers (OpenAI, Anthropic, etc.)

**Response:**
```json
{
  "success": true,
  "models": [
    {
      "id": "gpt-4",
      "name": "GPT-4"
    }
  ]
}
```

---

## PocketBase Collections

### Collections Overview

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

---

### image_batches

| Field | Type | Description |
|-------|------|-------------|
| status | select | 'pending', 'processing', 'review', 'approved', 'failed' |
| project | relation | References projects collection |
| row_count | number | Count of extraction rows |
| processed_data | json | Structured extraction results |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

---

### extraction_rows

| Field | Type | Description |
|-------|------|-------------|
| status | select | 'pending', 'review', 'approved', 'deleted' |
| batch | relation | References image_batches |
| project | relation | References projects |
| row_data | json | Extraction results for row |
| row_index | number | Row position (0-based) |
| approved_at | date | Approval timestamp |
| deleted_at | date | Deletion timestamp |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

---

### queue_jobs

| Field | Type | Description |
|-------|------|-------------|
| type | select | 'process_batch', 'reprocess_batch', 'process_redo' |
| status | select | 'queued', 'processing', 'completed', 'failed', 'retrying' |
| data | json | Job-specific data |
| priority | number | Lower = higher priority |
| projectId | text | Project reference |
| attempts | number | Current attempt count |
| maxAttempts | number | Maximum retry attempts |
| createdAt | date | Creation timestamp |
| startedAt | date | Processing start timestamp |
| completedAt | date | Completion timestamp |
| error | text | Error message if failed |

---

### processing_metrics

| Field | Type | Description |
|-------|------|-------------|
| jobType | select | 'process_batch', 'process_redo' |
| status | select | 'success', 'failed' |
| durationMs | number | Execution time in milliseconds |
| imageCount | number | Number of images processed |
| extractionCount | number | Number of extractions performed |
| modelUsed | text | LLM model identifier |
| tokensUsed | number | Token consumption |
| batchId | text | Batch reference |
| projectId | text | Project reference |

---

### projects

| Field | Type | Description |
|-------|------|-------------|
| name | text | Project name |
| description | text | Project description |
| user | relation | Project owner reference |
| settings | json | Extraction and prompt settings |
| schema_chat_history | json | Assistant conversation history |

---

## Server-Side Utilities

### QueueManager Class

**File:** `src/lib/server/queue/queue-manager.ts`

Singleton managing job queue persistence via PocketBase.

**Key Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `enqueue()` | `job: Partial<QueueJob>` | `Promise<QueueJob>` | Create new job |
| `enqueueBatch()` | `batchId, projectId, priority` | `Promise<QueueJob>` | Queue single batch |
| `enqueueMultipleBatches()` | `batchIds, projectId, priority` | `Promise<QueueJob[]>` | Queue multiple batches |
| `getJob()` | `jobId: string` | `Promise<QueueJob \| null>` | Retrieve job by ID |
| `getStats()` | `projectId?: string` | `Promise<QueueStats>` | Get queue statistics |
| `cancelQueuedJobs()` | `projectId, batchIds?` | `Promise<number>` | Cancel jobs |
| `retryFailed()` | `jobId: string` | `Promise<void>` | Retry single failed job |
| `retryAllFailed()` | `projectId: string` | `Promise<void>` | Retry all failed jobs |

---

### QueueWorker Class

**File:** `src/lib/server/queue/worker.ts`

Background job processor.

**Responsibilities:**
- Monitors queue_jobs collection
- Processes jobs sequentially (maxConcurrency=1)
- Converts PDFs to images
- Calls LLM for data extraction
- Updates batch and extraction_row statuses
- Tracks metrics in processing_metrics collection
- Cleans up stale batches on startup

**Key Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `start()` | - | `void` | Begin processing |
| `stop()` | - | `Promise<void>` | Gracefully shutdown |
| `processLoop()` | - | `Promise<void>` | Main job processing loop |
| `cleanupStaleBatches()` | - | `Promise<void>` | Recover from crashes |

---

### ConnectionPool Class

**File:** `src/lib/server/queue/connection-pool.ts`

Rate limiting and concurrency control.

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| maxConcurrency | number | 1 | Concurrent requests |
| requestsPerMinute | number | 30 | Rate limit |

**Methods:**

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `execute<T>()` | `fn: () => Promise<T>` | `Promise<T>` | Queue request with rate limiting |
| `getStats()` | - | `PoolStats` | Current pool statistics |
| `updateConfig()` | `config: Partial<Config>` | `void` | Adjust limits at runtime |

---

### Queue Module Exports

**File:** `src/lib/server/queue/index.ts`

| Export | Description |
|--------|-------------|
| `getQueueManager()` | Get/create QueueManager singleton |
| `getWorker()` | Get/create QueueWorker singleton |
| `startWorker()` | Start background processing |
| `stopWorker()` | Stop background processing |

---

### PDF Converter

**File:** `src/lib/server/pdf/pdf-converter.ts`

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `convertPdfToImages()` | `file, options` | `Promise<Page[]>` | Batch conversion with progress |
| `convertPdfToImagesAsync()` | `file, options, callbacks` | `AsyncGenerator<Page>` | Streaming conversion |
| `isPdfFile()` | `file: File` | `boolean` | File type validation |
| `formatFileSize()` | `bytes: number` | `string` | Utility formatting |

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| scale | number | Resolution multiplier |
| maxWidth | number | Maximum width in pixels |
| maxHeight | number | Maximum height in pixels |
| format | 'png' \| 'jpeg' | Output format |
| quality | number | Compression level (0-1) |

---

## Type Definitions

### Queue Types

**File:** `src/lib/server/queue/types.ts`

```typescript
type JobType = 'process_batch' | 'reprocess_batch' | 'process_redo';

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying';

interface QueueJob {
  id: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  data: ProcessBatchJobData | ProcessRedoJobData;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  projectId: string;
}

interface ProcessBatchJobData {
  batchId: string;
  projectId: string;
}

interface ProcessRedoJobData {
  batchId: string;
  projectId: string;
  rowIndex: number;
  redoColumnIds: string[];
  croppedImageIds: Record<string, string>;
  sourceImageIds?: Record<string, string>;
}

interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  totalJobs: number;
}

interface WorkerConfig {
  maxConcurrency: number;
  requestsPerMinute: number;
  retryDelayMs: number;
  maxRetries: number;
}
```

---

### Extraction Types

**File:** `src/lib/types/extraction.ts`

```typescript
interface ExtractionFeatureFlags {
  boundingBoxes: boolean;
  confidenceScores: boolean;
  multiRowExtraction: boolean;
  toonOutput: boolean;
}

interface ExtractionResult {
  column_id: string;
  column_name: string;
  value: string;
  image_index: number;
  bbox_2d?: BoundingBox;
  confidence?: number;
  row_index?: number;
  redone?: boolean;
}

interface ColumnDefinition {
  id: string;
  name: string;
  type: string;
  description?: string;
  allowedValues?: string[];
  regex?: string;
}
```

---

### Schema Chat Types

**File:** `src/lib/server/schema-chat/types.ts`

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  approved: boolean;
}

interface Column {
  id: string;
  name: string;
  type: string;
  description?: string;
  allowedValues?: string[];
  regex?: string;
}

interface Question {
  id: string;
  text: string;
  type: 'text' | 'select' | 'multiselect';
  options?: string[];
}

interface DocumentAnalysis {
  id: string;
  summary: string;
  documentType: string;
  identifiedFields: string[];
  timestamp: string;
}
```

---

### Tool Argument Types

**File:** `src/lib/server/schema-chat/tools.ts`

```typescript
interface AddColumnArgs {
  name: string;
  type: string;
  description?: string;
  allowedValues?: string[];
  regex?: string;
}

interface EditColumnArgs {
  column_id: string;
  updates: Partial<AddColumnArgs>;
}

interface RemoveColumnArgs {
  column_id: string;
}

interface UpdateProjectDescriptionArgs {
  description: string;
}

interface SetMultiRowModeArgs {
  enabled: boolean;
  reason?: string;
}

interface SetFeatureFlagsArgs {
  boundingBoxes?: boolean;
  confidenceScores?: boolean;
  toonOutput?: boolean;
  reason?: string;
}

interface AskQuestionsArgs {
  questions: Question[];
}

interface RequestExampleImageArgs {
  message: string;
  lookingFor: string;
}

interface AnalyzeDocumentArgs {
  summary: string;
  documentType: string;
  identifiedFields: string[];
}
```

---

## Authentication

### Hook Handler

**File:** `src/hooks.server.ts`

The server hook handler manages authentication for all requests:

1. Initializes PocketBase instance per request
2. Loads auth from cookies
3. Validates and refreshes tokens
4. Redirects unauthenticated users (except public routes)
5. Syncs auth state back to cookies

**Public Routes (no auth required):**
- `/login`
- `/register`
- `/logout`
- `/api/*`
- `/_app/*`
- `/favicon`

---

### Admin Authentication Pattern

Used in batch and queue management endpoints:

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);
await pb.collection('_superusers').authWithPassword(
  process.env.POCKETBASE_ADMIN_EMAIL,
  process.env.POCKETBASE_ADMIN_PASSWORD
);
```

**Environment Variables:**
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`
- `PUBLIC_POCKETBASE_URL`

---

### PocketBase Configuration

**File:** `src/lib/config/pocketbase.ts`

Intelligent endpoint resolution:

| Environment | Resolution |
|-------------|------------|
| Client (browser) | `window.location.origin` with Vite/nginx proxy |
| Server (local) | Direct connection to PocketBase |
| Server (Docker) | Uses service name `backend:8090` |
| Fallback | `http://127.0.0.1:8090` |

---

## Data Flow

### Batch Processing Pipeline

```
1. User uploads images/PDFs
   |
   v
2. API converts PDFs to images (POST /api/pdf/convert)
   |
   v
3. Creates image_batches record
   |
   v
4. POST /api/queue/enqueue
   |
   v
5. Creates queue_jobs record
   |
   v
6. QueueWorker picks up job
   |
   v
7. Extracts images -> Calls LLM with schema
   |
   v
8. Creates extraction_rows records
   |
   v
9. Updates batch with results
   |
   v
10. Records metrics in processing_metrics
    |
    v
11. User reviews via UI
    |
    v
12. POST /api/batches/status to approve/reject
```

---

### Schema Design Pipeline

```
1. User opens Schema Chat
   |
   v
2. POST /api/schema-chat (mode='chat')
   |
   v
3. LLM responds with tool calls
   |
   v
4. Client categorizes tools:
   - Pending approval
   - Questions for user
   - Auto-execute
   |
   v
5. User approves/answers
   |
   v
6. POST /api/schema-chat (mode='execute')
   |
   v
7. Tools update project schema and settings
```

---

## Response Patterns

### Standard Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "status": 400
}
```

### Content Types

| API | Request | Response |
|-----|---------|----------|
| Queue/Batch APIs | `application/json` | `application/json` |
| PDF Conversion | `multipart/form-data` | `application/json` |
| Schema Chat | `application/json` | `application/json` |

---

## Validation Rules

| Rule | Values |
|------|--------|
| Batch Status | 'pending', 'review', 'approved', 'failed' |
| Job Priority | Numeric (lower = higher priority, default: 10) |
| PDF Files | Must be valid PDF (validated by `isPdfFile()`) |
| Feature Flags | Boolean toggles |
| Tool Names | Must match defined tool list |
| Column IDs | Generated client-side (timestamp + random) |
