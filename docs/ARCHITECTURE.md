# Architecture — LikeAiSaid

Technical reference for developers. For setup and user workflows, see [README.md](README.md).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Stack](#2-stack)
3. [Directory Structure](#3-directory-structure)
4. [Database Schema](#4-database-schema)
5. [Authentication & Multi-Tenancy](#5-authentication--multi-tenancy)
6. [API Layer](#6-api-layer)
7. [AI Subsystem](#7-ai-subsystem)
8. [Pipeline Executor](#8-pipeline-executor)
9. [Scheduler](#9-scheduler)
10. [Python Backend](#10-python-backend)
11. [MCP Server](#11-mcp-server)
12. [Key Data Flows](#12-key-data-flows)
13. [Deployment](#13-deployment)
14. [Environment Variables](#14-environment-variables)

---

## 1. System Overview

LikeAiSaid is a multi-tenant Business Rules Engine. Users describe business logic in natural language; the system converts it into queryable decision trees. A constellation of AI agents then lets users navigate those trees conversationally, run SQL/Python analyses, and automate outcomes on a schedule.

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Next.js)                        │
│  Dashboard · Tree Editor · DetAI Chat · Scheduler · Widgets      │
└────────────────────────────┬─────────────────────────────────────┘
                             │  Server Actions + REST API
┌────────────────────────────▼─────────────────────────────────────┐
│                     Next.js App Router (port 9002)               │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐   │
│  │ Server      │  │   API Routes     │  │  Genkit AI Flows   │   │
│  │ Actions     │  │   /api/**        │  │  (Google Gemini)   │   │
│  │ actions.ts  │  │                  │  │                    │   │
│  └──────┬──────┘  └────────┬─────────┘  └────────┬───────────┘   │
│         │                  │                     │               │
│  ┌──────▼──────────────────▼─────────────────────▼────────────┐  │
│  │                     Prisma ORM                             │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────┘
                              │
              ┌───────────────▼────────────────┐
              │        PostgreSQL (port 5432)  │
              └────────────────────────────────┘

                    ┌─────────────────────────┐
                    │  Python Backend (Flask) │
                    │  port 5005              │
                    │  Pandas · Plotly        │
                    └─────────────────────────┘

                    ┌─────────────────────────┐
                    │  OpenRouter (optional)  │
                    │  Claude · Gemini etc.   │
                    └─────────────────────────┘
```

---

## 2. Stack

| Layer | Technology |
|---|---|
| Frontend / API | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| Database | PostgreSQL 15 via Prisma ORM |
| Auth | NextAuth.js v4 — JWT strategy + Prisma adapter |
| Primary AI | Google Genkit 1.x + Gemini (structured flows) |
| Secondary AI | Vercel AI SDK + OpenRouter (streaming agent loops) |
| UI primitives | shadcn/ui (Radix) + Tailwind CSS |
| Node graphs | XYFlow (React Flow) |
| Charts | Recharts |
| Grid layout | react-grid-layout |
| Forms | react-hook-form + Zod |
| Python backend | Flask + Pandas + Plotly (port 5005) |
| Scheduler | node-cron |
| Containerisation | Docker + docker-compose |
| Task runner | Taskfile (task CLI) |

---

## 3. Directory Structure

```
LikeAiSaid/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── actions.ts           # Primary Server Actions (~180 KB, all CRUD)
│   │   ├── actions/             # Feature-specific Server Actions
│   │   │   ├── openrouter.ts
│   │   │   ├── connectors.ts
│   │   │   └── lead-generator.ts
│   │   ├── api/                 # REST endpoints (23 routes)
│   │   ├── auth/                # Sign-in · sign-up · reset pages
│   │   └── [feature]/           # Page modules (create, view, chatbot, detai…)
│   │
│   ├── ai/
│   │   ├── flows/               # Genkit flows (14 flows)
│   │   ├── tools/               # Agent tool definitions
│   │   ├── schemas/             # Zod schemas for AI I/O
│   │   ├── providers/           # OpenRouter adapter
│   │   ├── genkit.ts            # Genkit init (Google AI plugin)
│   │   └── dev.ts               # Genkit dev server entry
│   │
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives
│   │   ├── rule-sage/           # Decision tree builder/viewer
│   │   ├── agents/              # Agent chat UI
│   │   ├── pipelines/           # Pipeline node-graph editor
│   │   ├── scheduler/           # Scheduler UI
│   │   ├── dashboard/           # KPI dashboard widgets
│   │   └── [features]/          # Feature-specific components
│   │
│   ├── lib/
│   │   ├── types.ts             # Core TypeScript interfaces
│   │   ├── db.ts                # Prisma singleton
│   │   ├── auth.ts              # NextAuth config
│   │   ├── session.ts           # getAuthenticatedUser()
│   │   ├── ancestor-executor.ts # Pipeline DAG executor
│   │   ├── scheduler/           # Cron scheduler service
│   │   └── [utilities]/         # Mail, storage, chart-theme, cache…
│   │
│   ├── middleware.ts            # NextAuth route protection
│   └── mcp/
│       └── server.ts            # Model Context Protocol server
│
├── prisma/
│   └── schema.prisma            # Database schema
│
├── python-backend/
│   ├── app.py                   # Flask server
│   ├── chart_to_recharts_converter.py
│   └── requirements.txt
│
├── docker-compose.yml
├── Dockerfile                   # Multi-stage production build
├── Taskfile.yml
└── next.config.ts
```

---

## 4. Database Schema

All tables carry a `companyId` foreign key — this is the multi-tenancy boundary.

### Core

| Model | Purpose |
|---|---|
| `Company` | Root tenant entity |
| `User` | Credentials + role (`user` / `admin` / `superadmin`) + departmentId |
| `Department` | Org unit within a company |
| `Tree` | Decision tree (stores both JSON and natural language representations) |
| `Variable` | Standardised variable extracted from tree text |
| `Connector` | External DB connection config (encrypted) + cached schema map |

### AI Conversations

| Model | Purpose |
|---|---|
| `AgentConversation` | Persisted SQL or Python agent session per node (unique on `nodeId + agentType`) |
| `SuperAgentConversation` | Multi-tool super-agent session |
| `LeadGeneratorConversation` | Lead generation campaign conversation |
| `KnowledgeBaseEntry` | Q&A pairs searched by AI flows |

### Automation

| Model | Purpose |
|---|---|
| `ScheduledTask` | Cron/interval task config with run counters |
| `ScheduledTaskExecution` | Individual run logs (status, duration, result JSON, error) |
| `Pipeline` | Visual node graph stored as `nodes` + `edges` JSON |
| `PageLayout` | Per-user dashboard grid layout (react-grid-layout JSON) |

### Lead Management

| Model | Purpose |
|---|---|
| `LeadSearch` | Search criteria + status |
| `Lead` | Individual lead with full contact attributes |

### Domain / Supply Chain

`BOM`, `Material`, `Product`, `InventoryItem`, `Order` — domain-specific models for manufacturing use cases.

### RBAC

`Role`, `Permission` — fine-grained access control (not yet enforced everywhere).

### Key `Tree` fields

```
Tree {
  jsonDecisionTree            String   // JSON-serialised tree (stored as text)
  naturalLanguageDecisionTree String   // Human-readable description
  questionsScript             String   // Minimal Q&A script
  type                        String   // "RULE" | "PIPELINE"
  companyId                   String
}
```

---

## 5. Authentication & Multi-Tenancy

**Provider:** `CredentialsProvider` (email + bcrypt password).

**Session strategy:** JWT. Custom claims injected in callbacks:

```typescript
// src/lib/auth.ts
jwt({ token, user }) {
  token.id         = user.id;
  token.role       = user.role;          // "user" | "admin" | "superadmin"
  token.companyId  = user.companyId;
  token.departmentId = user.departmentId;
}
```

**Middleware** (`src/middleware.ts`) protects every route except `/api/auth/**`, `/auth/**`, and Next.js static assets.

**Data isolation:** Every Prisma query in Server Actions starts with `getAuthenticatedUser()` which returns `{ id, companyId, … }`. All queries filter by `companyId`. There is no cross-tenant data path.

---

## 6. API Layer

### Server Actions (`src/app/actions.ts`)

The primary interface between the UI and the database. Covers:

- Tree CRUD and search
- Variable extraction and management
- AI diagnostic flows (DetAI, diagnose-problem)
- Agent interactions (SQL agent, Python agent)
- SQL/Python preview execution
- Email actions
- Node execution result persistence
- Cache invalidation

All actions call `getAuthenticatedUser()` before any DB operation.

### REST Routes (`src/app/api/`)

Used for streaming responses (Vercel AI SDK) and external integrations where Server Actions are insufficient.

| Route | Purpose |
|---|---|
| `POST /api/trees/[id]/query` | DetAI query on a specific tree |
| `POST /api/agents/chat` | Single-turn agent chat |
| `POST /api/agents/chat-stream` | Streaming agent chat (Vercel AI SDK) |
| `POST /api/super-agent/stream` | Multi-tool super-agent (streaming) |
| `POST /api/super-agent/save-widget` | Persist widget config from agent output |
| `GET/POST /api/scheduler/tasks` | Scheduler task CRUD |
| `POST /api/scheduler/tasks/[id]/trigger` | Manual task trigger |
| `GET /api/scheduler/tasks/[id]/executions` | Task execution history |
| `POST /api/analyze-excel` | Excel file analysis |
| `POST /api/upload` | File upload |
| `GET/POST /api/lead-generator` | Lead generation campaigns |
| `POST /api/auth/register` | User registration |

---

## 7. AI Subsystem

Two AI frameworks coexist:

- **Genkit 1.x** — Structured flows with schemas, used for tree creation and diagnostics.
- **Vercel AI SDK + OpenRouter** — Streaming agentic loops with tools, used for SQL/Python agents and the super-agent.

### Flows (`src/ai/flows/`)

#### Tree creation

```
extract-variables.ts
  Input:  natural language text
  Output: Variable[] (id, name, type, possibleValues[])

generate-decision-tree.ts
  Input:  text + variables table
  Output: { jsonDecisionTree, naturalLanguageDecisionTree, questionsScript }
```

#### Interactive navigation

```
diagnose-problem.ts
  Two-phase:
    Phase 1 — select the right tree by hypothesis testing
    Phase 2 — navigate tree step-by-step
  Output: { nextQuestion, options, isFinalDecision, media, links, triggers }

detai-flow.ts
  Tool: searchDecisionTrees (full-text search across DB)
  Output: Streaming assistant response with [Fonte: id] attribution markup
```

#### Agent flows

```
sql-agent-flow.ts  (OpenRouter agentic loop)
  Tools: exploreDbSchema · exploreTableColumns · testSqlQuery · searchKB
  State: AgentConversation (persisted, unique on nodeId+agentType)

python-agent-flow.ts  (OpenRouter agentic loop)
  Tools: pyExploreDbSchema · pyExploreTableColumns · pyTestSqlQuery · pyTestCode · pySearchKB
  State: AgentConversation (same model, agentType="python")

super-agent-flow.ts  (OpenRouter agentic loop)
  Tools: listSqlConnectors · listTreesAndPipelines · executeSql · executePython · searchKB
  State: SuperAgentConversation
```

#### Utilities

```
rephrase-question.ts       — NL question improvement
propose-consolidations.ts  — Detect duplicate variables across trees
fix-script-flow.ts         — AI-driven SQL/Python debugging
execute-script-flow.ts     — Run scripts stored in decision leaves
excel-to-pipeline-flow.ts  — Import Excel as a pipeline
report-flow.ts             — Generate summary reports
lead-generator-flow.ts     — AI lead search and extraction
```

### Tool pattern

```typescript
const myTool = ai.defineTool({
  name: 'toolName',
  description: '…',
  inputSchema:  z.object({ … }),
  outputSchema: z.string(),
}, async (input) => { … });
```

### Key types (`src/lib/types.ts`)

**Decision node** — an intermediate question node in the tree:
```typescript
interface DecisionNode {
  id?: string;
  question?: string;
  variableId?: string;           // links to standardised Variable
  options: { [key: string]: DecisionOptionChild };
  sqlQuery?: string;
  sqlConnectorId?: string;
  pythonCode?: string;
  pythonOutputType?: 'table' | 'variable' | 'chart' | 'html';
  emailAction?: EmailActionConfig;
  widgetConfig?: WidgetConfig;
  media?: MediaItem[];
  links?: LinkItem[];
  triggers?: TriggerItem[];
}
```

**Decision leaf** — a terminal outcome node:
```typescript
interface DecisionLeaf {
  id?: string;
  decision: string;
  sqlQuery?: string;
  pythonCode?: string;
  emailAction?: EmailActionConfig;
  widgetConfig?: WidgetConfig;
  media?: MediaItem[];
  links?: LinkItem[];
  triggers?: TriggerItem[];
}
```

**Variable:**
```typescript
interface Variable {
  id?: string;
  name: string;
  type: 'boolean' | 'enumeration' | 'numeric' | 'text';
  possibleValues: VariableOption[];   // each has id, name, value (int), abbreviation (3-char)
}
```

---

## 8. Pipeline Executor

**File:** `src/lib/ancestor-executor.ts`

Pipelines are visual node graphs (XYFlow) stored as JSON `{ nodes, edges }` in the `Pipeline` model. The executor runs them as a DAG.

```
Pipeline JSON
     │
     ▼
topological sort (Kahn's algorithm)
     │
     ▼
for each node (in order):
  ┌─────────────────────────────────────────────────────┐
  │ node.type = 'sql'       → execute SQL via connector │
  │ node.type = 'python'    → POST /execute_code        │
  │ node.type = 'email'     → send via nodemailer       │
  │ node.type = 'sharepoint'→ SharePoint API            │
  │ node.type = 'hubspot'   → HubSpot API               │
  │ node.type = 'trigger'   → external webhook          │
  └─────────────────────────────────────────────────────┘
     │
     ▼
ExecutionContext.results Map<nodeId, any>
(downstream nodes receive upstream outputs as inputs)
     │
     ▼
saveNodeExecutionResultAction()   ← persisted to DB
     │
     ▼
ChainExecutionResult { success, results[], errors[], executionTime }
```

---

## 9. Scheduler

**Files:** `src/lib/scheduler/scheduler-service.ts`, `cron-runner.ts`

`SchedulerService` is a singleton initialised at Next.js startup. It reads all `ScheduledTask` rows and registers a cron job per task.

**Schedule types:**
- `cron` — standard cron expression (e.g. `0 9 * * MON`)
- `interval` — every N minutes
- `specific` — one-time future run

**Task types executed:**

| TaskType | Action |
|---|---|
| `SQL_PREVIEW` | Run SQL query, return result |
| `SQL_EXECUTE` | Run SQL query, write to target table |
| `PYTHON_EXECUTE` | POST to Flask `/execute_code` |
| `EMAIL_PREVIEW` | Render email body |
| `EMAIL_SEND` | Send email with optional data attachments |
| `DATA_SYNC` | Custom data sync pipeline |

**Concurrency guard:** A `runningTasks: Set<string>` prevents the same task from overlapping runs.

**Execution log:** Every run creates a `ScheduledTaskExecution` record with `status`, `durationMs`, `result` (JSON), `error`, and `retryCount`.

---

## 10. Python Backend

**File:** `python-backend/app.py` | **Port:** 5005

Handles workloads that need Pandas, Numpy, Matplotlib, or Plotly — things that are impractical in Node.js.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /execute_code` | Execute arbitrary Python/Pandas code in a sandboxed context |
| `POST /execute_sql_and_analyze` | Fetch data via SQL connector, run Pandas analysis, generate charts |
| `POST /analyze_excel` | Parse uploaded Excel file, generate preview charts |
| `GET /health` | Liveness check |

### `/execute_code` input/output

```
Input:
  code         string   Python source (has access to dataframes from inputTables)
  output_type  enum     "table" | "variable" | "chart" | "html"
  connectorId  string?  if provided, SQL connector is available as `db`

Output:
  stdout       string
  data         any      rows, scalar, chart spec, or HTML string
  columns      string[]
  error        string?
```

### Chart pipeline

```
Python Matplotlib/Plotly code
        │
        ▼
chart_to_recharts_converter.py
        │
        ▼
Recharts-compatible JSON
        │
        ▼
Returned to Next.js → rendered in browser
```

---

## 11. MCP Server

**File:** `src/mcp/server.ts`

Exposes LikeAiSaid as a [Model Context Protocol](https://modelcontextprotocol.io/) server so external AI assistants (Claude Desktop, Cursor, etc.) can interact with the system.

**Tools exposed:**

| Tool | Description |
|---|---|
| `create_tree` | Create a decision tree from natural language |
| `list_trees` | List all trees for the authenticated company |
| `get_tree` | Fetch full tree details (JSON + natural language) |
| `query_tree` | Run a DetAI query on a specific tree |
| `delete_tree` | Delete a tree |

**Configuration** (Claude Desktop `~/.claude.json`):
```json
{
  "mcpServers": {
    "likeaisaid": {
      "command": "npx",
      "args": ["ts-node", "/path/to/LikeAiSaid/src/mcp/server.ts"]
    }
  }
}
```

`LIKEAISAID_API_URL` env var controls the base URL (default: `http://localhost:3000`).

---

## 12. Key Data Flows

### Creating a decision tree

```
User submits natural language text
        │
        ▼
createTreeAction()
        │
        ├──▶ extractVariablesFlow (Genkit + Gemini)
        │         extracts Variable[] with types and possibleValues
        │
        └──▶ generateDecisionTreeFlow (Genkit + Gemini)
                  generates jsonDecisionTree + naturalLanguageDecisionTree + questionsScript
                  │
                  ▼
            Tree record saved in PostgreSQL
```

### Interactive navigation (DetAI / Chatbot)

```
User describes a problem
        │
        ▼
diagnoseProblemFlow (Genkit)
    Phase 1: Hypothesis testing across all company trees
             → selects best-matching tree
    Phase 2: Step-by-step navigation
             → returns { nextQuestion, options, isFinalDecision }
        │
        ▼
UI renders question/options → user answers → repeat until isFinalDecision
        │
        ▼
Leaf node reached → display decision + media/links/triggers
```

### SQL agent loop

```
User asks for help building a SQL query on a tree node
        │
        ▼
sqlAgentFlowAction() → OpenRouter (Claude/Gemini)
    ┌────────────────────────────────────────────┐
    │  Agent loop:                               │
    │    exploreDbSchema()   → table list        │
    │    exploreTableColumns() → column details  │
    │    testSqlQuery()      → run + validate    │
    │    searchKB()          → knowledge base    │
    │  Iterate until confident                   │
    └────────────────────────────────────────────┘
        │
        ▼
Final SQL stored in AgentConversation (nodeId + agentType="sql")
        │
        ▼
executeSqlPreviewAction() → results shown in UI
        │
        ▼
User saves → SQL stored on tree node
```

### Scheduled task execution

```
SchedulerService.init()
    loads all ScheduledTask rows
    registers cron job per task
        │
        ▼
At trigger time:
    acquire concurrency lock
    execute task (SQL / Python / Email)
    release lock
        │
        ▼
ScheduledTaskExecution record created
ScheduledTask.successCount / failureCount updated
nextRunAt recomputed
```

---

## 13. Deployment

### Development (Taskfile)

```bash
task start          # PostgreSQL (Docker) + Python backend + Next.js dev
task stop           # stop all
task db:start/stop  # PostgreSQL only
task python:start   # Flask only
task dev            # Next.js only (port 9002)
```

### Production (Docker Compose)

```yaml
services:
  app:   Next.js container (port 3000), depends on db
  db:    postgres:15-alpine (port 5432), volume: db_data
```

### Dockerfile — Multi-stage build

```
Stage 1 (deps)     — npm install
Stage 2 (builder)  — prisma generate + next build
Stage 3 (runner)   — copy standalone output, run as non-root user (nextjs, uid 1001)
```

`next.config.ts` sets `output: "standalone"` for an optimised Docker bundle.

---

## 14. Environment Variables

### Required

```
DATABASE_URL          postgresql://user:password@localhost:5432/rulesagedb
NEXTAUTH_SECRET       random secret for JWT signing
NEXTAUTH_URL          http://localhost:9002  (or production URL)
GOOGLE_GENAI_API_KEY  Google AI Studio key (Gemini)
```

### Optional

```
OPENROUTER_API_KEY    Fallback LLM provider (Claude, Gemini via OpenRouter)
FIREBASE_CONFIG       JSON config for Firebase Storage
LIKEAISAID_API_URL    Base URL for MCP server (default: http://localhost:3000)
```

Per-user OpenRouter credentials (`openRouterApiKey`, `openRouterModel`) can also be set in the user profile and are stored encrypted in the `User` table.
