# Authentication

Authentication flow and patterns used in the application.

## Server Hook Handler

**File:** `src/hooks.server.ts`

The server hook handler manages authentication for all requests:

1. Initializes PocketBase instance per request
2. Loads auth from cookies
3. Validates and refreshes tokens
4. Redirects unauthenticated users (except public routes)
5. Syncs auth state back to cookies

### Authentication Flow

```
Request
  |
  v
Initialize PocketBase
  |
  v
Load auth from cookies
  |
  v
Is token valid? --No--> Clear auth, redirect to /login
  |
  Yes
  |
  v
Refresh token if needed
  |
  v
Continue to route handler
  |
  v
Sync auth to cookies
  |
  v
Response
```

---

## Public Routes

The following routes do not require authentication:

| Route | Description |
|-------|-------------|
| `/login` | Login page |
| `/register` | Registration page |
| `/logout` | Logout handler |
| `/api/*` | API endpoints (auth checked per-endpoint) |
| `/_app/*` | SvelteKit internals |
| `/favicon` | Favicon |

---

## Admin Authentication Pattern

Used in server-side endpoints that need admin access to PocketBase:

```typescript
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.PUBLIC_POCKETBASE_URL);

await pb.collection('_superusers').authWithPassword(
  process.env.POCKETBASE_ADMIN_EMAIL,
  process.env.POCKETBASE_ADMIN_PASSWORD
);

// Now pb has admin privileges
const records = await pb.collection('users').getFullList();
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `POCKETBASE_ADMIN_EMAIL` | Admin email address |
| `POCKETBASE_ADMIN_PASSWORD` | Admin password |
| `PUBLIC_POCKETBASE_URL` | PocketBase server URL |

---

## PocketBase Configuration

**File:** `src/lib/config/pocketbase.ts`

Intelligent endpoint resolution based on environment:

| Environment | Resolution |
|-------------|------------|
| Client (browser) | `window.location.origin` with Vite/nginx proxy |
| Server (local) | Direct connection to PocketBase |
| Server (Docker) | Uses service name `backend:8090` |
| Fallback | `http://127.0.0.1:8090` |

### Usage

```typescript
import { pb } from '$lib/pocketbase';

// Client-side
const user = await pb.collection('users').authWithPassword(email, password);

// Access current user
const currentUser = pb.authStore.model;

// Check if authenticated
const isAuthenticated = pb.authStore.isValid;

// Logout
pb.authStore.clear();
```

---

## Cookie Configuration

Auth tokens are stored in cookies with the following settings:

| Setting | Value | Description |
|---------|-------|-------------|
| Name | `pb_auth` | Cookie name |
| HttpOnly | `false` | Accessible via JavaScript for client-side PocketBase SDK |
| Secure | `true` (production) | HTTPS only |
| SameSite | `lax` | CSRF protection |
| Path | `/` | Available on all routes |

---

## API Authentication

### User Authentication

API endpoints can access the authenticated user via locals:

```typescript
// In +server.ts
export async function GET({ locals }) {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401
    });
  }

  // Access user data
  const userId = locals.user.id;
  const userEmail = locals.user.email;

  // Continue with authorized operation
}
```

### Admin-Only Endpoints

For operations requiring admin privileges:

```typescript
import PocketBase from 'pocketbase';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

// Helper function (define locally in each endpoint)
async function getAdminPb(): Promise<PocketBase> {
  const pocketbaseUrl = publicEnv.PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
  const adminEmail = privateEnv.POCKETBASE_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = privateEnv.POCKETBASE_ADMIN_PASSWORD || 'admin1234';

  const pb = new PocketBase(pocketbaseUrl);
  pb.autoCancellation(false);
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  return pb;
}

export async function POST({ request, locals }) {
  // Check user is authenticated
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401
    });
  }

  // Get admin PocketBase instance
  const adminPb = await getAdminPb();

  // Perform admin operation
  await adminPb.collection('queue_jobs').update(jobId, { status: 'cancelled' });
}
```

---

## Addon Authentication

Addons use a separate token-based authentication system.

See [Addon Security](./addons/security.md) for details.

### Summary

1. Each addon receives a unique `auth_token` on installation
2. Server proxy adds `X-Tabtin-Auth` header to addon requests
3. Addons validate the token against `TABTIN_AUTH_TOKEN` env var

---

## Security Best Practices

### Token Handling

- Never expose tokens in client-side code
- Use HttpOnly cookies for session tokens
- Refresh tokens before expiration
- Clear tokens on logout

### Password Requirements

- Minimum 8 characters
- Enforced by PocketBase validation

### Session Management

- Sessions expire after inactivity
- Single session per user (configurable)
- Automatic token refresh

### CSRF Protection

- SameSite cookie attribute
- Origin header validation
- CSRF tokens for forms (optional)
