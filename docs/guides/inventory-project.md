# Tutorial: Inventory Tracking

A quick example of single-row extraction using your phone camera.

**This tutorial uses:** Single-row extraction, Batch upload

**Prerequisite:** Read [Core Concepts](./concepts.md) first.

## The Goal

Catalog seed packets (or any physical items) by photographing them. Each item becomes one row of data.

## Setup

### 1. Create Project

Create a new project called "Seed Inventory".

### 2. Configure Schema

Add these columns:

| Name | Type | Description |
|------|------|-------------|
| Variety | text | `The seed variety name, e.g., "Roma Tomato"` |
| Brand | text | `The seed company name` |
| Category | text | `Plant type` (Allowed values: Vegetable, Herb, Flower) |
| Days to Germinate | number | `Days until germination. If shown as range, use average.` |

### 3. Configure Processing

- Multi-Row Extraction: **OFF** (one item per batch)
- Confidence Scores: **ON**

### 4. Select API/Model

Any vision model works. Gemini 2.0 Flash is a good balance of speed and accuracy.

## Capture Items

On your phone:

1. Open the project
2. Tap the camera icon
3. Use **Add Batch** tab (not Bulk Upload)
4. Photograph the **front** of a seed packet
5. Photograph the **back** (if needed info is there)
6. Tap **Process Images**

Both photos go into one batch and produce one row.

### Quick Capture Workflow

```
Packet 1:  [Front] + [Back]  -->  Submit  -->  Row 1
Packet 2:  [Front] + [Back]  -->  Submit  -->  Row 2
Packet 3:  [Front] + [Back]  -->  Submit  -->  Row 3
```

### Using Bulk Upload Instead

If each photo shows a COMPLETE item (all info visible in one shot):

1. Switch to **Bulk Upload** tab
2. Select multiple photos
3. Each photo becomes its own batch automatically

## Review and Export

1. Go to **Review** page
2. Check extracted values against the image
3. Edit any mistakes directly
4. Swipe right to approve
5. Export CSV from **Results** page

## Adapting for Other Items

| Item Type | Schema Example |
|-----------|----------------|
| Tools | Name, Brand, Model Number, Condition, Location |
| Books | Title, Author, ISBN, Publisher, Year |
| Pantry | Item, Brand, Expiration Date, Quantity |

The same workflow applies: photograph items, extract data, export.
