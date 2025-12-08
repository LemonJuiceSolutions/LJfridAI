'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, BrainCircuit, Loader2, Send, User, Image as ImageIcon, Video, Link as LinkIcon, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { diagnoseProblemAction } from '../actions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import Image from 'next/image';
import type { MediaItem, LinkItem, TriggerItem } from '@/lib/types';


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

            const apiKey = localStorage.getItem('openrouter_api_key');
            const model = localStorage.getItem('openrouter_model') || 'google/gemini-2.0-flash-001';
            const openRouterConfig = apiKey ? { apiKey, model } : undefined;

            const result = await diagnoseProblemAction({
                userProblem: problem,
                currentAnswer: isOptionClick ? userMessageText : undefined,
                history,
            }, openRouterConfig);

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
                triggers: diagnosisData.triggers
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

    const isConversationOver = messages.length > 0 && messages[messages.length-1].isFinalDecision;

    return (
        <div className="flex flex-col h-screen bg-background">
            <header className="sticky top-0 z-10 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    <div className="flex items-center gap-2">
                        <Link href="/" className="flex items-center gap-2">
                            <BrainCircuit className="h-7 w-7 text-primary" />
                            <h1 className="text-xl font-bold">Like AI Said</h1>
                        </Link>
                    </div>
                    <Button asChild variant="outline">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Torna alla Home
                        </Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-hidden">
                <div className="container mx-auto h-full p-4 md:p-6">
                    <Card className="h-full flex flex-col">
                        <CardHeader>
                            <CardTitle>Chatbot Diagnostico</CardTitle>
                            <CardDescription>
                                Descrivi il tuo problema e ti aiuterò a trovare la guida giusta.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden p-0">
                             <ScrollArea className="h-full" ref={scrollAreaRef}>
                                <div className="p-6 space-y-6">
                                    {messages.map((m) => (
                                        <div key={m.id} className={cn('flex items-start gap-4', { 'justify-end': m.role === 'user' })}>
                                            {m.role === 'assistant' && (
                                                <Avatar className='border'>
                                                    <AvatarFallback><Bot className='text-primary'/></AvatarFallback>
                                                </Avatar>
                                            )}
                                            <div className={cn("max-w-[75%] space-y-2")}>
                                               <div className={cn(
                                                    'rounded-lg p-3 text-sm',
                                                    m.role === 'user'
                                                        ? 'bg-primary text-primary-foreground'
                                                        : 'bg-muted'
                                                )}>
                                                    <p>{m.text}</p>
                                                    {renderAttachments(m)}
                                                    {m.isFinalDecision && m.treeId && (
                                                         <Button asChild className="mt-3">
                                                            <Link href={`/view/${m.treeId}`}>
                                                                Visualizza l'albero
                                                            </Link>
                                                        </Button>
                                                    )}
                                                </div>
                                                 {m.options && m.options.length > 0 && !m.isFinalDecision &&(
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
                                                <AvatarFallback><Bot className='text-primary'/></AvatarFallback>
                                            </Avatar>
                                            <div className="rounded-lg bg-muted p-3">
                                                 <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                            </div>
                                         </div>
                                    )}
                                </div>
                             </ScrollArea>
                        </CardContent>
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
