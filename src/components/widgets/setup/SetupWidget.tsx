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
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { setDocumentNonBlocking } from '@/firebase/non-blocking-updates';


export type Connection = {
    id: string;
    name: string;
    type: 'SQL Database' | 'SharePoint' | 'HubSpot';
    status: 'Connected' | 'Disconnected';
    lastSync: string;
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
    const [connections, setConnections] = useState<Connection[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();

    const userSettingsRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        const tenantId = user.uid;
        return doc(firestore, 'tenants', tenantId, 'userSettings', user.uid);
    }, [user, firestore]);
    
    useEffect(() => {
        if (isUserLoading) return;
        if (!userSettingsRef) {
            setIsLoading(false);
            return;
        }

        const loadConnectionsState = async () => {
            setIsLoading(true);
            try {
                const docSnap = await getDoc(userSettingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setConnections(data.connections || []);
                } else {
                    setConnections([]);
                }
            } catch (error) {
                console.error("Error loading connections state from Firestore:", error);
                setConnections([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadConnectionsState();
    }, [userSettingsRef, isUserLoading]);


    const saveConnectionsState = useCallback((newConnections: Connection[]) => {
        if (userSettingsRef) {
            setDocumentNonBlocking(userSettingsRef, { connections: newConnections }, { merge: true });
        }
    }, [userSettingsRef]);


    const handleSaveConnection = (connection: Omit<Connection, 'id' | 'status' | 'lastSync'> & { id?: string }) => {
        let newConnections: Connection[];
        if (connection.id) {
            // Update existing connection
            newConnections = connections.map(c => 
                c.id === connection.id 
                ? { ...c, ...connection, status: 'Connected', lastSync: new Date().toLocaleString() } 
                : c
            );
        } else {
            // Add new connection
            const newConnection: Connection = {
                ...connection,
                id: `conn-${Date.now()}`,
                status: 'Connected',
                lastSync: new Date().toLocaleString(),
            };
            newConnections = [...connections, newConnection];
        }
        setConnections(newConnections);
        saveConnectionsState(newConnections);
    };

    const handleAddNew = () => {
        setSelectedConnection(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (connection: Connection) => {
        setSelectedConnection(connection);
        setIsDialogOpen(true);
    };
    
    const handleDelete = (id: string) => {
        const newConnections = connections.filter(c => c.id !== id);
        setConnections(newConnections);
        saveConnectionsState(newConnections);
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
