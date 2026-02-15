'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings, Save, PlayCircle, Loader2, CheckCircle2, XCircle, Send, Bot, User as UserIcon, Trash2, Search, Download, Upload } from 'lucide-react';
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
import { exportSettingsAction, importSettingsAction } from '../actions/backup-restore';
import { AppearanceSettings } from './appearance-settings';
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

    // Backup/Restore State
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

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

    const handleExportSettings = async () => {
        setIsExporting(true);
        try {
            const result = await exportSettingsAction();
            if (result.success && result.data) {
                const blob = new Blob([result.data], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `settings-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                toast({
                    title: "Backup completato",
                    description: "Le impostazioni sono state esportate con successo.",
                });
            } else {
                toast({
                    title: "Errore",
                    description: result.error || "Impossibile esportare le impostazioni.",
                    variant: "destructive"
                });
            }
        } catch (e: any) {
            toast({
                title: "Errore",
                description: e.message,
                variant: "destructive"
            });
        }
        setIsExporting(false);
    };

    const handleImportSettings = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const fileContent = await file.text();
            const result = await importSettingsAction(fileContent);

            if (result.success) {
                toast({
                    title: "Importazione completata",
                    description: result.message || "Impostazioni importate con successo.",
                });
                window.location.reload();
            } else {
                toast({
                    title: "Errore",
                    description: result.error || "Impossibile importare le impostazioni.",
                    variant: "destructive"
                });
            }
        } catch (e: any) {
            toast({
                title: "Errore",
                description: e.message,
                variant: "destructive"
            });
        }
        setIsImporting(false);
        event.target.value = '';
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
                <div className="container mx-auto p-4 md:p-6 max-w-2xl pb-20">

                    {/* Team Management Card */}
                    <Card className="mb-6 border-primary/20 bg-primary/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-6 w-6 text-primary" />
                                Gestione Team
                            </CardTitle>
                            <CardDescription>Invita colleghi alla tua azienda per collaborare.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-2 mb-4">
                                <Input
                                    placeholder="Email collega..."
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                                />
                                <Button onClick={handleInvite} disabled={isInviting}>
                                    {isInviting ? <Loader2 className="animate-spin h-4 w-4" /> : <UserPlus className="h-4 w-4 mr-2" />}
                                    Invita
                                </Button>
                            </div>

                            {inviteLink && (
                                <div className="flex flex-col gap-2 p-3 bg-background border rounded-md mb-4 animate-in fade-in slide-in-from-top-2">
                                    <Label className="text-xs text-muted-foreground">Link di invito generato:</Label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs flex-1 break-all bg-muted p-2 rounded select-all">{inviteLink}</code>
                                        <Button variant="outline" size="icon" onClick={() => {
                                            navigator.clipboard.writeText(inviteLink);
                                            toast({ title: "Link copiato!" });
                                        }}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">Invia questo link al tuo collega. Una volta registrato, sarà aggiunto automaticamente al tuo team.</p>
                                </div>
                            )}

                            <div className="space-y-2 mt-6">
                                <h3 className="text-sm font-medium">Inviti In Attesa</h3>
                                {invitations.length === 0 ? (
                                    <p className="text-sm text-muted-foreground italic">Nessun invito attivo.</p>
                                ) : (
                                    <div className="border rounded-md divide-y bg-background">
                                        {invitations.map(inv => (
                                            <div key={inv.id} className="p-3 flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-medium">{inv.email}</p>
                                                    <p className="text-[10px] text-muted-foreground">Scadenza: {new Date(inv.expires).toLocaleDateString()}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={async () => {
                                                    await revokeInvitationAction(inv.id);
                                                    setInvitations(prev => prev.filter(i => i.id !== inv.id));
                                                    toast({ title: "Invito revocato" });
                                                }}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Aspetto */}
                    <AppearanceSettings />

                    {/* Backup & Restore */}
                    <Card className="mt-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Download className="h-6 w-6 text-primary" />
                                Backup & Restore
                            </CardTitle>
                            <CardDescription>
                                Esporta o importa le tue impostazioni e connettori.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-4">
                                <Button
                                    onClick={handleExportSettings}
                                    disabled={isExporting}
                                    variant="outline"
                                    className="flex-1"
                                >
                                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    {isExporting ? 'Esportazione...' : 'Esporta Impostazioni'}
                                </Button>

                                <label className="flex-1">
                                    <Button
                                        disabled={isImporting}
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => document.getElementById('import-file')?.click()}
                                        type="button"
                                    >
                                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                        {isImporting ? 'Importazione...' : 'Importa Impostazioni'}
                                    </Button>
                                    <input
                                        id="import-file"
                                        type="file"
                                        accept=".json"
                                        onChange={handleImportSettings}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Il backup include i connettori e le configurazioni, ma non le password o i token di accesso.
                            </p>
                        </CardContent>
                    </Card>

                    <div className="mb-6">
                        <ConnectorsManager />
                    </div>

                    {/* Lead Generator API Keys */}
                    <Card className="mb-6">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <UserSearch className="h-6 w-6 text-emerald-500" />
                                Lead Generator - API Keys
                            </CardTitle>
                            <CardDescription>
                                Configura le chiavi API per i servizi di ricerca lead. Tutti i servizi offrono un piano gratuito. Le chiavi sono condivise per tutta l&apos;azienda.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Apollo.io */}
                            <div className="space-y-2 p-4 border rounded-lg">
                                <Label htmlFor="apollo-key">Apollo.io API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="apollo-key"
                                        type="password"
                                        placeholder="Inserisci la tua API key Apollo.io..."
                                        value={leadGenApollo}
                                        onChange={(e) => { setLeadGenApollo(e.target.value); setApolloTest(null); }}
                                        className="flex-1"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={!leadGenApollo || isTestingApollo}
                                        onClick={async () => {
                                            setIsTestingApollo(true); setApolloTest(null);
                                            try { setApolloTest(await testApolloApiKeyAction(leadGenApollo)); }
                                            catch { setApolloTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingApollo(false);
                                        }}
                                    >
                                        {isTestingApollo ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                                        <span className="ml-1.5 text-xs">Test</span>
                                    </Button>
                                </div>
                                {apolloTest && (
                                    <div className={`p-3 rounded-md flex items-start gap-2 text-xs ${apolloTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {apolloTest.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{apolloTest.message}</p>
                                            {apolloTest.quota && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    <Badge variant="outline" className="text-[10px]">{apolloTest.quota.plan}</Badge>
                                                    {apolloTest.quota.extra && <Badge variant="secondary" className="text-[10px]">{apolloTest.quota.extra}</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="text-[11px] text-muted-foreground space-y-1">
                                    <p><strong>Cerca contatti e aziende</strong> tra 220M+ profili (Search API + Enrichment API).</p>
                                    <p>Piano Free: 10.000 crediti/mese (sufficiente per ~200 ricerche).</p>
                                    <p>
                                        Come ottenere: Registrati su{' '}
                                        <a href="https://www.apollo.io/" target="_blank" rel="noopener noreferrer" className="text-primary underline">apollo.io</a>
                                        {' '}(piano Free) &rarr; Settings &rarr; Integrations &rarr; API Keys &rarr; copia la chiave.{' '}
                                        <a href="https://app.apollo.io/#/settings/integrations/api" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                            Vai diretto alla pagina API Key
                                        </a>
                                    </p>
                                </div>
                            </div>

                            {/* Hunter.io */}
                            <div className="space-y-2 p-4 border rounded-lg">
                                <Label htmlFor="hunter-key">Hunter.io API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="hunter-key"
                                        type="password"
                                        placeholder="Inserisci la tua API key Hunter.io..."
                                        value={leadGenHunter}
                                        onChange={(e) => { setLeadGenHunter(e.target.value); setHunterTest(null); }}
                                        className="flex-1"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={!leadGenHunter || isTestingHunter}
                                        onClick={async () => {
                                            setIsTestingHunter(true); setHunterTest(null);
                                            try { setHunterTest(await testHunterApiKeyAction(leadGenHunter)); }
                                            catch { setHunterTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingHunter(false);
                                        }}
                                    >
                                        {isTestingHunter ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                                        <span className="ml-1.5 text-xs">Test</span>
                                    </Button>
                                </div>
                                {hunterTest && (
                                    <div className={`p-3 rounded-md flex items-start gap-2 text-xs ${hunterTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {hunterTest.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{hunterTest.message}</p>
                                            {hunterTest.quota && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    <Badge variant="outline" className="text-[10px]">{hunterTest.quota.plan}</Badge>
                                                    <Badge variant="secondary" className="text-[10px]">Ricerche: {hunterTest.quota.used}/{hunterTest.quota.used + hunterTest.quota.available}</Badge>
                                                    {hunterTest.quota.extra && <Badge variant="secondary" className="text-[10px]">{hunterTest.quota.extra}</Badge>}
                                                    {hunterTest.quota.resetDate && <Badge variant="outline" className="text-[10px]">Reset: {new Date(hunterTest.quota.resetDate).toLocaleDateString('it-IT')}</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="text-[11px] text-muted-foreground space-y-1">
                                    <p><strong>Trova e verifica email aziendali</strong> a partire dal dominio dell&apos;azienda.</p>
                                    <p>Piano Free: 25 ricerche + 50 verifiche email/mese.</p>
                                    <p>
                                        Come ottenere: Registrati su{' '}
                                        <a href="https://hunter.io/" target="_blank" rel="noopener noreferrer" className="text-primary underline">hunter.io</a>
                                        {' '}(piano Free) &rarr; clicca sul tuo avatar in alto a destra &rarr; API Keys &rarr; copia la chiave.{' '}
                                        <a href="https://hunter.io/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                            Vai diretto alla pagina API Key
                                        </a>
                                    </p>
                                </div>
                            </div>

                            {/* SerpApi */}
                            <div className="space-y-2 p-4 border rounded-lg">
                                <Label htmlFor="serpapi-key">SerpApi API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="serpapi-key"
                                        type="password"
                                        placeholder="Inserisci la tua API key SerpApi..."
                                        value={leadGenSerpApi}
                                        onChange={(e) => { setLeadGenSerpApi(e.target.value); setSerpApiTest(null); }}
                                        className="flex-1"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={!leadGenSerpApi || isTestingSerpApi}
                                        onClick={async () => {
                                            setIsTestingSerpApi(true); setSerpApiTest(null);
                                            try { setSerpApiTest(await testSerpApiKeyAction(leadGenSerpApi)); }
                                            catch { setSerpApiTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingSerpApi(false);
                                        }}
                                    >
                                        {isTestingSerpApi ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                                        <span className="ml-1.5 text-xs">Test</span>
                                    </Button>
                                </div>
                                {serpApiTest && (
                                    <div className={`p-3 rounded-md flex items-start gap-2 text-xs ${serpApiTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {serpApiTest.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{serpApiTest.message}</p>
                                            {serpApiTest.quota && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    <Badge variant="outline" className="text-[10px]">{serpApiTest.quota.plan}</Badge>
                                                    <Badge variant="secondary" className="text-[10px]">{serpApiTest.quota.available} ricerche rimaste</Badge>
                                                    {serpApiTest.quota.used > 0 && <Badge variant="secondary" className="text-[10px]">{serpApiTest.quota.used} usate questo mese</Badge>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="text-[11px] text-muted-foreground space-y-1">
                                    <p><strong>Cerca attivita&apos; su Google Maps e Google Search</strong> per trovare aziende locali.</p>
                                    <p>Piano Free: 100 ricerche/mese.</p>
                                    <p>
                                        Come ottenere: Registrati su{' '}
                                        <a href="https://serpapi.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">serpapi.com</a>
                                        {' '}(piano Free) &rarr; Dashboard &rarr; Your API Key &rarr; copia la chiave.{' '}
                                        <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                            Vai diretto alla pagina API Key
                                        </a>
                                    </p>
                                </div>
                            </div>

                            {/* Apify */}
                            <div className="space-y-2 p-4 border rounded-lg">
                                <Label htmlFor="apify-key">Apify API Token</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="apify-key"
                                        type="password"
                                        placeholder="Inserisci il tuo API token Apify..."
                                        value={leadGenApify}
                                        onChange={(e) => { setLeadGenApify(e.target.value); setApifyTest(null); }}
                                        className="flex-1"
                                    />
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={!leadGenApify || isTestingApify}
                                        onClick={async () => {
                                            setIsTestingApify(true); setApifyTest(null);
                                            try { setApifyTest(await testApifyApiKeyAction(leadGenApify)); }
                                            catch { setApifyTest({ success: false, message: 'Errore di connessione' }); }
                                            setIsTestingApify(false);
                                        }}
                                    >
                                        {isTestingApify ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                                        <span className="ml-1.5 text-xs">Test</span>
                                    </Button>
                                </div>
                                {apifyTest && (
                                    <div className={`p-3 rounded-md flex items-start gap-2 text-xs ${apifyTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {apifyTest.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                                        <div>
                                            <p className="font-medium">{apifyTest.message}</p>
                                            {apifyTest.quota && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    <Badge variant="outline" className="text-[10px]">{apifyTest.quota.plan}</Badge>
                                                    <Badge variant="secondary" className="text-[10px]">{apifyTest.quota.extra}</Badge>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="text-[11px] text-muted-foreground space-y-1">
                                    <p><strong>Web scraping avanzato</strong>: Google Maps Scraper, LinkedIn, directory aziendali e altro.</p>
                                    <p>Piano Free: $5/mese di crediti (sufficiente per ~500 risultati Google Maps).</p>
                                    <p>
                                        Come ottenere: Registrati su{' '}
                                        <a href="https://www.apify.com/" target="_blank" rel="noopener noreferrer" className="text-primary underline">apify.com</a>
                                        {' '}(piano Free) &rarr; Settings &rarr; Integrations &rarr; Personal API tokens &rarr; crea un token e copialo.{' '}
                                        <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                                            Vai diretto alla pagina API Token
                                        </a>
                                    </p>
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
                            >
                                {isLeadGenSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {isLeadGenSaving ? 'Salvataggio...' : 'Salva Chiavi API'}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Settings className="h-6 w-6 text-primary" />
                                Impostazioni OpenRouter
                            </CardTitle>
                            <CardDescription>
                                Configura la tua chiave API e il modello preferito per OpenRouter.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="api-key">OpenRouter API Key</Label>
                                <Input
                                    id="api-key"
                                    type="password"
                                    placeholder="sk-or-..."
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                                <p className="text-sm text-muted-foreground">
                                    La tua chiave API viene salvata localmente nel browser.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Modello Predefinito</Label>
                                <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button variant="outline" className="w-full justify-between font-normal">
                                            {model || "Seleziona un modello"}
                                            <span className="text-muted-foreground ml-2 text-xs">Cambia</span>
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                                        <DialogHeader>
                                            <DialogTitle>Seleziona Modello AI</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex items-center border rounded-md px-3 py-2 my-2 bg-muted/30">
                                            <Search className="mr-2 h-4 w-4 opacity-50" />
                                            <Input
                                                placeholder="Cerca modello per nome o ID..."
                                                value={modelSearch}
                                                onChange={e => setModelSearch(e.target.value)}
                                                className="border-0 focus-visible:ring-0 bg-transparent"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="flex-1 overflow-auto border rounded-md">
                                            {isModelsLoading ? (
                                                <div className="flex items-center justify-center h-40">
                                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                                    <span className="ml-2 text-muted-foreground">Caricamento modelli...</span>
                                                </div>
                                            ) : (
                                                <Table>
                                                    <TableHeader className="bg-muted/50 sticky top-0 backdrop-blur-sm z-10">
                                                        <TableRow>
                                                            <TableHead>Nome</TableHead>
                                                            <TableHead>ID</TableHead>
                                                            <TableHead>Context</TableHead>
                                                            <TableHead>Input ($/1M)</TableHead>
                                                            <TableHead>Output ($/1M)</TableHead>
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
                                                                    <TableCell className="font-medium p-2 text-xs truncate max-w-[200px]" title={m.name}>
                                                                        {m.name}
                                                                        {isSelected && <CheckCircle2 className="inline ml-1 h-3 w-3 text-primary" />}
                                                                    </TableCell>
                                                                    <TableCell className="text-[10px] text-muted-foreground font-mono p-2 truncate max-w-[150px]" title={m.id}>{m.id}</TableCell>
                                                                    <TableCell className="text-[10px] p-2">{Math.round(m.context_length / 1000)}k</TableCell>
                                                                    <TableCell className="text-[10px] font-mono p-2">
                                                                        ${(parseFloat(m.pricing.prompt) * 1000000).toFixed(2)}
                                                                    </TableCell>
                                                                    <TableCell className="text-[10px] font-mono p-2">
                                                                        ${(parseFloat(m.pricing.completion) * 1000000).toFixed(2)}
                                                                    </TableCell>
                                                                </TableRow>
                                                            );
                                                        })}
                                                        {filteredModels.length === 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                                                                    Nessun modello trovato per "{modelSearch}"
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground text-right pt-2">
                                            {filteredModels.length} modelli disponibili
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>

                            <div className="flex flex-col gap-4 pt-4 border-t">
                                <div className="flex gap-2">
                                    <Button onClick={handleSave} disabled={isLoading} className="flex-1">
                                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        {isLoading ? 'Salvataggio...' : 'Salva Impostazioni'}
                                    </Button>
                                    <Button onClick={handleTestConnection} disabled={isTesting || !apiKey} variant="secondary" className="flex-1">
                                        {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                                        {isTesting ? 'Test in corso...' : 'Test Connessione'}
                                    </Button>
                                </div>

                                {testResult && (
                                    <div className={`p-4 rounded-md flex items-start gap-3 ${testResult.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {testResult.success ? (
                                            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                                        ) : (
                                            <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
                                        )}
                                        <div className="text-sm">
                                            <p className="font-medium">{testResult.success ? 'Successo' : 'Errore'}</p>
                                            <p className="mt-1 opacity-90">{testResult.message}</p>
                                        </div>
                                    </div>
                                )}

                                {/* OpenRouter Credits */}
                                {orCredits && (
                                    <div className="p-4 rounded-md border bg-muted/30">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium">Credito OpenRouter</span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 px-2"
                                                disabled={isLoadingCredits}
                                                onClick={() => loadOpenRouterCredits(apiKey)}
                                            >
                                                {isLoadingCredits ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-[10px]">Aggiorna</span>}
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                Residuo: ${orCredits.remaining.toFixed(4)}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs">
                                                Usato: ${orCredits.totalUsage.toFixed(4)}
                                            </Badge>
                                            <Badge variant="secondary" className="text-xs">
                                                Totale: ${orCredits.totalCredits.toFixed(4)}
                                            </Badge>
                                        </div>
                                        {orCredits.remaining < 0.5 && orCredits.totalCredits > 0 && (
                                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                                                Credito in esaurimento. Ricarica su openrouter.ai/credits
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="mt-6 flex flex-col h-[600px]">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Bot className="h-6 w-6 text-primary" />
                                    Test Chatbot AI
                                </CardTitle>
                                <CardDescription>
                                    Verifica le risposte del modello selezionato in tempo reale.
                                </CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={handleClearChat} title="Pulisci chat">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col p-4 overflow-hidden">
                            <ScrollArea className="flex-1 pr-4">
                                <div className="space-y-4">
                                    {chatMessages.length === 0 ? (
                                        <div className="text-center text-muted-foreground py-10">
                                            <Bot className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                            <p>Inizia una conversazione per testare il modello.</p>
                                        </div>
                                    ) : (
                                        chatMessages.map((msg, index) => (
                                            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`flex items-start gap-2 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                                        {msg.role === 'user' ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                                                    </div>
                                                    <div className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {isChatting && (
                                        <div className="flex justify-start">
                                            <div className="flex items-start gap-2 max-w-[80%]">
                                                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted">
                                                    <Bot className="h-4 w-4" />
                                                </div>
                                                <div className="p-3 rounded-lg text-sm bg-muted flex items-center">
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Sta scrivendo...
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            <div className="pt-4 mt-4 border-t flex gap-2">
                                <Input
                                    placeholder="Scrivi un messaggio..."
                                    value={inputMessage}
                                    onChange={(e) => setInputMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                    disabled={isChatting || !apiKey}
                                />
                                <Button onClick={handleSendMessage} disabled={isChatting || !apiKey || !inputMessage.trim()}>
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
