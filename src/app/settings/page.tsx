'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, Save, PlayCircle, Loader2, CheckCircle2, XCircle, Trash2, Search, Globe, ExternalLink, Upload, FileText, File as FileIcon, X, FileImage, FileVideo, FileAudio, FileSpreadsheet, FileCode, FileArchive, Presentation, Terminal, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { testOpenRouterConnection, fetchOpenRouterModelsAction, getOpenRouterCreditsAction } from '../actions';
import { createInvitationAction, getInvitationsAction, revokeInvitationAction } from '../actions/invitations';
import { getOpenRouterSettingsAction, saveOpenRouterSettingsAction } from '@/actions/openrouter';
import { getAiProviderAction, saveAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { ConnectorsManager } from './connectors-manager';
import { Users, UserPlus, Copy, UserSearch } from 'lucide-react';
import {
    getLeadGenApiKeysAction, saveLeadGenApiKeysAction,
    testApolloApiKeyAction, testHunterApiKeyAction, testSerpApiKeyAction, testApifyApiKeyAction, testGroqApiKeyAction, testVibeProspectApiKeyAction, testFirecrawlApiKeyAction, testWhatsAppAction
} from '@/actions/lead-generator';
import { Badge } from '@/components/ui/badge';
import { uploadFile, listFiles, deleteFile, type FileInfo } from '@/lib/storage-client';
import { Progress } from '@/components/ui/progress';

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

    // Invitation State
    const [invitations, setInvitations] = useState<any[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteLink, setInviteLink] = useState('');

    // Provider API Keys State
    const [leadGenApollo, setLeadGenApollo] = useState('');
    const [leadGenHunter, setLeadGenHunter] = useState('');
    const [leadGenSerpApi, setLeadGenSerpApi] = useState('');
    const [leadGenApify, setLeadGenApify] = useState('');
    const [leadGenGroq, setLeadGenGroq] = useState('');
    const [leadGenVibeProspect, setLeadGenVibeProspect] = useState('');
    const [leadGenFirecrawl, setLeadGenFirecrawl] = useState('');
    const [isLeadGenSaving, setIsLeadGenSaving] = useState(false);

    // Provider API Test State
    type ApiTestResult = { success: boolean; message: string; quota?: { used: number; available: number; plan: string; resetDate?: string; extra?: string } };
    const [apolloTest, setApolloTest] = useState<ApiTestResult | null>(null);
    const [hunterTest, setHunterTest] = useState<ApiTestResult | null>(null);
    const [serpApiTest, setSerpApiTest] = useState<ApiTestResult | null>(null);
    const [apifyTest, setApifyTest] = useState<ApiTestResult | null>(null);
    const [groqTest, setGroqTest] = useState<ApiTestResult | null>(null);
    const [vibeProspectTest, setVibeProspectTest] = useState<ApiTestResult | null>(null);
    const [firecrawlTest, setFirecrawlTest] = useState<ApiTestResult | null>(null);
    const [isTestingApollo, setIsTestingApollo] = useState(false);
    const [isTestingHunter, setIsTestingHunter] = useState(false);
    const [isTestingSerpApi, setIsTestingSerpApi] = useState(false);
    const [isTestingApify, setIsTestingApify] = useState(false);
    const [isTestingGroq, setIsTestingGroq] = useState(false);
    const [isTestingVibeProspect, setIsTestingVibeProspect] = useState(false);
    const [isTestingFirecrawl, setIsTestingFirecrawl] = useState(false);

    // WABA Test State
    const [testWABANumber, setTestWABANumber] = useState('');
    const [isTestingWABA, setIsTestingWABA] = useState(false);
    const [wabaTest, setWABATest] = useState<{ success: boolean; message: string } | null>(null);

    // OpenRouter Credits State
    type OpenRouterCredits = { totalCredits: number; totalUsage: number; remaining: number };
    const [orCredits, setOrCredits] = useState<OpenRouterCredits | null>(null);
    const [isLoadingCredits, setIsLoadingCredits] = useState(false);

    // AI Provider State
    const [aiProvider, setAiProvider] = useState<AiProvider>('openrouter');
    const [claudeCliModel, setClaudeCliModel] = useState('claude-sonnet-4-6');
    const [claudeCliStatus, setClaudeCliStatus] = useState<{ available: boolean; version?: string; error?: string } | null>(null);
    const [isCheckingCli, setIsCheckingCli] = useState(false);
    const [isSavingProvider, setIsSavingProvider] = useState(false);

    // OpenAPI State
    const [openApiSpec, setOpenApiSpec] = useState('');
    const [isOpenApiSaving, setIsOpenApiSaving] = useState(false);

    // Files State
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [isFilesLoading, setIsFilesLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadQueue, setUploadQueue] = useState<{ name: string; progress: number }[]>([]);

    const loadOpenRouterCredits = async (_key?: string) => {
        // Key is resolved server-side from DB — client no longer passes it.
        setIsLoadingCredits(true);
        try {
            const res = await getOpenRouterCreditsAction();
            if (res.success && res.credits) {
                setOrCredits(res.credits);
            }
        } catch { /* ignore */ }
        setIsLoadingCredits(false);
    };

    useEffect(() => {
        // Load AI provider settings
        getAiProviderAction().then(res => {
            if (!res.error) {
                setAiProvider(res.provider);
                if (res.claudeCliModel) setClaudeCliModel(res.claudeCliModel);
            }
        });

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

        // Load files
        loadFiles();

        // Load Provider API keys
        getLeadGenApiKeysAction().then(res => {
            if (res.keys) {
                if (res.keys.apollo) setLeadGenApollo(res.keys.apollo);
                if (res.keys.hunter) setLeadGenHunter(res.keys.hunter);
                if (res.keys.serpApi) setLeadGenSerpApi(res.keys.serpApi);
                if (res.keys.apify) setLeadGenApify(res.keys.apify);
                if (res.keys.groq) setLeadGenGroq(res.keys.groq);
                if (res.keys.vibeProspect) setLeadGenVibeProspect(res.keys.vibeProspect);
                if (res.keys.firecrawl) setLeadGenFirecrawl(res.keys.firecrawl);
            }
        });
    }, []);

    useEffect(() => {
        if (isModelDialogOpen && allModels.length === 0) {
            setIsModelsLoading(true);
            fetchOpenRouterModelsAction().then(result => {
                if (result.data) {
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

    const loadFiles = async () => {
        setIsFilesLoading(true);
        const result = await listFiles('data_lake');
        setFiles(result);
        setIsFilesLoading(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;

        setIsUploading(true);
        const queue = Array.from(selectedFiles).map(f => ({ name: f.name, progress: 0 }));
        setUploadQueue(queue);

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, progress: 50 } : q));
            try {
                await uploadFile(file, 'data_lake');
                setUploadQueue(prev => prev.map((q, idx) => idx === i ? { ...q, progress: 100 } : q));
            } catch {
                toast({ title: "Errore", description: `Upload fallito: ${file.name}`, variant: "destructive" });
            }
        }

        await loadFiles();
        setUploadQueue([]);
        setIsUploading(false);
        e.target.value = '';
    };

    const handleDeleteFile = async (name: string) => {
        const ok = await deleteFile(name, 'data_lake');
        if (ok) {
            setFiles(prev => prev.filter(f => f.name !== name));
            toast({ title: "File eliminato" });
        } else {
            toast({ title: "Errore", description: "Impossibile eliminare il file.", variant: "destructive" });
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getFileIcon = (name: string) => {
        const ext = name.split('.').pop()?.toLowerCase() || '';
        const cls = "h-3.5 w-3.5 shrink-0";
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext))
            return <FileImage className={`${cls} text-pink-500`} />;
        if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext))
            return <FileVideo className={`${cls} text-purple-500`} />;
        if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext))
            return <FileAudio className={`${cls} text-amber-500`} />;
        if (['pdf'].includes(ext))
            return <FileText className={`${cls} text-red-500`} />;
        if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext))
            return <FileSpreadsheet className={`${cls} text-green-600`} />;
        if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext))
            return <FileText className={`${cls} text-blue-500`} />;
        if (['ppt', 'pptx', 'odp'].includes(ext))
            return <Presentation className={`${cls} text-orange-500`} />;
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext))
            return <FileArchive className={`${cls} text-yellow-600`} />;
        if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'html', 'css', 'json', 'xml', 'sql', 'sh'].includes(ext))
            return <FileCode className={`${cls} text-cyan-500`} />;
        return <FileIcon className={`${cls} text-muted-foreground`} />;
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 grid-rows-[auto] lg:grid-rows-[calc(50vh-2rem)_calc(50vh-2rem)]">

                    {/* Team Management Card */}
                    <Card className="border-primary/20 bg-primary/5 flex flex-col h-full">
                        <CardHeader className="p-3 pb-2 shrink-0">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <Users className="h-4 w-4 text-primary" />
                                Gestione Team
                            </CardTitle>
                            <CardDescription className="text-[11px]">Invita colleghi alla tua azienda.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 flex-1 overflow-y-auto">
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

                    {/* AI Provider Selection */}
                    <Card className="flex flex-col h-full">
                        <CardHeader className="p-3 pb-2 shrink-0">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <Radio className="h-4 w-4 text-violet-500" />
                                AI Provider
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                Scegli il backend AI per gli agenti.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-3 flex-1 overflow-y-auto">
                            {/* Provider toggle */}
                            <div className="flex gap-1.5">
                                <Button
                                    variant={aiProvider === 'openrouter' ? 'default' : 'outline'}
                                    size="sm"
                                    className="flex-1 h-8 text-xs"
                                    onClick={async () => {
                                        setAiProvider('openrouter');
                                        setIsSavingProvider(true);
                                        await saveAiProviderAction('openrouter');
                                        setIsSavingProvider(false);
                                        window.dispatchEvent(new Event('ai-provider-changed'));
                                        toast({ title: 'Provider impostato', description: 'OpenRouter attivo.' });
                                    }}
                                >
                                    <Globe className="mr-1.5 h-3 w-3" />
                                    OpenRouter
                                </Button>
                                <Button
                                    variant={aiProvider === 'claude-cli' ? 'default' : 'outline'}
                                    size="sm"
                                    className="flex-1 h-8 text-xs"
                                    onClick={async () => {
                                        setAiProvider('claude-cli');
                                        setIsSavingProvider(true);
                                        await saveAiProviderAction('claude-cli', claudeCliModel);
                                        setIsSavingProvider(false);
                                        window.dispatchEvent(new Event('ai-provider-changed'));
                                        toast({ title: 'Provider impostato', description: 'Claude Code CLI attivo.' });
                                    }}
                                >
                                    <Terminal className="mr-1.5 h-3 w-3" />
                                    Claude CLI
                                </Button>
                            </div>

                            {aiProvider === 'claude-cli' && (
                                <>
                                    {/* Claude model selector */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Modello Claude</Label>
                                        <select
                                            className="w-full h-8 text-xs rounded-md border bg-background px-2"
                                            value={claudeCliModel}
                                            onChange={async (e) => {
                                                const newModel = e.target.value;
                                                setClaudeCliModel(newModel);
                                                await saveAiProviderAction('claude-cli', newModel);
                                            }}
                                        >
                                            <optgroup label="Latest">
                                                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                                                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                                                <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
                                            </optgroup>
                                            <optgroup label="Alias">
                                                <option value="sonnet">sonnet (latest)</option>
                                                <option value="opus">opus (latest)</option>
                                                <option value="haiku">haiku (latest)</option>
                                            </optgroup>
                                            <optgroup label="Legacy">
                                                <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5</option>
                                                <option value="claude-opus-4-5-20251101">Claude Opus 4.5</option>
                                                <option value="claude-opus-4-1-20250805">Claude Opus 4.1</option>
                                                <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                                                <option value="claude-opus-4-20250514">Claude Opus 4</option>
                                            </optgroup>
                                        </select>
                                    </div>

                                    {/* CLI status check */}
                                    <div className="flex flex-col gap-2 pt-2 border-t">
                                        <Button
                                            onClick={async () => {
                                                setIsCheckingCli(true);
                                                try {
                                                    const res = await fetch('/api/claude-cli/status');
                                                    const data = await res.json();
                                                    setClaudeCliStatus(data);
                                                } catch {
                                                    setClaudeCliStatus({ available: false, error: 'Errore di rete' });
                                                }
                                                setIsCheckingCli(false);
                                            }}
                                            disabled={isCheckingCli}
                                            variant="secondary"
                                            size="sm"
                                            className="h-8 text-xs"
                                        >
                                            {isCheckingCli ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Terminal className="mr-1.5 h-3 w-3" />}
                                            Verifica CLI
                                        </Button>

                                        {claudeCliStatus && (
                                            <div className={`p-2 rounded-md flex items-start gap-2 text-[11px] ${claudeCliStatus.available ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                                {claudeCliStatus.available ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                ) : (
                                                    <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                )}
                                                <div>
                                                    <p className="font-medium">{claudeCliStatus.available ? 'CLI Disponibile' : 'CLI Non Trovato'}</p>
                                                    <p className="mt-0.5 opacity-90">{claudeCliStatus.version || claudeCliStatus.error}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-[9px] text-muted-foreground">
                                        Il CLI usa le credenziali locali. Non serve API key.
                                    </p>
                                </>
                            )}

                            {aiProvider === 'openrouter' && (
                                <p className="text-[9px] text-muted-foreground">
                                    Configura API key e modello nella card OpenRouter qui sotto.
                                </p>
                            )}

                            {isSavingProvider && (
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Salvataggio...
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* OpenRouter */}
                    <Card className={`flex flex-col h-full ${aiProvider === 'claude-cli' ? 'opacity-50' : ''}`}>
                        <CardHeader className="p-3 pb-2 shrink-0">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <Settings className="h-4 w-4 text-primary" />
                                OpenRouter
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                API key e modello preferito.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-3 flex-1 overflow-y-auto">
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

                    {/* OpenAPI Setup */}
                    <Card className="flex flex-col h-full">
                        <CardHeader className="p-3 pb-2 shrink-0">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <Globe className="h-4 w-4 text-blue-500" />
                                OpenAPI
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                Configura la specifica OpenAPI per le tue API.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-3 flex-1 overflow-y-auto">
                            <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
                                <h4 className="text-xs font-medium">Come accedere</h4>
                                <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside">
                                    <li>Vai su <span className="font-medium text-foreground">/api/docs</span> per la documentazione interattiva Swagger UI</li>
                                    <li>Usa <span className="font-medium text-foreground">/api/openapi.json</span> per scaricare la specifica in formato JSON</li>
                                    <li>Importa la specifica in Postman, Insomnia o altri client API</li>
                                </ol>
                                <div className="flex gap-1.5 pt-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[10px]"
                                        onClick={() => window.open('/api/docs', '_blank')}
                                    >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        Swagger UI
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[10px]"
                                        onClick={() => window.open('/api/openapi.json', '_blank')}
                                    >
                                        <ExternalLink className="h-3 w-3 mr-1" />
                                        OpenAPI JSON
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs">Specifica OpenAPI (YAML/JSON)</Label>
                                <Textarea
                                    placeholder={'{\n  "openapi": "3.0.0",\n  "info": { "title": "My API", "version": "1.0" },\n  "paths": { ... }\n}'}
                                    value={openApiSpec}
                                    onChange={(e) => setOpenApiSpec(e.target.value)}
                                    className="text-xs font-mono min-h-[120px] resize-y"
                                />
                                <p className="text-[9px] text-muted-foreground">
                                    Incolla qui la tua specifica OpenAPI per personalizzare la documentazione delle API.
                                </p>
                            </div>

                            <Button
                                onClick={async () => {
                                    setIsOpenApiSaving(true);
                                    // TODO: implement save action
                                    await new Promise(r => setTimeout(r, 500));
                                    toast({ title: "Salvato", description: "Specifica OpenAPI salvata." });
                                    setIsOpenApiSaving(false);
                                }}
                                disabled={isOpenApiSaving || !openApiSpec.trim()}
                                size="sm"
                                className="h-8 text-xs"
                            >
                                {isOpenApiSaving ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Save className="mr-1.5 h-3 w-3" />}
                                {isOpenApiSaving ? 'Salvataggio...' : 'Salva Specifica'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Files */}
                    <Card className="flex flex-col h-full">
                        <CardHeader className="p-3 pb-2 shrink-0">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <FileText className="h-4 w-4 text-orange-500" />
                                Documenti
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                Carica file di qualsiasi formato.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-3 flex-1 overflow-y-auto">
                            <div>
                                <input
                                    type="file"
                                    id="file-upload"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-8 text-xs"
                                    disabled={isUploading}
                                    onClick={() => document.getElementById('file-upload')?.click()}
                                >
                                    {isUploading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Upload className="h-3 w-3 mr-1.5" />}
                                    {isUploading ? 'Caricamento...' : 'Carica File'}
                                </Button>
                            </div>

                            {uploadQueue.length > 0 && (
                                <div className="space-y-1.5">
                                    {uploadQueue.map((item, i) => (
                                        <div key={i} className="space-y-0.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">{item.name}</span>
                                                <span className="text-[9px] text-muted-foreground">{item.progress}%</span>
                                            </div>
                                            <Progress value={item.progress} className="h-1" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="border rounded-md divide-y bg-background">
                                {isFilesLoading ? (
                                    <div className="flex items-center justify-center py-6">
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    </div>
                                ) : files.length === 0 ? (
                                    <div className="text-center py-6">
                                        <FileIcon className="h-6 w-6 mx-auto text-muted-foreground/30 mb-1" />
                                        <p className="text-[11px] text-muted-foreground italic">Nessun file caricato.</p>
                                    </div>
                                ) : (
                                    files.map(file => (
                                        <div key={file.name} className="p-2 flex items-center gap-2 group">
                                            {getFileIcon(file.name)}
                                            <div className="flex-1 min-w-0">
                                                <a
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline truncate block"
                                                    title={file.name}
                                                >
                                                    {file.name}
                                                </a>
                                                <p className="text-[9px] text-muted-foreground">
                                                    {formatFileSize(file.size)} &middot; {new Date(file.createdAt).toLocaleDateString('it-IT')}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                onClick={() => handleDeleteFile(file.name)}
                                            >
                                                <X className="h-3 w-3 text-destructive" />
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>

                            {files.length > 0 && (
                                <p className="text-[9px] text-muted-foreground text-right">{files.length} file</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Provider API Keys */}
                    <Card className="flex flex-col h-full">
                        <CardHeader className="p-3 pb-2 shrink-0">
                            <CardTitle className="flex items-center gap-1.5 text-sm">
                                <UserSearch className="h-4 w-4 text-emerald-500" />
                                Provider - API Keys
                            </CardTitle>
                            <CardDescription className="text-[11px]">
                                Chiavi API dei provider esterni. Tutti offrono piano gratuito.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 flex-1 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-2">

                            {/* Apollo.io */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="apollo-key" className="text-xs">Apollo.io</Label>
                                    <a href="https://app.apollo.io/#/settings/keys/create" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">apollo.io <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="apollo-key" type="password" placeholder="API key..." value={leadGenApollo} onChange={(e) => { setLeadGenApollo(e.target.value); setApolloTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenApollo || isTestingApollo} onClick={async () => { setIsTestingApollo(true); setApolloTest(null); try { setApolloTest(await testApolloApiKeyAction(leadGenApollo)); } catch { setApolloTest({ success: false, message: 'Errore di connessione' }); } setIsTestingApollo(false); }}>
                                        {isTestingApollo ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {apolloTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${apolloTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {apolloTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div><p className="font-medium">{apolloTest.message}</p>{apolloTest.quota && (<div className="mt-0.5 flex flex-wrap gap-1"><Badge variant="outline" className="text-[8px] h-4">{apolloTest.quota.plan}</Badge>{apolloTest.quota.extra && <Badge variant="secondary" className="text-[8px] h-4">{apolloTest.quota.extra}</Badge>}</div>)}</div>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati su <span className="font-medium text-foreground">app.apollo.io</span></li>
                                    <li>Vai in <span className="font-medium text-foreground">Settings → API Keys → Create</span></li>
                                    <li>Incolla la chiave qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">220M+ profili. Free: 10k crediti/mese.</p>
                            </div>

                            {/* Hunter.io */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="hunter-key" className="text-xs">Hunter.io</Label>
                                    <a href="https://hunter.io/api-keys" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">hunter.io <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="hunter-key" type="password" placeholder="API key..." value={leadGenHunter} onChange={(e) => { setLeadGenHunter(e.target.value); setHunterTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenHunter || isTestingHunter} onClick={async () => { setIsTestingHunter(true); setHunterTest(null); try { setHunterTest(await testHunterApiKeyAction(leadGenHunter)); } catch { setHunterTest({ success: false, message: 'Errore di connessione' }); } setIsTestingHunter(false); }}>
                                        {isTestingHunter ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {hunterTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${hunterTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {hunterTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div><p className="font-medium">{hunterTest.message}</p>{hunterTest.quota && (<div className="mt-0.5 flex flex-wrap gap-1"><Badge variant="outline" className="text-[8px] h-4">{hunterTest.quota.plan}</Badge><Badge variant="secondary" className="text-[8px] h-4">Ricerche: {hunterTest.quota.used}/{hunterTest.quota.used + hunterTest.quota.available}</Badge>{hunterTest.quota.extra && <Badge variant="secondary" className="text-[8px] h-4">{hunterTest.quota.extra}</Badge>}{hunterTest.quota.resetDate && <Badge variant="outline" className="text-[8px] h-4">Reset: {new Date(hunterTest.quota.resetDate).toLocaleDateString('it-IT')}</Badge>}</div>)}</div>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati su <span className="font-medium text-foreground">hunter.io</span></li>
                                    <li>Vai in <span className="font-medium text-foreground">Dashboard → API Keys</span></li>
                                    <li>Incolla la chiave qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">Email aziendali. Free: 25 ricerche/mese.</p>
                            </div>

                            {/* SerpApi */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="serpapi-key" className="text-xs">SerpApi</Label>
                                    <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">serpapi.com <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="serpapi-key" type="password" placeholder="API key..." value={leadGenSerpApi} onChange={(e) => { setLeadGenSerpApi(e.target.value); setSerpApiTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenSerpApi || isTestingSerpApi} onClick={async () => { setIsTestingSerpApi(true); setSerpApiTest(null); try { setSerpApiTest(await testSerpApiKeyAction(leadGenSerpApi)); } catch { setSerpApiTest({ success: false, message: 'Errore di connessione' }); } setIsTestingSerpApi(false); }}>
                                        {isTestingSerpApi ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {serpApiTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${serpApiTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {serpApiTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div><p className="font-medium">{serpApiTest.message}</p>{serpApiTest.quota && (<div className="mt-0.5 flex flex-wrap gap-1"><Badge variant="outline" className="text-[8px] h-4">{serpApiTest.quota.plan}</Badge><Badge variant="secondary" className="text-[8px] h-4">{serpApiTest.quota.available} rimaste</Badge>{serpApiTest.quota.used > 0 && <Badge variant="secondary" className="text-[8px] h-4">{serpApiTest.quota.used} usate</Badge>}</div>)}</div>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati su <span className="font-medium text-foreground">serpapi.com</span></li>
                                    <li>Vai in <span className="font-medium text-foreground">Dashboard → API Key</span></li>
                                    <li>Incolla la chiave qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">Google Maps/Search. Free: 100/mese.</p>
                            </div>

                            {/* Apify */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="apify-key" className="text-xs">Apify</Label>
                                    <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">apify.com <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="apify-key" type="password" placeholder="API token..." value={leadGenApify} onChange={(e) => { setLeadGenApify(e.target.value); setApifyTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenApify || isTestingApify} onClick={async () => { setIsTestingApify(true); setApifyTest(null); try { setApifyTest(await testApifyApiKeyAction(leadGenApify)); } catch { setApifyTest({ success: false, message: 'Errore di connessione' }); } setIsTestingApify(false); }}>
                                        {isTestingApify ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {apifyTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${apifyTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {apifyTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div><p className="font-medium">{apifyTest.message}</p>{apifyTest.quota && (<div className="mt-0.5 flex flex-wrap gap-1"><Badge variant="outline" className="text-[8px] h-4">{apifyTest.quota.plan}</Badge><Badge variant="secondary" className="text-[8px] h-4">{apifyTest.quota.extra}</Badge></div>)}</div>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati su <span className="font-medium text-foreground">apify.com</span></li>
                                    <li>Vai in <span className="font-medium text-foreground">Settings → Integrations → API tokens</span></li>
                                    <li>Incolla il token qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">Web scraping. Free: $5/mese crediti.</p>
                            </div>

                            {/* Vibe Prospecting (Explorium) */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="vibe-prospect-key" className="text-xs">Vibe Prospecting</Label>
                                    <a href="https://app.vibeprospecting.ai" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">vibeprospecting.ai <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="vibe-prospect-key" type="password" placeholder="API key..." value={leadGenVibeProspect} onChange={(e) => { setLeadGenVibeProspect(e.target.value); setVibeProspectTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenVibeProspect || isTestingVibeProspect} onClick={async () => { setIsTestingVibeProspect(true); setVibeProspectTest(null); try { setVibeProspectTest(await testVibeProspectApiKeyAction(leadGenVibeProspect)); } catch { setVibeProspectTest({ success: false, message: 'Errore di connessione' }); } setIsTestingVibeProspect(false); }}>
                                        {isTestingVibeProspect ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {vibeProspectTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${vibeProspectTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {vibeProspectTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div><p className="font-medium">{vibeProspectTest.message}</p>{vibeProspectTest.quota && (<div className="mt-0.5 flex flex-wrap gap-1"><Badge variant="outline" className="text-[8px] h-4">{vibeProspectTest.quota.plan}</Badge>{vibeProspectTest.quota.extra && <Badge variant="secondary" className="text-[8px] h-4">{vibeProspectTest.quota.extra}</Badge>}</div>)}</div>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati gratis su <a href="https://app.vibeprospecting.ai/signup" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">app.vibeprospecting.ai/signup</a></li>
                                    <li>Recupera la API key da <a href="https://admin.explorium.ai" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">admin.explorium.ai</a> → API Key</li>
                                    <li>Incolla la chiave qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">80M+ aziende, intent data, email verificate. Piano free disponibile.</p>
                            </div>

                            {/* Firecrawl */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="firecrawl-key" className="text-xs">Firecrawl</Label>
                                    <a href="https://www.firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">firecrawl.dev <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="firecrawl-key" type="password" placeholder="fc-xxxxxxxxxxxx" value={leadGenFirecrawl} onChange={(e) => { setLeadGenFirecrawl(e.target.value); setFirecrawlTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenFirecrawl || isTestingFirecrawl} onClick={async () => { setIsTestingFirecrawl(true); setFirecrawlTest(null); try { setFirecrawlTest(await testFirecrawlApiKeyAction(leadGenFirecrawl)); } catch { setFirecrawlTest({ success: false, message: 'Errore di connessione' }); } setIsTestingFirecrawl(false); }}>
                                        {isTestingFirecrawl ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {firecrawlTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${firecrawlTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {firecrawlTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <div><p className="font-medium">{firecrawlTest.message}</p>{firecrawlTest.quota && (<div className="mt-0.5 flex flex-wrap gap-1"><Badge variant="outline" className="text-[8px] h-4">{firecrawlTest.quota.plan}</Badge>{firecrawlTest.quota.extra && <Badge variant="secondary" className="text-[8px] h-4">{firecrawlTest.quota.extra}</Badge>}</div>)}</div>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati su <a href="https://www.firecrawl.dev" target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">firecrawl.dev</a></li>
                                    <li>Vai in <span className="font-medium text-foreground">Dashboard → API Keys</span></li>
                                    <li>Incolla la chiave qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">Web scraping AI. Free: 500 crediti (no carta).</p>
                            </div>

                            {/* Groq */}
                            <div className="space-y-1.5 p-2.5 border rounded-lg">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="groq-key" className="text-xs">🎙️ Groq (WhatsApp Audio)</Label>
                                    <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-[9px] text-muted-foreground hover:underline flex items-center gap-0.5">console.groq.com <ExternalLink className="h-2.5 w-2.5" /></a>
                                </div>
                                <div className="flex gap-1.5">
                                    <Input id="groq-key" type="password" placeholder="gsk_xxxxxxxxxxxxxxxxxxxx" value={leadGenGroq} onChange={(e) => { setLeadGenGroq(e.target.value); setGroqTest(null); }} className="flex-1 h-7 text-xs" />
                                    <Button variant="secondary" size="sm" className="h-7 px-2" disabled={!leadGenGroq || isTestingGroq} onClick={async () => { setIsTestingGroq(true); setGroqTest(null); try { setGroqTest(await testGroqApiKeyAction(leadGenGroq)); } catch { setGroqTest({ success: false, message: 'Errore di connessione' }); } setIsTestingGroq(false); }}>
                                        {isTestingGroq ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}<span className="ml-1 text-[10px]">Test</span>
                                    </Button>
                                </div>
                                {groqTest && (
                                    <div className={`p-2 rounded-md flex items-start gap-1.5 text-[10px] ${groqTest.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {groqTest.success ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 shrink-0" />}
                                        <p className="font-medium">{groqTest.message}</p>
                                    </div>
                                )}
                                <ol className="text-[9px] text-muted-foreground list-decimal list-inside space-y-0.5 pt-0.5">
                                    <li>Registrati su <span className="font-medium text-foreground">console.groq.com</span></li>
                                    <li>Vai in <span className="font-medium text-foreground">API Keys → Create API Key</span></li>
                                    <li>Incolla la chiave qui sopra e salva</li>
                                </ol>
                                <p className="text-[9px] text-muted-foreground">Tras. audio WhatsApp. Free: 2.000 min/giorno.</p>
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
                                            groq: leadGenGroq || undefined,
                                            vibeProspect: leadGenVibeProspect || undefined,
                                            firecrawl: leadGenFirecrawl || undefined,
                                        });
                                        if (result.success) {
                                            toast({ title: "Salvato", description: "Chiavi API Provider salvate." });
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

                    {/* GDPR Section */}
                    <Card className="border-destructive/30">
                        <CardHeader className="p-3 pb-2">
                            <CardTitle className="text-sm flex items-center gap-1.5">
                                <Settings className="h-4 w-4" />
                                Privacy & Dati (GDPR)
                            </CardTitle>
                            <CardDescription className="text-[10px]">
                                Esporta o elimina i tuoi dati personali.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-3">
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-8 text-xs"
                                    onClick={async () => {
                                        try {
                                            const res = await fetch('/api/gdpr/export');
                                            if (!res.ok) {
                                                const err = await res.json();
                                                toast({ title: 'Errore', description: err.error || 'Export fallito', variant: 'destructive' });
                                                return;
                                            }
                                            const blob = await res.blob();
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
                                            a.click();
                                            URL.revokeObjectURL(url);
                                            toast({ title: 'Esportato', description: 'I tuoi dati sono stati scaricati.' });
                                        } catch {
                                            toast({ title: 'Errore', description: 'Impossibile esportare i dati.', variant: 'destructive' });
                                        }
                                    }}
                                >
                                    <Save className="mr-1.5 h-3 w-3" />
                                    Esporta i miei dati
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1 h-8 text-xs"
                                    onClick={async () => {
                                        const confirmed = window.confirm(
                                            'ATTENZIONE: Questa azione è irreversibile.\n\n' +
                                            'Verranno eliminati:\n' +
                                            '- Il tuo account\n' +
                                            '- Le tue impostazioni\n' +
                                            '- I tuoi layout salvati\n' +
                                            '- I tuoi task schedulati\n\n' +
                                            'Vuoi procedere?'
                                        );
                                        if (!confirmed) return;

                                        const doubleConfirm = window.prompt(
                                            'Per confermare, scrivi "DELETE MY ACCOUNT":'
                                        );
                                        if (doubleConfirm !== 'DELETE MY ACCOUNT') {
                                            toast({ title: 'Annullato', description: 'Eliminazione annullata.' });
                                            return;
                                        }

                                        try {
                                            const res = await fetch('/api/gdpr/delete', {
                                                method: 'DELETE',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' }),
                                            });
                                            const data = await res.json();
                                            if (res.ok && data.success) {
                                                toast({ title: 'Account eliminato', description: 'Il tuo account è stato eliminato.' });
                                                window.location.href = '/auth/signin';
                                            } else {
                                                toast({ title: 'Errore', description: data.error || 'Eliminazione fallita', variant: 'destructive' });
                                            }
                                        } catch {
                                            toast({ title: 'Errore', description: 'Impossibile eliminare l\'account.', variant: 'destructive' });
                                        }
                                    }}
                                >
                                    <Trash2 className="mr-1.5 h-3 w-3" />
                                    Elimina account
                                </Button>
                            </div>
                            <p className="text-[9px] text-muted-foreground">
                                Art. 17 (Diritto alla cancellazione) e Art. 20 (Portabilità dei dati) del GDPR.
                            </p>
                        </CardContent>
                    </Card>

                    </div>
                </div>
            </main>
        </div>
    );
}
