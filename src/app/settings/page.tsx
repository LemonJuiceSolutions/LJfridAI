'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Settings, Save, PlayCircle, Loader2, CheckCircle2, XCircle, Send, Bot, User as UserIcon, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { testOpenRouterConnection, chatOpenRouterAction } from '../actions';

export default function SettingsPage() {
    const { toast } = useToast();
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState('google/gemini-2.0-flash-001');
    const [isLoading, setIsLoading] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Chat state
    const [chatMessages, setChatMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isChatting, setIsChatting] = useState(false);

    useEffect(() => {
        const storedKey = localStorage.getItem('openrouter_api_key');
        const storedModel = localStorage.getItem('openrouter_model');
        if (storedKey) setApiKey(storedKey);
        if (storedModel) setModel(storedModel);
    }, []);

    const handleSave = () => {
        setIsLoading(true);
        try {
            localStorage.setItem('openrouter_api_key', apiKey);
            localStorage.setItem('openrouter_model', model);
            toast({
                title: "Impostazioni salvate",
                description: "Le tue preferenze per OpenRouter sono state aggiornate.",
            });
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

    return (
        <div className="flex flex-col h-screen bg-background text-foreground">
            <header className="flex items-center h-16 px-4 border-b shrink-0 md:px-6 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                 <div className="flex items-center w-full gap-4 ml-auto md:gap-2 lg:gap-4">
                    <div className="flex-1 ml-auto sm:flex-initial">
                    </div>
                    <Button asChild variant="outline">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Torna alla Home
                        </Link>
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto">
                <div className="container mx-auto p-4 md:p-6 max-w-2xl pb-20">
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
                                <Label htmlFor="model">Modello Predefinito</Label>
                                <Select value={model} onValueChange={setModel}>
                                    <SelectTrigger id="model">
                                        <SelectValue placeholder="Seleziona un modello" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="google/gemini-2.0-flash-001">Google Gemini 2.0 Flash</SelectItem>
                                        <SelectItem value="anthropic/claude-3.5-sonnet">Anthropic Claude 3.5 Sonnet</SelectItem>
                                        <SelectItem value="openai/gpt-4o">OpenAI GPT-4o</SelectItem>
                                        <SelectItem value="meta-llama/llama-3-70b-instruct">Meta Llama 3 70B</SelectItem>
                                        <SelectItem value="mistralai/mistral-large">Mistral Large</SelectItem>
                                    </SelectContent>
                                </Select>
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
