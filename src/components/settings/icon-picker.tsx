'use client';

import React, { useState, useMemo } from 'react';
import * as icons from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { iconList } from '@/lib/icons';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';


type IconPickerProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSelect: (iconName: keyof typeof icons) => void;
};


export function IconPicker({ isOpen, setIsOpen, onSelect }: IconPickerProps) {
  const [search, setSearch] = useState('');

  const filteredIcons = useMemo(() => {
    if (!search) return iconList;
    return iconList.filter(name => name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const handleSelectIcon = (iconName: keyof typeof icons) => {
    onSelect(iconName);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scegli un'Icona</DialogTitle>
          <DialogDescription>
            Cerca e seleziona un'icona per la tua voce di menu.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Input
            placeholder="Cerca icone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ScrollArea className="h-[400px]">
          <div className="grid grid-cols-8 gap-2 p-4">
            <TooltipProvider>
                {filteredIcons.map((iconName) => {
                const typedIconName = iconName as keyof typeof icons;
                const IconComponent = icons[typedIconName] as React.ElementType;
                if (!IconComponent) return null;

                return (
                    <Tooltip key={typedIconName}>
                        <TooltipTrigger asChild>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleSelectIcon(typedIconName)}
                            className="h-12 w-12"
                        >
                            <IconComponent className="h-6 w-6" />
                        </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                        <p>{iconName}</p>
                        </TooltipContent>
                    </Tooltip>
                );
                })}
            </TooltipProvider>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
