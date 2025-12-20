# Example Addon

Complete working example of an addon that integrates with an external API.

## Overview

This example shows an addon that:
- Connects to an external API
- Lists items in a browsable UI
- Shows item details in a floating panel
- Sends selected items to the main app

---

## File Structure

```
addons/external-api/
  Dockerfile
  manifest.json
  package.json
  server.js
  ui/
    browser.html
    details.html
    styles.css
```

---

## manifest.json

```json
{
  "id": "external-api",
  "name": "External API Integration",
  "version": "1.0.0",
  "description": "Import data from an external API",
  "port": 8081,

  "endpoints": [
    {
      "path": "/items",
      "method": "GET",
      "description": "List items from external API"
    },
    {
      "path": "/items/:id",
      "method": "GET",
      "description": "Get item details"
    },
    {
      "path": "/items/:id/download",
      "method": "GET",
      "description": "Download item content"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "browser",
        "label": "External API",
        "icon": "Cloud",
        "href": "/addons/external-api/browser",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "browser",
        "path": "/browser",
        "title": "External API Browser"
      },
      {
        "id": "details",
        "path": "/details/:id",
        "title": "Item Details"
      }
    ]
  },

  "config_schema": {
    "api_url": {
      "type": "string",
      "title": "API URL",
      "description": "Base URL of the external API",
      "required": true
    },
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "API authentication key",
      "secret": true,
      "required": true
    },
    "max_results": {
      "type": "number",
      "title": "Max Results",
      "description": "Maximum items to fetch per page",
      "default": 25
    }
  }
}
```

---

## package.json

```json
{
  "name": "external-api-addon",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

---

## Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8081/health || exit 1

# Run server
CMD ["node", "server.js"]
```

---

## server.js

```javascript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Configuration from environment
const config = {
  apiUrl: process.env.ADDON_API_URL,
  apiKey: process.env.ADDON_API_KEY,
  maxResults: parseInt(process.env.ADDON_MAX_RESULTS) || 25,
  authToken: process.env.TABTIN_AUTH_TOKEN
};

// Validate configuration
if (!config.apiUrl || !config.apiKey) {
  console.error('WARNING: API configuration not set');
}

// Authentication middleware
const authenticate = (req, res, next) => {
  // Public endpoints
  if (['/health', '/manifest.json'].includes(req.path)) {
    return next();
  }

  // Static files and pages
  if (req.path.startsWith('/ui/') ||
      req.path === '/browser' ||
      req.path.startsWith('/details/')) {
    return next();
  }

  // Verify token
  const token = req.headers['x-tabtin-auth'];
  if (token !== config.authToken) {
    console.warn('Unauthorized request attempt');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
};

app.use(authenticate);

// Required: Health check
app.get('/health', (req, res) => {
  res.sendStatus(200);
});

// Required: Manifest
app.get('/manifest.json', (req, res) => {
  res.sendFile(join(__dirname, 'manifest.json'));
});

// Static files
app.use('/ui', express.static(join(__dirname, 'ui')));

// Pages
app.get('/browser', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'browser.html'));
});

app.get('/details/:id', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'details.html'));
});

// Helper: Make authenticated request to external API
async function apiRequest(path, options = {}) {
  if (!config.apiUrl || !config.apiKey) {
    throw new Error('Addon not configured. Please set API URL and Key in settings.');
  }

  const url = `${config.apiUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error (${response.status}): ${error}`);
  }

  return response.json();
}

// API: List items
app.get('/items', async (req, res) => {
  try {
    const { page = 1, search } = req.query;

    let path = `/items?page=${page}&limit=${config.maxResults}`;
    if (search) {
      path += `&search=${encodeURIComponent(search)}`;
    }

    const data = await apiRequest(path);

    res.json({
      success: true,
      data: {
        items: data.items,
        total: data.total,
        page: parseInt(page),
        pages: Math.ceil(data.total / config.maxResults)
      }
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get item details
app.get('/items/:id', async (req, res) => {
  try {
    const data = await apiRequest(`/items/${req.params.id}`);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Download item content
app.get('/items/:id/download', async (req, res) => {
  try {
    const meta = await apiRequest(`/items/${req.params.id}`);

    const response = await fetch(`${config.apiUrl}/items/${req.params.id}/content`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    res.json({
      success: true,
      data: {
        filename: meta.filename || `item_${req.params.id}`,
        mimeType: meta.mimeType || 'application/octet-stream',
        base64
      }
    });
  } catch (error) {
    console.error('Error downloading item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`External API addon running on port ${PORT}`);
  console.log(`API URL: ${config.apiUrl || 'NOT SET'}`);
  console.log(`API Key: ${config.apiKey ? 'SET' : 'NOT SET'}`);
  console.log(`Auth Token: ${config.authToken ? 'SET' : 'NOT SET'}`);
});
```

---

## ui/browser.html

```html
<!DOCTYPE html>
<html>
<head>
  <title>External API Browser</title>
  <link rel="stylesheet" href="/ui/styles.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>External API Browser</h1>
      <div class="search-box">
        <input type="text" id="search" placeholder="Search items...">
        <button onclick="search()">Search</button>
      </div>
    </header>

    <div id="error" class="error" style="display: none;"></div>
    <div id="loading" class="loading">Loading...</div>
    <div id="items" class="items-grid"></div>

    <div class="pagination" id="pagination"></div>
  </div>

  <script>
    // Get context
    const params = new URLSearchParams(window.location.search);
    const ctx = params.get('ctx') ? JSON.parse(params.get('ctx')) : {};
    const API_BASE = `/api/addons/proxy/${ctx.addonId}`;

    let currentPage = 1;
    let currentSearch = '';

    // Load items
    async function loadItems(page = 1, searchTerm = '') {
      showLoading(true);
      hideError();

      try {
        let url = `${API_BASE}/items?page=${page}`;
        if (searchTerm) {
          url += `&search=${encodeURIComponent(searchTerm)}`;
        }

        const response = await fetch(url);
        const { success, data, error } = await response.json();

        if (!success) throw new Error(error);

        currentPage = page;
        currentSearch = searchTerm;
        renderItems(data.items);
        renderPagination(data.page, data.pages);

      } catch (err) {
        showError(err.message);
      } finally {
        showLoading(false);
      }
    }

    // Render items grid
    function renderItems(items) {
      const container = document.getElementById('items');

      if (!items || items.length === 0) {
        container.innerHTML = '<p class="no-results">No items found</p>';
        return;
      }

      container.innerHTML = items.map(item => `
        <div class="item-card" onclick="viewDetails('${item.id}')">
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="item-meta">${escapeHtml(item.type || 'Unknown')}</div>
          <div class="item-actions">
            <button onclick="event.stopPropagation(); importItem('${item.id}', '${escapeHtml(item.name)}')">
              Import
            </button>
          </div>
        </div>
      `).join('');
    }

    // Render pagination
    function renderPagination(page, totalPages) {
      const container = document.getElementById('pagination');

      if (totalPages <= 1) {
        container.innerHTML = '';
        return;
      }

      let html = '';

      if (page > 1) {
        html += `<button onclick="loadItems(${page - 1}, '${currentSearch}')">Previous</button>`;
      }

      html += `<span>Page ${page} of ${totalPages}</span>`;

      if (page < totalPages) {
        html += `<button onclick="loadItems(${page + 1}, '${currentSearch}')">Next</button>`;
      }

      container.innerHTML = html;
    }

    // Search handler
    function search() {
      const searchTerm = document.getElementById('search').value;
      loadItems(1, searchTerm);
    }

    // Enter key handler for search
    document.getElementById('search').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') search();
    });

    // View item details in panel
    function viewDetails(itemId) {
      window.parent.postMessage({
        type: 'OPEN_PANEL',
        payload: {
          path: `/details/${itemId}`,
          title: 'Item Details',
          size: 'lg'
        }
      }, '*');
    }

    // Import item
    async function importItem(itemId, itemName) {
      // Show loading toast
      window.parent.postMessage({
        type: 'TOAST',
        payload: { message: `Importing ${itemName}...` }
      }, '*');

      try {
        const response = await fetch(`${API_BASE}/items/${itemId}/download`);
        const { success, data, error } = await response.json();

        if (!success) throw new Error(error);

        // Send file to main app
        window.parent.postMessage({
          type: 'ADDON_FILES',
          payload: { files: [data] }
        }, '*');

        // Success toast
        window.parent.postMessage({
          type: 'TOAST',
          payload: {
            message: `Imported ${data.filename}`,
            variant: 'success'
          }
        }, '*');

      } catch (err) {
        window.parent.postMessage({
          type: 'TOAST',
          payload: {
            message: `Import failed: ${err.message}`,
            variant: 'error'
          }
        }, '*');
      }
    }

    // Utility functions
    function showLoading(show) {
      document.getElementById('loading').style.display = show ? 'block' : 'none';
      document.getElementById('items').style.display = show ? 'none' : 'grid';
    }

    function showError(message) {
      const el = document.getElementById('error');
      el.textContent = message;
      el.style.display = 'block';
    }

    function hideError() {
      document.getElementById('error').style.display = 'none';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Initial load
    loadItems();
  </script>
</body>
</html>
```

---

## ui/details.html

```html
<!DOCTYPE html>
<html>
<head>
  <title>Item Details</title>
  <link rel="stylesheet" href="/ui/styles.css">
</head>
<body>
  <div class="container">
    <div id="loading" class="loading">Loading...</div>
    <div id="error" class="error" style="display: none;"></div>

    <div id="details" class="details" style="display: none;">
      <h1 id="item-name"></h1>

      <div class="detail-row">
        <label>Type:</label>
        <span id="item-type"></span>
      </div>

      <div class="detail-row">
        <label>Created:</label>
        <span id="item-created"></span>
      </div>

      <div class="detail-row">
        <label>Description:</label>
        <p id="item-description"></p>
      </div>

      <div class="actions">
        <button id="import-btn" class="btn-primary">Import</button>
        <button onclick="closePanel()" class="btn-secondary">Close</button>
      </div>
    </div>
  </div>

  <script>
    // Get context and item ID from URL
    const params = new URLSearchParams(window.location.search);
    const ctx = params.get('ctx') ? JSON.parse(params.get('ctx')) : {};
    const API_BASE = `/api/addons/proxy/${ctx.addonId}`;

    // Extract item ID from path
    const pathParts = window.location.pathname.split('/');
    const itemId = pathParts[pathParts.length - 1];

    let itemData = null;

    // Load item details
    async function loadDetails() {
      try {
        const response = await fetch(`${API_BASE}/items/${itemId}`);
        const { success, data, error } = await response.json();

        if (!success) throw new Error(error);

        itemData = data;
        renderDetails(data);

      } catch (err) {
        showError(err.message);
      }
    }

    // Render details
    function renderDetails(item) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('details').style.display = 'block';

      document.getElementById('item-name').textContent = item.name;
      document.getElementById('item-type').textContent = item.type || 'Unknown';
      document.getElementById('item-created').textContent = new Date(item.created).toLocaleDateString();
      document.getElementById('item-description').textContent = item.description || 'No description';

      // Set up import button
      document.getElementById('import-btn').onclick = () => importItem();
    }

    // Import current item
    async function importItem() {
      if (!itemData) return;

      window.parent.postMessage({
        type: 'TOAST',
        payload: { message: `Importing ${itemData.name}...` }
      }, '*');

      try {
        const response = await fetch(`${API_BASE}/items/${itemId}/download`);
        const { success, data, error } = await response.json();

        if (!success) throw new Error(error);

        window.parent.postMessage({
          type: 'ADDON_FILES',
          payload: { files: [data] }
        }, '*');

        window.parent.postMessage({
          type: 'TOAST',
          payload: {
            message: `Imported ${data.filename}`,
            variant: 'success'
          }
        }, '*');

        closePanel();

      } catch (err) {
        window.parent.postMessage({
          type: 'TOAST',
          payload: {
            message: `Import failed: ${err.message}`,
            variant: 'error'
          }
        }, '*');
      }
    }

    // Close panel
    function closePanel() {
      window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');
    }

    // Show error
    function showError(message) {
      document.getElementById('loading').style.display = 'none';
      const el = document.getElementById('error');
      el.textContent = message;
      el.style.display = 'block';
    }

    // Load on start
    loadDetails();
  </script>
</body>
</html>
```

---

## ui/styles.css

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f5f5;
  color: #333;
  line-height: 1.5;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h1 {
  font-size: 1.5rem;
  font-weight: 600;
}

.search-box {
  display: flex;
  gap: 8px;
}

.search-box input {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  width: 250px;
}

.search-box button,
button {
  padding: 8px 16px;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

button:hover {
  background: #0055aa;
}

.btn-secondary {
  background: #666;
}

.btn-secondary:hover {
  background: #555;
}

.loading {
  text-align: center;
  padding: 40px;
  color: #666;
}

.error {
  background: #fee;
  border: 1px solid #fcc;
  color: #c00;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.item-card {
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.item-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.item-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.item-meta {
  color: #666;
  font-size: 13px;
  margin-bottom: 12px;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.item-actions button {
  padding: 6px 12px;
  font-size: 13px;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
}

.no-results {
  text-align: center;
  color: #666;
  padding: 40px;
}

/* Details page */
.details {
  background: white;
  border-radius: 8px;
  padding: 24px;
}

.detail-row {
  margin-bottom: 16px;
}

.detail-row label {
  display: block;
  font-weight: 600;
  margin-bottom: 4px;
  color: #666;
}

.actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #eee;
}
```

---

## Testing

### Build and Run

```bash
# Build image
cd addons/external-api
docker build -t tabtin-addon-external-api .

# Run locally
docker run -p 8081:8081 \
  -e TABTIN_AUTH_TOKEN=test-token \
  -e ADDON_API_URL=https://api.example.com \
  -e ADDON_API_KEY=your-api-key \
  tabtin-addon-external-api
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8081/health

# Manifest
curl http://localhost:8081/manifest.json

# List items (authenticated)
curl -H "X-Tabtin-Auth: test-token" http://localhost:8081/items

# Get item details
curl -H "X-Tabtin-Auth: test-token" http://localhost:8081/items/123
```

---

## Installation

1. Ensure addon files are in `addons/external-api/`
2. Go to Settings > Addons in the main app
3. Click "Install" on "External API Integration"
4. Wait for container to build and start
5. Configure API URL and Key in addon settings
6. Restart addon to apply configuration
7. Access via sidebar menu item
