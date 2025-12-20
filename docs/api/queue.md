# Queue Management API

Endpoints for managing the job queue system for batch processing.

## Endpoints

- [POST /api/queue/enqueue](#post-apiqueueenqueue) - Enqueue batch processing jobs
- [GET /api/queue/status/[jobId]](#get-apiqueuestatusjobid) - Get job status
- [POST /api/queue/retry](#post-apiqueueretry) - Retry failed jobs
- [POST /api/queue/redo](#post-apiqueueredo) - Redo specific rows
- [POST /api/queue/cancel](#post-apiqueuecancel) - Cancel queued jobs
- [GET /api/queue/stats](#get-apiqueuestats) - Get queue statistics
- [GET /api/queue/metrics](#get-apiqueuemetrics) - Get processing metrics

---

## POST /api/queue/enqueue

Enqueue batch processing jobs.

**File:** `src/routes/api/queue/enqueue/+server.ts`

### Request Body

```json
{
  "batchId": "string",
  "batchIds": ["string"],
  "projectId": "string",
  "priority": 10
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| batchId | string | No | - | Single batch ID to enqueue |
| batchIds | string[] | No | - | Multiple batch IDs to enqueue |
| projectId | string | Yes | - | Project identifier |
| priority | number | No | 10 | Job priority (lower = higher priority) |

### Response

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

## GET /api/queue/status/[jobId]

Get individual job status.

**File:** `src/routes/api/queue/status/[jobId]/+server.ts`

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| jobId | string | The job ID to query |

### Response

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

## POST /api/queue/retry

Retry failed jobs.

**File:** `src/routes/api/queue/retry/+server.ts`

### Request Body

```json
{
  "jobId": "string",
  "projectId": "string",
  "retryAll": false
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| jobId | string | No | Single job ID to retry |
| projectId | string | Yes | Project identifier |
| retryAll | boolean | No | Retry all failed jobs for the project |

### Response

```json
{
  "success": true,
  "message": "string"
}
```

---

## POST /api/queue/redo

Enqueue redo processing jobs for specific rows.

**File:** `src/routes/api/queue/redo/+server.ts`

### Request Body

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

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| batchId | string | Yes | - | Batch identifier |
| projectId | string | Yes | - | Project identifier |
| rowIndex | number | Yes | - | Row to redo (0-based) |
| redoColumnIds | string[] | Yes | - | Column IDs to reprocess |
| croppedImageIds | Record<string, string> | Yes | - | Mapping of column to image IDs |
| sourceImageIds | Record<string, string> | No | - | Optional source image mappings |
| priority | number | No | 5 | Job priority |

### Response

```json
{
  "success": true,
  "jobId": "string",
  "message": "string"
}
```

---

## POST /api/queue/cancel

Cancel queued/processing jobs.

**File:** `src/routes/api/queue/cancel/+server.ts`

### Request Body

```json
{
  "projectId": "string",
  "batchIds": ["string"]
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | Yes | Project identifier |
| batchIds | string[] | No | Specific batches to cancel (all if omitted) |

### Response

```json
{
  "success": true,
  "canceledCount": 0,
  "batchesReset": 0,
  "message": "string"
}
```

---

## GET /api/queue/stats

Get queue statistics.

**File:** `src/routes/api/queue/stats/+server.ts`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | No | Filter stats to specific project |

### Response

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

## GET /api/queue/metrics

Get processing metrics and statistics.

**File:** `src/routes/api/queue/metrics/+server.ts`

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | No | Filter to specific project |
| timeRange | string | No | `24h`, `7d`, `30d`, or `all` |

### Response

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
