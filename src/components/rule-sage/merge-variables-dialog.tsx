


'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GitMerge, Loader2, Plus, X } from 'lucide-react';
import type { Variable, VariableOption } from '@/lib/types';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import _ from 'lodash';
import { nanoid } from 'nanoid';

interface MergeVariablesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  variablesToMerge: Variable[];
  onConfirmMerge: (sourceVariable: Variable, targetVariable: Variable, finalName: string, finalPossibleValues: VariableOption[]) => void;
  isSaving: boolean;
}

export default function MergeVariablesDialog({
  isOpen,
  onClose,
  variablesToMerge,
  onConfirmMerge,
  isSaving,
}: MergeVariablesDialogProps) {

  const [targetVariableId, setTargetVariableId] = useState<string | undefined>(undefined);
  const [finalName, setFinalName] = useState('');
  const [finalPossibleValues, setFinalPossibleValues] = useState<VariableOption[]>([]);
  const [newOption, setNewOption] = useState<Partial<VariableOption>>({});

  useEffect(() => {
    if (isOpen && variablesToMerge.length === 2) {
      const combinedOptions = _.uniqBy(
          [...(variablesToMerge[0].possibleValues || []), ...(variablesToMerge[1].possibleValues || [])].map(opt => ({...opt, id: opt.id || nanoid(8)})), 
          'name'
      );
      setFinalPossibleValues(combinedOptions);
      
      // Default to the first variable as the target
      setTargetVariableId(variablesToMerge[0].id);
      setFinalName(variablesToMerge[0].name);
      setNewOption({ id: nanoid(8), name: '', value: combinedOptions.length, abbreviation: ''});
    }
  }, [isOpen, variablesToMerge]);

  const handleTargetChange = (value: string) => {
    setTargetVariableId(value);
    const selectedTarget = variablesToMerge.find(v => v.id === value);
    if(selectedTarget) {
      setFinalName(selectedTarget.name);
    }
  }
  
  const handleAddOption = () => {
    if (newOption.name?.trim()) {
      const newOptionToAdd: VariableOption = {
          id: newOption.id || nanoid(8),
          name: newOption.name.trim(),
          value: newOption.value ?? finalPossibleValues.length,
          abbreviation: newOption.abbreviation?.trim().toUpperCase() || newOption.name.trim().substring(0,3).toUpperCase(),
      };
      if (!finalPossibleValues.some(v => v.name === newOptionToAdd.name)) {
          setFinalPossibleValues([...finalPossibleValues, newOptionToAdd]);
          setNewOption({ id: nanoid(8), name: '', value: finalPossibleValues.length + 1, abbreviation: ''});
      }
    }
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = [...finalPossibleValues];
    newOptions.splice(index, 1);
    setFinalPossibleValues(newOptions);
  }

  const handleConfirmClick = () => {
    const targetVariable = variablesToMerge.find(v => v.id === targetVariableId);
    const sourceVariable = variablesToMerge.find(v => v.id !== targetVariableId);
    
    if (targetVariable && sourceVariable && finalName.trim() && finalPossibleValues.length > 0) {
      onConfirmMerge(sourceVariable, targetVariable, finalName.trim(), finalPossibleValues);
    }
  };

  if (variablesToMerge.length !== 2) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fondi Variabili Manualmente</DialogTitle>
          <DialogDescription>
            Stai per fondere due variabili. Scegli la variabile di destinazione (il cui ID verrà mantenuto), imposta un nome finale e unisci i valori. L'altra variabile verrà eliminata e tutti i suoi riferimenti verranno aggiornati.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6 max-h-[60vh] overflow-y-auto pr-4">
           <div className='space-y-2'>
                <Label>1. Scegli la variabile di destinazione</Label>
                <RadioGroup value={targetVariableId} onValueChange={handleTargetChange} disabled={isSaving}>
                    {variablesToMerge.map(v => (
                         <div key={v.id} className="flex items-center space-x-2 p-3 border rounded-md has-[[data-state=checked]]:border-primary">
                            <RadioGroupItem value={v.id!} id={`radio-${v.id}`} />
                            <Label htmlFor={`radio-${v.id}`} className='font-normal w-full'>
                                <p className='font-medium'>{v.name}</p>
                                <p className='text-xs text-muted-foreground font-mono'>{v.id}</p>
                                <p className='text-xs text-muted-foreground mt-1'>Valori: {(v.possibleValues || []).map(o => o.name).join(', ')}</p>
                            </Label>
                        </div>
                    ))}
                </RadioGroup>
           </div>
           
           <div className='space-y-2'>
                <Label htmlFor="final-name">2. Imposta il nome finale</Label>
                <Input
                    id="final-name"
                    value={finalName}
                    onChange={(e) => setFinalName(e.target.value)}
                    disabled={isSaving}
                />
           </div>

            <div className='space-y-2'>
                <Label>3. Unisci e modifica i valori possibili</Label>
                <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px] bg-secondary/50">
                    {finalPossibleValues.map((opt, index) => (
                        <Badge key={opt.id || index} variant="outline" className="flex items-center gap-1.5 font-mono">
                            <span>{opt.name} ({opt.abbreviation}, {opt.value})</span>
                            <button
                                onClick={() => handleRemoveOption(index)}
                                disabled={isSaving}
                                className="rounded-full hover:bg-destructive/20 disabled:hover:bg-transparent"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
                 <div className="flex gap-2">
                    <Input
                        value={newOption.name || ''}
                        onChange={(e) => setNewOption({...newOption, name: e.target.value})}
                        onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddOption(); }}}
                        placeholder="Aggiungi nuova opzione..."
                        disabled={isSaving}
                    />
                    <Button size="sm" variant="outline" onClick={handleAddOption} disabled={isSaving || !newOption.name?.trim()}>
                        <Plus className="h-4 w-4 mr-2"/> Aggiungi
                    </Button>
                </div>
            </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Annulla
          </Button>
          <Button onClick={handleConfirmClick} disabled={isSaving || !finalName.trim() || finalPossibleValues.length === 0}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitMerge className="mr-2 h-4 w-4" />}
            Conferma Fusione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
