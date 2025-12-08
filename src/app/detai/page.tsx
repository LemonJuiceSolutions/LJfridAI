
'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, BrainCircuit, Loader2, Send, User, MessageSquareText, Search, Cog, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { detaiAction } from '../actions';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { DetaiInput } from '@/ai/flows/detai-flow';
import { Badge } from '@/components/ui/badge';


type Message = {
    id: string;
    role: 'user' | 'model' | 'tool' | 'system';
    text?: string;
    toolRequest?: any;
    toolResponse?: any;
};

type ParsedTextSegment = {
    type: 'text' | 'source';
    content: string;
    sourceId?: string;
    sourceName?: string;
}

const initialAssistantMessage: Message = {
    id: 'initial-message',
    role: 'model',
    text: "Ciao! Sono detAI, il tuo assistente conversazionale. Chiedimi qualsiasi cosa! Posso anche cercare informazioni all'interno dei tuoi alberi decisionali."
}

// Helper function to format bold markdown to styled HTML
const formatText = (text: string) => {
    // Note: This is a simple implementation. For full markdown support, a library like react-markdown would be better.
    const boldRegex = /\*\*(.*?)\*\*/g;
    return text.replace(boldRegex, '<strong class="text-primary">$1</strong>');
}

export default function DetaiPage() {
    const { toast } = useToast();
    const [messages, setMessages] = useState<Message[]>([initialAssistantMessage]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

     const handleSubmit = useCallback(async (currentMessages: Message[]) => {
        setIsLoading(true);

        try {
            // Map local message state to the format expected by the AI flow
            const history: DetaiInput['messages'] = currentMessages
                .filter(m => m.id !== 'initial-message') 
                .map(m => ({
                    role: m.role,
                    content: m.role === 'tool'
                      ? [{ toolResponse: m.toolResponse }]
                      : m.text
                      ? [{ text: m.text }]
                      : [{ toolRequest: m.toolRequest }]
                }));
            
            const result = await detaiAction({ messages: history });
            
            if (result.error || !result.data) {
                throw new Error(result.error || 'La risposta è fallita senza un errore specifico.');
            }

            // The AI might respond with text or a tool request
            const aiResponse = result.data;
            const newMessages: Message[] = [];
            
            if (aiResponse.text) {
                 newMessages.push({
                    id: (Date.now() + 1).toString(),
                    role: 'model',
                    text: aiResponse.text,
                });
            } else if (aiResponse.toolRequest) {
                const toolRequestMessage: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'model', // The model is making the request
                    toolRequest: aiResponse.toolRequest,
                };
                newMessages.push(toolRequestMessage);
                
                // If there's a tool request, we need to make another call to the backend
                // to execute the tool and get the response.
                 const nextHistory: DetaiInput['messages'] = [...history, { role: 'model', content: [{ toolRequest: aiResponse.toolRequest }] }];
                 const toolResult = await detaiAction({ messages: nextHistory });
                 
                 if (toolResult.error || !toolResult.data?.toolResponse) {
                     throw new Error(toolResult.error || 'Esecuzione dello strumento fallita.');
                 }

                 const toolResponseMessage: Message = {
                    id: (Date.now() + 2).toString(),
                    role: 'tool',
                    toolResponse: toolResult.data.toolResponse,
                 };
                 newMessages.push(toolResponseMessage);
                 
                 // Now we need to make one final call with the tool's response to get the final text answer
                 const finalHistory: DetaiInput['messages'] = [...nextHistory, { role: 'tool', content: [{ toolResponse: toolResult.data.toolResponse }] }];
                 const finalResult = await detaiAction({ messages: finalHistory });
                 
                 if (finalResult.error || !finalResult.data?.text) {
                    throw new Error(finalResult.error || 'Risposta finale fallita dopo l\'esecuzione dello strumento.');
                 }
                 newMessages.push({
                    id: (Date.now() + 3).toString(),
                    role: 'model',
                    text: finalResult.data.text
                 });
            }
            
            setMessages(prev => [...prev, ...newMessages]);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
            toast({
                variant: 'destructive',
                title: 'Errore del Chatbot',
                description: errorMessage,
            });
             const assistantErrorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'model',
                text: `Mi dispiace, si è verificato un errore: ${errorMessage}`,
            };
            setMessages(prev => [...prev, assistantErrorMessage]);

        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input.trim()) return;

        const newUserMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: input,
        };
        
        const newMessages = [...messages, newUserMessage];
        setMessages(newMessages);
        setInput('');
        
        // Pass the updated messages array directly to handleSubmit
        handleSubmit(newMessages);
    }
    
    const ToolRequestMessage = ({ request }: { request: any }) => (
        <Badge variant="secondary" className="flex-shrink-0">
            <Search className="h-3 w-3 mr-2"/>
            Ricerca nel database: "{request.input.query}"...
        </Badge>
    );

    const ToolResponseMessage = ({ response }: { response: any }) => {
        let content;
        try {
            // Attempt to parse and pretty-print if it's a JSON string
            const parsed = JSON.parse(response);
            content = JSON.stringify(parsed, null, 2);
        } catch (e) {
            // Otherwise, just display as is
            content = response;
        }

        return (
            <details className="bg-muted/50 p-2 rounded-md max-w-full">
                <summary className="cursor-pointer text-xs flex items-center">
                    <Cog className="h-3 w-3 mr-2"/>
                    Risultato dello Strumento
                </summary>
                <pre className="text-xs mt-2 overflow-x-auto">
                    <code>
                        {content}
                    </code>
                </pre>
            </details>
        );
    };

    const sourceColors = [
        'bg-violet-100/60 dark:bg-violet-900/40 border-violet-200 dark:border-violet-800',
        'bg-purple-100/60 dark:bg-purple-900/40 border-purple-200 dark:border-purple-800',
        'bg-fuchsia-100/60 dark:bg-fuchsia-900/40 border-fuchsia-200 dark:border-fuchsia-800',
        'bg-pink-100/60 dark:bg-pink-900/40 border-pink-200 dark:border-pink-800',
        'bg-indigo-100/60 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800',
    ];

    const parseAttributedText = (text: string, toolResponse?: any): ParsedTextSegment[] => {
        const segments: ParsedTextSegment[] = [];
        const regex = /\[Fonte:\s*([^\]]+)\]([\s\S]*?)\[Fine Fonte\]/g;
        let lastIndex = 0;
        let match;

        let sourcesUsed: any[] = [];
        if (toolResponse) {
            try {
                sourcesUsed = JSON.parse(toolResponse);
            } catch { /* ignore parse error */ }
        }

        while ((match = regex.exec(text)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                segments.push({ type: 'text', content: text.substring(lastIndex, match.index) });
            }

            const sourceId = match[1].trim();
            const content = match[2].trim();
            const sourceInfo = sourcesUsed.find(s => s.sourceId === sourceId);

            segments.push({
                type: 'source',
                content: content,
                sourceId: sourceId,
                sourceName: sourceInfo?.name || sourceId,
            });

            lastIndex = match.index + match[0].length;
        }

        // Add any remaining text after the last match
        if (lastIndex < text.length) {
            segments.push({ type: 'text', content: text.substring(lastIndex) });
        }

        return segments;
    }


    const AttributedMessage = ({ text, toolResponse }: { text: string, toolResponse?: any }) => {
        const segments = parseAttributedText(text, toolResponse);
        const sourceIdToColorIndex = new Map<string, number>();
        let colorIndex = 0;

        return (
            <div className="space-y-3">
                {segments.map((segment, index) => {
                    if (segment.type === 'text' && segment.content.trim()) {
                        return <p key={index} dangerouslySetInnerHTML={{ __html: formatText(segment.content) }} />;
                    }
                    if (segment.type === 'source' && segment.sourceId) {
                        if (!sourceIdToColorIndex.has(segment.sourceId)) {
                            sourceIdToColorIndex.set(segment.sourceId, colorIndex);
                            colorIndex = (colorIndex + 1) % sourceColors.length;
                        }
                        const colorClass = sourceColors[sourceIdToColorIndex.get(segment.sourceId)!];
                        return (
                             <div key={index} className={cn('p-3 rounded-lg border', colorClass)}>
                                <p dangerouslySetInnerHTML={{ __html: formatText(segment.content) }} />
                                <Link href={`/view/${segment.sourceId}`} passHref>
                                    <Badge variant="outline" className="mt-3 cursor-pointer hover:border-primary/80">
                                        <LinkIcon className="h-3 w-3 mr-1.5"/>
                                        Fonte: {segment.sourceName}
                                    </Badge>
                                </Link>
                            </div>
                        )
                    }
                    return null;
                })}
            </div>
        )
    }

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
                            <CardTitle className="flex items-center gap-2">
                                <MessageSquareText className="h-6 w-6 text-primary" />
                                detAI
                            </CardTitle>
                            <CardDescription>
                                Chiedimi qualsiasi cosa. Risponderò come un LLM, cercando informazioni nei tuoi alberi decisionali quando necessario.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden p-0">
                             <ScrollArea className="h-full" ref={scrollAreaRef}>
                                <div className="p-6 space-y-6">
                                    {messages.map((m, msgIndex) => {
                                        if (m.role === 'system') return null;
                                        const prevMessage = msgIndex > 0 ? messages[msgIndex - 1] : null;

                                        return (
                                        <div key={m.id} className={cn('flex items-start gap-4', { 'justify-end': m.role === 'user' })}>
                                            {m.role !== 'user' && (
                                                <Avatar className='border flex-shrink-0'>
                                                    <AvatarFallback><Bot className='text-primary'/></AvatarFallback>
                                                </Avatar>
                                            )}
                                            <div className={cn("max-w-[75%] space-y-2 flex flex-col", { 'items-end': m.role === 'user', 'items-start': m.role !== 'user' })}>
                                               {m.text && (
                                                 <div className={cn(
                                                        'rounded-lg p-3 text-sm whitespace-pre-wrap',
                                                        m.role === 'user'
                                                            ? 'bg-primary text-primary-foreground'
                                                            : 'bg-muted'
                                                    )}>
                                                        {m.text.includes('[Fonte:') ? (
                                                            <AttributedMessage text={m.text} toolResponse={prevMessage?.role === 'tool' ? prevMessage.toolResponse : undefined} />
                                                        ) : (
                                                            <p dangerouslySetInnerHTML={{ __html: formatText(m.text) }} />
                                                        )}
                                                    </div>
                                               )}
                                                {m.toolRequest && <ToolRequestMessage request={m.toolRequest} />}
                                                {m.toolResponse && <ToolResponseMessage response={m.toolResponse} />}
                                            </div>
                                             {m.role === 'user' && (
                                                <Avatar className='border flex-shrink-0'>
                                                    <AvatarFallback><User /></AvatarFallback>
                                                </Avatar>
                                            )}
                                        </div>
                                    )})}
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
                                    placeholder="Scrivi il tuo messaggio a detAI..."
                                    disabled={isLoading}
                                />
                                <Button type="submit" disabled={isLoading || !input.trim()}>
                                    <Send className="h-5 w-5" />
                                </Button>
                            </form>
                        </div>
                    </Card>
                </div>
            </main>
        </div>
    );
}
