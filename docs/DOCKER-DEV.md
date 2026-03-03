# Docker Development Setup

This guide explains how to run the LikeAiSaid project in development mode using Docker with hot reloading support.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Docker Compose Development                        │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   Next.js App    │  │  Python Backend  │  │   PostgreSQL     │  │
│  │   (rulesage-app) │  │ (rulesage-python)│  │  (rulesage-db)   │  │
│  │                  │  │                  │  │                  │  │
│  │  Port: 9002      │  │  Port: 5005      │  │  Port: 5432      │  │
│  │  Hot Reload: ✓   │  │  Hot Reload: ✓   │  │  Persistent: ✓   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                     │             │
│           └─────────────────────┴─────────────────────┘             │
│                            rulesage-network                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │     Host Machine Volumes       │
                    │                                │
                    │  ./src ──────► /app/src        │
                    │  ./public ───► /app/public     │
                    │  ./prisma ───► /app/prisma     │
                    │  ./python-backend ─► /app      │
                    └────────────────────────────────┘
```

## Prerequisites

- Docker Desktop 4.x or Docker Engine 20.x+
- Docker Compose v2+
- `.env` file with required environment variables (copy from `.env.template`)

## Quick Start

```bash
# 1. Copy environment template and configure
cp .env.template .env
# Edit .env and add your API keys (GOOGLE_GENAI_API_KEY, NEXTAUTH_SECRET, etc.)

# 2. Start all services
docker compose up --build

# 3. Access the application
# Next.js: http://localhost:9002
# Python Backend: http://localhost:5005/health
```

## Services

| Service | Container Name | Port | Description |
|---------|---------------|------|-------------|
| `app` | rulesage-app | 9002 | Next.js development server with Turbopack |
| `python-backend` | rulesage-python | 5005 | Flask backend for data processing |
| `db` | rulesage-db | 5432 | PostgreSQL 15 database |

## Hot Reloading

### Next.js (Turbopack)
- Edit files in `./src/` → Changes reflect immediately
- Edit `./tailwind.config.ts` → Styles update automatically
- Edit `./prisma/schema.prisma` → Run Prisma commands to apply

### Python Flask
- Edit files in `./python-backend/` → Flask auto-reloads
- Flask debug mode is enabled by default
- View logs: `docker compose logs -f python-backend`

## Common Commands

### Start Services

```bash
# Start all services (foreground with logs)
docker compose up --build

# Start in background
docker compose up -d --build

# Start specific service
docker compose up app
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f python-backend
docker compose logs -f db
```

### Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (resets database!)
docker compose down -v
```

### Prisma Commands

```bash
# Apply schema changes
docker compose exec app npx prisma db push

# Regenerate Prisma client
docker compose exec app npx prisma generate

# Open Prisma Studio
docker compose exec app npx prisma studio
# Note: Studio runs inside container, access via port forwarding if needed
```

### Rebuild After Dependency Changes

```bash
# After package.json changes
docker compose up --build app

# After requirements.txt changes
docker compose up --build python-backend

# Rebuild all
docker compose up --build
```

### Shell Access

```bash
# Next
docker compose exec app sh

# Python container
docker compose exec python-backend bash

# Database
docker compose exec db psql -U postgres -d rulesagedb
```

## Environment Variables

The development setup uses `.env` file for environment variables:

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@db:5432/rulesagedb
NEXTAUTH_SECRET=your-random-secret-here
NEXTAUTH_URL=http://localhost:9002
GOOGLE_GENAI_API_KEY=your-gemini-api-key

# Optional
OPENROUTER_API_KEY=your-openrouter-key
```

**Important:** The `DATABASE_URL` in Docker must use `db` (Docker service name) instead of `localhost`:
```
# Local development (Taskfile)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rulesagedb

# Docker development
DATABASE_URL=postgresql://postgres:postgres@db:5432/rulesagedb
```

## Volume Mounts

### Next.js App
| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./src` | `/app/src` | Source code (hot reload) |
| `./public` | `/app/public` | Static assets |
| `./prisma` | `/app/prisma` | Database schema |
| `./next.config.ts` | `/app/next.config.ts` | Next.js config |
| `./tailwind.config.ts` | `/app/tailwind.config.ts` | Tailwind config |

### Python Backend
| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| `./python-backend` | `/app` | All Python source code |

### Named Volumes (Persistent)
| Volume Name | Purpose |
|-------------|---------|
| `rulesage-db-data` | PostgreSQL data |
| `rulesage-node-modules` | Node modules (container-managed) |
| `rulesage-next-cache` | Next.js build cache |

## Troubleshooting

### Hot reload not working

1. **Check file watcher limits (Linux)**:
   ```bash
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

2. **Try polling mode** (already enabled in Dockerfile.dev):
   ```
   WATCHPACK_POLLING=true
   CHOKIDAR_USEPOLLING=true
   ```

### Database connection issues

1. Wait for PostgreSQL to be healthy:
   ```bash
   docker compose ps  # Check health status
   ```

2. Check logs:
   ```bash
   docker compose logs db
   ```

### Node modules issues

If you encounter module resolution issues:
```bash
# Remove and recreate node_modules volume
docker compose down
docker volume rm rulesage-node-modules
docker compose up --build app
```

### Python dependency issues

```bash
# Rebuild Python container
docker compose up --build python-backend
```

### Port conflicts

If ports 9002, 5005, or 5432 are in use:
```bash
# Check what's using the port
lsof -i :9002
lsof -i :5005
lsof -i :5432

# Or modify docker-compose.yml to use different host ports
# e.g., "3000:9002" instead of "9002:9002"
```

## Comparison: Docker vs Taskfile

| Feature | Docker Compose | Taskfile |
|---------|---------------|----------|
| Isolation | Full container isolation | Uses host environment |
| Setup time | First build ~2-3 min | Depends on npm install |
| Hot reload | ✓ (via volumes) | ✓ (native) |
| Database | Container (persistent volume) | Container (same) |
| Python env | Container (isolated) | Virtual env on host |
| Team consistency | High (same env for all) | Varies by machine |

## Files Reference

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Development orchestration |
| `Dockerfile.dev` | Next.js development container |
| `Dockerfile.python` | Python Flask container |
| `Dockerfile` | Production build (multi-stage) |
| `.dockerignore` | Files excluded from build context |
