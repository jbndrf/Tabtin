# Getting Started

This guide walks you through creating and configuring your first project.

**Prerequisite:** Read [Core Concepts](./concepts.md) first to understand batches and extraction modes.

## Prerequisites

You'll need a **Vision LLM API key** from one of these providers:
- [OpenRouter](https://openrouter.ai/) - Access to multiple models
- [Google AI Studio](https://aistudio.google.com/) - Gemini models

## Quick Glossary

| Term | What it means |
|------|---------------|
| API Key | A password that lets the app connect to an AI service |
| Token | How AI services measure work - more tokens = higher cost |
| DPI | Image quality setting - higher = clearer but slower |
| Model | The AI "brain" that reads your documents |

## Create a Project

1. From the Dashboard, click **Create Project**
2. Enter a name (e.g., "Seed Inventory")
3. Click **Create Project**
4. Open the project and go to **Settings**

## Configure Settings

Settings are organized into four tabs:

### Tab 1: Project

Basic info - name and description.

### Tab 2: Schema

Define **what data to extract**. Each column is a field you want.

| Setting | Description |
|---------|-------------|
| **Name** | Field name (e.g., "Product Name") |
| **Type** | text, number, date, currency, or boolean |
| **Description** | Instructions for the AI - be specific! |
| **Allowed Values** | Optional: limit to specific values |

**Writing good descriptions:**

| Instead of... | Write... |
|---------------|----------|
| `Price` | `The sale price. Look for the largest price shown, ignore "was" prices.` |
| `Date` | `The transaction date, top right corner. Format: YYYY-MM-DD.` |

**Tip:** Use the **Schema Chat** AI assistant to help design your schema.

### Tab 3: API

1. Select a provider (OpenRouter recommended)
2. Enter your API key
3. Click "Fetch Models" and select one

**Model recommendations:**

| Model | Speed | Accuracy | Cost |
|-------|-------|----------|------|
| Qwen 2.5 VL 72B | Slower | Highest | Higher |
| Gemini 2.0 Flash | Fast | Good | Moderate |
| Gemini Flash 1.5 8B | Fast | Good | Lower |

### Tab 4: Processing

**PDF Settings:**

| Setting | Recommendation |
|---------|----------------|
| DPI | 300 (increase for small text) |
| Format | PNG for documents |
| Max Size | 1024 |

**Extraction Features:**

| Setting | When to enable |
|---------|----------------|
| Bounding Boxes | When you want to see where AI found data |
| Confidence Scores | For important documents |
| Multi-Row | For tables/lists (see [Concepts](./concepts.md)) |
| TOON Output | Leave on unless you see errors |

Click **Save** when done.

## Process Documents

1. **Upload** - Click "Add Batch", select images or use camera
2. **Process** - Batch queues automatically, AI extracts data
3. **Review** - Check extracted values, edit if needed
4. **Approve** - Swipe right to approve, left to decline
5. **Export** - Download as CSV from Results page

## Next Steps

- [Inventory Tutorial](./inventory-project.md) - Single-row extraction example
- [Bank Statement Tutorial](./bank-statement.md) - Multi-row extraction example
- [Tips and Tricks](./tips-and-tricks.md) - Optimize results
