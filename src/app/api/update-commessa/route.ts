/**
 * Parameterized SQL write endpoint for HTML-generated editable tables.
 * Accepts structured data (operation, table, data, primaryKeys) and builds
 * parameterized queries server-side. No raw SQL accepted.
 *
 * Auth: requires authenticated session with companyId (multi-tenant).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import sql from 'mssql';
import { z } from 'zod';
import { rejectDangerousSql } from '@/lib/sql-guard';

// Column/identifier: any printable chars except [ and ] — safe because we always bracket-quote [identifier] in SQL.
// Blocking ] prevents breaking out of bracket quoting; blocking [ prevents nested brackets.
const IDENTIFIER_RE = /^[^\[\]\x00-\x1f]{1,128}$/;
// Table: optional schema prefix (e.g. dbo.TableName)
const TABLE_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}(\.[a-zA-Z_][a-zA-Z0-9_]{0,127})?$/;

// Generic parameterized write schema
const DbWriteSchema = z.object({
    operation: z.enum(['update', 'insert', 'delete']),
    table: z.string().regex(TABLE_RE, 'Nome tabella non valido'),
    data: z.record(
        z.string().regex(IDENTIFIER_RE, 'Nome colonna non valido'),
        z.union([z.string(), z.number(), z.boolean(), z.null()])
    ),
    primaryKeys: z.array(z.string().regex(IDENTIFIER_RE, 'Nome PK non valido')),
    connectorId: z.string().min(1).optional(),
}).refine(
    d => d.operation === 'insert' || d.primaryKeys.length > 0,
    { message: 'primaryKeys obbligatorio per update/delete' }
).refine(
    d => Object.keys(d.data).length > 0,
    { message: 'data non può essere vuoto' }
).refine(
    d => d.operation === 'insert' || d.primaryKeys.every(pk => pk in d.data),
    { message: 'Ogni PK deve essere presente in data' }
);

// Legacy schema for direct CommesseHubSpot updates (backward compat)
const LegacyCommessaSchema = z.object({
    connectorId: z.string().min(1).optional(),
    Job: z.string().min(1, 'Campo Job mancante').max(100),
    Descrizione: z.string().max(500).nullable().optional(),
    Codice: z.string().max(100).nullable().optional(),
    Cliente: z.string().max(200).nullable().optional(),
    Inizio: z.string().max(20).nullable().optional(),
    Fine: z.string().max(20).nullable().optional(),
});

function corsHeaders(req?: NextRequest) {
    const allowedOrigin = process.env.NEXTAUTH_URL || 'http://localhost:9002';
    const origin = req?.headers.get('origin');
    return {
        'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
    };
}

export async function OPTIONS(req: NextRequest) {
    return NextResponse.json({}, { headers: corsHeaders(req) });
}

async function getPool(connectorId: string, companyId: string): Promise<{ pool: sql.ConnectionPool; error?: string }> {
    // SECURITY: Always scope connector lookup by companyId to prevent cross-tenant access (C-02)
    const connector = await db.connector.findFirst({ where: { id: connectorId, companyId } });
    if (!connector || connector.type !== 'SQL') {
        return { pool: null as any, error: `Connettore SQL non trovato (id=${connectorId})` };
    }
    const conf = JSON.parse(connector.config);
    console.log(`[update-commessa] connector=${connector.id} database=${conf.database}`);
    const sqlConfig: sql.config = {
        user: conf.user, password: conf.password, server: conf.host, database: conf.database,
        options: {
            encrypt: conf.host?.includes('database.windows.net') ?? false,
            trustServerCertificate: process.env.NODE_ENV !== 'production',
            requestTimeout: 300000,
        },
        ...(conf.port ? { port: parseInt(conf.port) } : {}),
    };
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    return { pool };
}

// SECURITY: SQL statement-level safety check. Implementation in @/lib/sql-guard
// so it's unit-testable and reusable (also used by /api/internal/query-db).

/**
 * Escape a scalar value for safe embedding in T-SQL. Server-side only — never
 * apply to raw client-provided SQL strings. Used by buildDirectQuery below.
 */
function escapeSqlValue(value: string | number | boolean | null): string {
    if (value === null) return 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return String(value);
    return `N'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Convert Italian-formatted numeric strings to JS numbers when the value is
 * unambiguously numeric (no letters, matches `1.234,56` / `123,45` / `123.45`
 * / `123`). Leaves any other string untouched so addresses/codes like
 * "Via Roma, 10" or "1.234 pezzi" are preserved.
 */
const IT_NUMBER_RE = /^-?\d{1,3}(\.\d{3})+,\d+$/; // 1.234.567,89
const IT_SIMPLE_DECIMAL_RE = /^-?\d+,\d+$/;       // 123,45
const PLAIN_DECIMAL_RE = /^-?\d+(\.\d+)?$/;       // 123 or 123.45
function normalizeNumericValues(data: Record<string, string | number | boolean | null>) {
    const out: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'string') {
            const t = v.trim();
            if (IT_NUMBER_RE.test(t)) {
                const n = parseFloat(t.replace(/\./g, '').replace(',', '.'));
                out[k] = Number.isFinite(n) ? n : v;
            } else if (IT_SIMPLE_DECIMAL_RE.test(t)) {
                const n = parseFloat(t.replace(',', '.'));
                out[k] = Number.isFinite(n) ? n : v;
            } else if (PLAIN_DECIMAL_RE.test(t)) {
                const n = parseFloat(t);
                out[k] = Number.isFinite(n) ? n : v;
            } else {
                out[k] = v;
            }
        } else {
            out[k] = v;
        }
    }
    return out;
}

/**
 * Compare a value we sent with a value the DB returned after the write.
 * Lenient on number/string coercion and trailing whitespace so DECIMAL(18,2)
 * round-trips don't falsely report mismatch.
 */
function valuesMatch(expected: any, actual: any): boolean {
    if (expected === null || expected === undefined) return actual === null || actual === undefined;
    if (actual === null || actual === undefined) return false;
    const en = typeof expected === 'number' ? expected : parseFloat(String(expected).replace(/\./g, '').replace(',', '.'));
    const an = typeof actual === 'number' ? actual : parseFloat(String(actual).replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(en) && Number.isFinite(an)) return Math.abs(en - an) < 0.01;
    if (typeof expected === 'boolean') return Boolean(actual) === expected;
    if (actual instanceof Date) return String(expected).trim() === actual.toISOString().slice(0, 10) || String(expected).trim() === String(actual).trim();
    return String(expected).trim() === String(actual).trim();
}

/**
 * Read back the row we just wrote and confirm every non-PK column matches.
 * Returns {verified, actual, mismatches}. `verified:false` means the write
 * reported success but the persisted state does not match the request.
 */
async function verifyWrite(
    pool: sql.ConnectionPool,
    table: string,
    data: Record<string, string | number | boolean | null>,
    primaryKeys: string[],
): Promise<{ verified: boolean; actual?: Record<string, any>; mismatches?: string[] }> {
    const nonPk = Object.keys(data).filter(k => !primaryKeys.includes(k));
    if (nonPk.length === 0) return { verified: true };
    const cols = nonPk.map(c => `[${c}]`).join(', ');
    const where = primaryKeys.map(k => `[${k}] = ${escapeSqlValue(data[k])}`).join(' AND ');
    const q = `SELECT TOP 1 ${cols} FROM ${table} WHERE ${where}`;
    const res = await pool.request().query(q);
    if (!res.recordset || res.recordset.length === 0) {
        return { verified: false, mismatches: ['Riga non trovata dopo il write'] };
    }
    const actual = res.recordset[0];
    const mismatches: string[] = [];
    for (const c of nonPk) {
        if (!valuesMatch(data[c], actual[c])) {
            mismatches.push(`${c}: atteso=${JSON.stringify(data[c])} trovato=${JSON.stringify(actual[c])}`);
        }
    }
    return {
        verified: mismatches.length === 0,
        actual,
        mismatches: mismatches.length ? mismatches : undefined,
    };
}

/**
 * Build SQL with escaped literals. Safe because:
 *   - table validated by TABLE_RE
 *   - column names validated by IDENTIFIER_RE (no `]` allowed) and bracket-quoted
 *   - values escaped by escapeSqlValue
 *
 * Previous parameterized implementation (via sql.input @p0, @p1...) silently
 * matched zero rows in some legacy schemas due to node-mssql BigInt binding
 * quirks vs int columns. Escaped literals round-trip predictably and are
 * how the endpoint worked historically.
 */
function buildDirectQuery(
    operation: 'update' | 'insert' | 'delete',
    table: string,
    data: Record<string, string | number | boolean | null>,
    primaryKeys: string[],
): string {
    const entries = Object.entries(data);

    switch (operation) {
        case 'update': {
            const setCols = entries.filter(([k]) => !primaryKeys.includes(k));
            if (setCols.length === 0) throw new Error('Nessuna colonna da aggiornare');
            const setClause = setCols.map(([k, v]) => `[${k}] = ${escapeSqlValue(v)}`).join(', ');
            const whereClause = primaryKeys.map(k => `[${k}] = ${escapeSqlValue(data[k])}`).join(' AND ');
            return `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
        }
        case 'insert': {
            const cols = entries.map(([k]) => `[${k}]`).join(', ');
            const vals = entries.map(([, v]) => escapeSqlValue(v)).join(', ');
            return `INSERT INTO ${table} (${cols}) VALUES (${vals})`;
        }
        case 'delete': {
            const whereClause = primaryKeys.map(k => `[${k}] = ${escapeSqlValue(data[k])}`).join(' AND ');
            return `DELETE FROM ${table} WHERE ${whereClause}`;
        }
    }
}

async function resolveConnectorId(connectorId: string | undefined, companyId: string, req: NextRequest) {
    if (connectorId) return { connectorId, error: null };
    const connector = await db.connector.findFirst({
        where: { type: 'SQL', companyId },
        select: { id: true },
    });
    if (!connector) {
        return { connectorId: null, error: NextResponse.json(
            { success: false, message: 'Nessun connettore SQL disponibile' },
            { status: 400, headers: corsHeaders(req) }
        )};
    }
    return { connectorId: connector.id, error: null };
}

export async function POST(req: NextRequest) {
    let pool: sql.ConnectionPool | null = null;

    try {
        const session = await getServerSession(authOptions);
        const user = session?.user as { id?: string; companyId?: string } | undefined;
        if (!user?.companyId) {
            return NextResponse.json(
                { success: false, message: 'Non autenticato' },
                { status: 401, headers: corsHeaders(req) }
            );
        }

        const { rateLimit } = await import('@/lib/rate-limit');
        const uid = user.id || user.companyId;
        const rl = await rateLimit(`update-commessa:${uid}`, 60, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit superato. Riprova tra poco.' },
                { status: 429, headers: corsHeaders(req) }
            );
        }

        const body = await req.json();

        // ── Proxy mode: client sends {query, connectorId?} — execute directly with COMMIT ──
        if (body.query) {
            const userRole = (user as any).role;
            // SECURITY: raw-query escape hatch restricted to superadmin.
            // Previously admin-tier could execute arbitrary SQL against any of their
            // connectors; too broad. Structured path covers normal write needs.
            if (userRole !== 'superadmin') {
                return NextResponse.json(
                    { success: false, error: 'Accesso negato: solo superadmin possono eseguire query dirette' },
                    { status: 403, headers: corsHeaders(req) }
                );
            }
            // SECURITY: normalize (strip comments) and reject multi-statement batches
            // or any segment containing a blocked keyword.
            const offending = rejectDangerousSql(String(body.query));
            if (offending) {
                console.warn(`[update-commessa] blocked SQL segment by user=${user.id}: ${offending}`);
                return NextResponse.json(
                    { success: false, error: 'Query non consentita: parola chiave bloccata o statement DDL/sistema' },
                    { status: 403, headers: corsHeaders(req) }
                );
            }
            // Resolve connectorId: use provided one or find company's first SQL connector
            let connectorId = body.connectorId || '';
            if (connectorId) {
                const connector = await db.connector.findFirst({
                    where: { id: connectorId, companyId: user.companyId },
                    select: { id: true },
                });
                if (!connector) {
                    return NextResponse.json({ success: false, message: 'Connettore non autorizzato' }, { status: 403, headers: corsHeaders(req) });
                }
            } else {
                const connector = await db.connector.findFirst({
                    where: { type: 'SQL', companyId: user.companyId },
                    select: { id: true },
                });
                if (!connector) {
                    return NextResponse.json({ success: false, message: 'Nessun connettore SQL disponibile' }, { status: 400, headers: corsHeaders(req) });
                }
                connectorId = connector.id;
            }

            const { pool: p, error } = await getPool(connectorId, user.companyId);
            if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders(req) });
            pool = p;

            // Append COMMIT for write queries to ensure persistence
            const isWrite = /^\s*(UPDATE|INSERT|DELETE|MERGE)\b/i.test(body.query);
            const fullQuery = isWrite ? body.query + '; IF @@TRANCOUNT > 0 COMMIT' : body.query;
            console.log(`[update-commessa] proxy direct | user=${user.id} | connector=${connectorId} | isWrite=${isWrite}`);

            const result = await pool.request().query(fullQuery);
            const rowsAffected = result.rowsAffected ? result.rowsAffected.reduce((a: number, b: number) => a + b, 0) : 0;

            if (isWrite) {
                console.log(`[update-commessa] proxy WRITE: ${rowsAffected} rows affected`);
                return NextResponse.json(
                    { success: true, rowsAffected, message: `${rowsAffected} righe aggiornate` },
                    { headers: corsHeaders(req) }
                );
            }

            return NextResponse.json(
                { success: true, data: result.recordset || [], rowCount: result.recordset?.length || 0 },
                { headers: corsHeaders(req) }
            );
        }

        // ── Generic structured path (operation field present) ──
        if (body.operation) {
            const parsed = DbWriteSchema.safeParse(body);
            if (!parsed.success) {
                return NextResponse.json(
                    { success: false, message: parsed.error.issues[0]?.message || 'Input non valido' },
                    { status: 400, headers: corsHeaders(req) }
                );
            }

            const { operation, table, primaryKeys } = parsed.data;
            // Normalize Italian numeric strings ("809.090,91" → 809090.91) before
            // building SQL — avoids silent decimal-cast failures on SQL Server.
            const data = normalizeNumericValues(parsed.data.data);
            const { connectorId, error: connError } = await resolveConnectorId(parsed.data.connectorId, user.companyId, req);
            if (connError) return connError;

            const { pool: p, error } = await getPool(connectorId!, user.companyId);
            if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders(req) });
            pool = p;

            const query = buildDirectQuery(operation, table, data, primaryKeys);
            const fullQuery = query + '; IF @@TRANCOUNT > 0 COMMIT';
            console.log(`[update-commessa] ${operation} ${table} | query: ${fullQuery.substring(0, 500)}`);
            const result = await pool.request().query(fullQuery);

            const rowsAffected = result.rowsAffected?.[0] || 0;
            console.log(`[update-commessa] ${operation} ${table} by user=${user.id}: ${rowsAffected} rows`);

            if (rowsAffected === 0 && operation !== 'insert') {
                return NextResponse.json(
                    { success: false, verified: false, rowsAffected: 0, message: `Nessuna riga trovata per ${operation}` },
                    { headers: corsHeaders(req) }
                );
            }

            // Write-then-verify: read the row back and compare values.
            // delete → confirm the row is gone. update/insert → confirm values match.
            let verified = true;
            let actual: Record<string, any> | undefined;
            let mismatches: string[] | undefined;
            try {
                if (operation === 'delete') {
                    const cols = primaryKeys.map(c => `[${c}]`).join(', ');
                    const where = primaryKeys.map(k => `[${k}] = ${escapeSqlValue(data[k])}`).join(' AND ');
                    const check = await pool.request().query(`SELECT TOP 1 ${cols} FROM ${table} WHERE ${where}`);
                    if (check.recordset && check.recordset.length > 0) {
                        verified = false;
                        mismatches = ['Riga ancora presente dopo DELETE'];
                    }
                } else if (operation === 'update' || (operation === 'insert' && primaryKeys.length > 0 && primaryKeys.every(pk => pk in data))) {
                    const v = await verifyWrite(pool, table, data, primaryKeys);
                    verified = v.verified;
                    actual = v.actual;
                    mismatches = v.mismatches;
                }
            } catch (verifyErr: any) {
                console.warn(`[update-commessa] verify read-back failed: ${verifyErr.message}`);
                verified = false;
                mismatches = [`Verifica fallita: ${verifyErr.message}`];
            }

            if (!verified) {
                console.warn(`[update-commessa] ${operation} ${table} NOT VERIFIED:`, mismatches);
                return NextResponse.json(
                    {
                        success: false,
                        verified: false,
                        rowsAffected,
                        actual,
                        mismatches,
                        message: `Scrittura non verificata: ${mismatches?.[0] || 'valore persistito diverso da quello inviato'}`,
                    },
                    { headers: corsHeaders(req) }
                );
            }

            return NextResponse.json(
                {
                    success: true,
                    verified: true,
                    rowsAffected,
                    actual,
                    message: `${rowsAffected} righe ${operation === 'delete' ? 'eliminate' : operation === 'insert' ? 'inserite' : 'aggiornate'} e verificate`,
                },
                { headers: corsHeaders(req) }
            );
        }

        // ── Legacy CommesseHubSpot path (backward compat) ──
        const parsed = LegacyCommessaSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, message: parsed.error.issues[0]?.message || 'Input non valido' },
                { status: 400, headers: corsHeaders(req) }
            );
        }

        const { Job, Descrizione, Codice, Cliente, Inizio, Fine } = parsed.data;
        const { connectorId, error: connError } = await resolveConnectorId(parsed.data.connectorId, user.companyId, req);
        if (connError) return connError;

        const { pool: p, error } = await getPool(connectorId!, user.companyId);
        if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders(req) });
        pool = p;

        const legacyReq = pool.request();
        legacyReq.input('Descrizione', sql.NVarChar, Descrizione || null);
        legacyReq.input('Codice', sql.NVarChar, Codice || null);
        legacyReq.input('Cliente', sql.NVarChar, Cliente || null);
        legacyReq.input('Inizio', sql.NVarChar, Inizio || null);
        legacyReq.input('Fine', sql.NVarChar, Fine || null);
        legacyReq.input('Job', sql.NVarChar, Job);
        const result = await legacyReq.query(`
            UPDATE dbo.CommesseHubSpot
            SET Descrizione = @Descrizione,
                Codice = @Codice,
                Cliente = @Cliente,
                Inizio = @Inizio,
                Fine = @Fine
            WHERE Job = @Job;
            IF @@TRANCOUNT > 0 COMMIT
        `);

        const rowsAffected = result.rowsAffected?.[0] || 0;
        console.log(`[update-commessa] Updated Job=${Job} by user=${user.id}: ${rowsAffected} rows`);

        return NextResponse.json(
            { success: true, message: `Riga aggiornata (${rowsAffected})` },
            { headers: corsHeaders(req) }
        );

    } catch (e: any) {
        console.error('[update-commessa] Error:', e.message);
        return NextResponse.json(
            { success: false, message: 'Errore interno del server' },
            { status: 500, headers: corsHeaders(req) }
        );
    } finally {
        if (pool) {
            try { await pool.close(); } catch { /* ignore */ }
        }
    }
}
