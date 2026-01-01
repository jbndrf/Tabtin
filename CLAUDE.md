# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Tabtin** - A self-hostable, mobile-first web app for extracting structured data from images using vision LLMs. Users define table schemas (columns), upload images, and the app extracts data into spreadsheet-like tables with review workflows.

## Development Commands

```bash
# Start frontend dev server (localhost:5173)
npm run dev

# Start PocketBase backend (localhost:8090)
npm run backend

# Build frontend for production
npm run build

# Build Go backend
npm run build:backend

# Run type checking
npm run check

# Regenerate PocketBase TypeScript types after schema changes
npm run typegen

# Format code
npm run format

# Lint
npm run lint
```

Development requires running both `npm run backend` and `npm run dev` in separate terminals.

## Architecture

### Tech Stack
- **Frontend**: SvelteKit 5 with Svelte 5 (runes), TypeScript, TailwindCSS 4
- **Backend**: PocketBase (Go) with custom extensions
- **UI Components**: shadcn-svelte (bits-ui based)
- **Forms**: sveltekit-superforms + Zod validation
- **i18n**: Paraglide JS (en/de locales in `messages/`)

### Key Directories

```
src/
  routes/
    (app)/          # Authenticated app routes (projects, dashboard, settings)
    api/            # SvelteKit API endpoints (batches, queue, schema-chat, pdf)
    login/register/ # Auth pages
  lib/
    components/     # Svelte components
      ui/           # shadcn-svelte primitives
      app/          # App-specific components
    server/         # Server-only code
      queue/        # Background job processing
      processing/   # LLM processing logic
    stores/         # Svelte stores
    types/          # TypeScript type definitions
    pocketbase-types.ts  # Auto-generated from DB schema

pb/                 # PocketBase backend
  main.go           # Go entry point with webauthn plugin
  pb_migrations/    # Database migrations
  pb_hooks/         # JavaScript hooks
  pb_data/          # Database files (gitignored)
```

### Data Flow

1. **Projects** contain table schema definitions and LLM settings
2. **Image Batches** group images for processing (front/back of items)
3. **Extraction Rows** store extracted data per batch with review status
4. **Queue Jobs** manage async processing with retry logic

### Authentication

- PocketBase handles auth; SvelteKit hooks.server.ts syncs auth state
- `event.locals.pb` provides typed PocketBase client in server routes
- Cookie-based sessions with auto-refresh

### PocketBase Integration

- Types auto-generated via `npm run typegen` from `pb/pb_data/data.db`
- Vite proxies `/api/collections`, `/api/files`, `/api/realtime` to PocketBase in dev
- Production uses nginx to proxy to backend service

### Background Processing

- Queue worker starts automatically in hooks.server.ts
- Jobs stored in `queue_jobs` collection
- Processes image batches through vision LLMs

## Code Guidelines

- Consolidate duplicate processes into single implementations; remove redundant code after merging
- No backwards compatibility needed - app is under active construction
- Use `$lib/` alias for imports from src/lib
- Use `$paraglide/` alias for i18n messages
