/**
 * Diagnostic: reproduces the queries that getTreesAction + widget-data-batch
 * run, through both a raw PrismaClient AND an inline copy of the encryption
 * extension (bypassing `server-only` which only loads inside Next).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function isEncrypted(v: any): boolean { return typeof v === 'string' && v.startsWith(PREFIX); }
function getKey(): Buffer {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY missing');
    const k = Buffer.from(raw, 'base64');
    if (k.length !== 32) throw new Error(`key must be 32 bytes, got ${k.length}`);
    return k;
}
function encrypt(plain: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const c = createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    const tag = c.getAuthTag();
    return PREFIX + Buffer.concat([Buffer.from([1]), iv, tag, ct]).toString('base64');
}
function tryDecrypt(v: any): any {
    if (typeof v !== 'string' || !v.startsWith(PREFIX)) return v;
    try {
        const p = Buffer.from(v.slice(PREFIX.length), 'base64');
        const iv = p.subarray(1, 1 + IV_LENGTH);
        const tag = p.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
        const data = p.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
        const d = createDecipheriv(ALGO, getKey(), iv);
        d.setAuthTag(tag);
        return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    } catch { return null; }
}

const PII: Record<string, string[]> = {
    Lead: ['phone', 'linkedinUrl', 'notes'],
    Connector: ['config'],
    WhatsAppContact: ['notes'],
};

async function main() {
    console.log('--- Diagnostic start ---');
    console.log('ENCRYPTION_KEY set:', !!process.env.ENCRYPTION_KEY);
    console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
    try { getKey(); console.log('ENCRYPTION_KEY valid (32 bytes base64): YES'); }
    catch (e: any) { console.log('ENCRYPTION_KEY INVALID:', e.message); }

    const base = new PrismaClient({ log: ['warn', 'error'] });

    // Build $extends that mirrors src/lib/db.ts
    const ext = (base as any).$extends({
        name: 'pii-encryption',
        query: {
            $allModels: {
                async findMany({ model, args, query }: any) {
                    const fields = PII[model];
                    const r = await query(args);
                    if (!fields) return r;
                    return Array.isArray(r) ? r.map((row: any) => {
                        const out = { ...row };
                        for (const f of fields) if (typeof out[f] === 'string') out[f] = tryDecrypt(out[f]);
                        return out;
                    }) : r;
                },
                async findFirst({ model, args, query }: any) {
                    const fields = PII[model];
                    const r = await query(args);
                    if (!r || !fields) return r;
                    const out = { ...r };
                    for (const f of fields) if (typeof out[f] === 'string') out[f] = tryDecrypt(out[f]);
                    return out;
                },
                async findUnique({ model, args, query }: any) {
                    const fields = PII[model];
                    const r = await query(args);
                    if (!r || !fields) return r;
                    const out = { ...r };
                    for (const f of fields) if (typeof out[f] === 'string') out[f] = tryDecrypt(out[f]);
                    return out;
                },
            },
        },
    });

    console.log('\n[raw] trees.findMany...');
    const rawTrees = await base.tree.findMany({ take: 2, select: { id: true, name: true, companyId: true } });
    console.log(`[raw] ok — ${rawTrees.length} trees`);

    console.log('\n[ext] trees.findMany...');
    const extTrees = await ext.tree.findMany({ take: 2, select: { id: true, name: true, companyId: true } });
    console.log(`[ext] ok — ${extTrees.length} trees`);

    if (extTrees.length > 0) {
        console.log('\n[ext] nodePreviewCache.findMany (widget-data-batch query)...');
        const previews = await ext.nodePreviewCache.findMany({
            where: { treeId: extTrees[0].id },
            take: 3,
        });
        console.log(`[ext] ok — ${previews.length} previews`);
    }

    console.log('\n[ext] user.findFirst with include { company } (auth-adapter style)...');
    const firstUser = await base.user.findFirst({ select: { email: true } });
    if (firstUser) {
        const u = await ext.user.findUnique({ where: { email: firstUser.email }, include: { company: true } });
        console.log(`[ext] ok — user ${u?.email}, company ${u?.company?.name}`);
    }

    console.log('\n[ext] lead.findMany (PII model, decrypt path)...');
    const leads = await ext.lead.findMany({ take: 2 });
    console.log(`[ext] ok — ${leads.length} leads`);
    for (const l of leads) console.log(`  - ${l.id}: phone=${l.phone?.slice(0, 20)}`);

    console.log('\n--- ALL QUERIES PASSED ---');
    await base.$disconnect();
}

main().catch(err => { console.error('\n!!! FAILED !!!'); console.error(err); process.exit(1); });
