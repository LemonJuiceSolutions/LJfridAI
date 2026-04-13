/**
 * SQL write endpoint for HTML-generated editable tables.
 * Accepts row data with Job as PK and builds an UPDATE for dbo.CommesseHubSpot.
 * Also accepts raw SQL + connectorId + token for generic queries.
 *
 * Auth: tries session first, falls back to connectorId lookup (for iframe srcdoc calls).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import sql from 'mssql';

// Allow CORS from same origin (srcdoc iframes send origin: null)
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders() });
}

async function getPool(connectorId: string): Promise<{ pool: sql.ConnectionPool; error?: string }> {
    const connector = await db.connector.findUnique({ where: { id: connectorId } });
    if (!connector || connector.type !== 'SQL') {
        return { pool: null as any, error: 'Connettore SQL non trovato' };
    }
    const conf = JSON.parse(connector.config);
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

export async function POST(req: NextRequest) {
    let pool: sql.ConnectionPool | null = null;

    try {
        const body = await req.json();
        console.log('[update-commessa] Received:', JSON.stringify(body).substring(0, 300));

        // Mode 1: Raw SQL + connectorId + token (from Python-generated HTML)
        if (body.query && body.connectorId && body.internalToken) {
            if (!process.env.INTERNAL_QUERY_TOKEN) {
                return NextResponse.json({ success: false, message: 'Server misconfiguration: INTERNAL_QUERY_TOKEN not set' }, { status: 500, headers: corsHeaders() });
            }
            const expectedToken = process.env.INTERNAL_QUERY_TOKEN;
            if (body.internalToken !== expectedToken) {
                return NextResponse.json({ success: false, message: 'Token non valido' }, { status: 401, headers: corsHeaders() });
            }
            const { pool: p, error } = await getPool(body.connectorId);
            if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders() });
            pool = p;

            const result = await pool.request().query(body.query);
            const rowsAffected = result.rowsAffected ? result.rowsAffected.reduce((a: number, b: number) => a + b, 0) : 0;
            console.log(`[update-commessa] SQL executed: ${rowsAffected} rows affected`);
            return NextResponse.json({ success: true, rowsAffected, message: `${rowsAffected} righe aggiornate` }, { headers: corsHeaders() });
        }

        // Mode 2: Row data with Job as PK for CommesseHubSpot
        let connectorId = body.connectorId;
        if (!connectorId) {
            // List all SQL connectors to find the right one
            const connectors = await db.connector.findMany({ where: { type: 'SQL' }, select: { id: true, name: true, config: true } });
            console.log(`[update-commessa] No connectorId in body. Found ${connectors.length} SQL connectors:`, connectors.map(c => `${c.name}(${c.id})`));
            // Try to find one that has the CommesseHubSpot table (check database name)
            const connector = connectors[0]; // fallback to first
            if (!connector) {
                return NextResponse.json({ success: false, message: 'Nessun connettore SQL disponibile' }, { status: 400, headers: corsHeaders() });
            }
            connectorId = connector.id;
            console.log(`[update-commessa] Using connector: ${connector.name} (${connectorId})`);
        }

        const { Job, Descrizione, Codice, Cliente, Inizio, Fine } = body;
        if (!Job) {
            return NextResponse.json({ success: false, message: 'Campo Job mancante' }, { status: 400, headers: corsHeaders() });
        }

        const { pool: p, error } = await getPool(connectorId);
        if (error) return NextResponse.json({ success: false, message: error }, { status: 400, headers: corsHeaders() });
        pool = p;

        const request = pool.request();
        request.input('Job', sql.NVarChar, Job);
        request.input('Descrizione', sql.NVarChar, Descrizione || null);
        request.input('Codice', sql.NVarChar, Codice || null);
        request.input('Cliente', sql.NVarChar, Cliente || null);
        request.input('Inizio', sql.NVarChar, Inizio || null);
        request.input('Fine', sql.NVarChar, Fine || null);

        const result = await request.query(`
            UPDATE dbo.CommesseHubSpot
            SET Descrizione = @Descrizione, Codice = @Codice, Cliente = @Cliente, Inizio = @Inizio, Fine = @Fine
            WHERE Job = @Job
        `);

        const rowsAffected = result.rowsAffected?.[0] || 0;
        console.log(`[update-commessa] Updated Job=${Job}: ${rowsAffected} rows`);

        return NextResponse.json(
            { success: true, message: `Riga aggiornata (${rowsAffected})` },
            { headers: corsHeaders() }
        );

    } catch (e: any) {
        console.error('[update-commessa] Error:', e.message);
        return NextResponse.json(
            { success: false, message: e.message || 'Errore interno' },
            { status: 500, headers: corsHeaders() }
        );
    } finally {
        if (pool) {
            try { await pool.close(); } catch { /* ignore */ }
        }
    }
}
