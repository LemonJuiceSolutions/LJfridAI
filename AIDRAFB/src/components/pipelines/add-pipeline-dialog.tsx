'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { PlusCircle } from 'lucide-react';

type AddPipelineDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onAdd: (name: string, description: string) => void;
};

export function AddPipelineDialog({ isOpen, setIsOpen, onAdd }: AddPipelineDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const { toast } = useToast();

  const handleAdd = () => {
    if (!name.trim()) {
        toast({
            variant: "destructive",
            title: "Nome Mancante",
            description: "Per favore, inserisci un nome per la pipeline."
        });
        return;
    }
    onAdd(name, description);
    setIsOpen(false);
    setName('');
    setDescription('');
    toast({
        title: "Pipeline Aggiunta!",
        description: `La pipeline "${name}" è stata creata con successo.`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aggiungi Nuova Pipeline</DialogTitle>
          <DialogDescription>
            Inserisci un nome e una descrizione per la tua nuova pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="pipeline-name" className="text-right">
              Nome
            </Label>
            <Input
              id="pipeline-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Analisi Vendite Mensili"
            />
          </div>
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="pipeline-description" className="text-right pt-2">
              Descrizione
            </Label>
            <Textarea
              id="pipeline-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              placeholder="Descrivi lo scopo di questa pipeline..."
            />
          </div>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
            <Button onClick={handleAdd}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Aggiungi Pipeline
            </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
