
import { db } from '@/lib/db';

async function inspectTaskPythonOutputs() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    console.log(`Inspecting Task: ${taskId}`);

    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return console.error('Task not found');

    const config = task.config as any;

    console.log('--- Config Top Level Keys ---');
    console.log(Object.keys(config));

    // Check where pythonOutputs or chart definitions might be
    if (config.pythonOutputs) {
        console.log('\n--- Found config.pythonOutputs ---');
        console.log(JSON.stringify(config.pythonOutputs, null, 2));
    }

    if (config.emailConfig) { // Maybe nested?
        console.log('\n--- Found config.emailConfig ---');
        console.log(JSON.stringify(config.emailConfig, null, 2));
    }

    // Maybe it's in the root of config?
    // Let's dump specific fields that look like chart defs
    // "Gantt"
    const str = JSON.stringify(config);
    if (str.includes('Gantt')) {
        console.log('\n--- Found "Gantt" in config string ---');
        // Try to verify if it's inside pythonOutputs or elsewhere
    }
}

inspectTaskPythonOutputs().catch(console.error).finally(() => db.$disconnect());
