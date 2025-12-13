# Tabtin Addons

Addons extend Tabtin's functionality through Docker containers that expose REST APIs and can add UI to the main application via menu items, full pages, and floating panels.

## Directory Structure

Each addon lives in its own subdirectory:

```
/addons
  /your-addon-name
    Dockerfile
    manifest.json       # Required: addon metadata
    package.json        # Or requirements.txt, go.mod, etc.
    server.js           # Your addon server
    /ui                 # Optional: HTML pages
      page.html
```

---

## Manifest Format

Every addon must serve a manifest at `GET /manifest.json`:

```json
{
  "id": "your-addon-id",
  "name": "Human Readable Name",
  "version": "1.0.0",
  "description": "What this addon does",
  "port": 8080,

  "endpoints": [
    {
      "path": "/process",
      "method": "POST",
      "description": "Process extraction data"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "my-feature",
        "label": "My Feature",
        "icon": "FileText",
        "href": "/addons/your-addon-id/main",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "main",
        "path": "/main",
        "title": "My Feature Page"
      }
    ]
  },

  "config_schema": {
    "api_key": {
      "type": "string",
      "title": "API Key",
      "description": "Your external service API key",
      "secret": true,
      "required": true
    }
  }
}
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (lowercase, hyphens allowed) |
| `name` | Yes | Display name |
| `version` | Yes | Semver version |
| `description` | No | Short description |
| `port` | Yes | Port the addon listens on |
| `endpoints` | No | REST endpoints the addon exposes |
| `ui.menuItems` | No | Sidebar navigation links |
| `ui.pages` | No | Full pages the addon provides |
| `config_schema` | No | Configuration options for the user |

---

## UI Capabilities

Addons can add UI in three ways:

### 1. Menu Items

Add links to the sidebar navigation:

```json
{
  "ui": {
    "menuItems": [
      {
        "id": "browser",
        "label": "Document Browser",
        "icon": "FileText",
        "href": "/addons/my-addon/browser",
        "section": "main"
      }
    ]
  }
}
```

**Section options:**
- `main` - In the main navigation (after Dashboard/Settings)
- `projects` - After the Projects list
- `footer` - In the footer area

### 2. Full Pages

Declare pages that will be rendered as iframes within the app shell:

```json
{
  "ui": {
    "pages": [
      {
        "id": "browser",
        "path": "/browser",
        "title": "Document Browser"
      }
    ]
  }
}
```

When a user navigates to `/addons/[addonId]/browser`, Tabtin renders your addon's `/browser` endpoint in an iframe. The sidebar and header remain visible, and the addon-bridge postMessage API is available.

### 3. Floating Panels

Open floating panels/modals via postMessage from your addon pages:

```javascript
// Open a panel
window.parent.postMessage({
  type: 'OPEN_PANEL',
  payload: {
    path: '/export-dialog',
    title: 'Export Documents',
    size: 'lg'  // sm, md, lg, xl, full
  }
}, '*');

// Close the panel
window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');
```

---

## Required Endpoints

### Health Check

```
GET /health
Response: 200 OK
```

Tabtin polls this endpoint to check addon status. Return 200 when ready.

### Manifest

```
GET /manifest.json
Response: JSON manifest (see above)
```

### Your Pages

Serve HTML at the paths declared in `ui.pages`:

```javascript
// Express example
app.get('/browser', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'browser.html'));
});
```

---

## Authentication

Tabtin passes an auth token when starting your container:

```
Environment variable: TABTIN_AUTH_TOKEN
```

For API endpoints, validate via header:

```javascript
app.use((req, res, next) => {
  // Skip auth for public endpoints and pages (auth via query param)
  if (req.path === '/health' || req.path === '/manifest.json' || req.path === '/browser') {
    return next();
  }

  const token = req.headers['x-tabtin-auth'];
  if (token !== process.env.TABTIN_AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

For page iframes, the auth token is passed via query parameter `?token=...`.

---

## postMessage API

Communicate with the host Tabtin app from your addon pages:

```javascript
// Show a toast notification
window.parent.postMessage({
  type: 'TOAST',
  payload: { message: 'Success!', variant: 'success' }
}, '*');

// Navigate to a different page
window.parent.postMessage({
  type: 'NAVIGATE',
  payload: { path: '/projects/abc123' }
}, '*');

// Refresh current page data
window.parent.postMessage({
  type: 'REFRESH'
}, '*');

// Open a floating panel
window.parent.postMessage({
  type: 'OPEN_PANEL',
  payload: {
    path: '/settings',
    title: 'Addon Settings',
    size: 'md'
  }
}, '*');

// Close the floating panel
window.parent.postMessage({
  type: 'CLOSE_PANEL'
}, '*');

// Send files to the host app (received via 'addon-files-received' event)
window.parent.postMessage({
  type: 'ADDON_FILES',
  payload: {
    files: [
      {
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        base64: 'JVBERi0xLjQK...'  // Base64-encoded file content
      }
    ]
  }
}, '*');
```

---

## Data Storage

Each addon gets a mounted volume at `/data/` for persistent storage.

**Recommended:** Use SQLite for addon-specific data.

```javascript
const Database = require('better-sqlite3');
const db = new Database('/data/addon.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS exports (
    id INTEGER PRIMARY KEY,
    batch_id TEXT,
    exported_at TEXT,
    file_path TEXT
  )
`);
```

This data is:
- Completely isolated from Tabtin's PocketBase
- Persisted across container restarts
- Deleted when addon is uninstalled

---

## Dockerfile Requirements

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
```

---

## Development Workflow

### 1. Create your addon directory

```bash
mkdir -p addons/my-addon
cd addons/my-addon
```

### 2. Build the Docker image

```bash
docker build -t tabtin-addon-my-addon .
```

### 3. Test locally

```bash
docker run -p 8080:8080 \
  -e TABTIN_AUTH_TOKEN=test-token \
  -v $(pwd)/data:/data \
  tabtin-addon-my-addon
```

### 4. Install in Tabtin

Go to Settings > Addons > Install and enter: `tabtin-addon-my-addon:latest`

---

## Response Format

Return JSON responses:

```json
{
  "success": true,
  "data": { ... }
}
```

Or on error:

```json
{
  "success": false,
  "error": "Description of what went wrong"
}
```

---

## Best Practices

1. **Stateless endpoints** - Don't rely on in-memory state between requests
2. **Idempotent operations** - Same request should produce same result
3. **Graceful shutdown** - Handle SIGTERM to clean up resources
4. **Logging** - Log to stdout/stderr (captured by Docker)
5. **Resource limits** - Addons run with 512MB RAM, 50% CPU limit
6. **Timeouts** - API calls to your addon timeout after 30 seconds
