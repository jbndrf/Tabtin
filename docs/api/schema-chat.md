# Schema Chat API

LLM-powered schema design assistant for creating and modifying extraction schemas.

## POST /api/schema-chat

Interactive schema design with AI assistance.

**File:** `src/routes/api/schema-chat/+server.ts`

---

## Chat Mode

Use chat mode to have a conversation with the AI assistant about your schema.

### Request Body

```json
{
  "mode": "chat",
  "messages": [
    {
      "role": "user",
      "content": "string"
    }
  ],
  "settings": {
    "modelName": "string",
    "apiKey": "string",
    "endpoint": "string"
  },
  "currentColumns": [],
  "projectId": "string",
  "projectDescription": "string",
  "multiRowExtraction": false,
  "documentAnalyses": [],
  "featureFlags": {}
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| mode | string | Yes | Must be `chat` |
| messages | array | Yes | Conversation history |
| settings | object | Yes | LLM configuration |
| currentColumns | array | Yes | Current schema columns |
| projectId | string | Yes | Project identifier |
| projectDescription | string | No | Project context |
| multiRowExtraction | boolean | No | Multi-row extraction mode |
| documentAnalyses | array | No | Previous document analyses |
| featureFlags | object | No | Feature toggles |

### Settings Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| modelName | string | Yes | LLM model identifier |
| apiKey | string | Yes | API authentication key |
| endpoint | string | Yes | LLM API endpoint |

---

## Execute Mode

Use execute mode to apply approved tool calls.

### Request Body

```json
{
  "mode": "execute",
  "toolDecisions": [
    {
      "id": "string",
      "function": {
        "name": "string",
        "arguments": "string"
      },
      "approved": true
    }
  ],
  "currentColumns": [],
  "projectId": "string",
  "projectDescription": "string",
  "featureFlags": {}
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| mode | string | Yes | Must be `execute` |
| toolDecisions | array | Yes | Approval decisions for pending tools |
| currentColumns | array | Yes | Current schema columns |
| projectId | string | Yes | Project identifier |
| projectDescription | string | No | Project context |
| featureFlags | object | No | Feature toggles |

---

## Response

```json
{
  "success": true,
  "pendingTools": [],
  "questions": [],
  "imageRequests": [],
  "autoExecuteResults": {},
  "assistantMessage": "string"
}
```

| Field | Type | Description |
|-------|------|-------------|
| pendingTools | array | Tool calls requiring user approval |
| questions | array | Questions from the assistant |
| imageRequests | array | Requests for example images |
| autoExecuteResults | object | Results from auto-executed tools |
| assistantMessage | string | Assistant's text response |

---

## Tool Categories

### Approval-Required Tools

These tools require explicit user approval before execution:

| Tool | Description |
|------|-------------|
| `add_column` | Add a new column to the schema |
| `edit_column` | Modify an existing column |
| `remove_column` | Delete a column from the schema |
| `update_project_description` | Update project description |
| `set_multi_row_mode` | Enable/disable multi-row extraction |
| `set_feature_flags` | Update feature flag settings |

### Special UI Tools

These tools trigger special UI interactions:

| Tool | Description |
|------|-------------|
| `ask_questions` | Present questions to the user |
| `request_example_image` | Request an example document image |

### Auto-Execute Tools

These tools execute automatically without approval:

| Tool | Description |
|------|-------------|
| `get_current_schema` | Retrieve current schema definition |
| `get_project_settings` | Get project configuration |
| `get_feature_flags` | Get current feature flag states |
| `analyze_document` | Analyze an uploaded document |

---

## Column Definition

```typescript
interface Column {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'currency' | 'boolean';
  description: string;
  allowedValues: string;
  regex: string;
  expanded?: boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique column identifier |
| name | string | Display name |
| type | string | Data type (text, number, date, currency, boolean) |
| description | string | Extraction instructions |
| allowedValues | string | Comma-separated valid values for select types |
| regex | string | Validation pattern |
| expanded | boolean | UI state for column expansion |

---

## Question Types

```typescript
interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

interface Question {
  id: string;
  header: string;
  questionText: string;
  options: QuestionOption[];
  multiSelect: boolean;
  allowOther: boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique question identifier |
| header | string | Short header for the question |
| questionText | string | Full question text |
| options | array | Available options for the question |
| multiSelect | boolean | Allow multiple selections |
| allowOther | boolean | Allow custom "Other" input |

---

## Usage Example

```javascript
// Start a conversation
const response = await fetch('/api/schema-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'chat',
    messages: [
      { role: 'user', content: 'I need to extract invoice data' }
    ],
    settings: {
      model: 'gpt-4',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: 'your-api-key'
    },
    currentColumns: [],
    projectDescription: ''
  })
});

const result = await response.json();

// If there are pending tools, show approval UI
if (result.pendingTools.length > 0) {
  // Present tools to user for approval
  const approved = await showApprovalDialog(result.pendingTools);

  // Execute approved tools
  const executeResponse = await fetch('/api/schema-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'execute',
      toolDecisions: approved,
      currentColumns: result.currentColumns
    })
  });
}
```
