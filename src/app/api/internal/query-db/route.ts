/**
 * Internal API endpoint for Python sandbox to execute SQL queries.
 * Called by the injected `query_db()` function inside the Python runtime.
 * Only accepts requests from localhost (Python backend at port 5005).
 *
 * IMPORTANT: This runs the query DIRECTLY on the database, bypassing
 * cross-tree dependency resolution. The Python code calls query_db()
 * to talk to the real database, not to pipeline temp tables.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import sql from 'mssql';

export async function POST(req: NextRequest) {
    let pool: sql.ConnectionPool | null = null;

    try {
        const body = await req.json();
        const { query, connectorId, internalToken, companyId } = body;

        // Basic validation
        if (!query || !connectorId || !companyId) {
            return NextResponse.json(
                { error: 'Missing query, connectorId, or companyId' },
                { status: 400 }
            );
        }

        // Verify internal token (shared secret between Next.js and Python backend)
        if (!process.env.INTERNAL_QUERY_TOKEN) {
            return NextResponse.json(
                { error: 'Server misconfiguration: INTERNAL_QUERY_TOKEN not set' },
                { status: 500 }
            );
        }
        const expectedToken = process.env.INTERNAL_QUERY_TOKEN;
        if (internalToken !== expectedToken) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Block dangerous DDL/exec statements
        const BLOCKED_DDL_RE = /^\s*(DROP|TRUNCATE|ALTER|CREATE|EXEC|EXECUTE|xp_|sp_)\b/i;
        if (BLOCKED_DDL_RE.test(query)) {
            return NextResponse.json(
                { error: 'DDL/EXEC statements are not allowed (DROP, TRUNCATE, ALTER, CREATE, EXEC)' },
                { status: 403 }
            );
        }

        console.log(`[internal/query-db] Executing query (${query.length} chars) with connectorId: ${connectorId}`);

        // Find the connector — scoped to companyId for tenant isolation
        const connector = await db.connector.findFirst({ where: { id: connectorId, companyId } });
        if (!connector || connector.type !== 'SQL') {
            return NextResponse.json(
                { error: 'Connettore SQL non trovato o non configurato.' },
                { status: 400 }
            );
        }

        // Parse connector config
        let conf;
        try {
            conf = JSON.parse(connector.config);
        } catch {
            return NextResponse.json(
                { error: 'Configurazione connettore non valida.' },
                { status: 400 }
            );
        }

        // Build SQL config
        const sqlConfig: sql.config = {
            user: conf.user,
            password: conf.password,
            server: conf.host,
            database: conf.database,
            options: {
                encrypt: conf.host?.includes('database.windows.net') ?? false,
                trustServerCertificate: process.env.NODE_ENV !== 'production',
                connectTimeout: 60000,
                requestTimeout: 300000,
            },
            ...(conf.port ? { port: parseInt(conf.port) } : {}),
        };

        // Connect and execute DIRECTLY - no pipeline resolution
        pool = new sql.ConnectionPool(sqlConfig);
        await pool.connect();

        const result = await pool.request().query(query);
        const data = result.recordset || [];
        const rowsAffected = result.rowsAffected ? result.rowsAffected.reduce((a: number, b: number) => a + b, 0) : 0;

        // Detect if this is a write operation (UPDATE/INSERT/DELETE)
        const isWrite = /^\s*(UPDATE|INSERT|DELETE|MERGE)\b/i.test(query);

        if (isWrite) {
            console.log(`[internal/query-db] WRITE query: ${rowsAffected} rows affected`);
            return NextResponse.json({
                success: true,
                rowsAffected,
                data: data.length > 0 ? data : [],
                columns: data.length > 0 ? Object.keys(data[0]) : [],
                rowCount: data.length,
            });
        }

        console.log(`[internal/query-db] READ query returned ${data.length} rows`);
        return NextResponse.json({
            success: true,
            data,
            columns: data.length > 0 ? Object.keys(data[0]) : [],
            rowCount: data.length,
        });
    } catch (e: any) {
        console.error('[internal/query-db] Error:', e.message);
        return NextResponse.json(
            { error: e.message || 'Internal server error' },
            { status: 500 }
        );
    } finally {
        if (pool) {
            try { await pool.close(); } catch { /* ignore */ }
        }
    }
}
