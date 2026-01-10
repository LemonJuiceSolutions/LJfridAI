'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Save, X, Loader2 } from 'lucide-react';
import TextWidget from '@/components/dashboard/text-widget';

type EndNodeEditorDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  node: any;
  onSave: (node: any) => void;
  reportData: any;
  isLoadingData: boolean;
};

export function EndNodeEditorDialog({
  isOpen,
  setIsOpen,
  node,
  onSave,
  reportData,
  isLoadingData
}: EndNodeEditorDialogProps) {
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(true);

  useEffect(() => {
    if (node) {
      setContent(node.content || '<h1>Nuovo Report</h1><p>Aggiungi qui il tuo testo e formatta il report.</p>{{result}}');
    }
  }, [node]);

  const handleSave = () => {
    const updatedNode = { ...node, content };
    onSave(updatedNode);
    setIsOpen(false);
  };
  
  if (!node) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-[90vw] w-full h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle>{node.name}</DialogTitle>
          <DialogDescription>
            Crea un report personalizzato utilizzando i dati di output della pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-4">
            <TextWidget
                content={content}
                onContentChange={setContent}
                isEditing={isEditing}
                reportData={reportData}
                reportType={node.previewType}
                isLoadingData={isLoadingData}
            />
        </div>
        <DialogFooter className="p-4 border-t">
            <div className='flex justify-between w-full'>
                <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? 'Visualizza Anteprima' : 'Modifica Contenuto'}
                </Button>
                <div>
                    <Button variant="ghost" onClick={() => setIsOpen(false)}>
                        <X className="mr-2 h-4 w-4" /> Annulla
                    </Button>
                    <Button onClick={handleSave} className="ml-2">
                        <Save className="mr-2 h-4 w-4" /> Salva Report
                    </Button>
                </div>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
