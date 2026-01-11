
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, TestTube2 } from 'lucide-react';
import type { Connection } from '@/components/widgets/setup/SetupWidget';
import { useToast } from '@/hooks/use-toast';

type ConnectionDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSave: (connection: Omit<Connection, 'id' | 'status' | 'lastSync'> & { id?: string }) => void;
  connection: Connection | null;
};

type ConnectionType = Connection['type'];

export function ConnectionDialog({ isOpen, setIsOpen, onSave, connection }: ConnectionDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<ConnectionType>('SQL Database');
  const [details, setDetails] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (connection) {
      setName(connection.name);
      setType(connection.type);
      // In a real scenario, you'd populate details from the connection object
      setDetails({});
    } else {
      setName('');
      setType('SQL Database');
      setDetails({});
    }
  }, [connection, isOpen]);

  const handleSave = () => {
    onSave({ id: connection?.id, name, type, ...details });
    setIsOpen(false);
    toast({
      title: "Connessione Salvata!",
      description: `La connessione "${name}" è stata salvata con successo.`,
    });
  };

  const handleTestConnection = () => {
    toast({
      title: "Test Connessione...",
      description: "Simulazione del test di connessione in corso...",
    });
    setTimeout(() => {
      toast({
        title: "Connessione Riuscita!",
        description: `La connessione al ${type} funziona correttamente.`,
      });
    }, 2000);
  };

  const renderFieldsForType = () => {
    switch (type) {
      case 'SQL Database':
        return (
          <>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="server" className="text-right">Server</Label>
              <Input id="server" placeholder="e.g., mysql.example.com" className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="database" className="text-right">Database</Label>
              <Input id="database" placeholder="Nome del database" className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="user" className="text-right">Utente</Label>
              <Input id="user" placeholder="Nome utente" className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="password" className="text-right">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" className="col-span-3" />
            </div>
          </>
        );
      case 'SharePoint':
        return (
          <>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="siteUrl" className="text-right">URL Sito</Label>
              <Input id="siteUrl" placeholder="https://contoso.sharepoint.com/sites/..." className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientId" className="text-right">Client ID</Label>
              <Input id="clientId" placeholder="GUID dell'app" className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="clientSecret" className="text-right">Client Secret</Label>
              <Input id="clientSecret" type="password" placeholder="••••••••" className="col-span-3" />
            </div>
          </>
        );
      case 'HubSpot':
        return (
          <>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="apiKey" className="text-right">API Key</Label>
              <Input id="apiKey" type="password" placeholder="••••••••" className="col-span-3" />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{connection ? 'Modifica Connessione' : 'Aggiungi Nuova Connessione'}</DialogTitle>
          <DialogDescription>
            Configura i dettagli per connetterti a una nuova sorgente dati.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., DB Produzione" className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">Tipo</Label>
            <div className='col-span-3'>
              <Select value={type} onValueChange={(value) => setType(value as ConnectionType)} disabled={!!connection}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SQL Database">Database SQL</SelectItem>
                  <SelectItem value="SharePoint">SharePoint</SelectItem>
                  <SelectItem value="HubSpot">HubSpot</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {renderFieldsForType()}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="outline" onClick={handleTestConnection}>
            <TestTube2 className="mr-2 h-4 w-4" />
            Test Connessione
          </Button>
          <div>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Annulla</Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Salva Connessione
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
