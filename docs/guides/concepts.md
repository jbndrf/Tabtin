# Core Concepts

Before using the app, take 5 minutes to understand these concepts. They'll help you make the right choices for your documents.

## The Big Picture

This app extracts structured data from images and PDFs. You take a photo or upload a document, the AI reads it, and you get organized data you can export to a spreadsheet.

```
  Your Documents          AI Processing           Structured Data

  [Photo]                                         +----------------+
  [PDF]       ------>     AI extracts    ------>  | Name | Price   |
  [Scan]                  the data                | Roma | $2.99   |
                                                  +----------------+
```

## What is a Batch?

A **batch** is a group of images that belong together. The AI processes all images in a batch as one unit.

**The key rule:** All images in one batch = one extraction job.

```
    [Photo 1]     [Photo 2]     [Photo 3]
      Front         Back         Detail
         \           |           /
          \          |          /
           v         v         v
         +---------------------+
         |        BATCH        |
         +---------------------+
                   |
                   v
              AI processes
              all images
              together
```

**Why does this matter?**

If you're photographing a seed packet, the variety name might be on the front and the planting instructions on the back. Put both photos in the same batch so the AI can see everything and extract complete information.

## Single-Row vs Multi-Row Extraction

This is the most important choice you'll make for each project.

### Single-Row Extraction (Default)

One batch produces **one row** of data.

```
  +------------------+              +------------------+
  |   Seed Packet    |              |      1 ROW       |
  |------------------|    ----->    |------------------|
  |  Roma Tomato     |              | Variety: Roma    |
  |  Burpee Seeds    |              | Brand: Burpee    |
  +------------------+              | Days: 7-10       |
                                    +------------------+
```

**Use for:**
- Inventory items (one photo per item)
- Single invoices (extracting header info like invoice number, date, total)
- Business cards
- Product labels
- Any document representing ONE thing

### Multi-Row Extraction

One batch produces **multiple rows** of data - one row per item found in the document.

```
  +------------------------+        +------------------------+
  |    Bank Statement      |        |        4 ROWS          |
  |------------------------|        |------------------------|
  | Jan 2  Grocery    -$45 |        | Row 1: Jan 2, -$45     |
  | Jan 3  Gas        -$32 | -----> | Row 2: Jan 3, -$32     |
  | Jan 4  Deposit   +$500 |        | Row 3: Jan 4, +$500    |
  | Jan 5  Electric   -$89 |        | Row 4: Jan 5, -$89     |
  +------------------------+        +------------------------+
```

**Use for:**
- Bank statements (each transaction = one row)
- Invoices with line items (each product = one row)
- Receipts with itemized purchases
- Tables in documents
- Any document containing a LIST of similar items

### Quick Decision Guide

| Your Document | Contains | Use |
|---------------|----------|-----|
| Seed packet | One item | Single-row |
| Product photo | One item | Single-row |
| Invoice header | One set of info | Single-row |
| Bank statement | Multiple transactions | Multi-row |
| Receipt | Multiple items | Multi-row |
| Invoice line items | Multiple products | Multi-row |
| Spreadsheet photo | Multiple rows | Multi-row |

## Batch Upload vs Bulk Upload

These are two different ways to add images to your project.

### Batch Upload (Default)

All selected images go into **one batch** together.

```
   [Front]  [Back]
       \      /
        \    /
         v  v
      +---------+
      | 1 Batch |
      +---------+
           |
           v
      +---------+
      |  1 Row  |  (or multiple rows if multi-row is enabled)
      +---------+
```

**Use when:** You have multiple photos of the SAME item (front, back, details).

### Bulk Upload

Each selected image becomes its **own separate batch**.

```
   [Item 1] [Item 2] [Item 3]
       |        |        |
       v        v        v
   Batch 1  Batch 2  Batch 3
       |        |        |
       v        v        v
    Row 1    Row 2    Row 3
```

**Use when:** Each photo is a DIFFERENT item and you want to process many at once.

### Combining the Options

You can combine batch/bulk upload with single/multi-row extraction:

| Upload Mode | Extraction Mode | Result |
|-------------|-----------------|--------|
| Batch | Single-row | All photos = 1 row |
| Batch | Multi-row | All photos analyzed together, extracts multiple rows from content |
| Bulk | Single-row | Each photo = 1 row |
| Bulk | Multi-row | Each photo analyzed separately, each can produce multiple rows |

## Common Scenarios

### Scenario 1: Cataloging Seed Packets

You have 50 seed packets. Each packet has info on front and back.

**Setup:**
- Multi-row: OFF (each packet = one row)
- Upload: Use Batch mode for each packet

**Workflow:**
1. Photograph front and back of packet 1
2. Submit batch (creates 1 row)
3. Photograph front and back of packet 2
4. Submit batch (creates 1 row)
5. Repeat...

### Scenario 2: Processing Bank Statements

You have a 3-page bank statement PDF with 47 transactions.

**Setup:**
- Multi-row: ON (each transaction = one row)
- Upload: Upload the PDF as one batch

**Workflow:**
1. Upload the PDF
2. AI extracts all 47 transactions as separate rows
3. Review and export

### Scenario 3: Quick Product Inventory

You have 100 product photos. Each photo shows one complete product.

**Setup:**
- Multi-row: OFF (each photo = one row)
- Upload: Use Bulk mode

**Workflow:**
1. Select all 100 photos at once
2. Bulk upload creates 100 separate batches
3. AI processes each independently
4. Review and export

## Next Steps

Now that you understand the concepts:

1. [Getting Started](./getting-started.md) - Set up your first project
2. [Inventory Tutorial](./inventory-project.md) - Single-row extraction example
3. [Bank Statement Tutorial](./bank-statement.md) - Multi-row extraction example
