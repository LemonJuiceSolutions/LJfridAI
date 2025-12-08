

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
import { Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Textarea } from '../ui/textarea';
import type { DecisionLeaf } from '@/lib/types';
import { nanoid } from 'nanoid';
import { ScrollArea } from '../ui/scroll-area';

interface AddNodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (path: string, optionName: string, newNode: DecisionLeaf | { question: string, options: {}, id: string }) => void;
  path: string;
  isSaving: boolean;
  variableId?: string;
}

type NewNodeType = 'question' | 'decision';

export default function AddNodeDialog({
  isOpen,
  onClose,
  onSave,
  path,
  isSaving,
  variableId,
}: AddNodeDialogProps) {
  
  // Form State
  const [optionName, setOptionName] = useState('');
  const [nodeType, setNodeType] = useState<NewNodeType>('question');
  const [questionText, setQuestionText] = useState('');
  const [decisionText, setDecisionText] = useState('');


  const resetForm = () => {
    setOptionName('');
    setNodeType('question');
    setDecisionText('');
    setQuestionText('');
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
    } else {
        newNode = {
            id: nanoid(8),
            decision: decisionText,
        };
    }
    onSave(path, optionName, newNode);
  };
  
  const canProceed = optionName.trim() !== '' && (nodeType === 'question' ? questionText.trim() !== '' : decisionText.trim() !== '') && !isSaving;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if(!open && !isSaving) { onClose() } }}>
      <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi Nuova Opzione</DialogTitle>
            <DialogDescription>
              Definisci la condizione di questa opzione e cosa dovrebbe accadere dopo.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] -mx-6 px-6">
            <div className="grid gap-6 py-4">
                {variableId && (
                  <div className="space-y-1 bg-primary/10 p-3 rounded-lg border border-primary/20">
                      <Label htmlFor='var-id'>ID Variabile Standard</Label>
                      <Input id="var-id" value={variableId} readOnly disabled className="font-mono text-xs" />
                      <p className="text-xs text-muted-foreground">Stai aggiungendo un'opzione a una variabile standard. L'opzione deve essere aggiunta dalla pagina Variabili per essere globale.</p>
                  </div>
                )}
                <div className="grid grid-cols-6 gap-2">
                  <div className='col-span-6'>
                    <Label htmlFor="option-name">Nome Opzione</Label>
                    <Input
                      id="option-name"
                      value={optionName}
                      onChange={(e) => setOptionName(e.target.value)}
                      placeholder='Es: "Sì", "No"'
                      disabled={isSaving}
                    />
                  </div>
              </div>
              <RadioGroup value={nodeType} onValueChange={(value: NewNodeType) => setNodeType(value)} disabled={isSaving}>
                  <Label>Tipo di Nodo Successivo</Label>
                  <div className="flex items-center space-x-4 mt-2">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="question" id="r-question" />
                        <Label htmlFor="r-question">Domanda</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="decision" id="r-decision" />
                        <Label htmlFor="r-decision">Decisione</Label>
                    </div>
                  </div>
              </RadioGroup>
              
              {nodeType === 'question' ? (
                  <div className="grid gap-4 border p-4 rounded-md">
                      <div className="grid gap-2">
                          <Label htmlFor="question-text">Testo della Domanda</Label>
                          <Textarea
                              id="question-text"
                              value={questionText}
                              onChange={(e) => setQuestionText(e.target.value)}
                              className="min-h-[100px]"
                              placeholder='Es: "Il dispositivo è in garanzia?"'
                              disabled={isSaving}
                          />
                      </div>
                </div>
              ) : (
                <div className="grid gap-4 border p-4 rounded-md">
                    <div className="grid gap-2">
                        <Label htmlFor="decision-text">Testo della Decisione (Obbligatorio)</Label>
                        <Textarea
                        id="decision-text"
                        value={decisionText}
                        onChange={(e) => setDecisionText(e.target.value)}
                        className="min-h-[80px]"
                        placeholder='Es: "Procedi con la riparazione gratuita."'
                        disabled={isSaving}
                        />
                    </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Annulla</Button>
            <Button onClick={handleSaveClick} disabled={!canProceed}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aggiungi Opzione
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
