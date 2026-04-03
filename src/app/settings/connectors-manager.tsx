'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getConnectorsAction, createConnectorAction, deleteConnectorAction, testConnectorAction, updateConnectorAction, sendWhatsAppTestMessageAction, getWhatsAppSessionsAction, getWhatsAppContactsAction, saveWhatsAppContactAction, deleteWhatsAppContactAction } from '../actions/connectors';
import { generateDeviceCodeAction, pollForTokenAction, listSharePointDrivesAction, listSharePointFilesAction, listExcelSheetsAction } from '../actions/sharepoint';
import { Loader2, Trash2, Database, Mail, FileSpreadsheet, Layers, Plus, Wifi, CheckCircle2, XCircle, Pencil, ExternalLink, Copy, FolderOpen, Folder, ChevronRight, ChevronDown, ChevronUp, ArrowLeft, Download, Upload, Map, MessageSquare, Send, ScrollText, Phone, UserPlus, Users, X } from 'lucide-react';
import { DatabaseMapDialog } from './database-map-dialog';
import { exportSettingsAction, importSettingsAction } from '../actions/backup-restore';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const CONNECTOR_TYPES = [
    { value: 'SQL', label: 'SQL Server', icon: Database },
    { value: 'HUBSPOT', label: 'HubSpot', icon: Layers },
    { value: 'SHAREPOINT', label: 'Excel / SharePoint', icon: FileSpreadsheet },
    { value: 'SMTP', label: 'Email SMTP', icon: Mail },
    { value: 'WHATSAPP', label: 'WhatsApp Business', icon: MessageSquare },
    { value: 'LEMLIST', label: 'Lemlist', icon: Send },
];

// Default Azure AD credentials for SharePoint integration
const DEFAULT_TENANT_ID = "0089ad7d-e10f-49b4-bf68-60e706423382";
const DEFAULT_CLIENT_ID = "7ff50e8a-eb8c-4bf8-9fa6-f4068c6fe82b";

export function ConnectorsManager() {
    const { toast } = useToast();
    const [connectors, setConnectors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // State for Dialog Test
    const [isTestingDialog, setIsTestingDialog] = useState(false);

    // State for List Item Tests (Results by ID)
    const [testResults, setTestResults] = useState<Record<string, 'success' | 'error' | 'loading' | null>>({});

    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newType, setNewType] = useState('SQL');
    const [newName, setNewName] = useState('');
    const [configData, setConfigData] = useState<any>({});
    const [testStatus, setTestStatus] = useState<{ success: boolean, message: string } | null>(null);

    // Device Code Flow State
    const [deviceCodeDialog, setDeviceCodeDialog] = useState(false);
    const [deviceCode, setDeviceCode] = useState<{ userCode: string; verificationUri: string; deviceCode: string; message: string } | null>(null);
    const [isPolling, setIsPolling] = useState(false);

    // File Browser State
    const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
    const [browserLoading, setBrowserLoading] = useState(false);
    const [drives, setDrives] = useState<any[]>([]);
    const [files, setFiles] = useState<any[]>([]);
    const [sheets, setSheets] = useState<any[]>([]);
    const [currentSiteId, setCurrentSiteId] = useState<string | null>(null);
    const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
    const [currentDriveName, setCurrentDriveName] = useState<string>('');
    const [currentPath, setCurrentPath] = useState<{ id: string; name: string }[]>([]);
    const [selectedFile, setSelectedFile] = useState<{ id: string; name: string; path: string } | null>(null);
    const [browserStep, setBrowserStep] = useState<'drives' | 'files' | 'sheets'>('drives');

    // Auth Trigger State to know what to resume after login
    const [authTrigger, setAuthTrigger] = useState<'test' | 'browse'>('test');

    // Database Map State
    const [mapDialogOpen, setMapDialogOpen] = useState(false);
    const [selectedMapConnector, setSelectedMapConnector] = useState<any>(null);

    // Backup/Restore State
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // WhatsApp Test & Log State
    const [waTestPhone, setWaTestPhone] = useState('');
    const [waTestMsg, setWaTestMsg] = useState('Ciao! Questo è un messaggio di test da FridAI');
    const [isSendingWaTest, setIsSendingWaTest] = useState(false);
    const [waSessions, setWaSessions] = useState<any[]>([]);
    const [isLoadingWaSessions, setIsLoadingWaSessions] = useState(false);
    const [expandedWaSession, setExpandedWaSession] = useState<string | null>(null);

    // WhatsApp Rubrica (Contacts)
    const [waContacts, setWaContacts] = useState<any[]>([]);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [newContactName, setNewContactName] = useState('');
    const [newContactPhone, setNewContactPhone] = useState('');
    const [showAddContact, setShowAddContact] = useState(false);

    const loadWaContacts = async () => {
        setIsLoadingContacts(true);
        try {
            const res = await getWhatsAppContactsAction();
            if (res.success && res.contacts) setWaContacts(res.contacts);
        } catch {}
        setIsLoadingContacts(false);
    };

    const handleSaveContact = async () => {
        if (!newContactName.trim() || !newContactPhone.trim()) return;
        const res = await saveWhatsAppContactAction(newContactPhone, newContactName);
        if (res.success) {
            toast({ title: 'Contatto salvato' });
            setNewContactName('');
            setNewContactPhone('');
            setShowAddContact(false);
            loadWaContacts();
        } else {
            toast({ title: 'Errore', description: res.error, variant: 'destructive' });
        }
    };

    const handleDeleteContact = async (phone: string) => {
        const res = await deleteWhatsAppContactAction(phone);
        if (res.success) {
            toast({ title: 'Contatto rimosso' });
            loadWaContacts();
        }
    };

    const [waFilterPhone, setWaFilterPhone] = useState<string | null>(null);

    // Build a map phone -> name for quick lookup
    const contactNameMap = Object.fromEntries(waContacts.map((c: any) => [c.phoneNumber, c.name]));

    // Load logs and optionally filter by phone
    const loadLogsForPhone = async (phone?: string) => {
        if (!editingId) return;
        setIsLoadingWaSessions(true);
        setWaFilterPhone(phone || null);
        try {
            const res = await getWhatsAppSessionsAction(editingId);
            if (res.success && res.sessions) {
                setWaSessions(res.sessions);
                // If filtering by phone, auto-expand matching session
                if (phone) {
                    const match = res.sessions.find((s: any) => s.phoneNumber === phone);
                    if (match) setExpandedWaSession(match.id);
                }
            } else {
                toast({ title: 'Errore', description: res.error, variant: 'destructive' });
            }
        } catch (e: any) {
            toast({ title: 'Errore', description: e.message, variant: 'destructive' });
        } finally {
            setIsLoadingWaSessions(false);
        }
    };

    // Filtered sessions
    const filteredSessions = waFilterPhone
        ? waSessions.filter((s: any) => s.phoneNumber === waFilterPhone)
        : waSessions;

    useEffect(() => {
        loadConnectors();
    }, []);

    const loadConnectors = async () => {
        try {
            setIsLoading(true);
            const res = await getConnectorsAction();
            if (res.data) {
                setConnectors(res.data);
            } else if (res.error) {
                toast({ variant: 'destructive', title: 'Errore Caricamento', description: res.error });
            }
        } catch (error) {
            console.error("Failed to load connectors:", error);
            toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile caricare i connettori.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenNew = () => {
        setEditingId(null);
        setNewName('');
        setNewType('SQL');
        setConfigData({});
        setTestStatus(null);
        setIsDialogOpen(true);
    };

    const handleEdit = (connector: any) => {
        setEditingId(connector.id);
        setNewName(connector.name);
        setNewType(connector.type);
        try {
            setConfigData(JSON.parse(connector.config));
        } catch {
            setConfigData({});
        }
        setTestStatus(null);
        setIsDialogOpen(true);
        // Auto-load contacts for WhatsApp connectors
        if (connector.type === 'WHATSAPP') loadWaContacts();
    };

    const handleSave = async () => {
        if (!newName) {
            toast({ variant: 'destructive', title: 'Nome mancante', description: 'Inserisci un nome per il connettore.' });
            return;
        }

        setIsSaving(true);
        try {
            const data = {
                name: newName,
                type: newType,
                config: JSON.stringify(configData)
            };

            let res;
            if (editingId) {
                res = await updateConnectorAction(editingId, data);
            } else {
                res = await createConnectorAction(data);
            }

            if (res.error) throw new Error(res.error);

            toast({ title: editingId ? 'Connettore aggiornato!' : 'Connettore creato!' });
            setIsDialogOpen(false);
            loadConnectors();
        } catch (error: any) {
            console.error("Save error:", error);
            toast({ variant: 'destructive', title: 'Errore', description: error.message || 'Errore durante il salvataggio' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async (explicitType?: string, explicitConfig?: string, connectorId?: string) => {
        const typeToTest = explicitType || newType;
        const configToTest = explicitConfig || JSON.stringify(configData);
        const configForDeviceCode = explicitConfig ? JSON.parse(explicitConfig) : configData;

        if (connectorId) {
            setTestResults(prev => ({ ...prev, [connectorId]: 'loading' }));
        } else {
            setIsTestingDialog(true);
            setTestStatus(null);
        }

        try {
            const res = await testConnectorAction(typeToTest, configToTest);

            // Handle Device Code Auth requirement
            if ((res as any).needsAuth && typeToTest === 'SHAREPOINT') {
                if (connectorId) setTestResults(prev => ({ ...prev, [connectorId]: 'error' }));

                // Start Device Code Flow
                initiateAuth(configForDeviceCode.tenantId, configForDeviceCode.clientId, 'test', connectorId);

                if (!connectorId) setIsTestingDialog(false);
                return;
            }

            if (connectorId) {
                setTestResults(prev => ({ ...prev, [connectorId]: res.success ? 'success' : 'error' }));

                if (res.success) {
                    toast({
                        title: 'Connesso!',
                        description: res.message,
                        className: 'bg-green-50 border-green-200 text-green-900 border'
                    });
                } else {
                    toast({ variant: 'destructive', title: 'Test Fallito', description: res.message });
                }

            } else {
                if ((res as any).error) {
                    toast({ variant: 'destructive', title: 'Errore', description: (res as any).error });
                } else {
                    setTestStatus(res as any);
                    if (res.success) {
                        toast({
                            title: 'Connessione Riuscita',
                            description: res.message,
                            className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                        });
                    } else {
                        toast({
                            variant: 'destructive',
                            title: 'Connessione Fallita',
                            description: res.message
                        });
                    }
                }
            }
        } catch (e: any) {
            console.error("Test error:", e);
            if (connectorId) setTestResults(prev => ({ ...prev, [connectorId]: 'error' }));
            toast({ variant: 'destructive', title: 'Errore', description: e.message || 'Errore durante il test di connessione' });
        } finally {
            if (!connectorId) setIsTestingDialog(false);
        }
    };

    const initiateAuth = async (tenantId: string, clientId: string, trigger: 'test' | 'browse', connectorId?: string) => {
        setAuthTrigger(trigger);

        const deviceCodeRes = await generateDeviceCodeAction(tenantId, clientId);

        if (deviceCodeRes.error) {
            toast({ variant: 'destructive', title: 'Errore Auth', description: deviceCodeRes.error });
        } else if (deviceCodeRes.success) {
            setDeviceCode({
                userCode: deviceCodeRes.userCode!,
                verificationUri: deviceCodeRes.verificationUri!,
                deviceCode: deviceCodeRes.deviceCode!,
                message: deviceCodeRes.message!
            });
            setDeviceCodeDialog(true);
            startDeviceCodePolling(tenantId, clientId, deviceCodeRes.deviceCode!, connectorId);
        }
    };

    const startDeviceCodePolling = async (tenantId: string, clientId: string, deviceCodeStr: string, connectorId?: string) => {
        setIsPolling(true);
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max (5 sec intervals)

        const poll = async () => {
            if (attempts >= maxAttempts) {
                setIsPolling(false);
                setDeviceCodeDialog(false);
                toast({ variant: 'destructive', title: 'Timeout', description: 'Tempo scaduto per l\'autenticazione.' });
                return;
            }

            attempts++;
            const result = await pollForTokenAction(tenantId, clientId, deviceCodeStr);

            if (result.pending) {
                // Continue polling
                setTimeout(poll, result.slowDown ? 10000 : 5000);
            } else if (result.expired) {
                setIsPolling(false);
                setDeviceCodeDialog(false);
                toast({ variant: 'destructive', title: 'Codice Scaduto', description: 'Riprova il test.' });
            } else if (result.error) {
                setIsPolling(false);
                setDeviceCodeDialog(false);
                toast({ variant: 'destructive', title: 'Errore', description: result.error });
            } else if (result.success) {
                setIsPolling(false);
                setDeviceCodeDialog(false);
                toast({
                    title: '✅ Autenticato!',
                    description: result.message,
                    className: 'bg-green-50 border-green-200 text-green-900 border'
                });

                // Retry the original action now that we're authenticated
                if (authTrigger === 'browse') {
                    // Slight delay to allow token propagation/state update
                    setTimeout(() => openFileBrowser(), 1000);
                } else {
                    if (connectorId) {
                        setTimeout(() => handleTest(undefined, undefined, connectorId), 1000);
                    } else {
                        setTimeout(() => handleTest(), 1000);
                    }
                }
            }
        };

        poll();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copiato!', description: 'Codice copiato negli appunti.' });
    };

    // File Browser Functions
    const openFileBrowser = async () => {
        if (!configData.tenantId || !configData.clientId || !configData.siteUrl) {
            toast({ variant: 'destructive', title: 'Campi mancanti', description: 'Inserisci prima Tenant ID, Client ID e URL Sito' });
            return;
        }

        setFileBrowserOpen(true);
        setBrowserStep('drives');
        setBrowserLoading(true);
        setDrives([]);
        setFiles([]);
        setSheets([]);
        setCurrentPath([]);
        setSelectedFile(null);

        const res = await listSharePointDrivesAction(configData.tenantId, configData.clientId, configData.siteUrl);
        setBrowserLoading(false);

        if (res.needsAuth) {
            toast({ title: 'Autenticazione richiesta', description: 'Avvio procedura di login...' });
            setFileBrowserOpen(false);
            // Auto-trigger auth
            initiateAuth(configData.tenantId, configData.clientId, 'browse');
            return;
        }

        if (res.error) {
            toast({ variant: 'destructive', title: 'Errore', description: res.error });
            return;
        }

        if (res.success && res.drives) {
            setDrives(res.drives);
            setCurrentSiteId(res.siteId);
        }
    };

    const selectDrive = async (drive: any) => {
        setCurrentDriveId(drive.id);
        setCurrentDriveName(drive.name);
        setBrowserStep('files');
        setBrowserLoading(true);
        setCurrentPath([]);

        const res = await listSharePointFilesAction(
            configData.tenantId,
            configData.clientId,
            currentSiteId!,
            drive.id
        );
        setBrowserLoading(false);

        if (res.error) {
            toast({ variant: 'destructive', title: 'Errore', description: res.error });
            return;
        }

        if (res.success && res.items) {
            setFiles(res.items);
        }
    };

    const navigateToFolder = async (folder: any) => {
        setBrowserLoading(true);
        setCurrentPath([...currentPath, { id: folder.id, name: folder.name }]);

        const res = await listSharePointFilesAction(
            configData.tenantId,
            configData.clientId,
            currentSiteId!,
            currentDriveId!,
            folder.id
        );
        setBrowserLoading(false);

        if (res.success && res.items) {
            setFiles(res.items);
        }
    };

    const navigateBack = async () => {
        if (currentPath.length === 0) {
            setBrowserStep('drives');
            return;
        }

        setBrowserLoading(true);
        const newPath = [...currentPath];
        newPath.pop();
        setCurrentPath(newPath);

        const parentId = newPath.length > 0 ? newPath[newPath.length - 1].id : undefined;

        const res = await listSharePointFilesAction(
            configData.tenantId,
            configData.clientId,
            currentSiteId!,
            currentDriveId!,
            parentId
        );
        setBrowserLoading(false);

        if (res.success && res.items) {
            setFiles(res.items);
        }
    };

    const selectExcelFile = async (file: any) => {
        setSelectedFile({ id: file.id, name: file.name, path: file.path + '/' + file.name });
        setBrowserStep('sheets');
        setBrowserLoading(true);

        const res = await listExcelSheetsAction(
            configData.tenantId,
            configData.clientId,
            currentSiteId!,
            currentDriveId!,
            file.id
        );
        setBrowserLoading(false);

        if (res.error) {
            toast({ variant: 'destructive', title: 'Errore', description: res.error });
            return;
        }

        if (res.success && res.sheets) {
            setSheets(res.sheets);
        }
    };

    const selectSheet = (sheet: any) => {
        // Build the file path
        const pathParts = ['/' + currentDriveName];
        currentPath.forEach(p => pathParts.push(p.name));
        pathParts.push(selectedFile!.name);
        const fullPath = pathParts.join('/').replace(/\/+/g, '/');

        setConfigData({
            ...configData,
            filePath: fullPath,
            sheetName: sheet.name,
            // Store IDs for later use
            _siteId: currentSiteId,
            _driveId: currentDriveId,
            _fileId: selectedFile!.id
        });

        setFileBrowserOpen(false);
        toast({ title: 'File selezionato', description: `${selectedFile!.name} - Foglio: ${sheet.name}` });
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation; // Prevent edit click if nested
        if (!confirm('Sei sicuro di voler eliminare questo connettore?')) return;

        try {
            const res = await deleteConnectorAction(id);
            if (res.success) {
                toast({ title: 'Eliminato' });
                loadConnectors();
            } else {
                toast({ variant: 'destructive', title: 'Errore', description: res.error });
            }
        } catch (err) {
            console.error("Delete error:", err);
            toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile eliminare il connettore.' });
        }
    };

    const renderConfigFields = () => {
        switch (newType) {
            case 'SQL':
                return (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Host</Label>
                                <Input value={configData.host || ''} onChange={e => setConfigData({ ...configData, host: e.target.value })} placeholder="es. 192.168.1.10" />
                            </div>
                            <div className="space-y-2">
                                <Label>Porta</Label>
                                <Input value={configData.port || ''} onChange={e => setConfigData({ ...configData, port: e.target.value })} placeholder="1433" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Database Name</Label>
                            <Input value={configData.database || ''} onChange={e => setConfigData({ ...configData, database: e.target.value })} placeholder="DB_Produzione" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Utente</Label>
                                <Input value={configData.user || ''} onChange={e => setConfigData({ ...configData, user: e.target.value })} placeholder="sa" />
                            </div>
                            <div className="space-y-2">
                                <Label>Password</Label>
                                <Input type="password" value={configData.password || ''} onChange={e => setConfigData({ ...configData, password: e.target.value })} />
                            </div>
                        </div>
                    </>
                );
            case 'HUBSPOT':
                return (
                    <div className="space-y-2">
                        <Label>Access Token (Private App)</Label>
                        <Input type="password" value={configData.accessToken || ''} onChange={e => setConfigData({ ...configData, accessToken: e.target.value })} placeholder="pat-na1-..." />
                    </div>
                );
            case 'SMTP':
                return (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>SMTP Host</Label>
                                <Input value={configData.host || ''} onChange={e => setConfigData({ ...configData, host: e.target.value })} placeholder="smtp.gmail.com" />
                            </div>
                            <div className="space-y-2">
                                <Label>Porta</Label>
                                <Input value={configData.port || ''} onChange={e => setConfigData({ ...configData, port: e.target.value })} placeholder="587" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Email Mittente (From)</Label>
                            <Input value={configData.fromEmail || ''} onChange={e => setConfigData({ ...configData, fromEmail: e.target.value })} placeholder="notifiche@azienda.com" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Utente SMTP</Label>
                                <Input value={configData.user || ''} onChange={e => setConfigData({ ...configData, user: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Password SMTP</Label>
                                <Input type="password" value={configData.password || ''} onChange={e => setConfigData({ ...configData, password: e.target.value })} />
                            </div>
                        </div>
                    </>
                );
            case 'SHAREPOINT':
                return (
                    <>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tenant ID *</Label>
                                <Input value={configData.tenantId || ''} onChange={e => setConfigData({ ...configData, tenantId: e.target.value })} placeholder="contoso.onmicrosoft.com o GUID" />
                                <p className="text-xs text-muted-foreground">ID directory Azure AD</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Client ID *</Label>
                                <Input value={configData.clientId || ''} onChange={e => setConfigData({ ...configData, clientId: e.target.value })} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                                <p className="text-xs text-muted-foreground">ID applicazione Azure</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>URL Sito SharePoint *</Label>
                            <Input value={configData.siteUrl || ''} onChange={e => setConfigData({ ...configData, siteUrl: e.target.value })} placeholder="https://azienda.sharepoint.com/sites/NomeSito" />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Percorso File Excel *</Label>
                                <Button type="button" variant="outline" size="sm" onClick={openFileBrowser} className="h-7 text-xs">
                                    <FolderOpen className="h-3 w-3 mr-1" />
                                    Sfoglia
                                </Button>
                            </div>
                            <Input value={configData.filePath || ''} onChange={e => setConfigData({ ...configData, filePath: e.target.value })} placeholder="Usa 'Sfoglia' o inserisci il percorso" />
                        </div>
                        <div className="space-y-2">
                            <Label>Nome Foglio</Label>
                            <Input value={configData.sheetName || ''} onChange={e => setConfigData({ ...configData, sheetName: e.target.value })} placeholder="Compilato automaticamente da 'Sfoglia'" />
                        </div>
                        <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200 text-xs">
                            <p className="font-medium mb-1">📋 Requisiti Azure AD App:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                <li>Permessi: <code>Files.Read.All</code>, <code>Sites.Read.All</code>, <code>User.Read</code></li>
                                <li>Abilita "Allow public client flows" nelle impostazioni</li>
                            </ul>
                        </div>
                    </>
                );
            case 'WHATSAPP':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>Phone Number ID *</Label>
                            <Input value={configData.phoneNumberId || ''} onChange={e => setConfigData({ ...configData, phoneNumberId: e.target.value })} placeholder="123456789012345" />
                            <p className="text-xs text-muted-foreground">Da Meta for Developers → WhatsApp → API Setup</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Access Token (Permanente) *</Label>
                            <Input type="password" value={configData.accessToken || ''} onChange={e => setConfigData({ ...configData, accessToken: e.target.value })} placeholder="EAAxxxxxxx..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Verify Token *</Label>
                            <Input value={configData.verifyToken || ''} onChange={e => setConfigData({ ...configData, verifyToken: e.target.value })} placeholder="fridai_secret_xyz" />
                            <p className="text-xs text-muted-foreground">Stringa segreta che scegli tu per verificare il webhook su Meta</p>
                        </div>
                        <div className="space-y-2">
                            <Label>HubSpot Connector ID (opzionale)</Label>
                            <Input value={configData.hubspotConnectorId || ''} onChange={e => setConfigData({ ...configData, hubspotConnectorId: e.target.value })} placeholder="ID del connettore HubSpot per creare i lead" />
                        </div>
                        <div className="p-3 rounded-md bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 text-xs space-y-3">
                            <p className="font-bold text-sm">📋 Guida Setup WhatsApp Business</p>

                            {/* ── SEZIONE A: INVIO ── */}
                            <div className="p-2.5 rounded-md bg-green-100/50 dark:bg-green-900/50 space-y-2">
                                <p className="font-bold text-green-900 dark:text-green-100 flex items-center gap-1.5">📤 Setup Invio Messaggi</p>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">1. Crea App su Meta for Developers</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li><a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">developers.facebook.com</a> → Le mie app → <strong>Crea app</strong></li>
                                        <li>Tipo: <strong>Business</strong> → seleziona (o crea) il tuo Business Portfolio</li>
                                        <li>Nella dashboard dell&apos;app, clicca <strong>Aggiungi prodotto</strong> → <strong>WhatsApp</strong></li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">2. Trova Phone Number ID</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>App → WhatsApp → <strong>Configurazione API</strong> (API Setup)</li>
                                        <li>Sotto &quot;Da&quot; c&apos;è l&apos;<strong>ID del numero di telefono</strong> → copialo nel campo qui sopra</li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">3. Aggiungi numeri alla whitelist (modalità sviluppo)</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>Sempre in Configurazione API, sotto &quot;A&quot; → <strong>Gestisci elenco numeri di telefono</strong></li>
                                        <li>Aggiungi il numero destinatario (es. +39 333...) → riceverai un <strong>codice di verifica</strong> su WhatsApp</li>
                                        <li>Inserisci il codice per confermare — ora puoi inviare a quel numero</li>
                                        <li className="text-amber-700 dark:text-amber-400">In sviluppo puoi aggiungere max 5 numeri. In produzione (app Live) nessun limite</li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">4. Crea il Token di accesso (⚠️ IMPORTANTE)</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li className="text-red-700 dark:text-red-400 font-medium">⚠️ NON usare il token temporaneo dalla pagina API Setup — scade ogni 24h!</li>
                                        <li><strong>Crea un token permanente (consigliato):</strong></li>
                                        <li className="ml-3">1. Vai su <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="underline font-medium">business.facebook.com → Impostazioni → Utenti di sistema</a></li>
                                        <li className="ml-3">2. Clicca <strong>Aggiungi</strong> → nome a piacere → ruolo <strong>Admin</strong> → Crea</li>
                                        <li className="ml-3">3. Clicca sul System User appena creato → <strong>Assegna risorse</strong> → tipo <strong>App</strong> → seleziona la tua App WhatsApp → attiva <strong>tutti i permessi</strong> → Salva</li>
                                        <li className="ml-3">4. Torna al System User → clicca <strong>Genera token</strong></li>
                                        <li className="ml-3">5. Seleziona la tua <strong>App</strong> → Scadenza: <strong>Mai</strong></li>
                                        <li className="ml-3">6. Permessi da selezionare: <code className="bg-green-100 dark:bg-green-900 px-1 rounded">whatsapp_business_messaging</code> e <code className="bg-green-100 dark:bg-green-900 px-1 rounded">whatsapp_business_management</code></li>
                                        <li className="ml-3">7. Clicca <strong>Genera token</strong> → copia il token (inizia con <code className="bg-green-100 dark:bg-green-900 px-1 rounded">EAA...</code>)</li>
                                        <li className="ml-3 text-green-700 dark:text-green-300 font-bold">✅ Questo token NON scade mai!</li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">5. Compila e testa</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>Incolla <strong>Phone Number ID</strong> e <strong>Access Token</strong> nei campi qui sopra → clicca <strong>Aggiorna</strong></li>
                                        <li>Usa il bottone <strong>Invia Template</strong> qui sotto per mandare il primo messaggio (hello_world)</li>
                                        <li className="text-amber-700 dark:text-amber-400">Il testo libero NON viene consegnato se non invii prima un template!</li>
                                        <li>Dopo che il destinatario risponde al template, si apre una <strong>finestra di 24h</strong> per inviare testo libero</li>
                                    </ul>
                                </div>
                            </div>

                            {/* ── SEZIONE B: RICEZIONE ── */}
                            <div className="p-2.5 rounded-md bg-blue-50/80 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 space-y-2">
                                <p className="font-bold flex items-center gap-1.5">📥 Setup Ricezione Messaggi (Webhook)</p>
                                <p className="text-[11px] opacity-80">Per ricevere messaggi in FridAI quando qualcuno scrive al tuo numero WhatsApp, devi configurare un webhook.</p>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">1. Esponi FridAI su internet</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li><strong>In produzione:</strong> usa il tuo dominio HTTPS (es. <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://tuodominio.com</code>)</li>
                                        <li><strong>In sviluppo (localhost):</strong> usa <a href="https://ngrok.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">ngrok</a> per creare un tunnel:</li>
                                        <li className="ml-3">Installa ngrok → nel terminale esegui: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ngrok http 9002</code></li>
                                        <li className="ml-3">Copia l&apos;URL HTTPS che ngrok genera (es. <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://abc123.ngrok-free.app</code>)</li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">2. Configura il Webhook su Meta</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>App → WhatsApp → <strong>Configurazione</strong> (nel menu sinistro)</li>
                                        <li>Sezione Webhook → clicca <strong>Modifica</strong></li>
                                        <li><strong>URL Callback:</strong> <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://tuodominio.com/api/whatsapp/webhook</code></li>
                                        <li>(o in dev: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://abc123.ngrok-free.app/api/whatsapp/webhook</code>)</li>
                                        <li><strong>Verify Token:</strong> uguale al campo &quot;Verify Token&quot; qui sopra</li>
                                        <li>Clicca <strong>Verifica e salva</strong></li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">3. Iscriviti agli eventi</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>Nella tabella dei campi webhook, attiva il toggle su <strong>messages</strong></li>
                                        <li>Questo abilita la ricezione di testo, immagini e <strong>note vocali</strong></li>
                                    </ul>
                                </div>

                                <div className="space-y-0.5">
                                    <p className="font-semibold">4. Testa la ricezione</p>
                                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                                        <li>Invia un messaggio WhatsApp al numero dell&apos;app (es. +1 555 171 5639)</li>
                                        <li>FridAI salverà automaticamente il messaggio nel log</li>
                                        <li>Le <strong>note vocali</strong> vengono trascritte in testo (serve API key Groq nella sezione Provider)</li>
                                        <li>Clicca <strong>Carica log</strong> qui sotto per vedere la conversazione</li>
                                    </ul>
                                </div>
                            </div>

                            {/* ── RIEPILOGO ── */}
                            <div className="p-2 rounded bg-green-100 dark:bg-green-900">
                                <p className="font-semibold">Come funziona WhatsApp Business API:</p>
                                <ul className="list-disc list-inside space-y-0.5 ml-1 mt-1">
                                    <li>Per <strong>iniziare</strong> una conversazione devi inviare un <strong>template</strong> (es. hello_world)</li>
                                    <li>Quando il destinatario <strong>risponde</strong>, si apre una finestra di <strong>24 ore</strong> per inviare testo libero</li>
                                    <li>In <strong>modalità sviluppo</strong>: puoi inviare solo a numeri nella whitelist (max 5)</li>
                                    <li>In <strong>produzione</strong> (app Live): puoi inviare a chiunque, servono verifiche Business</li>
                                    <li>Le <strong>note vocali</strong> vengono trascritte automaticamente (serve API key Groq nella sezione Provider)</li>
                                </ul>
                            </div>
                        </div>

                        {/* ─── Invia messaggio di prova ─── */}
                        {editingId && (
                            <div className="border rounded-md p-3 space-y-3 mt-2">
                                <p className="text-sm font-medium flex items-center gap-2"><Send className="h-4 w-4" /> Invia messaggio di prova</p>
                                <div className="space-y-2">
                                    <Label>Numero destinatario</Label>
                                    <Input value={waTestPhone} onChange={e => setWaTestPhone(e.target.value)} placeholder="+39 333 1234567" />
                                    <p className="text-xs text-muted-foreground">Formato internazionale (es. +39...)</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Messaggio (per testo libero)</Label>
                                    <Input value={waTestMsg} onChange={e => setWaTestMsg(e.target.value)} placeholder="Testo del messaggio..." />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="default"
                                        size="sm"
                                        disabled={isSendingWaTest || !waTestPhone.trim()}
                                        onClick={async () => {
                                            setIsSendingWaTest(true);
                                            try {
                                                const res = await sendWhatsAppTestMessageAction(editingId!, waTestPhone, '', true);
                                                toast({
                                                    title: res.success ? 'Template inviato!' : 'Errore',
                                                    description: res.success ? res.message : res.error,
                                                    variant: res.success ? 'default' : 'destructive',
                                                });
                                            } catch (e: any) {
                                                toast({ title: 'Errore', description: e.message, variant: 'destructive' });
                                            } finally {
                                                setIsSendingWaTest(false);
                                            }
                                        }}
                                    >
                                        {isSendingWaTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                                        Invia Template
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isSendingWaTest || !waTestPhone.trim()}
                                        onClick={async () => {
                                            setIsSendingWaTest(true);
                                            try {
                                                const res = await sendWhatsAppTestMessageAction(editingId!, waTestPhone, waTestMsg, false);
                                                toast({
                                                    title: res.success ? 'Messaggio inviato!' : 'Errore',
                                                    description: res.success ? res.message : res.error,
                                                    variant: res.success ? 'default' : 'destructive',
                                                });
                                            } catch (e: any) {
                                                toast({ title: 'Errore', description: e.message, variant: 'destructive' });
                                            } finally {
                                                setIsSendingWaTest(false);
                                            }
                                        }}
                                    >
                                        {isSendingWaTest ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                                        Invia Testo
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">💡 In modalità sviluppo usa <strong>Invia Template</strong> (hello_world) per il primo messaggio. Il testo libero funziona solo dopo che il destinatario ha risposto (finestra 24h).</p>
                            </div>
                        )}

                        {/* ─── Rubrica Contatti WhatsApp ─── */}
                        {editingId && (
                            <div className="border rounded-md p-3 space-y-3 mt-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Rubrica Contatti</p>
                                    <Button type="button" variant="outline" size="sm" onClick={() => setShowAddContact(!showAddContact)}>
                                        {showAddContact ? <X className="h-4 w-4 mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
                                        {showAddContact ? 'Chiudi' : 'Aggiungi'}
                                    </Button>
                                </div>

                                {showAddContact && (
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-xs">Nome</Label>
                                            <Input value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="Mario Rossi" className="h-8 text-sm" />
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <Label className="text-xs">Numero</Label>
                                            <Input value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="+39 333 1234567" className="h-8 text-sm" />
                                        </div>
                                        <Button type="button" size="sm" className="h-8" onClick={handleSaveContact} disabled={!newContactName.trim() || !newContactPhone.trim()}>
                                            Salva
                                        </Button>
                                    </div>
                                )}

                                {waContacts.length > 0 && (
                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {waContacts.map((c: any) => (
                                            <div
                                                key={c.id}
                                                className={`flex items-center justify-between text-xs border rounded px-2 py-1.5 cursor-pointer transition-colors hover:bg-accent ${waFilterPhone === c.phoneNumber ? 'bg-accent border-primary' : ''}`}
                                                onClick={() => loadLogsForPhone(c.phoneNumber)}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-3 w-3 text-muted-foreground" />
                                                    <span className="font-medium">{c.name}</span>
                                                    <span className="text-muted-foreground font-mono">{c.phoneNumber}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button type="button" variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={(e) => { e.stopPropagation(); setWaTestPhone(c.phoneNumber); }}>
                                                        <Send className="h-3 w-3" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={(e) => { e.stopPropagation(); handleDeleteContact(c.phoneNumber); }}>
                                                        <Trash2 className="h-3 w-3 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {waContacts.length === 0 && !isLoadingContacts && (
                                    <p className="text-xs text-muted-foreground text-center py-1">Nessun contatto salvato. I numeri dai log verranno mostrati solo come numero.</p>
                                )}
                            </div>
                        )}

                        {/* ─── Log messaggi ─── */}
                        {editingId && (
                            <div className="border rounded-md p-3 space-y-3 mt-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium flex items-center gap-2"><ScrollText className="h-4 w-4" /> Log messaggi</p>
                                        {waFilterPhone && (
                                            <span className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                {contactNameMap[waFilterPhone] || waFilterPhone}
                                                <button onClick={() => { setWaFilterPhone(null); setExpandedWaSession(null); }} className="hover:text-red-500">
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={isLoadingWaSessions}
                                        onClick={() => loadLogsForPhone()}
                                    >
                                        {isLoadingWaSessions ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ScrollText className="h-4 w-4 mr-2" />}
                                        Carica log
                                    </Button>
                                </div>

                                {filteredSessions.length > 0 && (
                                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                        {filteredSessions.map((s: any) => (
                                            <div key={s.id} className="border rounded p-2 text-xs">
                                                <div
                                                    className="flex items-center justify-between cursor-pointer"
                                                    onClick={() => setExpandedWaSession(expandedWaSession === s.id ? null : s.id)}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Phone className="h-3 w-3" />
                                                        {(s.contactName || contactNameMap[s.phoneNumber]) ? (
                                                            <>
                                                                <span className="font-medium">{s.contactName || contactNameMap[s.phoneNumber]}</span>
                                                                <span className="text-muted-foreground font-mono text-[10px]">{s.phoneNumber}</span>
                                                            </>
                                                        ) : (
                                                            <span className="font-mono">{s.phoneNumber}</span>
                                                        )}
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${s.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'}`}>
                                                            {s.status === 'completed' ? 'Completato' : 'In corso'}
                                                        </span>
                                                        {!s.contactName && !contactNameMap[s.phoneNumber] && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-5 px-1 text-[10px] text-blue-600"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setNewContactPhone(s.phoneNumber);
                                                                    setShowAddContact(true);
                                                                }}
                                                            >
                                                                <UserPlus className="h-3 w-3 mr-0.5" /> Salva
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <span>{new Date(s.updatedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                                        {expandedWaSession === s.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                    </div>
                                                </div>
                                                {expandedWaSession === s.id && (
                                                    <div className="mt-2 space-y-1 border-t pt-2">
                                                        {(Array.isArray(s.messages) ? s.messages : []).map((m: any, i: number) => (
                                                            <div key={i} className={`flex gap-2 ${m.role === 'user' ? '' : 'pl-4'}`}>
                                                                <span className={`font-semibold ${m.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                                                                    {m.role === 'user' ? 'Utente' : 'Bot'}:
                                                                </span>
                                                                <span className="flex-1">{m.content}</span>
                                                                {m.timestamp && <span className="text-muted-foreground text-[10px] shrink-0">{new Date(m.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>}
                                                            </div>
                                                        ))}
                                                        {s.collectedData && Object.keys(s.collectedData).length > 0 && (
                                                            <div className="mt-1 pt-1 border-t text-muted-foreground">
                                                                <span className="font-medium">Dati raccolti: </span>
                                                                {Object.entries(s.collectedData).filter(([,v]) => v).map(([k,v]) => `${k}=${v}`).join(', ')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {filteredSessions.length === 0 && waSessions.length > 0 && waFilterPhone && (
                                    <p className="text-xs text-muted-foreground text-center py-2">Nessun messaggio trovato per questo contatto.</p>
                                )}

                                {waSessions.length === 0 && !isLoadingWaSessions && (
                                    <p className="text-xs text-muted-foreground text-center py-2">Nessuna sessione trovata. Clicca &quot;Carica log&quot; per aggiornare.</p>
                                )}
                            </div>
                        )}
                    </>
                );
            case 'LEMLIST':
                return (
                    <>
                        <div className="space-y-2">
                            <Label>API Key *</Label>
                            <Input type="password" value={configData.apiKey || ''} onChange={e => setConfigData({ ...configData, apiKey: e.target.value })} placeholder="lem_xxxxxxxxxxxx" />
                            <p className="text-xs text-muted-foreground">
                                Da <a href="https://app.lemlist.com/settings/integrations" target="_blank" rel="noopener noreferrer" className="underline font-medium">app.lemlist.com</a> → Settings → Integrations → API
                            </p>
                        </div>
                        <div className="p-3 rounded-md bg-purple-50 dark:bg-purple-950 text-purple-800 dark:text-purple-200 text-xs space-y-1.5">
                            <p className="font-bold text-sm">Lemlist API — cosa puoi fare da Python:</p>
                            <ul className="list-disc list-inside space-y-0.5">
                                <li>Listare campagne e statistiche</li>
                                <li>Aggiungere/rimuovere lead a campagne</li>
                                <li>Pause/resume lead e campagne</li>
                                <li>Esportare risultati campagne</li>
                                <li>Aggiornare variabili custom sui lead</li>
                            </ul>
                            <p className="mt-1.5 font-medium">Variabili Python disponibili:</p>
                            <code className="block bg-purple-100 dark:bg-purple-900 rounded p-1.5 text-[10px]">
                                LEMLIST_API_KEY, LEMLIST_BASE_URL
                            </code>
                        </div>
                    </>
                );
            default:
                return null;
        }
    }

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
                toast({ title: "Backup completato", description: "Impostazioni esportate." });
            } else {
                toast({ title: "Errore", description: result.error || "Impossibile esportare.", variant: "destructive" });
            }
        } catch (e: any) {
            toast({ title: "Errore", description: e.message, variant: "destructive" });
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
                toast({ title: "Importazione completata", description: result.message || "Impostazioni importate." });
                window.location.reload();
            } else {
                toast({ title: "Errore", description: result.error || "Impossibile importare.", variant: "destructive" });
            }
        } catch (e: any) {
            toast({ title: "Errore", description: e.message, variant: "destructive" });
        }
        setIsImporting(false);
        event.target.value = '';
    };

    return (
        <Card className="border-slate-200 dark:border-slate-800 flex flex-col h-full">
            <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between shrink-0">
                <div>
                    <CardTitle className="text-sm flex items-center gap-1.5">
                        <Database className="h-4 w-4 text-violet-500" />
                        Connettori
                    </CardTitle>
                    <CardDescription className="text-[11px]">
                        SQL, HubSpot, Email, SharePoint.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleExportSettings}
                        disabled={isExporting}
                    >
                        {isExporting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
                        Esporta
                    </Button>
                    <label>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={isImporting}
                            onClick={() => document.getElementById('import-settings-file')?.click()}
                            type="button"
                        >
                            {isImporting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Upload className="mr-1 h-3 w-3" />}
                            Importa
                        </Button>
                        <input
                            id="import-settings-file"
                            type="file"
                            accept=".json"
                            onChange={handleImportSettings}
                            className="hidden"
                        />
                    </label>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setTestStatus(null); }}>
                    <DialogTrigger asChild>
                        <Button onClick={handleOpenNew} size="sm" className="h-8 text-xs">
                            <Plus className="mr-1 h-3 w-3" />
                            Nuovo
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
                        <DialogHeader className="flex-shrink-0">
                            <DialogTitle>{editingId ? 'Modifica Connettore' : 'Aggiungi Connettore'}</DialogTitle>
                            <DialogDescription>
                                {editingId ? 'Aggiorna i dettagli della connessione.' : 'Configura una nuova fonte dati o servizio esterno.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
                            <div className="space-y-2">
                                <Label>Nome Identificativo</Label>
                                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Es. DB Produzione" />
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select value={newType} onValueChange={(v) => {
                                    setNewType(v);
                                    setTestStatus(null);
                                    // Apply default credentials when SHAREPOINT is selected
                                    if (v === 'SHAREPOINT' && !editingId) {
                                        setConfigData((prev: any) => ({
                                            ...prev,
                                            tenantId: prev.tenantId || DEFAULT_TENANT_ID,
                                            clientId: prev.clientId || DEFAULT_CLIENT_ID
                                        }));
                                    }
                                }}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CONNECTOR_TYPES.map(t => (
                                            <SelectItem key={t.value} value={t.value}>
                                                <div className="flex items-center gap-2">
                                                    <t.icon className="h-4 w-4" />
                                                    {t.label}
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="p-4 border rounded-md bg-slate-50 dark:bg-slate-900 space-y-4">
                                {renderConfigFields()}
                            </div>

                            {testStatus && (
                                <div className={`p-3 rounded-md flex items-center gap-2 text-sm ${testStatus.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                                    {testStatus.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                    <span>{testStatus.message}</span>
                                </div>
                            )}

                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => handleTest()} disabled={isTestingDialog} className="flex-1">
                                    {isTestingDialog ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wifi className="mr-2 h-4 w-4" />}
                                    Test Connessione
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {editingId ? 'Aggiorna' : 'Salva Connettore'}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Device Code Authentication Dialog */}
                <Dialog open={deviceCodeDialog} onOpenChange={setDeviceCodeDialog}>
                    <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FileSpreadsheet className="h-5 w-5 text-violet-500" />
                                Autenticazione Microsoft
                            </DialogTitle>
                            <DialogDescription>
                                Completa l'autenticazione per accedere a SharePoint
                            </DialogDescription>
                        </DialogHeader>
                        {deviceCode && (
                            <div className="space-y-4 py-4">
                                <div className="p-4 bg-violet-50 dark:bg-violet-950 rounded-lg text-center space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        Vai su questo link e inserisci il codice:
                                    </p>
                                    <a
                                        href={deviceCode.verificationUri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-violet-600 hover:underline font-medium flex items-center justify-center gap-2"
                                    >
                                        {deviceCode.verificationUri}
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                    <div className="flex items-center justify-center gap-2">
                                        <code className="text-2xl font-mono font-bold tracking-widest bg-white dark:bg-zinc-900 px-4 py-2 rounded border">
                                            {deviceCode.userCode}
                                        </code>
                                        <Button variant="outline" size="icon" onClick={() => copyToClipboard(deviceCode.userCode)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {isPolling && (
                                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        In attesa del completamento del login...
                                    </div>
                                )}

                                <p className="text-xs text-muted-foreground text-center">
                                    {deviceCode.message}
                                </p>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* File Browser Dialog */}
                <Dialog open={fileBrowserOpen} onOpenChange={setFileBrowserOpen}>
                    <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-hidden flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <FolderOpen className="h-5 w-5 text-violet-500" />
                                Seleziona File Excel
                            </DialogTitle>
                            <DialogDescription>
                                {browserStep === 'drives' && 'Seleziona una libreria documenti'}
                                {browserStep === 'files' && (
                                    <span className="flex items-center gap-1">
                                        <button onClick={navigateBack} className="hover:underline text-violet-600">{currentDriveName}</button>
                                        {currentPath.map((p, i) => (
                                            <span key={p.id} className="flex items-center gap-1">
                                                <ChevronRight className="h-3 w-3" />
                                                {p.name}
                                            </span>
                                        ))}
                                    </span>
                                )}
                                {browserStep === 'sheets' && `Seleziona un foglio in: ${selectedFile?.name}`}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-md">
                            {browserLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <>
                                    {/* Drives List */}
                                    {browserStep === 'drives' && drives.length > 0 && (
                                        <div className="divide-y">
                                            {drives.map((drive: any) => (
                                                <button
                                                    key={drive.id}
                                                    onClick={() => selectDrive(drive)}
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 text-left transition-colors"
                                                >
                                                    <Database className="h-5 w-5 text-violet-500 flex-shrink-0" />
                                                    <span className="font-medium">{drive.name}</span>
                                                    <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Files/Folders List */}
                                    {browserStep === 'files' && (
                                        <div className="divide-y">
                                            {currentPath.length > 0 || browserStep === 'files' ? (
                                                <button
                                                    onClick={navigateBack}
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 text-left transition-colors text-muted-foreground"
                                                >
                                                    <ArrowLeft className="h-5 w-5 flex-shrink-0" />
                                                    <span>Indietro</span>
                                                </button>
                                            ) : null}

                                            {files.length === 0 ? (
                                                <div className="p-6 text-center text-muted-foreground">
                                                    Nessun file o cartella
                                                </div>
                                            ) : (
                                                files.map((item: any) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => item.isFolder ? navigateToFolder(item) : (item.isExcel ? selectExcelFile(item) : null)}
                                                        disabled={!item.isFolder && !item.isExcel}
                                                        className={`w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 text-left transition-colors ${!item.isFolder && !item.isExcel ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        {item.isFolder ? (
                                                            <Folder className="h-5 w-5 text-amber-500 flex-shrink-0" />
                                                        ) : item.isExcel ? (
                                                            <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
                                                        ) : (
                                                            <FileSpreadsheet className="h-5 w-5 text-slate-400 flex-shrink-0" />
                                                        )}
                                                        <span className={item.isExcel ? 'font-medium text-green-700 dark:text-green-400' : ''}>
                                                            {item.name}
                                                        </span>
                                                        {item.isFolder && <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}

                                    {/* Sheets List */}
                                    {browserStep === 'sheets' && (
                                        <div className="divide-y">
                                            <button
                                                onClick={() => setBrowserStep('files')}
                                                className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900 text-left transition-colors text-muted-foreground"
                                            >
                                                <ArrowLeft className="h-5 w-5 flex-shrink-0" />
                                                <span>Torna ai file</span>
                                            </button>

                                            {sheets.map((sheet: any) => (
                                                <button
                                                    key={sheet.id}
                                                    onClick={() => selectSheet(sheet)}
                                                    className="w-full flex items-center gap-3 p-3 hover:bg-green-50 dark:hover:bg-green-950 text-left transition-colors"
                                                >
                                                    <FileSpreadsheet className="h-5 w-5 text-green-600 flex-shrink-0" />
                                                    <span className="font-medium">{sheet.name}</span>
                                                    <span className="ml-auto text-xs text-muted-foreground">Foglio {sheet.position + 1}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
                </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex justify-center p-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : !connectors || connectors.length === 0 ? (
                    <div className="text-center p-4 border-2 border-dashed rounded-lg">
                        <p className="text-xs text-muted-foreground">Nessun connettore configurato.</p>
                    </div>
                ) : (
                    <div className="grid gap-2 grid-cols-1">
                        {connectors?.map(c => {
                            const TypeIcon = CONNECTOR_TYPES.find(t => t.value === c.type)?.icon || Database;
                            const status = testResults[c.id];
                            const isLoadingTest = status === 'loading';

                            return (
                                <div key={c.id} className="group flex flex-col w-full border rounded-lg bg-card dark:bg-zinc-900/50 overflow-hidden hover:shadow-sm transition-all">
                                    <div className="flex items-center gap-2.5 p-2.5">
                                        <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400">
                                            <TypeIcon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <p className="font-medium text-xs truncate">{c.name}</p>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <div className={`flex-shrink-0 h-2.5 w-2.5 rounded-full transition-all duration-300 ring-2 ring-background ${status === 'success' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' :
                                                                status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' :
                                                                    status === 'loading' ? 'bg-yellow-400 animate-pulse' :
                                                                        'bg-slate-300 dark:bg-slate-700'
                                                                }`} />
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{status === 'success' ? 'Online' : status === 'error' ? 'Errore' : status === 'loading' ? 'Test in corso...' : 'Da testare'}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground truncate">{c.type}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-0.5 px-2 py-1 bg-slate-50/80 dark:bg-black/20 border-t border-slate-100 dark:border-slate-800">
                                        {c.type === 'SQL' && (
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-muted-foreground hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/20"
                                                            onClick={() => { setSelectedMapConnector(c); setMapDialogOpen(true); }}
                                                        >
                                                            <Map className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Mappa DB</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        )}
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground hover:text-violet-600 hover:bg-violet-100 dark:hover:bg-violet-900/20"
                                                        onClick={() => handleTest(c.type, c.config, c.id)}
                                                        disabled={isLoadingTest}
                                                    >
                                                        {isLoadingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Test Connessione</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => handleEdit(c)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Modifica</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>

                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => handleDelete(c.id, e)}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Elimina</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>

            {/* Database Map Dialog */}
            {selectedMapConnector && (
                <DatabaseMapDialog
                    connectorId={selectedMapConnector.id}
                    connectorName={selectedMapConnector.name}
                    open={mapDialogOpen}
                    onOpenChange={(open) => { setMapDialogOpen(open); if (!open) setSelectedMapConnector(null); }}
                />
            )}
        </Card>
    );
}
