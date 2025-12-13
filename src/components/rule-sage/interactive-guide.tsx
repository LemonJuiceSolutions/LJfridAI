

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { DecisionNode, DecisionLeaf, MediaItem, LinkItem, TriggerItem, StoredTree, DecisionOptionChild } from '@/lib/types';
import { ArrowLeft, Brain, Eye, GitBranch, Lightbulb, Link as LinkIcon, Loader2, RotateCcw, Sparkles, Zap, Image as ImageIcon, Video } from 'lucide-react';
import { executeTriggerAction, getTreeAction, rephraseQuestionAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import Image from 'next/image';
import Link from 'next/link';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '@/lib/utils';

interface InteractiveGuideProps {
    jsonTree: string;
    treeId: string;
}

type HistoryFrame = {
    tree: DecisionNode;
    path: HistoryItem[];
    treeId: string;
    treeName?: string;
};

type HistoryItem = DecisionOptionChild;

// Helper to find a node by ID recursively in the tree
const findNodeById = (node: any, id: string): any => {
    if (!node) return null;
    if (typeof node === 'object' && node.id === id) return node;

    if (Array.isArray(node)) {
        for (const child of node) {
            const result = findNodeById(child, id);
            if (result) return result;
        }
    } else if (typeof node === 'object') {
        if (node.options) {
            for (const key of Object.keys(node.options)) {
                const result = findNodeById(node.options[key], id);
                if (result) return result;
            }
        }
    }
    return null;
};

export default function InteractiveGuide({ jsonTree, treeId }: InteractiveGuideProps) {
    const { toast } = useToast();

    const [treeStack, setTreeStack] = useState<HistoryFrame[]>([]);
    const [currentTree, setCurrentTree] = useState<DecisionNode | null>(null);
    const [currentNode, setCurrentNode] = useState<HistoryItem | null>(null);
    const [nodeHistory, setNodeHistory] = useState<HistoryItem[]>([]);

    const [rephrasing, setRephrasing] = useState(false);
    const [rephrasedQuestion, setRephrasedQuestion] = useState<string | null>(null);
    const [previewingMedia, setPreviewingMedia] = useState<MediaItem | null>(null);
    const [isExecutingTrigger, setIsExecutingTrigger] = useState(false);
    const [isLoadingTree, setIsLoadingTree] = useState(false);
    const [currentTreeId, setCurrentTreeId] = useState(treeId);
    const [loadedSubTrees, setLoadedSubTrees] = useState<Map<string, { tree: DecisionNode, name: string }>>(new Map());
    const [loadingSubTreeIds, setLoadingSubTreeIds] = useState<Set<string>>(new Set());

    const initialTree = useMemo(() => {
        if (!jsonTree) return null;
        try {
            return JSON.parse(jsonTree) as DecisionNode;
        } catch (error) {
            console.error("Impossibile analizzare l'albero decisionale JSON:", error);
            return null;
        }
    }, [jsonTree]);

    const handleExecuteTriggers = useCallback(async (triggers: TriggerItem[]) => {
        if (!triggers || triggers.length === 0) return;

        setIsExecutingTrigger(true);
        for (const trigger of triggers) {
            const result = await executeTriggerAction(currentTreeId, (currentNode as any)?.id, trigger);
            if (result.success) {
                toast({
                    title: "Trigger Eseguito",
                    description: result.message
                });
            } else {
                toast({
                    variant: 'destructive',
                    title: "Esecuzione Trigger Fallita",
                    description: result.message
                });
            }
        }
        setIsExecutingTrigger(false);

    }, [currentTreeId, currentNode, toast]);

    const startTree = useCallback((tree: DecisionNode, id: string, name?: string) => {
        setCurrentTree(tree);
        setCurrentNode(tree);
        setCurrentTreeId(id);
        setNodeHistory([]);
        setRephrasedQuestion(null);
    }, []);


    useEffect(() => {
        if (initialTree) {
            startTree(initialTree, treeId);
        }
    }, [initialTree, startTree, treeId]);

    useEffect(() => {
        if (currentNode && (typeof currentNode === 'object' && 'decision' in currentNode) && !('question' in currentNode)) {
            const triggers = (currentNode as DecisionLeaf).triggers;
            if (triggers && triggers.length > 0) {
                handleExecuteTriggers(triggers);
            }
        }
    }, [currentNode, handleExecuteTriggers]);

    // Auto-load sub-trees when they appear in results
    useEffect(() => {
        if (!Array.isArray(currentNode)) return;

        const subTreeRefs = currentNode
            .filter(node => typeof node === 'object' && node !== null && 'subTreeRef' in node)
            .map(node => (node as any).subTreeRef as string);

        subTreeRefs.forEach(async (ref) => {
            if (!loadedSubTrees.has(ref) && !loadingSubTreeIds.has(ref)) {
                setLoadingSubTreeIds(prev => new Set(prev).add(ref));
                try {
                    const result = await getTreeAction(ref);
                    if (result.data && result.data.jsonDecisionTree) {
                        const tree = JSON.parse(result.data.jsonDecisionTree) as DecisionNode;
                        setLoadedSubTrees(prev => new Map(prev).set(ref, { tree, name: result.data!.name }));
                    }
                } catch (e) {
                    console.error('Failed to load sub-tree:', ref, e);
                } finally {
                    setLoadingSubTreeIds(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(ref);
                        return newSet;
                    });
                }
            }
        });
    }, [currentNode, loadedSubTrees, loadingSubTreeIds]);

    const handleOptionClick = async (nextNode: HistoryItem) => {
        if (currentNode) {
            setNodeHistory([...nodeHistory, currentNode]);
        }

        if (typeof nextNode === 'object' && nextNode !== null && 'subTreeRef' in nextNode && nextNode.subTreeRef) {
            setIsLoadingTree(true);
            // Push current state to stack
            if (currentTree) {
                setTreeStack([...treeStack, { tree: currentTree, path: [...nodeHistory, currentNode!], treeId: currentTreeId, treeName: currentTree.question }]);
            }

            // Fetch and start new tree
            const result = await getTreeAction(nextNode.subTreeRef);
            setIsLoadingTree(false);
            if (result.error || !result.data) {
                toast({ variant: 'destructive', title: 'Errore', description: result.error || 'Impossibile caricare il sotto-albero.' });
                // Rollback state
                handleBack();
                return;
            }

            try {
                const subTree = JSON.parse(result.data.jsonDecisionTree) as DecisionNode;
                startTree(subTree, result.data.id, result.data.name);
            } catch (e) {
                toast({ variant: 'destructive', title: 'Errore', description: 'Il sotto-albero è malformato.' });
                handleBack();
            }
        } else {
            setCurrentNode(nextNode);
            setRephrasedQuestion(null);
        }
    };

    const handleSubTreeOptionClick = async (nextNode: HistoryItem, subTreeId: string, originalIndex: number) => {
        // Navigate within a sub-tree that's embedded in the results view
        // Keep everything in the same view, just replace the sub-tree section

        if (!Array.isArray(currentNode)) return;

        // Prepare nodes to insert (handling single node or array of nodes)
        let nodesToInsert: any[] = [];

        if (Array.isArray(nextNode)) {
            nodesToInsert = nextNode.map(n => {
                if (typeof n === 'string') return { decision: n, _subTreeSource: subTreeId };
                return { ...n, _subTreeSource: subTreeId };
            });
        } else {
            let wrappedNode: any;
            if (typeof nextNode === 'string') {
                // String decision - wrap it in an object
                wrappedNode = { decision: nextNode, _subTreeSource: subTreeId };
            } else if (typeof nextNode === 'object' && nextNode !== null) {
                // Object - add the source property
                wrappedNode = { ...nextNode, _subTreeSource: subTreeId };
            } else {
                wrappedNode = nextNode;
            }
            nodesToInsert = [wrappedNode];
        }

        // Create new array and replace the item at originalIndex
        const newArray = [...currentNode];
        newArray.splice(originalIndex, 1, ...nodesToInsert);

        // Force it to stay as an array by ensuring it's always treated as such
        setCurrentNode(newArray as any);
    };

    const handleRestart = () => {
        if (initialTree) {
            startTree(initialTree, treeId);
            setTreeStack([]);
        }
    };

    const handleBack = () => {
        if (nodeHistory.length > 0) {
            const previousNode = nodeHistory[nodeHistory.length - 1];
            setNodeHistory(nodeHistory.slice(0, -1));
            setCurrentNode(previousNode);
            setRephrasedQuestion(null);
        } else if (treeStack.length > 0) {
            // We are at the root of a sub-tree, go back to parent tree
            const parentFrame = treeStack[treeStack.length - 1];
            setTreeStack(treeStack.slice(0, -1));

            setCurrentTree(parentFrame.tree);
            setCurrentTreeId(parentFrame.treeId);
            setNodeHistory(parentFrame.path.slice(0, -1));
            setCurrentNode(parentFrame.path[parentFrame.path.length - 1]);
            setRephrasedQuestion(null);
        }
    };

    const completeSubTree = (resultNode: DecisionLeaf | string) => {
        if (treeStack.length === 0) return;

        const parentFrame = treeStack[treeStack.length - 1];

        // Clone the parent's current node (which should be an array of results)
        // We know from returnToParentTree logic that the history state we want is actually
        // NOT the last node in path (which is the question), but the State AFTER answering it.
        // Wait, 'path' in history stores the sequence of nodes visited.
        // The last item in 'path' IS the node we were at BEFORE entering the sub-tree.
        // If we entered from a result list, that list IS the current node?
        // No, typically 'currentNode' is the result list.
        // When we push to stack: path: [...nodeHistory, currentNode]
        // So the last item in 'path' IS the node that triggered the sub-tree (the result list).

        const parentCurrentNode = parentFrame.path[parentFrame.path.length - 1];

        if (!Array.isArray(parentCurrentNode)) {
            // Unexpected state: parent node is not an array (so it wasn't a multiple result scenario?)
            // If it wasn't an array, how did we click a sub-tree link? 
            // Maybe a single result was a sub-tree link?
            // In that case, we just Replace the single node.
            setTreeStack(treeStack.slice(0, -1));
            setCurrentTree(parentFrame.tree);
            setCurrentTreeId(parentFrame.treeId);
            setNodeHistory(parentFrame.path.slice(0, -1));
            setRephrasedQuestion(null);

            // Replace the whole node with the result
            setCurrentNode(resultNode);
            toast({ title: "Sotto-albero completato", description: "Risultato acquisito nell'albero principale." });
            return;
        }

        // It is an array. We need to find the link to THIS sub-tree and replace it.
        const newArray = parentCurrentNode.map(item => {
            if (typeof item === 'object' && item !== null && 'subTreeRef' in item && item.subTreeRef === currentTreeId) {
                // Found the link! Replace with result.
                // We need to ensure the result is in a format that renderLeafNode accepts in the array map
                // If resultNode is string, it's fine. If object, ensure it works.
                // The resultNode passed in is standard DecisionLeaf format.
                return resultNode;
            }
            return item;
        });

        setTreeStack(treeStack.slice(0, -1));
        setCurrentTree(parentFrame.tree);
        setCurrentTreeId(parentFrame.treeId);
        setNodeHistory(parentFrame.path.slice(0, -1)); // We go back to state where currentNode was the array
        setRephrasedQuestion(null);
        setCurrentNode(newArray); // Set the modified array as current
        toast({ title: "Sotto-albero completato", description: "Risultato integrato nell'albero principale." });
    };

    const returnToParentTree = () => {
        if (treeStack.length === 0) return;
        const parentFrame = treeStack[treeStack.length - 1];
        setTreeStack(treeStack.slice(0, -1));

        // We don't just go back, we advance in the parent tree.
        // The last node in the parent frame's path is the question that led to the sub-tree.
        // The option that was clicked is not in the history.
        const lastQuestionNode = parentFrame.path[parentFrame.path.length - 1] as DecisionNode;

        // Find which option led to the sub-tree. We need to find the option that contains the subTreeRef.
        let nextNodeInParent: HistoryItem | undefined;
        if (lastQuestionNode.options) {
            for (const optionKey in lastQuestionNode.options) {
                const optionValue = lastQuestionNode.options[optionKey];
                if (typeof optionValue === 'object' && optionValue !== null && 'subTreeRef' in optionValue && optionValue.subTreeRef === currentTreeId) {
                    // This is a tricky part. A sub-tree link acts as a leaf. We cannot "continue" from it.
                    // The logical flow should be defined in the parent tree.
                    // For now, we just return to the question that launched the sub-tree.
                    setCurrentNode(lastQuestionNode);
                    setNodeHistory(parentFrame.path.slice(0, -1));
                    setCurrentTree(parentFrame.tree);
                    setCurrentTreeId(parentFrame.treeId);
                    setRephrasedQuestion(null);
                    toast({ title: "Ritorno all'albero principale", description: "La procedura nel sotto-albero è terminata. Per continuare, seleziona un'altra opzione." });

                    return;
                }
            }
        }

        // Fallback if we can't determine where to go next, just go back.
        handleBack();
    }


    const handleRephrase = async () => {
        if (currentNode && typeof currentNode === 'object' && 'question' in currentNode && currentNode.question) {
            setRephrasing(true);
            setRephrasedQuestion(null);
            const context = `L'utente si trova in un processo decisionale. I passaggi precedenti sono: ${nodeHistory.map(h => typeof h === 'object' && 'question' in h && h.question ? h.question : '').join(' -> ')}`;

            const apiKey = localStorage.getItem('openrouter_api_key');
            const model = localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-001';
            const openRouterConfig = apiKey ? { apiKey, model } : undefined;

            const result = await rephraseQuestionAction(currentNode.question, context, openRouterConfig);
            if (result.error) {
                toast({
                    variant: 'destructive',
                    title: 'Riformulazione Fallita',
                    description: result.error
                });
            } else {
                setRephrasedQuestion(result.data);
            }
            setRephrasing(false);
        }
    };

    if (!currentTree) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Errore</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">Impossibile caricare la guida interattiva. L'albero decisionale JSON potrebbe non essere valido.</p>
                </CardContent>
            </Card>
        );
    }

    const isDecision = typeof currentNode === 'string' || (typeof currentNode === 'object' && currentNode !== null && 'decision' in currentNode && !('question' in currentNode));
    const isQuestion = typeof currentNode === 'object' && currentNode !== null && 'question' in currentNode;

    const nodeAsLeaf = isDecision ? (currentNode as DecisionLeaf) : null;
    const decisionText = isDecision ? (typeof currentNode === 'string' ? currentNode : nodeAsLeaf?.decision) : null;

    const renderAttachments = (node: DecisionNode | DecisionLeaf) => {
        // Unified extraction for media, links, and triggers
        const mediaItems: MediaItem[] = node && typeof node === 'object' && 'media' in node && Array.isArray(node.media) ? node.media : [];
        const linkItems: LinkItem[] = node && typeof node === 'object' && 'links' in node && Array.isArray(node.links) ? node.links : [];
        const triggerItems: TriggerItem[] = node && typeof node === 'object' && 'triggers' in node && Array.isArray(node.triggers) ? node.triggers : [];

        const allAttachments = [
            ...mediaItems.map(item => ({ type: 'media' as const, item })),
            ...linkItems.map(item => ({ type: 'link' as const, item })),
            ...triggerItems.map(item => ({ type: 'trigger' as const, item }))
        ];

        if (allAttachments.length === 0) return null;

        return (
            <div className="mt-6 max-w-md mx-auto border rounded-lg p-2 space-y-1">
                {allAttachments.map((attachment, index) => {
                    let icon, name, actionWrapper;
                    const { item, type } = attachment;

                    switch (type) {
                        case 'media':
                            icon = item.type === 'image'
                                ? <ImageIcon className="h-4 w-4 text-primary" />
                                : <Video className="h-4 w-4 text-primary" />;
                            name = item.name || item.originalFilename || 'Media';
                            actionWrapper = (children: React.ReactNode) => (
                                <div onClick={() => setPreviewingMedia(item)} className="cursor-pointer flex items-center gap-3 w-full">
                                    {children}
                                </div>
                            );
                            break;
                        case 'link':
                            icon = <LinkIcon className="h-4 w-4 text-primary" />;
                            name = item.name || item.url;
                            actionWrapper = (children: React.ReactNode) => (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 w-full">
                                    {children}
                                </a>
                            );
                            break;
                        case 'trigger':
                            icon = <Zap className="h-4 w-4 text-primary" />;
                            name = item.name;
                            actionWrapper = (children: React.ReactNode) => <div className="flex items-center gap-3 w-full">{children}</div>;
                            break;
                    }

                    return (
                        <div key={index} className="flex items-center p-2 rounded-md hover:bg-muted/50 transition-colors">
                            {actionWrapper(
                                <>
                                    {icon}
                                    <div className="w-6 h-6 rounded bg-secondary flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                                        {type === 'media' && item.type === 'image' && (
                                            <Image src={item.url} alt={name} layout="fill" objectFit="cover" />
                                        )}
                                        {type === 'media' && item.type === 'video' && (
                                            <Video className="h-4 w-4 text-muted-foreground" />
                                        )}
                                    </div>
                                    <span className="font-medium text-sm truncate flex-1">{name}</span>
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        );
    };

    const renderLeafNode = (node: DecisionLeaf | string, index?: number) => {
        const decisionText = typeof node === 'string' ? node : node.decision;
        const isLeafObject = typeof node === 'object' && node !== null;

        return (
            <div key={index} className={cn("text-center p-4 w-full", index !== undefined && "border-b last:border-0")}>
                {isExecutingTrigger ? (
                    <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
                ) : (
                    <Sparkles className="mx-auto h-12 w-12 text-accent mb-4" />
                )}
                <p className="text-lg font-semibold text-muted-foreground">Decisione Finale:</p>
                <p className="text-2xl font-bold mt-2">{decisionText}</p>
                {isLeafObject && renderAttachments(node)}

                {treeStack.length > 0 && (
                    <Button onClick={() => completeSubTree(node as any)} className="mt-4 w-full sm:w-auto" variant="secondary">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Usa questo risultato
                    </Button>
                )}
            </div>
        );
    };

    return (
        <>
            <Card className="min-h-[400px] flex flex-col">
                <CardHeader>
                    <CardTitle>Guida Interattiva</CardTitle>
                    <CardDescription>Rispondi alle domande per navigare nell'albero decisionale e trovare una soluzione.</CardDescription>
                    {treeStack.length > 0 && (
                        <div className="text-sm text-muted-foreground pt-2 flex items-center gap-2">
                            <GitBranch className="h-4 w-4" />
                            <span>Navigando sotto-albero: <strong>{currentTree.question}</strong></span>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="flex-grow flex items-center justify-center">
                    {isLoadingTree ? (
                        <div className="text-center p-4">
                            <Loader2 className="mx-auto h-12 w-12 text-primary animate-spin mb-4" />
                            <p className="text-lg text-muted-foreground">Caricamento sotto-albero...</p>
                        </div>
                    ) : Array.isArray(currentNode) ? (
                        <div className="text-center p-4 w-full space-y-8">
                            {currentNode.map((node, index) => {
                                // Check if this node came from a sub-tree
                                const subTreeSource = (node as any)._subTreeSource || (node as any).subTreeRef;
                                const subTreeData = subTreeSource ? loadedSubTrees.get(subTreeSource) : null;

                                // Direct decision node (string or object with 'decision')
                                if (typeof node === 'string' || (typeof node === 'object' && node !== null && 'decision' in node && !('ref' in node) && !('question' in node) && !('subTreeRef' in node))) {
                                    return (
                                        <div key={index} className={cn("w-full", index !== undefined && "border-b last:border-0")}>
                                            {subTreeData && (
                                                <div className="flex items-center gap-2 text-xs text-primary mb-2 px-4 pt-4">
                                                    <GitBranch className="h-3 w-3" />
                                                    <span className="font-medium">Da: {subTreeData.name}</span>
                                                </div>
                                            )}
                                            {renderLeafNode(node as DecisionLeaf | string, index)}
                                        </div>
                                    );
                                }

                                // Question node from sub-tree
                                if (typeof node === 'object' && node !== null && 'question' in node && 'options' in node) {
                                    return (
                                        <div key={index} className={cn("p-4 w-full border-t border-primary/20", index !== undefined && "border-b last:border-0")}>
                                            {subTreeData && (
                                                <div className="flex items-center gap-2 text-sm text-primary mb-4">
                                                    <GitBranch className="h-4 w-4" />
                                                    <span className="font-medium">Sotto-processo: {subTreeData.name}</span>
                                                </div>
                                            )}
                                            <p className="text-lg font-medium text-center mb-4">{(node as DecisionNode).question}</p>
                                            {renderAttachments(node as DecisionNode)}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                                {Object.entries((node as DecisionNode).options!).map(([key, value]) => (
                                                    <Button
                                                        key={key}
                                                        onClick={() => handleSubTreeOptionClick(value, subTreeSource, index)}
                                                        variant="outline"
                                                        size="lg"
                                                        className="h-auto py-3"
                                                    >
                                                        {key}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                }

                                // Linked decision node (object with 'ref')
                                if (typeof node === 'object' && node !== null && 'ref' in node) {
                                    const targetId = (node as any).ref;
                                    // Resolve in the correct tree (sub-tree or main tree)
                                    const lookupTree = subTreeData ? subTreeData.tree : currentTree;
                                    const targetNode = findNodeById(lookupTree, targetId);

                                    if (targetNode) {
                                        // If target is a decision, render it
                                        if (typeof targetNode === 'string' || 'decision' in targetNode) {
                                            return (
                                                <div key={index} className={cn("w-full", index !== undefined && "border-b last:border-0")}>
                                                    {subTreeData && (
                                                        <div className="flex items-center gap-2 text-xs text-primary mb-2 px-4 pt-4">
                                                            <GitBranch className="h-3 w-3" />
                                                            <span className="font-medium">Da: {subTreeData.name}</span>
                                                        </div>
                                                    )}
                                                    {renderLeafNode(targetNode as DecisionLeaf | string, index)}
                                                </div>
                                            );
                                        }
                                    }
                                }

                                // Sub-Tree link node
                                if (typeof node === 'object' && node !== null && 'subTreeRef' in node) {
                                    const subTreeRef = (node as any).subTreeRef;
                                    const subTreeData = loadedSubTrees.get(subTreeRef);
                                    const isLoading = loadingSubTreeIds.has(subTreeRef);

                                    if (isLoading) {
                                        return (
                                            <div key={index} className={cn("text-center p-4 w-full", index !== undefined && "border-b last:border-0")}>
                                                <Loader2 className="mx-auto h-8 w-8 text-primary animate-spin mb-2" />
                                                <p className="text-sm text-muted-foreground">Caricamento sotto-processo...</p>
                                            </div>
                                        );
                                    }

                                    if (!subTreeData) {
                                        return null;
                                    }

                                    const subTree = subTreeData.tree;

                                    return (
                                        <div key={index} className={cn("p-4 w-full border-t border-primary/20", index !== undefined && "border-b last:border-0")}>
                                            <div className="flex items-center gap-2 text-sm text-primary mb-4">
                                                <GitBranch className="h-4 w-4" />
                                                <span className="font-medium">Sotto-processo: {subTreeData.name}</span>
                                            </div>

                                            {/* Render sub-tree's root question inline */}
                                            {typeof subTree === 'object' && 'question' in subTree && subTree.options ? (
                                                <>
                                                    <p className="text-lg font-medium text-center mb-4">{subTree.question}</p>
                                                    {renderAttachments(subTree)}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                                        {Object.entries(subTree.options).map(([key, value]) => (
                                                            <Button
                                                                key={key}
                                                                onClick={() => handleSubTreeOptionClick(value, subTreeRef, index)}
                                                                variant="outline"
                                                                size="lg"
                                                                className="h-auto py-3"
                                                            >
                                                                {key}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-muted-foreground text-center">Il sotto-albero non contiene domande valide.</p>
                                            )}
                                        </div>
                                    );
                                }

                                return null;
                            })}

                            {treeStack.length > 0 && (
                                <Button onClick={returnToParentTree} className="mt-6">
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Torna all'Albero Precedente
                                </Button>
                            )}
                        </div>
                    ) : isDecision && nodeAsLeaf ? (
                        <div className="w-full">
                            {renderLeafNode(nodeAsLeaf)}
                            <div className="text-center">
                                {treeStack.length > 0 && (
                                    <Button onClick={returnToParentTree} className="mt-6">
                                        <ArrowLeft className="mr-2 h-4 w-4" />
                                        Torna all'Albero Precedente
                                    </Button>
                                )}
                            </div>
                        </div>
                    ) : isQuestion && 'options' in currentNode && currentNode.options ? (
                        <div className="w-full">
                            <p className="text-xl font-medium text-center mb-6">{(currentNode as DecisionNode).question}</p>
                            {rephrasedQuestion && (
                                <Alert className="mb-4 bg-primary/10 border-primary/50">
                                    <Lightbulb className="h-4 w-4 text-primary" />
                                    <AlertTitle>Suggerimento</AlertTitle>
                                    <AlertDescription>
                                        {rephrasedQuestion}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {renderAttachments(currentNode as DecisionNode)}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                                {Object.entries((currentNode as DecisionNode).options!).map(([key, value]) => (
                                    <Button key={key} onClick={() => handleOptionClick(value)} variant="outline" size="lg" className="h-auto py-3">
                                        {key}
                                    </Button>
                                ))}
                            </div>
                            <div className="text-center mt-6">
                                <Button variant="ghost" size="sm" onClick={handleRephrase} disabled={rephrasing}>
                                    {rephrasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
                                    Riformula la Domanda
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center p-4">
                            <p className="text-lg text-muted-foreground">L'albero decisionale sembra avere un formato non valido in questo passaggio.</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-between border-t pt-6">
                    <Button variant="ghost" onClick={handleBack} disabled={nodeHistory.length === 0 && treeStack.length === 0}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
                    </Button>
                    <Button variant="outline" onClick={handleRestart}>
                        <RotateCcw className="mr-2 h-4 w-4" /> Riavvia
                    </Button>
                </CardFooter>
            </Card>

            {/* Media Preview Dialog */}
            <Dialog open={!!previewingMedia} onOpenChange={(open) => !open && setPreviewingMedia(null)}>
                <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{previewingMedia?.name || 'Anteprima Media'}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 flex items-center justify-center bg-muted/50 rounded-md overflow-hidden">
                        {previewingMedia?.type === 'image' && (
                            <Image src={previewingMedia.url} alt={previewingMedia.name || 'Anteprima'} width={1000} height={800} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                        )}
                        {previewingMedia?.type === 'video' && (
                            <video src={previewingMedia.url} controls autoPlay className="w-full max-h-full" style={{ objectFit: 'contain' }} />
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPreviewingMedia(null)}>Chiudi</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
