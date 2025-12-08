

'use client';
import type { DecisionNode, StoredTree, DecisionLeaf, Variable, VariableOption } from '@/lib/types';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { AlertCircle, Plus, Pencil, Trash2, Expand, Download, Link as LinkIcon, Link2, Zap, Image as ImageIcon, Video, GitBranch, Database } from 'lucide-react';
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
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface VisualTreeProps {
  treeData: StoredTree;
  onDataRefresh?: () => void;
  isSaving: boolean;
}

// --- Layout Constants ---
const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const OPTION_NODE_WIDTH = 150;
const OPTION_NODE_HEIGHT = 50;
const H_SPACING = 40;
const V_SPACING = 80;


// --- Helper to ensure all nodes have an ID ---
const ensureNodeIds = (node: any): any => {
    if (typeof node !== 'object' || node === null) {
      return node;
    }
  
    const newNode = _.cloneDeep(node);
  
    const traverse = (n: any) => {
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
    ): number {
        const id = (typeof node === 'object' && node.id) ? node.id : path;
        
        if (y > maxY) maxY = y;

        const isLink = typeof node === 'object' && 'ref' in node;
        const isSubTreeLink = typeof node === 'object' && 'subTreeRef' in node;

        if (typeof node !== 'object' || ('decision' in node) || isLink || isSubTreeLink || !node.options) {
            let type: LayoutNodeType = 'decision';
            if (isLink) type = 'link';
            if (isSubTreeLink) type = 'sub-tree-link';

            let nodeWithLayout: TreeNodeWithLayout = { 
                node, path, id, x, y, 
                width: NODE_WIDTH, height: NODE_HEIGHT, 
                type, 
                parent: parentNode 
            };
            layout.set(path, nodeWithLayout);
            return NODE_WIDTH;
        }
        
        const questionNodeLayout: TreeNodeWithLayout = {
            node, path, id, x, y,
            width: NODE_WIDTH, height: NODE_HEIGHT,
            type: 'question',
            parent: parentNode
        };

        const children = Object.entries(node.options);
        
        const childrenWidths = children.map(([option, childNode]) => {
            const optionPath = `${path}.options['${option.replace(/'/g, "\\'")}']`;
            const childWidth = calculateNodePositions(childNode, optionPath, 0, y + NODE_HEIGHT + V_SPACING + OPTION_NODE_HEIGHT, undefined);
            return Math.max(OPTION_NODE_WIDTH, childWidth);
        });

        const totalChildrenWidth = childrenWidths.reduce((acc, width) => acc + width, 0) + (Math.max(0, children.length - 1) * H_SPACING);
        const questionNodeWidth = Math.max(NODE_WIDTH, totalChildrenWidth);
        
        questionNodeLayout.x = x + (questionNodeWidth - NODE_WIDTH) / 2;
        layout.set(path, questionNodeLayout);

        let currentX = x;
        children.forEach((child, i) => {
            const [option, childNode] = child;
            const branchWidth = childrenWidths[i];
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

            // Pass the optionNodeLayout as the parent to the recursive call
            calculateNodePositions(childNode, optionPath, currentX, y + NODE_HEIGHT + (V_SPACING / 2) + OPTION_NODE_HEIGHT + 30, optionNodeLayout);
            
            currentX += branchWidth + H_SPACING;
        });

        return questionNodeWidth;
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
        
        if(!list.some(n => n.id === id)) {
            list.push({ id, text, path });
        }

        if (typeof node === 'object' && 'options' in node && node.options) {
            Object.entries(node.options).forEach(([option, childNode]) => {
                 flattenTree(childNode, `${path}.options['${option.replace(/'/g, "\\'")}']`, list);
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
                 if(linkedNode) {
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
                setTree(treeWithIds as DecisionNode);
                fetchExternalData();
            }
        } catch (e) {
            console.error("Failed to parse tree JSON:", e);
            setTree(null);
        }
    }, [treeData, fetchExternalData]);

    const [editingNodeInfo, setEditingNodeInfo] = useState<{ path: string; node: DecisionLeaf | {question: string} | { option: string }; type: 'question' | 'decision' } | null>(null);
    const [editingOptionInfo, setEditingOptionInfo] = useState<{ path: string; option: VariableOption; varId: string; } | null>(null);
    const [addingNodeInfo, setAddingNodeInfo] = useState<{ path: string; type: 'add', varId?: string } | null>(null);
    const [linkingNodeInfo, setLinkingNodeInfo] = useState<{ path: string; currentNode: any; } | null>(null);
    const [deletingNodeInfo, setDeletingNodeInfo] = useState<{ path: string; impactReport: any } | null>(null);
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
             toast({ variant: 'destructive', title: "Errore", description: "Impossibile trovare il nodo da modificare."});
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
                     toast({ variant: 'destructive', title: "Errore", description: "Impossibile trovare i dati dell'opzione standard nel database."});
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
        } catch(e) {
            toast({variant: 'destructive', title: "Errore di Propagazione", description: e instanceof Error ? e.message : 'Errore Sconosciuto'});
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
    
    const handleSaveLink = useCallback(async (path: string, option: string, targetNodeId: string) => {
        if (!onDataRefresh) return;
        
        setLinkingNodeInfo(null);
        setInternalSaving(true);
        
        const newNode = { ref: targetNodeId, id: nanoid(8) };
        
        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path, // The path is the option node itself
                nodeData: JSON.stringify(newNode)
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
        
    }, [onDataRefresh, toast, treeData.id]);
    
    const handleSaveSubTreeLink = useCallback(async (path: string, option: string, targetTreeId: string) => {
        if (!onDataRefresh) return;

        setLinkingNodeInfo(null);
        setInternalSaving(true);

        const newNode = { subTreeRef: targetTreeId, id: nanoid(8) };

        try {
            const result = await updateTreeNodeAction({
                treeId: treeData.id,
                nodePath: path,
                nodeData: JSON.stringify(newNode)
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
    }, [onDataRefresh, toast, treeData.id]);


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
    
        const lastDotIndex = path.lastIndexOf('.options');
        const parentPath = path.substring(0, lastDotIndex);
        const optionKeyMatch = path.match(/\['(.*?)'\]$/);
        const optionKey = optionKeyMatch ? optionKeyMatch[1].replace(/\\'/g, "'") : null;
    
        if (!parentPath || !optionKey) {
            toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile eliminare il nodo.' });
            setInternalSaving(false);
            setDeletingNodeInfo(null);
            return;
        }
    
        const parentNode = getNodeFromPath(tree, parentPath);
        const varId = parentNode?.variableId;
    
        try {
            if (varId) {
                const dbVar = dbVariables.find(v => v.id === varId);
                if (!dbVar) throw new Error("Variabile standard non trovata nel database.");
                const newOptions = (dbVar.possibleValues || []).filter(opt => opt.name !== optionKey);
                const result = await updateVariableAction(treeData.id, varId, { possibleValues: newOptions });
                if (result.success) {
                    toast({title: "Successo!", description: "Opzione eliminata e propagata a tutti gli alberi collegati."});
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
                toast({title: "Successo!", description: "Il nodo è stato eliminato."});
            }
            onDataRefresh();
            fetchExternalData();
        } catch(e) {
            toast({variant: 'destructive', title: "Errore di Eliminazione", description: e instanceof Error ? e.message : 'Errore Sconosciuto'});
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


    if (!tree) {
        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertCircle className="text-destructive"/> Albero Non Valido</CardTitle>
              <CardDescription>Il JSON per l'albero decisionale è malformato e non può essere visualizzato.</CardDescription>
            </CardHeader>
          </Card>
        );
    }

    return (
        <Card className="h-[700px] flex flex-col">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Albero Decisionale Visuale</CardTitle>
                        <CardDescription>Trascina per spostare e usa la rotellina per lo zoom. Le modifiche sono sempre attive.</CardDescription>
                    </div>
                     <TooltipProvider>
                        <div className='flex items-center gap-4'>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                     <Button variant="outline" size="sm" onClick={() => setZoomReset(prev => prev + 1)} disabled={isSaving}>
                                        <Expand className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Adatta allo Schermo</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="outline" size="sm" onClick={downloadJson} disabled={isSaving}>
                                        <Download className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Download JSON</p></TooltipContent>
                            </Tooltip>
                        </div>
                    </TooltipProvider>
                </div>
            </CardHeader>
            <CardContent className="flex-grow p-0 relative overflow-hidden">
                <TooltipProvider>
                    <PanZoomContainer 
                        contentWidth={layout.contentWidth} 
                        contentHeight={layout.contentHeight}
                        reset={zoomReset}
                    >
                        <div className="visual-tree-container" style={{ width: layout.contentWidth, height: layout.contentHeight }}>
                            <svg className="connector-svg">
                                {layout.positionedNodes.map(node => {
                                    if (!node.parent) return null;
                                    
                                    const parent = node.parent;
                                    let startX = parent.x + parent.width / 2;
                                    let startY = parent.y + parent.height;
                                    
                                    let endX = node.x + node.width / 2;
                                    let endY = node.y;

                                    const isLink = typeof node.node === 'object' && 'ref' in node.node;
                                    const isSubTreeLink = typeof node.node === 'object' && 'subTreeRef' in node.node;

                                    if (isLink) {
                                        const targetNode = layout.positionedNodes.find(n => n.id === (node.node as {ref: string}).ref);
                                        if (targetNode) {
                                            endX = targetNode.x + targetNode.width / 2;
                                            endY = targetNode.y;
                                        } else {
                                            return null; // Don't draw if target isn't found
                                        }
                                    }
                                    // Note: We don't adjust position for sub-tree links as they are leaf nodes in the current tree view.

                                    const c1X = startX;
                                    const c1Y = startY + V_SPACING / 2;
                                    const c2X = endX;
                                    const c2Y = endY - V_SPACING / 2;
                                    const pathD = `M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}`;
                                    
                                    return (
                                        <g key={`${node.id}-${parent.id}-connector`}>
                                            <path d={pathD} className={cn('connector-path', {'is-link': isLink || isSubTreeLink })} />
                                        </g>
                                    )
                                })}
                            </svg>

                            {layout.positionedNodes.map(item => {
                                const { node, path, x, y, width, height, type } = item;
                                
                                const actualNode = (typeof node === 'object' && node !== null && 'node' in node) ? (node as any).node : node;

                                if (type === 'link') {
                                    return null;
                                }

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
                                        const subTreeId = (actualNode as {subTreeRef: string}).subTreeRef;
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
                                        className={cn(`tree-node-wrapper group is-${type}`, { 'is-undefined-path': isUndefinedPath, 'is-link': isInternalLink || isSubTree })}
                                        style={{ left: x, top: y, width: width, height: height }}
                                    >
                                        <div className="tree-node-content relative">
                                            {type === 'option' ? (
                                                <div className='node-text-scroll py-1 px-2 flex items-center justify-center h-full'>
                                                    <span>{text}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className='node-text-scroll py-1 px-2 flex items-start justify-center text-center'>
                                                        <span>{text}</span>
                                                    </div>
                                                    <div className='flex-shrink-0 flex items-center justify-center gap-2 h-6 border-t mt-1'>
                                                        {mediaItems && mediaItems.some(m => m.type === 'image') && <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                                                        {mediaItems && mediaItems.some(m => m.type === 'video') && <Video className="h-4 w-4 text-muted-foreground" />}
                                                        {linkItems && linkItems.length > 0 && <LinkIcon className="h-4 w-4 text-muted-foreground" />}
                                                        {triggerItems && triggerItems.length > 0 && <Zap className="h-4 w-4 text-muted-foreground" />}
                                                        {isSubTree && <GitBranch className="h-4 w-4 text-muted-foreground" />}
                                                    </div>
                                                </>
                                            )}

                                            {variableId && (type === 'question' || type === 'option') && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button asChild variant="link" size="icon" className="absolute -top-3 -right-3 h-6 w-6 cursor-pointer">
                                                            <Link href={ type === 'option' && nodeAsOption.optionId ? `/variables?varId=${variableId}#${nodeAsOption.optionId}` : `/variables?varId=${variableId}`} target="_blank">
                                                                <Database className="h-4 w-4 text-primary"/>
                                                            </Link>
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {type === 'option' && nodeAsOption.optionId ? (
                                                            <p>Opzione: {nodeAsOption.optionId}</p>
                                                        ) : (
                                                            <p>Variabile Standard: {variableId}</p>
                                                        )}
                                                    </TooltipContent>
                                                </Tooltip>
                                            )}
                                        </div>
                                        <div className="edit-controls">
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(path, item.type)} title="Modifica" disabled={isSaving}>
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                
                                                {item.type === 'question' && (
                                                    <>
                                                        <div className="h-5 w-px bg-border" />
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                                            setAddingNodeInfo({path, type: 'add', varId: variableId});
                                                        }} title="Aggiungi Nuova Opzione" disabled={isSaving}>
                                                            <Plus className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}

                                                {item.type === 'option' && (
                                                    <>
                                                        <div className="h-5 w-px bg-border" />
                                                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                                            const parentNode = item.parent ? getNodeFromPath(tree, item.parent.path) : null;
                                                            const optionName = (item.node as any).option;
                                                            const currentNode = parentNode && parentNode.options ? parentNode.options[optionName] : {};
                                                            setLinkingNodeInfo({path, currentNode: currentNode });
                                                        }} title="Collega a Nodo Esistente" disabled={isSaving}>
                                                            <Link2 className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                                
                                                {path !== 'root' && (
                                                    <>
                                                        <div className="h-5 w-px bg-border" />
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDeleteNode(path)} title="Elimina" disabled={isSaving}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                    </div>
                                )
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


    



    

    

    















    