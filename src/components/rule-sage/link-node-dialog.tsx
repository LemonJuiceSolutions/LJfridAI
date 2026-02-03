

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import type { StoredTree } from '@/lib/types';
import { nanoid } from 'nanoid';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

type LinkType = 'internal' | 'sub-tree';

interface LinkNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string, option: string, targetNodeId: string) => void;
  onSaveSubTree: (path: string, option: string, targetTreeId: string) => void;
  onRemoveLink: (path: string) => void;
  path: string;
  isSaving: boolean;
  nodeList: { id: string; text: string }[];
  allTrees: StoredTree[];
  currentNode: any;
}


export default function LinkNodeDialog({
  isOpen,
  onClose,
  onSave,
  onSaveSubTree,
  onRemoveLink,
  path,
  isSaving,
  nodeList,
  allTrees,
  currentNode
}: LinkNodeDialogProps) {

  const [linkType, setLinkType] = useState<LinkType>('internal');
  const [targetNodeId, setTargetNodeId] = useState('');
  const [targetTreeId, setTargetTreeId] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (currentNode && typeof currentNode === 'object') {
        if ('subTreeRef' in currentNode && currentNode.subTreeRef) {
          setLinkType('sub-tree');
          setTargetTreeId(currentNode.subTreeRef);
          setTargetNodeId('');
        } else if ('ref' in currentNode && currentNode.ref) {
          setLinkType('internal');
          setTargetNodeId(currentNode.ref);
          setTargetTreeId('');
        } else {
          // It's a new link, reset to default
          setLinkType('internal');
          setTargetNodeId('');
          setTargetTreeId('');
        }
      } else {
        // Default state for creating a new link
        setLinkType('internal');
        setTargetNodeId('');
        setTargetTreeId('');
      }
    }
  }, [isOpen, currentNode]);


  const handleSaveClick = () => {
    if (linkType === 'internal') {
      onSave(path, '', targetNodeId);
    } else {
      onSaveSubTree(path, '', targetTreeId);
    }
  };

  const handleRemoveClick = () => {
    onRemoveLink(path);
  }

  const isExistingLink = (currentNode && (('ref' in currentNode && currentNode.ref) || ('subTreeRef' in currentNode && currentNode.subTreeRef)));
  const canSave = (linkType === 'internal' ? targetNodeId : targetTreeId) && !isSaving;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Collega a Nodo Esistente</DialogTitle>
          <DialogDescription>
            Scegli a quale nodo o albero collegare questa opzione per creare un flusso ricorsivo o lanciare un sotto-processo.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] -mx-6 px-6">
          <div className="py-4 space-y-6">
            <RadioGroup value={linkType} onValueChange={(v) => setLinkType(v as LinkType)} className="grid grid-cols-2 gap-4">
              <div>
                <RadioGroupItem value="internal" id={`r-internal-${path}`} className="peer sr-only" />
                <Label
                  htmlFor={`r-internal-${path}`}
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  Nodo Interno
                </Label>
              </div>
              <div>
                <RadioGroupItem value="sub-tree" id={`r-sub-tree-${path}`} className="peer sr-only" />
                <Label
                  htmlFor={`r-sub-tree-${path}`}
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  Sotto-Albero
                </Label>
              </div>
            </RadioGroup>

            <div className="grid gap-2">
              {linkType === 'internal' ? (
                <>
                  <Label>Nodo di Destinazione (in questo albero)</Label>
                  <Select onValueChange={setTargetNodeId} value={targetNodeId} disabled={isSaving}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona un nodo a cui collegarti..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nodeList.map(node => (
                        <SelectItem key={node.id} value={node.id}>
                          {node.text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Label>Sotto-Albero di Destinazione</Label>
                  <Select onValueChange={setTargetTreeId} value={targetTreeId} disabled={isSaving}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona un albero da lanciare..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allTrees.map(tree => (
                        <SelectItem key={tree.id} value={tree.id}>
                          {tree.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between w-full">
          <div>
            {isExistingLink && (
              <Button variant="destructive" onClick={handleRemoveClick} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Rimuovi Collegamento
              </Button>
            )}
          </div>
          <div className='flex flex-col-reverse sm:flex-row gap-2'>
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Annulla</Button>
            <Button onClick={handleSaveClick} disabled={!canSave}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isExistingLink ? 'Aggiorna' : 'Crea'} Collegamento
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
