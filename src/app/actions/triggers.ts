'use server';

import { db } from '@/lib/db';
import type { TriggerItem } from '@/lib/types';

export async function executeTriggerAction(
    treeId: string,
    nodeId: string | undefined,
    trigger: TriggerItem
): Promise<{ success: boolean; message: string }> {
    try {
        const { name, path } = trigger;

        if (path.startsWith('FIRESTORE_WRITE::')) {
            const collectionName = path.split('::')[1];
            if (!collectionName) {
                throw new Error('Nome della collezione non specificato nel path del trigger.');
            }

            const logData = {
                triggerName: name,
                triggerPath: path,
                treeId: treeId,
                nodeId: nodeId || 'unknown',
                executedAt: new Date(),
            };

            await db.triggerLog.create({
                data: {
                    collection: collectionName,
                    data: logData,
                }
            });

            return {
                success: true,
                message: `Trigger '${name}' eseguito: log scritto nella collezione '${collectionName}'.`
            };
        }

        return {
            success: false,
            message: `Il tipo di trigger con path '${path}' non è supportato.`
        };

    } catch (e) {
        const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante l\'esecuzione del trigger.';
        console.error("Error in executeTriggerAction:", e);
        return { success: false, message: error };
    }
}
