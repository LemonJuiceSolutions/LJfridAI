# Like AI Said - API Documentation

## REST API

Base URL: `http://localhost:3000/api`

### Trees

#### List all trees
```http
GET /api/trees
```

**Response:**
```json
{
  "success": true,
  "trees": [
    {
      "id": "clx123...",
      "name": "Gestione Resi",
      "description": "...",
      "createdAt": "2024-12-14T..."
    }
  ]
}
```

---

#### Create a new tree
```http
POST /api/trees
Content-Type: application/json

{
  "description": "Per una richiesta di reso, controlla la data di acquisto...",
  "openRouterApiKey": "sk-or-...",  // optional
  "openRouterModel": "google/gemini-2.0-flash-001"  // optional
}
```

**Response (201):**
```json
{
  "success": true,
  "tree": {
    "id": "clx123...",
    "name": "Gestione Resi Prodotti",
    "description": "...",
    "naturalLanguageDecisionTree": "Per una richiesta di reso...",
    "jsonDecisionTree": "{...}",
    "questionsScript": "1. La data di acquisto...",
    "createdAt": "2024-12-14T..."
  }
}
```

---

#### Get a specific tree
```http
GET /api/trees/:id
```

**Response:**
```json
{
  "success": true,
  "tree": {
    "id": "clx123...",
    "name": "Gestione Resi",
    "description": "...",
    "naturalLanguageDecisionTree": "...",
    "jsonDecisionTree": "{...}",
    "questionsScript": "...",
    "createdAt": "..."
  }
}
```

---

#### Delete a tree
```http
DELETE /api/trees/:id
```

**Response:**
```json
{
  "success": true,
  "message": "Albero eliminato con successo"
}
```

---

#### Query a tree (DetAI)
```http
POST /api/trees/:id/query
Content-Type: application/json

{
  "question": "Il cliente ha acquistato 15 giorni fa, prodotto sigillato",
  "history": "",  // optional - conversation history
  "currentAnswer": "",  // optional - user's current answer
  "openRouterApiKey": "sk-or-...",  // optional
  "openRouterModel": "google/gemini-2.0-flash-001"  // optional
}
```

**Response:**
```json
{
  "success": true,
  "diagnosis": {
    "question": "Il prodotto è stato aperto?",
    "options": ["Sì", "No"],
    "isFinalDecision": false,
    "treeName": "Gestione Resi",
    "nodeIds": ["node_123"],
    "media": [],
    "links": [],
    "triggers": []
  }
}
```

---

## MCP Server

The MCP server allows AI assistants (Claude, Cursor, etc.) to interact with decision trees.

### Setup

1. Ensure the Next.js app is running: `http://localhost:3000`

2. Configure in Claude Desktop (`~/.config/claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "likeaisaid": {
      "command": "npx",
      "args": ["ts-node", "/path/to/LikeAiSaid/src/mcp/server.ts"],
      "env": {
        "LIKEAISAID_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `create_tree` | Create a new decision tree from description |
| `list_trees` | List all available trees |
| `get_tree` | Get details of a specific tree |
| `query_tree` | Query a tree with DetAI |
| `delete_tree` | Delete a tree |

### Available Resources

| URI | Description |
|-----|-------------|
| `trees://list` | JSON list of all trees |

---

## Examples

### cURL - Create and Query

```bash
# Create a tree
curl -X POST http://localhost:3000/api/trees \
  -H "Content-Type: application/json" \
  -d '{"description": "Per una richiesta di reso, controlla la data. Se entro 30 giorni, approva. Altrimenti rifiuta."}'

# Query the tree
curl -X POST http://localhost:3000/api/trees/clx123.../query \
  -H "Content-Type: application/json" \
  -d '{"question": "Cliente con prodotto acquistato ieri"}'
```

### Python

```python
import requests

# Create tree
response = requests.post(
    "http://localhost:3000/api/trees",
    json={"description": "Se il prodotto è difettoso, sostituisci. Altrimenti rimborsa."}
)
tree = response.json()["tree"]

# Query
diagnosis = requests.post(
    f"http://localhost:3000/api/trees/{tree['id']}/query",
    json={"question": "Prodotto rotto dopo 2 giorni"}
).json()["diagnosis"]

print(diagnosis["question"])
```
