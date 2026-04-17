import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function inspectScheduledEmailTask() {
    // Get the most recent active email task
    const task = await db.scheduledTask.findFirst({
        where: {
            type: 'EMAIL_SEND',
            status: 'active'
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!task) {
        console.log("No active email task found!");
        return;
    }

    console.log("=== SCHEDULED TASK ===");
    console.log("ID:", task.id);
    console.log("Name:", task.name);
    console.log("");

    // Parse config
    const config = typeof task.config === 'string' ? JSON.parse(task.config) : (task.config as Record<string, unknown>);
    console.log("=== TREE/NODE INFO ===");
    console.log("config.treeId:", config.treeId);
    console.log("config.nodeId:", config.nodeId);
    console.log("");

    console.log("=== ATTACHMENTS (from taskConfigProvider) ===");
    console.log("config.attachments:", JSON.stringify(config.attachments, null, 2));
    console.log("");

    console.log("=== SELECTED TABLES ===");
    console.log("config.selectedTables:", JSON.stringify(config.selectedTables, null, 2));
    console.log("");

    console.log("=== SELECTED PYTHON OUTPUTS ===");
    console.log("config.selectedPythonOutputs:", JSON.stringify(config.selectedPythonOutputs, null, 2));
    console.log("");

    // Extract placeholders from body
    const body = config.body as string || '';
    const placeholderTableNames = (body.match(/\{\{TABELLA:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{TABELLA:|\}\}/g, ''));
    const placeholderChartNames = (body.match(/\{\{GRAFICO:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{GRAFICO:|\}\}/g, ''));
    const placeholderVarNames = (body.match(/\{\{VARIABILE:([^}]+)\}\}/g) || []).map((m: string) => m.replace(/\{\{VARIABILE:|\}\}/g, ''));
    console.log("=== PLACEHOLDERS IN BODY ===");
    console.log("Tables:", placeholderTableNames);
    console.log("Charts:", placeholderChartNames);
    console.log("Variables:", placeholderVarNames);

    await db.$disconnect();
}

inspectScheduledEmailTask();
