import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import type { WidgetConfig, WidgetType } from '@/lib/types';

const MAX_RETRIES = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rechartsTypeToPlotly(type: string): string {
    const t = (type || '').toLowerCase().replace(/[-_\s]/g, '');
    if (t.includes('line')) return 'line';
    if (t.includes('area')) return 'area';
    if (t.includes('pie')) return 'pie';
    if (t.includes('scatter')) return 'scatter';
    if (t.includes('bar')) return 'bar';
    return 'bar';
}

function normalizeChartType(type: string): string {
    const t = (type || '').toLowerCase().replace(/[-_\s]/g, '');
    if (t.includes('line')) return 'line-chart';
    if (t.includes('area')) return 'area-chart';
    if (t.includes('pie')) return 'pie-chart';
    if (t.includes('scatter')) return 'scatter-chart';
    return 'bar-chart';
}

function generatePythonChartCode(chartConfig: {
    type: string;
    xAxisKey?: string;
    dataKeys?: string[];
    title?: string;
}): string {
    const plotlyType = rechartsTypeToPlotly(chartConfig.type);
    const title = (chartConfig.title || '').replace(/'/g, "\\'");
    const xKey = chartConfig.xAxisKey || 'x';
    const yKeys = chartConfig.dataKeys?.length ? chartConfig.dataKeys : ['y'];

    if (plotlyType === 'pie') {
        return `import plotly.express as px\n\n# df is auto-injected from the SQL step\nfig = px.pie(df, names='${xKey}', values='${yKeys[0]}', title='${title}')\nfig.show()`;
    }
    if (plotlyType === 'scatter') {
        return `import plotly.express as px\n\n# df is auto-injected from the SQL step\nfig = px.scatter(df, x='${xKey}', y='${yKeys[0]}', title='${title}')\nfig.show()`;
    }
    if (yKeys.length === 1) {
        return `import plotly.express as px\n\n# df is auto-injected from the SQL step\nfig = px.${plotlyType}(df, x='${xKey}', y='${yKeys[0]}', title='${title}')\nfig.show()`;
    }
    const yKeysStr = yKeys.map(k => `'${k}'`).join(', ');
    return `import plotly.express as px\nimport pandas as pd\n\n# df is auto-injected from the SQL step\ndf_melted = df.melt(id_vars='${xKey}', value_vars=[${yKeysStr}], var_name='Serie', value_name='Valore')\nfig = px.${plotlyType}(df_melted, x='${xKey}', y='Valore', color='Serie', title='${title}')\nfig.show()`;
}

/** PostgreSQL → SQL Server auto-fix */
function autoFixSql(query: string): string {
    let f = query;
    f = f.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([^)]+)\)/gi, 'DATEFROMPARTS(YEAR($1), MONTH($1), 1)');
    f = f.replace(/DATE_TRUNC\s*\(\s*'year'\s*,\s*([^)]+)\)/gi, 'DATEFROMPARTS(YEAR($1), 1, 1)');
    f = f.replace(/TO_CHAR\s*\(\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi, "FORMAT($1, '$2')");
    f = f.replace(/(\w+(?:\([^)]*\))?)\s*::\s*(date|text|varchar|integer|int|float|numeric|decimal)\b/gi, 'CAST($1 AS $2)');
    f = f.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^)]+)\)/gi, 'MONTH($1)');
    f = f.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^)]+)\)/gi, 'YEAR($1)');
    f = f.replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+([^)]+)\)/gi, 'DAY($1)');
    f = f.replace(/\bILIKE\b/gi, 'LIKE');
    const limitMatch = f.match(/\bLIMIT\s+(\d+)\s*$/i);
    if (limitMatch) { f = f.replace(/\bLIMIT\s+\d+\s*$/i, ''); f = f.replace(/^(\s*SELECT)\b/i, `$1 TOP ${limitMatch[1]}`); }
    f = f.replace(/\b=\s*true\b/gi, '= 1');
    f = f.replace(/\b=\s*false\b/gi, '= 0');
    f = f.replace(/\bNOW\s*\(\s*\)/gi, 'GETDATE()');
    f = f.replace(/\bCURRENT_DATE\b/gi, 'CAST(GETDATE() AS DATE)');
    return f;
}

async function testSql(query: string, connId: string) {
    try {
        const r = await executeSqlPreviewAction(query, connId, [], true);
        if (r.error) return { ok: false as const, error: r.error };
        const data = r.data || [];
        return { ok: true as const, data, columns: data.length > 0 ? Object.keys(data[0]) : [] };
    } catch (e: any) {
        return { ok: false as const, error: e.message };
    }
}

async function testPython(code: string, deps: any[], connId?: string) {
    try {
        const r = await executePythonPreviewAction(code, 'chart', {}, deps, connId, true);
        return r.success ? { ok: true as const } : { ok: false as const, error: r.error || 'Errore' };
    } catch (e: any) {
        return { ok: false as const, error: e.message };
    }
}

// ─── POST Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await db.user.findUnique({
            where: { email: session.user.email },
            include: { company: true },
        });
        if (!user?.company) {
            return NextResponse.json({ error: 'User not associated with a company' }, { status: 400 });
        }

        const companyId = user.company.id;
        const body = await request.json();

        const { treeName, chartConfig, sqlQuery, connectorId, pythonCode: _rawPythonCode } = body as {
            treeName: string;
            chartConfig: { type: string; data: any[]; xAxisKey?: string; dataKeys?: string[]; colors?: string[]; title?: string };
            sqlQuery?: string;
            connectorId?: string;
            pythonCode?: string;
        };

        console.log('[save-widget] Received:', { treeName, hasSqlQuery: !!sqlQuery, hasConnectorId: !!connectorId, chartType: chartConfig?.type });

        if (!treeName?.trim()) return NextResponse.json({ error: 'treeName is required' }, { status: 400 });
        if (!chartConfig?.data || !Array.isArray(chartConfig.data)) return NextResponse.json({ error: 'chartConfig.data is required' }, { status: 400 });

        const rootId = crypto.randomUUID();
        const sqlStepId = crypto.randomUUID();
        const pythonStepId = crypto.randomUUID();
        const leafId = crypto.randomUUID();

        const normalizedType = normalizeChartType(chartConfig.type);
        const widgetType = normalizedType as WidgetType;
        const hasSql = !!(sqlQuery && connectorId);
        const hasPython = !!_rawPythonCode;

        // ─── Phase 1: Test & auto-fix SQL ────────────────────────────────
        let finalSqlQuery = sqlQuery;
        let sqlOk = false;
        let actualColumns: string[] = [];

        if (hasSql) {
            let currentQuery = sqlQuery!;
            for (let i = 0; i < MAX_RETRIES; i++) {
                const result = await testSql(currentQuery, connectorId!);
                if (result.ok) {
                    sqlOk = true;
                    finalSqlQuery = currentQuery;
                    actualColumns = result.columns || [];
                    console.log(`[save-widget] SQL OK on attempt ${i + 1}, columns: ${actualColumns.join(', ')}`);
                    break;
                }
                console.log(`[save-widget] SQL attempt ${i + 1}/${MAX_RETRIES} failed: ${result.error}`);
                const fixed = autoFixSql(currentQuery);
                if (fixed === currentQuery) break; // no more fixes possible
                currentQuery = fixed;
            }

            if (!sqlOk) {
                return NextResponse.json({
                    error: `Query SQL non funziona. Impossibile creare il widget.`,
                    sqlError: true,
                }, { status: 400 });
            }
        }

        // ─── Phase 2: Generate & test Python ─────────────────────────────
        // Use actual SQL columns for correct Python code
        let finalXAxisKey = chartConfig.xAxisKey;
        let finalDataKeys = chartConfig.dataKeys;
        if (actualColumns.length >= 2) {
            if (!finalXAxisKey || !actualColumns.includes(finalXAxisKey)) finalXAxisKey = actualColumns[0];
            if (!finalDataKeys?.length || !finalDataKeys.every(k => actualColumns.includes(k))) finalDataKeys = actualColumns.slice(1);
        }

        let finalPythonCode = hasSql
            ? generatePythonChartCode({ type: normalizedType, xAxisKey: finalXAxisKey, dataKeys: finalDataKeys, title: treeName })
            : _rawPythonCode;
        let pythonOk = false;

        if (finalPythonCode && (hasSql ? sqlOk : true)) {
            const deps = hasSql ? [{ tableName: 'dati', query: finalSqlQuery, connectorId }] : [];
            for (let i = 0; i < MAX_RETRIES; i++) {
                const result = await testPython(finalPythonCode!, deps, connectorId);
                if (result.ok) {
                    pythonOk = true;
                    console.log(`[save-widget] Python OK on attempt ${i + 1}`);
                    break;
                }
                console.log(`[save-widget] Python attempt ${i + 1}/${MAX_RETRIES} failed: ${result.error}`);
                // Try auto-fix with actual columns
                if (result.error?.includes('KeyError') && actualColumns.length >= 2) {
                    finalPythonCode = generatePythonChartCode({
                        type: normalizedType, xAxisKey: actualColumns[0], dataKeys: actualColumns.slice(1), title: treeName,
                    });
                } else if (result.error?.includes("name 'df' is not defined")) {
                    finalPythonCode = `import pandas as pd\ndf = pd.DataFrame(dati)\n` + finalPythonCode;
                } else {
                    break; // can't auto-fix
                }
            }

            if (!pythonOk) {
                return NextResponse.json({
                    error: `Codice Python non funziona. Impossibile creare il widget.`,
                    pythonError: true,
                }, { status: 400 });
            }
        }

        // ─── Phase 3: Build tree nodes (with tested code) ────────────────
        const leafWidgetConfig: WidgetConfig = {
            type: widgetType,
            title: treeName,
            data: (!hasSql && !hasPython) ? chartConfig.data : undefined,
            xAxisKey: finalXAxisKey || undefined,
            dataKeys: finalDataKeys?.length ? finalDataKeys.filter((k: unknown) => typeof k === 'string') : undefined,
            colors: Array.isArray(chartConfig.colors) ? chartConfig.colors : undefined,
            isPublished: true,
            ...(hasSql ? { dataSourceType: 'current-sql' as const, dataSourceId: 'sql' } :
               hasPython ? { dataSourceType: 'current-python' as const, dataSourceId: 'python' } : {}),
        };

        const leafNode = { id: leafId, decision: treeName, widgetConfig: leafWidgetConfig };
        let rootNode: object;

        if (hasSql) {
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode: finalPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                pythonSelectedPipelines: ['dati'],
                pythonConnectorId: connectorId,
                options: { 'Visualizza': leafNode },
            };
            const sqlStepNode = {
                id: sqlStepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery: finalSqlQuery,
                sqlConnectorId: connectorId,
                sqlResultName: 'dati',
                options: { 'Elabora': pythonStepNode },
            };
            rootNode = { id: rootId, question: treeName, options: { 'Calcola': sqlStepNode } };
        } else if (hasPython) {
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode: _rawPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                options: { 'Visualizza': leafNode },
            };
            rootNode = { id: rootId, question: treeName, options: { 'Genera': pythonStepNode } };
        } else {
            rootNode = { id: rootId, question: treeName, options: { 'Visualizza': leafNode } };
        }

        // ─── Phase 4: Save (only tested & working code) ─────────────────
        console.log('[save-widget] SAVING tree:', { sqlOk, pythonOk, chartType: normalizedType, columns: actualColumns });

        const tree = await db.tree.create({
            data: {
                name: treeName,
                description: `Widget generato da FridAI Super Agent${hasSql ? ' tramite query SQL + Python (Plotly)' : hasPython ? ' tramite codice Python' : ''}`,
                naturalLanguageDecisionTree: treeName,
                jsonDecisionTree: JSON.stringify(rootNode),
                questionsScript: '',
                type: 'PIPELINE',
                companyId,
            },
        });

        return NextResponse.json({ success: true, treeId: tree.id, leafId, treeName: tree.name });
    } catch (error: any) {
        console.error('[super-agent/save-widget] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
