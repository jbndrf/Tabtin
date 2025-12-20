# LLM Proxy API

Endpoints for fetching available models from LLM providers.

## POST /api/proxy-models

Fetch available models from LLM providers.

**File:** `src/routes/api/proxy-models/+server.ts`

### Request Body

```json
{
  "endpoint": "string",
  "apiKey": "string"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| endpoint | string | Yes | LLM API endpoint |
| apiKey | string | No | API authentication key |

### Endpoint Conversion

The proxy automatically converts chat completion endpoints to model listing endpoints:

| Input Endpoint | Converted To |
|----------------|--------------|
| `https://api.openai.com/v1/chat/completions` | `https://api.openai.com/v1/models` |
| `https://api.anthropic.com/v1/messages` | `https://api.anthropic.com/v1/models` |

### Response

```json
{
  "success": true,
  "models": [
    {
      "id": "gpt-4",
      "name": "GPT-4"
    },
    {
      "id": "gpt-3.5-turbo",
      "name": "GPT-3.5 Turbo"
    }
  ]
}
```

### Model Object

| Field | Type | Description |
|-------|------|-------------|
| id | string | Model identifier for API calls |
| name | string | Human-readable model name |

---

## Supported Providers

The proxy supports various LLM providers:

| Provider | Endpoint Pattern |
|----------|------------------|
| OpenAI | `https://api.openai.com/v1/*` |
| Anthropic | `https://api.anthropic.com/v1/*` |
| Azure OpenAI | `https://*.openai.azure.com/*` |
| Local/Self-hosted | Any OpenAI-compatible endpoint |

---

## Usage Example

```javascript
const response = await fetch('/api/proxy-models', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: 'sk-...'
  })
});

const { models } = await response.json();

// Populate model dropdown
models.forEach(model => {
  console.log(`${model.name} (${model.id})`);
});
```

---

## Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Invalid endpoint | Endpoint URL is malformed |
| 401 | Unauthorized | API key is invalid or missing |
| 500 | Provider error | Error from the LLM provider |
