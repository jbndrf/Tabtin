# Addon API

REST endpoints for managing addon installation, configuration, and lifecycle.

## Endpoints

- [GET /api/addons](#get-apiaddons) - List installed addons
- [POST /api/addons](#post-apiaddons) - Install addon
- [GET /api/addons/available](#get-apiaddonsavailable) - List available addons
- [GET /api/addons/[id]](#get-apiaddonsid) - Get addon details
- [PUT /api/addons/[id]](#put-apiaddonsid) - Update configuration
- [DELETE /api/addons/[id]](#delete-apiaddonsid) - Uninstall addon
- [POST /api/addons/[id]/start](#post-apiaddonsidstart) - Start addon
- [POST /api/addons/[id]/stop](#post-apiaddonsidstop) - Stop addon
- [GET /api/addons/[id]/logs](#get-apiaddonsidlogs) - Get container logs
- [POST /api/addons/[id]/call](#post-apiaddonsidcall) - Call addon endpoint
- [GET/POST /api/addons/proxy/[addonId]/[...path]](#proxy-endpoint) - Proxy requests

---

## GET /api/addons

List all installed addons for the authenticated user.

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "abc123",
      "user": "user_id",
      "name": "Paperless-ngx Import",
      "docker_image": "tabtin-addon-paperless-ngx",
      "container_id": "docker_container_id",
      "container_status": "running",
      "internal_url": "http://127.0.0.1:9001",
      "manifest": { ... },
      "config": { ... },
      "created": "2024-01-01T00:00:00Z",
      "updated": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## POST /api/addons

Install a new addon.

### Request Body

```json
{
  "dockerImage": "tabtin-addon-paperless-ngx"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| dockerImage | string | Yes | Docker image name (must start with `tabtin-addon-`) |

### Response

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Paperless-ngx Import",
    "container_status": "running",
    ...
  }
}
```

### Installation Flow

1. Validates image name format
2. Builds Docker image from `addons/[addon-name]/Dockerfile`
3. Creates PocketBase record with status `building`
4. Creates and starts container
5. Polls `/health` endpoint until ready
6. Fetches `/manifest.json` from container
7. Updates record with manifest and status `running`

---

## GET /api/addons/available

List addons available for installation.

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "paperless-ngx",
      "name": "tabtin-addon-paperless-ngx",
      "path": "/path/to/addons/paperless-ngx"
    }
  ]
}
```

---

## GET /api/addons/[id]

Get details for a specific addon.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| id | string | Addon database record ID |

### Response

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "name": "Paperless-ngx Import",
    "container_status": "running",
    "manifest": {
      "id": "paperless-ngx",
      "name": "Paperless-ngx Import",
      "version": "1.0.0",
      "port": 8081,
      "endpoints": [...],
      "ui": {...},
      "config_schema": {...}
    },
    "config": {
      "paperless_url": "https://paperless.example.com",
      "paperless_token": "***"
    },
    ...
  }
}
```

---

## PUT /api/addons/[id]

Update addon configuration.

### Request Body

```json
{
  "config": {
    "paperless_url": "https://paperless.example.com",
    "paperless_token": "your-api-token"
  }
}
```

### Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Configuration updated. Restart the addon to apply changes."
}
```

**Note:** Configuration changes require an addon restart to take effect.

---

## DELETE /api/addons/[id]

Uninstall an addon.

### Response

```json
{
  "success": true,
  "message": "Addon uninstalled"
}
```

### Cleanup Actions

1. Stops and removes Docker container
2. Removes Docker image
3. Deletes addon data directory
4. Deletes PocketBase record

---

## POST /api/addons/[id]/start

Start a stopped addon.

### Response

```json
{
  "success": true,
  "data": {
    "container_status": "running",
    ...
  }
}
```

---

## POST /api/addons/[id]/stop

Stop a running addon.

### Response

```json
{
  "success": true,
  "data": {
    "container_status": "stopped",
    ...
  }
}
```

---

## GET /api/addons/[id]/logs

Get container logs.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| tail | number | 100 | Number of log lines to retrieve |

### Response

```json
{
  "success": true,
  "data": {
    "logs": "Addon running on port 8081\nPaperless URL: https://...\n..."
  }
}
```

---

## POST /api/addons/[id]/call

Call an addon endpoint via the secure proxy.

### Request Body

```json
{
  "endpoint": "/documents",
  "method": "GET",
  "data": { "query": "search term" }
}
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| endpoint | string | Yes | - | Addon endpoint path |
| method | string | No | `GET` | HTTP method |
| data | object | No | - | Request body for POST/PUT |

### Response

```json
{
  "success": true,
  "data": { ... }
}
```

---

## Proxy Endpoint

### GET/POST /api/addons/proxy/[addonId]/[...path]

Direct proxy to addon endpoints. Used by addon iframes for API calls.

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| addonId | string | Addon manifest ID (e.g., `paperless-ngx`) |
| path | string | Remaining path to forward to addon |

### Headers Added by Proxy

| Header | Description |
|--------|-------------|
| `X-Tabtin-Auth` | Secure auth token for addon verification |

### Example

```
GET /api/addons/proxy/paperless-ngx/documents?page=1
  |
  v
GET http://127.0.0.1:9001/documents?page=1
    + Header: X-Tabtin-Auth: [token]
```

### Response

Proxied response from addon container (content-type preserved).

---

## Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Invalid request | Missing or invalid parameters |
| 401 | Unauthorized | User not authenticated |
| 403 | Forbidden | User doesn't own the addon |
| 404 | Not found | Addon not found |
| 500 | Internal error | Server or container error |

### Error Response Format

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```
