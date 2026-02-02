

'use client';
import type { DecisionNode, StoredTree, DecisionLeaf, Variable, VariableOption, LinkItem, TriggerItem } from '@/lib/types';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Mail, AlertCircle, Plus, Pencil, Trash2, Expand, Download, Link as LinkIcon, Link2, Zap, Image as ImageIcon, Video, GitBranch, Database, Play, Check, FileText, Cpu, Bot, Flag, Terminal, Code, FileCode, Upload } from 'lucide-react';
import _ from 'lodash';
import EditNodeDialog from './edit-node-dialog';
import AddNodeDialog from './add-node-dialog';
import PanZoomContainer from './pan-zoom-container';
import { Button } from '../ui/button';
import DeleteNodeDialog from './delete-node-dialog';
import { useToast } from '@/hooks/use-toast';
import LinkNodeDialog from './link-node-dialog';
import { nanoid } from 'nanoid';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { getTreesAction, getVariablesAction, updateVariableAction, updateTreeNodeAction } from '@/app/actions';
import EditOptionDialog from './edit-option-dialog';
import AddChildNodeDialog from './add-child-node-dialog';


interface VisualTreeProps {
    treeData: StoredTree;
    onDataRefresh?: () => void;
    isSaving: boolean;
}

// --- Layout Constants ---
const NODE_WIDTH = 220; // Increased to provide more space
const NODE_HEIGHT = 120;
const OPTION_NODE_WIDTH = 220; // Match standard node width
const OPTION_NODE_HEIGHT = 80; // Slightly increased height for options
const H_SPACING = 24; // Increased spacing to avoid crowding
const V_SPACING = 80;

// --- Custom Python Icon ---
// --- Custom Python Icon ---
const PythonIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="M11.97 2c-1.373 0-2.618.122-3.645.342-.962.206-1.743.522-2.308.932-.562.408-.888.895-.888 1.48v1.89h4.64v.667H3.43c-.767 0-1.365.234-1.841.614-.475.38-.68 1.006-.68 1.692v3.744c0 .686.205 1.31.68 1.693.476.38 1.074.614 1.84.614h1.423v-2.008c0-.686.205-1.312.682-1.694.476-.381 1.071-.614 1.838-.614h3.764c.767 0 1.365-.233 1.842-.614.477-.38.681-1.006.681-1.692V6.442c0-.686-.204-1.311-.681-1.693-.477-.38-1.075-.614-1.842-.614H8.48V3.12c0-.361.341-.741 1-.954C10.144 2.016 10.99 2 12.03 2c1.04 0 1.886.016 2.55.166.659.213 1 .593 1 .954v1.015h-1.317c-.767 0-1.362.233-1.839.614-.477.38-.68 1.006-.68 1.692v3.744c0 .686.203 1.31.68 1.693.477.38 1.072.614 1.839.614h3.764c.766 0 1.362.234 1.838.614.476.38.68 1.006.68 1.692V10.45c0-.585-.326-1.072-.888-1.48-.565-.41-1.346-.726-2.308-.932-1.027-.22-2.272-.342-3.645-.342zM12.03 22c1.373 0 2.617-.122 3.645-.342.962-.206 1.743-.522 2.308-.932.562-.408.888-.895.888-1.48v-1.89h-4.64v-.667h6.339c.767 0 1.365-.234 1.841-.614.475-.38.681-1.006.681-1.692V10.64c0-.686-.206-1.31-.681-1.693-.476-.38-1.074-.614-1.841-.614h-1.423v2.008c0 .686-.205 1.312-.682 1.694-.476.381-1.071.614-1.838.614H13.56c-.767 0-1.365.234-1.842.614-.477.381-.681 1.006-.681 1.692v3.745c0 .686.204 1.311.681 1.692.477.38 1.075.614 1.842.614h3.754V20.88c0 .361-.341.741-1 .954-.664.15-1.51.166-2.55.166-1.04 0-1.886-.016-2.55-.166-.659-.213-1-.593-1-.954v-1.015h1.317c.767 0 1.361-.233 1.839-.614.477-.38.68-1.006.68-1.692V13.82c0-.686-.203-1.31-.68-1.693-.478-.38-1.072-.614-1.839-.614h-3.764c-.766 0-1.362-.234-1.838-.614-.476-.38-.681-1.006-.681-1.692v3.744c0 .585.326 1.072.888 1.48.565.41 1.346.727 2.308.933 1.027.22 2.272.342 3.645.342z" />
    </svg>
);


// --- Helper to ensure all nodes have an ID ---
const ensureNodeIds = (node: any): any => {
    if (typeof node !== 'object' || node === null) {
        return node;
    }

    const newNode = _.cloneDeep(node);

    const traverse = (n: any): any => {
        if (Array.isArray(n)) {
            return n.map(item => traverse(item));
        }
        if (typeof n === 'object' && n !== null && !('ref' in n) && !('subTreeRef' in n) && !n.id) {
            n.id = nanoid(8);
        }
        if (typeof n === 'object' && n !== null && 'options' in n && n.options) {
            Object.keys(n.options).forEach(key => {
                n.options[key] = traverse(n.options[key]);
            });
        }
        return n;
    };

    return traverse(newNode);
};


// --- Type definitions for layout calculation ---
type LayoutNodeType = 'question' | 'decision' | 'option' | 'link' | 'sub-tree-link';

type TreeNodeWithLayout = {
    node: DecisionNode | string | { ref: string, id?: string } | { subTreeRef: string, id?: string } | { option: string, id?: string, variableId?: string, optionId?: string };
    path: string;
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    type: LayoutNodeType;
    parent?: TreeNodeWithLayout;
};


// --- Layout Calculation Logic ---
const createNodeMap = (root: DecisionNode): Map<string, DecisionNode> => {
    const map = new Map<string, DecisionNode>();
    const traverse = (node: any) => {
        if (!node || typeof node !== 'object') return;

        if (node.id) {
            map.set(node.id, node);
        }

        if (node.options) {
            Object.values(node.options).forEach((child: any) => {
                if (Array.isArray(child)) {
                    child.forEach(c => traverse(c));
                } else {
                    traverse(child);
                }
            });
        }
    };
    traverse(root);
    return map;
};

const calculateLayout = (root: DecisionNode, nodeMap: Map<string, DecisionNode>) => {
    const layout: Map<string, TreeNodeWithLayout> = new Map();

    let maxY = 0;

    function calculateNodePositions(
        node: any,
        path: string,
        x = 0,
        y = 0,
        parentNode?: TreeNodeWithLayout,
        visitedRefs: Set<string> = new Set()
    ): { width: number, height: number, layoutNode: TreeNodeWithLayout } {
        const id = (typeof node === 'object' && node.id) ? node.id : path;

        if (y > maxY) maxY = y;

        const isLink = typeof node === 'object' && 'ref' in node;
        const isSubTreeLink = typeof node === 'object' && 'subTreeRef' in node;

        // CHECK FOR VALID EXPANDABLE LINK
        let expandedTargetNode: DecisionNode | null = null;
        if (isLink && node.ref && nodeMap) {
            const target = nodeMap.get(node.ref);
            // Check if valid target exists AND we haven't visited this ref ID in this branch yet (cycle detection)
            if (target && target.options && !visitedRefs.has(node.ref)) {
                expandedTargetNode = target;
            }
        }

        if ((typeof node !== 'object' || ('decision' in node) || isLink || isSubTreeLink || !node.options) && !expandedTargetNode) {
            let type: LayoutNodeType = 'decision';
            if (isLink) type = 'link';
            if (isSubTreeLink) type = 'sub-tree-link';

            // Links (not sub-trees) are invisible nodes that just draw connectors.
            // They should not take up space in the layout to avoid gaps.
            const effectiveWidth = (type === 'link') ? 0 : NODE_WIDTH;
            const effectiveHeight = (type === 'link') ? 0 : NODE_HEIGHT;

            let nodeWithLayout: TreeNodeWithLayout = {
                node, path, id, x, y,
                width: effectiveWidth, height: effectiveHeight,
                type,
                parent: parentNode
            };
            layout.set(path, nodeWithLayout);
            return { width: effectiveWidth, height: effectiveHeight, layoutNode: nodeWithLayout };
        }

        // --- EXPANDED LINK HANDLING ---
        // If it's an expanded link, we effectively render it as a QUESTION node (with children)
        // verifying we use the *target's* structure but keep the *link's* position/identity for the root of this subtree.
        const effectiveNode = expandedTargetNode || node;
        const isExpandedLink = !!expandedTargetNode;

        const questionNodeLayout: TreeNodeWithLayout = {
            node: isExpandedLink ? { ...node, ...expandedTargetNode, id: node.id } : node, // Merge to show target props but keep link ID
            path, id, x, y,
            width: NODE_WIDTH, height: NODE_HEIGHT,
            type: 'question', // Treat as question to render children
            parent: parentNode
        };

        // Mark as link for styling if needed (optional, logic might need adjustment in renderer)
        if (isExpandedLink) {
            (questionNodeLayout as any).isVirtualLink = true;
            (questionNodeLayout as any).originalRefId = node.ref;
        }

        const children = Object.entries(effectiveNode.options || {});

        // Update visited refs for children
        const nextVisitedRefs = new Set(visitedRefs);
        if (isExpandedLink && node.ref) {
            nextVisitedRefs.add(node.ref);
        }

        // First pass: calculate dimensions
        const childrenDims = children.map(([option, childNode]) => {
            // For virtual nodes, we append a suffix to the path to indicate it's a "ghost" path
            // Normal path: root.options['A']
            // Link path: root.options['A']#linked:REF_ID.options['B'] 
            // Better: just append as if it was normal, but we know it won't match a real path for editing.
            // To make unique keys, we must rely on the path being unique.

            let optionPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;
            if (isExpandedLink) {
                optionPath += `#virtual:${node.ref}`;
            }

            const startY = y + NODE_HEIGHT + V_SPACING + OPTION_NODE_HEIGHT;

            if (Array.isArray(childNode)) {
                // Arrange array items horizontally side-by-side
                let totalWidth = 0;
                let maxItemHeight = 0;
                const subDims: { width: number, height: number }[] = [];

                childNode.forEach((c, idx) => {
                    // Pass dummy coordinates, we only care about dimensions here
                    const { width, height } = calculateNodePositions(c, `${optionPath}[${idx}]`, 0, 0, undefined, nextVisitedRefs);
                    const dims = { width, height };

                    subDims.push(dims);
                    totalWidth += dims.width;
                    maxItemHeight = Math.max(maxItemHeight, dims.height);
                });

                // Add horizontal spacing between items
                if (childNode.length > 0) {
                    totalWidth += (childNode.length - 1) * H_SPACING;
                }

                return { width: Math.max(OPTION_NODE_WIDTH, totalWidth), height: maxItemHeight, subDims, isArray: true };
            } else {
                const { width, height, layoutNode } = calculateNodePositions(childNode, optionPath, 0, startY, undefined, nextVisitedRefs);
                const dims = { width, height };
                return { width: Math.max(OPTION_NODE_WIDTH, dims.width), height: dims.height, subDims: [dims], isArray: false };
            }
        });

        const totalChildrenWidth = childrenDims.reduce((acc, { width }) => acc + width, 0) + (Math.max(0, children.length - 1) * H_SPACING);
        const questionNodeWidth = Math.max(NODE_WIDTH, totalChildrenWidth);

        // Center the question node over its children
        questionNodeLayout.x = x + (questionNodeWidth - NODE_WIDTH) / 2;
        layout.set(path, questionNodeLayout);

        // Second pass: position children
        let currentX = x;
        children.forEach((child, i) => {
            const [option, childNode] = child;
            const branchInfo = childrenDims[i];
            const branchWidth = branchInfo.width;
            let optionPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;
            if (isExpandedLink) {
                optionPath += `#virtual:${node.ref}`;
            }

            const optionId = `${id}-${option}`;
            const variableId = effectiveNode.variableId;
            const optionData = variableId && effectiveNode.possibleValues ? effectiveNode.possibleValues.find((v: VariableOption) => v.name === option) : null;

            const optionNodeLayout: TreeNodeWithLayout = {
                node: { option: option, id: optionId, variableId: variableId, optionId: optionData?.id },
                path: optionPath,
                id: optionId,
                x: currentX + (branchWidth - OPTION_NODE_WIDTH) / 2,
                y: y + NODE_HEIGHT + (V_SPACING / 2),
                width: OPTION_NODE_WIDTH,
                height: OPTION_NODE_HEIGHT,
                type: 'option',
                parent: questionNodeLayout,
            };
            layout.set(optionId, optionNodeLayout);

            let childStartY = y + NODE_HEIGHT + (V_SPACING / 2) + OPTION_NODE_HEIGHT + 30;

            if (Array.isArray(childNode)) {
                const totalContentWidth = branchInfo.subDims.reduce((sum, d) => sum + d.width, 0) + (Math.max(0, childNode.length - 1) * H_SPACING);
                let currentItemX = currentX + (branchWidth - totalContentWidth) / 2;

                // All siblings connect directly to the option (parallel/fan-out)
                const itemParent = optionNodeLayout;

                childNode.forEach((c, idx) => {
                    const itemDims = branchInfo.subDims[idx];

                    calculateNodePositions(c, `${optionPath}[${idx}]`, currentItemX, childStartY, itemParent, nextVisitedRefs);

                    currentItemX += itemDims.width + H_SPACING;
                });
            } else {
                const childWidth = branchInfo.subDims[0].width;
                calculateNodePositions(childNode, optionPath, currentX + (branchWidth - childWidth) / 2, childStartY, optionNodeLayout, nextVisitedRefs);
            }

            currentX += branchWidth + H_SPACING;
        });

        // The total height of this Question node block includes the max height of children branches
        const maxBranchHeight = Math.max(0, ...childrenDims.map(d => d.height));
        const totalHeight = NODE_HEIGHT + (V_SPACING / 2) + OPTION_NODE_HEIGHT + 30 + maxBranchHeight;

        return { width: questionNodeWidth, height: totalHeight, layoutNode: questionNodeLayout };
    }

    if (root) {
        calculateNodePositions(root, 'root');
    }

    const positionedNodes = Array.from(layout.values());
    const minX = positionedNodes.length > 0 ? Math.min(...positionedNodes.map(n => n.x)) : 0;

    positionedNodes.forEach(n => {
        n.x -= minX;
    });

    const contentWidth = positionedNodes.length > 0 ? Math.max(...positionedNodes.map(n => n.x + n.width)) : NODE_WIDTH;
    const contentHeight = maxY + NODE_HEIGHT + V_SPACING;

    return { positionedNodes, contentWidth, contentHeight };
};

function getNodeFromPath(obj: any, path: string): any {
    if (path === 'root') {
        return obj;
    }
    const lodashPath = path.replace(/^root\.?/, '');
    return _.get(obj, lodashPath);
}


export default function VisualTree({ treeData, onDataRefresh, isSaving: parentIsSaving }: VisualTreeProps) {
    const { toast } = useToast();
    const [tree, setTree] = useState<DecisionNode | null>(null);
    const [dbVariables, setDbVariables] = useState<Variable[]>([]);
    const [allTrees, setAllTrees] = useState<StoredTree[]>([]);
    const autoCorrectAttempted = useRef(false);

    const [internalSaving, setInternalSaving] = useState(false);
    const isSaving = parentIsSaving || internalSaving;

    const fetchExternalData = useCallback(async () => {
        const [varsResult, treesResult] = await Promise.all([
            getVariablesAction(),
            getTreesAction()
        ]);
        if (varsResult.data) {
            setDbVariables(varsResult.data);
        }
        if (treesResult.data) {
            // Exclude current tree from the list of linkable trees
            setAllTrees(treesResult.data.filter(t => t.id !== treeData.id));
        }
    }, [treeData.id]);

    // Fix: Refresh variables when treeData changes (e.g. after consolidation)
    useEffect(() => {
        fetchExternalData();
    }, [treeData, fetchExternalData]);


    const layout = useMemo(() => {
        if (!tree) return { positionedNodes: [], contentWidth: 0, contentHeight: 0 };
        // Enrich tree with possibleValues from dbVariables
        const enrichedTree = _.cloneDeep(tree);
        const enrichNode = (node: any) => {
            if (node.variableId) {
                const dbVar = dbVariables.find(v => v.id === node.variableId);
                // Fix: Check if dbVar exists to prevent runtime errors
                if (dbVar) {
                    node.possibleValues = dbVar.possibleValues;
                }
            }
            if (node.options) {
                Object.values(node.options).forEach(enrichNode);
            }
        };
        enrichNode(enrichedTree);

        // Create map for O(1) lookup
        const nodeMap = createNodeMap(enrichedTree);

        return calculateLayout(enrichedTree, nodeMap);
    }, [tree, dbVariables]);

    const flattenTree = useCallback((node: any, path: string, list: any[]) => {
        if (!node) return;

        const id = (typeof node === 'object' && node.id) ? node.id : path;
        let text: string;

        if (typeof node === 'string') {
            text = `Decision: ${node}`;
        } else if ('ref' in node && node.ref) {
            text = `Link: ${node.ref}`;
        } else if ('subTreeRef' in node && node.subTreeRef) {
            text = `Sub-Tree: ${node.subTreeRef}`;
        } else if ('decision' in node && node.decision) {
            text = `Decision: ${node.decision}`;
        } else if ('question' in node) {
            text = node.question || "Invalid Node";
        } else {
            text = "Unknown Node";
        }

        if (!list.some(n => n.id === id)) {
            list.push({ id, text, path, node });
        }

        if (typeof node === 'object' && 'options' in node && node.options) {
            Object.entries(node.options).forEach(([option, childNode]) => {
                const optPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;
                if (Array.isArray(childNode)) {
                    childNode.forEach((c, idx) => flattenTree(c, `${optPath}[${idx}]`, list));
                } else {
                    flattenTree(childNode, optPath, list);
                }
            });
        }
    }, [tree]); // Simplified for brevity in replace

    const flatTree = useMemo(() => {
        if (!tree) return [];
        const list: any[] = [];
        flattenTree(tree, 'root', list);

        list.forEach(item => {
            if (item.text.startsWith('Link:')) {
                const refId = item.text.replace('Link: ', '');
                const linkedNode = list.find(n => n.id === refId);
                if (linkedNode) {
                    item.text = `Link: ${linkedNode.text.replace(/^Decision: |^Question: /, '')}`;
                } else {
                    item.text = `Link to: ${refId}`;
                }
            }
            if (item.text.startsWith('Sub-Tree:')) {
                const subTreeId = item.text.replace('Sub-Tree: ', '');
                const linkedTree = allTrees.find(t => t.id === subTreeId);
                item.text = `Sub-Tree: ${linkedTree?.name || subTreeId}`;
            }
        })
        return list;
    }, [tree, flattenTree, allTrees]);


    useEffect(() => {
        try {
            if (treeData?.jsonDecisionTree) {
                let parsedTree = JSON.parse(treeData.jsonDecisionTree);
                const treeWithIds = ensureNodeIds(parsedTree);

                // Check if IDs were added (structure changed)
                // We compare stringified versions to detect if ensureNodeIds added any 'id' fields
                if (JSON.stringify(parsedTree) !== JSON.stringify(treeWithIds)) {
                    if (!autoCorrectAttempted.current) {
                        console.log("Detected nodes without IDs. Auto-saving corrected tree...");
                        autoCorrectAttempted.current = true;

                        // IDs were added, so we must persist this change to the DB immediately
                        // to prevent link breakage on reload.
                        updateTreeNodeAction({
                            treeId: treeData.id,
                            nodePath: 'root',
                            nodeData: JSON.stringify(treeWithIds)
                        }).then((result) => {
                            if (result.success) {
                                console.log("Tree IDs persisted successfully.");
                                // We don't necessarily need to trigger onDataRefresh here if we setTree below,
                                // but it keeps strictly in sync.
                                if (onDataRefresh) onDataRefresh();
                            } else {
                                console.error("Failed to persist tree IDs:", result.error);
                            }
                        });
                    } else {
                        console.warn("Tree IDs mismatch detected but auto-correct already attempted. Skipping to avoid loop.");
                    }
                }

                setTree(treeWithIds as DecisionNode);
                fetchExternalData();
            }
        } catch (e) {
            console.error("Failed to parse tree JSON:", e);
            setTree(null);
        }
    }, [treeData, fetchExternalData, onDataRefresh]);

    const [editingNodeInfo, setEditingNodeInfo] = useState<{ path: string; node: DecisionLeaf | { question: string } | { option: string }; type: 'question' | 'decision' } | null>(null);
    const [editingOptionInfo, setEditingOptionInfo] = useState<{ path: string; option: VariableOption; varId: string; } | null>(null);
    const [addingNodeInfo, setAddingNodeInfo] = useState<{ path: string; type: 'add', varId?: string } | null>(null);
    const [addingChildNodeInfo, setAddingChildNodeInfo] = useState<{ path: string; } | null>(null);
    const [linkingNodeInfo, setLinkingNodeInfo] = useState<{ path: string; currentNode: any; } | null>(null);
    const [deletingNodeInfo, setDeletingNodeInfo] = useState<{ path: string; impactReport: any } | null>(null);
    const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
    const [zoomReset, setZoomReset] = useState(0);

    const handleNodeUpdateAction = async (treeId: string, nodePath: string, nodeData: string) => {
        if (!onDataRefresh) return;
        setInternalSaving(true);
        try {
            const result = await updateTreeNodeAction({
                treeId: treeId,
                nodePath: nodePath,
                nodeData: nodeData
            });
            if (result.success) {
                toast({ title: "Albero aggiornato!" });
                onDataRefresh();
            } else {
                throw new Error(result.error || 'Salvataggio fallito');
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante l'aggiornamento", description: error });
        } finally {
            setInternalSaving(false);
        }
    }


    const handleEdit = (path: string, type: 'question' | 'decision' | 'option', explicitOptionName?: string) => {
        if (!tree) return;

        const node = getNodeFromPath(tree, path);
        if (node === undefined) {
            console.error("Could not find node at path:", path);
            toast({ variant: 'destructive', title: "Errore", description: "Impossibile trovare il nodo da modificare." });
            return;
        }

        const lastOptIdx = path.lastIndexOf(".options");
        const parentPath = lastOptIdx !== -1 ? path.substring(0, lastOptIdx) : "root";
        const parentNode = getNodeFromPath(tree, parentPath);
        const varId = parentNode?.variableId;

        let optionName = explicitOptionName || null;
        if (!optionName) {
            const optionKeyMatch = path.match(/\['(.*?)'\]$/);
            optionName = optionKeyMatch ? optionKeyMatch[1].replace(/\\'/g, "'") : null;
        }

        if (type === 'option') {
            if (varId && optionName) {
                // Standard variable, open the detailed option editor
                const dbVar = dbVariables.find(v => v.id === varId);

                if (!dbVar) {
                    toast({ variant: 'destructive', title: "Errore Variabile", description: `Variabile standard (${varId}) non trovata nel database. Prova a ricaricare.` });
                    return;
                }

                const optionData = dbVar?.possibleValues?.find((opt: VariableOption) => opt.name === optionName);

                if (optionData) {
                    setEditingOptionInfo({ path, option: optionData, varId });
                } else {
                    toast({ variant: 'destructive', title: "Errore Opzione", description: `Dati opzione '${optionName}' non trovati nella variabile '${dbVar.name}'.` });
                }
            } else if (optionName) {
                // Local variable, open the simple name editor
                setEditingNodeInfo({ path, node: { option: optionName }, type: 'question' }); // This is a trick to reuse the dialog, it will be handled as option
            }
            return;
        }

        if (typeof node === 'object' && node !== null && 'question' in node) {
            setEditingNodeInfo({ path, node: node, type: 'question' });
        } else if (typeof node === 'object' && node !== null && 'decision' in node) {
            setEditingNodeInfo({ path, node: node, type: 'decision' });
        } else if (typeof node === 'string') {
            setEditingNodeInfo({ path, node: { decision: node }, type: 'decision' });
        } else if (typeof node === 'object' && node !== null && ('ref' in node || 'subTreeRef' in node)) {
            toast({ variant: "default", title: "Info", description: "I nodi di collegamento non possono essere modificati direttamente. Eliminali e ricreali se necessario." });
            return;
            return;
        } else if (path.includes("#virtual:")) {
            toast({ variant: "default", title: "Sola Lettura", description: "I nodi espansi da un link sono di sola lettura in questa vista." });
            return;
        } else {
            console.error("Node at path is not an editable type or is null:", path, node);
            toast({ variant: "destructive", title: "Errore", description: "Questo tipo di nodo non è modificabile o è nullo." });
            return;
        }
    };

    const handleNodeUpdate = async (path: string, newNodeData: any) => {
        if (!onDataRefresh) return;

        setInternalSaving(true);
        setEditingNodeInfo(null);

        try {
            // Preserve preview data from the current node
            const currentNode = getNodeFromPath(tree, path);
            const nodeDataToSave = {
                ...newNodeData,
                // Preserve SQL preview data if it exists in the current node
                ...(currentNode?.sqlPreviewData && { sqlPreviewData: currentNode.sqlPreviewData }),
                // Preserve SQL preview timestamp if it exists in the current node
                ...(currentNode?.sqlPreviewTimestamp && { sqlPreviewTimestamp: currentNode.sqlPreviewTimestamp }),
                // Preserve Python preview data if it exists in the current node
                ...(currentNode?.pythonPreviewResult && { pythonPreviewResult: currentNode.pythonPreviewResult }),
            };

            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(nodeDataToSave)
            });
            if (!result.success) {
                throw new Error(result.error || "Salvataggio fallito");
            }

            toast({ title: "Albero aggiornato con successo!" });
            onDataRefresh();

        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante l'aggiornamento del nodo", description: error });
        } finally {
            setInternalSaving(false);
        }
    };

    const handleSavePreview = async (path: string, previewData: any) => {
        console.log('[DEBUG] handleSavePreview chiamato:', { path, hasPreviewData: previewData !== null, previewDataType: previewData?.type, hasSqlPreviewData: !!previewData?.sqlPreviewData });

        try {
            // Ottieni il nodo corrente usando l'albero parsato (tree) invece di treeData
            console.log('[DEBUG] Path da cercare:', path);
            const currentNode = getNodeFromPath(tree, path);
            console.log('[DEBUG] Nodo trovato:', currentNode);
            console.log('[DEBUG] Struttura nodo corrente:', JSON.stringify(currentNode, null, 2));
            if (!currentNode) {
                console.error('[DEBUG] Nodo non trovato per il salvataggio dell\'anteprima:', path);
                return;
            }

            // Aggiungi i dati dell'anteprima al nodo (supporta sia Python che SQL)
            const updatedNodeData = {
                ...currentNode
            };

            // Salva i dati dell'anteprima nel campo appropriato
            if (previewData.sqlPreviewData) {
                // SQL preview - salva direttamente i dati (la proprietà sqlPreviewData contiene i dati)
                console.log('[DEBUG] Salvataggio SQL preview data:', { dataLength: previewData.sqlPreviewData?.length });
                updatedNodeData.sqlPreviewData = previewData.sqlPreviewData;
                // Salva anche il timestamp SQL se presente
                if (previewData.sqlPreviewTimestamp) {
                    updatedNodeData.sqlPreviewTimestamp = previewData.sqlPreviewTimestamp;
                }
            } else if (previewData.timestamp && !previewData.type) {
                // SQL preview - formato alternativo con timestamp
                console.log('[DEBUG] Salvataggio SQL preview data (alt):', { dataLength: previewData.sqlPreviewData?.length || previewData.data?.length });
                updatedNodeData.sqlPreviewData = previewData.sqlPreviewData || previewData.data;
                // Salva anche il timestamp SQL se presente
                if (previewData.timestamp) {
                    updatedNodeData.sqlPreviewTimestamp = previewData.timestamp;
                }
            } else {
                // Python preview - salva l'oggetto completo
                console.log('[DEBUG] Salvataggio Python preview data:', { type: previewData?.type, hasData: !!previewData?.data });
                updatedNodeData.pythonPreviewResult = previewData;
            }

            console.log('[DEBUG] Salvataggio anteprima nel nodo:', { path, hasPreviewData: previewData !== null });
            console.log('[DEBUG] Updated node data:', JSON.stringify(updatedNodeData, null, 2));

            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(updatedNodeData)
            });
            if (!result.success) {
                throw new Error(result.error || "Salvataggio anteprima fallito");
            }

            console.log('[DEBUG] Anteprima salvata con successo nel nodo:', path);
            // Aggiorna lo stato locale dell'albero per riflettere immediatamente i cambiamenti
            // Questo è necessario perché il salvataggio nel database non aggiorna automaticamente lo stato locale
            const newTree = _.cloneDeep(tree);
            const nodeToUpdate = getNodeFromPath(newTree, path);
            console.log('[DEBUG] Node to update in local tree:', nodeToUpdate ? 'found' : 'NOT FOUND');
            if (nodeToUpdate) {
                if (previewData.sqlPreviewData) {
                    console.log('[DEBUG] Updating SQL preview in local tree');
                    nodeToUpdate.sqlPreviewData = previewData.sqlPreviewData;
                    if (previewData.sqlPreviewTimestamp) {
                        nodeToUpdate.sqlPreviewTimestamp = previewData.sqlPreviewTimestamp;
                    }
                } else if (previewData.timestamp && !previewData.type) {
                    console.log('[DEBUG] Updating SQL preview (alt) in local tree');
                    nodeToUpdate.sqlPreviewData = previewData.sqlPreviewData || previewData.data;
                    if (previewData.timestamp) {
                        nodeToUpdate.sqlPreviewTimestamp = previewData.timestamp;
                    }
                } else {
                    console.log('[DEBUG] Updating Python preview in local tree');
                    nodeToUpdate.pythonPreviewResult = previewData;
                }
                setTree(newTree);
                console.log('[DEBUG] Local tree updated with preview data');
            }

            // Non chiamare onDataRefresh() qui perché causerebbe la chiusura della dialog
            // L'anteprima è già nello stato locale e verrà persistita quando l'utente salva le modifiche al nodo

            // Forza il refresh dei widget nel dashboard invalidando la cache
            // Questo assicura che i nuovi widget con anteprime appaiano nella lista
            if (typeof window !== 'undefined') {
                // Emetti un evento custom che può essere ascoltato dal widget-list
                window.dispatchEvent(new CustomEvent('preview-saved', { detail: { treeId: treeData.id, nodeId: getNodeFromPath(tree, path)?.id } }));
            }
            // Non mostrare toast per non disturbare l'utente durante l'anteprima

        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            console.error('[DEBUG] Errore durante il salvataggio dell\'anteprima:', error);
            toast({ variant: 'destructive', title: "Errore durante il salvataggio dell'anteprima", description: error });
        }
    };

    const handleSaveOptionEdit = async (newOption: VariableOption) => {
        if (!editingOptionInfo || !onDataRefresh) return;

        const { varId, option: oldOption } = editingOptionInfo;
        setEditingOptionInfo(null);
        setInternalSaving(true);

        const dbVar = dbVariables.find(v => v.id === varId);
        if (!dbVar) {
            setInternalSaving(false);
            return;
        }

        const newPossibleValues = (dbVar.possibleValues || []).map(opt =>
            opt.id === oldOption.id ? newOption : opt
        );

        try {
            const result = await updateVariableAction(treeData.id, varId, { possibleValues: newPossibleValues });
            if (result.success) {
                toast({ title: "Successo!", description: "Opzione aggiornata. L'albero si ricaricherà per riflettere le modifiche." });
                onDataRefresh();
                fetchExternalData();
            } else {
                throw new Error(result.error || "Aggiornamento della variabile fallito");
            }
        } catch (e) {
            toast({ variant: 'destructive', title: "Errore di Propagazione", description: e instanceof Error ? e.message : 'Errore Sconosciuto' });
        } finally {
            setInternalSaving(false);
        }
    };


    const handleSaveNewNode = async (path: string, optionName: string, newNode: any) => {
        if (!tree || !onDataRefresh) return;

        setInternalSaving(true);
        setAddingNodeInfo(null);

        const parentNode = getNodeFromPath(tree, path);

        if (typeof parentNode === 'string' || (typeof parentNode === 'object' && parentNode !== null && 'decision' in parentNode && !('question' in parentNode))) {
            toast({
                variant: 'destructive',
                title: "Operazione non Consentita",
                description: "Non è possibile aggiungere opzioni a un nodo di decisione finale."
            });
            setInternalSaving(false);
            return;
        }

        if (parentNode?.options?.[optionName]) {
            toast({ variant: 'destructive', title: "Errore", description: "Un'opzione con questo nome esiste già." });
            setInternalSaving(false);
            return;
        }

        try {
            // If adding to a standard variable, update the central variable first
            if (parentNode?.variableId) {
                const dbVar = dbVariables.find(v => v.id === parentNode.variableId);
                if (dbVar) {
                    parentNode.possibleValues = dbVar.possibleValues;

                    const newOptionToAdd: VariableOption = {
                        id: nanoid(8),
                        name: optionName,
                        value: (dbVar.possibleValues || []).length,
                        abbreviation: optionName.substring(0, 3).toUpperCase(),
                    };
                    const newPossibleValues = [...(dbVar.possibleValues || []), newOptionToAdd];
                    const varUpdateResult = await updateVariableAction(treeData.id, parentNode.variableId, { possibleValues: newPossibleValues });
                    if (!varUpdateResult.success) {
                        throw new Error(varUpdateResult.error || "Aggiornamento della variabile standard fallito");
                    }
                    await fetchExternalData(); // Refresh db variables state
                } else {
                    throw new Error("Variabile standard non trovata nel database");
                }
            }


            const newPath = `${path}.options['${optionName.replace(/'/g, "\\'")}']`;
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: newPath,
                nodeData: JSON.stringify(newNode)
            });

            if (!result.success) {
                throw new Error(result.error || "Creazione del nodo fallita");
            }

            toast({ title: "Nodo aggiunto con successo!" });
            onDataRefresh();

        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante l'aggiunta del nodo", description: error });
        } finally {
            setInternalSaving(false);
        }
    };

    const handleSaveChildNode = async (path: string, newNode: any) => {
        if (!tree || !onDataRefresh) return;

        setInternalSaving(true);
        setAddingChildNodeInfo(null);

        const currentNode = getNodeFromPath(tree, path);
        let updatedNodeData;

        if (Array.isArray(currentNode)) {
            updatedNodeData = [...currentNode, newNode];
        } else if (currentNode && typeof currentNode === 'object' && (currentNode.question || currentNode.decision || currentNode.ref || currentNode.subTreeRef)) {
            updatedNodeData = [currentNode, newNode];
        } else {
            // If the current node is null, undefined, or an empty object, we replace it with the new node
            updatedNodeData = newNode;
        }

        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(updatedNodeData)
            });

            if (!result.success) {
                throw new Error(result.error || "Aggiunta del nodo fallita");
            }

            toast({ title: "Nodo aggiunto con successo!" });
            onDataRefresh();

        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante l'aggiunta del nodo", description: error });
        } finally {
            setInternalSaving(false);
        }
    };

    const handleSaveLink = useCallback(async (path: string, option: string, targetNodeId: string) => {
        if (!tree || !onDataRefresh) return;

        setLinkingNodeInfo(null);
        setInternalSaving(true);

        const newNode = { ref: targetNodeId, id: nanoid(8) };
        const currentNode = getNodeFromPath(tree, path);
        let updatedNodeData;

        if (Array.isArray(currentNode)) {
            updatedNodeData = [...currentNode, newNode];
        } else if (currentNode && typeof currentNode === 'object' && (currentNode.question || currentNode.decision || currentNode.ref || currentNode.subTreeRef)) {
            updatedNodeData = [currentNode, newNode];
        } else {
            updatedNodeData = newNode;
        }

        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path, // The path is the option node itself
                nodeData: JSON.stringify(updatedNodeData)
            });
            if (!result.success) {
                throw new Error(result.error || "Creazione del link fallita");
            }
            toast({ title: "Collegamento creato!" });
            onDataRefresh();
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante la creazione del link", description: error });
        } finally {
            setInternalSaving(false);
        }

    }, [onDataRefresh, toast, treeData.id, tree]);

    const handleSaveSubTreeLink = useCallback(async (path: string, option: string, targetTreeId: string) => {
        if (!tree || !onDataRefresh) return;

        setLinkingNodeInfo(null);
        setInternalSaving(true);

        const newNode = { subTreeRef: targetTreeId, id: nanoid(8) };
        const currentNode = getNodeFromPath(tree, path);
        let updatedNodeData;

        if (Array.isArray(currentNode)) {
            updatedNodeData = [...currentNode, newNode];
        } else if (currentNode && typeof currentNode === 'object' && (currentNode.question || currentNode.decision || currentNode.ref || currentNode.subTreeRef)) {
            updatedNodeData = [currentNode, newNode];
        } else {
            updatedNodeData = newNode;
        }

        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(updatedNodeData)
            });
            if (!result.success) {
                throw new Error(result.error || "Creazione del link al sotto-albero fallita.");
            }
            toast({ title: "Collegamento a sotto-albero creato!" });
            onDataRefresh();
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante la creazione del link", description: error });
        } finally {
            setInternalSaving(false);
        }
    }, [onDataRefresh, toast, treeData.id, tree]);


    const handleRemoveLink = async (path: string) => {
        if (!onDataRefresh) return;

        setLinkingNodeInfo(null);
        setInternalSaving(true);

        const newNode = { decision: 'Percorso non definito', id: nanoid(8) };

        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(newNode)
            });
            if (!result.success) {
                throw new Error(result.error || "Rimozione del link fallita");
            }
            toast({ title: "Collegamento rimosso!" });
            onDataRefresh();
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante la rimozione del link", description: error });
        } finally {
            setInternalSaving(false);
        }
    };


    const handleDeleteNode = (path: string) => {
        if (!tree) return;

        if (path === 'root') {
            toast({ variant: "destructive", title: "Operazione non consentita", description: "Non è possibile eliminare il nodo radice." });
            return;
        }

        const lastDotIndex = path.lastIndexOf('.options');
        const parentPath = path.substring(0, lastDotIndex);

        if (!parentPath) {
            toast({ variant: "destructive", title: "Errore", description: "Impossibile determinare il nodo genitore da eliminare." });
            return;
        }

        const parentNode = getNodeFromPath(tree, parentPath);
        const childNode = getNodeFromPath(tree, path);

        const varId = parentNode?.variableId;

        let nodesToDelete: string[] = [];
        const findChildrenText = (node: any) => {
            if (typeof node === 'string') {
                nodesToDelete.push(`Decision: ${node}`);
            } else if (node.decision) {
                nodesToDelete.push(`Decision: ${node.decision}`);
            } else if (node.question) {
                nodesToDelete.push(`Question: ${node.question}`);
                if (node.options) {
                    Object.values(node.options).forEach(findChildrenText);
                }
            }
        };

        if (childNode) {
            findChildrenText(childNode);
        }

        setDeletingNodeInfo({
            path,
            impactReport: {
                isStandardVariable: !!varId,
                nodesToDelete: nodesToDelete,
            }
        });
    };

    const handleConfirmDelete = async () => {
        if (!tree || !deletingNodeInfo || !onDataRefresh) return;

        const { path } = deletingNodeInfo;

        setInternalSaving(true);

        try {
            // Check for array index pattern: ...[index]
            const arrayIndexMatch = path.match(/\[(\d+)\]$/);

            if (arrayIndexMatch) {
                // Deleting an item from an array (multi-node scenario)
                const index = parseInt(arrayIndexMatch[1]);
                const parentArrayPath = path.substring(0, path.lastIndexOf('['));
                const parentArray = getNodeFromPath(tree, parentArrayPath);

                if (!Array.isArray(parentArray)) {
                    // Fallback for weird edge cases where path looks like array but node isn't
                    // e.g. if key name is numbers? Unlikely with ['...'] format for keys
                    throw new Error("Struttura dati imprevista: atteso array.");
                }

                const newArray = [...parentArray];
                newArray.splice(index, 1);

                // If the array becomes empty or has only 1 item, we might want to simplify?
                // For now, let's keep it as an array to maintain structure stability.
                // If it becomes empty, it's an empty option path.

                const result = await updateTreeNodeAction({
                    treeId: treeData.id,
                    nodePath: parentArrayPath,
                    nodeData: JSON.stringify(newArray)
                });

                if (!result.success) {
                    throw new Error(result.error || "Eliminazione del nodo fallita");
                }
                toast({ title: "Successo!", description: "Il nodo è stato eliminato." });

            } else {
                // Standard single node deletion logic
                const lastDotIndex = path.lastIndexOf('.options');
                const parentPath = path.substring(0, lastDotIndex);
                const optionKeyMatch = path.match(/\['(.*?)'\]$/);
                const optionKey = optionKeyMatch ? optionKeyMatch[1].replace(/\\'/g, "'") : null;

                if (!parentPath || !optionKey) {
                    throw new Error('Impossibile determinare il percorso del nodo da eliminare.');
                }

                const parentNode = getNodeFromPath(tree, parentPath);
                const varId = parentNode?.variableId;

                if (varId) {
                    const dbVar = dbVariables.find(v => v.id === varId);
                    if (!dbVar) throw new Error("Variabile standard non trovata nel database.");
                    const newOptions = (dbVar.possibleValues || []).filter(opt => opt.name !== optionKey);
                    const result = await updateVariableAction(treeData.id, varId, { possibleValues: newOptions });
                    if (result.success) {
                        toast({ title: "Successo!", description: "Opzione eliminata e propagata a tutti gli alberi collegati." });
                    } else {
                        throw new Error(result.error || "Aggiornamento della variabile fallito");
                    }
                } else {
                    const result = await updateTreeNodeAction({
                        treeId: treeData.id,
                        nodePath: path,
                        nodeData: JSON.stringify(null)
                    });
                    if (!result.success) {
                        throw new Error(result.error || "Eliminazione del nodo fallita");
                    }
                    toast({ title: "Successo!", description: "Il nodo è stato eliminato." });
                }
            }

            onDataRefresh();
            fetchExternalData();
        } catch (e) {
            toast({ variant: 'destructive', title: "Errore di Eliminazione", description: e instanceof Error ? e.message : 'Errore Sconosciuto' });
        } finally {
            setInternalSaving(false);
            setDeletingNodeInfo(null);
        }
    };

    const downloadJson = () => {
        if (!tree) return;
        try {
            const jsonString = JSON.stringify(tree, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${treeData.name || 'albero'}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast({ title: 'Download del file JSON avviato.' });
        } catch (err) {
            toast({
                variant: 'destructive',
                title: 'Download fallito',
                description: 'Impossibile preparare il file JSON per il download.',
            });
        }
    };


    const connectorData = useMemo(() => {
        return layout.positionedNodes.map(node => {
            if (!node.parent) return null;

            const parent = node.parent;
            let startX = parent.x + parent.width / 2;
            let startY = parent.y + parent.height;

            let endX = node.x + node.width / 2;
            let endY = node.y;

            const isLink = typeof node.node === 'object' && 'ref' in node.node;
            const isSubTreeLink = typeof node.node === 'object' && 'subTreeRef' in node.node;

            let targetName = "Unknown";
            let isBroken = false;

            if (isLink) {
                const refId = (node.node as { ref: string }).ref;
                // Try to find the target node - use multiple search strategies
                let targetNode = layout.positionedNodes.find(n => n.id === refId);

                // If not found by layout ID, try searching by the node's own ID property
                if (!targetNode) {
                    targetNode = layout.positionedNodes.find(n => {
                        const nodeObj = n.node as any;
                        return nodeObj && typeof nodeObj === 'object' && nodeObj.id === refId;
                    });
                }

                if (targetNode) {
                    endX = targetNode.x + targetNode.width / 2;
                    endY = targetNode.y;

                    // Get target name for label
                    const tNode = (typeof targetNode.node === 'object' && 'node' in targetNode.node) ? (targetNode.node as any).node : targetNode.node;
                    if (typeof tNode === 'string') targetName = tNode;
                    else if ('decision' in tNode) targetName = (tNode as any).decision;
                    else if ('question' in tNode) targetName = (tNode as any).question || "Question";
                } else {
                    // Target not found! Calculate endpoint as if there was a real child node
                    // Use the same spacing that would be used for a normal parent-child connection
                    targetName = `Link Interrotto: ${refId}`;
                    endX = startX; // Keep centered below parent
                    // Position as if there was a child node at the standard distance
                    // V_SPACING is the vertical gap, NODE_HEIGHT is added to reach the top of where the child would be
                    endY = startY + 80 + 100; // V_SPACING (80) + NODE_HEIGHT (100) = 180
                    isBroken = true;
                }
            }

            const c1X = startX;
            let c1Y = startY + V_SPACING / 2;
            const c2X = endX;
            let c2Y = endY - V_SPACING / 2;

            if (isLink) {
                const distY = endY - startY;
                const controlDist = Math.max(V_SPACING / 2, Math.abs(distY) / 2);
                c1Y = startY + controlDist;
                c2Y = endY - controlDist;
            }

            const pathD = `M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}`;

            // Calculate midpoint
            const midX = 0.125 * startX + 0.375 * c1X + 0.375 * c2X + 0.125 * endX;
            const midY = 0.125 * startY + 0.375 * c1Y + 0.375 * c2Y + 0.125 * endY;

            return {
                id: `${node.id}-${parent.id}-connector`,
                pathD,
                midX, midY,
                startX, startY,
                endX, endY,
                isLink,
                isSubTreeLink,
                targetName,
                isBroken,
                node
            };
        }).filter((n): n is NonNullable<typeof n> => n !== null);
    }, [layout.positionedNodes]);

    // Returns only pipeline tables from ancestor nodes of the given path
    // Each table includes its own ancestors as pipelineDependencies for cascading execution
    const getAncestorInputTables = useMemo(() => {
        return (currentPath: string): { name: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: 'table' | 'variable' | 'chart', pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[], sqlExportTargetTableName?: string, sqlExportTargetConnectorId?: string, sqlExportSourceTables?: string[] }[] => {
            // First, collect all ancestors with their paths for ordering
            const ancestorItems: { path: string, name: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: string, pipelineDependencies?: any[], sqlExportTargetTableName?: string, sqlExportTargetConnectorId?: string, sqlExportSourceTables?: string[] }[] = [];

            // Helper to recursively resolve dependencies
            const resolveDependencies = (node: any, visited: Set<string> = new Set()): any[] => {
                const deps: any[] = [];
                const pipelines = [...(node.pythonSelectedPipelines || []), ...(node.sqlSelectedPipelines || [])];

                pipelines.forEach(pName => {
                    if (visited.has(pName)) return;

                    const sourceItem = flatTree.find((item: any) => {
                        const n = item.node;
                        return n && typeof n === 'object' &&
                            ((n.pythonResultName === pName && n.pythonCode) || (n.sqlResultName === pName));
                    });

                    if (sourceItem) {
                        const sn = sourceItem.node;
                        const newVisited = new Set(visited);
                        newVisited.add(pName);

                        deps.push({
                            tableName: pName,
                            connectorId: sn.pythonResultName === pName ? sn.pythonConnectorId : sn.sqlConnectorId,
                            query: sn.sqlResultName === pName ? sn.sqlQuery : undefined,
                            isPython: !!(sn.pythonResultName === pName),
                            pythonCode: sn.pythonResultName === pName ? sn.pythonCode : undefined,
                            pythonOutputType: sn.pythonOutputType,
                            pipelineDependencies: resolveDependencies(sn, newVisited)
                        });
                    }
                });
                return deps;
            };

            console.log(`[ANCESTOR DEBUG] Looking for ancestors of: "${currentPath}"`);

            flatTree.forEach((item: any) => {
                const actualNode = item.node;
                if (actualNode && typeof actualNode === 'object') {
                    const nodePath = item.path;
                    const startsWithPath = currentPath.startsWith(nodePath);
                    const charAfter = currentPath.charAt(nodePath.length);
                    const isAncestor =
                        currentPath !== nodePath &&
                        startsWithPath &&
                        charAfter === '.';

                    // Log for nodes with SQL or Python results
                    if (actualNode.sqlResultName || actualNode.pythonResultName) {
                        console.log(`[ANCESTOR DEBUG] Checking "${actualNode.sqlResultName || actualNode.pythonResultName}" at "${nodePath}"`);
                        console.log(`  - currentPath.startsWith(nodePath): ${startsWithPath}`);
                        console.log(`  - charAfter: "${charAfter}" (should be ".")`);
                        console.log(`  - isAncestor: ${isAncestor}`);
                    }

                    if (isAncestor) {
                        // Check for SQL result (name is enough to list it, query might be empty)
                        if (actualNode.sqlResultName) {
                            console.log(`[ANCESTOR] Found SQL result "${actualNode.sqlResultName}" at "${nodePath}"`);
                            ancestorItems.push({
                                path: nodePath,
                                name: actualNode.sqlResultName,
                                connectorId: actualNode.sqlConnectorId,
                                sqlQuery: actualNode.sqlQuery, // Can be undefined/empty
                                isPython: false,
                                pythonOutputType: undefined,
                                pipelineDependencies: resolveDependencies(actualNode),
                                sqlExportTargetTableName: actualNode.sqlExportAction?.targetTableName || actualNode.sqlExportTargetTableName,
                                sqlExportTargetConnectorId: actualNode.sqlExportAction?.targetConnectorId || actualNode.sqlExportTargetConnectorId,
                                sqlExportSourceTables: actualNode.sqlExportAction?.sourceTables || actualNode.sqlExportSourceTables
                            });
                        }

                        // Check for Python result (independently)
                        if (actualNode.pythonResultName && actualNode.pythonCode) {
                            console.log(`[ANCESTOR] Found Python result "${actualNode.pythonResultName}" at "${nodePath}"`);
                            ancestorItems.push({
                                path: nodePath,
                                name: actualNode.pythonResultName,
                                connectorId: actualNode.pythonConnectorId,
                                sqlQuery: undefined,
                                isPython: true,
                                pythonCode: actualNode.pythonCode,
                                pythonOutputType: actualNode.pythonOutputType,
                                pipelineDependencies: resolveDependencies(actualNode),
                                sqlExportTargetTableName: actualNode.sqlExportAction?.targetTableName || actualNode.sqlExportTargetTableName,
                                sqlExportTargetConnectorId: actualNode.sqlExportAction?.targetConnectorId || actualNode.sqlExportTargetConnectorId,
                                sqlExportSourceTables: actualNode.sqlExportAction?.sourceTables || actualNode.sqlExportSourceTables
                            });
                        }
                    }
                }
            });

            // Sort by path length (shortest first = highest in tree = should execute first)
            ancestorItems.sort((a, b) => a.path.length - b.path.length);

            // Build result with pipelineDependencies for each table
            const tables: { name: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: 'table' | 'variable' | 'chart', pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[], sqlExportTargetTableName?: string, sqlExportTargetConnectorId?: string, sqlExportSourceTables?: string[] }[] = [];

            for (let i = 0; i < ancestorItems.length; i++) {
                const item = ancestorItems[i];
                // pipelineDependencies are all ancestors that come BEFORE this one
                // Use the ALREADY PROCESSED 'tables' array to ensure we get the fully populated dependencies (recursive)
                const pipelineDeps = tables // Use the already built tables array!
                    .filter(t => t.name !== item.name) // Safety check
                    .filter(t => t.sqlQuery || (t.isPython && t.pythonCode)) // Filter only valid execution nodes
                    .map(t => ({
                        tableName: t.name,
                        query: t.sqlQuery,
                        isPython: t.isPython,
                        pythonCode: t.pythonCode,
                        connectorId: t.connectorId,
                        pipelineDependencies: t.pipelineDependencies // PRESERVE NESTED DEPS
                    }));

                tables.push({
                    name: item.name,
                    connectorId: item.connectorId,
                    sqlQuery: item.sqlQuery,
                    isPython: item.isPython,
                    pythonCode: item.pythonCode,
                    pythonOutputType: item.pythonOutputType as any,
                    pipelineDependencies: pipelineDeps.length > 0 ? pipelineDeps : undefined,
                    // Map Export Config
                    sqlExportTargetTableName: item.sqlExportTargetTableName,
                    sqlExportTargetConnectorId: item.sqlExportTargetConnectorId,
                    sqlExportSourceTables: item.sqlExportSourceTables
                });

                console.log(`[ANCESTOR] "${item.name}" (${item.isPython ? 'Python' : 'SQL'}) has ${pipelineDeps.length} pipeline dependencies:`, pipelineDeps.map(d => d.tableName));
            }

            console.log('DEBUG: Ancestor Tables for path', currentPath, ':', tables.map(t => `${t.name} (${t.isPython ? 'Python' : 'SQL'})`));
            return tables;
        };
    }, [flatTree]);

    const getAncestorMedia = useMemo(() => {
        return (currentPath: string): any[] => {
            const ancestorMedia: any[] = [];

            flatTree.forEach((item: any) => {
                const actualNode = item.node;
                if (actualNode && typeof actualNode === 'object' && actualNode.media && Array.isArray(actualNode.media)) {
                    const nodePath = item.path;
                    const isAncestor =
                        currentPath !== nodePath &&
                        currentPath.startsWith(nodePath) &&
                        currentPath.charAt(nodePath.length) === '.';

                    if (isAncestor) {
                        ancestorMedia.push(...actualNode.media);
                    }
                }
            });

            return ancestorMedia;
        };
    }, [flatTree]);

    const getAncestorLinks = useMemo(() => {
        return (currentPath: string): LinkItem[] => {
            const ancestorLinks: LinkItem[] = [];
            flatTree.forEach((item: any) => {
                const actualNode = item.node;
                if (actualNode && typeof actualNode === 'object' && actualNode.links && Array.isArray(actualNode.links)) {
                    const nodePath = item.path;
                    const isAncestor = currentPath !== nodePath && currentPath.startsWith(nodePath) && currentPath.charAt(nodePath.length) === '.';
                    if (isAncestor) ancestorLinks.push(...actualNode.links);
                }
            });
            return ancestorLinks;
        };
    }, [flatTree]);

    const getAncestorTriggers = useMemo(() => {
        return (currentPath: string): TriggerItem[] => {
            const ancestorTriggers: TriggerItem[] = [];
            flatTree.forEach((item: any) => {
                const actualNode = item.node;
                if (actualNode && typeof actualNode === 'object' && actualNode.triggers && Array.isArray(actualNode.triggers)) {
                    const nodePath = item.path;
                    const isAncestor = currentPath !== nodePath && currentPath.startsWith(nodePath) && currentPath.charAt(nodePath.length) === '.';
                    if (isAncestor) ancestorTriggers.push(...actualNode.triggers);
                }
            });
            return ancestorTriggers;
        };
    }, [flatTree]);

    const getLinkedNodesTables = useMemo(() => {
        return (currentPath: string): { name: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: 'table' | 'variable' | 'chart', pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[], sqlExportTargetTableName?: string, sqlExportTargetConnectorId?: string, sqlExportSourceTables?: string[] }[] => {
            const linkedTables: { name: string, connectorId?: string, sqlQuery?: string, isPython?: boolean, pythonCode?: string, pythonOutputType?: 'table' | 'variable' | 'chart', pipelineDependencies?: { tableName: string; query?: string; isPython?: boolean; pythonCode?: string; connectorId?: string }[], sqlExportTargetTableName?: string, sqlExportTargetConnectorId?: string, sqlExportSourceTables?: string[] }[] = [];

            // Helper to recursively resolve dependencies
            const resolveDependencies = (node: any, visited: Set<string> = new Set()): any[] => {
                const deps: any[] = [];
                const pipelines = [...(node.pythonSelectedPipelines || []), ...(node.sqlSelectedPipelines || [])];

                pipelines.forEach(pName => {
                    if (visited.has(pName)) return;

                    // Find the node in the flat tree that produces this result
                    const sourceItem = flatTree.find((item: any) => {
                        const n = item.node;
                        return n && typeof n === 'object' &&
                            ((n.pythonResultName === pName && n.pythonCode) || (n.sqlResultName === pName));
                    });

                    if (sourceItem) {
                        const sn = sourceItem.node;
                        const newVisited = new Set(visited);
                        newVisited.add(pName);

                        deps.push({
                            tableName: pName,
                            connectorId: sn.pythonResultName === pName ? sn.pythonConnectorId : sn.sqlConnectorId,
                            query: sn.sqlResultName === pName ? sn.sqlQuery : undefined,
                            isPython: !!(sn.pythonResultName === pName),
                            pythonCode: sn.pythonResultName === pName ? sn.pythonCode : undefined,
                            pythonOutputType: sn.pythonOutputType,
                            pipelineDependencies: resolveDependencies(sn, newVisited)
                        });
                    }
                });
                return deps;
            };

            console.log(`[LINKED NODES DEBUG] Looking for linked nodes from path: "${currentPath}"`);

            // Find all link nodes ({ ref: string }) in the flat tree
            flatTree.forEach((item: any) => {
                const actualNode = item.node;

                // Check if this is a link node with a ref property
                if (actualNode && typeof actualNode === 'object' && 'ref' in actualNode) {
                    const refId = actualNode.ref;
                    console.log(`[LINKED NODES DEBUG] Found link node with ref: "${refId}" at path: "${item.path}"`);

                    // Find the target node by ID to check if it's the current node we're editing
                    const targetItem = flatTree.find((t: any) => {
                        const tNode = t.node;
                        return tNode && typeof tNode === 'object' && tNode.id === refId;
                    });

                    if (targetItem && targetItem.path === currentPath) {
                        // This link points to the current node! Extract tables from the parent (question) node of this link
                        console.log(`[LINKED NODES DEBUG] Link at "${item.path}" points to current node! Extracting tables from parent.`);

                        // Navigate up the path to find the parent question node
                        const pathParts = item.path.split('.options');
                        if (pathParts.length >= 2) {
                            const parentQuestionPath = pathParts.slice(0, -1).join('.options');
                            console.log(`[LINKED NODES DEBUG] Looking for parent question at path: "${parentQuestionPath}"`);

                            // Find the parent question node
                            const parentItem = flatTree.find((t: any) => t.path === parentQuestionPath);

                            if (parentItem) {
                                const parentNode = parentItem.node;
                                console.log(`[LINKED NODES DEBUG] Found parent node at "${parentQuestionPath}"`);

                                // Extract SQL result from parent node
                                if (parentNode.sqlResultName) {
                                    console.log(`[LINKED NODES DEBUG] Found SQL table: "${parentNode.sqlResultName}"`);
                                    linkedTables.push({
                                        name: parentNode.sqlResultName,
                                        connectorId: parentNode.sqlConnectorId,
                                        sqlQuery: parentNode.sqlQuery,
                                        isPython: false,
                                        pipelineDependencies: resolveDependencies(parentNode),
                                        sqlExportTargetTableName: parentNode.sqlExportAction?.targetTableName || parentNode.sqlExportTargetTableName,
                                        sqlExportTargetConnectorId: parentNode.sqlExportAction?.targetConnectorId || parentNode.sqlExportTargetConnectorId,
                                        sqlExportSourceTables: parentNode.sqlExportAction?.sourceTables || parentNode.sqlExportSourceTables
                                    });
                                }

                                // Extract Python result from parent node
                                if (parentNode.pythonResultName && parentNode.pythonCode) {
                                    console.log(`[LINKED NODES DEBUG] Found Python table: "${parentNode.pythonResultName}"`);
                                    linkedTables.push({
                                        name: parentNode.pythonResultName,
                                        connectorId: parentNode.pythonConnectorId,
                                        isPython: true,
                                        pythonCode: parentNode.pythonCode,
                                        pythonOutputType: parentNode.pythonOutputType,
                                        pipelineDependencies: resolveDependencies(parentNode),
                                        sqlExportTargetTableName: parentNode.sqlExportAction?.targetTableName || parentNode.sqlExportTargetTableName,
                                        sqlExportTargetConnectorId: parentNode.sqlExportAction?.targetConnectorId || parentNode.sqlExportTargetConnectorId,
                                        sqlExportSourceTables: parentNode.sqlExportAction?.sourceTables || parentNode.sqlExportSourceTables
                                    });
                                }
                            } else {
                                console.log(`[LINKED NODES DEBUG] Parent node not found at path "${parentQuestionPath}"`);
                            }
                        }
                    }
                }
            });

            console.log(`[LINKED NODES DEBUG] Total linked tables found: ${linkedTables.length}`, linkedTables.map(t => t.name));
            return linkedTables;
        };
    }, [flatTree]);

    if (!tree) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><AlertCircle className="text-destructive" /> Albero Non Valido</CardTitle>
                    <CardDescription>Il JSON per l'albero decisionale è malformato e non può essere visualizzato.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card className="h-[700px] flex flex-col">
            <CardContent className="flex-grow p-0 relative overflow-hidden bg-slate-200 dark:bg-zinc-950">
                <TooltipProvider>
                    <div className='absolute top-4 right-4 z-10 flex items-center gap-2 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700'>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white dark:hover:bg-zinc-700" onClick={() => setZoomReset(prev => prev + 1)} disabled={isSaving}>
                                    <Expand className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Adatta allo Schermo</p></TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white dark:hover:bg-zinc-700" onClick={downloadJson} disabled={isSaving}>
                                    <Download className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Download JSON</p></TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
                <TooltipProvider>
                    <PanZoomContainer
                        contentWidth={layout.contentWidth}
                        contentHeight={layout.contentHeight}
                        reset={zoomReset}
                    >
                        <div className="visual-tree-container" style={{ width: layout.contentWidth, height: layout.contentHeight }} onClick={() => setSelectedLinkId(null)}>
                            <svg className="connector-svg">
                                {connectorData.map((c, idx) => {
                                    const isSecondary = c.isLink || c.isSubTreeLink;
                                    const strokeColor = selectedLinkId === c.id ? '#6366f1' : (c.isBroken ? '#ef4444' : (isSecondary ? '#f59e0b' : '#a78bfa')); // Amber-500 for secondary, Violet-400 for direct

                                    return (
                                        <g key={`${c.id}-${idx}`} onClick={(e) => { e.stopPropagation(); setSelectedLinkId(c.id); }} className="cursor-pointer" style={{ pointerEvents: 'auto' }}>
                                            <path
                                                d={c.pathD}
                                                className={cn('connector-path transition-all duration-300', { 'is-link': isSecondary, 'is-broken': c.isBroken })}
                                                style={{
                                                    stroke: strokeColor,
                                                    strokeWidth: 2,
                                                    strokeDasharray: c.isBroken ? '8 4' : '6 4',
                                                    fill: 'none',
                                                    filter: selectedLinkId === c.id ? 'drop-shadow(0 0 2px rgba(99, 102, 241, 0.5))' : undefined
                                                }}
                                            />
                                            <circle cx={c.startX} cy={c.startY} r="4" fill={strokeColor} />
                                            <circle cx={c.endX} cy={c.endY} r="4" fill={strokeColor} />
                                            <path d={c.pathD} stroke="transparent" strokeWidth="30" fill="none" />
                                        </g>
                                    );
                                })}
                            </svg>

                            {layout.positionedNodes.map((item, idx) => {
                                const { node, path, x, y, width, height, type } = item;

                                // Hide link nodes as they are rendered as connectors with labels
                                if (type === 'link') return null;

                                const actualNode = (typeof node === 'object' && node !== null && 'node' in node) ? (node as any).node : node;
                                // Unique key using path and index to prevent collision
                                const itemKey = `${item.id}-${path}-${idx}`;

                                let text: string;
                                const nodeAsQuestion = actualNode as DecisionNode;
                                const nodeAsLeaf = actualNode as DecisionLeaf;
                                const nodeAsOption = node as { option: string, id: string, variableId?: string, optionId?: string };


                                switch (type) {
                                    case 'question':
                                        const nodeAsQ = actualNode as DecisionNode;
                                        text = (actualNode && typeof actualNode === 'object' && 'question' in actualNode) ? (nodeAsQ.question || 'Domanda non valida') : 'Domanda non valida';
                                        break;
                                    case 'decision':
                                        text = typeof actualNode === 'string' ? actualNode : (actualNode && typeof actualNode === 'object' && 'decision' in actualNode ? (actualNode as DecisionLeaf).decision : 'Decisione non valida');
                                        break;
                                    case 'option':
                                        text = nodeAsOption.option;
                                        break;
                                    case 'sub-tree-link':
                                        const subTreeId = (actualNode && typeof actualNode === 'object' && 'subTreeRef' in actualNode) ? (actualNode as { subTreeRef: string }).subTreeRef : null;
                                        const subTreeInfo = subTreeId ? allTrees.find(t => t.id === subTreeId) : null;
                                        text = subTreeId ? `Sotto-Albero: ${subTreeInfo?.name || subTreeId}` : 'Sotto-Albero non valido';
                                        break;
                                    default:
                                        text = 'Nodo non valido';
                                }

                                const isUndefinedPath = type === 'decision' && text === 'Percorso non definito';
                                const variableId = type === 'question' ? nodeAsQuestion.variableId : (type === 'option' ? nodeAsOption.variableId : undefined);
                                const mediaItems = (type === 'question' || type === 'decision' || type === 'option') && typeof actualNode !== 'string' && actualNode !== null && 'media' in actualNode && Array.isArray(actualNode.media) ? actualNode.media : [];
                                const linkItems = (type === 'question' || type === 'decision' || type === 'option') && typeof actualNode !== 'string' && actualNode !== null && 'links' in actualNode && Array.isArray(actualNode.links) ? actualNode.links : [];
                                const triggerItems = (type === 'question' || type === 'decision' || type === 'option') && typeof actualNode !== 'string' && actualNode !== null && 'triggers' in actualNode && Array.isArray(actualNode.triggers) ? actualNode.triggers : [];

                                const isInternalLink = type === 'decision' && typeof actualNode === 'object' && actualNode !== null && 'ref' in actualNode;
                                const isSubTree = type === 'sub-tree-link';

                                return (
                                    <div
                                        key={itemKey}
                                        className={cn(`tree-node-wrapper group is-${type} flex flex-col`, { 'is-undefined-path': isUndefinedPath, 'is-link': isInternalLink || isSubTree })}
                                        style={{ left: x, top: y, width: width, height: height }}
                                    >
                                        <div className="relative w-full h-full bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center p-3 gap-3 overflow-hidden transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-700">

                                            <div className={cn("flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                                                type === 'question' ? (path === 'root' ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400") :
                                                    type === 'sub-tree-link' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                                        type === 'decision' ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" :
                                                            "bg-slate-50 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500"
                                            )}>
                                                {(() => {
                                                    if (type === 'question') return path === 'root' ? <Play className="h-5 w-5 fill-current" /> : <GitBranch className="h-5 w-5" />;
                                                    if (type === 'decision') return <Flag className="h-5 w-5" />;
                                                    if (type === 'sub-tree-link') return <LinkIcon className="h-5 w-5" />;
                                                    if (type === 'option') return <Check className="h-4 w-4" />;
                                                    return <AlertCircle className="h-5 w-5" />;
                                                })()}
                                            </div>

                                            <div className="flex-grow min-w-0 flex flex-col justify-center">
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5 opacity-70">
                                                    {type === 'question' ? (path === 'root' ? 'Start' : 'Switch') :
                                                        type === 'decision' ? (isSubTree ? 'Sub-Tree' : 'End') :
                                                            'Condition'}
                                                </div>
                                                <div className={cn("text-sm font-medium text-foreground leading-snug", type === 'option' ? "line-clamp-2" : "line-clamp-3")} title={text}>
                                                    {text}
                                                </div>

                                                {/* Mini indicators row */}
                                                <div className="flex items-center gap-1 mt-1">
                                                    {item.node && typeof item.node === 'object' && (('sqlConnectorId' in item.node && (item.node as any).sqlConnectorId) || ('selectedPipelines' in item.node && (item.node as any).selectedPipelines?.length > 0)) && (
                                                        <Database className="h-3 w-3 text-blue-600" />
                                                    )}
                                                    {actualNode && typeof actualNode === 'object' && (actualNode as any).emailAction?.enabled && (
                                                        <Mail className="h-3 w-3 text-sky-500" />
                                                    )}
                                                    {actualNode && typeof actualNode === 'object' && 'pythonCode' in actualNode && (actualNode as any).pythonCode && (
                                                        <FileCode className="h-3 w-3 text-emerald-600" />
                                                    )}
                                                    {mediaItems && mediaItems.some((m: any) => m.type === 'image') && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
                                                    {mediaItems && mediaItems.some((m: any) => m.type === 'video') && <Video className="h-3 w-3 text-muted-foreground" />}
                                                    {linkItems && linkItems.length > 0 && <LinkIcon className="h-3 w-3 text-muted-foreground" />}
                                                    {triggerItems && triggerItems.length > 0 && <Zap className="h-3 w-3 text-amber-500" />}
                                                    {actualNode && typeof actualNode === 'object' && 'sqlExportAction' in actualNode && (actualNode as any).sqlExportAction && (
                                                        <Upload className="h-3 w-3 text-orange-600" />
                                                    )}
                                                </div>
                                            </div>

                                            {variableId && (type === 'question' || type === 'option') && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button asChild variant="ghost" size="icon" className="absolute top-1 right-1 h-5 w-5 cursor-pointer text-slate-400 hover:text-primary p-0">
                                                            <Link href={type === 'option' && nodeAsOption.optionId ? `/variables?varId=${variableId}#${nodeAsOption.optionId}` : `/variables?varId=${variableId}`} target="_blank">
                                                                <Database className="h-3 w-3" />
                                                            </Link>
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="left">
                                                        {type === 'option' && nodeAsOption.optionId ? (
                                                            <p>Opzione: {nodeAsOption.optionId}</p>
                                                        ) : (
                                                            <p>Variabile Standard: {variableId}</p>
                                                        )}
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </div>

                                        <div className="node-edit-controls absolute -bottom-9 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 dark:bg-zinc-800/95 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 py-1 px-2 gap-1 z-20 pointer-events-auto transform scale-90 group-hover:scale-100 origin-top duration-200">
                                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => {
                                                if (item.type === 'question' || item.type === 'decision' || item.type === 'option') {
                                                    const optionName = item.type === 'option' ? (item.node as any).option : undefined;
                                                    handleEdit(path, item.type, optionName);
                                                }
                                            }} title="Modifica" disabled={isSaving || (item.type !== 'question' && item.type !== 'decision' && item.type !== 'option')}>
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>

                                            {item.type === 'question' && (
                                                <>
                                                    <div className="h-4 w-px bg-border my-auto" />
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => {
                                                        setAddingNodeInfo({ path, type: 'add', varId: variableId });
                                                    }} title="Aggiungi Nuova Opzione" disabled={isSaving}>
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </>
                                            )}

                                            {item.type === 'option' && (
                                                <>
                                                    <div className="h-4 w-px bg-border my-auto" />
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => {
                                                        const parentNode = item.parent ? getNodeFromPath(tree, item.parent.path) : null;
                                                        const optionName = (item.node as any).option;
                                                        const currentNode = parentNode && parentNode.options ? parentNode.options[optionName] : {};
                                                        setLinkingNodeInfo({ path, currentNode: currentNode });
                                                    }} title="Collega a Nodo Esistente" disabled={isSaving}>
                                                        <Link2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <div className="h-4 w-px bg-border my-auto" />
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" onClick={() => {
                                                        setAddingChildNodeInfo({ path: path });
                                                    }} title="Aggiungi Nodo" disabled={isSaving}>
                                                        <Plus className="h-3.5 w-3.5" />
                                                    </Button>
                                                </>
                                            )}

                                            {path !== 'root' && (
                                                <>
                                                    <div className="h-4 w-px bg-border my-auto" />
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-red-50 text-destructive hover:text-destructive dark:hover:bg-red-900/20" onClick={() => handleDeleteNode(path)} title="Elimina" disabled={isSaving}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}

                            {connectorData.map((c, idx) => {
                                if (!c.isLink || selectedLinkId !== c.id) return null;
                                return (
                                    <div key={`${c.id}-overlay-${idx}`} className="absolute z-50 flex items-center justify-center gap-1 bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-800 rounded-full shadow-lg px-2 py-1 text-xs text-muted-foreground" style={{ left: c.midX - 60, top: c.midY - 15, width: 120, height: 30 }}>
                                        <span className="max-w-[60px] truncate" title={c.targetName}>Link: {c.targetName}</span>
                                        <button
                                            className="h-4 w-4 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 rounded-full transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setDeletingNodeInfo({ path: c.node.path, impactReport: null });
                                            }}
                                            title="Elimina Collegamento"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </PanZoomContainer>
                </TooltipProvider>
            </CardContent>

            {editingNodeInfo && (
                <EditNodeDialog
                    isOpen={!!editingNodeInfo}
                    onClose={() => setEditingNodeInfo(null)}
                    onSave={handleNodeUpdate}
                    onSavePreview={handleSavePreview}
                    initialNode={editingNodeInfo.node}
                    nodeType={editingNodeInfo.type}
                    variableId={(getNodeFromPath(tree, editingNodeInfo.path))?.variableId}
                    nodePath={editingNodeInfo.path}
                    treeId={treeData.id}
                    isSaving={isSaving}
                    availableInputTables={[
                        ...getAncestorInputTables(editingNodeInfo.path),
                        ...getLinkedNodesTables(editingNodeInfo.path)
                    ]}
                    availableParentMedia={getAncestorMedia(editingNodeInfo.path)}
                    availableParentLinks={getAncestorLinks(editingNodeInfo.path)}
                    availableParentTriggers={getAncestorTriggers(editingNodeInfo.path)}
                />
            )}

            {editingOptionInfo && (
                <EditOptionDialog
                    isOpen={!!editingOptionInfo}
                    onClose={() => setEditingOptionInfo(null)}
                    onSave={handleSaveOptionEdit}
                    initialOption={editingOptionInfo.option}
                    isSaving={isSaving}
                />
            )}

            {addingNodeInfo?.type === 'add' && addingNodeInfo.path !== null && (
                <AddNodeDialog
                    isOpen={addingNodeInfo.type === 'add'}
                    onClose={() => setAddingNodeInfo(null)}
                    onSave={handleSaveNewNode}
                    path={addingNodeInfo.path}
                    isSaving={isSaving}
                    variableId={addingNodeInfo.varId}
                />
            )}
            {addingChildNodeInfo && (
                <AddChildNodeDialog
                    isOpen={!!addingChildNodeInfo}
                    onClose={() => setAddingChildNodeInfo(null)}
                    onSave={handleSaveChildNode}
                    path={addingChildNodeInfo.path}
                    isSaving={isSaving}
                    availableNodes={flatTree.filter(n => !n.text.startsWith("Link:"))}
                />
            )}
            {linkingNodeInfo && (
                <LinkNodeDialog
                    isOpen={!!linkingNodeInfo}
                    onClose={() => setLinkingNodeInfo(null)}
                    onSave={handleSaveLink}
                    onSaveSubTree={handleSaveSubTreeLink}
                    onRemoveLink={handleRemoveLink}
                    path={linkingNodeInfo.path}
                    isSaving={isSaving}
                    nodeList={flatTree.filter(n => n.id !== linkingNodeInfo.currentNode?.id && !n.text.startsWith("Link:"))}
                    allTrees={allTrees}
                    currentNode={linkingNodeInfo.currentNode}
                />
            )}
            {deletingNodeInfo !== null && (
                <DeleteNodeDialog
                    isOpen={deletingNodeInfo !== null}
                    onClose={() => setDeletingNodeInfo(null)}
                    onConfirm={handleConfirmDelete}
                    isSaving={isSaving}
                    impactReport={deletingNodeInfo.impactReport}
                />
            )}
        </Card>
    );
}

























