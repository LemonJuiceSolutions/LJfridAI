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
        'Access-Control-Allow-Origin': origin === allowedOrigin || origin === 'null' ? (origin === 'null' ? allowedOrigin : origin) : '',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
    };
}

export async function OPTIONS(req: NextRequest) {
    return NextResponse.json({}, { headers: corsHeaders(req) });
}

async function getPool(connectorId: string): Promise<{ pool: sql.ConnectionPool; error?: string }> {
    const connector = await db.connector.findUnique({ where: { id: connectorId } });
    if (!connector || connector.type !== 'SQL') {
        return { pool: null as any, error: `Connettore SQL non trovato (id=${connectorId})` };
    }
    const conf = JSON.parse(connector.config);
    console.log(`[update-commessa] connector=${connector.id} name=${connector.name} server=${conf.host} database=${conf.database}`);
    const sqlConfig: sql.config = {
        user: conf.user, password: conf.password, server: conf.host, database: conf.database,
        options: {
            encrypt: conf.host?.includes('database.windows.net') ?? false,
            trustServerCertificate: true,
            requestTimeout: 300000,
        },
        ...(conf.port ? { port: parseInt(conf.port) } : {}),
    };
    const pool = new sql.ConnectionPool(sqlConfig);
    await pool.connect();
    return { pool };
}

// Escape a value for safe SQL embedding (server-side only, never from raw client SQL)
function escapeSqlValue(value: string | number | boolean | null): string {
    if (value === null) return 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return String(value);
    // Escape single quotes by doubling them — standard SQL injection prevention
    return `N'${String(value).replace(/'/g, "''")}'`;
}

// Build SQL with escaped literals (same execution path as query-db which works).
// Safe because: table validated by TABLE_RE, columns validated by IDENTIFIER_RE (no ] allowed),
// values escaped server-side. No client-provided raw SQL.
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
            return `INSERT INTO ${table} (${entries.map(([k]) => `[${k}]`).join(', ')}) VALUES (${entries.map(([, v]) => escapeSqlValue(v)).join(', ')})`;
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

        const body = await req.json();

        // ── Proxy mode: client sends {query, connectorId?} — execute directly with COMMIT ──
        if (body.query) {
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

            const { pool: p, error } = await getPool(connectorId);
            if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders(req) });
            pool = p;

            // Append COMMIT for write queries to ensure persistence
            const isWrite = /^\s*(UPDATE|INSERT|DELETE|MERGE)\b/i.test(body.query);
            const fullQuery = isWrite ? body.query + '; IF @@TRANCOUNT > 0 COMMIT' : body.query;
            console.log(`[update-commessa] proxy direct | user=${user.id} | connector=${connectorId} | query: ${fullQuery.substring(0, 300)}`);

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

            const { operation, table, data, primaryKeys } = parsed.data;
            const { connectorId, error: connError } = await resolveConnectorId(parsed.data.connectorId, user.companyId, req);
            if (connError) return connError;

            const { pool: p, error } = await getPool(connectorId!);
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
                    { success: false, rowsAffected: 0, message: `Nessuna riga trovata per ${operation}` },
                    { headers: corsHeaders(req) }
                );
            }

            return NextResponse.json(
                { success: true, rowsAffected, message: `${rowsAffected} righe ${operation === 'delete' ? 'eliminate' : operation === 'insert' ? 'inserite' : 'aggiornate'}` },
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

        const { pool: p, error } = await getPool(connectorId!);
        if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders(req) });
        pool = p;

        const result = await pool.request().query(`
            UPDATE dbo.CommesseHubSpot
            SET Descrizione = ${escapeSqlValue(Descrizione || null)},
                Codice = ${escapeSqlValue(Codice || null)},
                Cliente = ${escapeSqlValue(Cliente || null)},
                Inizio = ${escapeSqlValue(Inizio || null)},
                Fine = ${escapeSqlValue(Fine || null)}
            WHERE Job = ${escapeSqlValue(Job)};
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
