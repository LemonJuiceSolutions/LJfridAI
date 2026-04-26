import { PrismaClient } from '@prisma/client'
import { encrypt, tryDecrypt } from '@/lib/encryption'
import { getPiiFields } from '@/lib/pii-fields'

const globalForPrisma = global as unknown as { prisma: any }

/**
 * Appends connection pool parameters to the DATABASE_URL if not already present.
 * Ensures consistent pooling behavior regardless of how the env var is configured.
 */
function appendPoolParams(url: string | undefined): string | undefined {
    if (!url) return url;
    if (url.includes('connection_limit')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}connection_limit=20&pool_timeout=10`;
}

const baseClient =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['warn', 'error']   // solo warning/errori, NON query
            : ['error'],
        datasourceUrl: appendPoolParams(process.env.DATABASE_URL),
    })

function transformWriteData(data: any, fields: readonly string[]): any {
    if (!data || typeof data !== 'object') return data;
    const out: any = Array.isArray(data) ? [...data] : { ...data };
    for (const field of fields) {
        const v = out[field];
        if (typeof v === 'string') {
            out[field] = encrypt(v);
        } else if (v && typeof v === 'object' && 'set' in v && typeof v.set === 'string') {
            out[field] = { ...v, set: encrypt(v.set) };
        }
    }
    return out;
}

function transformReadResult(result: any, fields: readonly string[]): any {
    if (!result) return result;
    if (Array.isArray(result)) return result.map(r => transformReadResult(r, fields));
    if (typeof result !== 'object') return result;
    const out: any = { ...result };
    for (const field of fields) {
        const v = out[field];
        if (typeof v === 'string') out[field] = tryDecrypt(v);
    }
    return out;
}

// Transparent encryption-at-rest for fields listed in pii-fields.ts.
// Opt-in: requires BOTH `ENCRYPTION_KEY` (32-byte base64) AND
// `PII_ENCRYPTION_ENABLED=true`. Double gate prevents partial rollouts from
// encrypting writes before the backfill has run on existing plaintext rows.
// Flip to true only AFTER:
//   1. Running `scripts/backfill-pii-encryption.ts` against a fresh backup.
//   2. Verifying `Lead.phone` / `Connector.config` rows start with `enc:v1:`.
const encryptionEnabled =
    !!process.env.ENCRYPTION_KEY &&
    process.env.PII_ENCRYPTION_ENABLED === 'true';

if (process.env.NODE_ENV === 'production' && !encryptionEnabled) {
  throw new Error(
    'PII encryption is disabled in production. Set ENCRYPTION_KEY and PII_ENCRYPTION_ENABLED=true.',
  );
}

const piiExtension = encryptionEnabled
    ? baseClient.$extends({
        name: 'pii-encryption',
        query: {
            $allModels: {
                async create({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    if (fields) args.data = transformWriteData(args.data, fields);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async createMany({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    if (fields && Array.isArray(args.data)) {
                        args.data = args.data.map((d: any) => transformWriteData(d, fields));
                    }
                    return query(args);
                },
                async update({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    if (fields) args.data = transformWriteData(args.data, fields);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async updateMany({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    if (fields) args.data = transformWriteData(args.data, fields);
                    return query(args);
                },
                async upsert({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    if (fields) {
                        args.create = transformWriteData(args.create, fields);
                        args.update = transformWriteData(args.update, fields);
                    }
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async findUnique({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async findUniqueOrThrow({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async findFirst({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async findFirstOrThrow({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
                async findMany({ model, args, query }: any) {
                    const fields = getPiiFields(model);
                    const r = await query(args);
                    return fields ? transformReadResult(r, fields) : r;
                },
            },
        },
    })
    : baseClient;

export const db = piiExtension as typeof baseClient;

// Raw (non-extended) client. Used by libs that poke at internal Prisma state
// and break under $extends proxies — e.g. @auth/prisma-adapter — and by the
// PII backfill script which must bypass the encryption layer to read legacy
// plaintext rows.
export const dbRaw: typeof baseClient = baseClient;

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = baseClient
