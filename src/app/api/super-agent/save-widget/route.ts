import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import type { WidgetConfig, WidgetType } from '@/lib/types';

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
            pythonCode,
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

        // Build the widgetConfig for the leaf node
        const widgetType = (chartConfig.type as WidgetType) || 'bar-chart';
        const leafWidgetConfig: WidgetConfig = {
            type: widgetType,
            title: treeName,
            data: chartConfig.data,
            xAxisKey: typeof chartConfig.xAxisKey === 'string' ? chartConfig.xAxisKey : undefined,
            dataKeys: Array.isArray(chartConfig.dataKeys) ? chartConfig.dataKeys.filter((k: unknown) => typeof k === 'string') : undefined,
            colors: Array.isArray(chartConfig.colors) ? chartConfig.colors : undefined,
            isPublished: true,
            ...(pythonCode ? { dataSourceType: 'current-python' as const, dataSourceId: 'python' } :
               sqlQuery && connectorId ? { dataSourceType: 'current-sql' as const, dataSourceId: 'sql' } : {}),
        };

        // Build the leaf node (chart output — no SQL/Python needed here, data is sealed)
        const leafNode = {
            id: leafId,
            decision: treeName,
            widgetConfig: leafWidgetConfig,
        };

        // Build the decision tree JSON.
        // The jsonDecisionTree field stores the ROOT NODE directly (no { root: ... } wrapper).
        // Supported shapes:
        //   SQL + Python  → Root → SQL Step → Python Step → Chart Leaf  (4 nodes)
        //   SQL only      → Root → SQL Step → Chart Leaf                 (3 nodes)
        //   Python only   → Root → Python Step → Chart Leaf              (3 nodes)
        //   Neither       → Root → Chart Leaf                            (2 nodes)
        let rootNode: object;

        if (sqlQuery && pythonCode) {
            // 4-node tree: Root → SQL Step → Python Step → Chart Leaf
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode,
                pythonOutputType: 'chart' as const,
                pythonResultName: 'grafico',
                options: { 'Visualizza': leafNode },
            };
            const sqlStepNode = {
                id: sqlStepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery,
                sqlConnectorId: connectorId || undefined,
                sqlResultName: 'dati',
                options: { 'Elabora': pythonStepNode },
            };
            rootNode = {
                id: rootId,
                question: treeName,
                options: { 'Calcola': sqlStepNode },
            };
        } else if (sqlQuery) {
            // 3-node tree: Root → SQL Step → Chart Leaf
            const sqlStepNode = {
                id: sqlStepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery,
                sqlConnectorId: connectorId || undefined,
                sqlResultName: 'dati',
                options: { 'Visualizza': leafNode },
            };
            rootNode = {
                id: rootId,
                question: treeName,
                options: { 'Calcola': sqlStepNode },
            };
        } else if (pythonCode) {
            // 3-node tree: Root → Python Step → Chart Leaf
            const pythonStepNode = {
                id: pythonStepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode,
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
            // 2-node tree: Root → Chart Leaf directly
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
                description: `Widget generato da FridAI Super Agent${sqlQuery && pythonCode ? ' tramite query SQL + Python' : sqlQuery ? ' tramite query SQL' : pythonCode ? ' tramite codice Python' : ''}`,
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
