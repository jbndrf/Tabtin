# Why Tabtin

Tabtin is built for users who want control over their data and developers who want to extend functionality without bloating the core application.

## Self-Hosted, Privacy-First

Your data never leaves your machine. Tabtin runs entirely on your own hardware:

- **No cloud dependency** - Works offline once installed
- **Single-file database** - PocketBase stores everything in one portable SQLite file
- **Your images stay local** - Nothing is uploaded to third-party servers (except the LLM API you choose)

## Local LLM Support

Run vision models on your own hardware with no API costs:

- **OpenAI-compatible endpoints** - Connect any local inference server (llama.cpp, Ollama, vLLM, etc.)
- **Tested with Qwen3-VL** - Full feature support including bounding boxes
- **Adjustable settings** - Lower DPI and image dimensions for resource-constrained setups

If you have the hardware, you can process images without sending anything to external APIs.

## Lean Core, Powerful Addons

The core application focuses on doing one thing well: extracting structured data from images. Everything else is optional.

### The Addon System

Instead of cramming every possible feature into the main app, Tabtin uses a Docker-based addon architecture:

| Benefit | Description |
|---------|-------------|
| **Non-bloated core** | The main app stays fast and focused |
| **Isolated execution** | Each addon runs in its own container with resource limits |
| **Any language** | Write addons in Node.js, Python, Go, or anything that runs in Docker |
| **Persistent storage** | Addons get their own `/data` directory that survives restarts |
| **UI integration** | Addons can add menu items, full pages, and floating panels |

### What Addons Can Do

- Export data to external systems (Paperless-ngx, Notion, spreadsheets)
- Add custom processing pipelines
- Integrate with other self-hosted services
- Implement specialized workflows for specific use cases

### Writing Your Own

Creating an addon is straightforward:

1. Create a directory in `/addons`
2. Add a `manifest.json` defining your addon
3. Implement a simple HTTP server with a `/health` endpoint
4. Build and install via the Settings UI

See the [Addon Documentation](../addons/index.md) for the full guide.

## Developer-Friendly

Tabtin is built with modern, maintainable technologies:

| Component | Technology |
|-----------|------------|
| Frontend | SvelteKit, TypeScript |
| Backend | PocketBase (Go-based, embedded) |
| Database | SQLite (single file) |
| Containerization | Docker, Docker Compose |
| Addons | Docker containers with REST APIs |

### Easy Development Setup

```bash
npm install
npm run backend   # Start PocketBase
npm run dev       # Start SvelteKit dev server
```

Both servers are accessible from any device on your network for mobile testing.

### No Vendor Lock-In

- Open source and modifiable
- Standard SQLite database - export your data anytime
- PocketBase admin UI available at port 8090 for direct database access
- CSV export built into the app

## Comparison

| Feature | Tabtin | Cloud OCR Services |
|---------|--------|-------------------|
| Data privacy | Your server | Their servers |
| Ongoing costs | Your hardware + optional API | Per-page pricing |
| Customization | Full control | Limited |
| Offline use | Yes | No |
| Extensions | Addon system | Usually none |

## When Tabtin Fits

Tabtin is a good choice when you:

- Want to keep your documents private
- Have recurring extraction tasks (inventories, receipts, forms)
- Want to experiment with local vision models
- Need custom integrations with other self-hosted services
- Prefer owning your infrastructure

## Getting Started

Ready to try it?

1. [Installation Guide](../index.md) - Set up with Docker
2. [Getting Started](./getting-started.md) - Create your first project
3. [Addon Documentation](../addons/index.md) - Extend functionality
