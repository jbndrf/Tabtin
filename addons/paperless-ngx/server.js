import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Config from environment (set by Tabtin from config_schema)
const config = {
  paperlessUrl: process.env.ADDON_PAPERLESS_URL,
  paperlessToken: process.env.ADDON_PAPERLESS_TOKEN,
  authToken: process.env.TABTIN_AUTH_TOKEN
};

// Auth middleware
const authenticate = (req, res, next) => {
  // Skip auth for public endpoints
  if (req.path === '/health' || req.path === '/manifest.json') {
    return next();
  }
  // Skip auth for static UI files and pages (auth passed via query param)
  if (req.path.startsWith('/ui/') || req.path === '/browser') {
    return next();
  }
  // Skip auth for thumbnail requests (img tags can't send headers)
  if (req.path.match(/^\/documents\/[^/]+\/thumb$/)) {
    return next();
  }

  const token = req.headers['x-tabtin-auth'];
  if (token !== config.authToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

app.use(authenticate);

// Serve static UI files
app.use('/ui', express.static(join(__dirname, 'ui')));

// Serve browser page (declared in manifest.pages)
app.get('/browser', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'document-browser.html'));
});

// Health check
app.get('/health', (req, res) => res.sendStatus(200));

// Manifest
app.get('/manifest.json', (req, res) => {
  res.sendFile(join(__dirname, 'manifest.json'));
});

// Helper to make authenticated requests to Paperless-ngx
async function paperlessRequest(path, options = {}) {
  const url = `${config.paperlessUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Token ${config.paperlessToken}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Paperless-ngx API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

// List documents from Paperless-ngx
app.get('/documents', async (req, res) => {
  try {
    const { query, page = 1, page_size = 25, correspondent, document_type, tags } = req.query;

    const params = new URLSearchParams({ page, page_size });
    if (query) params.set('query', query);
    if (correspondent) params.set('correspondent__id', correspondent);
    if (document_type) params.set('document_type__id', document_type);
    if (tags) params.set('tags__id__in', tags);

    const response = await paperlessRequest(`/api/documents/?${params}`);
    const data = await response.json();

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get document thumbnail
app.get('/documents/:id/thumb', async (req, res) => {
  try {
    const response = await paperlessRequest(`/api/documents/${req.params.id}/thumb/`);
    const buffer = await response.arrayBuffer();

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/webp');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error fetching thumbnail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download document as base64 (for postMessage transfer to parent)
app.get('/documents/:id/download', async (req, res) => {
  try {
    // Get document metadata first
    const metaResponse = await paperlessRequest(`/api/documents/${req.params.id}/`);
    const meta = await metaResponse.json();

    // Download PDF
    const pdfResponse = await paperlessRequest(`/api/documents/${req.params.id}/download/`);
    const buffer = await pdfResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    res.json({
      success: true,
      data: {
        filename: `${meta.title || `document_${req.params.id}`}.pdf`,
        mimeType: 'application/pdf',
        base64
      }
    });
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List correspondents
app.get('/correspondents', async (req, res) => {
  try {
    const response = await paperlessRequest('/api/correspondents/?page_size=1000');
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching correspondents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List document types
app.get('/document_types', async (req, res) => {
  try {
    const response = await paperlessRequest('/api/document_types/?page_size=1000');
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching document types:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List tags
app.get('/tags', async (req, res) => {
  try {
    const response = await paperlessRequest('/api/tags/?page_size=1000');
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Paperless-ngx addon running on port ${PORT}`);
  console.log(`Paperless URL: ${config.paperlessUrl || 'NOT SET'}`);
  console.log(`Auth token: ${config.authToken ? 'SET' : 'NOT SET'}`);
});
