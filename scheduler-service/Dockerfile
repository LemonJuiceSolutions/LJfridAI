FROM node:22-alpine

WORKDIR /app

# Copy root package files for shared deps (prisma schema)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Copy scheduler-service files
COPY scheduler-service/package.json ./scheduler-service/
COPY scheduler-service/tsconfig.json ./scheduler-service/

# Install deps for the scheduler-service
WORKDIR /app/scheduler-service
RUN npm install

# Generate Prisma client
WORKDIR /app
RUN npx prisma generate

# Copy source after install (better layer caching)
WORKDIR /app
COPY src ./src/
COPY scheduler-service ./scheduler-service/

WORKDIR /app/scheduler-service

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${SCHEDULER_PORT:-3001}/health || exit 1

CMD ["npx", "tsx", "index.ts"]
