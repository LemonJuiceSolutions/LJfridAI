
import { db } from '@/lib/db';

async function inspectSelectedPythonOutputs() {
    const taskId = 'cml9dn2z600098b6u6mncozlf';
    const task = await db.scheduledTask.findUnique({ where: { id: taskId } });
    if (!task) return;

    const config = task.config as any;

    // Check selectedPythonOutputs
    if (config.selectedPythonOutputs) {
        console.log(`\nFound ${config.selectedPythonOutputs.length} selectedPythonOutputs:`);
        config.selectedPythonOutputs.forEach((output: any, tempIdx: number) => {
            console.log(`\n[${tempIdx}] Name: ${output.name || output.pythonResultName}`);
            console.log(`TYPE: ${output.type}`);
            console.log(`IsPython: ${output.isPython}`);
            console.log(`Dependencies: ${JSON.stringify(output.pipelineDependencies)}`);
            if (output.pythonCode) console.log(`Code Sample: ${output.pythonCode.substring(0, 50)}...`);
        });
    } else {
        console.log('No selectedPythonOutputs found.');
    }
}

inspectSelectedPythonOutputs().catch(console.error).finally(() => db.$disconnect());
