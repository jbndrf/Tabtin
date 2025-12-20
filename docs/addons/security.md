# Security Model

Authentication and isolation for the addon system.

## Overview

The addon system implements multiple layers of security:

1. **Token-based authentication** - Each addon has a unique auth token
2. **Container isolation** - Docker containers with resource limits
3. **Network isolation** - Bridge or custom network, no host access
4. **Data isolation** - Separate storage per addon per user
5. **Iframe sandboxing** - Restricted browser capabilities

---

## Authentication Flow

### Installation

When an addon is installed:

1. Generate cryptographically secure random token
2. Store token in PocketBase `installed_addons.auth_token`
3. Pass token to container via `TABTIN_AUTH_TOKEN` env var

```
Install Request
      |
      v
Generate Token (crypto.randomBytes)
      |
      v
Store in PocketBase
      |
      v
Create Container with TABTIN_AUTH_TOKEN={token}
      |
      v
Addon validates token on requests
```

### Runtime

For each request to an addon:

1. Main server receives request from browser
2. Server looks up addon's auth token from database
3. Server forwards request to addon with `X-Tabtin-Auth` header
4. Addon validates header against its `TABTIN_AUTH_TOKEN` env var

```
Browser
   |
   v
Main Server (authenticated user)
   |
   +-- Lookup addon record
   +-- Get auth_token
   |
   v
Forward to addon container
   + Header: X-Tabtin-Auth: {token}
   |
   v
Addon validates token
   |
   v
Process request
```

---

## Token Security

### Generation

Tokens are generated using Node.js crypto:

```typescript
import { randomBytes } from 'crypto';

const token = randomBytes(32).toString('hex');
// 64 character hex string
```

### Storage

- Stored in PocketBase `installed_addons.auth_token` field
- Only accessible to addon owner (row-level security)
- Never exposed to browser/frontend

### Validation

In addon server:

```javascript
const authenticate = (req, res, next) => {
  // Skip for public endpoints
  if (req.path === '/health' || req.path === '/manifest.json') {
    return next();
  }

  const token = req.headers['x-tabtin-auth'];
  if (token !== process.env.TABTIN_AUTH_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  next();
};
```

---

## Container Isolation

### Resource Limits

Each addon container is restricted:

| Resource | Limit | Description |
|----------|-------|-------------|
| Memory | 512 MB | Maximum RAM usage |
| CPU | 50% | CPU quota |
| PIDs | 100 | Process limit |

### Container Configuration

```typescript
const containerConfig = {
  Image: imageName,
  name: containerName,
  Env: [...],
  ExposedPorts: { [`${port}/tcp`]: {} },
  HostConfig: {
    Memory: 512 * 1024 * 1024, // 512MB
    NanoCpus: 500000000,       // 50% CPU
    PidsLimit: 100,
    RestartPolicy: { Name: 'unless-stopped' }
  }
};
```

### Labels

Containers are labeled for identification:

```typescript
Labels: {
  'tabtin.addon': 'true',
  'tabtin.addon.id': addonId,
  'tabtin.addon.user': userId
}
```

---

## Network Isolation

### Bridge Mode (Default)

- Container gets dynamic port on host
- Accessed via `127.0.0.1:{port}`
- No direct container-to-container communication

### Custom Network Mode

- Set via `ADDON_NETWORK` environment variable
- Containers can communicate by name
- Still isolated from host network

### Port Assignment

```typescript
// Find available port starting from 9000
function findAvailablePort(): number {
  let port = 9000;
  while (isPortInUse(port)) {
    port++;
  }
  return port;
}
```

---

## Data Isolation

### Directory Structure

```
data/
  addons/
    {addonId}/
      {userId}/
        ... addon data files
```

### Volume Mount

```typescript
Binds: [
  `${dataPath}:/data:rw`
]
```

### Permissions

- Each user gets isolated directory
- Addon can only access its own `/data`
- Container runs as non-root user

---

## Iframe Sandboxing

### Sandbox Attributes

Addon iframes have restricted permissions:

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  src="{addonUrl}"
/>
```

### Allowed Capabilities

| Attribute | Description |
|-----------|-------------|
| `allow-scripts` | Execute JavaScript |
| `allow-same-origin` | Access cookies/storage |
| `allow-forms` | Submit forms |
| `allow-popups` | Open new windows |

### Denied Capabilities

| Capability | Status |
|------------|--------|
| `allow-top-navigation` | Denied |
| `allow-downloads` | Denied |
| `allow-pointer-lock` | Denied |
| `allow-presentation` | Denied |
| `allow-modals` | Denied |

---

## Origin Validation

### postMessage Validation

The bridge validates message origins:

```typescript
function isValidAddonOrigin(origin: string): boolean {
  const addons = get(installedAddons);

  for (const addon of addons) {
    if (addon.internal_url) {
      const addonOrigin = new URL(addon.internal_url).origin;
      if (origin === addonOrigin) return true;
    }
  }

  // Development mode exception
  if (import.meta.env.DEV) {
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return true;
    }
  }

  return false;
}
```

### Request Validation

Proxy validates addon ownership:

```typescript
// Verify user owns this addon
const addon = await pb.collection('installed_addons')
  .getOne(addonId);

if (addon.user !== locals.user.id) {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403
  });
}
```

---

## PocketBase Access Rules

### installed_addons Collection

| Rule | Expression | Description |
|------|------------|-------------|
| Create | `@request.auth.id != ""` | Authenticated users only |
| View | `user.id = @request.auth.id` | Owner only |
| Update | `user.id = @request.auth.id` | Owner only |
| Delete | `user.id = @request.auth.id` | Owner only |

---

## Security Best Practices

### For Addon Developers

1. **Always validate auth token**
   ```javascript
   if (req.headers['x-tabtin-auth'] !== process.env.TABTIN_AUTH_TOKEN) {
     return res.status(401).json({ error: 'Unauthorized' });
   }
   ```

2. **Skip auth only for required endpoints**
   ```javascript
   const publicPaths = ['/health', '/manifest.json'];
   if (publicPaths.includes(req.path)) {
     return next();
   }
   ```

3. **Validate external API credentials**
   ```javascript
   if (!config.apiToken) {
     console.error('API token not configured');
     return res.status(500).json({ error: 'Addon not configured' });
   }
   ```

4. **Sanitize user input**
   ```javascript
   const query = sanitize(req.query.search);
   ```

5. **Don't log sensitive data**
   ```javascript
   console.log(`Token: ${config.token ? 'SET' : 'NOT SET'}`);
   // Never: console.log(`Token: ${config.token}`);
   ```

### For Platform Security

1. **Token rotation** - Tokens regenerated on restart
2. **Container restart limits** - Prevent restart loops
3. **Log monitoring** - Container logs accessible via API
4. **Health checks** - Automatic status monitoring
5. **Cleanup on uninstall** - Complete removal of data

---

## Threat Mitigation

| Threat | Mitigation |
|--------|------------|
| Token theft | Tokens never exposed to browser |
| Container escape | Resource limits, non-root user |
| Data leakage | User-isolated data directories |
| XSS in addon UI | Iframe sandbox |
| CSRF | Origin validation on postMessage |
| DoS | Container resource limits |
| Unauthorized access | Row-level PocketBase security |

---

## Troubleshooting

### Authentication Errors

**Symptom:** Addon returns 401 Unauthorized

**Check:**
1. Token is set: `echo $TABTIN_AUTH_TOKEN`
2. Header is present in request
3. Comparison is exact match (no whitespace)

### Container Access Issues

**Symptom:** Cannot reach addon container

**Check:**
1. Container is running: `docker ps`
2. Port is correct: check `internal_url`
3. Health check passing

### Data Permission Issues

**Symptom:** Cannot read/write to `/data`

**Check:**
1. Directory exists in container
2. Correct ownership/permissions
3. Volume mounted correctly
