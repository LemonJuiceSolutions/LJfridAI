import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function main() {
    const task = await db.scheduledTask.findFirst({
        where: {
            type: 'EMAIL_SEND',
            name: { contains: '4BbRgfc5' }
        }
    });

    if (!task) { console.log('Task not found'); return; }
    const config = typeof task.config === 'string' ? JSON.parse(task.config) : task.config;

    let modified = false;

    // 1. Fix PRODFIL2 SQL Query
    // Need to find where PRODFIL2 is defined. It's likely a dependency of 'Gantt - Capacity - Sum'

    if (config.selectedPythonOutputs) {
        for (const output of config.selectedPythonOutputs) {
            if (output.pipelineDependencies) {
                for (const dep of output.pipelineDependencies) {
                    if (dep.tableName === 'PRODFIL2') {
                        console.log(`Found PRODFIL2 dependency in ${output.name}`);
                        console.log('Old Query:', dep.query);
                        // Replace 'PRODFILTRATA' with 'dbo.PRODFIL' (assuming user meant that, but wait - user said 'dbo.PRODFIL' was invalid too?)
                        // User's first error was "Invalid object name 'dbo.PRODFIL'".
                        // User's second error was "Invalid object name 'PRODFILTRATA'".
                        // Maybe the table name is really different? 
                        // Let's check available tables first? No, assume 'dbo.PRODFIL' was deleted.
                        // What table SHOULD it be? 'Prodotto'?

                        // Inspect 'Prodotto' node query from tree inspection earlier:
                        // Path: root->Produzione e Fatturato
                        // ID: NC9jpnnG
                        // I don't see the query text in my logs.

                        // I will try to replace it with a valid query from 'Prodotto' node if I can find it.
                        // Or just fix the table name if I know it.
                        // Actually, the user might have renamed the table to 'Prodotto' in the tree but the saved config still has 'PRODFIL2'.

                        // Let's assume 'Prodotto' is the correct node and copy its query?
                        // But I need the query text first.

                        // For now, I will rename table to 'Prodotto' and hope it exists.
                        // Wait, 'Prodotto' IS a node in the tree.
                        // Code: dep.query = dep.query.replace('PRODFILTRATA', 'Prodotto'); // wild guess?
                        // No, let's look at the tree node "Prodotto" query first.
                    }
                }
            }

            // 2. Fix Aggregato / BDG dependencies
            // Needs 'Budget'.
            if (output.name.includes('BDG') || output.name.includes('Aggregato')) {
                console.log(`Checking dependencies for ${output.name}`);
                const hasBudget = output.pipelineDependencies.some((d: any) => d.tableName === 'Budget');
                if (!hasBudget) {
                    console.log('Adding Budget dependency...');
                    // I need the definition of Budget node to add it!
                    // I can get it from the live tree.
                    modified = true;
                }
            }
        }
    }

    await db.$disconnect();
}

main().catch(console.error);
