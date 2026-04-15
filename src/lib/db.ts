import { PrismaClient } from '@prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

// Connection pooling is managed by Prisma via the DATABASE_URL.
// For production, append ?connection_limit=20&pool_timeout=10 to DATABASE_URL
// to control the pool size and timeout. Default pool size is num_cpus * 2 + 1.
export const db =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['warn', 'error']   // solo warning/errori, NON query
            : ['error'],
        datasourceUrl: process.env.DATABASE_URL,
    })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
