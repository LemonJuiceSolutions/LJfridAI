

'use client';

import { useEffect, useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import _ from 'lodash';
import type { VariableOption } from '@/lib/types';

interface EditOptionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newOption: VariableOption) => void;
  initialOption: VariableOption;
  isSaving: boolean;
}

export default function EditOptionDialog({
  isOpen,
  onClose,
  onSave,
  initialOption,
  isSaving,
}: EditOptionDialogProps) {
  const [option, setOption] = useState<VariableOption>({ name: '', value: 0, abbreviation: ''});

  useEffect(() => {
    if (isOpen) {
      setOption(_.cloneDeep(initialOption));
    }
  }, [isOpen, initialOption]);

  const handleSaveClick = () => {
    const trimmedOption = {
        ...option,
        name: option.name.trim(),
        abbreviation: option.abbreviation.trim().toUpperCase()
    };
    if (_.isEqual(trimmedOption, initialOption) || trimmedOption.name === '') {
      onClose();
      return;
    }
    onSave(trimmedOption);
  };

  const title = 'Modifica Opzione Standard';
  const description = "Stai modificando un'opzione di una variabile standard. Le modifiche si propagheranno a tutti gli alberi che la usano.";
  const canSave = !isSaving && option.name.trim() !== '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
            <div className="grid gap-2">
                <Label htmlFor="option-name">Nome Opzione</Label>
                <Input
                    id="option-name"
                    value={option.name}
                    onChange={(e) => setOption(prev => ({...prev, name: e.target.value}))}
                    placeholder='Es: "Sì" o "Maggiore di 10"'
                    disabled={isSaving}
                />
            </div>
            <div className="grid grid-cols-2 gap-4">
                 <div className="grid gap-2">
                    <Label htmlFor="option-value">Valore Numerico</Label>
                    <Input
                        id="option-value"
                        type="number"
                        value={option.value}
                        onChange={(e) => setOption(prev => ({...prev, value: parseInt(e.target.value, 10) || 0}))}
                        disabled={isSaving}
                    />
                </div>
                 <div className="grid gap-2">
                    <Label htmlFor="option-abbr">Sigla (Max 3 caratteri)</Label>
                    <Input
                        id="option-abbr"
                        value={option.abbreviation}
                        onChange={(e) => setOption(prev => ({...prev, abbreviation: e.target.value}))}
                        maxLength={3}
                        disabled={isSaving}
                    />
                </div>
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Annulla</Button>
          <Button onClick={handleSaveClick} disabled={!canSave}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva Modifiche
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
