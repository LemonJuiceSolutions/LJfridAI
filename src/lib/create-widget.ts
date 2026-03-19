/**
 * Shared widget creation logic used by both:
 * - Super Agent OpenRouter path (streamText tools)
 * - Super Agent Claude CLI path (MCP tool endpoint)
 */
import { db } from '@/lib/db';
import { executeSqlPreviewAction, executePythonPreviewAction } from '@/app/actions';
import type { WidgetConfig, WidgetType } from '@/lib/types';

// ─── Chart type helpers ──────────────────────────────────────────────────────

export function rechartsTypeToPlotly(type: string): string {
    const t = (type || '').toLowerCase().replace(/[-_\s]/g, '');
    if (t.includes('line')) return 'line';
    if (t.includes('area')) return 'area';
    if (t.includes('pie')) return 'pie';
    if (t.includes('scatter')) return 'scatter';
    if (t.includes('bar')) return 'bar';
    return 'bar';
}

export function generatePythonChartCode(chartConfig: {
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
        const valueKey = yKeys[0];
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.pie(df, names='${xKey}', values='${valueKey}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    if (plotlyType === 'scatter') {
        const yKey = yKeys[0];
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.scatter(df, x='${xKey}', y='${yKey}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    if (yKeys.length === 1) {
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.${plotlyType}(df, x='${xKey}', y='${yKeys[0]}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    const yKeysStr = yKeys.map(k => `'${k}'`).join(', ');
    return [
        `import plotly.express as px`,
        `import pandas as pd`,
        ``,
        `# df is auto-injected from the SQL step`,
        `df_melted = df.melt(id_vars='${xKey}', value_vars=[${yKeysStr}], var_name='Serie', value_name='Valore')`,
        `fig = px.${plotlyType}(df_melted, x='${xKey}', y='Valore', color='Serie', title='${title}')`,
        `fig.show()`,
    ].join('\n');
}

// ─── Test helpers ────────────────────────────────────────────────────────────

export async function testSql(query: string, connId: string): Promise<{ ok: boolean; data?: any[]; columns?: string[]; error?: string }> {
    try {
        const r = await executeSqlPreviewAction(query, connId, [], true);
        if (r.error) return { ok: false, error: r.error };
        const data = r.data || [];
        return { ok: true, data, columns: data.length > 0 ? Object.keys(data[0]) : [] };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

export async function testPython(code: string, deps: any[], connId?: string): Promise<{ ok: boolean; error?: string }> {
    try {
        const r = await executePythonPreviewAction(code, 'chart', {}, deps, connId, true);
        return r.success ? { ok: true } : { ok: false, error: r.error || 'Errore sconosciuto' };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
}

export function autoFixSqlQuery(query: string, error: string): string {
    let fixed = query;

    // DATE_TRUNC('month', col) → DATEFROMPARTS(YEAR(col), MONTH(col), 1)
    fixed = fixed.replace(/DATE_TRUNC\s*\(\s*'month'\s*,\s*([^)]+)\)/gi,
        'DATEFROMPARTS(YEAR($1), MONTH($1), 1)');
    fixed = fixed.replace(/DATE_TRUNC\s*\(\s*'year'\s*,\s*([^)]+)\)/gi,
        'DATEFROMPARTS(YEAR($1), 1, 1)');

    // TO_CHAR(col, 'YYYY-MM') → FORMAT(col, 'yyyy-MM')
    fixed = fixed.replace(/TO_CHAR\s*\(\s*([^,]+)\s*,\s*'YYYY-MM'\s*\)/gi,
        "FORMAT($1, 'yyyy-MM')");
    fixed = fixed.replace(/TO_CHAR\s*\(\s*([^,]+)\s*,\s*'([^']+)'\s*\)/gi,
        "FORMAT($1, '$2')");

    // PostgreSQL cast ::date, ::text, etc → CAST(x AS type)
    fixed = fixed.replace(/(\w+(?:\([^)]*\))?)\s*::\s*(date|text|varchar|integer|int|float|numeric|decimal)\b/gi,
        'CAST($1 AS $2)');

    // EXTRACT(MONTH FROM col) → MONTH(col)
    fixed = fixed.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^)]+)\)/gi, 'MONTH($1)');
    fixed = fixed.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^)]+)\)/gi, 'YEAR($1)');
    fixed = fixed.replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+([^)]+)\)/gi, 'DAY($1)');

    // ILIKE → LIKE
    fixed = fixed.replace(/\bILIKE\b/gi, 'LIKE');

    // LIMIT N → TOP N
    const limitMatch = fixed.match(/\bLIMIT\s+(\d+)\s*$/i);
    if (limitMatch) {
        fixed = fixed.replace(/\bLIMIT\s+\d+\s*$/i, '');
        fixed = fixed.replace(/^(\s*SELECT)\b/i, `$1 TOP ${limitMatch[1]}`);
    }

    // BOOLEAN true/false → 1/0
    fixed = fixed.replace(/\b=\s*true\b/gi, '= 1');
    fixed = fixed.replace(/\b=\s*false\b/gi, '= 0');

    // NOW() → GETDATE()
    fixed = fixed.replace(/\bNOW\s*\(\s*\)/gi, 'GETDATE()');
    // CURRENT_DATE → CAST(GETDATE() AS DATE)
    fixed = fixed.replace(/\bCURRENT_DATE\b/gi, 'CAST(GETDATE() AS DATE)');

    return fixed;
}

// ─── Main createWidgetTree function ──────────────────────────────────────────

export async function createWidgetTree(args: {
    treeName: string;
    chartType: string;
    sqlQuery?: string;
    connectorId?: string;
    pythonCode?: string;
    xAxisKey?: string;
    dataKeys?: string[];
    data?: any[];
    companyId: string;
}): Promise<{ success: boolean; treeId?: string; treeName?: string; error?: string; testResults?: { sql?: string; python?: string }; attempts?: number }> {
    try {
        const { treeName, chartType, sqlQuery, connectorId, pythonCode: rawPythonCode, xAxisKey, dataKeys, data, companyId } = args;

        if (!treeName?.trim()) return { success: false, error: 'treeName è obbligatorio' };
        if (sqlQuery && !connectorId) return { success: false, error: 'connectorId è OBBLIGATORIO quando passi una sqlQuery!' };

        const rootId = crypto.randomUUID();
        const sqlStepId = crypto.randomUUID();
        const pythonStepId = crypto.randomUUID();
        const leafId = crypto.randomUUID();

        // Normalize chartType
        const normalizedChartType = (() => {
            const t = (chartType || '').toLowerCase().replace(/[-_\s]/g, '');
            if (t.includes('line')) return 'line-chart';
            if (t.includes('area')) return 'area-chart';
            if (t.includes('pie')) return 'pie-chart';
            if (t.includes('scatter')) return 'scatter-chart';
            return 'bar-chart';
        })();
        const widgetType = normalizedChartType as WidgetType;
        const hasSql = !!(sqlQuery && connectorId);
        const hasPython = !!rawPythonCode;
        const MAX_RETRIES = 5;

        // ─── Phase 1: Test & auto-fix SQL ────────────────────────────────
        let finalSqlQuery = sqlQuery;
        let sqlOk = false;
        let sqlAttempts = 0;
        let lastSqlError = '';

        if (hasSql) {
            let currentQuery = sqlQuery!;
            for (let i = 0; i < MAX_RETRIES; i++) {
                sqlAttempts = i + 1;
                const result = await testSql(currentQuery, connectorId!);
                if (result.ok) {
                    sqlOk = true;
                    finalSqlQuery = currentQuery;
                    break;
                }
                lastSqlError = result.error || 'Errore sconosciuto';
                console.log(`[createWidget] SQL attempt ${i + 1}/${MAX_RETRIES} failed: ${lastSqlError}`);

                const fixed = autoFixSqlQuery(currentQuery, lastSqlError);
                if (fixed === currentQuery) break;
                currentQuery = fixed;
            }
        }

        // ─── Phase 2: Test & auto-fix Python ─────────────────────────────
        let finalPythonCode = hasSql
            ? generatePythonChartCode({ type: normalizedChartType, xAxisKey, dataKeys, title: treeName })
            : rawPythonCode;
        let pythonOk = false;
        let lastPythonError = '';

        let actualColumns: string[] = [];
        if (hasSql && sqlOk) {
            const sqlTestResult = await testSql(finalSqlQuery!, connectorId!);
            if (sqlTestResult.ok && sqlTestResult.columns) {
                actualColumns = sqlTestResult.columns;
            }
        }

        if (finalPythonCode && (hasSql ? sqlOk : true)) {
            if (hasSql && actualColumns.length >= 2) {
                const correctXKey = xAxisKey && actualColumns.includes(xAxisKey) ? xAxisKey : actualColumns[0];
                const correctYKeys = dataKeys?.length && dataKeys.every(k => actualColumns.includes(k))
                    ? dataKeys
                    : actualColumns.slice(1);
                finalPythonCode = generatePythonChartCode({
                    type: normalizedChartType,
                    xAxisKey: correctXKey,
                    dataKeys: correctYKeys,
                    title: treeName,
                });
                console.log(`[createWidget] Python code regenerated with actual columns: x=${correctXKey}, y=${JSON.stringify(correctYKeys)}`);
            }

            const deps = hasSql ? [{ tableName: 'dati', query: finalSqlQuery, connectorId }] : [];
            for (let i = 0; i < MAX_RETRIES; i++) {
                const result = await testPython(finalPythonCode!, deps, connectorId);
                if (result.ok) {
                    pythonOk = true;
                    break;
                }
                lastPythonError = result.error || 'Errore sconosciuto';
                console.log(`[createWidget] Python attempt ${i + 1}/${MAX_RETRIES} failed: ${lastPythonError}`);

                let fixed: string = finalPythonCode!;
                if (lastPythonError.includes("name 'df' is not defined")) {
                    fixed = `import pandas as pd\ndf = pd.DataFrame(dati)\n` + fixed;
                }
                if (lastPythonError.includes('KeyError') && actualColumns.length >= 2) {
                    fixed = generatePythonChartCode({
                        type: normalizedChartType,
                        xAxisKey: actualColumns[0],
                        dataKeys: actualColumns.slice(1),
                        title: treeName,
                    });
                }
                if (fixed === finalPythonCode) break;
                finalPythonCode = fixed;
            }
        }

        // ─── Phase 3: Build results ──────────────────────────────────────
        const testResults = {
            sql: hasSql ? (sqlOk ? `OK - query verificata (${sqlAttempts} tentativ${sqlAttempts > 1 ? 'i' : 'o'})` : `FALLITO dopo ${sqlAttempts} tentativi: ${lastSqlError}`) : undefined,
            python: finalPythonCode ? (pythonOk ? 'OK - grafico verificato' : `FALLITO: ${lastPythonError}`) : undefined,
        };

        if (hasSql && !sqlOk) {
            return { success: false, error: `Impossibile creare il widget: la query SQL non funziona dopo ${sqlAttempts} tentativi. Ultimo errore: ${lastSqlError}`, testResults, attempts: sqlAttempts };
        }
        if (finalPythonCode && !pythonOk) {
            return { success: false, error: `Impossibile creare il widget: il codice Python non funziona. Errore: ${lastPythonError}`, testResults, attempts: sqlAttempts };
        }

        // ─── Phase 4: Build tree nodes ───────────────────────────────────
        const finalXAxisKey = (xAxisKey && actualColumns.includes(xAxisKey)) ? xAxisKey : (actualColumns[0] || xAxisKey);
        const finalDataKeys = (dataKeys?.length && dataKeys.every(k => actualColumns.includes(k)))
            ? dataKeys
            : (actualColumns.length >= 2 ? actualColumns.slice(1) : dataKeys);

        const leafWidgetConfig: WidgetConfig = {
            type: widgetType,
            title: treeName,
            data: (!hasSql && !hasPython) ? data : undefined,
            xAxisKey: finalXAxisKey || undefined,
            dataKeys: finalDataKeys?.length ? finalDataKeys.filter((k: unknown) => typeof k === 'string') : undefined,
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
                pythonCode: rawPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                options: { 'Visualizza': leafNode },
            };
            rootNode = { id: rootId, question: treeName, options: { 'Genera': pythonStepNode } };
        } else {
            rootNode = { id: rootId, question: treeName, options: { 'Visualizza': leafNode } };
        }

        // ─── Phase 5: Save ───────────────────────────────────────────────
        console.log('[createWidget] SAVING tree with:', {
            widgetType: normalizedChartType,
            sqlQuery: finalSqlQuery?.substring(0, 60),
            pythonCode: finalPythonCode?.substring(0, 80),
            xAxisKey: finalXAxisKey,
            dataKeys: finalDataKeys,
            sqlOk,
            pythonOk,
        });
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

        return { success: true, treeId: tree.id, treeName: tree.name, testResults, attempts: sqlAttempts };
    } catch (e: any) {
        return { success: false, error: e.message || 'Errore creazione widget' };
    }
}
