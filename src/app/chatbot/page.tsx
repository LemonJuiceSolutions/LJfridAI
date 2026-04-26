'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, BrainCircuit, Loader2, Send, User, Image as ImageIcon, Video, Link as LinkIcon, Zap, GitBranch, ChevronsUpDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { diagnoseProblemAction, searchTreesAction, getTreeAction, fetchOpenRouterModelsAction } from '../actions';
import InteractiveGuide from '@/components/rule-sage/interactive-guide';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import Image from 'next/image';
import type { MediaItem, LinkItem, TriggerItem, DiagnosticNode } from '@/lib/types';
import { useOpenRouterSettings } from '@/hooks/use-openrouter';
import { getAiProviderAction, saveAiProviderAction } from '@/actions/ai-settings';
import { getOpenRouterAgentModelAction, saveOpenRouterAgentModelAction } from '@/actions/openrouter';

const CLAUDE_CLI_MODELS = [
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    { id: 'sonnet', name: 'sonnet (latest)' },
    { id: 'opus', name: 'opus (latest)' },
    { id: 'haiku', name: 'haiku (latest)' },
];


type Message = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    options?: string[];
    isFinalDecision?: boolean;
    treeId?: string;
    treeDisplayName?: string;
    media?: MediaItem[];
    links?: LinkItem[];
    triggers?: TriggerItem[];
    nodes?: DiagnosticNode[];
    nodeIds?: string[]; // Added nodeIds to Message type
    searchResults?: { name: string; sourceId: string; reason: string; summary: string }[];
};

const initialAssistantMessage: Message = {
    id: 'initial-message',
    role: 'assistant',
    text: "Ciao! Sono il tuo assistente diagnostico. Descrivi il problema che stai riscontrando e ti aiuterò a trovare la guida giusta."
}

export default function ChatbotPage() {
    const { toast } = useToast();
    const [messages, setMessages] = useState<Message[]>([initialAssistantMessage]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialProblem, setInitialProblem] = useState('');
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const [previewingMedia, setPreviewingMedia] = useState<MediaItem | null>(null);
    const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null);
    const [selectedTreeJson, setSelectedTreeJson] = useState<string | null>(null);
    const { apiKey: dbApiKey, model: dbModel } = useOpenRouterSettings();
    const [aiProvider, setAiProvider] = useState<'openrouter' | 'claude-cli'>('openrouter');
    const [claudeCliModel, setClaudeCliModel] = useState('claude-sonnet-4-6');
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [availableModels, setAvailableModels] = useState<{ id: string; name: string; pricing?: { prompt: string } }[]>([]);
    const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
    const [isSavingModel, setIsSavingModel] = useState(false);

    const loadProviderSettings = useCallback(() => {
        const validCliIds = CLAUDE_CLI_MODELS.map(m => m.id);
        getAiProviderAction().then(res => {
            if (res.error) return;
            setAiProvider(res.provider);
            if (res.provider === 'claude-cli') {
                const m = res.claudeCliModel || 'claude-sonnet-4-6';
                setClaudeCliModel(m);
                setModel(m);
                setAvailableModels(CLAUDE_CLI_MODELS);
            } else {
                fetchOpenRouterModelsAction().then(result => {
                    if (result.data) setAvailableModels(result.data);
                });
                getOpenRouterAgentModelAction().then(result => {
                    if (result.model && !validCliIds.includes(result.model)) {
                        setModel(result.model);
                    } else {
                        setModel(dbModel || 'google/gemini-2.0-flash-001');
                    }
                });
            }
        });
    }, [dbModel]);

    useEffect(() => {
        loadProviderSettings();
        const onSync = () => loadProviderSettings();
        window.addEventListener('focus', onSync);
        window.addEventListener('ai-provider-changed', onSync);
        return () => {
            window.removeEventListener('focus', onSync);
            window.removeEventListener('ai-provider-changed', onSync);
        };
    }, [loadProviderSettings]);

    const handleModelChange = async (newModel: string) => {
        setModel(newModel);
        setModelSelectorOpen(false);
        setIsSavingModel(true);
        try {
            if (aiProvider === 'claude-cli') {
                setClaudeCliModel(newModel);
                await saveAiProviderAction('claude-cli', newModel);
            } else {
                await saveOpenRouterAgentModelAction(newModel);
            }
        } catch { /* ignore */ }
        setIsSavingModel(false);
    };

    const handleProviderToggle = async () => {
        const newProvider: 'openrouter' | 'claude-cli' = aiProvider === 'openrouter' ? 'claude-cli' : 'openrouter';
        setAiProvider(newProvider);
        if (newProvider === 'claude-cli') {
            setModel('claude-sonnet-4-6');
            setClaudeCliModel('claude-sonnet-4-6');
            setAvailableModels(CLAUDE_CLI_MODELS);
            await saveAiProviderAction('claude-cli', 'claude-sonnet-4-6');
        } else {
            setModel(dbModel || 'google/gemini-2.0-flash-001');
            await saveAiProviderAction('openrouter');
            fetchOpenRouterModelsAction().then(result => {
                if (result.data) setAvailableModels(result.data);
            });
        }
    };

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages]);

    const renderAttachments = (message: Message) => {
        const allAttachments = [
            ...(message.media || []).map(item => ({ type: 'media' as const, item })),
            ...(message.links || []).map(item => ({ type: 'link' as const, item })),
            ...(message.triggers || []).map(item => ({ type: 'trigger' as const, item }))
        ];

        if (allAttachments.length === 0) return null;

        return (
            <div className="mt-2 space-y-1">
                {allAttachments.map((attachment, index) => {
                    let icon, name, actionWrapper;
                    const { item, type } = attachment;

                    switch (type) {
                        case 'media':
                            icon = item.type === 'image'
                                ? <ImageIcon className="h-4 w-4 text-purple-600" />
                                : <Video className="h-4 w-4 text-purple-600" />;
                            name = item.name || item.originalFilename || 'Media';
                            actionWrapper = (children: React.ReactNode) => (
                                <div onClick={() => setPreviewingMedia(item)} className="cursor-pointer flex items-center gap-2 w-full">
                                    {children}
                                </div>
                            );
                            break;
                        case 'link':
                            icon = <LinkIcon className="h-4 w-4 text-purple-600" />;
                            name = item.name || item.url;
                            actionWrapper = (children: React.ReactNode) => (
                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 w-full">
                                    {children}
                                </a>
                            );
                            break;
                        case 'trigger':
                            icon = <Zap className="h-4 w-4 text-purple-600" />;
                            name = item.name;
                            actionWrapper = (children: React.ReactNode) => <div className="flex items-center gap-2 w-full">{children}</div>;
                            break;
                    }

                    return (
                        <div key={index} className="flex items-center p-1.5 rounded-md bg-background/50 hover:bg-background/80 transition-colors border text-xs">
                            {actionWrapper(
                                <>
                                    {icon}
                                    <span className="truncate flex-1">{name}</span>
                                    {type === 'media' && (
                                        <div className="w-4 h-4 rounded bg-muted flex-shrink-0 overflow-hidden relative flex items-center justify-center">
                                            {item.type === 'image' ? (
                                                <Image src={item.url} alt={name} fill className="object-cover" sizes="16px" />
                                            ) : (
                                                <Video className="h-3 w-3 text-purple-600" />
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        );
    };

    const handleSubmit = async (value: string, isOptionClick = false) => {
        const userMessageText = value;

        if (!userMessageText.trim()) return;

        const newUserMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: userMessageText,
        };

        // Use a functional update to ensure we have the latest state
        setMessages(prevMessages => [...prevMessages, newUserMessage]);
        const currentMessages = [...messages, newUserMessage];

        setInput('');
        setIsLoading(true);

        try {
            const history = currentMessages
                .map(m => `${m.role}: ${m.text}`)
                .join('\n');

            // If it's not an option click, it's a new problem description
            const problem = !isOptionClick ? userMessageText : initialProblem;
            if (!initialProblem) {
                setInitialProblem(problem);
            }

            const openRouterConfig = (aiProvider === 'openrouter' && dbApiKey) ? { apiKey: dbApiKey, model: model || dbModel || 'google/gemini-2.0-flash-001' } : undefined;
            const claudeCliConfig = (aiProvider === 'claude-cli' || !openRouterConfig) ? { model: aiProvider === 'claude-cli' ? model : claudeCliModel } : undefined;

            // CHECK: Is this the initial search phase?
            // If we don't have a current tree active AND this is not an option click (meaning it's a new query)
            // AND we haven't already done a search that resulted in a selection...
            const activeTreeId = messages.reduceRight((acc: string | undefined, m) => acc || m.treeId, undefined);

            if (!activeTreeId && !isOptionClick) {
                // Perform Search
                try {
                    const searchResultJson = await searchTreesAction(problem, openRouterConfig, claudeCliConfig);
                    let searchResults = [];
                    try {
                        // Check if it's the "No results" string or JSON
                        if (searchResultJson.startsWith('Nessun risultato') || searchResultJson.startsWith('Errore')) {
                            // Fallthrough to normal diagnose
                        } else {
                            searchResults = JSON.parse(searchResultJson);
                        }
                    } catch (e) {
                        console.error("Error parsing search results", e);
                    }

                    if (searchResults && searchResults.length > 0) {
                        const searchMessage: Message = {
                            id: (Date.now() + 1).toString(),
                            role: 'assistant',
                            text: `Ho trovato ${searchResults.length} guide che potrebbero esserti utili. Seleziona quella più pertinente o continua a descrivere il problema.`,
                            searchResults: searchResults
                        };
                        setMessages(prev => [...prev, searchMessage]);
                        return; // Stop here, let user select
                    }
                } catch (e) {
                    console.error("Search failed, falling back to direct diagnose", e);
                }
            }

            // Get previous node ID from the last assistant message
            let previousNodeId;
            if (isOptionClick && messages.length > 0) {
                const lastAssistantMsg = messages.reduceRight((found, m) => found || (m.role === 'assistant' ? m : undefined), undefined as Message | undefined);
                if (lastAssistantMsg && lastAssistantMsg.nodeIds && lastAssistantMsg.nodeIds.length > 0) {
                    previousNodeId = lastAssistantMsg.nodeIds[0];
                }
            }

            const result = await diagnoseProblemAction({
                id: Date.now().toString(), // Dummy conversation ID
                userState: {}, // Default empty state
                userProblem: problem,
                currentAnswer: isOptionClick ? userMessageText : undefined,
                history,
                specificTreeId: activeTreeId, // Pass the active tree ID if any
                previousNodeId: previousNodeId
            }, openRouterConfig, claudeCliConfig);


            if (result.error || !result.data) {
                throw new Error(result.error || 'La diagnosi è fallita senza un errore specifico.');
            }

            const diagnosisData = result.data;

            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: diagnosisData.question,
                options: diagnosisData.isFinalDecision ? undefined : diagnosisData.options,
                isFinalDecision: diagnosisData.isFinalDecision,
                treeId: diagnosisData.isFinalDecision ? diagnosisData.treeName : undefined,
                treeDisplayName: diagnosisData.isFinalDecision ? currentMessages.find(m => m.text === diagnosisData.treeName)?.text || diagnosisData.treeName : undefined,
                media: diagnosisData.media,
                links: diagnosisData.links,
                triggers: diagnosisData.triggers,
                nodes: diagnosisData.nodes
            };

            setMessages(prev => [...prev, assistantMessage]);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
            toast({
                variant: 'destructive',
                title: 'Errore del Chatbot',
                description: errorMessage,
            });
            const assistantErrorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: `Mi dispiace, si è verificato un errore: ${errorMessage}`,
            };
            setMessages(prev => [...prev, assistantErrorMessage]);

        } finally {
            setIsLoading(false);
        }
    };

    const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        handleSubmit(input);
    }

    const handleOptionClick = (option: string) => {
        handleSubmit(option, true);
    }

    const handleTreeSelect = async (treeId: string, treeName: string) => {
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: `Seleziono la guida: ${treeName}`,
        };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        try {
            // Fetch the tree's full JSON
            const treeResult = await getTreeAction(treeId);
            if (treeResult.error || !treeResult.data) {
                throw new Error(treeResult.error || 'Impossibile caricare l\'albero.');
            }

            // Set selected tree state to trigger InteractiveGuide rendering
            setSelectedTreeId(treeId);
            setSelectedTreeJson(treeResult.data.jsonDecisionTree);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
            toast({
                variant: 'destructive',
                title: 'Errore del Chatbot',
                description: errorMessage,
            });
            const assistantErrorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: `Mi dispiace, si è verificato un errore: ${errorMessage}`,
            };
            setMessages(prev => [...prev, assistantErrorMessage]);
        } finally {
            setIsLoading(false);
        }
    }

    const handleResetGuide = () => {
        setSelectedTreeId(null);
        setSelectedTreeJson(null);
        setMessages([initialAssistantMessage]);
        setInput('');
        setInitialProblem('');
    }

    const isConversationOver = messages.length > 0 && messages[messages.length - 1].isFinalDecision;

    const currentTreeId = messages.reduceRight((acc: string | undefined, m) => acc || m.treeId, undefined);

    return (
        <div className="flex flex-col h-screen bg-background">
            <main className="flex-1 overflow-hidden">
                <div className="container mx-auto h-full p-4 pb-[82px] md:p-6 md:pb-[98px] flex flex-col">
                    <Card className="flex-1 min-h-0 flex flex-col">
                        <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <CardTitle>Chatbot Diagnostico</CardTitle>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={handleProviderToggle}
                                            className="px-1.5 py-0.5 rounded text-[10px] font-medium border hover:bg-muted transition-colors cursor-pointer"
                                            title="Cambia provider AI"
                                        >
                                            {aiProvider === 'claude-cli' ? '🤖 CLI' : '🌐 OR'}
                                        </button>
                                        <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen} modal={false}>
                                            <PopoverTrigger asChild>
                                                <button type="button" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer border rounded px-2 py-0.5">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                                    <span className="truncate max-w-[200px]">
                                                        {isSavingModel ? 'Salvando...' : (availableModels.find(m => m.id === model)?.name || model.split('/').pop() || model)}
                                                    </span>
                                                    <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
                                                </button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-[400px] p-0 z-[100]" align="start" sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()}>
                                                <Command>
                                                    <CommandInput placeholder="Cerca modello..." />
                                                    <CommandList className="max-h-[300px]">
                                                        <CommandEmpty>Nessun modello trovato.</CommandEmpty>
                                                        <CommandGroup heading={aiProvider === 'claude-cli' ? 'Modelli Claude' : 'Modelli OpenRouter'}>
                                                            {availableModels.map(m => (
                                                                <CommandItem
                                                                    key={m.id}
                                                                    value={`${m.id} ${m.name}`}
                                                                    onSelect={() => handleModelChange(m.id)}
                                                                    className="flex items-center justify-between text-xs"
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <Check className={cn('h-3 w-3 shrink-0', model === m.id ? 'opacity-100' : 'opacity-0')} />
                                                                        <span className="truncate">{m.name}</span>
                                                                    </div>
                                                                    {m.pricing && (
                                                                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                                                                            ${(parseFloat(m.pricing.prompt) * 1_000_000).toFixed(2)}/M
                                                                        </span>
                                                                    )}
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                {currentTreeId && (
                                    <Button variant="outline" size="icon" asChild title="Vai all'albero decisionale">
                                        <Link href={`/view/${currentTreeId}`}>
                                            <GitBranch className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                )}
                            </div>
                            <CardDescription>
                                Descrivi il tuo problema e ti aiuterò a trovare la guida giusta.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden p-0">
                            {selectedTreeId && selectedTreeJson ? (
                                <ScrollArea className="h-full" ref={scrollAreaRef}>
                                    <div className="p-6 space-y-6">
                                        {/* Show previous messages */}
                                        {messages.map((m) => (
                                            <div
                                                key={m.id}
                                                className={cn(
                                                    'flex items-start gap-4',
                                                    m.role === 'user' && 'flex-row-reverse'
                                                )}
                                            >
                                                {m.role === 'assistant' && (
                                                    <Avatar className='border'>
                                                        <AvatarFallback><Bot className='text-primary' /></AvatarFallback>
                                                    </Avatar>
                                                )}
                                                <div className={cn('flex flex-col gap-2 max-w-[85%]', m.role === 'user' && 'items-end')}>
                                                    <div className={cn(
                                                        'rounded-lg p-3 text-sm',
                                                        m.role === 'user'
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted'
                                                    )}>
                                                        <div className="whitespace-pre-wrap">{m.text}</div>
                                                    </div>
                                                </div>
                                                {m.role === 'user' && (
                                                    <Avatar className='border'>
                                                        <AvatarFallback><User /></AvatarFallback>
                                                    </Avatar>
                                                )}
                                            </div>
                                        ))}
                                        {/* Interactive Guide Container */}
                                        <div className="flex items-start gap-4">
                                            <Avatar className='border h-8 w-8'>
                                                <AvatarFallback><Bot className='text-primary h-4 w-4' /></AvatarFallback>
                                            </Avatar>
                                            <div className="max-w-[75%] text-sm [&_.text-lg]:text-sm [&_.text-xl]:text-base [&_.text-base]:text-sm [&_.py-3]:py-2 [&_.p-6]:p-3 [&_.p-4]:p-2 [&_.gap-4]:gap-2 [&_.space-y-6]:space-y-3 [&_.min-h-\[300px\]]:min-h-0">
                                                <InteractiveGuide jsonTree={selectedTreeJson} treeId={selectedTreeId} />
                                                <div className="mt-3">
                                                    <Button variant="outline" size="sm" onClick={handleResetGuide} className="text-xs h-7">
                                                        Nuova Ricerca
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </ScrollArea>
                            ) : (
                                <>
                                    <ScrollArea className="h-full" ref={scrollAreaRef}>
                                        <div className="p-6 space-y-6">
                                            {messages.map((m) => (
                                                <div
                                                    key={m.id}
                                                    className={cn(
                                                        'flex items-start gap-4',
                                                        m.role === 'user' && 'flex-row-reverse'
                                                    )}
                                                >
                                                    {m.role === 'assistant' && (
                                                        <Avatar className='border'>
                                                            <AvatarFallback><Bot className='text-primary' /></AvatarFallback>
                                                        </Avatar>
                                                    )}
                                                    <div className={cn('flex flex-col gap-2 max-w-[85%]', m.role === 'user' && 'items-end')}>
                                                        {m.nodes && m.nodes.length > 0 ? (
                                                            <div className="space-y-2">
                                                                {m.nodes.map((node, idx) => (
                                                                    <div key={idx} className={cn('rounded-lg p-3 text-sm bg-muted')}>
                                                                        <div className="whitespace-pre-wrap">{node.text}</div>
                                                                        {renderAttachments({ ...m, media: node.media, links: node.links, triggers: node.triggers })}
                                                                    </div>
                                                                ))}
                                                                {m.isFinalDecision && m.treeId && (
                                                                    <div className={cn('rounded-lg p-3 text-sm bg-muted')}>
                                                                        <Button asChild className="w-full">
                                                                            <Link href={`/view/${m.treeId}`}>
                                                                                Visualizza l'albero
                                                                            </Link>
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : m.searchResults ? (
                                                            <div className={cn('rounded-lg p-3 text-sm bg-muted space-y-3')}>
                                                                <div className="font-medium mb-2">{m.text}</div>
                                                                <div className="grid gap-2">
                                                                    {m.searchResults.map((tree) => (
                                                                        <button
                                                                            key={tree.sourceId}
                                                                            onClick={() => handleTreeSelect(tree.sourceId, tree.name)}
                                                                            className="flex flex-col items-start text-left p-3 rounded-md bg-background border hover:bg-accent/50 transition-colors w-full"
                                                                            disabled={isLoading}
                                                                        >
                                                                            <span className="font-semibold text-primary">{tree.name}</span>
                                                                            <span className="text-xs text-muted-foreground mt-1 line-clamp-2">{tree.summary}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className={cn(
                                                                'rounded-lg p-3 text-sm',
                                                                m.role === 'user'
                                                                    ? 'bg-primary text-primary-foreground'
                                                                    : 'bg-muted'
                                                            )}>
                                                                <div className="whitespace-pre-wrap">{m.text}</div>
                                                                {renderAttachments(m)}
                                                                {m.isFinalDecision && m.treeId && (
                                                                    <Button asChild className="mt-3">
                                                                        <Link href={`/view/${m.treeId}`}>
                                                                            Visualizza l'albero
                                                                        </Link>
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )}
                                                        {m.options && m.options.length > 0 && !m.isFinalDecision && (
                                                            <div className="flex flex-wrap gap-2">
                                                                {m.options.map(option => (
                                                                    <Button
                                                                        key={option}
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleOptionClick(option)}
                                                                        disabled={isLoading}
                                                                    >
                                                                        {option}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {m.role === 'user' && (
                                                        <Avatar className='border'>
                                                            <AvatarFallback><User /></AvatarFallback>
                                                        </Avatar>
                                                    )}
                                                </div>
                                            ))}
                                            {isLoading && (
                                                <div className='flex items-start gap-4'>
                                                    <Avatar className='border'>
                                                        <AvatarFallback><Bot className='text-primary' /></AvatarFallback>
                                                    </Avatar>
                                                    <div className="rounded-lg bg-muted p-3">
                                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </>
                            )}
                        </CardContent>
                        {!selectedTreeId && (
                            <div className="border-t p-4">
                                <form onSubmit={handleFormSubmit} className="flex gap-2">
                                    <Input
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="Descrivi il tuo problema..."
                                        disabled={isLoading || isConversationOver}
                                    />
                                    <Button type="submit" disabled={isLoading || !input.trim() || isConversationOver}>
                                        <Send className="h-5 w-5" />
                                    </Button>
                                </form>
                            </div>
                        )}
                    </Card>
                </div>
            </main>

            {/* Media Preview Dialog */}
            <Dialog open={!!previewingMedia} onOpenChange={(open) => !open && setPreviewingMedia(null)}>
                <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/90 border-none">
                    {previewingMedia?.type === 'image' && (
                        <div className="relative w-full h-[80vh]">
                            <Image
                                src={previewingMedia.url}
                                alt={previewingMedia.name || 'Preview'}
                                fill
                                className="object-contain"
                                unoptimized
                            />
                        </div>
                    )}
                    {previewingMedia?.type === 'video' && (
                        <div className="w-full h-full flex items-center justify-center p-4">
                            <video controls className="max-w-full max-h-[80vh]" src={previewingMedia.url}>
                                Il tuo browser non supporta il tag video.
                            </video>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
