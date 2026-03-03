/**
 * Ancestors Actions
 * 
 * Server-side actions for managing and executing ancestor chains.
 * These actions handle the automatic execution of ancestor nodes when previewing a node.
 */

'use server';

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { executeAncestors, executeChain } from '@/lib/ancestor-executor';
import { Node, Edge } from '@/lib/topological-sort';

async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Find all ancestors of a node in the decision tree
 * 
 * @param treeId - ID of the tree
 * @param nodeId - ID of the target node
 * @returns Object containing ancestors data or error
 */
export async function findAncestorsAction(
  treeId: string,
  nodeId: string
): Promise<{ data: Node[] | null, error: string | null }> {
  try {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
      return { data: null, error: "Unauthorized" };
    }

    const companyId = (session.user as any).companyId;

    // 1. Retrieve the tree from the database
    const tree = await db.tree.findUnique({
      where: { id: treeId }
    });

    if (!tree) {
      return { data: null, error: "Tree not found" };
    }

    // 2. Parse the JSON tree
    const jsonTree = JSON.parse(tree.jsonDecisionTree);

    // 3. Extract nodes and edges from the tree
    const { nodes, edges } = extractNodesAndEdges(jsonTree);

    // 4. Find ancestors of the target node
    const ancestorIds = findAncestorIds(nodes, edges, nodeId);

    // 5. Filter nodes to only ancestors
    const ancestors = nodes.filter(node => ancestorIds.has(node.id));

    return { data: ancestors, error: null };
  } catch (error) {
    console.error("Error in findAncestorsAction:", error);
    return { data: null, error: error instanceof Error ? error.message : "Error finding ancestors" };
  }
}

/**
 * Execute ancestor chain for a node
 * 
 * @param treeId - ID of the tree
 * @param nodeId - ID of the target node
 * @param stopOnError - Whether to stop on first error (default: false)
 * @returns Object containing execution results or error
 */
export async function executeAncestorChainAction(
  treeId: string,
  nodeId: string,
  stopOnError: boolean = false
): Promise<{
  success: boolean,
  results: any[] | null,
  errors: string[] | null,
  executionTime: number | null,
  error: string | null
}> {
  try {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
      return { success: false, results: null, errors: null, executionTime: null, error: "Unauthorized" };
    }

    const companyId = (session.user as any).companyId;

    // 1. Retrieve the tree from the database
    const tree = await db.tree.findUnique({
      where: { id: treeId }
    });

    if (!tree) {
      return { success: false, results: null, errors: null, executionTime: null, error: "Tree not found" };
    }

    // 2. Parse the JSON tree
    const jsonTree = JSON.parse(tree.jsonDecisionTree);

    // 3. Extract nodes and edges from the tree
    const { nodes, edges } = extractNodesAndEdges(jsonTree);

    // 4. Execute the ancestor chain
    const result = await executeAncestors(nodes, edges, nodeId, stopOnError, treeId);

    return {
      success: result.success,
      results: result.results,
      errors: result.errors,
      executionTime: result.executionTime,
      error: null
    };
  } catch (error) {
    console.error("Error in executeAncestorChainAction:", error);
    return {
      success: false,
      results: null,
      errors: null,
      executionTime: null,
      error: error instanceof Error ? error.message : "Error executing ancestor chain"
    };
  }
}

/**
 * Execute entire chain including the target node
 * 
 * @param treeId - ID of the tree
 * @param nodeId - ID of the target node
 * @param stopOnError - Whether to stop on first error (default: false)
 * @returns Object containing execution results or error
 */
export async function executeFullChainAction(
  treeId: string,
  nodeId: string,
  stopOnError: boolean = false
): Promise<{
  success: boolean,
  results: any[] | null,
  errors: string[] | null,
  executionTime: number | null,
  error: string | null
}> {
  try {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
      return { success: false, results: null, errors: null, executionTime: null, error: "Unauthorized" };
    }

    const companyId = (session.user as any).companyId;

    // 1. Retrieve the tree from the database
    const tree = await db.tree.findUnique({
      where: { id: treeId }
    });

    if (!tree) {
      return { success: false, results: null, errors: null, executionTime: null, error: "Tree not found" };
    }

    // 2. Parse the JSON tree
    const jsonTree = JSON.parse(tree.jsonDecisionTree);

    // 3. Extract nodes and edges from the tree
    const { nodes, edges } = extractNodesAndEdges(jsonTree);

    // 4. Execute the entire chain
    const result = await executeChain(nodes, edges, stopOnError, treeId);

    return {
      success: result.success,
      results: result.results,
      errors: result.errors,
      executionTime: result.executionTime,
      error: null
    };
  } catch (error) {
    console.error("Error in executeFullChainAction:", error);
    return {
      success: false,
      results: null,
      errors: null,
      executionTime: null,
      error: error instanceof Error ? error.message : "Error executing full chain"
    };
  }
}

/**
 * Extract nodes and edges from a JSON tree structure
 * 
 * @param jsonTree - JSON tree object
 * @returns Object containing nodes and edges arrays
 */
function extractNodesAndEdges(jsonTree: any): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Extract nodes from the tree
  function extractNodes(node: any, parentId?: string): void {
    if (!node) return;

    // Create a node object if it has an ID
    if (node.id) {
      // Determine node type: explicit type, or infer from configuration
      // AI prompt is the strongest signal — if present, classify as AI
      // regardless of leftover sqlQuery/pythonCode from previous configurations.
      let nodeType = node.type || 'trigger';
      if (nodeType === 'trigger' && node.aiConfig?.prompt) {
        nodeType = 'ai';
      }

      const newNode: Node = {
        id: node.id,
        type: nodeType,
        name: node.name || node.text || undefined,
        // SQL specific
        sqlQuery: node.sqlQuery,
        sqlResultName: node.sqlResultName,
        sqlConnectorId: node.sqlConnectorId,
        // Python specific
        pythonCode: node.pythonCode,
        pythonResultName: node.pythonResultName,
        pythonOutputType: node.pythonOutputType,
        pythonConnectorId: node.pythonConnectorId,
        // AI specific
        aiConfig: node.aiConfig ? {
          enabled: node.aiConfig.enabled,
          outputName: node.aiConfig.outputName,
          outputType: node.aiConfig.outputType,
          prompt: node.aiConfig.prompt,
          model: node.aiConfig.model,
          lastResult: node.aiConfig.lastResult,
        } : undefined,
        // Email specific
        emailTemplate: node.emailTemplate,
        emailTo: node.emailTo,
        emailSubject: node.emailSubject,
        // SharePoint specific
        sharepointPath: node.sharepointPath,
        sharepointAction: node.sharepointAction,
        // HubSpot specific
        hubspotAction: node.hubspotAction,
        hubspotObjectType: node.hubspotObjectType,
        // Dependencies
        dependencies: node.dependencies || [],
        writesToDatabase: node.writesToDatabase || false
      };

      nodes.push(newNode);

      // Create an edge from parent to this node
      if (parentId) {
        edges.push({
          id: `${parentId}-${node.id}`,
          source: parentId,
          target: node.id
        });
      }
    }

    // Recursively process children
    if (node.options) {
      for (const key in node.options) {
        extractNodes(node.options[key], node.id);
      }
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        extractNodes(child, node.id);
      }
    }
  }

  extractNodes(jsonTree);

  return { nodes, edges };
}

/**
 * Find all ancestor IDs of a target node
 * 
 * @param nodes - All nodes in the tree
 * @param edges - All edges in the tree
 * @param targetNodeId - ID of the target node
 * @returns Set of ancestor node IDs
 */
function findAncestorIds(nodes: Node[], edges: Edge[], targetNodeId: string): Set<string> {
  const ancestors = new Set<string>();
  const visited = new Set<string>();

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

  // DFS to find all ancestors
  const dfs = (nodeId: string) => {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);
    const sources = reverseAdj.get(nodeId) || [];

    for (const sourceId of sources) {
      ancestors.add(sourceId);
      dfs(sourceId);
    }
  };

  dfs(targetNodeId);

  return ancestors;
}

/**
 * Get execution status for a node
 * 
 * @param treeId - ID of the tree
 * @param nodeId - ID of the node
 * @returns Object containing execution status or error
 */
export async function getNodeExecutionStatusAction(
  treeId: string,
  nodeId: string
): Promise<{ data: any | null, error: string | null }> {
  try {
    const session = await getSession();
    if (!session?.user || !(session.user as any).companyId) {
      return { data: null, error: "Unauthorized" };
    }

    const companyId = (session.user as any).companyId;

    // 1. Retrieve the tree from the database
    const tree = await db.tree.findUnique({
      where: { id: treeId }
    });

    if (!tree) {
      return { data: null, error: "Tree not found" };
    }

    // 2. Parse the JSON tree
    const jsonTree = JSON.parse(tree.jsonDecisionTree);

    // 3. Extract nodes and edges from the tree
    const { nodes, edges } = extractNodesAndEdges(jsonTree);

    // 4. Find the target node
    const targetNode = nodes.find(node => node.id === nodeId);
    if (!targetNode) {
      return { data: null, error: "Node not found" };
    }

    // 5. Find ancestors
    const ancestorIds = findAncestorIds(nodes, edges, nodeId);
    const ancestors = nodes.filter(node => ancestorIds.has(node.id));

    // 6. Return execution status
    return {
      data: {
        nodeId,
        nodeName: targetNode.name,
        nodeType: targetNode.type,
        ancestorCount: ancestors.length,
        ancestors: ancestors.map(a => ({
          id: a.id,
          name: a.name,
          type: a.type
        }))
      },
      error: null
    };
  } catch (error) {
    console.error("Error in getNodeExecutionStatusAction:", error);
    return { data: null, error: error instanceof Error ? error.message : "Error getting execution status" };
  }
}
