'use client';

import React, { useState, useEffect, useRef, MouseEvent } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Code, Play, Sparkles, Wand2, Table as TableIcon, BarChart, Loader2, Copy, Send, Database, GitBranch, Sigma, GitMerge, GitCommitHorizontal, FileText, Briefcase, RefreshCw, Pencil, Check, ExternalLink, Variable, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { fixScript } from '@/ai/flows/fix-script-flow';
import { executeScript } from '@/ai/flows/execute-script-flow';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ResponsiveContainer, BarChart as RechartsBarChart, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Connection } from '@/components/widgets/setup/SetupWidget';
import { mockSalesData } from '@/lib/data';
import { Checkbox } from '../ui/checkbox';


const iconMap: { [key: string]: React.ElementType } = {
    Database,
    Code,
    Table2: TableIcon,
    Sigma,
    GitMerge,
    GitBranch,
    BarChart,
    GitCommitHorizontal,
    Play,
    FileText,
    Briefcase,
    RefreshCw,
    Share2
};

const iconOptions: (keyof typeof iconMap)[] = [
    'Database', 'Code', 'Table2', 'Sigma', 'GitMerge', 'GitBranch', 'BarChart', 'Play', 'FileText', 'Briefcase', 'RefreshCw'
];

const outputIconMap: { [key: string]: React.ElementType } = {
    table: TableIcon,
    kpi: Variable,
    chart: BarChart,
  };


const TablePreview = ({ data }: { data: any[] }) => {
    if (!Array.isArray(data) || data.length === 0) return <p className='text-xs text-muted-foreground text-center p-4'>Nessun dato da visualizzare.</p>;
    const headers = Object.keys(data[0]);
    return (
        <Table>
        <TableHeader>
            <TableRow>
            {headers.map(h => <TableHead key={h} className="h-8 text-xs">{h}</TableHead>)}
            </TableRow>
        </TableHeader>
        <TableBody>
            {data.map((row, i) => (
            <TableRow key={i}>
                {headers.map((cellKey, j) => <TableCell key={j} className="py-2 px-4 text-xs">{String(row[cellKey])}</TableCell>)}
            </TableRow>
            ))}
        </TableBody>
        </Table>
    )
};

const ChartPreview = ({data}: {data: any[]}) => {
    if (!Array.isArray(data) || data.length === 0) return <p className='text-xs text-muted-foreground text-center p-4'>Nessun dato per il grafico.</p>;
    return (
        <div className='p-4'>
            <ResponsiveContainer width="100%" height={200}>
                <RechartsBarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false}/>
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
                    <Tooltip
                        cursor={{fill: 'hsl(var(--muted))'}}
                        contentStyle={{
                            background: "hsl(var(--background))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                            fontSize: '12px'
                        }}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}/>
                </RechartsBarChart>
            </ResponsiveContainer>
        </div>
    )
};

const KpiPreview = ({data}: {data: {value: string, label: string}}) => {
    if (!data || !data.value) return <p className='text-xs text-muted-foreground text-center p-4'>Nessun dato per il KPI.</p>;
    return (
        <div className='p-4 flex justify-center items-center h-full'>
            <Card className='w-fit'>
                <CardHeader className="p-4">
                    <CardTitle className='text-sm font-medium text-muted-foreground'>{data.label || 'Result'}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="text-3xl font-bold">{data.value}</div>
                </CardContent>
            </Card>
        </div>
    );
};

const CodeBlock = ({ code, onUse }: { code: string, onUse: (code: string) => void }) => (
    <div className='bg-muted/50 rounded-md my-2'>
        <div className='px-3 py-2'>
            <pre className='whitespace-pre-wrap font-code text-[9px]'>{code}</pre>
        </div>
        <div className='border-t p-1 flex justify-end'>
            <Button size='sm' variant='ghost' className="h-7 text-[9px]" onClick={() => onUse(code)}>
                <Copy className='h-3 w-3 mr-1' />
                Usa Script
            </Button>
        </div>
    </div>
);


export function NodeDetailSheet({ isOpen, setIsOpen, node, onSave, connections, onRunPipelineNode }: { isOpen: boolean; setIsOpen: (open: boolean) => void; node: any; onSave: (node: any) => void; connections: Connection[], onRunPipelineNode: (nodeId: string) => Promise<any> }) {
  const [script, setScript] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [nodeIcon, setNodeIcon] = useState('Code');
  const [nodeOutputs, setNodeOutputs] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [selectedInputType, setSelectedInputType] = useState<'connection' | 'parentNode'>('parentNode');
  const [selectedInputId, setSelectedInputId] = useState<string | undefined>(undefined);
  const [isPublished, setIsPublished] = useState(false);


  useEffect(() => {
    if (node) {
      setScript(node.script || '');
      setNodeName(node.name || '');
      setNodeIcon(node.icon || 'Code');
      setNodeOutputs(node.outputs || []);
      setSelectedInputType(node.inputId && node.parentNodes && node.parentNodes.length > 0 ? 'parentNode' : 'connection');
      setSelectedInputId(node.inputId);
      setIsPublished(node.isPublished || false);
      setAiInstruction('');
      setShowPreview(false);
      setIsPreviewLoading(false);
      setPreviewData(null);
      setChatHistory([
        { role: 'assistant', content: "Ciao! Sono un esperto di SQL e Python per pipeline di dati. Come posso aiutarti con il tuo script? Puoi chiedermi di correggerlo, completarlo, o di trasformarlo." }
      ]);
      setIsEditingName(false);
    }
  }, [node, isOpen]);

  useEffect(() => {
    if (scrollAreaRef.current) {
        scrollAreaRef.current.scrollTo({
            top: scrollAreaRef.current.scrollHeight,
            behavior: 'smooth'
        });
    }
  }, [chatHistory])

  const handleSave = () => {
    const updatedNode: any = {
        id: node.id,
        pipelineId: node.pipelineId,
        script: script,
        name: nodeName,
        icon: nodeIcon,
        outputs: nodeOutputs,
        inputType: selectedInputType,
        inputId: selectedInputId,
        isPublished: isPublished,
    };
  
    // Clean the object from undefined values before saving.
    Object.keys(updatedNode).forEach(key => {
        if (updatedNode[key] === undefined) {
            delete updatedNode[key];
        }
    });

    onSave(updatedNode);
    setIsOpen(false);
    toast({
        title: "Nodo Salvato",
        description: `Le modifiche al nodo "${nodeName}" sono state salvate.`
    })
  };

  const handleAiAction = async () => {
    if (!aiInstruction.trim()) return;

    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: aiInstruction }];
    setChatHistory(newHistory);
    setAiInstruction('');
    setIsAiLoading(true);
    
    try {
      const result = await fixScript({ instruction: aiInstruction, script });
      setChatHistory([ ...newHistory, { role: 'assistant', content: result.response } ]);
    } catch (error) {
      console.error('AI action failed:', error);
      setChatHistory([ ...newHistory, { role: 'assistant', content: "Oops! Qualcosa è andato storto. Non sono riuscito a elaborare la tua richiesta." } ]);
      toast({
        variant: 'destructive',
        title: 'Chiamata AI Fallita',
        description: 'Non è stato possibile ottenere una risposta dall\'AI. Riprova.',
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleUseScript = (codeToUse: string) => {
    setScript(codeToUse);
    toast({
        title: "Script Aggiornato!",
        description: "Il codice generato dall'AI è stato inserito nell'editor.",
    })
  }

  const handleRunPreview = async () => {
    setIsPreviewLoading(true);
    setShowPreview(false);
    setPreviewData(null);
    
    try {
        let inputData = undefined;
        if (selectedInputType === 'parentNode' && selectedInputId) {
            const [parentNodeId] = selectedInputId.split('-out-');
            if (parentNodeId) {
                inputData = await onRunPipelineNode(parentNodeId);
            }
        }
        
        const response = await executeScript({ script, data: inputData, node });

        if (response) {
            setPreviewData(response);
        } else {
            setPreviewData(null);
        }

        setShowPreview(true);
        toast({
            title: "Anteprima Aggiornata",
            description: "L'esecuzione dello script è terminata.",
        });
    } catch (e) {
        console.error(e);
        toast({
            variant: "destructive",
            title: "Errore Esecuzione",
            description: (e as Error).message || "Impossibile eseguire lo script.",
        });
    } finally {
        setIsPreviewLoading(false);
    }
  };


  const handleOutputNameChange = (index: number, newName: string) => {
    setNodeOutputs(currentOutputs => {
      const newOutputs = [...currentOutputs];
      newOutputs[index] = { ...newOutputs[index], name: newName };
      return newOutputs;
    });
  };

  const renderPreview = () => {
    if (isPreviewLoading) {
        return (
            <div className='flex items-center justify-center h-full'>
                <Loader2 className='h-6 w-6 animate-spin text-primary' />
            </div>
        )
    }
    if (showPreview && previewData) {
        switch (node?.previewType) {
            case 'table':
                return <TablePreview data={previewData} />;
            case 'chart':
                return <ChartPreview data={previewData} />;
            case 'kpi':
                return <KpiPreview data={previewData} />;
            default:
                 if (Array.isArray(previewData) && previewData.length > 0) {
                    return <TablePreview data={previewData} />;
                }
                return <p className='text-xs text-muted-foreground text-center p-8'>Questo nodo non produce un output visualizzabile o non ha restituito dati.</p>;
        }
    }
    return <p className='text-xs text-muted-foreground text-center p-8'>Nessuna anteprima disponibile. Esegui lo script per visualizzarla.</p>;
  }

  const renderInputSelector = () => {
    const hasParentNodes = node.parentNodes && node.parentNodes.length > 0;
    const hasConnections = connections && connections.length > 0;
  
    return (
        <div className="flex flex-col gap-1">
            <h3 className="font-semibold flex items-center gap-2 text-xs px-2"><ExternalLink className="h-3 w-3" />Input Dati</h3>
            <div className='flex flex-col flex-1 gap-4 bg-muted/20 rounded-lg border p-3 text-sm'>
                <RadioGroup value={selectedInputType} onValueChange={(val: 'connection' | 'parentNode') => setSelectedInputType(val)} className='space-y-2'>
                    {hasConnections && (
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="connection" id="r-conn" />
                                <Label htmlFor="r-conn">Da Connessione Esterna</Label>
                            </div>
                            {selectedInputType === 'connection' && (
                                <div className="pl-6">
                                    <Select value={selectedInputId} onValueChange={setSelectedInputId} disabled={!hasConnections}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Seleziona connessione..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {connections.map(conn => (
                                                <SelectItem key={conn.id} value={conn.id} className='text-xs'>{conn.name} ({conn.type})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}
                    {hasParentNodes && (
                        <div className='space-y-2'>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="parentNode" id="r-parent" />
                                <Label htmlFor="r-parent">Da Nodi Precedenti</Label>
                            </div>
                            {selectedInputType === 'parentNode' && (
                                <div className='pl-6'>
                                    <Select value={selectedInputId} onValueChange={setSelectedInputId} disabled={!hasParentNodes}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue placeholder="Seleziona output..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {node.parentNodes.map((parent: any) => (
                                                <React.Fragment key={parent.id}>
                                                    <Label className='px-2 py-1.5 text-xs font-semibold'>{parent.name}</Label>
                                                    {parent.outputs.map((output: any, index: number) => (
                                                        <SelectItem key={output.id} value={`${parent.id}-out-${index}`} className='text-xs'>{output.name}</SelectItem>
                                                    ))}
                                                </React.Fragment>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}
                </RadioGroup>
                {!hasConnections && !hasParentNodes && (
                    <p className='text-xs text-muted-foreground text-center p-4'>Nessun input disponibile. Collega un nodo padre o configura una connessione esterna.</p>
                )}
            </div>
        </div>
    );
};
  

  if (!node) return null;

  const CurrentIcon = iconMap[nodeIcon] || (node.isPublished ? Share2 : GitBranch);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="bottom" className="h-4/5 flex flex-col">
        <SheetHeader className="p-2 pb-0">
          <SheetTitle>
            <div className="flex items-center gap-2">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="h-8 w-8">
                            <CurrentIcon className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2">
                        <div className="grid grid-cols-5 gap-2">
                            {iconOptions.map(iconKey => {
                                const IconComp = iconMap[iconKey];
                                return (
                                    <Button 
                                        key={iconKey} 
                                        variant={nodeIcon === iconKey ? 'default' : 'ghost'} 
                                        size="icon" 
                                        onClick={() => setNodeIcon(iconKey)}
                                    >
                                        <IconComp className="h-4 w-4" />
                                    </Button>
                                )
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
                {isEditingName ? (
                    <Input 
                        value={nodeName} 
                        onChange={(e) => setNodeName(e.target.value)}
                        onBlur={() => setIsEditingName(false)}
                        onKeyDown={(e) => { if(e.key === 'Enter') setIsEditingName(false)}}
                        autoFocus
                        className="text-lg font-semibold leading-none tracking-tight h-8 border-0 shadow-none focus-visible:ring-1"
                    />
                ) : (
                    <div className='flex items-center gap-2'>
                        <span className="text-lg font-semibold leading-none tracking-tight">{nodeName}</span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingName(true)}>
                            <Pencil className="h-3 w-3"/>
                        </Button>
                    </div>
                )}
            </div>
          </SheetTitle>
          <SheetDescription className="text-xs pl-12">
            Visualizza, modifica ed esegui lo script per questo nodo della pipeline.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 overflow-y-auto p-1 pt-0">
          {/* Left Panel */}
          <div className="flex flex-col gap-2">
            {node.type !== 'start' ? (
                <div className="flex flex-col gap-1 flex-1">
                    <h3 className="font-semibold flex items-center gap-2 text-xs px-2"><Sparkles className="h-3 w-3" />Chiedi all'AI</h3>
                    <div className='flex flex-col flex-1 gap-1 bg-muted/20 rounded-lg border p-1'>
                        <ScrollArea className='flex-1 pr-2' ref={scrollAreaRef}>
                            <div className='space-y-2 p-1'>
                            {chatHistory.map((message, index) => (
                                <div key={index} className={cn('flex items-start gap-2', message.role === 'user' && 'justify-end')}>
                                    {message.role === 'assistant' && (
                                        <Avatar className='h-6 w-6'>
                                            <AvatarFallback className="text-xs"><Wand2 className="h-3 w-3"/></AvatarFallback>
                                        </Avatar>
                                    )}
                                    <div className={cn(
                                        'rounded-lg p-2 max-w-sm text-xs', 
                                        message.role === 'assistant' ? 'bg-background' : 'bg-primary text-primary-foreground'
                                    )}>
                                        <ReactMarkdown
                                            components={{
                                                code({node, inline, className, children, ...props}) {
                                                    const match = /language-(\w+)/.exec(className || '')
                                                    const codeContent = String(children).replace(/\n$/, '');
                                                    return !inline && match ? (
                                                        <CodeBlock code={codeContent} onUse={handleUseScript} />
                                                    ) : (
                                                        <code className={cn(className, "text-xs")} {...props}>
                                                        {children}
                                                        </code>
                                                    )
                                                }
                                            }}
                                        >
                                            {message.content}
                                        </ReactMarkdown>
                                    </div>
                                    {message.role === 'user' && (
                                        <Avatar className='h-6 w-6'>
                                            <AvatarFallback className="text-xs">TU</AvatarFallback>
                                        </Avatar>
                                    )}
                                </div>
                            ))}
                            </div>
                        </ScrollArea>
                        <div className='flex gap-1 p-1'>
                            <Textarea 
                                id="ai-instruction"
                                placeholder='Chiedi allAI...'
                                value={aiInstruction}
                                onChange={(e) => setAiInstruction(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAiAction();
                                    }
                                }}
                                disabled={isAiLoading}
                                className="flex-grow text-xs min-h-[36px]"
                                rows={1}
                            />
                            <Button onClick={handleAiAction} disabled={isAiLoading} size="icon" className='self-end h-9 w-9'>
                                {isAiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}
          </div>
          
          {/* Center Panel */}
            <div className="flex flex-col gap-2">
                {node.type !== 'start' ? (
                <>
                    <div className="flex flex-col gap-1 flex-1">
                        <Label htmlFor="script-editor" className="flex items-center gap-2 font-semibold text-xs px-2">
                            <Code className="h-3 w-3" />
                            Editor Script (SQL/Python)
                        </Label>
                        <Textarea
                        id="script-editor"
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                        className="flex-1 font-mono text-[9px] resize-none"
                        placeholder="Scrivi qui il tuo script SQL o Python..."
                        />
                    </div>
                    {renderInputSelector()}
                </>
                 ) : (
                    <div className="flex flex-col col-span-1 md:col-span-2 gap-1 h-full">
                        <h3 className="font-semibold flex items-center gap-2 text-xs px-2"><FileText className="h-3 w-3" />Note</h3>
                        <Textarea className="flex-1 font-mono text-xs" placeholder="Aggiungi note sulla pipeline..."/>
                    </div>
                )}
            </div>


          {/* Right Panel */}
          {node.type !== 'start' && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <h3 className="font-semibold text-xs px-2">Output del Nodo</h3>
              <div className="flex flex-col gap-2 bg-muted/20 rounded-lg border p-2 text-sm">
                {nodeOutputs.map((output, index) => {
                    const OutputIcon = outputIconMap[output.type] || Sigma;
                    return (
                        <div key={index} className="flex items-center gap-2">
                            <OutputIcon className="h-4 w-4 text-muted-foreground" />
                            <Input
                            type="text"
                            value={output.name}
                            onChange={(e) => handleOutputNameChange(index, e.target.value)}
                            className="h-8 text-xs flex-1"
                            placeholder="Nome output..."
                            />
                        </div>
                    )
                })}
              </div>
            </div>
            {node.type === 'end' && (
                <div className="flex items-center space-x-2 bg-muted/20 rounded-lg border p-3">
                    <Checkbox id="publish-widget" checked={isPublished} onCheckedChange={(checked) => setIsPublished(checked as boolean)} />
                    <label
                        htmlFor="publish-widget"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Pubblica come Widget per Dashboard
                    </label>
                </div>
            )}
            <div className="flex flex-col gap-1 flex-1">
                <h3 className='font-semibold flex items-center gap-2 text-xs px-2'><TableIcon className='h-3 w-3' />Anteprima Risultati</h3>
                <div className='flex-1 rounded-lg border bg-muted/20 p-1 overflow-auto'>
                    {renderPreview()}
                </div>
            </div>
          </div>
          )}
        </div>
        <SheetFooter className="mt-auto pt-2 p-1 border-t">
            <div className='flex justify-between w-full'>
                <div>
                {node.type !== 'start' && (
                    <Button variant="outline" size="sm" onClick={handleRunPreview} disabled={isPreviewLoading} className='text-xs'>
                        {isPreviewLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
                        Esegui e Aggiorna Anteprima
                    </Button>
                )}
                </div>
                <div>
                    <Button variant="outline" size="sm" onClick={() => setIsOpen(false)} className='text-xs'>
                        Annulla
                    </Button>
                    <Button onClick={handleSave} size="sm" className="ml-2 text-xs">Salva Modifiche</Button>
                </div>
            </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
};
