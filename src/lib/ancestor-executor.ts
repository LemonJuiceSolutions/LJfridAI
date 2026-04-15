/**
 * Ancestor Executor Library
 * 
 * Provides functions for executing ancestor chains in cascading order.
 * Executes nodes from top to bottom, including those that write to the database.
 */

import { Node, Edge, topologicalSort, calculateDepths } from './topological-sort';
import { generateText } from 'ai';
import { randomUUID } from 'crypto';
import {
  executePipelineSql,
  resolveResult,
  cleanupPipelineCache,
  isLargeResultRef,
} from './pipeline-sql-executor';

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
  executionId: string;  // unique ID for this pipeline run (used for disk caching)
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
      case 'ai':
        result = await executeAiNode(node, context);
        break;
      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }

    // Store result in context — by node ID and also by result name for dependency resolution
    context.results.set(node.id, result);
    const resultName = node.sqlResultName || node.pythonResultName || node.aiConfig?.outputName || node.name;
    if (resultName && resultName !== node.id) {
      context.results.set(resultName, result);
    }
    context.executedNodes.add(node.id);

    // Persist result if treeId is available
    if (context.treeId) {
      const { saveNodeExecutionResultAction } = await import('@/app/actions/scheduler');
      try {
        // For large results (file refs), only persist metadata — not the full data
        const persistData = isLargeResultRef(result)
          ? { __large: true, rowCount: result.rowCount, sizeBytes: result.sizeBytes }
          : result;
        await saveNodeExecutionResultAction(
          context.treeId,
          node.id,
          persistData,
          'success',
          undefined,
          Date.now() - startTime
        );
      } catch (err) {
        console.warn(`Failed to persist execution result for node ${node.id}:`, err);
      }
    }

    // For the client response: strip large data, only send metadata
    const clientData = isLargeResultRef(result)
      ? { __large: true, rowCount: result.rowCount, sizeBytes: result.sizeBytes }
      : (Array.isArray(result) && JSON.stringify(result).length > 5_000_000)
        ? { __large: true, rowCount: result.length, sizeBytes: JSON.stringify(result).length }
        : result;

    return {
      nodeId: node.id,
      nodeName: node.name,
      success: true,
      data: clientData,
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

  // Build dependencies from context
  const dependencies = buildDependencies(node, context);

  // Find the connector ID — check node, then inherit from dependencies
  let connectorId = node.sqlConnectorId || '';
  if (!connectorId) {
    for (const dep of dependencies) {
      if (dep.connectorId) { connectorId = dep.connectorId; break; }
    }
  }

  // Use direct executor — bypasses RSC serialization entirely.
  // Handles both cases: with and without dependencies (temp tables).
  if (connectorId) {
    const result = await executePipelineSql(
      node.sqlQuery,
      connectorId,
      context.executionId,
      node.name || node.id,
      dependencies.length > 0 ? dependencies : undefined,
    );

    if (result.error) {
      throw new Error(result.error);
    }

    return result.data;
  }

  // Fallback: only when no connectorId (needs auth-based lookup from Server Action)
  const { executeSqlPreviewAction } = await import('@/app/actions');

  const resolvedDeps = dependencies.map(dep => ({
    ...dep,
    data: dep.data ? resolveResult(dep.data) : dep.data,
  }));

  let result: any;
  try {
    result = await executeSqlPreviewAction(node.sqlQuery, connectorId, resolvedDeps);
  } catch (e: any) {
    if (e?.message?.includes('JSON') || e?.message?.includes('Unterminated')) {
      throw new Error(
        `Il risultato SQL del nodo "${node.name || node.id}" è troppo grande. ` +
        `Usa TOP o WHERE per limitare le righe.`
      );
    }
    throw e;
  }

  if (result.error) throw new Error(result.error);
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

  // Pre-populate inputData from resolved dependencies so executePythonPreviewAction
  // can skip re-fetching data that's already available from parent nodes
  const inputData: Record<string, any[]> = {};
  for (const dep of dependencies) {
    const resolved = dep.data ? resolveResult(dep.data) : dep.data;
    if (resolved && Array.isArray(resolved)) {
      inputData[dep.tableName] = resolved;
      console.log(`[executePythonNode] Pre-loaded ${resolved.length} rows for "${dep.tableName}" from pipeline context`);
    }
  }

  // Convert pythonOutputType to valid type
  const outputType: PythonOutputType = node.pythonOutputType || 'table';

  // Execute Python script
  const result = await executePythonPreviewAction(
    node.pythonCode,
    outputType,
    inputData,
    dependencies,
    node.pythonConnectorId,
    undefined,
    node.selectedDocuments?.length ? node.selectedDocuments : undefined
  );

  if (!result.success) {
    throw new Error(result.error || 'Python execution failed');
  }

  // Handle auto-switched output type (e.g. script configured as 'table' but produced HTML)
  const effectiveOutputType = (result as any)._autoSwitchedOutputType || outputType;

  // For html/chart output types, return the full result so downstream nodes can access html/chart fields
  if (effectiveOutputType === 'html' || effectiveOutputType === 'chart') {
    return {
      data: result.data,
      html: result.html,
      chartBase64: result.chartBase64,
      chartHtml: result.chartHtml,
      plotlyJson: result.plotlyJson,
      type: effectiveOutputType
    };
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
 * Execute an AI node
 *
 * @param node - AI node to execute
 * @param context - Execution context
 * @returns Execution result
 */
async function executeAiNode(node: Node, context: ExecutionContext): Promise<any> {
  const aiConfig = node.aiConfig;
  if (!aiConfig?.prompt || !aiConfig?.model || !aiConfig?.outputType) {
    throw new Error('AI node missing configuration (prompt/model/outputType)');
  }

  // Get OpenRouter API key from the current session
  const { getOpenRouterSettingsAction } = await import('@/actions/openrouter');
  const settings = await getOpenRouterSettingsAction();
  if (!settings.apiKey) {
    throw new Error('OpenRouter API key not configured. Configure it in Settings.');
  }

  const { getOpenRouterModel } = await import('@/ai/providers/openrouter-provider');

  // Interpolate placeholders with pipeline data from context
  let prompt = aiConfig.prompt;
  prompt = prompt.replace(
    /\{\{TABELLA:([^}]+)\}\}/g,
    (_: string, name: string) => {
      const res = findResultInContext(context, name);
      if (res) {
        const rows = Array.isArray(res) ? res.slice(0, 100) : res;
        return JSON.stringify(rows);
      }
      return `[Tabella "${name}" non trovata]`;
    }
  );
  prompt = prompt.replace(
    /\{\{VARIABILE:([^}]+)\}\}/g,
    (_: string, name: string) => {
      const res = findResultInContext(context, name);
      if (res) return JSON.stringify(res);
      return `[Variabile "${name}" non trovata]`;
    }
  );
  prompt = prompt.replace(
    /\{\{GRAFICO:([^}]+)\}\}/g,
    (_: string, name: string) => `[Grafico "${name}"]`
  );

  // Call AI model via OpenRouter
  const model = getOpenRouterModel(settings.apiKey, aiConfig.model);
  const result = await generateText({
    model,
    prompt,
  });

  // Parse result based on outputType
  return parseAiResult(result.text, aiConfig.outputType);
}

/**
 * Find a result in context by name (checking both node IDs and result names)
 */
function findResultInContext(context: ExecutionContext, name: string): any {
  // Direct lookup by node ID
  if (context.results.has(name)) {
    return context.results.get(name);
  }
  // Search by result name in stored results
  for (const [, result] of context.results.entries()) {
    if (result && typeof result === 'object' && 'name' in result && result.name === name) {
      return result;
    }
    // Check if result contains data with matching key
    if (result && typeof result === 'object' && 'data' in result) {
      return result.data;
    }
  }
  return null;
}

/**
 * Parse AI text result based on output type
 */
function parseAiResult(text: string, outputType: string): any {
  switch (outputType) {
    case 'table': {
      const json = extractJsonFromText(text);
      if (json) {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) return parsed;
        if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
        return [parsed];
      }
      return [{ risultato: text.trim() }];
    }
    case 'number': {
      const cleaned = stripMarkdownFences(text);
      const match = cleaned.match(/-?\d+([.,]\d+)?/);
      if (match) return parseFloat(match[0].replace(',', '.'));
      const fallback = text.match(/-?\d+([.,]\d+)?/);
      if (fallback) return parseFloat(fallback[0].replace(',', '.'));
      return 0;
    }
    case 'chart': {
      const json = extractJsonFromText(text);
      if (json) {
        const parsed = JSON.parse(json);
        if (parsed.type && parsed.data) return parsed;
        if (parsed.data && Array.isArray(parsed.data)) {
          return {
            type: 'bar-chart',
            data: parsed.data,
            xAxisKey: Object.keys(parsed.data[0] || {})[0],
            dataKeys: Object.keys(parsed.data[0] || {}).slice(1),
            title: parsed.title || 'Grafico AI'
          };
        }
      }
      throw new Error('Invalid chart format from AI');
    }
    case 'string':
    default:
      return text.trim();
  }
}

function stripMarkdownFences(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return m ? m[1].trim() : text.trim();
}

function extractJsonFromText(text: string): string | null {
  const fenced = stripMarkdownFences(text);
  try { JSON.parse(fenced); return fenced; } catch { /* */ }
  const a = text.match(/\[[\s\S]*\]/);
  if (a) { try { JSON.parse(a[0]); return a[0]; } catch { /* */ } }
  const o = text.match(/\{[\s\S]*\}/);
  if (o) { try { JSON.parse(o[0]); return o[0]; } catch { /* */ } }
  return null;
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
    let found = false;

    // 1. Direct lookup by name (stored via resultName in executeNode)
    if (context.results.has(depName)) {
      const result = context.results.get(depName);
      dependencies.push({
        tableName: depName,
        data: isLargeResultRef(result) ? result : (Array.isArray(result) ? result : (result?.data || result)),
        isPython: false
      });
      found = true;
    }

    // 2. Fallback: search by result.name property (legacy)
    if (!found) {
      for (const [nodeId, result] of context.results.entries()) {
        if (result && typeof result === 'object' && 'name' in result && result.name === depName) {
          dependencies.push({
            tableName: depName,
            data: result,
            isPython: result.isPython || false
          });
          found = true;
          break;
        }
      }
    }

    if (!found) {
      console.warn(`[buildDependencies] Dependency "${depName}" not found in context. Available keys: ${[...context.results.keys()].join(', ')}`);
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
  const executionId = randomUUID();
  const context: ExecutionContext = {
    results: new Map(),
    executedNodes: new Set(),
    treeId,
    executionId,
  };

  // Execute nodes in order
  try {
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
  } finally {
    // Clean up any large-result cache files written during this execution
    cleanupPipelineCache(executionId);
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
