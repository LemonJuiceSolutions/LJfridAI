
'use client';

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
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

interface DeleteNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSaving: boolean;
  impactReport?: {
    isStandardVariable: boolean;
    nodesToDelete: string[];
  };
}

export default function DeleteNodeDialog({
  isOpen,
  onClose,
  onConfirm,
  isSaving,
  impactReport,
}: DeleteNodeDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
          <AlertDialogDescription>
            Questa azione non può essere annullata. Questo eliminerà permanentemente il nodo selezionato e tutti i suoi figli.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {impactReport?.isStandardVariable && (
            <div className="text-sm text-amber-600 bg-amber-500/10 p-3 rounded-md border border-amber-500/20">
                <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <p>Attenzione: Modifica a Cascata</p>
                </div>
                <p className="mt-2">Questa azione modificherà una variabile standard e si propagherà a tutti gli alberi che la usano.</p>
                {impactReport.nodesToDelete.length > 0 && (
                    <div className="mt-2">
                        <p className="font-medium">I seguenti nodi figli verranno eliminati:</p>
                        <ul className="list-disc pl-5 mt-1 text-xs">
                            {impactReport.nodesToDelete.map((nodeText, i) => <li key={i}>{nodeText}</li>)}
                        </ul>
                    </div>
                )}
            </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isSaving}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive hover:bg-destructive/90"
            onClick={onConfirm}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sì, elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
