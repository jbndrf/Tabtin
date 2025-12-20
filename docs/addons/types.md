# Addon Types

TypeScript interfaces for the addon system.

**File:** `src/lib/types/addon.ts`

---

## AddonManifest

Manifest served by addon containers at `GET /manifest.json`.

```typescript
interface AddonManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  port: number;
  endpoints?: AddonEndpoint[];
  ui?: AddonUI;
  config_schema?: Record<string, AddonConfigField>;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique addon identifier |
| `name` | string | Display name |
| `version` | string | Semantic version |
| `description` | string | Brief description |
| `port` | number | Port addon listens on |
| `endpoints` | array | API endpoints |
| `ui` | object | UI components |
| `config_schema` | object | Configuration schema |

---

## AddonEndpoint

API endpoint definition.

```typescript
interface AddonEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  description?: string;
}
```

---

## AddonUI

UI capabilities declaration.

```typescript
interface AddonUI {
  menuItems?: AddonMenuItem[];
  pages?: AddonPage[];
}
```

---

## AddonMenuItem

Menu item for sidebar navigation.

```typescript
interface AddonMenuItem {
  id: string;
  label: string;
  icon?: string;
  href: string;
  section: AddonMenuSection;
}

type AddonMenuSection = 'main' | 'projects' | 'footer';
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique item identifier |
| `label` | string | Display text |
| `icon` | string | Lucide icon name |
| `href` | string | Navigation path |
| `section` | string | Menu section placement |

---

## AddonPage

Full page definition.

```typescript
interface AddonPage {
  id: string;
  path: string;
  title: string;
}
```

---

## AddonConfigField

Configuration field schema.

```typescript
interface AddonConfigField {
  type: 'string' | 'number' | 'boolean' | 'select';
  title: string;
  description?: string;
  secret?: boolean;
  required?: boolean;
  default?: string | number | boolean;
  options?: string[]; // For select type
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Input type |
| `title` | string | Label text |
| `description` | string | Help text |
| `secret` | boolean | Password input |
| `required` | boolean | Required field |
| `default` | varies | Default value |
| `options` | array | Select options |

---

## AddonContainerStatus

Container lifecycle status.

```typescript
type AddonContainerStatus =
  | 'pending'
  | 'building'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'failed';
```

| Status | Description |
|--------|-------------|
| `pending` | Initial state |
| `building` | Docker image being built |
| `starting` | Container starting up |
| `running` | Healthy and accepting requests |
| `stopped` | Stopped by user |
| `failed` | Error occurred |

---

## InstalledAddon

Installed addon record from PocketBase.

```typescript
interface InstalledAddon {
  id: string;
  user: string;
  name: string;
  docker_image: string;
  container_id?: string;
  container_status: AddonContainerStatus;
  internal_url?: string;
  manifest?: AddonManifest;
  config?: Record<string, unknown>;
  auth_token?: string;
  error_message?: string;
  created: string;
  updated: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | PocketBase record ID |
| `user` | string | Owner user ID |
| `name` | string | Display name |
| `docker_image` | string | Docker image name |
| `container_id` | string | Docker container ID |
| `container_status` | string | Current status |
| `internal_url` | string | Internal container URL |
| `manifest` | object | Manifest from container |
| `config` | object | User configuration |
| `auth_token` | string | Authentication token |
| `error_message` | string | Error details |
| `created` | string | Creation timestamp |
| `updated` | string | Update timestamp |

---

## AddonContext

Context passed to addon iframes via query params.

```typescript
interface AddonContext {
  addonId: string;
  userId: string;
  projectId?: string;
  batchId?: string;
  [key: string]: unknown;
}
```

### Usage in Addon UI

```javascript
const params = new URLSearchParams(window.location.search);
const ctx = params.get('ctx') ? JSON.parse(params.get('ctx')) : {};

console.log(ctx.addonId);   // "abc123"
console.log(ctx.userId);    // "user456"
console.log(ctx.projectId); // "proj789" or undefined
```

---

## AddonFileData

File data transferred from addons.

```typescript
interface AddonFileData {
  filename: string;
  mimeType: string;
  base64: string;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `filename` | string | File name with extension |
| `mimeType` | string | MIME type (e.g., `application/pdf`) |
| `base64` | string | Base64-encoded content |

---

## AddonPanelSize

Panel size options for floating panels.

```typescript
type AddonPanelSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
```

| Size | Description |
|------|-------------|
| `sm` | Small panel |
| `md` | Medium panel |
| `lg` | Large panel |
| `xl` | Extra large panel |
| `full` | Full screen |

---

## AddonPanelState

State for an open addon panel.

```typescript
interface AddonPanelState {
  addonId: string;
  path: string;
  title?: string;
  size: AddonPanelSize;
}
```

---

## AddonMessage

Messages sent from addon iframes to host via postMessage.

```typescript
type AddonMessage =
  | { type: 'TOAST'; payload: { message: string; variant?: 'success' | 'error' | 'info' } }
  | { type: 'NAVIGATE'; payload: { path: string } }
  | { type: 'REFRESH' }
  | { type: 'OPEN_PANEL'; payload: { path: string; title?: string; size?: AddonPanelSize } }
  | { type: 'CLOSE_PANEL' }
  | { type: 'ADDON_FILES'; payload: { files: AddonFileData[] } };
```

See [Communication Bridge](./communication.md) for usage details.

---

## AddonCallRequest

Request payload for calling addon endpoints via proxy.

```typescript
interface AddonCallRequest {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  data?: unknown;
}
```

---

## AddonCallResponse

Response from addon endpoints.

```typescript
interface AddonCallResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

---

## Usage Examples

### Typing Store Functions

```typescript
import type { InstalledAddon, AddonMenuItem } from '$lib/types/addon';

const addons: InstalledAddon[] = get(installedAddons);

const menuItems: AddonMenuItem[] = addons
  .filter(a => a.container_status === 'running')
  .flatMap(a => a.manifest?.ui?.menuItems ?? []);
```

### Typing API Responses

```typescript
import type { AddonCallResponse } from '$lib/types/addon';

interface Document {
  id: string;
  title: string;
}

const response: AddonCallResponse<Document[]> = await callAddon(
  addonId,
  '/documents',
  'GET'
);

if (response.success) {
  const documents = response.data;
}
```

### Typing Messages

```typescript
import type { AddonMessage } from '$lib/types/addon';

const message: AddonMessage = {
  type: 'TOAST',
  payload: { message: 'Success!', variant: 'success' }
};

window.parent.postMessage(message, '*');
```
