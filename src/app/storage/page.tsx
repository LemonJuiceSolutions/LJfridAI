
'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, AlertCircle, BrainCircuit, ArrowLeft, File, Trash2, RefreshCcw, ImageIcon, VideoIcon } from 'lucide-react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { listFiles, uploadFile, deleteFile, FileInfo } from '@/lib/storage-client';
import Image from 'next/image';

type StorageFile = FileInfo & {
    type: 'image' | 'video' | 'other';
    ref?: any; // kept for compatibility if needed, though mostly unused now
};

const getFileType = (fileName: string): 'image' | 'video' | 'other' => {
    const lowerCaseName = fileName.toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];

    if (imageExtensions.some(ext => lowerCaseName.endsWith(ext))) {
        return 'image';
    }
    if (videoExtensions.some(ext => lowerCaseName.endsWith(ext))) {
        return 'video';
    }
    return 'other';
}


export default function StoragePage() {
    const [isFetching, setIsFetching] = useState(true);
    const [isUploading, startUploading] = useTransition();
    const [uploadingFileCount, setUploadingFileCount] = useState(0);
    const [mediaFiles, setMediaFiles] = useState<StorageFile[]>([]);
    const [otherFiles, setOtherFiles] = useState<StorageFile[]>([]);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const [fileToDelete, setFileToDelete] = useState<StorageFile | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchFiles = useCallback(async () => {
        setIsFetching(true);
        setError(null);
        try {
            const allFiles = await listFiles();

            const fileDetails = allFiles.map(file => ({
                ...file,
                type: getFileType(file.name),
            }));

            setMediaFiles(fileDetails.filter(f => f.type === 'image' || f.type === 'video'));
            setOtherFiles(fileDetails.filter(f => f.type === 'other'));

        } catch (err: any) {
            let errorMessage = err.message || 'Errore durante il caricamento dei file.';

            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Caricamento Fallito', description: errorMessage });
        } finally {
            setIsFetching(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleUploadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const files = formData.getAll('file') as File[];
        const validFiles = files.filter(file => file && file.size > 0);

        if (validFiles.length === 0) {
            toast({
                variant: 'destructive',
                title: 'Nessun file selezionato',
                description: 'Per favore, scegli uno o più file da caricare.',
            });
            return;
        }

        setUploadingFileCount(validFiles.length);
        startUploading(async () => {
            try {
                const uploadPromises = validFiles.map(file => {
                    const filePath = `${Date.now()}-${file.name}`;
                    return uploadFile(file, 'uploads', filePath);
                });

                await Promise.all(uploadPromises);

                toast({
                    title: 'Upload Riuscito!',
                    description: `${validFiles.length} file sono stati caricati correttamente.`,
                });
                form.reset();
                await fetchFiles();
            } catch (err: any) {
                toast({
                    variant: 'destructive',
                    title: 'Upload Fallito',
                    description: err.message || 'Si è verificato un errore sconosciuto durante il caricamento di uno o più file.',
                });
            } finally {
                setUploadingFileCount(0);
            }
        });
    };

    const handleDeleteClick = (file: StorageFile) => {
        setFileToDelete(file);
    };

    const handleConfirmDelete = async () => {
        if (!fileToDelete) return;

        setIsDeleting(true);
        try {
            await deleteFile(fileToDelete.name);
            toast({ title: 'File Eliminato', description: `Il file "${fileToDelete.name}" è stato eliminato.` });
            await fetchFiles();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Eliminazione Fallita', description: err.message });
        } finally {
            setIsDeleting(false);
            setFileToDelete(null);
        }
    };

    const allFiles = [...mediaFiles, ...otherFiles];

    return (
        <div className="flex flex-col min-h-screen bg-background">
            <main className="flex-1">
                <div className="container mx-auto grid gap-8 px-4 py-8 md:px-6">
                    <div className="grid gap-8 lg:grid-cols-5">
                        <div className="lg:col-span-3 space-y-8">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Galleria Multimediale</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {isFetching ? (
                                        <div className="flex items-center justify-center p-8">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        </div>
                                    ) : error ? (
                                        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                                            <div className="flex items-center gap-2 font-semibold">
                                                <AlertCircle className="h-4 w-4" />
                                                <span>Errore di Caricamento</span>
                                            </div>
                                            <p className="mt-2 font-mono bg-destructive/10 p-2 rounded">{error}</p>
                                        </div>
                                    ) : mediaFiles.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-8">Nessun file immagine o video trovato.</p>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                            {mediaFiles.map(file => (
                                                <div key={file.name} className="group relative aspect-square overflow-hidden rounded-lg border">
                                                    {file.type === 'image' ? (
                                                        <Image src={file.url} alt={file.name} layout="fill" objectFit="cover" className="transition-transform group-hover:scale-105" />
                                                    ) : (
                                                        <video src={file.url} className="h-full w-full object-cover" />
                                                    )}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                                    <div className="absolute bottom-0 left-0 p-2 text-white">
                                                        <p className="text-xs font-medium truncate">{file.name}</p>
                                                    </div>
                                                    <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => handleDeleteClick(file)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <CardTitle>Altri File</CardTitle>
                                            <CardDescription>Elenco di tutti gli altri file.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {isFetching ? (
                                        <div className="flex items-center justify-center p-8">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        </div>
                                    ) : error ? null : otherFiles.length === 0 ? (
                                        <p className="text-center text-muted-foreground py-8">Nessun altro file trovato.</p>
                                    ) : (
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Nome File</TableHead>
                                                    <TableHead className="text-right">Azioni</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {otherFiles.map(file => (
                                                    <TableRow key={file.name}>
                                                        <TableCell className="font-medium truncate max-w-[300px]">
                                                            <a href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                                                                <File className="h-4 w-4 shrink-0" />
                                                                <span className="truncate">{file.name}</span>
                                                            </a>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive/70 hover:text-destructive" onClick={() => handleDeleteClick(file)}>
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                        <div className="lg:col-span-2">
                            <Card className="sticky top-20">
                                <form onSubmit={handleUploadSubmit}>
                                    <CardHeader>
                                        <CardTitle>Carica Nuovi File</CardTitle>
                                        <CardDescription>
                                            Seleziona uno o più file dal tuo computer per caricarli.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid w-full max-w-sm items-center gap-1.5">
                                            <Label htmlFor="file-upload">Scegli file</Label>
                                            <Input id="file-upload" name="file" type="file" multiple disabled={isUploading} />
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex-col items-stretch gap-4">
                                        <Button type="submit" disabled={isUploading} className="w-full">
                                            {isUploading ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    {`Caricando ${uploadingFileCount} file...`}
                                                </>
                                            ) : (
                                                <>
                                                    <UploadCloud className="mr-2 h-4 w-4" />
                                                    Carica File
                                                </>
                                            )}
                                        </Button>
                                        <Button type="button" variant="ghost" onClick={fetchFiles} disabled={isFetching}>
                                            <RefreshCcw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                                            Aggiorna Elenco File
                                        </Button>
                                    </CardFooter>
                                </form>
                            </Card>
                        </div>
                    </div>
                </div>
            </main>

            <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Sei sicuro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Questa azione non può essere annullata. Questo eliminerà permanentemente il file <strong>{fileToDelete?.name}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setFileToDelete(null)} disabled={isDeleting}>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Sì, elimina'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
