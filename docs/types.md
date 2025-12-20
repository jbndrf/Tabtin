# Type Definitions

TypeScript interfaces and types used throughout the application.

## Queue Types

**File:** `src/lib/server/queue/types.ts`

### JobType

```typescript
type JobType = 'process_batch' | 'reprocess_batch' | 'process_redo';
```

| Value | Description |
|-------|-------------|
| `process_batch` | Initial batch processing |
| `reprocess_batch` | Reprocess existing batch |
| `process_redo` | Redo specific columns in a row |

### JobStatus

```typescript
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'retrying';
```

| Value | Description |
|-------|-------------|
| `queued` | Waiting in queue |
| `processing` | Currently being processed |
| `completed` | Successfully completed |
| `failed` | Failed after all retries |
| `retrying` | Failed, will retry |

### QueueJob

```typescript
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
```

### ProcessBatchJobData

```typescript
interface ProcessBatchJobData {
  batchId: string;
  projectId: string;
}
```

### ProcessRedoJobData

```typescript
interface ProcessRedoJobData {
  batchId: string;
  projectId: string;
  rowIndex: number;
  redoColumnIds: string[];
  croppedImageIds: Record<string, string>;
  sourceImageIds?: Record<string, string>;
}
```

### QueueStats

```typescript
interface QueueStats {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  totalJobs: number;
}
```

### WorkerConfig

```typescript
interface WorkerConfig {
  maxConcurrency: number;
  requestsPerMinute: number;
  retryDelayMs: number;
  maxRetries: number;
}
```

---

## Extraction Types

**File:** `src/lib/types/extraction.ts`

### ExtractionFeatureFlags

```typescript
interface ExtractionFeatureFlags {
  boundingBoxes: boolean;
  confidenceScores: boolean;
  multiRowExtraction: boolean;
  toonOutput: boolean;
}
```

| Flag | Description |
|------|-------------|
| `boundingBoxes` | Include bounding box coordinates |
| `confidenceScores` | Include confidence scores |
| `multiRowExtraction` | Extract multiple rows per image |
| `toonOutput` | Use Toon format output |

### ExtractionResult

```typescript
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
```

### ColumnDefinition

```typescript
interface ColumnDefinition {
  id: string;
  name: string;
  type: string;
  description?: string;
  allowedValues?: string;
  regex?: string;
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique column identifier |
| `name` | Display name |
| `type` | Data type (text, number, date, etc.) |
| `description` | Instructions for extraction |
| `allowedValues` | Comma-separated valid values for select types |
| `regex` | Validation pattern |

---

## Schema Chat Types

**File:** `src/lib/server/schema-chat/types.ts`

### ChatMessage

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}
```

### PendingToolCall

```typescript
interface PendingToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  status: 'pending' | 'approved' | 'declined' | 'executed';
  result?: {
    success: boolean;
    message: string;
    data?: unknown;
  };
}
```

### Column

```typescript
interface Column {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'currency' | 'boolean';
  description: string;
  allowedValues: string;
  regex: string;
  expanded?: boolean;
}
```

### Question

```typescript
interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

interface Question {
  id: string;
  header: string;
  questionText: string;
  options: QuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
}
```

### DocumentAnalysis

```typescript
interface DocumentAnalysis {
  id: string;
  timestamp: number;
  summary: string;
  documentType?: string;
  identifiedFields?: string[];
  imageCount: number;
}
```

---

## Tool Argument Types

**File:** `src/lib/server/schema-chat/tools.ts`

### AddColumnArgs

```typescript
interface AddColumnArgs {
  name: string;
  type: string;
  description?: string;
  allowedValues?: string[];
  regex?: string;
}
```

### EditColumnArgs

```typescript
interface EditColumnArgs {
  column_id: string;
  updates: Partial<AddColumnArgs>;
}
```

### RemoveColumnArgs

```typescript
interface RemoveColumnArgs {
  column_id: string;
}
```

### UpdateProjectDescriptionArgs

```typescript
interface UpdateProjectDescriptionArgs {
  description: string;
}
```

### SetMultiRowModeArgs

```typescript
interface SetMultiRowModeArgs {
  enabled: boolean;
  reason?: string;
}
```

### SetFeatureFlagsArgs

```typescript
interface SetFeatureFlagsArgs {
  boundingBoxes?: boolean;
  confidenceScores?: boolean;
  toonOutput?: boolean;
  reason?: string;
}
```

### AskQuestionsArgs

```typescript
interface AskQuestionsArgs {
  questions: Question[];
}
```

### RequestExampleImageArgs

```typescript
interface RequestExampleImageArgs {
  message: string;
  lookingFor: string;
}
```

### AnalyzeDocumentArgs

```typescript
interface AnalyzeDocumentArgs {
  summary: string;
  documentType: string;
  identifiedFields: string[];
}
```

---

## PDF Types

### PdfPage

```typescript
interface PdfPage {
  pageNumber: number;
  width: number;
  height: number;
  data: string; // Base64-encoded image
}
```

### PdfConversionOptions

```typescript
interface PdfConversionOptions {
  scale?: number;
  maxWidth?: number;
  maxHeight?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
}
```

---

## API Response Types

### ApiResponse

```typescript
interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### PaginatedResponse

```typescript
interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}
```

---

## Addon Types

See [Addon Types](./addons/types.md) for complete addon type definitions.
