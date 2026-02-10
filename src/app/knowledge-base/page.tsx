'use client';

import { useEffect, useState } from 'react';
import {
    BookOpen,
    Search,
    Plus,
    Trash2,
    Pencil,
    Tag,
    Loader2,
    Calendar,
    MessageSquare,
    X,
    RefreshCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    getKnowledgeBaseEntriesAction,
    createKnowledgeBaseEntryAction,
    updateKnowledgeBaseEntryAction,
    deleteKnowledgeBaseEntryAction,
    getKnowledgeBaseCategoriesAction,
    syncKnowledgeBaseFromTreesAction,
} from '@/app/actions/knowledge-base';

type KBEntry = {
    id: string;
    question: string;
    answer: string;
    tags: string[];
    category: string | null;
    context: string | null;
    createdAt: string;
    updatedAt: string;
};

export default function KnowledgeBasePage() {
    const { toast } = useToast();
    const [entries, setEntries] = useState<KBEntry[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);
    const [formQuestion, setFormQuestion] = useState('');
    const [formAnswer, setFormAnswer] = useState('');
    const [formTags, setFormTags] = useState('');
    const [formCategory, setFormCategory] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Delete dialog
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Sync state
    const [isSyncing, setIsSyncing] = useState(false);

    const loadEntries = async () => {
        setIsLoading(true);
        const result = await getKnowledgeBaseEntriesAction(
            search || undefined,
            categoryFilter !== 'all' ? categoryFilter : undefined
        );
        if (result.data) {
            setEntries(result.data);
        }
        setIsLoading(false);
    };

    const loadCategories = async () => {
        const result = await getKnowledgeBaseCategoriesAction();
        if (result.data) {
            setCategories(result.data);
        }
    };

    useEffect(() => {
        loadEntries();
        loadCategories();
    }, []);

    useEffect(() => {
        const debounce = setTimeout(() => loadEntries(), 300);
        return () => clearTimeout(debounce);
    }, [search, categoryFilter]);

    const openCreateDialog = () => {
        setEditingEntry(null);
        setFormQuestion('');
        setFormAnswer('');
        setFormTags('');
        setFormCategory('Generale');
        setDialogOpen(true);
    };

    const openEditDialog = (entry: KBEntry) => {
        setEditingEntry(entry);
        setFormQuestion(entry.question);
        setFormAnswer(entry.answer);
        setFormTags(entry.tags.join(', '));
        setFormCategory(entry.category || 'Generale');
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formQuestion.trim() || !formAnswer.trim()) return;

        setIsSaving(true);
        const tags = formTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

        if (editingEntry) {
            const result = await updateKnowledgeBaseEntryAction(editingEntry.id, {
                question: formQuestion,
                answer: formAnswer,
                tags,
                category: formCategory,
            });
            if (result.error) {
                toast({ title: 'Errore', description: result.error, variant: 'destructive' });
            } else {
                toast({ title: 'Aggiornata', description: 'Entry aggiornata con successo.' });
            }
        } else {
            const result = await createKnowledgeBaseEntryAction({
                question: formQuestion,
                answer: formAnswer,
                tags,
                category: formCategory,
            });
            if (result.error) {
                toast({ title: 'Errore', description: result.error, variant: 'destructive' });
            } else {
                toast({ title: 'Creata', description: 'Nuova entry aggiunta alla Knowledge Base.' });
            }
        }

        setIsSaving(false);
        setDialogOpen(false);
        loadEntries();
        loadCategories();
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        const result = await deleteKnowledgeBaseEntryAction(deletingId);
        if (result.error) {
            toast({ title: 'Errore', description: result.error, variant: 'destructive' });
        } else {
            toast({ title: 'Eliminata', description: 'Entry eliminata dalla Knowledge Base.' });
        }
        setDeleteDialogOpen(false);
        setDeletingId(null);
        loadEntries();
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const result = await syncKnowledgeBaseFromTreesAction(false);
            if (result.success) {
                toast({
                    title: 'Sincronizzazione completata',
                    description: `${result.created} create, ${result.updated} aggiornate.${result.errors.length > 0 ? ` ${result.errors.length} errori.` : ''}`,
                });
                loadEntries();
                loadCategories();
            } else {
                toast({ title: 'Errore', description: result.error || 'Errore durante la sincronizzazione.', variant: 'destructive' });
            }
        } catch (e: any) {
            toast({ title: 'Errore', description: e.message, variant: 'destructive' });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
                        <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Knowledge Base</h1>
                        <p className="text-sm text-muted-foreground">
                            Risposte e correzioni validate da FridAI Agent
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={handleSync} disabled={isSyncing} className="gap-2">
                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                        Sincronizza da Alberi
                    </Button>
                    <Button onClick={openCreateDialog} className="gap-2">
                        <Plus className="h-4 w-4" />
                        Nuova Entry
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3 p-4 border-b bg-muted/30">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Cerca per domanda, risposta o tag..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Tutte le categorie</SelectItem>
                        {categories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Entries */}
            <div className="flex-1 overflow-auto p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                        <BookOpen className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">Nessuna entry trovata</p>
                        <p className="text-xs mt-1">
                            Le correzioni fatte nel chatbot FridAI appariranno qui.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {entries.map(entry => (
                            <Card key={entry.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                                                <span className="font-semibold text-sm truncate">
                                                    {entry.question}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground leading-relaxed mb-3 whitespace-pre-wrap">
                                                {entry.answer}
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {entry.category && (
                                                    <Badge variant="secondary" className="text-[10px]">
                                                        {entry.category}
                                                    </Badge>
                                                )}
                                                {entry.tags.map(tag => (
                                                    <Badge key={tag} variant="outline" className="text-[10px] gap-1">
                                                        <Tag className="h-2.5 w-2.5" />
                                                        {tag}
                                                    </Badge>
                                                ))}
                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-auto">
                                                    <Calendar className="h-2.5 w-2.5" />
                                                    {new Date(entry.createdAt).toLocaleDateString('it-IT')}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => openEditDialog(entry)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={() => {
                                                    setDeletingId(entry.id);
                                                    setDeleteDialogOpen(true);
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Create/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editingEntry ? 'Modifica Entry' : 'Nuova Entry'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium">Domanda / Contesto</label>
                            <Input
                                placeholder="Es. Qual e' il fatturato per prodotto?"
                                value={formQuestion}
                                onChange={(e) => setFormQuestion(e.target.value)}
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium">Risposta</label>
                            <Textarea
                                placeholder="La risposta corretta..."
                                value={formAnswer}
                                onChange={(e) => setFormAnswer(e.target.value)}
                                rows={4}
                                className="mt-1"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm font-medium">Categoria</label>
                                <Input
                                    placeholder="Es. SQL, Python, Dati"
                                    value={formCategory}
                                    onChange={(e) => setFormCategory(e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium">Tag (virgola)</label>
                                <Input
                                    placeholder="vendite, fatturato"
                                    value={formTags}
                                    onChange={(e) => setFormTags(e.target.value)}
                                    className="mt-1"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Annulla
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={!formQuestion.trim() || !formAnswer.trim() || isSaving}
                        >
                            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            {editingEntry ? 'Aggiorna' : 'Crea'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare questa entry?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non puo' essere annullata. L'entry verra' rimossa permanentemente dalla Knowledge Base.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Elimina
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
