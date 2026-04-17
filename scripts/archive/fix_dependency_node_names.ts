
import { db } from '../src/lib/db';

async function main() {
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    console.log(`Fetching tree ${treeId}...`);
    const tree = await db.tree.findUnique({ where: { id: treeId } });

    if (!tree || !tree.jsonDecisionTree) {
        console.error('Tree not found or no JSON');
        return;
    }

    let treeJson = JSON.parse(tree.jsonDecisionTree);
    let updated = false;

    // Map of ID -> Parent Question (to construct paths)
    const parentMap: Record<string, string> = {};

    // First pass: Build parent map (Parent Question)
    const buildMap = (node: any, parentQuestion: string) => {
        if (!node) return;
        if (node.id) {
            parentMap[node.id] = parentQuestion;
        }
        const currentQuestion = node.question || parentQuestion; // carry forward if empty

        if (node.options) {
            for (const key in node.options) {
                const val = node.options[key];
                // For root, the KEY is effectively the parent question context for the child
                // For specific nodes, we use the node's Question property.
                // Actually, "Parent Question" for a child is the Current Node's Question.

                if (Array.isArray(val)) {
                    val.forEach(n => buildMap(n, currentQuestion));
                } else if (typeof val === 'object') {
                    buildMap(val, currentQuestion);
                }
            }
        }
    };

    // Root doesn't have a parent question, maybe use "Produzione"?
    // But looking at path `ROOT > Produzione e Fatturato > Prodotto`
    // The option key leading to Prodotto is "Produzione e Fatturato" if Root has question?
    // Let's assume Root Question is "Start" or empty.
    buildMap(treeJson, "Produzione e Fatturato"); // Seed with what seems to be the root context or option

    const targetNodes = [
        { id: 'NC9jpnnG', resultName: 'Prodotto' },
        { id: 'gye2BUuO', resultName: 'Fatturato' },
        { id: '9LiHu3E2', resultName: 'Budget' },
        { id: '-A7oR6c8', resultName: 'Aggregato' }
    ];

    const traverseAndUpdate = (node: any, parentQ: string) => {
        if (!node) return;

        const target = targetNodes.find(t => t.id === node.id);
        if (target) {
            console.log(`Found target node ${node.id} (${target.resultName})`);

            // Determine Parent Prefix
            // Attempt to look up from map, or use passed down context
            // In traversal, we pass down the current question as parentQ for children

            // Exception: For the first node `NC9jpnnG`, it is a child of root.
            // If parentQ is "Produzione e Fatturato", name becomes "Produzione e Fatturato > Prodotto"

            const prefix = parentQ;
            const newName = prefix ? `${prefix} > ${target.resultName}` : target.resultName;

            if (node.name !== newName) {
                console.log(`Updating name: "${node.name}" -> "${newName}"`);
                node.name = newName;
                updated = true;
            } else {
                console.log(`Name already correct: "${node.name}"`);
            }
        }

        const currentQ = node.question || parentQ;

        if (node.options) {
            for (const key in node.options) {
                const val = node.options[key];
                if (Array.isArray(val)) {
                    val.forEach(n => traverseAndUpdate(n, currentQ));
                } else if (typeof val === 'object') {
                    traverseAndUpdate(val, currentQ);
                }
            }
        }
    };

    // The root option key is likely "Produzione e Fatturato"
    // So we traverse starting with that context?
    // Let's verify traversal structure again.
    // Path: ROOT > Produzione e Fatturato
    // This probably means Root Node -> Option "Produzione e Fatturato" -> `NC9jpnnG`
    // So we should capture the Option Key as part of the "Question" context if the parent question is empty?

    // Simpler approach: 
    // `NC9jpnnG` (Prodotto) -> Parent Key "Produzione e Fatturato" -> "Produzione e Fatturato > Prodotto"
    // `gye2BUuO` (Fatturato) -> Parent `NC9jpnnG` (Question "Prodotto") -> "Prodotto > Fatturato"
    // `9LiHu3E2` (Budget) -> Parent `gye2BUuO` (Question "Fatturato") -> "Fatturato > Budget"
    // `-A7oR6c8` (Aggregato) -> Parent `9LiHu3E2` (Question "Budget") -> "Budget > Aggregato"

    // To implement matches correctly, we need precise parent tracking.
    // I'll assume the structure derived from debug output holds true.

    const refinedTraverse = (node: any, parentContext: string) => {
        if (!node) return;

        const target = targetNodes.find(t => t.id === node.id);
        if (target) {
            const newName = parentContext ? `${parentContext} > ${target.resultName}` : target.resultName;
            if (node.name !== newName) {
                console.log(`Updating ${node.id}: "${node.name}" -> "${newName}"`);
                node.name = newName;
                updated = true;
            }
        }

        const myQuestion = node.question;

        if (node.options) {
            for (const key in node.options) {
                // If the node has a question, that's the context for children.
                // If not, maybe use the Option Key? 
                // For Root -> NC9jpnnG, Root has no question, Option Key is "Produzione e Fatturato".
                // So context for NC9jpnnG is "Produzione e Fatturato".
                // For NC9jpnnG -> gye2BUuO, NC9jpnnG has Question "Prodotto".
                // So context for gye2BUuO is "Prodotto".

                let nextContext = myQuestion;
                if (!nextContext) {
                    // Use Option Key as context if node has no question (like Root)
                    nextContext = key;
                }

                const val = node.options[key];
                if (Array.isArray(val)) {
                    val.forEach(n => refinedTraverse(n, nextContext));
                } else if (typeof val === 'object') {
                    refinedTraverse(val, nextContext);
                }
            }
        }
    };

    refinedTraverse(treeJson, "");

    if (updated) {
        console.log('Updating tree in database...');
        await db.tree.update({
            where: { id: treeId },
            data: {
                jsonDecisionTree: JSON.stringify(treeJson)
            }
        });
        console.log('Tree updated successfully.');
    } else {
        console.log('No changes needed.');
    }
}

main().catch(console.error);
