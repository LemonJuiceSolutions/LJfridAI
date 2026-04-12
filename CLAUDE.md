# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Next.js dev server on port 9002 (Turbopack)
npm run genkit:dev       # Genkit AI flow dev server
npm run genkit:watch     # Genkit dev server in watch mode

# Quality
npm run lint             # ESLint
npm run typecheck        # TypeScript type check (no emit)

# Production
npm run build            # Next.js production build (standalone output)
npm start                # Start production server

# Database
npx prisma migrate dev   # Apply pending migrations
npx prisma generate      # Regenerate Prisma client after schema changes
npx prisma studio        # GUI database browser

# Full stack (includes PostgreSQL + Python backend)
docker-compose up --build
```

The Python backend (Flask, port 5005) runs separately from Next.js. It handles Excel analysis, chart generation, and data processing. In development, start it manually: `cd python-backend && python app.py`.

## Architecture

**LikeAiSaid** is a Business Rules Engine that lets users create decision trees from natural language, then navigate them interactively with AI assistance.

### Stack

- **Frontend/API**: Next.js 15 App Router with Server Actions and Vercel AI SDK streaming
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js v4 with multi-tenant JWT sessions (company-scoped data isolation)
- **AI**: Genkit 1.x (Google AI / Gemini), Vercel AI SDK (OpenAI / OpenRouter)
- **UI**: shadcn/ui (Radix primitives) + Tailwind CSS + XYFlow (node graphs) + Recharts
- **Python backend**: Flask + Pandas + Plotly at port 5005

### Key data flows

**Creating a decision tree**:
1. User describes business rules in natural language
2. `src/ai/flows/extract-variables.ts` (Genkit) identifies key variables
3. `src/ai/flows/generate-decision-tree.ts` builds the tree structure
4. Tree saved as both JSON (`jsonDecisionTree`) and natural language (`naturalLanguageDecisionTree`) in the `Tree` model

**Interactive querying (DetAI)**:
- `src/ai/flows/detai-flow.ts` drives step-by-step Q&A through the tree
- `src/ai/flows/diagnose-problem.ts` for problem diagnosis variant

**AI agents (SQL & Python)**:
- `src/ai/flows/sql-agent-flow.ts` generates context-aware SQL queries using conversation history
- `src/ai/flows/python-agent-flow.ts` generates Pandas/Plotly code
- Agent conversation history persisted in `AgentConversation` model
- Super agent (`src/ai/flows/super-agent-flow.ts`) orchestrates multiple tools

**Pipeline execution**:
- Pipelines are visual node graphs stored as JSON (`nodes`, `edges`)
- `src/lib/ancestor-executor.ts` runs pipeline nodes in topological order
- `src/lib/scheduler/` handles cron-based and interval-based automation

### Multi-tenancy

All data is scoped to `companyId` from the session. Session shape:
```typescript
session.user = { id, email, name, role: "user"|"admin"|"superadmin", companyId, departmentId }
```

Never return data without filtering by `companyId`. The middleware (`src/middleware.ts`) protects all routes except auth pages and Next.js internals.

### Decision tree node types

Defined in `src/lib/types.ts`. Nodes can be:
- **Decision nodes**: questions with multiple option branches
- **Decision leaves**: final outcomes, which may trigger SQL queries, Python code, emails, chart widgets, or media attachments
- Nodes support variable references and sub-tree references

### MCP server

`src/mcp/server.ts` exposes decision trees to AI assistants via the Model Context Protocol. Tools: `create_tree`, `list_trees`, `get_tree`, `query_tree`, `delete_tree`.

### Key file locations

| Concern | Location |
|---|---|
| Server Actions (main CRUD) | `src/app/actions.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Auth config | `src/lib/auth.ts` |
| Prisma singleton | `src/lib/db.ts` |
| AI flows | `src/ai/flows/` |
| AI tools (agent definitions) | `src/ai/tools/` |
| Scheduler engine | `src/lib/scheduler/` |
| Pipeline executor | `src/lib/ancestor-executor.ts` |
| API routes | `src/app/api/` |
| shadcn components | `src/components/ui/` |
| Python backend | `python-backend/app.py` |

---
