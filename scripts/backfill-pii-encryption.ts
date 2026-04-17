/**
 * One-shot backfill: encrypt PII fields in existing rows.
 *
 * USAGE
 * -----
 *   1. Take a fresh DB backup. THIS IS NOT REVERSIBLE without the
 *      ENCRYPTION_KEY you used. If the key is lost, encrypted columns become
 *      unrecoverable.
 *   2. Set ENCRYPTION_KEY in env (32 base64-decoded bytes).
 *   3. Run: `npx tsx scripts/backfill-pii-encryption.ts`
 *   4. Optional dry run: `DRY_RUN=1 npx tsx scripts/backfill-pii-encryption.ts`
 *
 * WHAT IT DOES
 * ------------
 * For every model listed in `src/lib/pii-fields.ts`, scans all rows and
 * encrypts each listed field that is still plaintext (not prefixed with
 * `enc:v1:`). Idempotent: re-running is safe because already-encrypted
 * values are skipped.
 *
 * SCOPE
 * -----
 * Only fields registered in PII_FIELDS_BY_MODEL are touched. Indexed/unique
 * PII fields (Lead.email, User.email, WhatsAppContact.phoneNumber) are NOT
 * encrypted by this script — they need a separate HMAC-index migration.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PII_FIELDS_BY_MODEL } from '../src/lib/pii-fields';
import { encrypt, isEncrypted } from '../src/lib/encryption';

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const BATCH_SIZE = 100;

if (!process.env.ENCRYPTION_KEY) {
    console.error('FATAL: ENCRYPTION_KEY is not set. Refusing to proceed.');
    process.exit(1);
}

// Use a *raw* PrismaClient (no extension) so we read existing plaintext
// without triggering the encryption layer.
const raw = new PrismaClient({ log: ['error'] });

interface ModelStats { scanned: number; encrypted: number; skipped: number; errors: number; }

async function backfillModel(modelName: string, fields: readonly string[]): Promise<ModelStats> {
    const stats: ModelStats = { scanned: 0, encrypted: 0, skipped: 0, errors: 0 };

    // Lowercase first letter to match Prisma client property naming.
    const property = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    const delegate = (raw as any)[property];
    if (!delegate || typeof delegate.findMany !== 'function') {
        console.warn(`[skip] Model "${modelName}" not found on Prisma client.`);
        return stats;
    }

    let cursor: string | undefined;
    while (true) {
        const rows: any[] = await delegate.findMany({
            take: BATCH_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: 'asc' },
        });
        if (rows.length === 0) break;
        cursor = rows[rows.length - 1].id;

        for (const row of rows) {
            stats.scanned++;
            const updates: Record<string, string> = {};
            for (const field of fields) {
                const value = row[field];
                if (typeof value !== 'string') continue;
                if (isEncrypted(value)) { stats.skipped++; continue; }
                const enc = encrypt(value);
                if (typeof enc === 'string') updates[field] = enc;
            }
            if (Object.keys(updates).length === 0) continue;
            if (DRY_RUN) {
                stats.encrypted++;
                continue;
            }
            try {
                await delegate.update({ where: { id: row.id }, data: updates });
                stats.encrypted++;
            } catch (e: any) {
                stats.errors++;
                console.error(`[error] ${modelName}#${row.id}:`, e?.message);
            }
        }
        process.stdout.write(`  ${modelName}: scanned=${stats.scanned} encrypted=${stats.encrypted} skipped=${stats.skipped} errors=${stats.errors}\r`);
    }
    process.stdout.write('\n');
    return stats;
}

async function main() {
    console.log(`PII backfill — DRY_RUN=${DRY_RUN ? 'YES' : 'NO'}`);
    console.log('Models to process:', Object.keys(PII_FIELDS_BY_MODEL).join(', '));
    console.log('---');

    const all: Array<[string, ModelStats]> = [];
    for (const [model, fields] of Object.entries(PII_FIELDS_BY_MODEL)) {
        console.log(`\n[${model}] fields: ${fields.join(', ')}`);
        const stats = await backfillModel(model, fields);
        all.push([model, stats]);
    }

    console.log('\n=== SUMMARY ===');
    for (const [model, s] of all) {
        console.log(`  ${model}: scanned=${s.scanned} encrypted=${s.encrypted} skipped=${s.skipped} errors=${s.errors}`);
    }
    if (DRY_RUN) console.log('\nDRY RUN — no rows were modified. Re-run without DRY_RUN=1 to apply.');
}

main()
    .catch(err => { console.error('FATAL:', err); process.exit(1); })
    .finally(() => raw.$disconnect());
