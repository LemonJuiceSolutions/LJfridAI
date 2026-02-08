
import { db } from '../src/lib/db';

async function main() {
    console.log('--- SIMULATING NEW GRAPH LOGIC ---');
    const treeId = 'RzX9nFJGQUs832cLVvecO';
    const tree = await db.tree.findUnique({ where: { id: treeId } });

    if (!tree || !tree.jsonDecisionTree) return;

    const treeJson = JSON.parse(tree.jsonDecisionTree);

    // Simulate getAllNodesFromTree
    const contextTables: any[] = [];
    const collect = (node: any) => {
        if (!node || typeof node !== 'object') return;
        const allNames = [node.name, node.sqlResultName, node.pythonResultName].filter(Boolean) as string[];

        if (node.id && allNames.length > 0) {
            contextTables.push({
                ...node,
                name: allNames[0],
                allNames,
                pipelineDependencies: node.pipelineDependencies || []
            });
        }
        if (node.options && typeof node.options === 'object') {
            for (const key in node.options) {
                const val = node.options[key];
                if (Array.isArray(val)) val.forEach(collect);
                else collect(val);
            }
        }
    };
    collect(treeJson);

    // --- COPIED LOGIC START ---
    // 1. Build Dependency Graph (Case-Insensitive Normalization)
    const graph = new Map<string, string[]>();
    const nodeNameMap = new Map<string, string>(); // normalized -> original
    const aliasToCanonicalMap = new Map<string, string>(); // normalized alias -> normalized canonical name

    // First pass: Register all nodes and their aliases
    contextTables.forEach(t => {
        const canonicalOriginalName = t.name;
        const canonicalNormalizedName = t.name.toLowerCase().trim();

        nodeNameMap.set(canonicalNormalizedName, canonicalOriginalName);
        aliasToCanonicalMap.set(canonicalNormalizedName, canonicalNormalizedName);

        // Register aliases
        if (t.allNames && Array.isArray(t.allNames)) {
            t.allNames.forEach((alias: string) => {
                const aliasNorm = alias.toLowerCase().trim();
                aliasToCanonicalMap.set(aliasNorm, canonicalNormalizedName);
                // Also map alias to original name if not already set (though canonical is preferred)
                if (!nodeNameMap.has(aliasNorm)) {
                    nodeNameMap.set(aliasNorm, canonicalOriginalName);
                }
            });
        }
    });

    // Second pass: Build graph using CANONICAL names
    contextTables.forEach(t => {
        const canonicalNormalizedName = t.name.toLowerCase().trim();

        // Resolve dependencies to their canonical names
        const distinctDeps = new Set<string>();
        (t.pipelineDependencies || []).forEach((d: any) => {
            const rawDep = d.tableName.toLowerCase().trim();
            const canonicalDep = aliasToCanonicalMap.get(rawDep);

            // Only add dependency if it exists in our context
            if (canonicalDep) {
                distinctDeps.add(canonicalDep);
            } else {
                console.log(`[WARNING] Node "${t.name}" depends on '${rawDep}' which is NOT in context.`);
            }
        });

        graph.set(canonicalNormalizedName, Array.from(distinctDeps));
    });

    // 2. Radiological Sort (Topological)
    const visited = new Set<string>();
    const sortedNormalized: string[] = [];
    const visiting = new Set<string>(); // Cycle detection

    const visit = (normalizedNode: string) => {
        // Resolve to canonical just in case, though input should be canonical
        const canonical = aliasToCanonicalMap.get(normalizedNode) || normalizedNode;

        if (visited.has(canonical)) return;
        if (visiting.has(canonical)) return; // Cycle detected

        visiting.add(canonical);
        const deps = graph.get(canonical) || [];

        // Visit dependencies first
        deps.forEach(d => {
            visit(d);
        });

        visiting.delete(canonical);
        visited.add(canonical);
        sortedNormalized.push(canonical); // Push CANONICAL name
    };

    // Visit all nodes in context
    contextTables.forEach(t => visit(t.name.toLowerCase().trim()));
    // --- COPIED LOGIC END ---

    console.log(`\nExecution Order:\n${sortedNormalized.map(n => nodeNameMap.get(n)).join('\n-> ')}`);
}

main().catch(console.error);
