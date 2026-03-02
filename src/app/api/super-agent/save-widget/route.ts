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
        const stepId = crypto.randomUUID();
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
            ...(sqlQuery && connectorId ? { dataSourceType: 'current-sql', dataSourceId: 'sql' } : {}),
            ...(pythonCode && !sqlQuery ? { dataSourceType: 'current-python', dataSourceId: 'python' } : {}),
        };

        // Build the leaf node
        const leafNode = {
            id: leafId,
            decision: treeName,
            widgetConfig: leafWidgetConfig,
            ...(sqlQuery ? { sqlQuery, sqlConnectorId: connectorId || undefined, sqlResultName: 'dati' } : {}),
            ...(pythonCode && !sqlQuery ? { pythonCode, pythonOutputType: 'chart', pythonResultName: 'grafico' } : {}),
        };

        // Build the intermediate step node (SQL or Python), or skip if neither
        let jsonDecisionTree: string;

        if (sqlQuery) {
            // 3-node tree: Root → SQL Step → Chart Leaf
            const sqlStepNode = {
                id: stepId,
                question: `Query SQL: ${treeName}`,
                sqlQuery,
                sqlConnectorId: connectorId || undefined,
                sqlResultName: 'dati',
                options: {
                    'Visualizza': leafNode,
                },
            };
            const rootNode = {
                id: rootId,
                question: treeName,
                options: {
                    'Calcola': sqlStepNode,
                },
            };
            jsonDecisionTree = JSON.stringify({ root: rootNode });
        } else if (pythonCode) {
            // 3-node tree: Root → Python Step → Chart Leaf
            const pythonStepNode = {
                id: stepId,
                question: `Elaborazione Python: ${treeName}`,
                pythonCode,
                pythonOutputType: 'chart',
                pythonResultName: 'grafico',
                options: {
                    'Visualizza': leafNode,
                },
            };
            const rootNode = {
                id: rootId,
                question: treeName,
                options: {
                    'Genera': pythonStepNode,
                },
            };
            jsonDecisionTree = JSON.stringify({ root: rootNode });
        } else {
            // 2-node tree: Root → Chart Leaf directly
            const rootNode = {
                id: rootId,
                question: treeName,
                options: {
                    'Visualizza': leafNode,
                },
            };
            jsonDecisionTree = JSON.stringify({ root: rootNode });
        }

        // Create the tree in the database
        const tree = await db.tree.create({
            data: {
                name: treeName,
                description: `Widget generato da FridAI Super Agent${sqlQuery ? ' tramite query SQL' : pythonCode ? ' tramite codice Python' : ''}`,
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
