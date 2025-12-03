# PDF Upload & Conversion - Implementation Guide

## Overview

PDF upload functionality has been added to your multi-row extraction system. PDFs are automatically converted to images in the browser before upload, allowing Vision LLMs (Qwen3-VL, Gemini 2.0) to process them.

## How It Works

```
User uploads PDF → Browser converts to images → Images uploaded to PocketBase → Multi-row extraction works normally
```

### Technical Flow

1. **User selects PDF file** via upload button
2. **Browser conversion** (using pdf.js):
   - Each PDF page is rendered to a Canvas element
   - Canvas is converted to PNG image
   - Image File objects created for each page
3. **Images added to gallery** with "PDF" badge
4. **Upload proceeds** as normal (images uploaded to PocketBase)
5. **Worker processes images** with multi-row extraction
6. **Qwen3-VL does OCR** internally and extracts data

## Files Modified/Created

### Created Files

1. **`/src/lib/utils/pdf-converter.ts`**
   - Main PDF conversion utility
   - Uses pdf.js library
   - Handles page rendering, scaling, and image creation

### Modified Files

1. **`/src/routes/(app)/projects/[id]/images/add/+page.svelte`**
   - Added PDF file input support
   - Added conversion progress UI
   - Added visual indicators for PDF pages
   - Updated file handling logic

2. **`/package.json`**
   - Added `pdfjs-dist` dependency

## Features

### Auto-Conversion
- PDFs automatically detected and converted
- No user action required beyond selecting the file
- Progress bar shows conversion status

### Visual Indicators
- PDF-converted pages show blue "PDF" badge
- Original PDF filename preserved in metadata
- Each page displayed in preview grid

### Configuration Options

Default settings in `pdf-converter.ts`:
```typescript
{
  scale: 2.0,          // Render quality (higher = better quality, larger file)
  maxWidth: 2000,      // Maximum width in pixels
  maxHeight: 2000,     // Maximum height in pixels
  format: 'png',       // Output format (png or jpeg)
  quality: 0.95        // JPEG quality (if using jpeg)
}
```

To adjust these, edit line 85-92 in `/src/routes/(app)/projects/[id]/images/add/+page.svelte`.

## Testing

### Test 1: Single Page PDF
1. Create a simple 1-page PDF (e.g., a receipt)
2. Go to upload page for a project
3. Click "Upload Images or PDFs"
4. Select the PDF
5. **Expected**:
   - Progress overlay appears: "Converting PDF to Images"
   - Toast: "Converted 1 pages from filename.pdf"
   - Image appears in grid with blue "PDF" badge
6. Submit and verify processing works

### Test 2: Multi-Page PDF (Bank Statement)
1. Get a bank statement PDF with multiple transactions (3-5 pages ideal)
2. Ensure project has `extraction_mode: 'multi_row'`
3. Select prompt template: "Qwen3 VL (Multi-Row)" or "Gemini 2.0 (Multi-Row)"
4. Upload the PDF
5. **Expected**:
   - Progress shows: "Page 1 of 5", "Page 2 of 5", etc.
   - Toast: "Converted 5 pages from statement.pdf"
   - 5 images appear in grid, each with "PDF" badge
6. Submit batch
7. **Expected**:
   - Worker processes all 5 images
   - Multi-row extraction detects all transactions across all pages
   - extraction_rows created for each transaction
8. Go to review page and verify all transactions visible
9. Approve and check results page

### Test 3: Mixed Upload (Images + PDFs)
1. Select 2 image files (JPG/PNG) + 1 PDF (2 pages)
2. Upload together
3. **Expected**:
   - 2 images added immediately
   - PDF converted (progress shown)
   - Final result: 4 images in grid (2 regular + 2 with PDF badge)

### Test 4: Large PDF
1. Upload a PDF with 20+ pages
2. **Expected**:
   - Conversion completes (may take 10-30 seconds depending on PDF size)
   - All pages converted successfully
   - No browser crashes or freezes

### Test 5: Error Handling
1. Try uploading a corrupted/invalid PDF
2. **Expected**:
   - Error toast: "Failed to convert filename.pdf: [error message]"
   - Other files (if any) still processed

## Troubleshooting

### Issue: "Failed to load PDF worker"

**Cause**: pdf.js worker not loading from CDN

**Fix**: Update worker source in `pdf-converter.ts` line 8:
```typescript
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
```

Or host the worker file yourself and update the path.

### Issue: Conversion is slow

**Cause**: High scale factor or large PDFs

**Solutions**:
1. Reduce scale (line 87): `scale: 1.5` instead of `2.0`
2. Reduce max dimensions (lines 88-89): `maxWidth: 1500, maxHeight: 1500`
3. Use JPEG instead of PNG (line 90): `format: 'jpeg'`

### Issue: Converted images have poor quality

**Cause**: Scale too low

**Solution**: Increase scale to `2.5` or `3.0` for better quality

### Issue: Browser runs out of memory

**Cause**: Too many pages at high resolution

**Solutions**:
1. Process PDFs in batches (split large PDFs)
2. Reduce scale and max dimensions
3. Use JPEG format with lower quality

### Issue: PDF pages not rendering correctly

**Cause**: Complex PDF with custom fonts or vector graphics

**Solutions**:
1. Try re-saving the PDF with standard fonts
2. Convert PDF to images externally and upload images directly
3. Check pdf.js version compatibility

## Performance Considerations

### Conversion Speed
- **1-page PDF**: ~1-2 seconds
- **5-page PDF**: ~5-10 seconds
- **20-page PDF**: ~20-40 seconds
- **50-page PDF**: ~1-2 minutes

### Memory Usage
Each page consumes approximately:
- Scale 1.0: ~2-5 MB
- Scale 2.0: ~8-20 MB
- Scale 3.0: ~18-45 MB

**Recommendation**: For PDFs with 50+ pages, consider splitting into multiple batches or reducing scale.

## Configuration Options

### Adjust Conversion Settings

Edit `/src/routes/(app)/projects/[id]/images/add/+page.svelte`, lines 85-92:

```typescript
const convertedPages = await convertPdfToImages(
	pdfFile,
	{
		scale: 2.0,           // Increase for better quality (1.0 - 4.0)
		maxWidth: 2000,       // Max width in pixels
		maxHeight: 2000,      // Max height in pixels
		format: 'png',        // 'png' or 'jpeg'
		quality: 0.95         // JPEG quality (0.0 - 1.0)
	},
	(progress) => {
		pdfConversionProgress = progress;
	}
);
```

### Quality vs Size Trade-offs

**Best Quality** (large files):
```typescript
{ scale: 3.0, maxWidth: 3000, maxHeight: 3000, format: 'png' }
```

**Balanced** (recommended):
```typescript
{ scale: 2.0, maxWidth: 2000, maxHeight: 2000, format: 'png' }
```

**Fastest/Smallest** (lower quality):
```typescript
{ scale: 1.5, maxWidth: 1500, maxHeight: 1500, format: 'jpeg', quality: 0.85 }
```

## Multi-Row Extraction with PDFs

### Bank Statement Example

1. **Upload**: Bank statement PDF (5 pages, 50 transactions total)
2. **Conversion**: 5 PNG images created
3. **Processing**: Worker processes all 5 images as one batch
4. **Extraction**: Qwen3-VL extracts all 50 transactions with row_index
5. **Database**: 50 extraction_rows records created
6. **Review**: User sees all 50 rows with edit/delete/redo controls
7. **Results**: Export CSV with all 50 rows

### Prompt Engineering for PDFs

Use multi-row prompts (already configured):
- **Qwen3 VL (Multi-Row)**: Instructs LLM to use row_index field
- **Gemini 2.0 (Multi-Row)**: Same instructions with different coordinate format

The prompts include examples showing how to handle multiple items per page AND across multiple pages.

## Limitations

### Browser-Side Conversion
- **Pro**: No server load, fast for small PDFs
- **Con**: Large PDFs may freeze browser

### PDF.js Limitations
- Supports PDF 1.3 - 2.0
- Some complex PDFs may not render perfectly
- Encrypted/password-protected PDFs not supported

### Alternative: Server-Side Conversion

If browser-side conversion is too slow or unreliable, consider implementing server-side conversion:

1. Upload PDF to PocketBase
2. Server endpoint converts using:
   - Node.js: `pdf-poppler` or `pdf2pic`
   - Python: `pdf2image` (requires poppler)
3. Return converted images to frontend

This would require creating a new API endpoint and modifying the upload flow.

## User Experience

### What Users See

1. **Upload button text**: "Upload Images or PDFs"
2. **File picker**: Accepts both images and PDFs
3. **During conversion**:
   - Overlay: "Converting PDF to Images"
   - Progress: "Page X of Y"
   - Progress bar showing percentage
4. **After conversion**:
   - Toast: "Converted N pages from filename.pdf"
   - Images in grid with blue "PDF" badge
5. **In review**:
   - No visible difference (PDF pages look like regular images)
   - Multi-row extraction shows all data

### Mobile Support

- PDF conversion works on mobile browsers
- May be slower on older devices
- Recommend limiting to 10-page PDFs on mobile

## Future Enhancements

### Potential Improvements

1. **PDF page selection**: Let users select which pages to convert
2. **OCR preview**: Show extracted text before processing
3. **Server-side fallback**: If browser conversion fails, upload for server conversion
4. **Batch processing**: Process large PDFs in chunks to prevent freezing
5. **PDF metadata extraction**: Preserve PDF metadata (author, creation date, etc.)
6. **Direct PDF support**: Send PDF directly to Vision LLM (if API supports it)

## Summary

PDF upload is now fully integrated with your multi-row extraction system. Users can upload bank statements, invoices, receipts, or any document as PDF, and the system automatically converts them to images for processing. The multi-row extraction logic works seamlessly with PDF-converted images, extracting all transactions/items across all pages.

**Key Files**:
- `/src/lib/utils/pdf-converter.ts` - Conversion logic
- `/src/routes/(app)/projects/[id]/images/add/+page.svelte` - Upload UI

**Key Dependencies**:
- `pdfjs-dist` - PDF rendering library

**Testing**: Follow the testing guide above to verify all functionality works correctly.
