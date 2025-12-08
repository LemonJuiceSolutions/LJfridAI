

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BrainCircuit, Loader2, Pencil, Check, GitMerge, Trash2 } from 'lucide-react';
import Link from 'next/link';
import _ from 'lodash';

import { getTreeAction, executeConsolidationAction, getStandardizationDataAction, updateTreeNodeAction } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { StoredTree, Variable, ConsolidationProposal, VariableOption } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import ResultsDisplay from '@/components/rule-sage/results-display';
import { Input } from '@/components/ui/input';
import ConsolidateVariablesDialog from '@/components/rule-sage/consolidate-variables-dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';


export default function ViewTreePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [tree, setTree] = useState<StoredTree | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [treeName, setTreeName] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [isConsolidateDialogOpen, setIsConsolidateDialogOpen] = useState(false);
  const [standardizationData, setStandardizationData] = useState<{ tree: StoredTree, dbVariables: Variable[] } | null>(null);

  
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const fetchTree = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const result = await getTreeAction(id);
    if (result.error || !result.data) {
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: result.error || "Impossibile caricare l'albero decisionale.",
      });
      router.push('/');
    } else {
      setTree(result.data);
      setTreeName(result.data.name);
    }
    setIsLoading(false);
  }, [id, toast, router]);


  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleNameSave = async () => {
    if (treeName.trim() !== tree?.name && tree) {
        setIsSaving(true);
        try {
            const result = await updateTreeNodeAction({ treeId: tree.id, nodePath: 'root', nodeData: JSON.stringify({ name: treeName.trim() }) });
            if (result.success) {
                await fetchTree();
                toast({ title: 'Nome aggiornato!' });
            } else {
                throw new Error(result.error || 'Salvataggio del nome fallito');
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
            toast({ variant: 'destructive', title: "Errore durante l'aggiornamento del nome", description: error });
        } finally {
            setIsSaving(false);
        }
    }
    setIsEditingName(false);
  };
  
  const handleSyncAndPropose = async () => {
    if (!id) return;
    setIsSyncing(true);
    try {
      const result = await getStandardizationDataAction(id);
      if (result.error || !result.data) {
        throw new Error(result.error || 'Impossibile recuperare i dati per la standardizzazione.');
      }
      setStandardizationData(result.data);
      setIsConsolidateDialogOpen(true);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto.';
      toast({ variant: 'destructive', title: 'Errore durante la Sincronizzazione', description: error });
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleConfirmConsolidation = async (
        approvedActions: {
            type: 'add' | 'merge';
            treeVarName: string;
            dbVarId?: string;
            finalName: string;
            finalOptions: VariableOption[];
        }[]
    ) => {
    if (!id) {
      setIsConsolidateDialogOpen(false);
      return;
    }
    
    setIsConsolidateDialogOpen(false);
    
    if (approvedActions.length === 0) {
        toast({ title: "Nessuna modifica", description: "Nessuna azione di consolidamento è stata approvata." });
        return;
    }

    setIsSaving(true);
    try {
        const result = await executeConsolidationAction(id, approvedActions);
        if (result.error || !result.data) {
            throw new Error(result.error || 'Aggiornamento fallito');
        }
        await fetchTree(); // Re-fetch the tree to show updates
        toast({
            title: 'Successo!',
            description: `L'albero è stato aggiornato con ${approvedActions.length} variabili standard.`,
        });
    } catch (e) {
        const error = e instanceof Error ? e.message : "Errore sconosciuto durante l'aggiornamento";
        toast({ variant: 'destructive', title: "Errore durante l'aggiornamento", description: error });
    } finally {
        setIsSaving(false);
    }
  };
  
  const isLoadingAction = isSyncing || isSaving;

  return (
    <div className="flex flex-col min-h-screen bg-background">
       <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2">
                <BrainCircuit className="h-7 w-7 text-primary" />
                <h1 className="text-xl font-bold">Like AI Said</h1>
            </Link>
          </div>
           <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla Lista
            </Link>
          </Button>
        </div>
      </header>
       <main className="flex-1 py-8">
        <div className="container mx-auto px-4 md:px-6">
          {isLoading && (
             <Card>
                <CardHeader>
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                    <div className="flex items-center justify-center p-8">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    </div>
                    <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
          )}
          {tree && !isLoading && (
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center flex-wrap gap-4">
                            <div className="flex-grow">
                                {isEditingName ? (
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            value={treeName}
                                            onChange={(e) => setTreeName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                                            className="text-2xl font-semibold h-10"
                                            disabled={isSaving}
                                        />
                                        <Button size="icon" onClick={handleNameSave} disabled={isSaving}><Check className="h-5 w-5"/></Button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <CardTitle className="text-3xl">{tree.name}</CardTitle>
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsEditingName(true)} disabled={isSaving}>
                                            <Pencil className="h-5 w-5" />
                                        </Button>
                                    </div>
                                )}
                                <CardDescription className="mt-2">ID: {tree.id}</CardDescription>
                            </div>
                            <div className='flex items-center gap-2'>
                                <Button size="sm" onClick={handleSyncAndPropose} disabled={isLoadingAction}>
                                    {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <GitMerge className="mr-2 h-4 w-4" />}
                                    Sincronizza Variabili
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                     <CardContent>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">Descrizione originale:</span> {tree.description}
                        </p>
                    </CardContent>
                </Card>
                 <ResultsDisplay 
                    result={tree} 
                    onDataRefresh={fetchTree}
                    isSaving={isSaving}
                />
            </div>
          )}
           {!tree && !isLoading && (
             <Card>
                <CardHeader>
                    <CardTitle>Non Trovato</CardTitle>
                    <CardDescription>L'albero decisionale richiesto non è stato trovato.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={() => router.push('/')}>Torna Indietro</Button>
                </CardContent>
             </Card>
           )}
        </div>
      </main>
      <footer className="border-t">
        <div className="container mx-auto flex h-14 items-center justify-center px-4 md:px-6">
          <p className="text-sm text-muted-foreground">Like AI Said &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
      
      {standardizationData && (
        <ConsolidateVariablesDialog
            isOpen={isConsolidateDialogOpen}
            onClose={() => setIsConsolidateDialogOpen(false)}
            onConfirm={handleConfirmConsolidation}
            tree={standardizationData.tree}
            dbVariables={standardizationData.dbVariables}
            isSaving={isSaving}
        />
      )}
      
    </div>
  );
}

    


    
