# Coolify Multi-Tenant Provisioning System

This document explains how to use the provisioning system to automatically create customer instances with custom domains via Coolify.

## Architecture Overview

```
                                    +------------------+
                                    |   Coolify API    |
                                    +--------+---------+
                                             |
+------------------+                         |
|  Provisioning    |   Creates apps via API  |
|     Server       +------------------------->
|  (Node.js)       |                         |
+--------+---------+                         |
         |                                   |
         | User registers                    |
         |                                   v
+--------+---------+              +----------+----------+
|   Customer       |              |    Git Repository   |
|   Registration   |              |    (tabtin.git)     |
|   Form           |              +----------+----------+
+------------------+                         |
                                             | Coolify clones & builds
                                             v
                              +-----------------------------+
                              |   Customer Instance         |
                              |   - frontend container      |
                              |   - backend container       |
                              |   - custom domain           |
                              |   - custom env vars         |
                              +-----------------------------+
```

## Key Components

### 1. Provisioning Server (`provisioning/server.js`)

A Node.js HTTP server that:
- Serves a registration form at `http://localhost:3333`
- Accepts POST requests to `/provision` with customer data
- Creates Coolify environments and applications via API
- Sets custom environment variables per customer
- Configures dynamic Traefik labels via custom build commands

### 2. Build Script (`scripts/coolify-build.sh`)

Called during Coolify's build phase to:
- Generate `docker-compose.override.yaml` with Traefik labels
- Inject the custom domain dynamically
- Tell Traefik which network to use (critical for multi-network containers)

### 3. Docker Compose Files

- `docker-compose.yaml` - Main compose file (no hardcoded Traefik labels)
- `docker-compose.override.yaml` - Generated at build time with customer-specific Traefik labels

## Setup Instructions

### Prerequisites

1. Coolify instance running with Traefik proxy
2. Git repository accessible to Coolify (via deploy key or GitHub App)
3. Wildcard DNS pointing to your server (e.g., `*.tabtin.bndrf.de`)

### Step 1: Configure Coolify

1. Create a project in Coolify (note the `PROJECT_UUID`)
2. Configure your server (note the `SERVER_UUID`)
3. Set up a deploy key or GitHub App (note the `PRIVATE_KEY_UUID`)
4. Configure wildcard domain on the server settings

### Step 2: Update Provisioning Server Config

Edit `provisioning/server.js` and update these constants:

```javascript
const COOLIFY_URL = 'http://your-coolify-instance:8000';
const COOLIFY_TOKEN = process.env.COOLIFY_TOKEN || 'your-api-token';
const PROJECT_UUID = 'your-project-uuid';
const SERVER_UUID = 'your-server-uuid';
const GIT_REPO = 'git@your-git-server:user/repo.git';
const PRIVATE_KEY_UUID = 'your-deploy-key-uuid';
```

### Step 3: Run the Provisioning Server

```bash
# Set your Coolify API token
export COOLIFY_TOKEN=your_token_here

# Run the server
node provisioning/server.js
```

The server starts at `http://localhost:3333`

## How It Works

### Customer Registration Flow

1. Customer fills out the registration form (username, email, password, tier)
2. Provisioning server receives the request
3. Server creates a new Coolify environment named after the customer
4. Server creates an application in that environment
5. Server sets environment variables:
   - `POCKETBASE_ADMIN_EMAIL` - Customer's email
   - `POCKETBASE_ADMIN_PASSWORD` - Customer's password
   - `CUSTOM_DOMAIN` - e.g., `customer.tabtin.bndrf.de`
   - Tier-specific limits (concurrent projects, rate limits, etc.)
6. Server configures custom build/start commands
7. Server triggers deployment

### Traefik Label Injection

The key challenge solved: Coolify's docker-compose apps don't support dynamic domains via environment variables in labels.

**Solution:** Use custom build commands to generate labels at build time.

The build command:
```bash
CUSTOM_DOMAIN=customer.tabtin.bndrf.de APP_UUID=abc123 sh ./scripts/coolify-build.sh
```

This generates `docker-compose.override.yaml`:
```yaml
services:
  frontend:
    labels:
      - traefik.enable=true
      - "traefik.http.routers.frontend-abc123.rule=Host(`customer.tabtin.bndrf.de`)"
      - traefik.http.routers.frontend-abc123.entryPoints=http
      - traefik.http.services.frontend-abc123.loadbalancer.server.port=80
      - traefik.docker.network=abc123
```

**Critical:** The `traefik.docker.network` label is required because Coolify adds containers to multiple networks. Without it, Traefik may try to route to the wrong network.

### Custom Start Command

```bash
docker compose --env-file /artifacts/build-time.env -f docker-compose.yaml -f docker-compose.override.yaml up -d
```

This:
- Uses Coolify's build-time environment file
- Merges the base compose with the generated override
- Starts the containers with correct Traefik labels

## Tier Configuration

Define customer tiers in `server.js`:

```javascript
const TIERS = {
  free: {
    INSTANCE_MAX_CONCURRENT_PROJECTS: '1',
    INSTANCE_MAX_PARALLEL_REQUESTS: '5',
    INSTANCE_MAX_REQUESTS_PER_MINUTE: '30'
  },
  paid: {
    INSTANCE_MAX_CONCURRENT_PROJECTS: '10',
    INSTANCE_MAX_PARALLEL_REQUESTS: '50',
    INSTANCE_MAX_REQUESTS_PER_MINUTE: '300'
  }
};
```

## API Endpoints

### POST /provision

Create a new customer instance.

**Request Body:**
```json
{
  "username": "customer-name",
  "email": "admin@example.com",
  "password": "secure-password",
  "tier": "free"
}
```

**Response:**
```json
{
  "success": true,
  "url": "https://customer-name.tabtin.bndrf.de",
  "uuid": "abc123...",
  "note": "Instance is deploying. May take a few minutes to be ready."
}
```

## Troubleshooting

### Gateway Timeout / 502 Errors

1. Check if container is running: `docker ps | grep <customer-name>`
2. Check container labels: `docker inspect <container> --format '{{json .Config.Labels}}' | jq .`
3. Verify `traefik.docker.network` label is set correctly
4. Check Traefik logs: `docker logs coolify-proxy 2>&1 | grep <customer-name>`

### Traefik Not Discovering Container

Most common cause: container is on multiple networks and Traefik picks the wrong one.

**Fix:** Ensure `traefik.docker.network=<APP_UUID>` label is present.

Test Traefik routing:
```bash
curl -H "Host: customer.tabtin.bndrf.de" http://localhost:80 -v
```

### Environment Variables Not Found

If deployment fails with "required variable X is missing":

Ensure the start command includes `--env-file /artifacts/build-time.env`:
```bash
docker compose --env-file /artifacts/build-time.env -f docker-compose.yaml -f docker-compose.override.yaml up -d
```

## File Structure

```
project/
├── provisioning/
│   ├── server.js       # Provisioning API server
│   └── index.html      # Registration form UI
├── scripts/
│   └── coolify-build.sh # Traefik label generator
├── docker-compose.yaml  # Main compose (no Traefik labels)
└── PROVISIONING.md      # This file
```

## Security Considerations

1. **API Token:** Store `COOLIFY_TOKEN` securely, not in code
2. **Password Handling:** Consider hashing passwords before storage
3. **Rate Limiting:** Add rate limiting to the provisioning endpoint
4. **Input Validation:** Username is sanitized to alphanumeric + hyphens only
5. **Network Isolation:** Each customer gets their own Coolify environment

## Extending the System

### Predefined LLM Endpoints

The provisioning server includes predefined LLM endpoints that are deployed to every customer instance. Edit the `PREDEFINED_ENDPOINTS` array in `server.js`:

```javascript
const PREDEFINED_ENDPOINTS = [
  {
    alias: 'Qwen3-VL-8B',
    endpoint: 'http://192.168.1.47:8001/v1/chat/completions',
    apiKey: 'sk-anykey',
    model: 'unsloth/Qwen3-VL-8B-Instruct-FP8',
    maxInputTokensPerDay: 10000000,
    maxOutputTokensPerDay: 2000000,
    description: 'Local Qwen3 VL 8B - Higher quality',
    providerType: 'openai'
  },
  // Add more endpoints...
];
```

The array is automatically converted to a JSON string via `JSON.stringify()` - this handles all escaping issues when passing complex JSON through the Coolify API.

### Adding More Environment Variables

Edit `server.js` in the `createInstance` function:

```javascript
const envVars = {
  POCKETBASE_ADMIN_EMAIL: email,
  POCKETBASE_ADMIN_PASSWORD: password,
  CUSTOM_DOMAIN: customDomain,
  PREDEFINED_ENDPOINTS: JSON.stringify(PREDEFINED_ENDPOINTS),
  YOUR_NEW_VAR: 'value',
  ...tierConfig
};
```

### Adding HTTPS Support

Update `coolify-build.sh` to include HTTPS router:

```bash
cat > docker-compose.override.yaml << EOF
services:
  frontend:
    labels:
      - traefik.enable=true
      - "traefik.http.routers.frontend-${APP_UUID}-http.rule=Host(\`${CUSTOM_DOMAIN}\`)"
      - traefik.http.routers.frontend-${APP_UUID}-http.entryPoints=http
      - traefik.http.routers.frontend-${APP_UUID}-http.middlewares=redirect-to-https
      - "traefik.http.routers.frontend-${APP_UUID}-https.rule=Host(\`${CUSTOM_DOMAIN}\`)"
      - traefik.http.routers.frontend-${APP_UUID}-https.entryPoints=https
      - traefik.http.routers.frontend-${APP_UUID}-https.tls=true
      - traefik.http.routers.frontend-${APP_UUID}-https.tls.certresolver=letsencrypt
      - traefik.http.services.frontend-${APP_UUID}.loadbalancer.server.port=80
      - traefik.docker.network=${APP_UUID}
EOF
```

### Integrating with Payment Systems

Add Stripe/payment webhook handling to `server.js` to:
1. Verify payment before provisioning
2. Upgrade/downgrade tiers
3. Handle subscription cancellation
