# Manifest Reference

Complete specification for addon manifest files.

## Overview

The manifest file (`manifest.json`) defines your addon's metadata, capabilities, and configuration schema. It must be served at `GET /manifest.json` by your addon.

---

## Complete Schema

```json
{
  "id": "string",
  "name": "string",
  "version": "string",
  "description": "string",
  "port": 8081,

  "endpoints": [
    {
      "path": "/endpoint",
      "method": "GET",
      "description": "Description"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "item-id",
        "label": "Menu Label",
        "icon": "IconName",
        "href": "/addons/addon-id/page",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "page-id",
        "path": "/page",
        "title": "Page Title"
      }
    ]
  },

  "config_schema": {
    "field_name": {
      "type": "string",
      "title": "Field Title",
      "description": "Help text",
      "secret": false,
      "required": true,
      "default": "value",
      "options": ["a", "b", "c"]
    }
  }
}
```

---

## Root Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique addon identifier (used in URLs) |
| `name` | string | Yes | Display name shown in UI |
| `version` | string | Yes | Semantic version (e.g., "1.0.0") |
| `description` | string | No | Brief description of the addon |
| `port` | number | Yes | Port the addon listens on |
| `endpoints` | array | No | API endpoints the addon provides |
| `ui` | object | No | UI components (menus, pages) |
| `config_schema` | object | No | Configuration form schema |

### ID Requirements

- Must be lowercase
- Use hyphens for word separation (e.g., `my-addon`)
- Must be unique across all addons
- Used in URLs: `/addons/{id}/...`

---

## Endpoints

Define the API endpoints your addon provides. This is primarily for documentation purposes.

```json
{
  "endpoints": [
    {
      "path": "/documents",
      "method": "GET",
      "description": "List all documents"
    },
    {
      "path": "/documents/:id",
      "method": "GET",
      "description": "Get document by ID"
    },
    {
      "path": "/documents/:id/download",
      "method": "GET",
      "description": "Download document content"
    }
  ]
}
```

### Endpoint Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Endpoint path (can include params like `:id`) |
| `method` | string | Yes | HTTP method: `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| `description` | string | No | What this endpoint does |

---

## UI Configuration

### Menu Items

Add navigation items to the sidebar.

```json
{
  "ui": {
    "menuItems": [
      {
        "id": "main-browser",
        "label": "Document Browser",
        "icon": "FileText",
        "href": "/addons/my-addon/browser",
        "section": "main"
      },
      {
        "id": "settings",
        "label": "Addon Settings",
        "icon": "Settings",
        "href": "/addons/my-addon/settings",
        "section": "footer"
      }
    ]
  }
}
```

### Menu Item Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for this menu item |
| `label` | string | Yes | Text displayed in menu |
| `icon` | string | No | Icon name (Lucide icons) |
| `href` | string | Yes | Navigation path |
| `section` | string | Yes | Menu section placement |

### Menu Sections

| Section | Description |
|---------|-------------|
| `main` | Main navigation area (top) |
| `projects` | Project-related section |
| `footer` | Footer/settings area (bottom) |

### Available Icons

Any icon from [Lucide](https://lucide.dev/icons/) can be used. Common options:

| Icon | Use Case |
|------|----------|
| `FileText` | Documents |
| `Folder` | Collections |
| `Settings` | Configuration |
| `Cloud` | External services |
| `Database` | Data storage |
| `Search` | Search functionality |
| `Upload` | Import/upload |
| `Download` | Export/download |

---

## Pages

Define full-page views your addon provides.

```json
{
  "ui": {
    "pages": [
      {
        "id": "browser",
        "path": "/browser",
        "title": "Document Browser"
      },
      {
        "id": "details",
        "path": "/details/:id",
        "title": "Document Details"
      }
    ]
  }
}
```

### Page Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique page identifier |
| `path` | string | Yes | URL path (relative to addon) |
| `title` | string | Yes | Page title shown in header |

### Path Parameters

Pages can include path parameters:

```json
{
  "path": "/details/:id",
  "title": "Document Details"
}
```

This matches URLs like `/addons/my-addon/details/123`.

---

## Configuration Schema

Define configurable settings with automatic form generation.

```json
{
  "config_schema": {
    "api_url": {
      "type": "string",
      "title": "API URL",
      "description": "Base URL of the external API",
      "required": true
    },
    "api_token": {
      "type": "string",
      "title": "API Token",
      "description": "Authentication token",
      "secret": true,
      "required": true
    },
    "max_results": {
      "type": "number",
      "title": "Max Results",
      "description": "Maximum results to fetch",
      "default": 100,
      "required": false
    },
    "enabled": {
      "type": "boolean",
      "title": "Enable Feature",
      "default": true
    },
    "mode": {
      "type": "select",
      "title": "Operation Mode",
      "options": ["fast", "balanced", "thorough"],
      "default": "balanced"
    }
  }
}
```

### Config Field Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string | Yes | Field type |
| `title` | string | Yes | Label shown in form |
| `description` | string | No | Help text below field |
| `secret` | boolean | No | Render as password input |
| `required` | boolean | No | Is field required |
| `default` | varies | No | Default value |
| `options` | string[] | For select | Available choices |

### Field Types

| Type | Input | Description |
|------|-------|-------------|
| `string` | Text input | Free-form text |
| `number` | Number input | Numeric values |
| `boolean` | Toggle/checkbox | True/false |
| `select` | Dropdown | Choose from options |

### Environment Variable Mapping

Config keys are converted to environment variables:

| Config Key | Environment Variable |
|------------|---------------------|
| `api_url` | `ADDON_API_URL` |
| `api_token` | `ADDON_API_TOKEN` |
| `max_results` | `ADDON_MAX_RESULTS` |
| `enabled` | `ADDON_ENABLED` |

---

## Complete Example

```json
{
  "id": "paperless-ngx",
  "name": "Paperless-ngx Import",
  "version": "1.0.0",
  "description": "Import documents from Paperless-ngx for extraction",
  "port": 8081,

  "endpoints": [
    {
      "path": "/documents",
      "method": "GET",
      "description": "List/search documents from paperless-ngx"
    },
    {
      "path": "/documents/:id/download",
      "method": "GET",
      "description": "Download document PDF as base64"
    },
    {
      "path": "/correspondents",
      "method": "GET",
      "description": "List correspondents for filtering"
    },
    {
      "path": "/document_types",
      "method": "GET",
      "description": "List document types for filtering"
    },
    {
      "path": "/tags",
      "method": "GET",
      "description": "List tags for filtering"
    }
  ],

  "ui": {
    "menuItems": [
      {
        "id": "paperless-browser",
        "label": "Paperless Import",
        "icon": "FileText",
        "href": "/addons/paperless-ngx/browser",
        "section": "main"
      }
    ],
    "pages": [
      {
        "id": "browser",
        "path": "/browser",
        "title": "Paperless-ngx Document Browser"
      }
    ]
  },

  "config_schema": {
    "paperless_url": {
      "type": "string",
      "title": "Paperless-ngx URL",
      "description": "Base URL of your Paperless-ngx instance (e.g., https://paperless.example.com)",
      "required": true
    },
    "paperless_token": {
      "type": "string",
      "title": "API Token",
      "description": "Paperless-ngx API token (found in Paperless-ngx User Settings)",
      "secret": true,
      "required": true
    }
  }
}
```

---

## Validation

The manifest is validated when fetched from the container. Validation checks:

- Required fields are present (`id`, `name`, `version`, `port`)
- `id` matches expected format
- `port` is a valid number
- All referenced icons exist
- Menu item hrefs match page paths
