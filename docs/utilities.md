# Server-Side Utilities

Server utilities for queue management, job processing, and PDF conversion.

## QueueManager

**File:** `src/lib/server/queue/queue-manager.ts`

Singleton managing job queue persistence via PocketBase.

### Methods

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

### Usage Example

```typescript
import { getQueueManager } from '$lib/server/queue';

const queueManager = getQueueManager();

// Enqueue a single batch
const job = await queueManager.enqueueBatch('batch_123', 'project_456', 10);

// Enqueue multiple batches
const jobs = await queueManager.enqueueMultipleBatches(
  ['batch_1', 'batch_2', 'batch_3'],
  'project_456',
  10
);

// Get queue statistics
const stats = await queueManager.getStats('project_456');
console.log(`Queued: ${stats.queued}, Processing: ${stats.processing}`);

// Cancel all queued jobs for a project
const canceledCount = await queueManager.cancelQueuedJobs('project_456');
```

---

## QueueWorker

**File:** `src/lib/server/queue/worker.ts`

Background job processor that monitors and processes queue jobs.

### Responsibilities

- Monitors `queue_jobs` collection for new jobs
- Processes jobs sequentially (maxConcurrency=1)
- Converts PDFs to images
- Calls LLM for data extraction
- Updates batch and extraction_row statuses
- Tracks metrics in `processing_metrics` collection
- Cleans up stale batches on startup

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `start()` | - | `void` | Begin processing |
| `stop()` | - | `Promise<void>` | Gracefully shutdown |
| `processLoop()` | - | `Promise<void>` | Main job processing loop |
| `cleanupStaleBatches()` | - | `Promise<void>` | Recover from crashes |

### Configuration

```typescript
interface WorkerConfig {
  maxConcurrency: number;    // Default: 1
  requestsPerMinute: number; // Default: 30
  retryDelayMs: number;      // Default: 5000
  maxRetries: number;        // Default: 3
}
```

### Usage Example

```typescript
import { startWorker, stopWorker, getWorker } from '$lib/server/queue';

// Start the worker
startWorker();

// Get worker instance for status checks
const worker = getWorker();
const isRunning = worker.isRunning;

// Gracefully stop the worker
await stopWorker();
```

---

## ConnectionPool

**File:** `src/lib/server/queue/connection-pool.ts`

Rate limiting and concurrency control for LLM API calls.

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| maxConcurrency | number | 1 | Maximum concurrent requests |
| requestsPerMinute | number | 30 | Rate limit per minute |

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `execute<T>()` | `fn: () => Promise<T>` | `Promise<T>` | Queue request with rate limiting |
| `getStats()` | - | `PoolStats` | Current pool statistics |
| `updateConfig()` | `config: Partial<Config>` | `void` | Adjust limits at runtime |

### Usage Example

```typescript
import { ConnectionPool } from '$lib/server/queue/connection-pool';

const pool = new ConnectionPool({
  maxConcurrency: 2,
  requestsPerMinute: 60
});

// Execute with rate limiting
const result = await pool.execute(async () => {
  return await callLLMApi(prompt);
});

// Get current stats
const stats = pool.getStats();
console.log(`Active: ${stats.active}, Queued: ${stats.queued}`);

// Update configuration at runtime
pool.updateConfig({ requestsPerMinute: 120 });
```

---

## Queue Module Exports

**File:** `src/lib/server/queue/index.ts`

| Export | Description |
|--------|-------------|
| `getQueueManager()` | Get/create QueueManager singleton |
| `getWorker()` | Get/create QueueWorker singleton |
| `startWorker()` | Start background processing |
| `stopWorker()` | Stop background processing |

---

## PDF Converter

**File:** `src/lib/server/pdf-converter.ts`

Utilities for converting PDF files to images at 600 DPI.

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `convertPdfToImages()` | `pdfBuffer, fileName, options?, onProgress?` | `Promise<ConvertedPage[]>` | Batch conversion with progress callback |
| `convertPdfToImagesAsync()` | `pdfBuffer, fileName, options?` | `Promise<ConvertedPage[]>` | Worker-based conversion (non-blocking) |
| `isPdfFile()` | `fileName: string` | `boolean` | File type validation by extension |
| `formatFileSize()` | `bytes: number` | `string` | Utility formatting |

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| scale | number | 8.333 | Resolution multiplier (8.333 = 600 DPI) |
| maxWidth | number | 7100 | Maximum width in pixels (A4 at 600 DPI) |
| maxHeight | number | 7100 | Maximum height in pixels (A4 at 600 DPI) |
| format | string | `png` | Output format (`png` or `jpeg`) |
| quality | number | 1.0 | Compression level (0-1) |

### ConvertedPage Interface

```typescript
interface ConvertedPage {
  pageNumber: number;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  extractedText: string;
}
```

### Usage Example

```typescript
import { convertPdfToImages, isPdfFile } from '$lib/server/pdf-converter';

// Validate file
if (!isPdfFile(fileName)) {
  throw new Error('Invalid PDF file');
}

// Convert PDF to images
const pages = await convertPdfToImages(pdfBuffer, fileName, {
  scale: 8.333,
  format: 'png',
  maxWidth: 7100
}, (progress) => {
  console.log(`Converting page ${progress.currentPage}/${progress.totalPages}`);
});

// Process each page
for (const page of pages) {
  console.log(`Page ${page.pageNumber}: ${page.fileName}`);
  // page.buffer contains the image data
  // page.extractedText contains OCR text from the page
}
```

### Worker-based Conversion (Non-blocking)

```typescript
import { convertPdfToImagesAsync } from '$lib/server/pdf-converter';

// Use worker thread for non-blocking conversion
const pages = await convertPdfToImagesAsync(pdfBuffer, fileName, options);
```

---

## AddonManager

**File:** `src/lib/server/addons/manager.ts`

Singleton orchestrating addon lifecycle management.

### Methods

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `install()` | `userId, dockerImage` | `Promise<InstalledAddon>` | Build and install addon |
| `start()` | `addonId` | `Promise<InstalledAddon>` | Start stopped addon |
| `stop()` | `addonId` | `Promise<InstalledAddon>` | Stop running addon |
| `uninstall()` | `addonId` | `Promise<void>` | Remove addon completely |
| `updateConfig()` | `addonId, config` | `Promise<InstalledAddon>` | Update configuration |
| `call()` | `addonId, endpoint, method, data` | `Promise<T>` | Call addon endpoint |
| `getLogs()` | `addonId, tail` | `Promise<string>` | Get container logs |
| `listForUser()` | `userId` | `Promise<InstalledAddon[]>` | List user's addons |
| `get()` | `addonId` | `Promise<InstalledAddon>` | Get addon by ID |
| `getByManifestId()` | `manifestId, userId` | `Promise<InstalledAddon>` | Get by manifest ID |
| `syncStatus()` | `addonId` | `Promise<void>` | Sync with container status |

See [Addon Documentation](./addons/index.md) for detailed usage.

---

## Docker Utilities

**File:** `src/lib/server/addons/docker.ts`

Low-level Docker container management functions.

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `buildImage()` | `imageName, force` | `Promise<void>` | Build Docker image |
| `createContainer()` | `config` | `Promise<string>` | Create and start container |
| `startContainer()` | `containerId` | `Promise<void>` | Start container |
| `stopContainer()` | `containerId` | `Promise<void>` | Stop container |
| `removeContainer()` | `containerId` | `Promise<void>` | Remove container |
| `removeImage()` | `imageName` | `Promise<void>` | Remove Docker image |
| `removeAddonData()` | `addonId, userId` | `Promise<void>` | Delete data directory |
| `fetchManifest()` | `internalUrl` | `Promise<AddonManifest>` | Get manifest from container |
| `waitForHealth()` | `internalUrl, maxAttempts` | `Promise<void>` | Poll health endpoint |
| `getContainerStatus()` | `containerId` | `Promise<string>` | Get container status |
| `getContainerLogs()` | `containerId, tail` | `Promise<string>` | Get container logs |
| `listAvailableAddons()` | - | `Promise<AvailableAddon[]>` | Scan addons directory |
