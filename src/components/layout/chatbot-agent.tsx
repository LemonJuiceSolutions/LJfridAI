'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    X,
    Send,
    Bot,
    User,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Trash2,
    Settings2,
    Sparkles,
    MessageSquare,
    Command as CommandIcon,
    ChevronsUpDown,
    Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { chatOpenRouterAction, fetchOpenRouterModelsAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { useOpenRouterSettings } from '@/hooks/use-openrouter';
import { getOpenRouterAgentModelAction, saveOpenRouterAgentModelAction } from '@/actions/openrouter';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

type Message = {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
};

export function ChatBotAgent() {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(true);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
    const [isSavingModel, setIsSavingModel] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { apiKey: dbApiKey } = useOpenRouterSettings();
    const [agentModelLoading, setAgentModelLoading] = useState(true);

    // Persistence and initialization
    useEffect(() => {
        const savedMessages = localStorage.getItem('agent_chat_history');
        if (savedMessages) {
            setMessages(JSON.parse(savedMessages));
        } else {
            setMessages([{
                role: 'assistant',
                content: "Ciao! Sono il tuo assistente FridAI. Come posso aiutarti oggi con lo sviluppo del tuo Rules Engine?",
                timestamp: Date.now()
            }]);
        }

        // Fetch models
        fetchOpenRouterModelsAction().then(res => {
            if (res.data) setAvailableModels(res.data);
        });

        // Fetch agent model separately
        getOpenRouterAgentModelAction().then(res => {
            if (res.model) setModel(res.model);
            setAgentModelLoading(false);
        });
    }, []);

    useEffect(() => {
        if (messages.length > 0) {
            localStorage.setItem('agent_chat_history', JSON.stringify(messages));
        }
    }, [messages]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleModelChange = async (newModel: string) => {
        setModel(newModel);
        setModelSelectorOpen(false);

        // Auto-save to database (agent model only)
        setIsSavingModel(true);
        const result = await saveOpenRouterAgentModelAction(newModel);
        setIsSavingModel(false);

        if (result.success) {
            toast({
                title: "Modello salvato",
                description: `Modello aggiornato a ${newModel.split('/').pop()}`,
            });
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        if (!dbApiKey) {
            toast({
                title: "API Key mancante",
                description: "Configura la tua OpenRouter API Key nelle impostazioni.",
                variant: "destructive"
            });
            return;
        }

        const userMsg: Message = { role: 'user', content: input, timestamp: Date.now() };
        const newMessages = [...messages, userMsg];
        setMessages(newMessages);
        setInput('');
        setIsLoading(true);

        try {
            const history = newMessages.map(m => ({ role: m.role, content: m.content }));

            // Add system context for "Agent" behavior
            const systemContext = {
                role: 'system',
                content: "Sei FridAI, un assistente IA esperto in coding e system design. Il tuo obiettivo è aiutare l'utente a sviluppare e migliorare 'FridAI', un Rules Engine avanzato basato su Next.js, Prisma e Genkit. Sii conciso, tecnico e proattivo."
            };

            const result = await chatOpenRouterAction(dbApiKey, model, [systemContext, ...history]);

            if (result.success) {
                setMessages(prev => [...prev, { role: 'assistant', content: result.message, timestamp: Date.now() }]);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            toast({
                title: "Errore",
                description: error.message || "Impossibile comunicare con l'IA.",
                variant: "destructive"
            });
            setMessages(prev => [...prev, { role: 'assistant', content: "Scusa, si è verificato un errore nella comunicazione.", timestamp: Date.now() }]);
        } finally {
            setIsLoading(false);
        }
    };

    const clearChat = () => {
        const initial = [{
            role: 'assistant',
            content: "Chat ripulita. Come posso aiutarti ora?",
            timestamp: Date.now()
        }] as Message[];
        setMessages(initial);
        localStorage.removeItem('agent_chat_history');
    };

    const selectedModelData = availableModels.find(m => m.id === model);
    const selectedModelName = selectedModelData?.name || model.split('/').pop();

    if (!isOpen) {
        return (
            <Button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl animate-in fade-in zoom-in duration-300 z-50 group overflow-hidden bg-gradient-to-br from-primary to-purple-600"
            >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <MessageSquare className="h-6 w-6 text-white" />
            </Button>
        );
    }

    return (
        <div className="fixed top-0 right-0 z-40 h-screen w-96 border-l bg-background/95 backdrop-blur-xl animate-in slide-in-from-right duration-500 shadow-2xl">
            <div className="flex flex-col h-full">
                <div className="flex h-16 items-center justify-between border-b px-6 bg-muted/30">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-tight">FridAI Agent</h2>
                            <div className="flex items-center gap-2 p-2 border-b bg-muted/50 rounded-t-lg">
                                <Bot className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-sm">FridAI Chat</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={clearChat} className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8 rounded-lg">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="p-3 border-b bg-muted/10">
                    <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={modelSelectorOpen}
                                className="w-full justify-between h-10 text-xs font-medium"
                                disabled={isSavingModel}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    <Bot className="h-4 w-4 text-primary shrink-0" />
                                    <span className="truncate">{selectedModelName}</span>
                                </div>
                                {isSavingModel ? (
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                ) : (
                                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[360px] p-0" align="start">
                            <Command>
                                <CommandInput placeholder="Cerca modello..." className="h-9" />
                                <CommandList>
                                    <CommandEmpty>Nessun modello trovato.</CommandEmpty>
                                    <CommandGroup>
                                        {availableModels.slice(0, 100).map((m) => {
                                            const promptPrice = parseFloat(m.pricing?.prompt || 0) * 1000000;
                                            const completionPrice = parseFloat(m.pricing?.completion || 0) * 1000000;
                                            return (
                                                <CommandItem
                                                    key={m.id}
                                                    value={m.name || m.id}
                                                    onSelect={() => handleModelChange(m.id)}
                                                    className="flex items-start gap-2 py-2"
                                                >
                                                    <Check
                                                        className={cn(
                                                            "h-4 w-4 shrink-0 mt-0.5",
                                                            model === m.id ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex flex-col gap-0.5 min-w-0">
                                                        <span className="font-medium text-sm truncate">{m.name || m.id}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            ${promptPrice.toFixed(2)}/$1M in • ${completionPrice.toFixed(2)}/$1M out
                                                            {m.context_length && ` • ${(m.context_length / 1000).toFixed(0)}k ctx`}
                                                        </span>
                                                    </div>
                                                </CommandItem>
                                            );
                                        })}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>

                <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                    <div className="space-y-6">
                        {messages.map((m, i) => (
                            <div key={m.timestamp + i} className={cn(
                                "flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2",
                                m.role === 'user' ? "items-end" : "items-start"
                            )}>
                                <div className={cn(
                                    "flex items-center gap-2 mb-1",
                                    m.role === 'user' ? "flex-row-reverse" : "flex-row"
                                )}>
                                    <div className={cn(
                                        "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                                        m.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border"
                                    )}>
                                        {m.role === 'user' ? 'U' : 'A'}
                                    </div>
                                    <span className="text-[10px] font-medium text-muted-foreground">
                                        {m.role === 'user' ? 'Tu' : 'FridAI'}
                                    </span>
                                </div>
                                <div className={cn(
                                    "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                                    m.role === 'user'
                                        ? "bg-primary text-primary-foreground rounded-tr-none"
                                        : "bg-muted/50 border rounded-tl-none"
                                )}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex items-start gap-3">
                                <div className="h-6 w-6 rounded-full bg-muted border flex items-center justify-center">
                                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                </div>
                                <div className="bg-muted/30 border rounded-2xl rounded-tl-none px-4 py-3">
                                    <div className="flex gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 border-t bg-background">
                    <div className="relative group">
                        <Input
                            placeholder="Chiedi qualsiasi cosa..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            className="pr-12 h-12 rounded-xl border-muted-foreground/20 focus-visible:ring-primary shadow-inner bg-muted/5 group-focus-within:bg-background transition-all"
                        />
                        <Button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            size="icon"
                            className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                    </div>
                    <div className="mt-3 text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1.5 uppercase font-medium tracking-widest">
                        <CommandIcon className="h-2.5 w-2.5" />
                        Premi Invio per inviare
                    </div>
                </div>
            </div>
        </div>
    );
}
