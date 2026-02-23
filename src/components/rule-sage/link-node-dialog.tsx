

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
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown, Loader2, Trash2 } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

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
  const [nodeComboOpen, setNodeComboOpen] = useState(false);
  const [treeComboOpen, setTreeComboOpen] = useState(false);

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
          setLinkType('internal');
          setTargetNodeId('');
          setTargetTreeId('');
        }
      } else {
        setLinkType('internal');
        setTargetNodeId('');
        setTargetTreeId('');
      }
      setNodeComboOpen(false);
      setTreeComboOpen(false);
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

  const selectedNodeText = nodeList.find(n => n.id === targetNodeId)?.text;
  const selectedTreeName = allTrees.find(t => t.id === targetTreeId)?.name;

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
                  <Popover open={nodeComboOpen} onOpenChange={setNodeComboOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={nodeComboOpen}
                        className="w-full justify-between font-normal h-auto min-h-10 whitespace-normal text-left"
                        disabled={isSaving}
                      >
                        {targetNodeId && selectedNodeText
                          ? selectedNodeText
                          : "Cerca un nodo a cui collegarti..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cerca nodo..." />
                        <CommandList className="max-h-[200px]">
                          <CommandEmpty>Nessun nodo trovato.</CommandEmpty>
                          <CommandGroup>
                            {nodeList.map(node => (
                              <CommandItem
                                key={node.id}
                                value={node.text}
                                onSelect={() => {
                                  setTargetNodeId(node.id);
                                  setNodeComboOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", targetNodeId === node.id ? "opacity-100" : "opacity-0")} />
                                {node.text}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </>
              ) : (
                <>
                  <Label>Sotto-Albero di Destinazione</Label>
                  <Popover open={treeComboOpen} onOpenChange={setTreeComboOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={treeComboOpen}
                        className="w-full justify-between font-normal h-auto min-h-10 whitespace-normal text-left"
                        disabled={isSaving}
                      >
                        {targetTreeId && selectedTreeName
                          ? selectedTreeName
                          : "Cerca un albero da lanciare..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Cerca albero..." />
                        <CommandList className="max-h-[200px]">
                          <CommandEmpty>Nessun albero trovato.</CommandEmpty>
                          <CommandGroup>
                            {allTrees.map(tree => (
                              <CommandItem
                                key={tree.id}
                                value={tree.name}
                                onSelect={() => {
                                  setTargetTreeId(tree.id);
                                  setTreeComboOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", targetTreeId === tree.id ? "opacity-100" : "opacity-0")} />
                                {tree.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
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
