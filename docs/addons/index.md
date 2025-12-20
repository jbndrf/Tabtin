# Addon System

The addon system provides a Docker-based plugin architecture for extending the application with isolated, containerized extensions.

## Overview

Addons run in separate Docker containers and communicate with the main application through:
- **Secure proxy** - Server-side request forwarding with authentication
- **postMessage bridge** - Client-side communication for UI interactions

## Architecture

```
+-------------------+     +------------------+     +-------------------+
|   Browser/Client  |     |   Main Server    |     |  Addon Container  |
|                   |     |                  |     |                   |
| +---------------+ |     | +------------+   |     | +-------------+   |
| | iframe        |------>| | Proxy API  |------->| | Express App |   |
| | (addon UI)    |<------| | /api/addons|<-------| |             |   |
| +---------------+ |     | +------------+   |     | +-------------+   |
|        |          |     |       |          |     |       |           |
|        | postMsg  |     | +------------+   |     | /manifest.json    |
|        |          |     | | Addon      |   |     | /health           |
|        v          |     | | Manager    |   |     | /[endpoints]      |
| +---------------+ |     | +------------+   |     +-------------------+
| | Bridge Utils  | |     |       |          |
| | (addon-bridge)|<----->| +------------+   |
| +---------------+ |     | | Docker API |   |
|                   |     | +------------+   |
+-------------------+     +------------------+
```

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Addon Manager | `src/lib/server/addons/manager.ts` | Orchestrates addon lifecycle |
| Docker Utils | `src/lib/server/addons/docker.ts` | Container management |
| API Routes | `src/routes/api/addons/` | REST API for addon operations |
| Addon Bridge | `src/lib/utils/addon-bridge.ts` | postMessage communication |
| Addon Stores | `src/lib/stores/addons.ts` | Client-side state management |
| Addon Types | `src/lib/types/addon.ts` | TypeScript interfaces |

## Features

- **Isolation** - Each addon runs in its own Docker container
- **Resource limits** - 512MB RAM, 50% CPU per container
- **Persistent storage** - Dedicated `/data` directory per addon
- **Secure communication** - Token-based authentication
- **UI integration** - Menu items, full pages, and floating panels
- **Configuration** - Schema-defined settings with form generation

## Quick Start

1. **Create addon directory**
   ```
   addons/my-addon/
     Dockerfile
     manifest.json
     server.js
     ui/
   ```

2. **Define manifest**
   ```json
   {
     "id": "my-addon",
     "name": "My Addon",
     "version": "1.0.0",
     "port": 8081
   }
   ```

3. **Implement server**
   - `/health` endpoint returning 200
   - `/manifest.json` serving manifest
   - Auth middleware checking `X-Tabtin-Auth`

4. **Install via UI**
   - Go to Settings > Addons
   - Click Install on your addon

## Documentation

- [Addon API](./api.md) - REST endpoints for managing addons
- [Writing Addons](./writing-addons.md) - Step-by-step guide
- [Manifest Reference](./manifest.md) - Complete specification
- [Addon Types](./types.md) - TypeScript interfaces
- [Communication Bridge](./communication.md) - postMessage API
- [Security Model](./security.md) - Authentication and isolation
- [Example Addon](./examples.md) - Complete working example

## Container Lifecycle

```
Installation:
  pending --> building --> starting --> running
                                    --> failed (if error)

Runtime:
  running <--> stopped

Uninstall:
  * --> (removed)
```

| Status | Description |
|--------|-------------|
| `pending` | Initial state |
| `building` | Docker image being built |
| `starting` | Container starting, waiting for health |
| `running` | Healthy and accepting requests |
| `stopped` | Stopped by user |
| `failed` | Error occurred |

## Environment Variables

System-level configuration:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADDON_NETWORK` | `bridge` | Docker network mode |
| `ADDON_DATA_PATH` | `./data/addons` | Base path for addon data |
| `ADDONS_DIR` | `./addons` | Path to addons directory |
