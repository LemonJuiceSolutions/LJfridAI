"use client";

import { useEffect, useState } from "react";
import { User, Building2, Save, Loader2, Mail, Shield, PlusCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getProfileAction, updateProfileAction, getCompaniesAction, createCompanyAction } from "@/actions/profile";

export default function ProfilePage() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [profile, setProfile] = useState<{
        id: string;
        name: string | null;
        email: string | null;
        companyId: string | null;
        role: string;
    } | null>(null);

    const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

    // Company Creation State
    const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState("");
    const [isCreatingCompany, setIsCreatingCompany] = useState(false);

    useEffect(() => {
        const load = async () => {
            const [profileRes, companiesRes] = await Promise.all([
                getProfileAction(),
                getCompaniesAction()
            ]);

            if (profileRes.data) {
                setProfile(profileRes.data);
            }
            if (companiesRes.data) {
                setCompanies(companiesRes.data);
            }
            setIsLoading(false);
        };
        load();
    }, []);

    const handleSave = async () => {
        if (!profile) return;

        setIsSaving(true);
        try {
            const res = await updateProfileAction({
                name: profile.name || "",
                email: profile.email || "",
                companyId: profile.companyId || undefined
            });

            if (res.error) {
                toast({ title: "Errore", description: res.error, variant: "destructive" });
            } else {
                toast({ title: "Profilo aggiornato", description: "Le modifiche sono state salvate." });
            }
        } catch {
            toast({ title: "Errore", description: "Impossibile salvare il profilo", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateCompany = async () => {
        if (!newCompanyName.trim()) return;

        setIsCreatingCompany(true);
        try {
            const res = await createCompanyAction(newCompanyName);
            if (res.error) {
                toast({ title: "Errore", description: res.error, variant: "destructive" });
            } else if (res.data) {
                toast({ title: "Azienda creata", description: `L'azienda ${res.data.name} è stata creata.` });
                // Add to list and select it
                setCompanies(prev => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
                setProfile(prev => prev ? { ...prev, companyId: res.data!.id } : null);
                setNewCompanyName("");
                setIsCompanyDialogOpen(false);
            }
        } catch {
            toast({ title: "Errore imprevisto", variant: "destructive" });
        } finally {
            setIsCreatingCompany(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!profile) return null;

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <User className="h-6 w-6" />
                Profilo Utente
            </h1>

            <Card>
                <CardHeader>
                    <CardTitle>Informazioni Personali</CardTitle>
                    <CardDescription>Gestisci i tuoi dati e l'associazione aziendale.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome Completo</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="name"
                                value={profile.name || ""}
                                onChange={e => setProfile({ ...profile, name: e.target.value })}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="email"
                                value={profile.email || ""}
                                onChange={e => setProfile({ ...profile, email: e.target.value })}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Ruolo</Label>
                        <div className="relative">
                            <Shield className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={profile.role}
                                disabled
                                className="pl-9 bg-muted"
                            />
                        </div>
                        <p className="text-[10px] text-muted-foreground">Il ruolo non può essere modificato.</p>
                    </div>

                    <div className="space-y-2 pt-4 border-t">
                        <Label htmlFor="company">Azienda</Label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
                            <Select
                                value={profile.companyId || "none"}
                                onValueChange={val => setProfile({ ...profile, companyId: val === "none" ? null : val })}
                            >
                                <SelectTrigger className="pl-9">
                                    <SelectValue placeholder="Seleziona un'azienda" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Nessuna Azienda</SelectItem>
                                    {companies.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Dialog open={isCompanyDialogOpen} onOpenChange={setIsCompanyDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="icon" className="absolute right-0 top-0" title="Crea Nuova Azienda">
                                        <PlusCircle className="h-4 w-4" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Crea Nuova Azienda</DialogTitle>
                                        <DialogDescription>
                                            Inserisci il nome della nuova azienda. Sarai automaticamente associato ad essa.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="py-4">
                                        <Label htmlFor="new-company">Nome Azienda</Label>
                                        <Input
                                            id="new-company"
                                            value={newCompanyName}
                                            onChange={e => setNewCompanyName(e.target.value)}
                                            placeholder="Es. Progetto Quid"
                                            className="mt-2"
                                        />
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsCompanyDialogOpen(false)}>Annulla</Button>
                                        <Button onClick={handleCreateCompany} disabled={isCreatingCompany || !newCompanyName.trim()}>
                                            {isCreatingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Crea Azienda
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            L'associazione a un'azienda è necessaria per creare connettori e gestire dati.
                        </p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Salva Modifiche
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div >
    );
}
