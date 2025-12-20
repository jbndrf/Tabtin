# PDF Processing API

Endpoint for converting PDF files to images.

## POST /api/pdf/convert

Convert PDF to images.

**File:** `src/routes/api/pdf/convert/+server.ts`

### Request

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pdf | File | Yes | PDF file to convert |
| options | JSON string | No | Conversion options |

### Options Object

```json
{
  "dpi": 600,
  "maxWidth": 7100,
  "maxHeight": 7100,
  "format": "png",
  "quality": 100
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| dpi | number | 600 | Resolution in dots per inch |
| maxWidth | number | 7100 | Maximum width in pixels (A4 at 600 DPI) |
| maxHeight | number | 7100 | Maximum height in pixels (A4 at 600 DPI) |
| format | string | `png` | Output format (`png` or `jpeg`) |
| quality | number | 100 | Compression quality (0-100, for JPEG) |

### Response

```json
{
  "success": true,
  "pages": [
    {
      "pageNumber": 1,
      "fileName": "document_page_1.png",
      "mimeType": "image/png",
      "extractedText": "text extracted from page",
      "imageData": "base64-encoded-image",
      "size": 123456
    }
  ],
  "totalPages": 5
}
```

### Page Object

| Field | Type | Description |
|-------|------|-------------|
| pageNumber | number | 1-based page number |
| fileName | string | Suggested file name for the page |
| mimeType | string | MIME type of the image |
| extractedText | string | Text extracted from the PDF page |
| imageData | string | Base64-encoded image data |
| size | number | Size of the image in bytes |

---

## Usage Example

### JavaScript/Fetch

```javascript
const formData = new FormData();
formData.append('pdf', pdfFile);
formData.append('options', JSON.stringify({
  dpi: 200,
  format: 'png',
  quality: 0.95
}));

const response = await fetch('/api/pdf/convert', {
  method: 'POST',
  body: formData
});

const { pages, totalPages } = await response.json();
```

### cURL

```bash
curl -X POST /api/pdf/convert \
  -F "pdf=@document.pdf" \
  -F 'options={"dpi": 150, "format": "png"}'
```

---

## Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Invalid file | File is not a valid PDF |
| 400 | File too large | PDF exceeds size limit |
| 500 | Conversion failed | Internal error during conversion |
