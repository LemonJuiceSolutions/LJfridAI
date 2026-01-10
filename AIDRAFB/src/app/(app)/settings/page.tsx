'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser, useFirestore, useMemoFirebase } from '@/firebase';
import { useDoc, useCollection, type WithId } from '@/firebase';
import { setDocumentNonBlocking, addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, doc } from 'firebase/firestore';
import React, { useEffect, useState, useRef, ChangeEvent } from 'react';
import { Loader2, PlusCircle, Edit, Trash2, Upload, Building, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InviteUserDialog } from '@/components/settings/invite-user-dialog';


type UserAccount = {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    avatarUrl?: string | null;
    tenantId: string;
    status: 'active' | 'invited';
};

type Tenant = {
    id: string;
    name: string;
    description?: string;
    tenantId?: string;
}

function ProfileForm() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const userAccountRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'tenants', user.uid, 'userAccounts', user.uid);
    }, [user, firestore]);

    const { data: userAccount, isLoading: isUserAccountLoading } = useDoc<UserAccount>(userAccountRef);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    useEffect(() => {
        if (userAccount) {
            setFirstName(userAccount.firstName || '');
            setLastName(userAccount.lastName || '');
            setAvatarUrl(userAccount.avatarUrl || null);
        }
    }, [userAccount]);

    const handleProfileUpdate = () => {
        if (!userAccountRef || !user) return;
        const updatedData = {
            firstName,
            lastName,
            avatarUrl: avatarUrl || null,
            tenantId: user.uid, // Ensure tenantId is always present
        };
        setDocumentNonBlocking(userAccountRef, updatedData, { merge: true });
        toast({
            title: "Profilo Aggiornato",
            description: "Le tue informazioni sono state salvate.",
        });
    };

    const handleAvatarUpload = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setAvatarUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    if (isUserLoading || isUserAccountLoading) {
        return <div className="flex justify-center items-center h-48"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    return (
        <div className="space-y-6">
             <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarUrl ?? undefined} />
                    <AvatarFallback><User className="h-10 w-10" /></AvatarFallback>
                </Avatar>
                <div className='space-y-2'>
                    <Label>Immagine del Profilo</Label>
                    <div className='flex gap-2'>
                        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" />
                            Carica Immagine
                        </Button>
                        <Input 
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                        />
                         {avatarUrl && <Button variant="destructive" size="sm" onClick={() => setAvatarUrl(null)}>Rimuovi</Button>}
                    </div>
                    <p className='text-xs text-muted-foreground'>Consigliato: 400x400px, max 1MB</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="firstName">Nome</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="lastName">Cognome</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
            </div>
             <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={user?.email ?? ''} disabled />
            </div>
            <div className='flex justify-end'>
                <Button onClick={handleProfileUpdate}>Salva Modifiche</Button>
            </div>
        </div>
    );
}

function TenantForm() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const tenantRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return doc(firestore, 'tenants', user.uid);
    }, [user, firestore]);

    const { data: tenant, isLoading: isTenantLoading } = useDoc<Tenant>(tenantRef);

    const [tenantName, setTenantName] = useState('');

    useEffect(() => {
        if (tenant) {
            setTenantName(tenant.name || '');
        }
    }, [tenant]);

    const handleTenantUpdate = () => {
        if (!tenantRef || !user) return;
        setDocumentNonBlocking(tenantRef, { name: tenantName, tenantId: user.uid }, { merge: true });
        toast({
            title: "Impostazioni Tenant Aggiornate",
            description: "Il nome della tua azienda è stato salvato.",
        });
    };

    if (isUserLoading || isTenantLoading) {
        return <div className="flex justify-center items-center h-48"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }
    
    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="tenantName">Nome Azienda</Label>
                <Input id="tenantName" value={tenantName} onChange={(e) => setTenantName(e.target.value)} />
            </div>
            <div className='flex justify-end'>
                <Button onClick={handleTenantUpdate}>Salva Modifiche</Button>
            </div>
        </div>
    );
}

function UserManagementTable() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    
    const usersCollectionRef = useMemoFirebase(() => {
        if (!user || !firestore) return null;
        return collection(firestore, 'tenants', user.uid, 'userAccounts');
    }, [user, firestore]);

    const { data: users, isLoading: areUsersLoading } = useCollection<UserAccount>(usersCollectionRef);

    const handleInviteUser = async (email: string, role: string) => {
        if (!usersCollectionRef || !user) return;
    
        // In a real app, you would trigger a Cloud Function here to create the user in Firebase Auth
        // and send an invitation email. For this simulation, we'll just add a document to Firestore.
        
        const newUserAccount: Omit<UserAccount, 'id'> = {
          email,
          role,
          status: 'invited',
          firstName: '',
          lastName: '',
          tenantId: user.uid,
          avatarUrl: null
        };
    
        try {
          await addDocumentNonBlocking(usersCollectionRef, newUserAccount);
          toast({
            title: "Invito Inviato!",
            description: `Un invito è stato inviato a ${email}.`,
          });
        } catch (error) {
          console.error("Error inviting user:", error);
          toast({
            variant: "destructive",
            title: "Errore",
            description: "Impossibile inviare l'invito. Riprova.",
          });
        }
      };

    if (isUserLoading || areUsersLoading) {
        return <div className="flex justify-center items-center h-48"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <>
            <div className='flex justify-end mb-4'>
                 <Button size="sm" className="gap-1" onClick={() => setIsInviteDialogOpen(true)}>
                    <PlusCircle className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                        Invita Collega
                    </span>
                </Button>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Ruolo</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users && users.map((u) => (
                        <TableRow key={u.id}>
                            <TableCell className="font-medium flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={u.avatarUrl ?? undefined} />
                                    <AvatarFallback><User className='h-4 w-4'/></AvatarFallback>
                                </Avatar>
                                {u.firstName || u.lastName ? `${u.firstName} ${u.lastName}`: <span className="text-muted-foreground italic">In attesa...</span>}
                            </TableCell>
                            <TableCell>{u.email}</TableCell>
                            <TableCell>
                                <Badge variant="outline">{u.role}</Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={u.status === 'active' ? 'default' : 'secondary'}>{u.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                                <Button variant="ghost" size="icon" disabled>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" disabled={u.id === user?.uid}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <InviteUserDialog
                isOpen={isInviteDialogOpen}
                setIsOpen={setIsInviteDialogOpen}
                onInvite={handleInviteUser}
            />
        </>
    );
}


export default function SettingsPage() {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Impostazioni</CardTitle>
          <CardDescription>
            Gestisci le informazioni del tuo account, tenant, utenti e altre impostazioni dell'applicazione.
          </CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="profile">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="profile">Profilo</TabsTrigger>
                    <TabsTrigger value="tenant">Tenant</TabsTrigger>
                    <TabsTrigger value="users">Gestione Utenti</TabsTrigger>
                </TabsList>
                <TabsContent value="profile" className='pt-6'>
                   <ProfileForm />
                </TabsContent>
                 <TabsContent value="tenant" className='pt-6'>
                   <TenantForm />
                </TabsContent>
                <TabsContent value="users" className='pt-6'>
                    <UserManagementTable />
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
