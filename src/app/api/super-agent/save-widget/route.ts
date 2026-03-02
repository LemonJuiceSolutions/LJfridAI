import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import type { WidgetConfig, WidgetType } from '@/lib/types';

/**
 * Map recharts chart type → Plotly Express function name
 */
function rechartsTypeToPlotly(type: string): string {
    switch (type) {
        case 'line-chart': return 'line';
        case 'area-chart': return 'area';
        case 'pie-chart': return 'pie';
        case 'scatter-chart': return 'scatter';
        case 'bar-chart':
        default: return 'bar';
    }
}

/**
 * Generate clean Python code that reads data from the SQL step (via `df`, auto-injected)
 * and creates a Plotly chart matching the original chartConfig.
 */
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
        // Pie chart: names = xAxisKey, values = first dataKey
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

    // bar, line, area: support multiple y-axis keys
    if (yKeys.length === 1) {
        return [
            `import plotly.express as px`,
            ``,
            `# df is auto-injected from the SQL step`,
            `fig = px.${plotlyType}(df, x='${xKey}', y='${yKeys[0]}', title='${title}')`,
            `fig.show()`,
        ].join('\n');
    }

    // Multiple y-keys → melt the dataframe for a grouped chart
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

        const {
            treeName,
            chartConfig,
            sqlQuery,
            connectorId,
            pythonCode: _rawPythonCode,
        }: {
            treeName: string;
            chartConfig: {
                type: string;
                data: any[];
                xAxisKey?: string;
                dataKeys?: string[];
                colors?: string[];
                title?: string;
            };
            sqlQuery?: string;
            connectorId?: string;
            pythonCode?: string;
        } = body;

        if (!treeName?.trim()) {
            return NextResponse.json({ error: 'treeName is required' }, { status: 400 });
        }
        if (!chartConfig?.data || !Array.isArray(chartConfig.data)) {
            return NextResponse.json({ error: 'chartConfig.data is required' }, { status: 400 });
        }

        // Generate unique IDs for each node
        const rootId = crypto.randomUUID();
        const sqlStepId = crypto.randomUUID();
        const pythonStepId = crypto.randomUUID();
        const leafId = crypto.randomUUID();

        // Build the widgetConfig for the leaf node.
        // When the pipeline has a SQL step, DO NOT seal static data — the data comes from the SQL step at execution time.
        const widgetType = (chartConfig.type as WidgetType) || 'bar-chart';
        const hasSql = !!(sqlQuery && connectorId);
        const hasPython = !!_rawPythonCode;

        const leafWidgetConfig: WidgetConfig = {
            type: widgetType,
            title: treeName,
            // Only store static data when there's NO dynamic source (neither SQL nor Python)
            data: (!hasSql && !hasPython) ? chartConfig.data : undefined,
            xAxisKey: typeof chartConfig.xAxisKey === 'string' ? chartConfig.xAxisKey : undefined,
            dataKeys: Array.isArray(chartConfig.dataKeys) ? chartConfig.dataKeys.filter((k: unknown) => typeof k === 'string') : undefined,
            colors: Array.isArray(chartConfig.colors) ? chartConfig.colors : undefined,
            isPublished: true,
            ...(hasSql ? { dataSourceType: 'current-sql' as const, dataSourceId: 'sql' } :
               hasPython ? { dataSourceType: 'current-python' as const, dataSourceId: 'python' } : {}),
        };

        // Build the leaf node
        const leafNode = {
            id: leafId,
            decision: treeName,
            widgetConfig: leafWidgetConfig,
        };

        // Build the decision tree JSON.
        // The jsonDecisionTree field stores the ROOT NODE directly (no { root: ... } wrapper).
        let rootNode: object;

        if (hasSql && hasPython) {
            // 4-node tree: Root → SQL Step → Python Step → Chart Leaf
            // Generate CLEAN Python code that uses `df` (auto-injected from SQL step)
            // instead of the original code which has hardcoded data.
            const cleanPythonCode = generatePythonChartCode(chartConfig);

            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode: cleanPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                pythonSelectedPipelines: ['dati'], // ← Link to the SQL step output
                pythonConnectorId: connectorId,
                options: { 'Visualizza': leafNode },
            };
            const sqlStepNode = {
                id: sqlStepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery,
                sqlConnectorId: connectorId,
                sqlResultName: 'dati',
                options: { 'Elabora': pythonStepNode },
            };
            rootNode = {
                id: rootId,
                question: treeName,
                options: { 'Calcola': sqlStepNode },
            };
        } else if (hasSql) {
            // 3-node tree: Root → SQL Step → Chart Leaf
            // No Python needed — the SQL data feeds the widgetConfig directly
            const sqlStepNode = {
                id: sqlStepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery,
                sqlConnectorId: connectorId,
                sqlResultName: 'dati',
                options: { 'Visualizza': leafNode },
            };
            rootNode = {
                id: rootId,
                question: treeName,
                options: { 'Calcola': sqlStepNode },
            };
        } else if (hasPython) {
            // 3-node tree: Root → Python Step → Chart Leaf
            // Use the original Python code as-is (Python-only, no SQL to reference)
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode: _rawPythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                options: { 'Visualizza': leafNode },
            };
            rootNode = {
                id: rootId,
                question: treeName,
                options: { 'Genera': pythonStepNode },
            };
        } else {
            // 2-node tree: Root → Chart Leaf directly (static data sealed)
            rootNode = {
                id: rootId,
                question: treeName,
                options: { 'Visualizza': leafNode },
            };
        }

        const jsonDecisionTree = JSON.stringify(rootNode);

        // Create the tree in the database
        const tree = await db.tree.create({
            data: {
                name: treeName,
                description: `Widget generato da FridAI Super Agent${hasSql && hasPython ? ' tramite query SQL + Python' : hasSql ? ' tramite query SQL' : hasPython ? ' tramite codice Python' : ''}`,
                naturalLanguageDecisionTree: treeName,
                jsonDecisionTree,
                questionsScript: '',
                type: 'PIPELINE',
                companyId,
            },
        });

        return NextResponse.json({
            success: true,
            treeId: tree.id,
            leafId,
            treeName: tree.name,
        });
    } catch (error: any) {
        console.error('[super-agent/save-widget] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
