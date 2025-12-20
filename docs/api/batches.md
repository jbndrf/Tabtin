# Batch Management API

Endpoints for managing batch status and deletion.

## Endpoints

- [POST /api/batches/status](#post-apibatchesstatus) - Change batch status
- [POST /api/batches/delete](#post-apibatchesdelete) - Delete batches

---

## POST /api/batches/status

Change batch status with extraction_rows sync.

**File:** `src/routes/api/batches/status/+server.ts`

### Request Body

```json
{
  "batchIds": ["string"],
  "targetStatus": "pending",
  "projectId": "string"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| batchIds | string[] | Yes | Batch IDs to update |
| targetStatus | string | Yes | `pending`, `review`, `approved`, or `failed` |
| projectId | string | Yes | Project identifier |

### Features

- Syncs extraction_rows status with batch status
- Manages row data clearing when reverting to pending
- Sets approval timestamps when approving

### Response

```json
{
  "success": true,
  "successCount": 0,
  "failCount": 0,
  "message": "string"
}
```

---

## POST /api/batches/delete

Delete batches with all related data.

**File:** `src/routes/api/batches/delete/+server.ts`

### Request Body

```json
{
  "batchIds": ["string"],
  "projectId": "string"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| batchIds | string[] | Yes | Batch IDs to delete |
| projectId | string | Yes | Project identifier |

### Cascading Deletes

When a batch is deleted, the following related data is also removed:

1. **extraction_rows** - All extraction rows related to the batches
2. **images** - All images associated with the batches
3. **batch records** - The batch records themselves

### Response

```json
{
  "success": true,
  "successCount": 0,
  "failCount": 0,
  "message": "string"
}
```

---

## Status Transitions

```
pending -> processing -> review -> approved
                      -> failed

approved -> pending (revert)
review -> pending (revert)
failed -> pending (retry)
```

### Status Descriptions

| Status | Description |
|--------|-------------|
| `pending` | Batch is waiting to be processed |
| `processing` | Batch is currently being processed |
| `review` | Processing complete, awaiting user review |
| `approved` | User has approved the extracted data |
| `failed` | Processing failed with an error |
