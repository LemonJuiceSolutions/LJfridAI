'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings, Save, PlayCircle, Loader2, CheckCircle2, XCircle, Send, Bot, User as UserIcon, Trash2, Search } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { testOpenRouterConnection, chatOpenRouterAction, fetchOpenRouterModelsAction, getOpenRouterCreditsAction } from '../actions';
import { createInvitationAction, getInvitationsAction, revokeInvitationAction } from '../actions/invitations';
import { getOpenRouterSettingsAction, saveOpenRouterSettingsAction } from '@/actions/openrouter';
import { ConnectorsManager } from './connectors-manager';
import { Users, UserPlus, Copy, UserSearch } from 'lucide-react';
import {
    getLeadGenApiKeysAction, saveLeadGenApiKeysAction,
    testApolloApiKeyAction, testHunterApiKeyAction, testSerpApiKeyAction, testApifyApiKeyAction,
} from '@/actions/lead-generator';
import { Badge } from '@/components/ui/badge';

export default function SettingsPage() {
    const { toast } = useToast();
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [isLoading, setIsLoading] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Model Selector State
    const [allModels, setAllModels] = useState<any[]>([]);
    const [isModelsLoading, setIsModelsLoading] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);

    // Chat state
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isChatting, setIsChatting] = useState(false);

    // Invitation State
    const [invitations, setInvitations] = useState<any[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteLink, setInviteLink] = useState('');

    // Lead Generator API Keys State
    const [leadGenApollo, setLeadGenApollo] = useState('');
    const [leadGenHunter, setLeadGenHunter] = useState('');
    const [leadGenSerpApi, setLeadGenSerpApi] = useState('');
    const [leadGenApify, setLeadGenApify] = useState('');
    const [isLeadGenSaving, setIsLeadGenSaving] = useState(false);

    // Lead Gen API Test State
    type ApiTestResult = { success: boolean; message: string; quota?: { used: number; available: number; plan: string; resetDate?: string; extra?: string } };
    const [apolloTest, setApolloTest] = useState<ApiTestResult | null>(null);
    const [hunterTest, setHunterTest] = useState<ApiTestResult | null>(null);
    const [serpApiTest, setSerpApiTest] = useState<ApiTestResult | null>(null);
    const [apifyTest, setApifyTest] = useState<ApiTestResult | null>(null);
    const [isTestingApollo, setIsTestingApollo] = useState(false);
    const [isTestingHunter, setIsTestingHunter] = useState(false);
    const [isTestingSerpApi, setIsTestingSerpApi] = useState(false);
    const [isTestingApify, setIsTestingApify] = useState(false);

    // OpenRouter Credits State
    type OpenRouterCredits = { totalCredits: number; totalUsage: number; remaining: number };
    const [orCredits, setOrCredits] = useState<OpenRouterCredits | null>(null);
    const [isLoadingCredits, setIsLoadingCredits] = useState(false);

    const loadOpenRouterCredits = async (key: string) => {
        if (!key) return;
        setIsLoadingCredits(true);
        try {
            const res = await getOpenRouterCreditsAction(key);
            if (res.success && res.credits) {
                setOrCredits(res.credits);
            }
        } catch { /* ignore */ }
        setIsLoadingCredits(false);
    };

    useEffect(() => {
        // Load OpenRouter settings from database
        getOpenRouterSettingsAction().then(res => {
            if (!res.error) {
                if (res.apiKey) {
                    setApiKey(res.apiKey);
                    loadOpenRouterCredits(res.apiKey);
                }
                if (res.model) setModel(res.model);
            }
        });

        // Load invitations
        getInvitationsAction().then(res => {
            if (res.data) setInvitations(res.data);
        });

        // Load Lead Generator API keys
        getLeadGenApiKeysAction().then(res => {
            if (res.keys) {
                if (res.keys.apollo) setLeadGenApollo(res.keys.apollo);
                if (res.keys.hunter) setLeadGenHunter(res.keys.hunter);
                if (res.keys.serpApi) setLeadGenSerpApi(res.keys.serpApi);
                if (res.keys.apify) setLeadGenApify(res.keys.apify);
            }
        });
    }, []);

    useEffect(() => {
        if (isModelDialogOpen && allModels.length === 0) {
            setIsModelsLoading(true);
            fetchOpenRouterModelsAction().then(result => {
                if (result.data) {
                    // Sort by name or popularity if possible. For now name.
                    setAllModels(result.data.sort((a, b) => a.name.localeCompare(b.name)));
                } else {
                    toast({
                        title: "Errore",
                        description: result.error || "Impossibile caricare i modelli.",
                        variant: "destructive"
                    });
                }
                setIsModelsLoading(false);
            });
        }
    }, [isModelDialogOpen, allModels.length, toast]);

    const filteredModels = allModels.filter(m =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase())
    );

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const result = await saveOpenRouterSettingsAction(apiKey, model);
            if (result.success) {
                toast({
                    title: "Impostazioni salvate",
                    description: "Le tue preferenze per OpenRouter sono state salvate nel database.",
                });
            } else {
                toast({
                    title: "Errore",
                    description: result.error || "Impossibile salvare le impostazioni.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Errore",
                description: "Impossibile salvare le impostazioni.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleTestConnection = async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await testOpenRouterConnection(apiKey, model);
            setTestResult(result);
            // Refresh credits after test
            loadOpenRouterCredits(apiKey);
            if (result.success) {
                toast({
                    title: "Test riuscito",
                    description: "Connessione a OpenRouter stabilita con successo.",
                });
            } else {
                toast({
                    title: "Test fallito",
                    description: result.message,
                    variant: "destructive"
                });
            }
        } catch (error) {
            setTestResult({ success: false, message: "Errore durante il test di connessione." });
            toast({
                title: "Errore",
                description: "Si è verificato un errore durante il test.",
                variant: "destructive"
            });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || !apiKey) return;

        const newUserMsg = { role: 'user' as const, content: inputMessage };
        const updatedMessages = [...chatMessages, newUserMsg];

        setChatMessages(updatedMessages);
        setInputMessage('');
        setIsChatting(true);

        // Convert messages for API
        const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }));

        const result = await chatOpenRouterAction(apiKey, model, apiMessages);

        if (result.success) {
            setChatMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
        } else {
            toast({
                title: "Errore Chat",
                description: result.message,
                variant: "destructive"
            });
            setChatMessages(prev => [...prev, { role: 'assistant', content: `Errore: ${result.message}` }]);
        }
        setIsChatting(false);
    };

    const handleClearChat = () => {
        setChatMessages([]);
    };

    const handleInvite = async () => {
        if (!inviteEmail) return;
        setIsInviting(true);
        setInviteLink('');
        try {
            const res = await createInvitationAction(inviteEmail);
            if (res.error) {
                toast({ title: "Errore", description: res.error, variant: "destructive" });
            } else {
                setInviteEmail('');
                const link = `${window.location.origin}/auth/signup?token=${res.token}`;
                setInviteLink(link);
                toast({ title: "Invito creato!", description: "Copia il link qui sotto." });
                // Refresh list
                const list = await getInvitationsAction();
                if (list.data) setInvitations(list.data);
            }
        } catch (e) {
            toast({ title: "Errore imprevisto", variant: "destructive" });
        } finally {
            setIsInviting(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            <main className="flex-1 overflow-y-auto">
                <div className="p-3 md:p-4 pb-16">

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">

                    {/* Team Management Card */}
                    <Card className="border-primary/20 bg-primary/5">
                        <CardHeader className="p-3 pb-2">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <Users className="h-4 w-4 text-primary" />
                                Gestione Team
                            </CardTitle>
                            <CardDescription className="text-[11px]">Invita colleghi alla tua azienda.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <div className="flex gap-1.5 mb-3">
                                <Input
                                    placeholder="Email collega..."
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                    className="h-8 text-xs"
                                />
                                <Button onClick={handleInvite} disabled={isInviting} size="sm" className="h-8 text-xs">
                                    {isInviting ? <Loader2 className="animate-spin h-3 w-3" /> : <UserPlus className="h-3 w-3 mr-1" />}
                                    Invita
                                </Button>
                            </div>

                            {inviteLink && (
                                <div className="flex flex-col gap-1.5 p-2 bg-background border rounded-md mb-3 animate-in fade-in slide-in-from-top-2">
                                    <Label className="text-[10px] text-muted-foreground">Link di invito:</Label>
                                    <div className="flex items-center gap-1.5">
                                        <code className="text-[10px] flex-1 break-all bg-muted p-1.5 rounded select-all">{inviteLink}</code>
                                        <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => {
                                            navigator.clipboard.writeText(inviteLink);
                                            toast({ title: "Link copiato!" });
                                        }}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5 mt-3">
                                <h3 className="text-xs font-medium">Inviti In Attesa</h3>
                                {invitations.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground italic">Nessun invito attivo.</p>
                                ) : (
                                    <div className="border rounded-md divide-y bg-background">
                                        {invitations.map(inv => (
                                            <div key={inv.id} className="p-2 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-medium">{inv.email}</p>
                                                    <p className="text-[9px] text-muted-foreground">Scadenza: {new Date(inv.expires).toLocaleDateString()}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={async () => {
                                                    await revokeInvitationAction(inv.id);
                                                    setInvitations(prev => prev.filter(i => i.id !== inv.id));
                                                    toast({ title: "Invito revocato" });
                                                }}>
                                                    <Trash2 className="h-3 w-3 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* OpenRouter */}
                    <Card>
                        <CardHeader className="p-3 pb-2">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <Settings className="h-4 w-4 text-primary" />
                                OpenRouter
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                API key e modello preferito.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="api-key" className="text-xs">API Key</Label>
                                <Input
                                    id="api-key"
                                    type="password"
                                    placeholder="sk-or-..."
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="h-8 text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Modello</Label>
                                <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between font-normal h-8 text-xs">
                                            {model || "Seleziona un modello"}
                                            <span className="text-muted-foreground ml-2 text-[10px]">Cambia</span>
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                                        <DialogHeader>
                                            <DialogTitle className="text-sm">Seleziona Modello AI</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex items-center border rounded-md px-2 py-1.5 my-1 bg-muted/30">
                                            <Search className="mr-1.5 h-3 w-3 opacity-50" />
                                            <Input
                                                placeholder="Cerca modello..."
                                                value={modelSearch}
                                                onChange={e => setModelSearch(e.target.value)}
                                                className="border-0 focus-visible:ring-0 bg-transparent h-7 text-xs"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex-1 overflow-auto border rounded-md">
                                            {isModelsLoading ? (
                                                <div className="flex items-center justify-center h-40">
                                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                                    <span className="ml-2 text-xs text-muted-foreground">Caricamento...</span>
                                                </div>
                                            ) : (
                                                <Table>
                                                    <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                                                        <TableRow>
                                                            <TableHead className="text-[10px]">Nome</TableHead>
                                                            <TableHead className="text-[10px]">ID</TableHead>
                                                            <TableHead className="text-[10px]">Context</TableHead>
                                                            <TableHead className="text-[10px]">Input ($/1M)</TableHead>
                                                            <TableHead className="text-[10px]">Output ($/1M)</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {filteredModels.map((m) => {
                                                            const isSelected = model === m.id;
                                                            return (
                                                                <TableRow
                                                                    key={m.id}
                                                                    className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-primary/5 dark:bg-primary/20' : ''}`}
                                                                    onClick={() => {
                                                                        setModel(m.id);
                                                                        setIsModelDialogOpen(false);
                                                                    }}
                                                                >
                                                                    <TableCell className="font-medium p-1.5 text-[10px] truncate max-w-[200px]" title={m.name}>
                                                                        {m.name}
                                                                        {isSelected && <CheckCircle2 className="inline ml-1 h-2.5 w-2.5 text-primary" />}
                                                                    </TableCell>
                                                                    <TableCell className="text-[9px] text-muted-foreground font-mono p-1.5 truncate max-w-[150px]" title={m.id}>{m.id}</TableCell>
                                                                    <TableCell className="text-[9px] p-1.5">{Math.round(m.context_length / 1000)}k</TableCell>
                                                                    <TableCell className="text-[9px] font-mono p-1.5">
                                                                        ${(parseFloat(m.pricing.prompt) * 1000000).toFixed(2)}
                                                                    </TableCell>
                                                                    <TableCell className="text-[9px] font-mono p-1.5">
                                                                        ${(parseFloat(m.pricing.completion) * 1000000).toFixed(2)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                        {filteredModels.length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground">
                                                                    Nessun modello trovato per &quot;{modelSearch}&quot;
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground text-right pt-1">
                                            {filteredModels.length} modelli
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="flex flex-col gap-2 pt-2 border-t">
                                <div className="flex gap-1.5">
                                    <Button onClick={handleSave} disabled={isLoading} size="sm" className="flex-1 h-8 text-xs">
                                        {isLoading ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Save className="mr-1.5 h-3 w-3" />}
                                        {isLoading ? 'Salvataggio...' : 'Salva'}
                                    </Button>
                                    <Button onClick={handleTestConnection} disabled={isTesting || !apiKey} variant="secondary" size="sm" className="flex-1 h-8 text-xs">
                                        {isTesting ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <PlayCircle className="mr-1.5 h-3 w-3" />}
                                        {isTesting ? 'Test...' : 'Test'}
                                    </Button>
                                </div>

                                {testResult && (
                                    <div className={`p-2 rounded-md flex items-start gap-2 text-[11px] ${testResult.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {testResult.success ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                        ) : (
                                            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                        )}
                                        <div>
                                            <p className="font-medium">{testResult.success ? 'Successo' : 'Errore'}</p>
                                            <p className="mt-0.5 opacity-90">{testResult.message}</p>
                                        </div>
                                    </div>
                                )}

                                {orCredits && (
                                    <div className="p-2 rounded-md border bg-muted/30">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium">Credito</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-5 px-1.5"
                                                disabled={isLoadingCredits}
                                                onClick={() => loadOpenRouterCredits(apiKey)}
                                            >
                                                {isLoadingCredits ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <span className="text-[9px]">Aggiorna</span>}
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            <Badge variant="outline" className="text-[9px] h-5">
                                                Residuo: ${orCredits.remaining.toFixed(4)}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[9px] h-5">
                                                Usato: ${orCredits.totalUsage.toFixed(4)}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[9px] h-5">
                                                Totale: ${orCredits.totalCredits.toFixed(4)}
                                            </Badge>
                                        </div>
                                        {orCredits.remaining < 0.5 && orCredits.totalCredits > 0 && (
                                            <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-1">
                                                Credito in esaurimento.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Connectors */}
                    <ConnectorsManager />

                    {/* Lead Generator API Keys */}
                    <Card>
                        <CardHeader className="p-3 pb-2">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <UserSearch className="h-4 w-4 text-emerald-500" />
                                Lead Generator - API Keys
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                Chiavi API per ricerca lead. Tutti offrono piano gratuito.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <div className="grid grid-cols-1 gap-2">
                            {/* Apollo.io */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <Label htmlFor="apollo-key" className="text-xs">Apollo.io</Label>
                                <div className="flex gap-1.5">
                                    <Input
                                        id="apollo-key"
                                        type="password"
                                        placeholder="API key..."
                                        value={leadGenApollo}
                                        onChange={(e) => { setLeadGenApollo(e.target.value); setApolloTest(null); }}
                                        className="flex-1 h-7 text-xs"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-7 px-2"
                                        disabled={!leadGenApollo || isTestingApollo}
                                        onClick={async () => {
                                            setIsTestingApollo(true); setApolloTest(null);
                                            try { setApolloTest(await testApolloApiKeyAction(leadGenApollo)); }
                                            catch { setApolloTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingApollo(false);
                                        }}
                                    >
                                        {isTestingApollo ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                                        <span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {apolloTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${apolloTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {apolloTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{apolloTest.message}</p>
                                            {apolloTest.quota && (
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                    <Badge variant="outline" className="text-[8px] h-4">{apolloTest.quota.plan}</Badge>
                                                    {apolloTest.quota.extra && <Badge variant="secondary" className="text-[8px] h-4">{apolloTest.quota.extra}</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <p className="text-[9px] text-muted-foreground">220M+ profili. Free: 10k crediti/mese.</p>
                            </div>

                            {/* Hunter.io */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <Label htmlFor="hunter-key" className="text-xs">Hunter.io</Label>
                                <div className="flex gap-1.5">
                                    <Input
                                        id="hunter-key"
                                        type="password"
                                        placeholder="API key..."
                                        value={leadGenHunter}
                                        onChange={(e) => { setLeadGenHunter(e.target.value); setHunterTest(null); }}
                                        className="flex-1 h-7 text-xs"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-7 px-2"
                                        disabled={!leadGenHunter || isTestingHunter}
                                        onClick={async () => {
                                            setIsTestingHunter(true); setHunterTest(null);
                                            try { setHunterTest(await testHunterApiKeyAction(leadGenHunter)); }
                                            catch { setHunterTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingHunter(false);
                                        }}
                                    >
                                        {isTestingHunter ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                                        <span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {hunterTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${hunterTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {hunterTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{hunterTest.message}</p>
                                            {hunterTest.quota && (
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                    <Badge variant="outline" className="text-[8px] h-4">{hunterTest.quota.plan}</Badge>
                                                    <Badge variant="secondary" className="text-[8px] h-4">Ricerche: {hunterTest.quota.used}/{hunterTest.quota.used + hunterTest.quota.available}</Badge>
                                                    {hunterTest.quota.extra && <Badge variant="secondary" className="text-[8px] h-4">{hunterTest.quota.extra}</Badge>}
                                                    {hunterTest.quota.resetDate && <Badge variant="outline" className="text-[8px] h-4">Reset: {new Date(hunterTest.quota.resetDate).toLocaleDateString('it-IT')}</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <p className="text-[9px] text-muted-foreground">Email aziendali. Free: 25 ricerche/mese.</p>
                            </div>

                            {/* SerpApi */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <Label htmlFor="serpapi-key" className="text-xs">SerpApi</Label>
                                <div className="flex gap-1.5">
                                    <Input
                                        id="serpapi-key"
                                        type="password"
                                        placeholder="API key..."
                                        value={leadGenSerpApi}
                                        onChange={(e) => { setLeadGenSerpApi(e.target.value); setSerpApiTest(null); }}
                                        className="flex-1 h-7 text-xs"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-7 px-2"
                                        disabled={!leadGenSerpApi || isTestingSerpApi}
                                        onClick={async () => {
                                            setIsTestingSerpApi(true); setSerpApiTest(null);
                                            try { setSerpApiTest(await testSerpApiKeyAction(leadGenSerpApi)); }
                                            catch { setSerpApiTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingSerpApi(false);
                                        }}
                                    >
                                        {isTestingSerpApi ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                                        <span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {serpApiTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${serpApiTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {serpApiTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{serpApiTest.message}</p>
                                            {serpApiTest.quota && (
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                    <Badge variant="outline" className="text-[8px] h-4">{serpApiTest.quota.plan}</Badge>
                                                    <Badge variant="secondary" className="text-[8px] h-4">{serpApiTest.quota.available} rimaste</Badge>
                                                    {serpApiTest.quota.used > 0 && <Badge variant="secondary" className="text-[8px] h-4">{serpApiTest.quota.used} usate</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <p className="text-[9px] text-muted-foreground">Google Maps/Search. Free: 100/mese.</p>
                            </div>

                            {/* Apify */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <Label htmlFor="apify-key" className="text-xs">Apify</Label>
                                <div className="flex gap-1.5">
                                    <Input
                                        id="apify-key"
                                        type="password"
                                        placeholder="API token..."
                                        value={leadGenApify}
                                        onChange={(e) => { setLeadGenApify(e.target.value); setApifyTest(null); }}
                                        className="flex-1 h-7 text-xs"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-7 px-2"
                                        disabled={!leadGenApify || isTestingApify}
                                        onClick={async () => {
                                            setIsTestingApify(true); setApifyTest(null);
                                            try { setApifyTest(await testApifyApiKeyAction(leadGenApify)); }
                                            catch { setApifyTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingApify(false);
                                        }}
                                    >
                                        {isTestingApify ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                                        <span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {apifyTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${apifyTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {apifyTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{apifyTest.message}</p>
                                            {apifyTest.quota && (
                                                <div className="mt-0.5 flex flex-wrap gap-1">
                                                    <Badge variant="outline" className="text-[8px] h-4">{apifyTest.quota.plan}</Badge>
                                                    <Badge variant="secondary" className="text-[8px] h-4">{apifyTest.quota.extra}</Badge>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <p className="text-[9px] text-muted-foreground">Web scraping. Free: $5/mese crediti.</p>
                            </div>
                            </div>
                            <Button
                                onClick={async () => {
                                    setIsLeadGenSaving(true);
                                    try {
                                        const result = await saveLeadGenApiKeysAction({
                                            apollo: leadGenApollo || undefined,
                                            hunter: leadGenHunter || undefined,
                                            serpApi: leadGenSerpApi || undefined,
                                            apify: leadGenApify || undefined,
                                        });
                                        if (result.success) {
                                            toast({ title: "Salvato", description: "Chiavi API Lead Generator salvate." });
                                        } else {
                                            toast({ title: "Errore", description: result.error, variant: "destructive" });
                                        }
                                    } catch {
                                        toast({ title: "Errore", description: "Impossibile salvare.", variant: "destructive" });
                                    }
                                    setIsLeadGenSaving(false);
                                }}
                                disabled={isLeadGenSaving}
                                size="sm"
                                className="mt-2 h-8 text-xs"
                            >
                                {isLeadGenSaving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Save className="mr-1.5 h-3 w-3" />}
                                {isLeadGenSaving ? 'Salvataggio...' : 'Salva Chiavi API'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Test Chatbot AI */}
                    <Card className="flex flex-col h-[400px]">
                        <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-1.5 text-sm">
                                    <Bot className="h-4 w-4 text-primary" />
                                    Test Chatbot AI
                                </CardTitle>
                                <CardDescription className="text-[11px]">
                                    Verifica le risposte del modello in tempo reale.
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClearChat} title="Pulisci chat">
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col p-3 pt-0 overflow-hidden">
                            <ScrollArea className="flex-1 pr-2">
                                <div className="space-y-2">
                                    {chatMessages.length === 0 ? (
                                        <div className="text-center text-muted-foreground py-6">
                                            <Bot className="h-8 w-8 mx-auto mb-1 opacity-20" />
                                            <p className="text-xs">Inizia una conversazione per testare il modello.</p>
                                        </div>
                                    ) : (
                                        chatMessages.map((msg, index) => (
                                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`flex items-start gap-1.5 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                                        {msg.role === 'user' ? <UserIcon className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                                                    </div>
                                                    <div className={`p-2 rounded-lg text-xs ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {isChatting && (
                                        <div className="flex justify-start">
                                            <div className="flex items-start gap-1.5 max-w-[80%]">
                                                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 bg-muted">
                                                    <Bot className="h-3 w-3" />
                                                </div>
                                                <div className="p-2 rounded-lg text-xs bg-muted flex items-center">
                                                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                                                    Sta scrivendo...
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            <div className="pt-2 mt-2 border-t flex gap-1.5">
                                <Input
                                    placeholder="Scrivi un messaggio..."
                                    value={inputMessage}
                                    onChange={(e) => setInputMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                    disabled={isChatting || !apiKey}
                                    className="h-8 text-xs"
                                />
                                <Button onClick={handleSendMessage} disabled={isChatting || !apiKey || !inputMessage.trim()} size="sm" className="h-8">
                                    <Send className="h-3 w-3" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    </div>
                </div>
            </main>
        </div>
    );
}
