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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type InviteUserDialogProps = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onInvite: (email: string, role: string) => void;
};

export function InviteUserDialog({ isOpen, setIsOpen, onInvite }: InviteUserDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('production');
  const { toast } = useToast();

  const handleInvite = () => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast({
        variant: "destructive",
        title: "Email non valida",
        description: "Per favore, inserisci un indirizzo email valido.",
      });
      return;
    }
    onInvite(email, role);
    setIsOpen(false);
    setEmail('');
    setRole('production');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invita un Collega</DialogTitle>
          <DialogDescription>
            Inserisci l'email e assegna un ruolo al nuovo utente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="col-span-3"
              placeholder="collega@esempio.com"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="role" className="text-right">
              Ruolo
            </Label>
            <div className="col-span-3">
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un ruolo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="warehouse">Warehouse</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Annulla</Button>
          <Button onClick={handleInvite}>
            <Send className="mr-2 h-4 w-4" />
            Invia Invito
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
