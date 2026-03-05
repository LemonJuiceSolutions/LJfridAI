# Like AI Said

Like AI Said is a Next.js application that acts as a Business Rules Engine with natural language interpretation capabilities, powered by AI.

## Quickstart

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Docker](https://www.docker.com/) (for PostgreSQL)
- [Python](https://www.python.org/) 3.10+ (for the data backend)
- A [Google AI API key](https://aistudio.google.com/apikey) (Gemini)
- [Task](https://taskfile.dev/) (optional, for `task` commands)

## Docker Quickstart (Recommended for development)

For a completely isolated development environment with hot reloading:

```bash
# 1. Copy environment template
cp .env.template .env
# Edit .env and add: NEXTAUTH_SECRET, GOOGLE_GENAI_API_KEY, etc.

# 2. Build and initialize db
task docker:build
task docker:db:reset

# 3. Start
task docker:start

# 3. Services will be available at:
#    - Next.js:      http://localhost:9002
#    - Python API:   http://localhost:5005/health
#    - PostgreSQL:   localhost:5432
```

**Useful Docker tasks:**
```bash
task docker:logs              # View all service logs
task docker:logs:app          # View Next.js logs
task docker:logs:python       # View Python backend logs
task docker:stop              # Stop all services
task docker:shell:app         # Open shell in Next.js container
task docker:shell:python      # Open shell in Python container
task docker:prisma:push       # Apply database migrations
task docker:db:reset          # Reset database
```

For full Docker documentation, see [`docs/DOCKER-DEV.md`](docs/DOCKER-DEV.md).

---

## Local Quickstart (with Taskfile)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.template .env.local
```

Then fill in the values — at minimum `NEXTAUTH_SECRET` and `GOOGLE_GENAI_API_KEY`.

### 3–7. Start all services

With [Task](https://taskfile.dev/):

```bash
task start
```

Or manually:

**4. Start PostgreSQL**
```bash
task db:start
# or: docker run -d --name rulesage-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rulesagedb -p 5432:5432 postgres:15
```

**5. Apply database schema**
```bash
task db:push
# or: npx prisma db push
```

**6. Start the Python backend**
```bash
task python:start
# or: cd python-backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python app.py
```

**7. Start the Next.js dev server**
```bash
task dev
# or: npm run dev
```

App is available at **http://localhost:9002**.

### Stop services

```bash
task stop          # stop everything
task db:stop       # stop PostgreSQL only
task python:stop   # stop Flask backend only
task dev:stop      # stop Next.js only
```

---

## How to use the software

The typical workflow goes from creating rules, to navigating them interactively, to automating decisions.

### 1. Create a rule or pipeline (`/create`)

Describe a business process in plain language (or upload an Excel file). The AI extracts the key variables and builds a decision tree. You can also use the microphone for voice input or load a built-in example to get started quickly.

### 2. Inspect and edit the tree (`/view/[id]`)

Open any rule from the dashboard to see its node graph. You can edit individual nodes, merge redundant variables, and regenerate the natural language description at any time.

### 3. Navigate a decision interactively (`/chatbot`)

Describe a problem and the chatbot finds the most relevant tree, then guides you step-by-step through a Q&A to reach a final outcome. Supports media attachments and external links on leaf nodes.

### 4. Ask questions in free form (`/detai`)

detAI is a conversational assistant that searches across all your decision trees and answers questions in natural language. Useful for exploring the rule base without knowing which tree to look at.

### 5. Manage variables (`/variables`)

All variables extracted from your rules are stored centrally. Here you can rename, merge, or delete variables and see which trees use each one. Keeping variables clean improves the quality of AI-generated trees.

### 6. Automate with the Scheduler (`/scheduler`)

Create scheduled tasks that run SQL queries, send emails, or sync data on a cron or interval schedule. Each task is linked to a node in a decision tree, so automation stays aligned with business rules.

### 7. Build a Knowledge Base (`/knowledge-base`)

Maintain a library of Q&A pairs that complement your decision trees. Entries can be created manually or synced automatically from tree content, and are used by the AI to improve answer quality.

### 8. Monitor KPIs (`/dashboard`)

A configurable widget dashboard that runs SQL queries against your data sources and displays results as charts and tables. Widgets are defined per-company and refresh on demand.

---

## Pages reference

| Route | Description |
|---|---|
| `/` | Home dashboard — list, search, import/export all rules and pipelines |
| `/create` | Create a new rule (natural language, voice, or Excel upload) |
| `/view/[id]` | Visual node-graph editor for a single decision tree |
| `/chatbot` | Guided diagnostic chatbot — navigate a tree step by step |
| `/detai` | Free-form conversational AI across all trees |
| `/variables` | Centralized variable manager (rename, merge, delete) |
| `/scheduler` | Task scheduler — cron/interval automation linked to tree nodes |
| `/knowledge-base` | Q&A knowledge base synced with decision trees |
| `/lead-generator` | AI-powered email and lead generation campaigns |
| `/dashboard` | KPI dashboard with SQL-backed charts and widgets |
| `/settings` | App settings overview |
| `/settings/navigation` | Configure which items appear in the sidebar and their order |
| `/settings/database` | Manage external database connections used by widgets and the SQL agent |
| `/settings/profile` | Edit your name, email, and account details |
| `/setup` | First-run setup wizard |

---

## Core Features

- **Variable Extraction**: Automatically identify key variables and their possible values from a user's descriptive text.
- **Decision Tree Generation**: Construct a logical decision tree from the extracted variables.
- **Natural Language & JSON Output**: View the decision tree as a human-readable explanation or as structured JSON for machine use.
- **AI-Enhanced Interactive Guidance**: Navigate the decision tree through a step-by-step Q&A interface to reach a final decision.
