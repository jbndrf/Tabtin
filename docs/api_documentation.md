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
7. [Addon System](#addon-system)
   - [Architecture Overview](#architecture-overview)
   - [Addon API Endpoints](#addon-api-endpoints)
   - [Writing Addons](#writing-addons)
   - [Addon Manifest Reference](#addon-manifest-reference)
   - [Addon Types](#addon-types)
   - [Communication Bridge](#communication-bridge)
   - [Security Model](#security-model)
   - [Example Addon](#example-addon)

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

**File:** `src/lib/server/pdf-converter.ts`

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `convertPdfToImages()` | `pdfBuffer, fileName, options?, onProgress?` | `Promise<ConvertedPage[]>` | Batch conversion with progress callback |
| `convertPdfToImagesAsync()` | `pdfBuffer, fileName, options?` | `Promise<ConvertedPage[]>` | Worker-based conversion (non-blocking) |
| `isPdfFile()` | `fileName: string` | `boolean` | File type validation by extension |
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
  value: string | null;
  image_index: number;
  bbox_2d?: [number, number, number, number];
  confidence?: number;
  row_index?: number;
  redone?: boolean;
}

interface ColumnDefinition {
  id: string;
  name: string;
  type: string;
  description?: string;
  allowedValues?: string;
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
| Batch Status | 'pending', 'processing', 'review', 'approved', 'failed' |
| Job Priority | Numeric (lower = higher priority, default: 10) |
| PDF Files | Must be valid PDF (validated by `isPdfFile()`) |
| Feature Flags | Boolean toggles |
| Tool Names | Must match defined tool list |
| Column IDs | Generated client-side (timestamp + random) |

---

## Addon System

The addon system provides a Docker-based plugin architecture for extending the application with isolated, containerized extensions. Addons run in separate containers and communicate with the main application through a secure proxy and postMessage bridge.

### Table of Contents (Addons)

1. [Architecture Overview](#architecture-overview)
2. [Addon API Endpoints](#addon-api-endpoints)
3. [Writing Addons](#writing-addons)
4. [Addon Manifest Reference](#addon-manifest-reference)
5. [Addon Types](#addon-types)
6. [Communication Bridge](#communication-bridge)
7. [Security Model](#security-model)
8. [Example Addon](#example-addon)

---

### Architecture Overview

```
+-------------------+     +------------------+     +-------------------+
|   Browser/Client  |     |   Main Server    |     |  Addon Container  |
|                   |     |                  |     |                   |
| +---------------+ |     | +------------+   |     | +-------------+   |
| | iframe        |------>| | Proxy API  |------->| | Express App |   |
| | (addon UI)    |<------| | /api/addons|<-------| |             |   |
| +---------------+ |     | +------------+   |     | +-------------+   |
|        |          |     |       |          |     |       |           |
|        | postMsg  |     | +------------+   |     | /manifest.json    |
|        |          |     | | Addon      |   |     | /health           |
|        v          |     | | Manager    |   |     | /[endpoints]      |
| +---------------+ |     | +------------+   |     +-------------------+
| | Bridge Utils  | |     |       |          |
| | (addon-bridge)|<----->| +------------+   |
| +---------------+ |     | | Docker API |   |
|                   |     | +------------+   |
+-------------------+     +------------------+
```

**Key Components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| Addon Manager | `src/lib/server/addons/manager.ts` | Orchestrates addon lifecycle |
| Docker Utils | `src/lib/server/addons/docker.ts` | Container management |
| API Routes | `src/routes/api/addons/` | REST API for addon operations |
| Addon Bridge | `src/lib/utils/addon-bridge.ts` | postMessage communication |
| Addon Stores | `src/lib/stores/addons.ts` | Client-side state management |
| Addon Types | `src/lib/types/addon.ts` | TypeScript interfaces |

---

### Addon API Endpoints

#### GET /api/addons

List all installed addons for the authenticated user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "user": "user_id",
      "name": "Paperless-ngx Import",
      "docker_image": "tabtin-addon-paperless-ngx",
      "container_id": "docker_container_id",
      "container_status": "running",
      "internal_url": "http://127.0.0.1:9001",
      "manifest": { ... },
      "config": { ... },
      "created": "2024-01-01T00:00:00Z",
      "updated": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/addons

Install a new addon.

**Request Body:**
```json
{
  "dockerImage": "tabtin-addon-paperless-ngx"
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| dockerImage | string | Yes | Docker image name (must start with `tabtin-addon-`) |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Paperless-ngx Import",
    "container_status": "running",
    ...
  }
}
```

**Installation Flow:**
1. Validates image name format
2. Builds Docker image from `addons/[addon-name]/Dockerfile`
3. Creates PocketBase record with status `building`
4. Creates and starts container
5. Polls `/health` endpoint until ready
6. Fetches `/manifest.json` from container
7. Updates record with manifest and status `running`

---

#### GET /api/addons/available

List addons available for installation.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "paperless-ngx",
      "name": "tabtin-addon-paperless-ngx",
      "path": "/path/to/addons/paperless-ngx"
    }
  ]
}
```

---

#### GET /api/addons/[id]

Get details for a specific addon.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Addon database record ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Paperless-ngx Import",
    "container_status": "running",
    "manifest": { ... },
    "config": { ... },
    ...
  }
}
```

---

#### PUT /api/addons/[id]

Update addon configuration.

**Request Body:**
```json
{
  "config": {
    "paperless_url": "https://paperless.example.com",
    "paperless_token": "your-api-token"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Configuration updated. Restart the addon to apply changes."
}
```

**Note:** Configuration changes require an addon restart to take effect.

---

#### DELETE /api/addons/[id]

Uninstall an addon.

**Response:**
```json
{
  "success": true,
  "message": "Addon uninstalled"
}
```

**Cleanup Actions:**
- Stops and removes Docker container
- Removes Docker image
- Deletes addon data directory
- Deletes PocketBase record

---

#### POST /api/addons/[id]/start

Start a stopped addon.

**Response:**
```json
{
  "success": true,
  "data": {
    "container_status": "running",
    ...
  }
}
```

---

#### POST /api/addons/[id]/stop

Stop a running addon.

**Response:**
```json
{
  "success": true,
  "data": {
    "container_status": "stopped",
    ...
  }
}
```

---

#### GET /api/addons/[id]/logs

Get container logs.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tail | number | 100 | Number of log lines to retrieve |

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": "log output here..."
  }
}
```

---

#### POST /api/addons/[id]/call

Call an addon endpoint via the secure proxy.

**Request Body:**
```json
{
  "endpoint": "/documents",
  "method": "GET",
  "data": { "query": "search term" }
}
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| endpoint | string | Yes | - | Addon endpoint path |
| method | string | No | GET | HTTP method |
| data | object | No | - | Request body for POST/PUT |

**Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

---

#### GET/POST /api/addons/proxy/[addonId]/[...path]

Direct proxy to addon endpoints. Used by addon iframes for API calls.

**Headers Added by Proxy:**
- `X-Tabtin-Auth`: Secure auth token for addon verification

**Response:** Proxied response from addon container.

---

### Writing Addons

#### Directory Structure

Create a new addon in the `addons/` directory:

```
addons/
  my-addon/
    Dockerfile           # Required: Container build instructions
    manifest.json        # Required: Addon metadata and configuration
    package.json         # Node.js dependencies
    server.js            # Main application entry point
    ui/                  # Static frontend files
      index.html
      app.js
      styles.css
```

---

#### Dockerfile Requirements

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create data directory for persistent storage
RUN mkdir -p /data

# Expose the port from manifest
EXPOSE 8081

# Health check (required)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8081/health || exit 1

# Start the server
CMD ["node", "server.js"]
```

**Requirements:**
- Must expose the port specified in manifest
- Must include a health check
- Should create `/data` directory for persistent storage

---

#### Server Requirements

Your server must implement these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check, return 200 OK |
| `/manifest.json` | GET | Serve the addon manifest |

**Authentication:**
- Check `X-Tabtin-Auth` header against `TABTIN_AUTH_TOKEN` environment variable
- Skip auth for `/health` and `/manifest.json`
- Skip auth for static UI files if needed

**Example Server (Node.js/Express):**

```javascript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Config from environment
const config = {
  myConfigValue: process.env.ADDON_MY_CONFIG_KEY,
  authToken: process.env.TABTIN_AUTH_TOKEN
};

// Auth middleware
const authenticate = (req, res, next) => {
  if (req.path === '/health' || req.path === '/manifest.json') {
    return next();
  }
  if (req.path.startsWith('/ui/')) {
    return next();
  }

  const token = req.headers['x-tabtin-auth'];
  if (token !== config.authToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

app.use(authenticate);

// Required endpoints
app.get('/health', (req, res) => res.sendStatus(200));
app.get('/manifest.json', (req, res) => {
  res.sendFile(join(__dirname, 'manifest.json'));
});

// Serve static UI files
app.use('/ui', express.static(join(__dirname, 'ui')));

// Your custom endpoints
app.get('/my-endpoint', async (req, res) => {
  try {
    // Your logic here
    res.json({ success: true, data: { ... } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
});
```

---

#### Environment Variables

The following environment variables are passed to addon containers:

| Variable | Description |
|----------|-------------|
| `TABTIN_AUTH_TOKEN` | Secure token for authenticating requests from main app |
| `TABTIN_ADDON_ID` | Database record ID of this addon |
| `PORT` | Port number from manifest |
| `ADDON_*` | Config values (uppercase key with `ADDON_` prefix) |

**Example:** If `config_schema` has `paperless_url`, it becomes `ADDON_PAPERLESS_URL`.

---

### Addon Manifest Reference

The manifest defines your addon's metadata, capabilities, and configuration.

```json
{
  "id": "my-addon",
  "name": "My Custom Addon",
  "version": "1.0.0",
  "description": "Description of what this addon does",
  "port": 8081,

  "endpoints": [
    {
      "path": "/my-endpoint",
      "method": "GET",
      "description": "Description of this endpoint"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "main-page",
        "label": "My Addon",
        "icon": "FileText",
        "href": "/addons/my-addon/main",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "main",
        "path": "/main",
        "title": "My Addon Main Page"
      }
    ]
  },

  "config_schema": {
    "api_url": {
      "type": "string",
      "title": "API URL",
      "description": "Base URL for the external API",
      "required": true
    },
    "api_token": {
      "type": "string",
      "title": "API Token",
      "secret": true,
      "required": true
    },
    "max_results": {
      "type": "number",
      "title": "Max Results",
      "default": 100,
      "required": false
    },
    "enabled": {
      "type": "boolean",
      "title": "Enable Feature",
      "default": true
    },
    "mode": {
      "type": "select",
      "title": "Operation Mode",
      "options": ["fast", "balanced", "thorough"],
      "default": "balanced"
    }
  }
}
```

#### Manifest Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique addon identifier (used in URLs) |
| name | string | Yes | Display name |
| version | string | Yes | Semantic version |
| description | string | No | Brief description |
| port | number | Yes | Port the addon listens on |
| endpoints | array | No | API endpoints provided |
| ui | object | No | UI components (menus, pages) |
| config_schema | object | No | Configuration form schema |

#### Menu Sections

| Section | Description |
|---------|-------------|
| `main` | Main navigation section |
| `projects` | Project-related items |
| `footer` | Footer/settings section |

#### Config Field Types

| Type | Description | Additional Properties |
|------|-------------|-----------------------|
| `string` | Text input | - |
| `number` | Numeric input | - |
| `boolean` | Checkbox/toggle | - |
| `select` | Dropdown | `options: string[]` |

**Secret fields:** Set `secret: true` to render as password input (values are hidden in UI).

---

### Addon Types

```typescript
// Addon manifest
interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  port: number;
  endpoints?: AddonEndpoint[];
  ui?: AddonUI;
  config_schema?: Record<string, AddonConfigField>;
}

interface AddonEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description?: string;
}

interface AddonUI {
  menuItems?: AddonMenuItem[];
  pages?: AddonPage[];
}

interface AddonMenuItem {
  id: string;
  label: string;
  icon?: string;
  href: string;
  section: 'main' | 'projects' | 'footer';
}

interface AddonPage {
  id: string;
  path: string;
  title: string;
}

interface AddonConfigField {
  type: 'string' | 'number' | 'boolean' | 'select';
  title: string;
  description?: string;
  secret?: boolean;
  required?: boolean;
  default?: string | number | boolean;
  options?: string[]; // For select type
}

// Container status
type AddonContainerStatus =
  | 'pending'
  | 'building'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'failed';

// Installed addon record
interface InstalledAddon {
  id: string;
  user: string;
  name: string;
  docker_image: string;
  container_id?: string;
  container_status: AddonContainerStatus;
  internal_url?: string;
  manifest?: AddonManifest;
  config?: Record<string, unknown>;
  auth_token?: string;
  error_message?: string;
  created: string;
  updated: string;
}

// Context passed to addon iframes
interface AddonContext {
  addonId: string;
  userId: string;
  projectId?: string;
  batchId?: string;
  [key: string]: unknown;
}

// File data for transfers
interface AddonFileData {
  filename: string;
  mimeType: string;
  base64: string;
}

// Panel sizes
type AddonPanelSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

// Panel state
interface AddonPanelState {
  addonId: string;
  path: string;
  title?: string;
  size: AddonPanelSize;
}

// API request/response
interface AddonCallRequest {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: unknown;
}

interface AddonCallResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

### Communication Bridge

Addons run in iframes and communicate with the main app via `postMessage`.

#### Message Types

```typescript
type AddonMessage =
  | { type: 'TOAST'; payload: { message: string; variant?: 'success' | 'error' | 'info' } }
  | { type: 'NAVIGATE'; payload: { path: string } }
  | { type: 'REFRESH' }
  | { type: 'OPEN_PANEL'; payload: { path: string; title?: string; size?: AddonPanelSize } }
  | { type: 'CLOSE_PANEL' }
  | { type: 'ADDON_FILES'; payload: { files: AddonFileData[] } };
```

#### Sending Messages from Addon UI

```javascript
// In your addon's frontend JavaScript

// Show a toast notification
window.parent.postMessage({
  type: 'TOAST',
  payload: { message: 'Document imported successfully', variant: 'success' }
}, '*');

// Navigate to a main app route
window.parent.postMessage({
  type: 'NAVIGATE',
  payload: { path: '/projects/abc123' }
}, '*');

// Refresh the current page
window.parent.postMessage({ type: 'REFRESH' }, '*');

// Open a floating panel with addon content
window.parent.postMessage({
  type: 'OPEN_PANEL',
  payload: { path: '/details', title: 'Document Details', size: 'lg' }
}, '*');

// Close the floating panel
window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');

// Send files to the main app
window.parent.postMessage({
  type: 'ADDON_FILES',
  payload: {
    files: [{
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      base64: 'base64-encoded-content...'
    }]
  }
}, '*');
```

#### Handling File Transfers

Listen for `addon-files-received` custom event in your main app components:

```javascript
window.addEventListener('addon-files-received', (event) => {
  const { files, addonId } = event.detail;
  // Process the files
  files.forEach(file => {
    console.log(`Received ${file.filename} from addon ${addonId}`);
  });
});
```

---

### Security Model

#### Authentication Flow

1. **Installation:** Addon receives unique `auth_token` (cryptographically secure random string)
2. **Runtime:** Main app's proxy adds `X-Tabtin-Auth` header to all requests
3. **Verification:** Addon validates token against `TABTIN_AUTH_TOKEN` environment variable

#### Isolation

| Measure | Description |
|---------|-------------|
| Docker containers | Each addon runs in isolated container |
| Resource limits | 512MB RAM, 50% CPU per container |
| Network | Bridge mode or custom network (no direct access to host) |
| Data isolation | Separate data directory per addon per user |

#### Iframe Sandbox

Addon iframes have restricted permissions:
- `allow-scripts` - Execute JavaScript
- `allow-same-origin` - Access cookies/storage
- `allow-forms` - Submit forms
- `allow-popups` - Open new windows

Other capabilities (top-navigation, downloads, etc.) are denied.

#### Origin Validation

The bridge validates postMessage origins against known addon internal URLs.

---

### PocketBase Collection

**Collection:** `installed_addons`

| Field | Type | Description |
|-------|------|-------------|
| id | text | Auto-generated PocketBase ID |
| user | relation | Reference to users collection |
| name | text | Addon display name |
| docker_image | text | Docker image name |
| container_id | text | Docker container ID |
| container_status | select | pending, building, starting, running, stopped, failed |
| internal_url | text | Internal container URL |
| manifest | json | Full manifest object |
| config | json | User configuration values |
| auth_token | text | Secure authentication token |
| error_message | text | Error details if failed |
| created | autodate | Creation timestamp |
| updated | autodate | Update timestamp |

**Access Rules:**
- Create: Authenticated users only
- View/Update/Delete: Owner only (`user.id = @request.auth.id`)

---

### Example Addon

Here's a complete example addon that integrates with an external service:

#### manifest.json

```json
{
  "id": "external-api",
  "name": "External API Integration",
  "version": "1.0.0",
  "description": "Import data from an external API",
  "port": 8081,

  "endpoints": [
    {
      "path": "/items",
      "method": "GET",
      "description": "List items from external API"
    },
    {
      "path": "/items/:id",
      "method": "GET",
      "description": "Get item details"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "browser",
        "label": "External API",
        "icon": "Cloud",
        "href": "/addons/external-api/browser",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "browser",
        "path": "/browser",
        "title": "External API Browser"
      }
    ]
  },

  "config_schema": {
    "api_url": {
      "type": "string",
      "title": "API URL",
      "description": "Base URL of the external API",
      "required": true
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "secret": true,
      "required": true
    }
  }
}
```

#### server.js

```javascript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

const config = {
  apiUrl: process.env.ADDON_API_URL,
  apiKey: process.env.ADDON_API_KEY,
  authToken: process.env.TABTIN_AUTH_TOKEN
};

// Auth middleware
const authenticate = (req, res, next) => {
  if (['/health', '/manifest.json'].includes(req.path)) {
    return next();
  }
  if (req.path.startsWith('/ui/') || req.path === '/browser') {
    return next();
  }

  if (req.headers['x-tabtin-auth'] !== config.authToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

app.use(authenticate);

// Required endpoints
app.get('/health', (req, res) => res.sendStatus(200));
app.get('/manifest.json', (req, res) => {
  res.sendFile(join(__dirname, 'manifest.json'));
});

// Static files and pages
app.use('/ui', express.static(join(__dirname, 'ui')));
app.get('/browser', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'browser.html'));
});

// Helper for external API calls
async function externalRequest(path) {
  const response = await fetch(`${config.apiUrl}${path}`, {
    headers: { 'Authorization': `Bearer ${config.apiKey}` }
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

// Custom endpoints
app.get('/items', async (req, res) => {
  try {
    const data = await externalRequest('/items');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/items/:id', async (req, res) => {
  try {
    const data = await externalRequest(`/items/${req.params.id}`);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`External API addon running on port ${PORT}`);
});
```

#### ui/browser.html

```html
<!DOCTYPE html>
<html>
<head>
  <title>External API Browser</title>
  <style>
    body { font-family: system-ui; padding: 20px; }
    .item { padding: 10px; border: 1px solid #ddd; margin: 5px 0; cursor: pointer; }
    .item:hover { background: #f5f5f5; }
    .btn { padding: 8px 16px; background: #0066cc; color: white; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <h1>External API Browser</h1>
  <div id="items"></div>

  <script>
    // Get context from query params
    const params = new URLSearchParams(window.location.search);
    const ctx = params.get('ctx') ? JSON.parse(params.get('ctx')) : {};

    // Base URL for API calls (through proxy)
    const API_BASE = `/api/addons/proxy/${ctx.addonId}`;

    async function loadItems() {
      const res = await fetch(`${API_BASE}/items`);
      const { data } = await res.json();

      const container = document.getElementById('items');
      container.innerHTML = data.map(item => `
        <div class="item" onclick="selectItem('${item.id}')">
          <strong>${item.name}</strong>
          <p>${item.description}</p>
        </div>
      `).join('');
    }

    function selectItem(id) {
      // Show toast
      window.parent.postMessage({
        type: 'TOAST',
        payload: { message: `Selected item ${id}`, variant: 'info' }
      }, '*');

      // Open panel with details
      window.parent.postMessage({
        type: 'OPEN_PANEL',
        payload: { path: `/details/${id}`, title: 'Item Details', size: 'md' }
      }, '*');
    }

    loadItems();
  </script>
</body>
</html>
```

#### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p /data
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8081/health || exit 1
CMD ["node", "server.js"]
```

---

### Client-Side Addon Store Functions

Available functions from `src/lib/stores/addons.ts`:

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `fetchAddons()` | - | `Promise<void>` | Fetch all installed addons |
| `installAddon()` | `dockerImage: string` | `Promise<InstalledAddon>` | Install new addon |
| `startAddon()` | `addonId: string` | `Promise<InstalledAddon>` | Start stopped addon |
| `stopAddon()` | `addonId: string` | `Promise<InstalledAddon>` | Stop running addon |
| `uninstallAddon()` | `addonId: string` | `Promise<void>` | Uninstall addon |
| `updateAddonConfig()` | `addonId, config` | `Promise<InstalledAddon>` | Update configuration |
| `callAddon()` | `addonId, endpoint, method?, data?` | `Promise<T>` | Call addon endpoint |
| `getAddonLogs()` | `addonId, tail?` | `Promise<string>` | Get container logs |
| `menuItemsForSection()` | `section: AddonMenuSection` | `AddonMenuItem[]` | Get menu items for section |
| `getAddonById()` | `addonId: string` | `InstalledAddon \| undefined` | Lookup by DB ID |
| `getAddonByManifestId()` | `manifestId: string` | `InstalledAddon \| undefined` | Lookup by manifest ID |
| `openAddonPanel()` | `addonId, path, title?, size?` | `void` | Open floating panel |
| `closeAddonPanel()` | - | `void` | Close floating panel |

---

### Container Lifecycle

```
Installation:
  pending -> building -> starting -> running
                                   -> failed (if error)

Runtime:
  running <-> stopped

Uninstall:
  * -> (removed)
```

**Status Transitions:**

| Status | Description | Next States |
|--------|-------------|-------------|
| pending | Initial state | building |
| building | Docker image being built | starting, failed |
| starting | Container starting up | running, failed |
| running | Container healthy and accepting requests | stopped |
| stopped | Container stopped by user | running (restart) |
| failed | Error occurred | (requires uninstall/reinstall) |

---

### Troubleshooting

#### Addon Not Starting

1. Check container logs: `GET /api/addons/[id]/logs`
2. Verify configuration values are correct
3. Ensure external services (if any) are reachable from container

#### Health Check Failing

1. Verify `/health` endpoint returns 200
2. Check PORT environment variable matches manifest port
3. Review container logs for startup errors

#### Authentication Errors

1. Ensure addon checks `X-Tabtin-Auth` header
2. Compare with `TABTIN_AUTH_TOKEN` environment variable
3. Skip auth for `/health` and `/manifest.json`

#### UI Not Loading

1. Verify UI page path matches manifest pages configuration
2. Check browser console for JavaScript errors
3. Ensure proxy URL format: `/api/addons/proxy/[addonId]/[path]`
