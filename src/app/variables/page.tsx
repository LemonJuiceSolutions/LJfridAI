

'use client';

import { useEffect, useState, Fragment, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { Loader2, Database, BrainCircuit, ArrowLeft, Trash2, Pencil, Check, X, Search, Plus, GitMerge, ChevronDown, ChevronRight, CornerDownRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { deleteAllVariablesAction, deleteVariableAction, getVariablesAction, mergeVariablesAction, updateVariableAction } from '../actions';
import type { Variable, VariableOption } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import _ from 'lodash';
import { Checkbox } from '@/components/ui/checkbox';
import MergeVariablesDialog from '@/components/rule-sage/merge-variables-dialog';
import { nanoid } from 'nanoid';


type EditingState = {
    variableId: string;
    name: string;
    possibleValues: VariableOption[];
    newOption: Partial<VariableOption>;
} | null;


import { Suspense } from 'react';

function VariablesContent() {
    const [isLoading, setIsLoading] = useState(true);
    const [variables, setVariables] = useState<Variable[]>([]);
    const [dialogState, setDialogState] = useState<'delete-single' | 'delete-all' | null>(null);
    const [variableToDelete, setVariableToDelete] = useState<Variable | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const { toast } = useToast();

    const [editingState, setEditingState] = useState<EditingState>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedVariables, setSelectedVariables] = useState<Variable[]>([]);
    const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
    const [openVariables, setOpenVariables] = useState<Record<string, boolean>>({});

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const optionRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

    const fetchVariables = async () => {
        setIsLoading(true);
        const result = await getVariablesAction();
        if (result.data) {
            setVariables(result.data);
        } else if (result.error) {
            toast({
                variant: "destructive",
                title: "Errore nel Caricamento delle Variabili",
                description: result.error,
            })
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchVariables();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const varId = searchParams.get('varId');
        if (varId) {
            setOpenVariables(prev => ({ ...prev, [varId]: true }));
        }

        const optionId = window.location.hash.substring(1);
        if (optionId && optionRefs.current[optionId]) {
            setTimeout(() => {
                optionRefs.current[optionId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                optionRefs.current[optionId]?.classList.add('bg-primary/20', 'transition-all', 'duration-1000');
                setTimeout(() => {
                    optionRefs.current[optionId]?.classList.remove('bg-primary/20');
                }, 1500)
                const newUrl = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
                router.replace(newUrl, { scroll: false });
            }, 100);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variables, searchParams]);

    useEffect(() => {
        // Clear selections if variables list changes
        setSelectedVariables([]);
        // Do not clear openVariables here to handle deep links
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [variables]);

    const handleEditClick = (variable: Variable) => {
        if (variable.id) {
            setEditingState({
                variableId: variable.id,
                name: variable.name,
                possibleValues: _.cloneDeep(variable.possibleValues || []).map(v => ({ ...v, id: v.id || nanoid(8) })),
                newOption: { id: nanoid(8), name: '', value: (variable.possibleValues?.length || 0), abbreviation: '' },
            });
        }
    };

    const handleCancelEdit = () => {
        setEditingState(null);
    };

    const handleEditingStateChange = <K extends keyof NonNullable<EditingState>>(key: K, value: NonNullable<EditingState>[K]) => {
        setEditingState(prev => prev ? { ...prev, [key]: value } : null);
    }

    const handleSaveEdit = async () => {
        if (!editingState || !editingState.name.trim()) return;

        const originalVariable = variables.find(v => v.id === editingState.variableId);
        if (!originalVariable) return;

        setIsSaving(true);

        const newName = editingState.name.trim();
        const newPossibleValues = _.uniqBy(
            editingState.possibleValues
                .map(v => ({ ...v, name: v.name.trim(), id: v.id || nanoid(8) }))
                .filter(v => v.name),
            'name'
        );

        let updatePayload: Partial<Variable> = {};

        if (newName !== originalVariable.name) {
            updatePayload.name = newName;
        }
        if (!_.isEqual(newPossibleValues, originalVariable.possibleValues)) {
            updatePayload.possibleValues = newPossibleValues;
        }

        if (Object.keys(updatePayload).length === 0) {
            setIsSaving(false);
            handleCancelEdit();
            return;
        }

        try {
            const result = await updateVariableAction(editingState.variableId, editingState.variableId, updatePayload);
            if (result.success) {
                toast({
                    title: 'Variabile Aggiornata',
                    description: 'La variabile e tutti gli alberi collegati sono stati aggiornati.',
                });
                handleCancelEdit();
                await fetchVariables(); // RE-FETCH DATA to show the update
            } else {
                throw new Error(result.error || 'Salvataggio fallito');
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto.";
            toast({
                variant: "destructive",
                title: "Salvataggio Fallito",
                description: error,
            });
        } finally {
            setIsSaving(false);
        }
    }


    const openDeleteSingleDialog = (variable: Variable) => {
        setVariableToDelete(variable);
        setDialogState('delete-single');
    };

    const handleConfirmDeletion = async () => {
        if (dialogState === 'delete-single') {
            await handleDeleteSingle();
        } else if (dialogState === 'delete-all') {
            await handleDeleteAll();
        }
    }

    const handleDeleteSingle = async () => {
        if (!variableToDelete || !variableToDelete.id) return;
        setIsDeleting(true);
        try {
            const result = await deleteVariableAction(variableToDelete.id);
            if (result.success) {
                toast({
                    title: 'Variabile Eliminata',
                    description: `La variabile "${variableToDelete.name}" è stata rimossa con successo.`,
                });
                await fetchVariables();
            } else {
                throw new Error(result.error || 'Eliminazione fallita');
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto.";
            toast({
                variant: "destructive",
                title: "Eliminazione Fallita",
                description: error,
            });
        } finally {
            setIsDeleting(false);
            setDialogState(null);
            setVariableToDelete(null);
        }
    }

    const handleDeleteAll = async () => {
        setIsDeleting(true);
        try {
            const result = await deleteAllVariablesAction();
            if (result.success) {
                toast({
                    title: 'Tutte le Variabili Eliminate',
                    description: 'Il database delle variabili è stato svuotato con successo.',
                });
                await fetchVariables();
            } else {
                throw new Error(result.error || 'Eliminazione di massa fallita');
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto.";
            toast({
                variant: "destructive",
                title: "Eliminazione Fallita",
                description: error,
            });
        } finally {
            setIsDeleting(false);
            setDialogState(null);
        }
    }

    const closeDialog = () => {
        setDialogState(null);
        setVariableToDelete(null);
    }

    const handleAddOption = () => {
        if (editingState && editingState.newOption.name?.trim()) {
            const newOptionToAdd: VariableOption = {
                id: editingState.newOption.id || nanoid(8),
                name: editingState.newOption.name.trim(),
                value: editingState.newOption.value ?? editingState.possibleValues.length,
                abbreviation: editingState.newOption.abbreviation?.trim().toUpperCase() || editingState.newOption.name.trim().substring(0, 3).toUpperCase(),
            };

            if (!editingState.possibleValues.some(v => v.name === newOptionToAdd.name)) {
                const newPossibleValues = [...editingState.possibleValues, newOptionToAdd];
                setEditingState({
                    ...editingState,
                    possibleValues: newPossibleValues,
                    newOption: { id: nanoid(8), name: '', value: newPossibleValues.length, abbreviation: '' }
                });
            }
        }
    };

    const handleRemoveOption = (index: number) => {
        if (editingState) {
            const newOptions = [...editingState.possibleValues];
            newOptions.splice(index, 1);
            handleEditingStateChange('possibleValues', newOptions);
        }
    }

    const filteredVariables = variables.filter(variable => {
        const query = searchQuery.toLowerCase();
        if (!query) return true;

        const nameMatch = variable.name.toLowerCase().includes(query);
        const idMatch = variable.id?.toLowerCase().includes(query) || false;
        const valuesMatch = (variable.possibleValues || []).some(v => v.name.toLowerCase().includes(query) || v.abbreviation.toLowerCase().includes(query));
        const usedInMatch = (variable.usedIn || []).some(tree => tree.name.toLowerCase().includes(query));

        return nameMatch || idMatch || valuesMatch || usedInMatch;
    });

    const handleVariableSelection = (variable: Variable, isSelected: boolean) => {
        setSelectedVariables(prev => {
            if (isSelected) {
                return [...prev, variable];
            } else {
                return prev.filter(v => v.id !== variable.id);
            }
        })
    }

    const handleManualMerge = async (sourceVariable: Variable, targetVariable: Variable, finalName: string, finalPossibleValues: VariableOption[]) => {
        setIsSaving(true);
        setIsMergeDialogOpen(false);
        try {
            if (!sourceVariable.id || !targetVariable.id) throw new Error("ID variabili non validi.");
            const result = await mergeVariablesAction(sourceVariable.id, targetVariable.id, finalName, finalPossibleValues);

            if (result.success) {
                toast({
                    title: 'Fusione Riuscita',
                    description: `La variabile "${sourceVariable.name}" è stata fusa in "${targetVariable.name}".`,
                });
                await fetchVariables();
            } else {
                throw new Error(result.error || 'Fusione manuale fallita');
            }
        } catch (e) {
            const error = e instanceof Error ? e.message : "Si è verificato un errore imprevisto.";
            toast({
                variant: "destructive",
                title: "Fusione Fallita",
                description: error,
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2">
                            <BrainCircuit className="h-7 w-7 text-primary" />
                            <h1 className="text-xl font-bold">Like AI Said</h1>
                        </Link>
                    </div>
                    <Button asChild variant="outline">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Torna alla Home
                        </Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1">
                <div className="container mx-auto px-4 py-8 md:px-6">
                    <Card>
                        <CardHeader className="space-y-4">
                            <div className="flex flex-row items-start justify-between gap-4">
                                <div>
                                    <CardTitle>Database delle Variabili</CardTitle>
                                    <CardDescription>
                                        Questa è la lista centralizzata di tutte le variabili estratte dai tuoi processi.
                                    </CardDescription>
                                </div>
                                <div className='flex items-center gap-2'>
                                    {selectedVariables.length === 2 && (
                                        <Button
                                            variant="default"
                                            onClick={() => setIsMergeDialogOpen(true)}
                                            disabled={isLoading || isSaving}
                                            className="shrink-0"
                                        >
                                            <GitMerge className="mr-2 h-4 w-4" />
                                            Fondi Selezionate
                                        </Button>
                                    )}
                                    <Button
                                        variant="destructive"
                                        onClick={() => setDialogState('delete-all')}
                                        disabled={isLoading || variables.length === 0}
                                        className="shrink-0"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Elimina Tutte
                                    </Button>
                                </div>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Cerca per nome, ID, valori..."
                                    className="pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : variables.length > 0 ? (
                                <TooltipProvider>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]"></TableHead>
                                                <TableHead className="w-[40px]"></TableHead>
                                                <TableHead>Nome / ID Variabile</TableHead>
                                                <TableHead className="w-[15%]">Tipo</TableHead>
                                                <TableHead className="w-[30%]">Utilizzato In</TableHead>
                                                <TableHead className="text-right w-[120px]">Azioni</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredVariables.map((variable) => {
                                                const isCurrentEditing = editingState?.variableId === variable.id;
                                                const isSelected = selectedVariables.some(v => v.id === variable.id);
                                                const isExpanded = !!openVariables[variable.id!];

                                                return (
                                                    <Fragment key={variable.id}>
                                                        <TableRow data-state={isSelected ? "selected" : undefined}>
                                                            <TableCell>
                                                                <Checkbox
                                                                    checked={isSelected}
                                                                    onCheckedChange={(checked) => handleVariableSelection(variable, !!checked)}
                                                                    disabled={selectedVariables.length >= 2 && !isSelected}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Button variant="ghost" size="icon" className='h-8 w-8' onClick={() => setOpenVariables(prev => ({ ...prev, [variable.id!]: !prev[variable.id!] }))}>
                                                                    <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                                                </Button>
                                                            </TableCell>
                                                            <TableCell className="font-medium">
                                                                {isCurrentEditing ? (
                                                                    <Input
                                                                        value={editingState!.name}
                                                                        onChange={(e) => handleEditingStateChange('name', e.target.value)}
                                                                        className="h-8"
                                                                        disabled={isSaving}
                                                                    />
                                                                ) : (
                                                                    <div>
                                                                        <div className='font-semibold'>{variable.name}</div>
                                                                        <div className="font-mono text-xs text-muted-foreground">{variable.id}</div>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline">{variable.type}</Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-wrap items-center gap-1 overflow-hidden whitespace-nowrap">
                                                                    {(variable.usedIn && variable.usedIn.length > 0) ? (
                                                                        variable.usedIn.map(tree => (
                                                                            <Link key={tree.id} href={`/view/${tree.id}`} passHref>
                                                                                <Badge variant="secondary" className="hover:bg-accent cursor-pointer shrink-0">
                                                                                    {tree.name}
                                                                                </Badge>
                                                                            </Link>
                                                                        ))
                                                                    ) : (
                                                                        <span className="text-xs text-muted-foreground">Non utilizzato</span>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {isCurrentEditing ? (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <Button variant="ghost" size="icon" onClick={handleSaveEdit} disabled={isSaving} className="h-8 w-8 text-green-600 hover:text-green-700">
                                                                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                                        </Button>
                                                                        <Button variant="ghost" size="icon" onClick={handleCancelEdit} disabled={isSaving} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                                            <X className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(variable)} disabled={!!editingState} className="h-8 w-8 text-muted-foreground hover:text-primary">
                                                                            <Pencil className="h-4 w-4" />
                                                                        </Button>
                                                                        <Button variant="ghost" size="icon" onClick={() => openDeleteSingleDialog(variable)} disabled={!!editingState} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                        {isExpanded && (
                                                            <TableRow>
                                                                <TableCell colSpan={6} className="p-0">
                                                                    <div className='p-4 bg-muted/50'>
                                                                        <h4 className="font-semibold text-sm mb-2 ml-2">Valori Possibili</h4>
                                                                        {(variable.possibleValues || []).length > 0 ? (
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow>
                                                                                        <TableHead className='w-[10px]'></TableHead>
                                                                                        <TableHead>ID Valore</TableHead>
                                                                                        <TableHead>Nome</TableHead>
                                                                                        <TableHead className="w-[100px]">Valore</TableHead>
                                                                                        <TableHead className="w-[150px]">Abbreviazione</TableHead>
                                                                                        {isCurrentEditing && <TableHead className="text-right w-[50px]">Azioni</TableHead>}
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {(isCurrentEditing ? editingState!.possibleValues : (variable.possibleValues || [])).map((opt, index) => (
                                                                                        <TableRow key={opt.id || index} ref={el => { if (opt.id) optionRefs.current[opt.id] = el }}>
                                                                                            <TableCell><CornerDownRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                                                                                            <TableCell>
                                                                                                <code className="text-xs">{opt.id}</code>
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                {isCurrentEditing ? (
                                                                                                    <Input value={opt.name} onChange={(e) => {
                                                                                                        const newValues = [...editingState!.possibleValues];
                                                                                                        newValues[index].name = e.target.value;
                                                                                                        handleEditingStateChange('possibleValues', newValues);
                                                                                                    }} className="h-8" />
                                                                                                ) : opt.name}
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                {isCurrentEditing ? (
                                                                                                    <Input type="number" value={opt.value} onChange={(e) => {
                                                                                                        const newValues = [...editingState!.possibleValues];
                                                                                                        newValues[index].value = parseInt(e.target.value, 10);
                                                                                                        handleEditingStateChange('possibleValues', newValues);
                                                                                                    }} className="h-8" />
                                                                                                ) : opt.value}
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                {isCurrentEditing ? (
                                                                                                    <Input value={opt.abbreviation} onChange={(e) => {
                                                                                                        const newValues = [...editingState!.possibleValues];
                                                                                                        newValues[index].abbreviation = e.target.value;
                                                                                                        handleEditingStateChange('possibleValues', newValues);
                                                                                                    }} className="h-8" />
                                                                                                ) : opt.abbreviation}
                                                                                            </TableCell>
                                                                                            {isCurrentEditing && (
                                                                                                <TableCell className='text-right'>
                                                                                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveOption(index)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                                                                                                        <Trash2 className="h-4 w-4" />
                                                                                                    </Button>
                                                                                                </TableCell>
                                                                                            )}
                                                                                        </TableRow>
                                                                                    ))}
                                                                                    {isCurrentEditing && (
                                                                                        <TableRow>
                                                                                            <TableCell></TableCell>
                                                                                            <TableCell>
                                                                                                <code className="text-xs text-muted-foreground">{editingState!.newOption.id}</code>
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                <Input value={editingState!.newOption.name} onChange={e => handleEditingStateChange('newOption', { ...editingState!.newOption, name: e.target.value })} placeholder="Nuovo nome..." className="h-8" />
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                <Input type="number" value={editingState!.newOption.value} onChange={e => handleEditingStateChange('newOption', { ...editingState!.newOption, value: parseInt(e.target.value, 10) })} className="h-8" />
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                <Input value={editingState!.newOption.abbreviation} onChange={e => handleEditingStateChange('newOption', { ...editingState!.newOption, abbreviation: e.target.value })} placeholder="Nuova abbr..." className="h-8" />
                                                                                            </TableCell>
                                                                                            <TableCell className='text-right'>
                                                                                                <Button size="sm" variant="outline" onClick={handleAddOption} disabled={isSaving || !editingState!.newOption.name?.trim()}>
                                                                                                    <Plus className="h-4 w-4" />
                                                                                                </Button>
                                                                                            </TableCell>
                                                                                        </TableRow>
                                                                                    )}
                                                                                </TableBody>
                                                                            </Table>
                                                                        ) : (
                                                                            <p className="text-sm text-muted-foreground text-center py-4">Nessun valore possibile definito per questa variabile.</p>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </Fragment>
                                                )
                                            })}
                                            {filteredVariables.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="h-24 text-center">
                                                        Nessuna variabile trovata per &quot;{searchQuery}&quot;.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TooltipProvider>
                            ) : (
                                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card p-8 text-center min-h-[200px]">
                                    <Database className="h-12 w-12 text-muted-foreground" />
                                    <h2 className="mt-6 text-xl font-semibold">Il Database delle Variabili è Vuoto</h2>
                                    <p className="mt-2 text-muted-foreground">
                                        Crea il tuo primo albero decisionale per iniziare a popolare il database.
                                    </p>
                                    <Button asChild className="mt-4">
                                        <Link href="/create">
                                            Crea un Nuovo Albero
                                        </Link>
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>
            <footer className="border-t">
                <div className="container mx-auto flex h-14 items-center justify-center px-4 md:px-6">
                    <p className="text-sm text-muted-foreground">Like AI Said &copy; {new Date().getFullYear()}</p>
                </div>
            </footer>

            <AlertDialog open={!!dialogState} onOpenChange={(open) => !open && closeDialog()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei assolutamente sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {dialogState === 'delete-all' ?
                                "Questa azione non può essere annullata. Questo eliminerà permanentemente TUTTE le variabili dal database. Questa operazione non può essere annullata." :
                                `Questa azione non può essere annullata. Questo eliminerà permanentemente la variabile "${variableToDelete?.name}" dal database.`
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={closeDialog} disabled={isDeleting}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDeletion} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sì, elimina'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {selectedVariables.length === 2 && (
                <MergeVariablesDialog
                    isOpen={isMergeDialogOpen}
                    onClose={() => setIsMergeDialogOpen(false)}
                    variablesToMerge={selectedVariables}
                    onConfirmMerge={handleManualMerge}
                    isSaving={isSaving}
                />
            )}
        </div>
    );
}

export default function VariablesPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <VariablesContent />
        </Suspense>
    );
}
