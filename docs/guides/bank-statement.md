# Tutorial: Bank Statement Extraction

A quick example of multi-row extraction from a PDF.

**This tutorial uses:** Multi-row extraction, PDF processing

**Prerequisite:** Read [Core Concepts](./concepts.md) first.

## The Goal

Extract all transactions from a bank statement PDF. Each transaction becomes one row.

```
  +------------------------+        +------------------------+
  |    Bank Statement      |        |      47 ROWS           |
  |------------------------|        |------------------------|
  | Jan 2  Grocery    -$45 |        | Row 1: Jan 2, -$45     |
  | Jan 3  Gas        -$32 | -----> | Row 2: Jan 3, -$32     |
  | Jan 4  Deposit   +$500 |        | Row 3: Jan 4, +$500    |
  | ...46 more rows...     |        | ...                    |
  +------------------------+        +------------------------+
```

## Setup

### 1. Create Project

Create a project called "Bank Transactions".

### 2. Configure Schema

| Name | Type | Description |
|------|------|-------------|
| Date | date | `Transaction date, usually first column` |
| Description | text | `Merchant name or transaction description` |
| Amount | currency | `Transaction amount. Negative for withdrawals.` |
| Type | text | `Debit, Credit, Transfer, or Fee` (use Allowed Values) |

### 3. Configure Processing

- **Multi-Row Extraction: ON** (this is the key setting)
- DPI: 300-400 (bank statements often have small text)
- Format: PNG
- Include OCR Text: ON

### 4. Select Model

Larger models work better for tables:
- Qwen 2.5 VL 72B (best accuracy)
- Gemini 2.0 Flash (good balance)

## Process the Statement

1. Click **Add Batch**
2. Upload the PDF
3. All pages are processed together as one batch
4. AI extracts each transaction as a separate row

## Review

Multi-row review shows one row at a time:

1. Navigate between rows using the row counter
2. Verify each transaction against the source
3. Edit values if needed
4. Approve when done

## Handling Issues

| Problem | Solution |
|---------|----------|
| Missing transactions | Try higher DPI, or larger model |
| Wrong values | Edit directly, or use Redo feature |
| Duplicates | Remove after export in spreadsheet |

## Other Multi-Row Use Cases

| Document Type | Schema |
|---------------|--------|
| Invoice line items | Item, Quantity, Unit Price, Total |
| Receipt items | Item, Price, Quantity |
| Inventory list | SKU, Name, Stock Count, Location |

Same approach: enable multi-row, define columns for each item, process.
