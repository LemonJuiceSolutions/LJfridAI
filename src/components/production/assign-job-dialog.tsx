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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send } from 'lucide-react';

type BaseJob = {
  jobId: string;
  quantity: number;
  product: string;
  sku: string;
};

type Supplier = {
  id: string;
  name: string;
};

type AssignJobDialogProps<TJob extends BaseJob> = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  job: TJob | null;
  onAssign: (
    job: TJob,
    quantity: number,
    destination: string,
    supplier?: string
  ) => void;
  suppliers: Supplier[];
};

export function AssignJobDialog<TJob extends BaseJob>({
  isOpen,
  setIsOpen,
  job,
  onAssign,
  suppliers,
}: AssignJobDialogProps<TJob>) {
  const [quantity, setQuantity] = useState(0);
  const [destination, setDestination] = useState('Internal');
  const [supplier, setSupplier] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (job) {
      setQuantity(job.quantity);
      setDestination('Internal');
      setSupplier(undefined);
    }
  }, [job]);

  const handleAssign = () => {
    if (job) {
      const selectedSupplier =
        destination === 'External'
          ? suppliers.find((s) => s.id === supplier)?.name
          : undefined;
      onAssign(job, quantity, destination, selectedSupplier);
    }
  };

  if (!job) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assegna Lotto di Produzione</DialogTitle>
          <DialogDescription>
            Definisci la quantità da lanciare e la destinazione per il lotto{' '}
            <strong>{job.jobId}</strong> ({job.product}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="quantity" className="text-right">
              Quantità
            </Label>
            <Input
              id="quantity"
              type="number"
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.min(Number(e.target.value), job.quantity))
              }
              className="col-span-3"
              max={job.quantity}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="destination" className="text-right">
              Destinazione
            </Label>
            <div className="col-span-3">
              <Select value={destination} onValueChange={setDestination}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona destinazione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Internal">Lavorazione Interna</SelectItem>
                  <SelectItem value="External">Fornitore Esterno</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {destination === 'External' && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="supplier" className="text-right">
                Fornitore
              </Label>
              <div className="col-span-3">
                <Select value={supplier} onValueChange={setSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona fornitore..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Fornitori</SelectLabel>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleAssign}
            disabled={
              !quantity ||
              quantity <= 0 ||
              (destination === 'External' && !supplier)
            }
          >
            <Send className="mr-2 h-4 w-4" /> Assegna e Lancia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
