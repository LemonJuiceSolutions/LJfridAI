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
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf } from '@/lib/types';
import { nanoid } from 'nanoid';
import { ScrollArea } from '../ui/scroll-area';
import { Input } from '../ui/input';
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

interface AddChildNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string, newNode: any) => void;
  path: string;
  isSaving: boolean;
  availableNodes?: { id: string, text: string }[];
}

type NewNodeType = 'question' | 'decision' | 'link';

export default function AddChildNodeDialog({
  isOpen,
  onClose,
  onSave,
  path,
  isSaving,
  availableNodes = [],
}: AddChildNodeDialogProps) {
  
  // Form State
  const [nodeType, setNodeType] = useState<NewNodeType>('question');
  const [questionText, setQuestionText] = useState('');
  const [decisionText, setDecisionText] = useState('');
  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [linkComboOpen, setLinkComboOpen] = useState(false);


  const resetForm = () => {
    setNodeType('question');
    setDecisionText('');
    setQuestionText('');
    setSelectedLinkId('');
    setLinkComboOpen(false);
  }

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen]);
  

  const handleSaveClick = () => {
     let newNode: any;
    if (nodeType === 'question') {
        newNode = { question: questionText, options: {}, id: nanoid(8) };
    } else if (nodeType === 'decision') {
        newNode = {
            id: nanoid(8),
            decision: decisionText,
        };
    } else if (nodeType === 'link') {
        newNode = {
            id: nanoid(8),
            ref: selectedLinkId
        };
    }
    onSave(path, newNode);
  };
  
  const canProceed = (
    (nodeType === 'question' && questionText.trim() !== '') || 
    (nodeType === 'decision' && decisionText.trim() !== '') ||
    (nodeType === 'link' && selectedLinkId !== '')
  ) && !isSaving;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open && !isSaving) { onClose() } }}>
      <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi Nodo al Percorso</DialogTitle>
            <DialogDescription>
              Aggiungi un ulteriore passaggio a questa opzione.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] -mx-6 px-6">
            <div className="grid gap-6 py-4">
              <RadioGroup value={nodeType} onValueChange={(value: NewNodeType) => setNodeType(value)} disabled={isSaving}>
                  <Label>Tipo di Nodo</Label>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="question" id="r-child-question" />
                        <Label htmlFor="r-child-question">Domanda</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="decision" id="r-child-decision" />
                        <Label htmlFor="r-child-decision">Decisione</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="link" id="r-child-link" />
                        <Label htmlFor="r-child-link">Connettore (Link)</Label>
                    </div>
                  </div>
              </RadioGroup>
              
              {nodeType === 'question' && (
                  <div className="grid gap-4 border p-4 rounded-md">
                      <div className="grid gap-2">
                          <Label htmlFor="child-question-text">Testo della Domanda</Label>
                          <Textarea
                              id="child-question-text"
                              value={questionText}
                              onChange={(e) => setQuestionText(e.target.value)}
                              className="min-h-[100px]"
                              placeholder='Es: "Il dispositivo è in garanzia?"'
                              disabled={isSaving}
                          />
                      </div>
                </div>
              )}
              
              {nodeType === 'decision' && (
                <div className="grid gap-4 border p-4 rounded-md">
                    <div className="grid gap-2">
                        <Label htmlFor="child-decision-text">Testo della Decisione</Label>
                        <Textarea
                        id="child-decision-text"
                        value={decisionText}
                        onChange={(e) => setDecisionText(e.target.value)}
                        className="min-h-[80px]"
                        placeholder='Es: "Procedi con la riparazione gratuita."'
                        disabled={isSaving}
                        />
                    </div>
                </div>
              )}

              {nodeType === 'link' && (
                  <div className="grid gap-4 border p-4 rounded-md">
                      <div className="grid gap-2">
                          <Label>Seleziona Nodo di Destinazione</Label>
                          <Popover open={linkComboOpen} onOpenChange={setLinkComboOpen} modal={true}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={linkComboOpen}
                                className="w-full justify-between font-normal h-auto min-h-10 whitespace-normal text-left"
                                disabled={isSaving}
                              >
                                {selectedLinkId
                                  ? availableNodes.find(n => n.id === selectedLinkId)?.text || "Seleziona un nodo..."
                                  : "Cerca un nodo..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Cerca nodo..." />
                                <CommandList className="max-h-[200px]">
                                  <CommandEmpty>Nessun nodo trovato.</CommandEmpty>
                                  <CommandGroup>
                                    {availableNodes.map((node) => (
                                      <CommandItem
                                        key={node.id}
                                        value={node.text}
                                        onSelect={() => {
                                          setSelectedLinkId(node.id);
                                          setLinkComboOpen(false);
                                        }}
                                      >
                                        <Check className={cn("mr-2 h-4 w-4", selectedLinkId === node.id ? "opacity-100" : "opacity-0")} />
                                        {node.text}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <p className="text-sm text-muted-foreground mt-1">
                              Il flusso salterà direttamente al nodo selezionato.
                          </p>
                      </div>
                  </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Annulla</Button>
            <Button onClick={handleSaveClick} disabled={!canProceed}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aggiungi Nodo
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
