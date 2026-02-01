# AI Agent Integration Guide

## Overview

This guide explains how to integrate the new AI Agent system into the existing node editing dialog. The new agent system provides:

1. **Context-aware understanding**: The agent understands input table columns and script code
2. **Clarification requests**: The agent asks for clarification when it doesn't understand
3. **Persistent conversation history**: Conversations are saved in the database (SQL and Python)

## Components Created

### 1. Database Schema (`prisma/schema.prisma`)
- `AgentConversation` model: Stores conversation history for SQL and Python agents
- Includes: nodeId, agentType, script, tableSchema, inputTables, messages

### 2. AI Flows
- `src/ai/flows/sql-agent-flow.ts`: SQL agent flow
- `src/ai/flows/python-agent-flow.ts`: Python agent flow
- Both use Genkit with Gemini 2.5 Flash model

### 3. API Endpoints
- `src/app/api/agents/chat/route.ts`: REST API for agent interactions
  - POST: Send message to agent
  - GET: Load conversation history
  - DELETE: Clear conversation

### 4. UI Component
- `src/components/agents/agent-chat.tsx`: Reusable chat component
  - Loads conversation history on mount
  - Sends messages to agent API
  - Updates script when agent provides new code
  - Shows clarification requests

### 5. Types
- `src/lib/types.ts`: Added agent-related types
  - `AgentChatMessage`
  - `AgentConversation`
  - `AgentRequest`
  - `AgentResponse`

## Integration Steps

### Step 1: Import the AgentChat component

In `src/components/rule-sage/edit-node-dialog.tsx`, add the import:

```typescript
import { AgentChat } from '@/components/agents/agent-chat';
```

### Step 2: Replace SQL Chat Section

Find the SQL chat section (around line 1718-1910) and replace it with:

```tsx
{/* RIGHT COLUMN: AI Agent */}
<div className="order-1 lg:order-2">
  <AgentChat
    nodeId={nodePath}
    agentType="sql"
    script={sqlQuery}
    tableSchema={getTableSchema(selectedPipelines, availableInputTables)}
    inputTables={getInputTables(selectedPipelines, availableInputTables)}
    onScriptUpdate={(newScript) => {
      setSqlQuery(newScript);
      toast({ title: "Query Aggiornata", description: "L'editor SQL è stato aggiornato." });
    }}
  />
</div>
```

### Step 3: Replace Python Chat Section

Find the Python chat section (around line 2164-2268) and replace it with:

```tsx
{/* RIGHT COLUMN: AI Agent */}
<div className="order-1 lg:order-2">
  <AgentChat
    nodeId={nodePath}
    agentType="python"
    script={pythonCode}
    tableSchema={getTableSchema(pythonSelectedPipelines, availableInputTables)}
    inputTables={getInputTables(pythonSelectedPipelines, availableInputTables)}
    onScriptUpdate={(newScript) => {
      setPythonCode(newScript);
      toast({ title: "Codice Aggiornato", description: "Lo script Python è stato aggiornato." });
    }}
  />
</div>
```

### Step 4: Add Helper Functions

Add these helper functions to extract table schema and input data:

```typescript
const getTableSchema = (selectedPipelines: string[], availableInputTables: any[]) => {
  const schema: Record<string, string[]> = {};
  
  selectedPipelines.forEach(pipelineName => {
    const table = availableInputTables.find(t => t.name === pipelineName);
    if (table && table.pipelineDependencies) {
      table.pipelineDependencies.forEach((dep: any) => {
        if (dep.query) {
          // Extract columns from SQL query
          const columns = extractColumnsFromQuery(dep.query);
          schema[dep.tableName || pipelineName] = columns;
        }
      });
    }
  });
  
  return schema;
};

const getInputTables = (selectedPipelines: string[], availableInputTables: any[]) => {
  const tables: Record<string, any[]> = {};
  
  selectedPipelines.forEach(pipelineName => {
    const table = availableInputTables.find(t => t.name === pipelineName);
    if (table && table.pipelineDependencies) {
      table.pipelineDependencies.forEach((dep: any) => {
        if (dep.query) {
          // Fetch sample data for the table
          tables[dep.tableName || pipelineName] = table.data || [];
        }
      });
    }
  });
  
  return tables;
};

const extractColumnsFromQuery = (query: string): string[] => {
  // Simple regex to extract column names from SELECT clause
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch) {
    return selectMatch[1]
      .split(',')
      .map(col => col.trim().split(/\s+as\s+/i)[0].trim())
      .filter(col => col !== '*');
  }
  return [];
};
```

### Step 5: Remove Old Chat State

You can remove the following state variables (no longer needed):
- `sqlChatHistory`
- `pythonChatHistory`
- `agentStatus`
- `pythonAgentStatus`

And remove the old chat UI sections.

## Agent Behavior

The agent will:

1. **Analyze context**: When you send a message like "aggiungimi dello spazio a destra", the agent will:
   - Read the current SQL query or Python code
   - Understand the available table columns
   - Analyze the context to determine what "spazio a destra" means

2. **Ask for clarification**: If the request is ambiguous, the agent will ask:
   - "Quale colonna vuoi modificare?"
   - "Che tipo di spazio vuoi aggiungere (padding, margine, formattazione)?"
   - "Per quale scopo (visualizzazione, esportazione)?"

3. **Update script**: When the agent understands the request, it will:
   - Generate the updated SQL query or Python code
   - Automatically update the editor
   - Save the conversation to the database

## Example Conversations

### SQL Agent Example

**User**: "aggiungimi dello spazio a destra"

**Agent**: "Ho bisogno di chiarimenti per aiutarti meglio:
1. Quale colonna vuoi modificare?
2. Che tipo di spazio vuoi aggiungere (padding, formattazione)?
3. Per quale scopo (visualizzazione, esportazione)?"

**User**: "Voglio aggiungere padding alla colonna 'nome' per visualizzazione"

**Agent**: "Ecco la query aggiornata con padding sulla colonna 'nome':"
```sql
SELECT 
  id,
  LPAD(nome, 50, ' ') as nome,
  cognome
FROM clienti
```

### Python Agent Example

**User**: "aggiungimi dello spazio a destra"

**Agent**: "Ho bisogno di chiarimenti per aiutarti meglio:
1. Quale colonna vuoi modificare?
2. Che tipo di spazio vuoi aggiungere (padding, margine nel grafico)?
3. Per quale scopo (grafico, tabella)?"

**User**: "Voglio aggiungere margine a destra nel grafico"

**Agent**: "Ecco il codice Python aggiornato con margine a destra:"
```python
import matplotlib.pyplot as plt

fig, ax = plt.subplots()
ax.plot(df['x'], df['y'])
ax.set_xlabel('X')
ax.set_ylabel('Y')

# Aggiungi margine a destra
plt.subplots_adjust(right=0.85)

plt.show()
```

## Database Migration

After updating the schema, run:

```bash
npx prisma migrate dev --name add_agent_conversations
```

## Testing

1. Open a node with SQL or Python script
2. Type a message like "aggiungimi dello spazio a destra"
3. Verify the agent asks for clarification
4. Provide more details
5. Verify the agent updates the script
6. Refresh the page and verify conversation history is loaded

## Notes

- The agent uses the same Genkit configuration as other AI flows
- Conversation history is persisted per node and agent type
- The agent automatically saves context (script, tableSchema, inputTables) with each message
- The system supports both SQL and Python agents with the same interface
