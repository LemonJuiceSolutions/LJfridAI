

'use client';
import type { DecisionNode, StoredTree, DecisionLeaf, Variable, VariableOption } from '@/lib/types';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AlertCircle, Plus, Pencil, Trash2, Expand, Download, Link as LinkIcon, Link2, Zap, Image as ImageIcon, Video, GitBranch, Database, Play, Check, FileText, Cpu, Bot, Flag } from 'lucide-react';
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
const calculateLayout = (root: DecisionNode) => {
    const layout: Map<string, TreeNodeWithLayout> = new Map();
    let maxY = 0;

    function calculateNodePositions(
        node: any,
        path: string,
        x = 0,
        y = 0,
        parentNode?: TreeNodeWithLayout
    ): { width: number, height: number, layoutNode: TreeNodeWithLayout } {
        const id = (typeof node === 'object' && node.id) ? node.id : path;

        if (y > maxY) maxY = y;

        const isLink = typeof node === 'object' && 'ref' in node;
        const isSubTreeLink = typeof node === 'object' && 'subTreeRef' in node;

        if (typeof node !== 'object' || ('decision' in node) || isLink || isSubTreeLink || !node.options) {
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

        const questionNodeLayout: TreeNodeWithLayout = {
            node, path, id, x, y,
            width: NODE_WIDTH, height: NODE_HEIGHT,
            type: 'question',
            parent: parentNode
        };

        const children = Object.entries(node.options);

        // First pass: calculate dimensions
        const childrenDims = children.map(([option, childNode]) => {
            const optionPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;
            const startY = y + NODE_HEIGHT + V_SPACING + OPTION_NODE_HEIGHT;

            if (Array.isArray(childNode)) {
                // Arrange array items horizontally side-by-side
                let totalWidth = 0;
                let maxItemHeight = 0;
                const subDims: { width: number, height: number }[] = [];

                childNode.forEach((c, idx) => {
                    // Pass dummy coordinates, we only care about dimensions here
                    const { width, height } = calculateNodePositions(c, `${optionPath}[${idx}]`, 0, 0, undefined);
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
                const { width, height, layoutNode } = calculateNodePositions(childNode, optionPath, 0, startY, undefined);
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
            const optionPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;

            const optionId = `${id}-${option}`;
            const variableId = node.variableId;
            const optionData = variableId && node.possibleValues ? node.possibleValues.find((v: VariableOption) => v.name === option) : null;

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

                    calculateNodePositions(c, `${optionPath}[${idx}]`, currentItemX, childStartY, itemParent);

                    currentItemX += itemDims.width + H_SPACING;
                });
            } else {
                const childWidth = branchInfo.subDims[0].width;
                calculateNodePositions(childNode, optionPath, currentX + (branchWidth - childWidth) / 2, childStartY, optionNodeLayout);
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

    const layout = useMemo(() => {
        if (!tree) return { positionedNodes: [], contentWidth: 0, contentHeight: 0 };
        // Enrich tree with possibleValues from dbVariables
        const enrichedTree = _.cloneDeep(tree);
        const enrichNode = (node: any) => {
            if (node.variableId) {
                const dbVar = dbVariables.find(v => v.id === node.variableId);
                if (dbVar) {
                    node.possibleValues = dbVar.possibleValues;
                }
            }
            if (node.options) {
                Object.values(node.options).forEach(enrichNode);
            }
        };
        enrichNode(enrichedTree);
        return calculateLayout(enrichedTree);
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
            text = "Invalid Node";
        }

        if (!list.some(n => n.id === id)) {
            list.push({ id, text, path });
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
    }, []);

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
                    console.log("Detected nodes without IDs. Auto-saving corrected tree...");
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


    const handleEdit = (path: string, type: 'question' | 'decision' | 'option') => {
        if (!tree) return;

        const node = getNodeFromPath(tree, path);
        if (node === undefined) {
            console.error("Could not find node at path:", path);
            toast({ variant: 'destructive', title: "Errore", description: "Impossibile trovare il nodo da modificare." });
            return;
        }

        const parentPath = path.substring(0, path.lastIndexOf(".options"));
        const parentNode = getNodeFromPath(tree, parentPath);
        const varId = parentNode?.variableId;
        const optionKeyMatch = path.match(/\['(.*?)'\]$/);
        const optionName = optionKeyMatch ? optionKeyMatch[1].replace(/\\'/g, "'") : null;

        if (type === 'option') {
            if (varId && optionName) {
                // Standard variable, open the detailed option editor
                const dbVar = dbVariables.find(v => v.id === varId);
                const optionData = dbVar?.possibleValues.find((opt: VariableOption) => opt.name === optionName);

                if (optionData) {
                    setEditingOptionInfo({ path, option: optionData, varId });
                } else {
                    toast({ variant: 'destructive', title: "Errore", description: "Impossibile trovare i dati dell'opzione standard nel database." });
                }
            } else if (optionName) {
                // Local variable, open the simple name editor
                setEditingNodeInfo({ path, node: { option: optionName }, type: 'question' }); // This is a trick to reuse the dialog, it will be handled as option
            }
            return;
        }

        if (typeof node === 'object' && 'question' in node) {
            setEditingNodeInfo({ path, node: node, type: 'question' });
        } else if (typeof node === 'object' && 'decision' in node) {
            setEditingNodeInfo({ path, node: node, type: 'decision' });
        } else if (typeof node === 'string') {
            setEditingNodeInfo({ path, node: { decision: node }, type: 'decision' });
        } else if (typeof node === 'object' && ('ref' in node || 'subTreeRef' in node)) {
            toast({ variant: "default", title: "Info", description: "I nodi di collegamento non possono essere modificati direttamente. Eliminali e ricreali se necessario." });
            return;
        } else {
            console.error("Node at path is not an editable type:", path, node);
            toast({ variant: "destructive", title: "Errore", description: "Questo tipo di nodo non è modificabile." });
            return;
        }
    };

    const handleNodeUpdate = async (path: string, newNodeData: any) => {
        if (!onDataRefresh) return;

        setInternalSaving(true);
        setEditingNodeInfo(null);

        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(newNodeData)
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
            <CardContent className="flex-grow p-0 relative overflow-hidden bg-slate-100 dark:bg-zinc-900/80">
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
                                {connectorData.map(c => {
                                    const isSecondary = c.isLink || c.isSubTreeLink;
                                    const strokeColor = selectedLinkId === c.id ? '#6366f1' : (c.isBroken ? '#ef4444' : (isSecondary ? '#f59e0b' : '#a78bfa')); // Amber-500 for secondary, Violet-400 for direct
                                    
                                    return (
                                        <g key={c.id} onClick={(e) => { e.stopPropagation(); setSelectedLinkId(c.id); }} className="cursor-pointer" style={{ pointerEvents: 'auto' }}>
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

                            {layout.positionedNodes.map(item => {
                                const { node, path, x, y, width, height, type } = item;

                                // Hide link nodes as they are rendered as connectors with labels
                                if (type === 'link') return null;

                                const actualNode = (typeof node === 'object' && node !== null && 'node' in node) ? (node as any).node : node;

                                let text: string;
                                const nodeAsQuestion = actualNode as DecisionNode;
                                const nodeAsLeaf = actualNode as DecisionLeaf;
                                const nodeAsOption = node as { option: string, id: string, variableId?: string, optionId?: string };


                                switch (type) {
                                    case 'question':
                                        text = nodeAsQuestion.question || 'Domanda non valida';
                                        break;
                                    case 'decision':
                                        text = typeof actualNode === 'string' ? actualNode : nodeAsLeaf?.decision || 'Decisione non valida';
                                        break;
                                    case 'option':
                                        text = nodeAsOption.option;
                                        break;
                                    case 'sub-tree-link':
                                        const subTreeId = (actualNode as { subTreeRef: string }).subTreeRef;
                                        const subTreeInfo = allTrees.find(t => t.id === subTreeId);
                                        text = `Sotto-Albero: ${subTreeInfo?.name || subTreeId}`;
                                        break;
                                    default:
                                        text = 'Nodo non valido';
                                }

                                const isUndefinedPath = type === 'decision' && text === 'Percorso non definito';
                                const variableId = type === 'question' ? nodeAsQuestion.variableId : (type === 'option' ? nodeAsOption.variableId : undefined);
                                const mediaItems = (type === 'question' || type === 'decision' || type === 'option') && typeof actualNode !== 'string' && 'media' in actualNode ? actualNode.media : [];
                                const linkItems = (type === 'question' || type === 'decision' || type === 'option') && typeof actualNode !== 'string' && 'links' in actualNode ? actualNode.links : [];
                                const triggerItems = (type === 'question' || type === 'decision' || type === 'option') && typeof actualNode !== 'string' && 'triggers' in actualNode ? actualNode.triggers : [];

                                const isInternalLink = type === 'decision' && typeof actualNode === 'object' && 'ref' in actualNode;
                                const isSubTree = type === 'sub-tree-link';

                                return (
                                    <div
                                        key={`${item.id}-${path}`}
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
                                                     {mediaItems && mediaItems.some((m: any) => m.type === 'image') && <ImageIcon className="h-3 w-3 text-muted-foreground" />}
                                                     {mediaItems && mediaItems.some((m: any) => m.type === 'video') && <Video className="h-3 w-3 text-muted-foreground" />}
                                                     {linkItems && linkItems.length > 0 && <LinkIcon className="h-3 w-3 text-muted-foreground" />}
                                                     {triggerItems && triggerItems.length > 0 && <Zap className="h-3 w-3 text-amber-500" />}
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
                                                    handleEdit(path, item.type);
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

                            {connectorData.map(c => {
                                if (!c.isLink || selectedLinkId !== c.id) return null;
                                return (
                                    <div key={`${c.id}-overlay`} className="absolute z-50 flex items-center justify-center gap-1 bg-white dark:bg-zinc-800 border border-indigo-200 dark:border-indigo-800 rounded-full shadow-lg px-2 py-1 text-xs text-muted-foreground" style={{ left: c.midX - 60, top: c.midY - 15, width: 120, height: 30 }}>
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
                    initialNode={editingNodeInfo.node}
                    nodeType={editingNodeInfo.type}
                    variableId={(getNodeFromPath(tree, editingNodeInfo.path))?.variableId}
                    nodePath={editingNodeInfo.path}
                    treeId={treeData.id}
                    isSaving={isSaving}
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


























