'use client';

import React, { useState, useEffect } from 'react';
import * as icons from 'lucide-react';
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
import { Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { IconPicker } from './icon-picker';
import { NavItem } from '@/hooks/use-navigation';

type EditNavItemDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  item: Omit<NavItem, 'href'> | (NavItem | null);
  onSave: (item: Omit<NavItem, 'href'> | NavItem) => void;
};

export function EditNavItemDialog({ isOpen, setIsOpen, item, onSave }: EditNavItemDialogProps) {
  const [label, setLabel] = useState('');
  const [href, setHref] = useState('');
  const [icon, setIcon] = useState('HelpCircle');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const { toast } = useToast();

  const isEditing = item && 'href' in item && item.href !== undefined;

  useEffect(() => {
    if (isOpen) {
        if (item) {
          setLabel(item.label);
          setIcon(item.icon);
          if ('href' in item) {
              setHref(item.href);
          }
        } else {
          setLabel('');
          setHref(''); // Href will be set by the hook
          setIcon('HelpCircle');
        }
    }
  }, [item, isOpen]);

  const handleSave = () => {
    if (!label.trim() || !icon.trim()) {
      toast({
        variant: 'destructive',
        title: 'Campi Mancanti',
        description: 'Per favore, compila tutti i campi.',
      });
      return;
    }

    if (isEditing) {
        onSave({ label, href, icon });
    } else {
        onSave({ label, icon }); // Let the hook handle href generation
    }
    
    setIsOpen(false);
  };
  
  const IconComponent = (icons as any)[icon] || icons.HelpCircle;

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modifica Voce Menu' : 'Aggiungi Nuova Voce'}</DialogTitle>
          <DialogDescription>
            Personalizza l'etichetta, il percorso e l'icona della voce di menu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="nav-label" className="text-right">Etichetta</Label>
            <Input id="nav-label" value={label} onChange={(e) => setLabel(e.target.value)} className="col-span-3" />
          </div>
          {isEditing && (
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nav-href" className="text-right">Percorso (href)</Label>
                <Input id="nav-href" value={href} onChange={(e) => setHref(e.target.value)} className="col-span-3" placeholder="/nome-pagina" />
            </div>
          )}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="nav-icon" className="text-right">Icona</Label>
            <div className="col-span-3 flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setIsIconPickerOpen(true)}>
                    <IconComponent className="h-5 w-5" />
                </Button>
                <span className="text-sm text-muted-foreground">{icon}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <IconPicker 
        isOpen={isIconPickerOpen}
        setIsOpen={setIsIconPickerOpen}
        onSelect={setIcon}
    />
    </>
  );
}
