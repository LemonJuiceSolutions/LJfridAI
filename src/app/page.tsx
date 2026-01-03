

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle, Loader2, ListTree, Download, Bot, Database, Trash2, Search, UploadCloud, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteAllTreesAction, deleteTreeAction, getTreesAction, importTreeFromJsonAction } from './actions';
import type { StoredTree } from '@/lib/types';
import { BrainCircuit, MessageSquareText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';


export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [trees, setTrees] = useState<StoredTree[]>([]);
  const { toast } = useToast();
  const [dialogState, setDialogState] = useState<'delete-single' | 'delete-all' | null>(null);
  const [treeToDelete, setTreeToDelete] = useState<StoredTree | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchTrees = async () => {
    setIsLoading(true);
    const result = await getTreesAction(); // Fetch everything (Rules + Pipelines)
    if (result.data) {
      setTrees(result.data);
    } else if (result.error) {
      toast({
        variant: "destructive",
        title: "Errore nel Caricamento",
        description: result.error,
      })
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchTrees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownloadAll = async () => {
    if (trees.length === 0) {
      toast({
        title: "Nessuna Regola da Esportare",
        description: "Crea una regola prima di esportare."
      });
      return;
    }
    setIsDownloading(true);
    try {
      const jsonString = JSON.stringify(trees, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'like-ai-said-regole.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Esportazione Riuscita",
        description: "Tutte le regole sono state scaricate."
      });

    } catch (e) {
      const error = e instanceof Error ? e.message : 'Si è verificato un errore imprevisto durante il download.';
      toast({
        variant: "destructive",
        title: "Esportazione Fallita",
        description: error,
      });
    } finally {
      setIsDownloading(false);
    }
  }

  const openDeleteSingleDialog = (tree: StoredTree) => {
    setTreeToDelete(tree);
    setDialogState('delete-single');
  };

  const handleConfirmDeletion = async () => {
    if (dialogState === 'delete-single') {
      await handleDeleteSingle();
    } else if (dialogState === 'delete-all') {
      await handleDeleteAll();
    }
  }

  const handleDeleteSingle = async () => {
    if (!treeToDelete || !treeToDelete.id) return;
    setIsDeleting(true);
    try {
      const result = await deleteTreeAction(treeToDelete.id);
      if (result.success) {
        toast({
          title: 'Regola Eliminata',
          description: `La regola "${treeToDelete.name}" è stata rimossa con successo.`,
        });
        await fetchTrees();
      } else {
        throw new Error(result.error || 'Eliminazione fallita');
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto.";
      toast({
        variant: "destructive",
        title: "Eliminazione Fallita",
        description: error,
      });
    } finally {
      closeDialog();
    }
  }

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAllTreesAction();
      if (result.success) {
        toast({
          title: 'Tutte le Regole Eliminate',
          description: 'Tutte le regole sono state rimosse.',
        });
        await fetchTrees();
      } else {
        throw new Error(result.error || 'Eliminazione di massa fallita');
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto.";
      toast({
        variant: "destructive",
        title: "Eliminazione Fallita",
        description: error,
      });
    } finally {
      closeDialog();
    }
  }

  const closeDialog = () => {
    setIsDeleting(false);
    setDialogState(null);
    setTreeToDelete(null);
  }

  const handleImportClick = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = handleFileChange;
    fileInput.click();
  };

  const handleFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error('Impossibile leggere il file.');

        let json;
        try {
          json = JSON.parse(text);
        } catch (err) {
          throw new Error('Il file non è un JSON valido.');
        }

        // Handle array (if multiple trees exported) or single object
        let treeData = Array.isArray(json) ? json[0] : json;

        if (!treeData) {
          throw new Error("Il file JSON è vuoto o non contiene dati validi.");
        }

        // Check if this is a raw tree structure (from single tree export via code-block.tsx)
        // Raw trees have 'question' at root but no 'name' property
        if (!treeData.name && treeData.question) {
          // Wrap raw tree into the format expected by importTreeFromJsonAction
          const fileName = file.name.replace(/\.json$/i, '');
          treeData = {
            name: fileName || 'Albero Importato',
            description: 'Importato da file JSON',
            jsonDecisionTree: treeData,
            type: 'RULE'
          };
        }

        if (!treeData.name) {
          throw new Error("Il file JSON non contiene dati validi per un albero (manca il nome o la struttura).");
        }

        const result = await importTreeFromJsonAction(treeData);

        if (result.success && result.treeId) {
          toast({
            title: "Importazione Riuscita",
            description: `L'albero "${treeData.name}" è stato importato.`
          });
          // Redirect to the new tree
          window.location.href = `/view/${result.treeId}`;
        } else {
          throw new Error(result.error || "Importazione fallita.");
        }

      } catch (err) {
        const message = err instanceof Error ? err.message : "Errore sconosciuto durante l'importazione.";
        toast({
          variant: "destructive",
          title: "Errore di Importazione",
          description: message
        });
      } finally {
        setIsImporting(false);
      }
    };

    reader.readAsText(file);
  };

  const filteredTrees = trees.filter(tree => {
    const query = searchQuery.toLowerCase();
    if (!query) return true;
    const nameMatch = tree.name.toLowerCase().includes(query);
    const descriptionMatch = tree.description.toLowerCase().includes(query);
    return nameMatch || descriptionMatch;
  });

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1">
        <div className="container mx-auto px-4 py-8 md:px-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Flussi & Regole</CardTitle>
                  <CardDescription>
                    Gestisci le tue regole decisionali e pipeline di dati in un unico posto.
                  </CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link href="/create?type=RULE">
                    <Button variant="default" className="bg-primary hover:bg-primary/90">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Nuovo Flusso
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={handleImportClick}
                    disabled={isLoading || isImporting}
                  >
                    {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                    Importa
                  </Button>
                  <Button
                    variant="outline"
                    className="border-[#ff2800] text-[#ff2800] hover:bg-red-50 hover:text-[#ff2800]"
                    onClick={() => setDialogState('delete-all')}
                    disabled={isLoading || trees.length === 0}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Elimina Tutte
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca per nome o descrizione..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : trees.length > 0 ? (
                <div className="grid gap-4">
                  {filteredTrees.map((tree) => (
                    <div key={tree.id} className="group flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <Link href={`/view/${tree.id}`} className="flex-grow">
                        <h3 className="font-semibold text-lg">{tree.name}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{tree.description}</p>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteSingleDialog(tree);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {filteredTrees.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card p-8 text-center min-h-[200px]">
                      <Search className="h-12 w-12 text-muted-foreground" />
                      <h2 className="mt-6 text-xl font-semibold">Nessun Risultato Trovato</h2>
                      <p className="mt-2 text-muted-foreground">
                        Nessuna regola corrisponde alla tua ricerca &quot;{searchQuery}&quot;.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card p-8 text-center min-h-[200px]">
                  <ListTree className="h-12 w-12 text-muted-foreground" />
                  <h2 className="mt-6 text-xl font-semibold">Ancora Nessuna Regola</h2>
                  <p className="mt-2 text-muted-foreground">
                    Crea la tua prima regola usando gli esempi AI o descrivendo un tuo processo.
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/create?type=RULE">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Crea il Primo Flusso
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <footer className="border-t">
        <div className="container mx-auto flex h-14 items-center justify-center px-4 md:px-6">
          <p className="text-sm text-muted-foreground">Like AI Said &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>

      <AlertDialog open={!!dialogState} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogState === 'delete-all' ?
                "Questa azione non può essere annullata. Questo eliminerà permanentemente TUTTE le regole." :
                `Questa azione non può essere annullata. Questo eliminerà permanentemente la regola "${treeToDelete?.name}".`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDialog} disabled={isDeleting}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeletion} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><Trash2 className="mr-2 h-4 w-4" />Sì, elimina</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


