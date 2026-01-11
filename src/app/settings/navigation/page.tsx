
'use client';

import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { PlusCircle, Edit, Trash2, RefreshCw, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigation } from '@/hooks/use-navigation';
import { EditNavItemDialog } from '@/components/settings/edit-nav-item-dialog';
import * as icons from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { NavItem } from '@/hooks/use-navigation';


export default function NavigationSettingsPage() {
  const { navItems, settingsNavItems, addNavItem, updateNavItem, removeNavItem, restoreDefaults, moveNavItem } = useNavigation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingGroup, setEditingGroup] = useState<'main' | 'settings' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; group: 'main' | 'settings' | null; item: NavItem | null }>({ open: false, group: null, item: null });

  const handleDeleteClick = (group: 'main' | 'settings', item: NavItem) => {
    setDeleteConfirm({ open: true, group, item });
  };

  const handleDeleteConfirm = async () => {
    if (deleteConfirm.group && deleteConfirm.item) {
      await removeNavItem(deleteConfirm.group, deleteConfirm.item.href);
    }
    setDeleteConfirm({ open: false, group: null, item: null });
  };

  const handleAddNew = (group: 'main' | 'settings') => {
    setEditingItem(null);
    setEditingGroup(group);
    setIsDialogOpen(true);
  };

  const handleEdit = (item: any, group: 'main' | 'settings') => {
    setEditingItem(item);
    setEditingGroup(group);
    setIsDialogOpen(true);
  };

  const handleSave = (itemData: any) => {
    if (editingItem) {
      updateNavItem(editingGroup!, itemData, editingItem.href);
    } else {
      addNavItem(editingGroup!, itemData);
    }
  };

  const renderTable = (items: NavItem[], group: 'main' | 'settings', title: string) => {
    return (
      <Card>
        <CardHeader className="py-4">
          <CardTitle className='text-base'>{title}</CardTitle>
          <CardDescription>Trascina le card per riordinare le voci di navigazione.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 py-1 h-8"></TableHead>
                <TableHead className="py-1 h-8">Etichetta</TableHead>
                <TableHead className="py-1 h-8">Percorso</TableHead>
                <TableHead className="text-right py-1 h-8">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const IconComponent = icons[item.icon as keyof typeof icons] as React.ElementType || icons.HelpCircle;
                return (
                  <TableRow key={item.href}>
                    <TableCell className="py-1"><IconComponent className="h-5 w-5" /></TableCell>
                    <TableCell className="font-medium py-1">{item.label}</TableCell>
                    <TableCell className="text-muted-foreground py-1">{item.href}</TableCell>
                    <TableCell className="text-right py-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveNavItem(group, index, index - 1)} disabled={index === 0}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveNavItem(group, index, index + 1)} disabled={index === items.length - 1}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item, group)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteClick(group, item)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <Button size="sm" variant="outline" className="mt-4 gap-1" onClick={() => handleAddNew(group)}>
            <PlusCircle className="h-3.5 w-3.5" />
            Aggiungi Voce
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-6">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Gestione Navigazione</CardTitle>
            <CardDescription>
              Aggiungi, modifica o rimuovi voci di navigazione.
            </CardDescription>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                Ripristina Predefiniti
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Questa azione ripristinerà le voci di menu principali e delle impostazioni
                  ai loro valori predefiniti. Tutte le personalizzazioni andranno perse.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={restoreDefaults}>Continua</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="space-y-6">
          {renderTable(navItems, 'main', 'Menu Principale')}
          {renderTable(settingsNavItems, 'settings', 'Menu Impostazioni')}
        </div>

      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare la voce &quot;{deleteConfirm.item?.label}&quot;?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditNavItemDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        item={editingItem}
        onSave={handleSave}
      />
    </>
  );
}
