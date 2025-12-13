

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
    if(initialTree) {
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

  const handleOptionClick = async (nextNode: HistoryItem) => {
    if(currentNode) {
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
        } catch(e) {
            toast({ variant: 'destructive', title: 'Errore', description: 'Il sotto-albero è malformato.' });
            handleBack();
        }
    } else {
       setCurrentNode(nextNode);
       setRephrasedQuestion(null);
    }
  };

  const handleRestart = () => {
    if(initialTree) {
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
        setCurrentNode(parentFrame.path[parentFrame.path.length-1]);
        setRephrasedQuestion(null);
    }
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
        if(result.error) {
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
                    <GitBranch className="h-4 w-4"/>
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
                         // We assume array nodes are leaves for now. 
                         // If we encounter a question in an array, we might need different handling, but usually it's multiple results.
                         if (typeof node === 'string' || (typeof node === 'object' && node !== null && 'decision' in node)) {
                             return renderLeafNode(node as DecisionLeaf | string, index);
                         }
                         return null; // Skip non-leaf nodes in array for now or handle them if needed
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
                        {rephrasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Brain className="mr-2 h-4 w-4" />}
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
                    <video src={previewingMedia.url} controls autoPlay className="w-full max-h-full" style={{objectFit: 'contain'}} />
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
