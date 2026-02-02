/**
 * Topological Sort Library
 * 
 * Provides functions for sorting nodes in topological order (from top to bottom).
 * Used for executing ancestor chains in the correct order.
 */

/**
 * Node type definition
 */
export interface Node {
  id: string;
  type: 'sql' | 'python' | 'email' | 'sharepoint' | 'hubspot' | 'trigger';
  name?: string;
  // SQL specific
  sqlQuery?: string;
  sqlResultName?: string;
  sqlConnectorId?: string;
  // Python specific
  pythonCode?: string;
  pythonResultName?: string;
  pythonOutputType?: 'table' | 'chart' | 'text';
  pythonConnectorId?: string;
  // Email specific
  emailTemplate?: string;
  emailTo?: string;
  emailSubject?: string;
  // SharePoint specific
  sharepointPath?: string;
  sharepointAction?: 'read' | 'write' | 'delete';
  // HubSpot specific
  hubspotAction?: 'read' | 'write' | 'update';
  hubspotObjectType?: string;
  // Dependencies
  dependencies?: string[]; // Names of dependent results (e.g., pythonResultName, sqlResultName)
  writesToDatabase?: boolean; // Flag indicating if the node writes to DB
  depth?: number; // Depth in the tree
}

/**
 * Edge type definition
 */
export interface Edge {
  id: string;
  source: string; // Source node ID
  target: string; // Target node ID
  type?: string;
}

/**
 * Sort nodes in topological order (from top to bottom)
 * Uses Kahn's algorithm for topological sorting
 * 
 * @param nodes - Array of nodes to sort
 * @param edges - Array of edges defining dependencies
 * @returns Array of nodes sorted topologically
 */
export function topologicalSort(nodes: Node[], edges: Edge[]): Node[] {
  // Create a map of node ID to node for quick lookup
  const nodeMap = new Map<string, Node>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Calculate in-degree for each node
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
  }
  
  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Initialize queue with nodes that have no dependencies
  const queue: Node[] = [];
  for (const node of nodes) {
    if (inDegree.get(node.id) === 0) {
      queue.push(node);
    }
  }

  // Execute Kahn's algorithm
  const result: Node[] = [];
  while (queue.length > 0) {
    // Sort queue by depth to ensure consistent ordering
    queue.sort((a, b) => (a.depth || 0) - (b.depth || 0));
    const node = queue.shift()!;
    result.push(node);

    // Remove outgoing edges and decrement in-degree
    for (const edge of edges.filter(e => e.source === node.id)) {
      inDegree.set(edge.target, inDegree.get(edge.target)! - 1);
      if (inDegree.get(edge.target) === 0) {
        const targetNode = nodeMap.get(edge.target);
        if (targetNode) {
          queue.push(targetNode);
        }
      }
    }
  }

  // Check for cycles
  if (result.length !== nodes.length) {
    console.warn('Cyclic dependency detected in topological sort');
  }

  return result;
}

/**
 * Calculate depth of each node in the tree
 * Depth is the distance from the root (depth 0)
 * 
 * @param nodes - Array of nodes
 * @param edges - Array of edges
 * @returns Map of node ID to depth
 */
export function calculateDepths(nodes: Node[], edges: Edge[]): Map<string, number> {
  const depths = new Map<string, number>();
  const visited = new Set<string>();

  // Initialize depths
  for (const node of nodes) {
    depths.set(node.id, 0);
  }

  // Build adjacency list for reverse edges (target -> source)
  const reverseAdj = new Map<string, string[]>();
  for (const node of nodes) {
    reverseAdj.set(node.id, []);
  }
  for (const edge of edges) {
    const sources = reverseAdj.get(edge.target) || [];
    sources.push(edge.source);
    reverseAdj.set(edge.target, sources);
  }

  // Calculate depth using DFS
  const dfs = (nodeId: string, visited: Set<string>): number => {
    if (visited.has(nodeId)) {
      return depths.get(nodeId) || 0;
    }
    
    visited.add(nodeId);
    const sources = reverseAdj.get(nodeId) || [];
    let maxDepth = 0;
    
    for (const sourceId of sources) {
      const sourceDepth = dfs(sourceId, visited);
      maxDepth = Math.max(maxDepth, sourceDepth + 1);
    }
    
    depths.set(nodeId, maxDepth);
    return maxDepth;
  };

  for (const node of nodes) {
    dfs(node.id, new Set<string>());
  }

  return depths;
}

/**
 * Sort nodes by depth (from top to bottom)
 * 
 * @param nodes - Array of nodes
 * @param depths - Map of node ID to depth
 * @returns Array of nodes sorted by depth
 */
export function sortByDepth(nodes: Node[], depths: Map<string, number>): Node[] {
  return [...nodes].sort((a, b) => {
    const depthA = depths.get(a.id) || 0;
    const depthB = depths.get(b.id) || 0;
    return depthA - depthB;
  });
}

/**
 * Detect cycles in the graph
 * 
 * @param nodes - Array of nodes
 * @param edges - Array of edges
 * @returns Array of node IDs involved in cycles
 */
export function detectCycles(nodes: Node[], edges: Edge[]): string[] {
  const nodeSet = new Set(nodes.map(n => n.id));
  const adj = new Map<string, string[]>();
  
  // Build adjacency list
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    const targets = adj.get(edge.source) || [];
    targets.push(edge.target);
    adj.set(edge.source, targets);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[] = [];

  const dfs = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) {
      cycles.push(nodeId);
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (dfs(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  };

  for (const node of nodes) {
    dfs(node.id);
  }

  return [...new Set(cycles)];
}
