/**
 * Ancestor Executor Library
 * 
 * Provides functions for executing ancestor chains in cascading order.
 * Executes nodes from top to bottom, including those that write to the database.
 */

import { Node, Edge, topologicalSort, calculateDepths } from './topological-sort';

/**
 * Python output type definition
 */
type PythonOutputType = 'table' | 'variable' | 'chart' | 'html';

/**
 * Execution result for a single node
 */
export interface NodeExecutionResult {
  nodeId: string;
  nodeName?: string;
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

/**
 * Execution result for the entire chain
 */
export interface ChainExecutionResult {
  success: boolean;
  results: NodeExecutionResult[];
  errors: string[];
  executionTime: number;
}

/**
 * Context for node execution
 */
export interface ExecutionContext {
  results: Map<string, any>;
  executedNodes: Set<string>;
  sqlPool?: any;
  transaction?: any;
  treeId?: string;
}

/**
 * Execute a single node based on its type
 * 
 * @param node - Node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeNode(node: Node, context: ExecutionContext): Promise<NodeExecutionResult> {
  const startTime = Date.now();

  try {
    let result: any;

    switch (node.type) {
      case 'sql':
        result = await executeSqlNode(node, context);
        break;
      case 'python':
        result = await executePythonNode(node, context);
        break;
      case 'email':
        result = await executeEmailNode(node, context);
        break;
      case 'sharepoint':
        result = await executeSharePointNode(node, context);
        break;
      case 'hubspot':
        result = await executeHubSpotNode(node, context);
        break;
      case 'trigger':
        result = await executeTriggerNode(node, context);
        break;
      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }

    // Store result in context
    context.results.set(node.id, result);
    context.executedNodes.add(node.id);

    // Persist result if treeId is available
    if (context.treeId) {
      // Import dynamically to avoid circular dependencies
      const { saveNodeExecutionResultAction } = await import('@/app/actions/scheduler');
      // We don't await this to avoid blocking the chain execution too much, 
      // or we DO await to ensure consistency? 
      // Better to await to catch errors and ensuring it's saved before moving on (or failing gracefully)
      try {
        await saveNodeExecutionResultAction(
          context.treeId,
          node.id,
          result,
          'success',
          undefined,
          Date.now() - startTime
        );
      } catch (err) {
        console.warn(`Failed to persist execution result for node ${node.id}:`, err);
      }
    }

    return {
      nodeId: node.id,
      nodeName: node.name,
      success: true,
      data: result,
      executionTime: Date.now() - startTime
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error executing node ${node.name || node.id}:`, errorMessage);

    return {
      nodeId: node.id,
      nodeName: node.name,
      success: false,
      error: errorMessage,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Execute a SQL node
 * 
 * @param node - SQL node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeSqlNode(node: Node, context: ExecutionContext): Promise<any> {
  if (!node.sqlQuery) {
    throw new Error('SQL node missing sqlQuery');
  }

  // Import executeSqlPreviewAction dynamically to avoid circular dependencies
  const { executeSqlPreviewAction } = await import('@/app/actions');

  // Build dependencies from context
  const dependencies = buildDependencies(node, context);

  // Execute SQL query
  const result = await executeSqlPreviewAction(
    node.sqlQuery,
    node.sqlConnectorId || '',
    dependencies
  );

  if (result.error) {
    throw new Error(result.error);
  }

  return result.data;
}

/**
 * Execute a Python node
 * 
 * @param node - Python node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executePythonNode(node: Node, context: ExecutionContext): Promise<any> {
  if (!node.pythonCode) {
    throw new Error('Python node missing pythonCode');
  }

  // Import executePythonPreviewAction dynamically to avoid circular dependencies
  const { executePythonPreviewAction } = await import('@/app/actions');

  // Build dependencies from context
  const dependencies = buildDependencies(node, context);

  // Convert pythonOutputType to valid type
  const outputType: PythonOutputType = node.pythonOutputType || 'table';

  // Execute Python script
  const result = await executePythonPreviewAction(
    node.pythonCode,
    outputType,
    {},
    dependencies,
    node.pythonConnectorId
  );

  if (!result.success) {
    throw new Error(result.error || 'Python execution failed');
  }

  return result.data;
}

/**
 * Execute an email node
 * 
 * @param node - Email node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeEmailNode(node: Node, context: ExecutionContext): Promise<any> {
  if (!node.emailTemplate) {
    throw new Error('Email node missing emailTemplate');
  }

  // Import sendEmailWithConnectorAction dynamically
  const { sendEmailWithConnectorAction } = await import('@/app/actions/connectors');

  // Build email parameters from context
  const params = {
    connectorId: node.sqlConnectorId || '', // Reuse connectorId field
    to: node.emailTo || '',
    subject: node.emailSubject || 'Subject',
    htmlBody: node.emailTemplate,
    data: extractDataFromContext(context)
  };

  const result = await sendEmailWithConnectorAction(params);

  if (!result.success) {
    throw new Error(result.error || 'Email sending failed');
  }

  return result.message;
}

/**
 * Execute a SharePoint node
 * 
 * @param node - SharePoint node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeSharePointNode(node: Node, context: ExecutionContext): Promise<any> {
  if (!node.sharepointPath) {
    throw new Error('SharePoint node missing sharepointPath');
  }

  // Import SharePoint actions dynamically
  const { getSharePointItems, saveToSharePoint } = await import('@/app/actions/sharepoint');

  // Build data from context
  const data = extractDataFromContext(context);

  let result;
  switch (node.sharepointAction) {
    case 'read':
      result = await getSharePointItems({
        path: node.sharepointPath,
        connectorId: node.sqlConnectorId // Reuse connectorId field
      });
      break;
    case 'write':
      result = await saveToSharePoint({
        path: node.sharepointPath,
        data: data,
        connectorId: node.sqlConnectorId
      });
      break;
    default:
      throw new Error(`Unsupported SharePoint action: ${node.sharepointAction}`);
  }

  if (!result.success) {
    throw new Error(result.error || 'SharePoint operation failed');
  }

  return result.data ?? null;
}

/**
 * Execute a HubSpot node
 * 
 * @param node - HubSpot node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeHubSpotNode(node: Node, context: ExecutionContext): Promise<any> {
  if (!node.hubspotObjectType) {
    throw new Error('HubSpot node missing hubspotObjectType');
  }

  // Import HubSpot actions dynamically
  // Note: HubSpot actions may not be implemented yet, so we'll use a placeholder
  // const { getHubSpotDataAction, saveToHubSpotAction } = await import('@/app/actions/connectors');

  // Build data from context
  const data = extractDataFromContext(context);

  // Placeholder for HubSpot execution
  // TODO: Implement actual HubSpot actions
  console.log(`HubSpot ${node.hubspotAction} operation for ${node.hubspotObjectType}`, data);

  return {
    hubspotAction: node.hubspotAction,
    objectType: node.hubspotObjectType,
    data: data
  };
}

/**
 * Execute a trigger node
 * 
 * @param node - Trigger node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeTriggerNode(node: Node, context: ExecutionContext): Promise<any> {
  // Trigger nodes are typically executed automatically
  // For now, we just return a success status
  return {
    triggered: true,
    nodeId: node.id
  };
}

/**
 * Build dependencies array from context for a node
 * 
 * @param node - Node for which to build dependencies
 * @param context - Execution context
 * @returns Array of dependencies
 */
function buildDependencies(node: Node, context: ExecutionContext): any[] {
  const dependencies: any[] = [];

  if (!node.dependencies || node.dependencies.length === 0) {
    return dependencies;
  }

  // Map dependencies to context results
  for (const depName of node.dependencies) {
    // Find the node that produces this dependency
    for (const [nodeId, result] of context.results.entries()) {
      // Check if this node's result matches the dependency name
      if (result && typeof result === 'object' && 'name' in result && result.name === depName) {
        dependencies.push({
          tableName: depName,
          data: result,
          isPython: result.isPython || false
        });
        break;
      }
    }
  }

  return dependencies;
}

/**
 * Extract data from execution context
 * 
 * @param context - Execution context
 * @returns Extracted data
 */
function extractDataFromContext(context: ExecutionContext): any {
  const data: any = {};

  for (const [nodeId, result] of context.results.entries()) {
    data[nodeId] = result;
  }

  return data;
}

/**
 * Execute a chain of nodes in cascading order
 * 
 * @param nodes - Array of nodes to execute
 * @param edges - Array of edges defining dependencies
 * @param stopOnError - Whether to stop on first error (default: false)
 * @returns Chain execution result
 */
export async function executeChain(
  nodes: Node[],
  edges: Edge[],
  stopOnError: boolean = false,
  treeId?: string
): Promise<ChainExecutionResult> {
  const startTime = Date.now();
  const results: NodeExecutionResult[] = [];
  const errors: string[] = [];

  // Calculate depths for nodes
  const depths = calculateDepths(nodes, edges);

  // Assign depths to nodes
  nodes.forEach(node => {
    node.depth = depths.get(node.id) || 0;
  });

  // Sort nodes topologically
  const sortedNodes = topologicalSort(nodes, edges);

  // Initialize execution context
  const context: ExecutionContext = {
    results: new Map(),
    executedNodes: new Set(),
    treeId
  };

  // Execute nodes in order
  for (const node of sortedNodes) {
    const result = await executeNode(node, context);
    results.push(result);

    if (!result.success) {
      errors.push(`Node ${node.name || node.id}: ${result.error}`);

      if (stopOnError) {
        break;
      }
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
    executionTime: Date.now() - startTime
  };
}

/**
 * Execute only the ancestors of a specific node
 * 
 * @param nodes - All nodes in the tree
 * @param edges - All edges in the tree
 * @param targetNodeId - ID of the target node
 * @param stopOnError - Whether to stop on first error (default: false)
 * @returns Chain execution result
 */
export async function executeAncestors(
  nodes: Node[],
  edges: Edge[],
  targetNodeId: string,
  stopOnError: boolean = false,
  treeId?: string
): Promise<ChainExecutionResult> {
  // Find all ancestors of the target node
  const ancestorIds = findAncestorIds(nodes, edges, targetNodeId);

  // Filter nodes to only ancestors
  const ancestorNodes = nodes.filter(node => ancestorIds.has(node.id));

  // Filter edges to only those between ancestors
  const ancestorEdges = edges.filter(edge =>
    ancestorIds.has(edge.source) && ancestorIds.has(edge.target)
  );

  // Execute the ancestor chain
  return executeChain(ancestorNodes, ancestorEdges, stopOnError, treeId);
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
