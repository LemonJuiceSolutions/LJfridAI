
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { StoredTree, Variable, VariableOption } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    const companyId = (session?.user as any)?.companyId as string | undefined;
    if (!companyId) {
        return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const treeId = searchParams.get('treeId');

    if (!treeId) {
        return NextResponse.json({ error: 'Missing treeId query param' }, { status: 400 });
    }

    try {
        const tree = await db.tree.findFirst({ where: { id: treeId, companyId } });
        if (!tree) {
            return NextResponse.json({ error: 'Tree not found' }, { status: 404 });
        }

        const dbVariables = await db.variable.findMany({
            where: { companyId: tree.companyId }
        });

        const report = {
            treeId: tree.id,
            treeName: tree.name,
            totalNodes: 0,
            standardNodes: 0,
            missingVariables: [] as any[],
            missingOptions: [] as any[],
            validNodes: 0
        };

        if (!tree.jsonDecisionTree) {
            return NextResponse.json({ report, message: "Empty tree" });
        }

        const jsonTree = JSON.parse(tree.jsonDecisionTree);

        function traverse(node: any, path: string) {
            report.totalNodes++;

            if (node.variableId) {
                report.standardNodes++;
                const dbVar = dbVariables.find(v => v.id === node.variableId);

                if (!dbVar) {
                    report.missingVariables.push({
                        path,
                        variableId: node.variableId,
                        question: node.question,
                        error: "Variable ID not found in DB"
                    });
                } else {
                    // Check options mismatch
                    if (node.options) {
                        for (const key in node.options) {
                            const optionNameInTree = key; // The key in options map IS the option name
                            // const optionName = path... handled by key

                            // Check if this option exists in DB
                            const possibleValues = dbVar.possibleValues as any[];
                            const dbOption = possibleValues.find(opt => opt.name === optionNameInTree);
                            if (!dbOption) {
                                report.missingOptions.push({
                                    path: `${path}.options['${key}']`,
                                    variableId: node.variableId,
                                    variableName: dbVar.name,
                                    optionNameInTree: optionNameInTree,
                                    availableDbOptions: (possibleValues || []).map((o: any) => o.name),
                                    error: "Option Name in Tree not found in DB Variable"
                                });
                            }
                        }
                    }
                    report.validNodes++;
                }
            }

            if (node.options) {
                for (const key in node.options) {
                    traverse(node.options[key], `${path}.options['${key}']`);
                }
            }
        }

        traverse(jsonTree, 'root');

        return NextResponse.json({ success: true, report });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
