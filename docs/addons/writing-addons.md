# Writing Addons

Step-by-step guide to creating addons for the platform.

## Quick Start

1. Create addon directory in `addons/`
2. Add required files (Dockerfile, manifest.json, server)
3. Implement required endpoints (`/health`, `/manifest.json`)
4. Add authentication middleware
5. Build and test locally
6. Install via the Settings UI

---

## Directory Structure

Create a new addon in the `addons/` directory:

```
addons/
  my-addon/
    Dockerfile           # Required: Container build instructions
    manifest.json        # Required: Addon metadata and configuration
    package.json         # Node.js dependencies
    server.js            # Main application entry point
    ui/                  # Static frontend files
      index.html
      app.js
      styles.css
```

---

## Dockerfile

The Dockerfile builds your addon into a container image.

### Requirements

- Must expose the port specified in manifest
- Must include a health check
- Should create `/data` directory for persistent storage

### Example Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application files
COPY . .

# Create data directory for persistent storage
RUN mkdir -p /data

# Expose the port from manifest
EXPOSE 8081

# Health check (required)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8081/health || exit 1

# Start the server
CMD ["node", "server.js"]
```

### Health Check Options

| Option | Value | Description |
|--------|-------|-------------|
| `--interval` | `30s` | Time between checks |
| `--timeout` | `5s` | Max time for check |
| `--start-period` | `5s` | Grace period on startup |

---

## Server Implementation

Your server must implement specific endpoints and handle authentication.

### Required Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check, return 200 OK |
| `/manifest.json` | GET | Serve the addon manifest |

### Authentication Middleware

Check `X-Tabtin-Auth` header against `TABTIN_AUTH_TOKEN` environment variable.

**Skip auth for:**
- `/health` - Required for Docker health checks
- `/manifest.json` - Required for addon discovery
- Static UI files - Auth passed via query params

### Example Server (Node.js/Express)

```javascript
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());

// Config from environment
const config = {
  myConfigValue: process.env.ADDON_MY_CONFIG_KEY,
  authToken: process.env.TABTIN_AUTH_TOKEN
};

// Auth middleware
const authenticate = (req, res, next) => {
  // Skip auth for public endpoints
  if (req.path === '/health' || req.path === '/manifest.json') {
    return next();
  }

  // Skip auth for static UI files
  if (req.path.startsWith('/ui/')) {
    return next();
  }

  // Verify auth token
  const token = req.headers['x-tabtin-auth'];
  if (token !== config.authToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

app.use(authenticate);

// Required: Health check
app.get('/health', (req, res) => res.sendStatus(200));

// Required: Serve manifest
app.get('/manifest.json', (req, res) => {
  res.sendFile(join(__dirname, 'manifest.json'));
});

// Serve static UI files
app.use('/ui', express.static(join(__dirname, 'ui')));

// Serve declared pages
app.get('/my-page', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'my-page.html'));
});

// Custom API endpoints
app.get('/my-endpoint', async (req, res) => {
  try {
    const data = await fetchData();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
});
```

---

## Environment Variables

The following environment variables are passed to addon containers:

| Variable | Description |
|----------|-------------|
| `TABTIN_AUTH_TOKEN` | Secure token for authenticating requests |
| `TABTIN_ADDON_ID` | Database record ID of this addon |
| `PORT` | Port number from manifest |
| `ADDON_*` | Config values (uppercase key with `ADDON_` prefix) |

### Config Key Mapping

Config schema keys are converted to environment variables:

| Config Key | Environment Variable |
|------------|---------------------|
| `api_url` | `ADDON_API_URL` |
| `api_token` | `ADDON_API_TOKEN` |
| `max_results` | `ADDON_MAX_RESULTS` |

---

## Manifest File

The manifest defines your addon's metadata and capabilities.

See [Manifest Reference](./manifest.md) for complete specification.

### Minimal Manifest

```json
{
  "id": "my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "port": 8081
}
```

### Full Example

```json
{
  "id": "my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "description": "Description of what this addon does",
  "port": 8081,

  "endpoints": [
    {
      "path": "/data",
      "method": "GET",
      "description": "Fetch data from external service"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "main-page",
        "label": "My Addon",
        "icon": "FileText",
        "href": "/addons/my-addon/main",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "main",
        "path": "/main",
        "title": "My Addon Main Page"
      }
    ]
  },

  "config_schema": {
    "api_url": {
      "type": "string",
      "title": "API URL",
      "required": true
    },
    "api_token": {
      "type": "string",
      "title": "API Token",
      "secret": true,
      "required": true
    }
  }
}
```

---

## Frontend Development

### Serving Pages

Declare pages in manifest and serve HTML files:

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

```javascript
// In server.js
app.get('/browser', (req, res) => {
  res.sendFile(join(__dirname, 'ui', 'browser.html'));
});
```

### Getting Context

Context is passed via query parameter:

```javascript
// In your addon's frontend JavaScript
const params = new URLSearchParams(window.location.search);
const ctx = params.get('ctx') ? JSON.parse(params.get('ctx')) : {};

// ctx contains:
// - addonId: Database record ID
// - userId: Current user ID
// - projectId: Current project (if applicable)
```

### Making API Calls

Use the proxy endpoint for authenticated requests:

```javascript
const API_BASE = `/api/addons/proxy/${ctx.addonId}`;

async function fetchData() {
  const response = await fetch(`${API_BASE}/my-endpoint`);
  const { success, data, error } = await response.json();

  if (!success) {
    throw new Error(error);
  }

  return data;
}
```

### Communicating with Host

Use postMessage to interact with the main application:

```javascript
// Show toast notification
window.parent.postMessage({
  type: 'TOAST',
  payload: { message: 'Success!', variant: 'success' }
}, '*');

// Navigate to main app route
window.parent.postMessage({
  type: 'NAVIGATE',
  payload: { path: '/projects/123' }
}, '*');
```

See [Communication Bridge](./communication.md) for all message types.

---

## Testing Locally

### Build Image

```bash
cd addons/my-addon
docker build -t tabtin-addon-my-addon .
```

### Run Container

```bash
docker run -p 8081:8081 \
  -e TABTIN_AUTH_TOKEN=test-token \
  -e ADDON_API_URL=https://api.example.com \
  tabtin-addon-my-addon
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8081/health

# Manifest
curl http://localhost:8081/manifest.json

# Authenticated endpoint
curl -H "X-Tabtin-Auth: test-token" http://localhost:8081/my-endpoint
```

---

## Persistent Storage

Use the `/data` directory for persistent storage:

```javascript
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = '/data';

async function saveData(filename, data) {
  await writeFile(
    join(DATA_DIR, filename),
    JSON.stringify(data)
  );
}

async function loadData(filename) {
  const content = await readFile(join(DATA_DIR, filename), 'utf-8');
  return JSON.parse(content);
}
```

**Note:** Each user gets their own data directory, isolated from other users.

---

## Best Practices

### Error Handling

Always return consistent error responses:

```javascript
app.get('/endpoint', async (req, res) => {
  try {
    const data = await operation();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Operation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Logging

Log important events for debugging:

```javascript
console.log(`Addon running on port ${PORT}`);
console.log(`Config: API_URL=${config.apiUrl || 'NOT SET'}`);
console.log(`Auth: ${config.authToken ? 'SET' : 'NOT SET'}`);
```

### Configuration Validation

Validate required configuration on startup:

```javascript
if (!config.apiUrl) {
  console.error('ERROR: ADDON_API_URL is required');
  process.exit(1);
}
```

### Resource Efficiency

- Use streaming for large files
- Implement pagination for lists
- Cache external API responses when appropriate
