# AI Agent Implementation

## Summary

This implementation adds intelligent AI agents to the node editing system that can understand table columns, script context, and maintain conversation history in the database.

## Features

### 1. Context-Aware Understanding
- Agents analyze the current SQL query or Python code
- Agents understand available table columns and their types
- Agents use conversation history to maintain context across interactions

### 2. Intelligent Clarification
- When a request is ambiguous (e.g., "aggiungimi dello spazio a destra"), the agent asks specific questions:
  - Which column?
  - What type of space (padding, margin, formatting)?
  - For what purpose (visualization, export)?
- Never guesses - always asks for clarification when uncertain

### 3. Persistent Conversation History
- All conversations are saved to the database
- History is loaded when reopening a node
- Separate history for SQL and Python agents
- Per-node conversation tracking

## Architecture

### Database Layer
```prisma
model AgentConversation {
  id          String   @id @default(cuid())
  nodeId      String
  agentType   String   // 'sql' or 'python'
  script      String   @db.Text
  tableSchema Json?
  inputTables Json?
  messages    Json     // Array of ChatMessage
  companyId   String?
  company     Company?  @relation(fields: [companyId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@unique([nodeId, agentType])
}
```

### AI Flows
- **SQL Agent** ([`sql-agent-flow.ts`](../src/ai/flows/sql-agent-flow.ts))
  - Uses Genkit with Gemini 2.5 Flash
  - Specialized in SQL query generation and modification
  - Understands table schemas and relationships

- **Python Agent** ([`python-agent-flow.ts`](../src/ai/flows/python-agent-flow.ts))
  - Uses Genkit with Gemini 2.5 Flash
  - Specialized in Python code for data analysis
  - Supports pandas, matplotlib, plotly libraries

### API Endpoints
- **POST** `/api/agents/chat` - Send message to agent
- **GET** `/api/agents/chat?nodeId=xxx&agentType=sql` - Load conversation
- **DELETE** `/api/agents/chat?nodeId=xxx&agentType=sql` - Clear conversation

### UI Components
- **AgentChat** ([`agent-chat.tsx`](../src/components/agents/agent-chat.tsx))
  - Reusable chat interface
  - Loads/saves conversation automatically
  - Updates script when agent provides new code
  - Shows clarification requests with visual feedback

## Usage

### In Node Editor

Replace existing chat sections with AgentChat component:

```tsx
<AgentChat
  nodeId={nodePath}
  agentType="sql"  // or "python"
  script={sqlQuery}
  tableSchema={tableSchema}
  inputTables={inputTables}
  onScriptUpdate={setSqlQuery}
/>
```

### Example Conversation

**User**: "aggiungimi dello spazio a destra"

**Agent**: "Ho bisogno di chiarimenti per aiutarti meglio:
1. Quale colonna vuoi modificare?
2. Che tipo di spazio vuoi aggiungere (padding, margine, formattazione)?
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

## Testing

Access the test page at `/test-agent` to:
1. Test SQL agent with sample queries
2. Test Python agent with sample scripts
3. Verify clarification requests
4. Check conversation persistence

## Integration Guide

See [`ai-agent-integration-guide.md`](./ai-agent-integration-guide.md) for detailed integration steps.

## Files Created/Modified

### New Files
- `src/ai/schemas/agent-schema.ts` - Agent input/output schemas
- `src/ai/flows/sql-agent-flow.ts` - SQL agent flow
- `src/ai/flows/python-agent-flow.ts` - Python agent flow
- `src/app/api/agents/chat/route.ts` - Agent API endpoints
- `src/components/agents/agent-chat.tsx` - Chat UI component
- `src/app/test-agent/page.tsx` - Test page
- `docs/ai-agent-integration-guide.md` - Integration guide
- `docs/ai-agent-implementation.md` - This file

### Modified Files
- `prisma/schema.prisma` - Added AgentConversation model
- `src/lib/types.ts` - Added agent types

## Next Steps

1. Integrate AgentChat into [`edit-node-dialog.tsx`](../src/components/rule-sage/edit-node-dialog.tsx)
2. Test with real data and queries
3. Add error handling for edge cases
4. Consider adding conversation export/import features
5. Add analytics for agent usage

## Notes

- The agent uses the same Genkit configuration as existing AI flows
- Conversation history is persisted per node and agent type
- The system supports both SQL and Python agents with the same interface
- Agents are designed to be cautious and ask questions rather than make assumptions
