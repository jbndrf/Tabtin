# Tips and Tricks

This guide covers best practices for getting the most accurate extraction results and optimizing your workflow.

## Choosing the Right AI Model

Different models have different strengths. Here's how to pick one:

### Understanding Model Sizes

AI models come in different sizes. Larger models are smarter but slower and cost more. The number in the name (like "72B" or "7B") indicates size - bigger numbers mean larger models.

| Size | What it means | Tradeoff |
|------|---------------|----------|
| Large (70B+) | Most accurate, understands complex layouts | Slower, higher cost |
| Medium | Good balance of speed and accuracy | Works well for most documents |
| Small (7-8B) | Fast and cheap | May miss details or make more mistakes |

### Recommended Models

| Model | Size | Speed | Accuracy | Cost | Best for |
|-------|------|-------|----------|------|----------|
| Qwen 2.5 VL 72B | Large | Slower | Highest | Higher | Complex documents, detailed tables |
| Gemini 2.0 Flash | Medium | Fast | Good | Moderate | General use, high volume |
| Claude 3.5 Sonnet | Large | Moderate | High | Higher | Documents needing interpretation |
| Gemini Flash 1.5 8B | Small | Fast | Good | Lower | Budget-conscious processing |
| Qwen 2.5 VL 7B | Small | Fast | Good | Lower | Testing, simple documents |

### When Accuracy Matters Most

For important documents (financial records, legal text):
- Use a larger model
- Turn on confidence scores to flag uncertain extractions
- Review all results manually
- Consider processing the same document with two different models and comparing results

## Writing Effective Column Descriptions

The description field is your main way to guide the AI. Good descriptions lead to better results.

### Be Specific About Location

**Good:**
```
The invoice number, usually found in the top right corner near the date.
Format is typically "INV-" followed by numbers.
```

**Less effective:**
```
Invoice number
```

### Explain Ambiguous Cases

**Good:**
```
The total amount including tax. If multiple totals are shown
(subtotal, tax, total), extract the final grand total.
```

**Less effective:**
```
Total amount
```

### Provide Format Examples

**Good:**
```
The date in any format (e.g., "Jan 15, 2024", "2024-01-15", "15/01/2024").
Convert to YYYY-MM-DD format.
```

**Less effective:**
```
The date
```

### Handle Missing Data

**Good:**
```
The warranty period if mentioned. If not explicitly stated,
return null rather than guessing.
```

**Less effective:**
```
Warranty
```

## Using Allowed Values Effectively

Allowed values constrain the AI to specific options:

### When to Use

- Categories with fixed options (type, status, priority)
- Yes/No or True/False fields
- Predefined codes or classifications

### How to Format

Enter values as comma-separated list:
```
Small, Medium, Large, Extra Large
```

Or for codes:
```
A, B, C, D, F
```

### Handling Edge Cases

If values outside the list might appear, add a catch-all:
```
Checking, Savings, Money Market, Other
```

## Validating Extracted Data

You can tell the AI what format you expect for each field. There are two ways to do this:

### Option 1: Describe the Format in Plain Language (Recommended)

The simplest approach is to describe what you want in the **Description** field. The AI understands plain language instructions.

| Instead of technical patterns... | Write this in the Description field |
|----------------------------------|-------------------------------------|
| Phone number validation | "Phone number in format 555-123-4567" |
| ZIP code validation | "ZIP code like 12345 or 12345-6789" |
| Date validation | "Date in YYYY-MM-DD format (e.g., 2024-01-15)" |
| Email validation | "Email address like user@example.com" |
| Invoice number format | "Invoice number starting with INV- followed by numbers" |

This approach works well for most users and doesn't require any technical knowledge.

### Option 2: Regex Patterns (For Technical Users)

If you're familiar with regular expressions, you can use the **Regex** field for strict validation. This is optional and most users can skip it.

<details>
<summary>Click to expand regex patterns (technical)</summary>

| Use Case | Pattern |
|----------|---------|
| Phone (US) | `^\d{3}-\d{3}-\d{4}$` |
| Email | `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| ZIP Code | `^\d{5}(-\d{4})?$` |
| Date (ISO) | `^\d{4}-\d{2}-\d{2}$` |
| Currency | `^\$?[\d,]+\.?\d{0,2}$` |
| Invoice # | `^INV-\d+$` |

Test patterns at regex101.com before using them.
</details>

## Optimizing PDF Settings

PDF settings affect how well the AI can read your documents:

### DPI (Image Sharpness)

| DPI | When to use | Tradeoff |
|-----|-------------|----------|
| 150 | Large, clear text | Faster, cheaper, but may miss fine details |
| 300 | Most documents | Good balance - start here |
| 400 | Small text, detailed tables | Slower, more expensive, but more accurate |
| 600 | Tiny text, complex forms | Much slower and more expensive |

**Start at 300.** Only increase if the AI is missing text or making mistakes.

### Format (PNG vs JPEG)

| Format | Best for | Tradeoff |
|--------|----------|----------|
| PNG | Documents with text | Sharper text, but larger files |
| JPEG | Photos, simple images | Smaller files, but text may be slightly blurry |

**Use PNG for documents.** Only use JPEG if you need to reduce costs.

### JPEG Quality

If using JPEG:
- **90-100%**: Almost as good as PNG
- **70-89%**: Smaller files, text still readable
- **Below 70%**: Text may become hard to read

### Max Dimensions

This limits how large the image can be:
- **1024px**: Good for most documents (default)
- **2048px**: Better for detailed documents, but slower
- **768px or less**: Faster and cheaper, but may lose detail

## When to Use Feature Flags

### Bounding Boxes

**Enable when:**
- You need to see where data was found in the document
- Debugging extraction issues
- Building visual review interfaces

**Disable when:**
- Simple inventory/cataloging
- You don't need visual feedback
- Optimizing for speed/cost

### Confidence Scores

**Enable when:**
- Processing important documents
- You want to flag uncertain extractions
- Quality control is important

**Disable when:**
- High-confidence use cases (clear, consistent documents)
- You'll review everything anyway

### Multi-Row Extraction

**Enable when:**
- Documents contain tables or lists
- Multiple similar items per document
- Transaction logs, invoices with line items

**Disable when:**
- One item per document (most photos)
- Extracting header-level information only

## Using the Schema Chat Assistant

The Schema Chat AI helps you design your schema:

### How to Use It

1. Open project settings
2. Click the chat bubble button in the bottom right corner
3. Upload a sample document
4. Describe what you want to extract
5. The AI suggests columns based on your document

### Tips for Best Results

**Provide context:**
```
This is a seed packet. I want to track the variety name,
brand, planting instructions, and days to germination.
```

**Ask for refinements:**
```
The "Days to Germination" is often shown as a range like "7-14 days".
How should I handle this?
```

**Upload multiple samples:**
- Different layouts
- Edge cases
- Documents with missing information

## Batch vs Bulk Upload

### Batch Mode (Default)

All selected files become one batch:
- AI sees all images together
- Good for related documents (multi-page invoice)
- Processing happens as a unit

**Use when:**
- Documents belong together
- Multi-page PDFs
- Related photos

### Bulk Mode

Each file becomes a separate batch:
- Each document processed independently
- Faster parallel processing
- No context between documents

**Use when:**
- Processing many independent documents
- Each photo is a separate item
- High-volume cataloging

## Rate Limiting and Timeouts

### Requests Per Minute

Controls how fast you send requests to the API:

| Setting | Impact |
|---------|--------|
| 5-10 | Conservative, avoids rate limits |
| 15-30 | Balanced (most providers) |
| 50+ | Aggressive, may hit limits |

Check your API provider's limits and set accordingly.

### Parallel Requests

When enabled:
- Multiple images process simultaneously
- Faster overall completion
- Higher API usage rate

**Enable when:**
- Processing large batches
- API provider allows parallel requests
- Speed is important

**Disable when:**
- Hitting rate limits
- Debugging extraction issues
- Need sequential processing

### Request Timeout

How long to wait for the API:
- **1-3 minutes:** Standard for most requests
- **5-10 minutes:** Complex documents, large images
- **Longer:** Very large PDFs, slow providers

If requests timeout frequently:
1. Reduce image size (lower DPI or max dimensions)
2. Split large PDFs into smaller batches
3. Increase timeout setting

## Common Issues and Solutions

### Extraction Missing Fields

**Possible causes:**
- Field not visible in image
- Description not specific enough
- Wrong image selected (multi-image batch)

**Solutions:**
- Improve column description
- Add image_index hints in description
- Check image quality

### Incorrect Values

**Possible causes:**
- Similar values in document (wrong one selected)
- OCR errors
- Model confusion

**Solutions:**
- Add location hints ("in the top right corner")
- Use allowed values to constrain options
- Try a different model

### Slow Processing

**Possible causes:**
- Large images
- High DPI settings
- Slow API provider

**Solutions:**
- Reduce DPI
- Compress images (JPEG)
- Lower max dimensions
- Enable parallel requests

### High API Costs

**Ways to reduce costs:**
- Use smaller models (7B vs 72B)
- Reduce image resolution
- Disable unused features (bounding boxes)
- Process similar documents together

## Next Steps

Ready to put these tips into practice?

- [Inventory Tracking Tutorial](./inventory-project.md) - Apply these tips to a real project
- [Bank Statement Tutorial](./bank-statement.md) - Learn multi-row extraction
