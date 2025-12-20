# Communication Bridge

postMessage API for addon-to-host communication.

## Overview

Addons run in sandboxed iframes and communicate with the main application using the `postMessage` API. The bridge handles messages from addons and triggers appropriate actions in the host application.

**File:** `src/lib/utils/addon-bridge.ts`

---

## Message Types

```typescript
type AddonMessage =
  | { type: 'TOAST'; payload: { message: string; variant?: 'success' | 'error' | 'info' } }
  | { type: 'NAVIGATE'; payload: { path: string } }
  | { type: 'REFRESH' }
  | { type: 'OPEN_PANEL'; payload: { path: string; title?: string; size?: AddonPanelSize } }
  | { type: 'CLOSE_PANEL' }
  | { type: 'ADDON_FILES'; payload: { files: AddonFileData[] } };
```

---

## TOAST

Show a toast notification to the user.

### Payload

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `message` | string | Yes | - | Notification text |
| `variant` | string | No | `info` | Style variant |

### Variants

| Variant | Description |
|---------|-------------|
| `success` | Green success notification |
| `error` | Red error notification |
| `info` | Blue informational notification |

### Example

```javascript
// Success toast
window.parent.postMessage({
  type: 'TOAST',
  payload: {
    message: 'Document imported successfully',
    variant: 'success'
  }
}, '*');

// Error toast
window.parent.postMessage({
  type: 'TOAST',
  payload: {
    message: 'Failed to connect to server',
    variant: 'error'
  }
}, '*');

// Info toast (default)
window.parent.postMessage({
  type: 'TOAST',
  payload: {
    message: 'Processing...'
  }
}, '*');
```

---

## NAVIGATE

Navigate to a route in the main application.

### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Route path to navigate to |

### Example

```javascript
// Navigate to a project
window.parent.postMessage({
  type: 'NAVIGATE',
  payload: { path: '/projects/abc123' }
}, '*');

// Navigate to home
window.parent.postMessage({
  type: 'NAVIGATE',
  payload: { path: '/' }
}, '*');

// Navigate to settings
window.parent.postMessage({
  type: 'NAVIGATE',
  payload: { path: '/settings/addons' }
}, '*');
```

---

## REFRESH

Refresh the current page data.

### Payload

None required.

### Example

```javascript
// After making changes, refresh to show updates
window.parent.postMessage({ type: 'REFRESH' }, '*');
```

### Behavior

Calls SvelteKit's `invalidateAll()` to refresh all load functions on the current page.

---

## OPEN_PANEL

Open a floating panel with addon content.

### Payload

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `path` | string | Yes | - | Path within addon to display |
| `title` | string | No | - | Panel header title |
| `size` | string | No | `md` | Panel size |

### Panel Sizes

| Size | Description |
|------|-------------|
| `sm` | Small (400px) |
| `md` | Medium (600px) |
| `lg` | Large (800px) |
| `xl` | Extra large (1000px) |
| `full` | Full screen |

### Example

```javascript
// Open details panel
window.parent.postMessage({
  type: 'OPEN_PANEL',
  payload: {
    path: '/details/123',
    title: 'Document Details',
    size: 'lg'
  }
}, '*');

// Open full-screen editor
window.parent.postMessage({
  type: 'OPEN_PANEL',
  payload: {
    path: '/editor',
    title: 'Document Editor',
    size: 'full'
  }
}, '*');
```

### Panel URL

The panel loads the addon page at:
```
/api/addons/proxy/{addonId}{path}?ctx={context}
```

---

## CLOSE_PANEL

Close the currently open floating panel.

### Payload

None required.

### Example

```javascript
// Close panel after completing action
window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');
```

---

## ADDON_FILES

Transfer files from the addon to the main application.

### Payload

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | array | Yes | Array of file data objects |

### File Data Object

| Field | Type | Description |
|-------|------|-------------|
| `filename` | string | File name with extension |
| `mimeType` | string | MIME type |
| `base64` | string | Base64-encoded content |

### Example

```javascript
// Send a PDF file
window.parent.postMessage({
  type: 'ADDON_FILES',
  payload: {
    files: [{
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      base64: 'JVBERi0xLjQK...'
    }]
  }
}, '*');

// Send multiple images
window.parent.postMessage({
  type: 'ADDON_FILES',
  payload: {
    files: [
      {
        filename: 'page1.png',
        mimeType: 'image/png',
        base64: 'iVBORw0KGgo...'
      },
      {
        filename: 'page2.png',
        mimeType: 'image/png',
        base64: 'iVBORw0KGgo...'
      }
    ]
  }
}, '*');
```

### Handling in Main App

Listen for the `addon-files-received` custom event:

```javascript
window.addEventListener('addon-files-received', (event) => {
  const { files, addonId } = event.detail;

  files.forEach(file => {
    console.log(`Received ${file.filename} from ${addonId}`);

    // Convert base64 to blob
    const byteChars = atob(file.base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNumbers[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: file.mimeType });

    // Use the blob...
  });
});
```

---

## Complete Example

Full workflow showing multiple message types:

```javascript
// In addon frontend JavaScript

// Get context
const params = new URLSearchParams(window.location.search);
const ctx = params.get('ctx') ? JSON.parse(params.get('ctx')) : {};
const API_BASE = `/api/addons/proxy/${ctx.addonId}`;

// Document selection handler
async function selectDocument(docId) {
  // Show loading toast
  window.parent.postMessage({
    type: 'TOAST',
    payload: { message: 'Loading document...' }
  }, '*');

  try {
    // Fetch document
    const response = await fetch(`${API_BASE}/documents/${docId}/download`);
    const { success, data, error } = await response.json();

    if (!success) throw new Error(error);

    // Send file to main app
    window.parent.postMessage({
      type: 'ADDON_FILES',
      payload: {
        files: [{
          filename: data.filename,
          mimeType: data.mimeType,
          base64: data.base64
        }]
      }
    }, '*');

    // Show success toast
    window.parent.postMessage({
      type: 'TOAST',
      payload: {
        message: `Imported ${data.filename}`,
        variant: 'success'
      }
    }, '*');

    // Close panel if open
    window.parent.postMessage({ type: 'CLOSE_PANEL' }, '*');

    // Navigate to project
    if (ctx.projectId) {
      window.parent.postMessage({
        type: 'NAVIGATE',
        payload: { path: `/projects/${ctx.projectId}/images/add` }
      }, '*');
    }

  } catch (err) {
    // Show error toast
    window.parent.postMessage({
      type: 'TOAST',
      payload: {
        message: err.message,
        variant: 'error'
      }
    }, '*');
  }
}

// View details handler
function viewDetails(docId) {
  window.parent.postMessage({
    type: 'OPEN_PANEL',
    payload: {
      path: `/details/${docId}`,
      title: 'Document Details',
      size: 'lg'
    }
  }, '*');
}
```

---

## Bridge Implementation

### Initialization

The bridge is initialized in the root layout:

```typescript
import { initAddonBridge, destroyAddonBridge } from '$lib/utils/addon-bridge';

onMount(() => {
  initAddonBridge();
  return () => destroyAddonBridge();
});
```

### Origin Validation

The bridge validates message origins against installed addon URLs:

```typescript
function isValidAddonOrigin(origin: string): boolean {
  const addons = get(installedAddons);

  for (const addon of addons) {
    if (addon.internal_url) {
      const addonOrigin = new URL(addon.internal_url).origin;
      if (origin === addonOrigin) return true;
    }
  }

  // Allow localhost in development
  if (import.meta.env.DEV && origin.includes('localhost')) {
    return true;
  }

  return false;
}
```

### Message Handler

```typescript
function handleAddonMessage(event: MessageEvent) {
  if (!isValidAddonOrigin(event.origin)) return;

  const { type, payload } = event.data;

  switch (type) {
    case 'TOAST':
      toast[payload.variant || 'info'](payload.message);
      break;
    case 'NAVIGATE':
      goto(payload.path);
      break;
    case 'REFRESH':
      invalidateAll();
      break;
    case 'OPEN_PANEL':
      openAddonPanel(addonId, payload.path, payload.title, payload.size);
      break;
    case 'CLOSE_PANEL':
      closeAddonPanel();
      break;
    case 'ADDON_FILES':
      window.dispatchEvent(new CustomEvent('addon-files-received', {
        detail: { files: payload.files, addonId }
      }));
      break;
  }
}
```

---

## Security Considerations

1. **Origin validation** - Only accept messages from known addon origins
2. **Type checking** - Validate message structure before processing
3. **Sandboxing** - Iframe sandbox limits addon capabilities
4. **No arbitrary code** - Messages trigger predefined actions only
