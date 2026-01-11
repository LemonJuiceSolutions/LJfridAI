'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { PlusCircle, Edit, Trash2, Database, FileText, Briefcase, Loader2 } from 'lucide-react';
import { ConnectionDialog } from '@/components/setup/connection-dialog';
import { getConnections, saveConnection, deleteConnection } from '@/actions/connections';
import { useSession } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';

export type Connection = {
    id: string;
    name: string;
    type: 'SQL Database' | 'SharePoint' | 'HubSpot';
    status: 'Connected' | 'Disconnected';
    lastSync: string;
    config?: any;
};

const getIconForType = (type: Connection['type']) => {
    switch (type) {
        case 'SQL Database':
            return <Database className="h-5 w-5 text-gray-500" />;
        case 'SharePoint':
            return <FileText className="h-5 w-5 text-blue-500" />;
        case 'HubSpot':
            return <Briefcase className="h-5 w-5 text-orange-500" />;
        default:
            return <Database className="h-5 w-5 text-gray-500" />;
    }
}

export default function SetupWidget() {
    const { toast } = useToast();
    const { data: session, status } = useSession();

    const [connections, setConnections] = useState<Connection[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (status === 'loading') return;

        const loadConnectionsState = async () => {
            setIsLoading(true);
            try {
                const loadedConnections = await getConnections();
                if (loadedConnections) {
                    const parsedConnections = loadedConnections.map((c: any) => ({
                        ...c,
                        config: typeof c.config === 'string' ? JSON.parse(c.config) : c.config,
                        status: 'Connected', // Mock status for now
                        lastSync: c.updatedAt?.toLocaleString() || new Date().toLocaleString()
                    }));
                    setConnections(parsedConnections as Connection[]);
                } else {
                    setConnections([]);
                }
            } catch (error) {
                console.error("Error loading connections:", error);
                setConnections([]);
            } finally {
                setIsLoading(false);
            }
        };

        if (session?.user) {
            loadConnectionsState();
        } else {
            setIsLoading(false);
        }
    }, [status, session]);


    const handleSaveConnection = async (connection: Omit<Connection, 'id' | 'status' | 'lastSync'> & { id?: string }) => {
        try {
            // Optimistic update logic if needed, but for now we wait.
            // Actually, wait for server response? Server action doesn't return the obj.
            // I should update server action to return the obj or reload.
            // I'll reload for simplicity or optimistically update.

            const newConnData = {
                ...connection,
                id: connection.id || undefined, // undefined to trigger create
                config: (connection as any).config // assuming dialog passes config
            };

            await saveConnection(newConnData);

            // Reload
            const fresh = await getConnections();
            if (fresh) {
                const parsed = fresh.map((c: any) => ({
                    ...c,
                    config: typeof c.config === 'string' ? JSON.parse(c.config) : c.config,
                    status: 'Connected',
                    lastSync: c.updatedAt?.toLocaleString() || new Date().toLocaleString()
                }));
                setConnections(parsed as Connection[]);
            }
            toast({ title: "Connessione salvata!" });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Errore", description: "Salvataggio fallito" });
        }
    };

    const handleAddNew = () => {
        setSelectedConnection(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (connection: Connection) => {
        setSelectedConnection(connection);
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteConnection(id);
            setConnections(prev => prev.filter(c => c.id !== id));
            toast({ title: "Connessione eliminata" });
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Errore", description: "Eliminazione fallita" });
        }
    };

    return (
        <>
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Setup Connessioni</CardTitle>
                            <CardDescription>
                                Aggiungi e gestisci le connessioni a sorgenti dati esterne.
                            </CardDescription>
                        </div>
                        <Button size="sm" className="gap-1" onClick={handleAddNew}>
                            <PlusCircle className="h-3.5 w-3.5" />
                            <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                                Aggiungi Connessione
                            </span>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="overflow-auto">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-48">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className='w-12'></TableHead>
                                    <TableHead>Nome Connessione</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Stato</TableHead>
                                    <TableHead>Ultima Sincronizzazione</TableHead>
                                    <TableHead className="text-right">Azioni</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {connections.length > 0 ? (
                                    connections.map((conn) => (
                                        <TableRow key={conn.id}>
                                            <TableCell>{getIconForType(conn.type)}</TableCell>
                                            <TableCell className="font-medium">{conn.name}</TableCell>
                                            <TableCell>{conn.type}</TableCell>
                                            <TableCell>
                                                <Badge variant={conn.status === 'Connected' ? 'default' : 'destructive'}>
                                                    {conn.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{conn.lastSync}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(conn)}>
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDelete(conn.id)}>
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10">
                                            Nessuna connessione configurata.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
            <ConnectionDialog
                isOpen={isDialogOpen}
                setIsOpen={setIsDialogOpen}
                onSave={handleSaveConnection}
                connection={selectedConnection}
            />
        </>
    );
}

