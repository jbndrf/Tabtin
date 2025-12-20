# Documentation

Welcome to the documentation. This covers user guides, REST API endpoints, database collections, server utilities, and the addon system.

## User Guides

New to the app? Start with the user guides:

- [Why Tabtin](./guides/why-tabtin.md) - Self-hosting, local LLMs, and the addon system
- [User Guides Overview](./guides/index.md) - All guides and tutorials
- [Getting Started](./guides/getting-started.md) - Create your first project
- [Inventory Tracking Tutorial](./guides/inventory-project.md) - Catalog items using phone camera
- [Bank Statement Extraction](./guides/bank-statement.md) - Multi-row extraction from PDFs
- [Paperless NGX Import](./guides/paperless-import.md) - Import from Paperless
- [Tips and Tricks](./guides/tips-and-tricks.md) - Best practices

---

## Quick Links

### Core API

- [Queue Management](./api/queue.md) - Job queue operations for batch processing
- [Batch Management](./api/batches.md) - Batch status and deletion endpoints
- [PDF Processing](./api/pdf.md) - PDF to image conversion
- [Schema Chat](./api/schema-chat.md) - LLM-powered schema design assistant
- [LLM Proxy](./api/llm-proxy.md) - Model discovery and proxy endpoints

### Database

- [PocketBase Collections](./collections.md) - Database schema and collection definitions

### Server

- [Server Utilities](./utilities.md) - Queue manager, worker, and connection pool
- [Type Definitions](./types.md) - TypeScript interfaces and types
- [Authentication](./authentication.md) - Auth flow and patterns
- [Data Flow](./data-flow.md) - Processing pipelines and workflows

### Addon System

- [Addon Overview](./addons/index.md) - Architecture and key concepts
- [Addon API](./addons/api.md) - REST endpoints for addon management
- [Writing Addons](./addons/writing-addons.md) - Step-by-step guide to creating addons
- [Manifest Reference](./addons/manifest.md) - Complete manifest specification
- [Addon Types](./addons/types.md) - TypeScript interfaces
- [Communication Bridge](./addons/communication.md) - postMessage API
- [Security Model](./addons/security.md) - Authentication and isolation
- [Example Addon](./addons/examples.md) - Complete working example

---

## Response Patterns

### Standard Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "status": 400
}
```

### Content Types

| API | Request | Response |
|-----|---------|----------|
| Queue/Batch APIs | `application/json` | `application/json` |
| PDF Conversion | `multipart/form-data` | `application/json` |
| Schema Chat | `application/json` | `application/json` |
| Addon APIs | `application/json` | `application/json` |

---

## Validation Rules

| Rule | Values |
|------|--------|
| Batch Status | `pending`, `processing`, `review`, `approved`, `failed` |
| Job Priority | Numeric (lower = higher priority, default: 10) |
| PDF Files | Must be valid PDF (validated by `isPdfFile()`) |
| Feature Flags | Boolean toggles |
| Tool Names | Must match defined tool list |
| Column IDs | Generated client-side (timestamp + random) |
| Addon Container Status | `pending`, `building`, `starting`, `running`, `stopped`, `failed` |
