# Workflow Optimization Analysis

This document analyzes the complete workflow from project creation to CSV download, identifying optimization opportunities for PocketBase operations.

## Workflow Overview

```
Project Creation -> Settings Configuration -> Image Upload -> Batch Processing ->
Extraction -> Review/Approval -> Results View -> CSV Export
```

---

## Step 1: Project Creation

**Current Implementation:** `/src/lib/components/projects/create-project-dialog.svelte`

### How it works now:
- User creates project with name
- Single PocketBase record created in `projects` collection
- Initial settings stored as JSON field

### Analysis Status: PENDING VERIFICATION

---

## Step 2: Project Settings Configuration

**Current Implementation:** `/src/routes/(app)/projects/[id]/settings/+page.svelte`

### How it works now:
- User configures extraction columns, API settings, processing options
- All settings saved as JSON in `projects.settings` field
- Single update call to save all settings

### Analysis Status: PENDING VERIFICATION

---

## Step 3: Image Batch Upload

**Current Implementation:** `/src/routes/(app)/projects/[id]/images/add/+page.svelte`

### How it works now:
1. Create batch record with 'pending' status
2. Upload images one by one to `images` collection
3. Each image creates separate record with batch reference
4. Finally enqueue batch for processing

### Analysis Status: PENDING VERIFICATION

---

## Step 4: Queue Processing

**Current Implementation:**
- `/src/routes/api/queue/enqueue/+server.ts`
- `/src/lib/server/queue/queue-manager.ts`
- `/src/lib/server/queue/worker.ts`

### How it works now:
1. Create queue job record
2. Worker polls for jobs
3. Fetches batch and images
4. Converts PDFs, calls LLM
5. Creates extraction_rows records
6. Updates batch status

### Analysis Status: PENDING VERIFICATION

---

## Step 5: Extraction Row Creation

**Current Implementation:** Worker creates `extraction_rows` records

### How it works now:
- For each extracted row from LLM response
- Creates individual `extraction_rows` record
- Uses Promise.all for parallel creation

### Analysis Status: PENDING VERIFICATION

---

## Step 6: Review & Approval

**Current Implementation:** `/src/routes/(app)/projects/[id]/images/review/+page.svelte`

### How it works now:
1. Load all extraction_rows for batch with `getFullList`
2. User reviews and edits values
3. On approval, updates each row individually with Promise.all

### Analysis Status: PENDING VERIFICATION

---

## Step 7: Results Loading

**Current Implementation:**
- `/src/routes/(app)/projects/[id]/results/+page.svelte`
- `/src/lib/stores/project-data.ts`

### How it works now:
1. Load all approved extraction_rows with `getFullList`
2. Filter by `project` and `status = 'approved'`
3. Expand batch relation

### Analysis Status: PENDING VERIFICATION

---

## Step 8: CSV Export

**Current Implementation:** Client-side CSV generation

### How it works now:
- Uses already-loaded approved rows
- Generates CSV in browser
- Creates blob and triggers download

### Analysis Status: PENDING VERIFICATION

---

## Findings Summary

| Step | Status | Issues Found | Priority |
|------|--------|--------------|----------|
| 1. Project Creation | PENDING | - | - |
| 2. Settings Config | PENDING | - | - |
| 3. Image Upload | PENDING | - | - |
| 4. Queue Processing | PENDING | - | - |
| 5. Extraction Rows | PENDING | - | - |
| 6. Review/Approval | PENDING | - | - |
| 7. Results Loading | PENDING | - | - |
| 8. CSV Export | PENDING | - | - |

---

## Detailed Analysis

(Analysis will be added as each step is verified)

