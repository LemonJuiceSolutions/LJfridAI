
'use client';

import { useState, useRef, useEffect } from 'react';
import { BotMessageSquare, Loader2, Sparkles, Mic, MicOff, AlertCircle, RefreshCw, FileSpreadsheet, Upload, Database, Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { getTreeAction, regenerateNaturalLanguageAction, processExcelToPipelineAction, fetchOpenRouterModelsAction } from '../actions';
import { getConnectorsAction } from '../actions/connectors';
import { ExcelAnalysisSummary } from '@/components/excel-analysis-summary';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { StoredTree } from '@/lib/types';
import ResultsDisplay from '@/components/rule-sage/results-display';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useOpenRouterSettings } from '@/hooks/use-openrouter';
import { getAiProviderAction, saveAiProviderAction, type AiProvider } from '@/actions/ai-settings';
import { saveOpenRouterModelAction } from '@/actions/openrouter';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

const processExamples = [
  // Machinery Maintenance
  `Se una macchina segnala un codice di errore, controlla innanzitutto se la macchina è in garanzia. Se è in garanzia, verifica se il problema è coperto dalla garanzia. Se è coperto, procedi con la riparazione gratuita. Se non è coperto (ad esempio, per danno accidentale), emetti un preventivo per la riparazione. Se la macchina non è in garanzia, emetti direttamente un preventivo. Se non ci sono codici di errore, esegui una diagnostica standard. Se la diagnostica rivela un problema, emetti un preventivo. Se la diagnostica non rivela nulla, pianifica una manutenzione preventiva e informa il cliente.`,
  `In caso di perdita di pressione in un circuito idraulico, isolare prima la sezione del circuito. Verificare se la perdita proviene da un tubo o da un raccordo. Se proviene da un raccordo, stringere il raccordo e testare di nuovo. Se la perdita persiste, sostituire la guarnizione del raccordo. Se la perdita proviene da un tubo, sostituire il tubo. Se dopo l'isolamento non si trova la perdita, il problema potrebbe essere nella pompa o in un cilindro. Ispezionare la pompa per eventuali perdite esterne. Se non ce ne sono, controllare la pressione di uscita della pompa. Se la pressione è bassa, revisionare la pompa. Altrimenti, ispezionare i cilindri.`,
  `Se un motore elettrico non si avvia, controllare prima l'alimentazione. Verificare che l'interruttore principale sia acceso e che non ci siano fusibili bruciati. Se l'alimentazione è corretta, controllare il cablaggio del motore per connessioni allentate o danneggiate. Se il cablaggio è a posto, misurare la resistenza degli avvolgimenti del motore con un multimetro. Se la resistenza è infinita o molto bassa, il motore è probabilmente bruciato e deve essere sostituito. Se la resistenza è nei parametri, il problema potrebbe essere il condensatore di avviamento. Testare o sostituire il condensatore.`,
  `Quando si verifica un surriscaldamento del sistema, controllare il livello del liquido di raffreddamento. Se è basso, rabboccare e verificare la presenza di perdite nel sistema. Se il livello è normale, ispezionare il radiatore per ostruzioni come polvere o detriti e pulirlo se necessario. Se il radiatore è pulito, controllare il funzionamento della ventola di raffreddamento. Se la ventola non gira, testare il motore della ventola e il relativo interruttore termico. Se la ventola funziona, il problema potrebbe essere il termostato bloccato in posizione chiusa, che impedisce la circolazione del refrigerante. Sostituire il termostato.`,
  // Customer Support & Logistics
  `Per una richiesta di reso, controllare la data di acquisto. Se è entro 30 giorni, chiedere se il prodotto è stato aperto. Se non è aperto, approva il reso e genera un'etichetta di spedizione. Se è aperto, chiedi il motivo del reso. Se il motivo è 'difettoso', autorizza il reso con sostituzione. Se il motivo è 'non più desiderato', rifiuta il reso per i prodotti aperti. Se la data di acquisto è oltre i 30 giorni, il reso è sempre rifiutato.`,
  `Gestione di una spedizione in ritardo: per prima cosa, controlla il tracking online. Se il tracking mostra 'in consegna', informa il cliente che arriverà oggi. Se mostra 'in transito' da più di 3 giorni, contatta il corriere per un sollecito. Se il corriere non ha informazioni, considera il pacco come smarrito. Se il pacco è smarrito, chiedi al cliente se preferisce un rimborso o una new spedizione. Se sceglie il rimborso, emettilo immediatamente. Se sceglie una nuova spedizione, creane una nuova con priorità alta. Se il tracking mostra 'consegnato' ma il cliente nega, avvia una contestazione formale con il corriere.`,
  `Per un reclamo su un prodotto, chiedi se il cliente ha una prova d'acquisto. Se non ce l'ha, il reclamo viene respinto. Se ce l'ha, chiedi una foto del difetto. Se il difetto è chiaramente visibile, offri una sostituzione gratuita. Se il difetto non è chiaro dalla foto, chiedi al cliente di spedire il prodotto per un'ispezione tecnica. Se l'ispezione conferma il difetto, procedi con la sostituzione. Se l'ispezione non rileva difetti, rispedisci il prodotto al cliente con una spiegazione tecnica.`,
  // IT Help Desk
  `Se un utente non riesce a connettersi a Internet, chiedi se la connessione è via cavo o Wi-Fi. Se è Wi-Fi, chiedi di riavviare il router. Se il problema persiste, chiedi di 'dimenticare' la rete e ricollegarsi. Se ancora non funziona, controlla se altri dispositivi si connettono. Se altri dispositivi si connettono, il problema è del dispositivo dell'utente e bisogna eseguire una diagnostica di rete. Se nessun dispositivo si connette, il problema è del provider. Se la connessione è via cavo, controlla che il cavo sia collegato correttamente. Se è collegato, controlla le spie sulla porta di rete del computer. Se le spie sono spente, potrebbe essere un problema hardware del computer. Se sono accese, prova a eseguire il comando 'ipconfig' per verificare l'indirizzo IP.`,
  `Un utente non riesce ad accedere al suo account. Controlla se l'account è bloccato. Se è bloccato, sbloccalo e invia una password temporanea. Se non è bloccato, chiedi all'utente di provare a reimpostare la password tramite il link 'Password dimenticata'. Se l'utente non riceve l'email di reset, verifica che l'indirizzo email nel sistema sia corretto. Se l'email è corretta, il problema potrebbe essere del provider di posta dell'utente. Se l'email non è corretta, aggiornala e invia di nuovo il link di reset. Se l'utente riceve l'email ma il link non funziona, genera manualmente una password temporanea.`,
  // HR Process
  `Processo di richiesta ferie: il dipendente invia una richiesta. Controlla se le date richieste si sovrappongono con quelle di un altro membro del team. Se c'è sovrapposizione, verifica la criticità dei ruoli. Se i ruoli non sono critici, approva la richiesta. Se i ruoli sono critici, nega la richiesta e chiedi al dipendente di proporre date alternative. Se non c'è sovrapposizione, controlla il saldo ferie del dipendente. Se il saldo è sufficiente, approva la richiesta. Se il saldo non è sufficiente, nega la richiesta e informa il dipendente del saldo residuo.`
];

export default function CreatePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<StoredTree | null>(null);
  const [textDescription, setTextDescription] = useState('');
  const { toast } = useToast();
  const [currentModel, setCurrentModel] = useState<string>('google/gemini-2.0-flash-001');
  const { apiKey: dbApiKey, model: dbModel, isLoading: isSettingsLoading } = useOpenRouterSettings();

  // AI provider & model selector state
  const [aiProvider, setAiProvider] = useState<AiProvider>('openrouter');
  const [availableModels, setAvailableModels] = useState<{ id: string; name: string; pricing?: { prompt: string; completion: string } }[]>([]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [isSavingModel, setIsSavingModel] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  const [excelFiles, setExcelFiles] = useState<Array<{ name: string }>>([]);
  const [selectedExcelFile, setSelectedExcelFile] = useState<string>('');
  const [excelAnalysis, setExcelAnalysis] = useState<any>(null);
  const [isAnalyzingExcel, setIsAnalyzingExcel] = useState(false);
  const [connectors, setConnectors] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');

  // Load AI provider, models, and set current model
  useEffect(() => {
    const CLAUDE_CLI_MODELS = [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'sonnet', name: 'Sonnet (latest)' },
      { id: 'opus', name: 'Opus (latest)' },
      { id: 'haiku', name: 'Haiku (latest)' },
    ];

    getAiProviderAction().then(res => {
      const provider = res.provider || 'openrouter';
      setAiProvider(provider);

      if (provider === 'claude-cli') {
        setAvailableModels(CLAUDE_CLI_MODELS);
        const cliModel = res.claudeCliModel || 'claude-sonnet-4-6';
        setCurrentModel(cliModel);
      } else {
        // Load OpenRouter models
        if (!isSettingsLoading && dbModel) {
          setCurrentModel(dbModel);
        }
        fetchOpenRouterModelsAction().then(modelsRes => {
          if (modelsRes.data) {
            setAvailableModels(modelsRes.data.map((m: any) => ({
              id: m.id,
              name: m.name,
              pricing: m.pricing,
            })));
          }
        });
      }
    });
  }, [dbModel, isSettingsLoading]);

  useEffect(() => {
    // Fetch Excel files from both data_lake and python-backend/EEXXCC
    Promise.all([
      fetch('/api/files?folder=data_lake').then(r => r.json()).catch(() => ({ files: [] })),
      fetch('/api/files?folder=excel-etl').then(r => r.json()).catch(() => ({ files: [] })),
    ]).then(([docs, eexxcc]) => {
      const allFiles = [
        ...((docs.success && docs.files) || []),
        ...((eexxcc.success && eexxcc.files) || []),
      ].filter((f: any) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
      // Deduplicate by name
      const seen = new Set<string>();
      const unique = allFiles.filter((f: any) => {
        if (seen.has(f.name)) return false;
        seen.add(f.name);
        return true;
      });
      setExcelFiles(unique);
    });

    getConnectorsAction().then(res => {
      if (res.data) {
        const dbConnectors = res.data
          .filter((c: any) => c.type === 'MSSQL')
          .map((c: any) => ({ id: c.id, name: c.name, type: c.type }));
        setConnectors(dbConnectors);
      }
    });
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'it-IT';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setTextDescription(prev => prev + finalTranscript);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        toast({
          variant: 'destructive',
          title: 'Errore Riconoscimento Vocale',
          description: `Si è verificato un errore: ${event.error}`,
        });
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    }

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast]);

  const toggleRecording = () => {
    if (!isSpeechSupported) {
      toast({
        variant: 'destructive',
        title: 'Browser Non Supportato',
        description: 'Il riconoscimento vocale non è supportato dal tuo browser.',
      });
      return;
    }
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
    setIsRecording(!isRecording);
  };


  const handleProviderToggle = async () => {
    const CLAUDE_CLI_MODELS = [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'sonnet', name: 'Sonnet (latest)' },
      { id: 'opus', name: 'Opus (latest)' },
      { id: 'haiku', name: 'Haiku (latest)' },
    ];

    const newProvider: AiProvider = aiProvider === 'openrouter' ? 'claude-cli' : 'openrouter';
    setAiProvider(newProvider);

    if (newProvider === 'claude-cli') {
      setAvailableModels(CLAUDE_CLI_MODELS);
      setCurrentModel('claude-sonnet-4-6');
      await saveAiProviderAction('claude-cli', 'claude-sonnet-4-6');
    } else {
      const savedModel = dbModel || 'google/gemini-2.0-flash-001';
      setCurrentModel(savedModel);
      await saveAiProviderAction('openrouter');
      fetchOpenRouterModelsAction().then(modelsRes => {
        if (modelsRes.data) {
          setAvailableModels(modelsRes.data.map((m: any) => ({
            id: m.id,
            name: m.name,
            pricing: m.pricing,
          })));
        }
      });
    }
  };

  const handleModelChange = async (newModel: string) => {
    setCurrentModel(newModel);
    setModelSelectorOpen(false);
    setIsSavingModel(true);
    try {
      if (aiProvider === 'claude-cli') {
        await saveAiProviderAction('claude-cli', newModel);
      } else {
        await saveOpenRouterModelAction(newModel);
      }
    } catch (e) {
      console.error('Failed to save model:', e);
    }
    setIsSavingModel(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!textDescription.trim()) {
      toast({
        variant: 'destructive',
        title: 'Input Richiesto',
        description: 'Per favore, inserisci una descrizione del tuo processo.',
      });
      return;
    }

    if (analysisResult && !confirm("Attenzione: stiamo per RIGENERARE l'intera regola basandosi su questo testo.\n\nTutte le modifiche manuali fatte all'editor grafico andranno PERSE.\n\nVuoi davvero sovrascrivere la regola corrente?")) {
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const type = searchParams.get('type') || 'RULE';

      // Use the API route which auto-detects the AI provider (Claude CLI vs OpenRouter)
      const response = await fetch('/api/trees/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textDescription, type, model: currentModel }),
      });

      const result = await response.json();
      if (result.error || !result.data) {
        throw new Error(result.error || 'Analisi fallita senza un errore specifico.');
      }

      if ((result.data as any).debug) {
        console.group("🔍 AI Debug Info");
        console.log("Model:", (result.data as any).debug.model);
        console.log("Extract Vars Input:", (result.data as any).debug.extractVarsInput);
        console.log("Extract Vars Output:", (result.data as any).debug.extractVarsOutput);
        console.log("Generate Tree Input:", (result.data as any).debug.generateTreeInput);
        console.log("Generate Tree Output:", (result.data as any).debug.generateTreeOutput);
        console.groupEnd();
      }

      setAnalysisResult(result.data);

      toast({
        title: 'Analisi Completata!',
        description: 'La tua regola decisionale è stata creata e salvata.',
        action: (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/view/${result.data.id}`}>Visualizza</Link>
          </Button>
        )
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Si è verificato un errore sconosciuto.';
      toast({
        variant: 'destructive',
        title: 'Analisi Fallita',
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExcelAnalyze = async (filename: string) => {
    setSelectedExcelFile(filename);
    setIsAnalyzingExcel(true);
    setExcelAnalysis(null);
    try {
      const response = await fetch('/api/analyze-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const result = await response.json();

      if (!result.success) throw new Error(result.error);

      setExcelAnalysis(result.analysis);
      toast({
        title: 'Analisi Excel completata',
        description: `Trovati ${result.analysis.sheets.length} fogli con ${result.analysis.sheets.reduce((s: number, sh: any) => s + sh.formulas.length, 0)} formule.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Errore analisi Excel',
        description: error.message || 'Analisi fallita',
      });
    } finally {
      setIsAnalyzingExcel(false);
    }
  };

  const handleExcelToPipeline = async () => {
    if (!excelAnalysis) return;
    setIsLoading(true);
    setAnalysisResult(null);
    try {
      const openRouterConfig = dbApiKey ? { apiKey: dbApiKey, model: dbModel || 'google/gemini-2.0-flash-001' } : undefined;
      // Optimize: strip the huge formulas array, keep only summaries for the AI prompt
      const trimmedAnalysis = {
        ...excelAnalysis,
        sheets: excelAnalysis.sheets.map((s: any) => ({
          ...s,
          formulas: s.formulas?.slice(0, 5) || [], // Keep just a few + the count is preserved by formulaSamples
          formulaCount: s.formulas?.length || 0,
          sampleData: s.sampleData?.slice(0, 3) || [],
        })),
        crossSheetReferences: excelAnalysis.crossSheetReferences?.slice(0, 50) || [],
      };
      const result = await processExcelToPipelineAction(trimmedAnalysis, openRouterConfig, selectedConnectorId || undefined);
      if (result.error || !result.data) throw new Error(result.error || 'Generazione fallita');

      setAnalysisResult(result.data);
      toast({
        title: 'Pipeline generata!',
        description: 'La pipeline dal file Excel e\' stata creata.',
        action: (
          <Button asChild variant="secondary" size="sm">
            <Link href={`/view/${result.data.id}`}>Visualizza</Link>
          </Button>
        )
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Generazione Pipeline fallita',
        description: error.message || 'Errore sconosciuto',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetExample = () => {
    const randomIndex = Math.floor(Math.random() * processExamples.length);
    setTextDescription(processExamples[randomIndex]);
  }

  const handleUpdateDescription = async () => {
    if (!analysisResult?.id) return;
    setIsLoading(true);
    try {
      const openRouterConfig = dbApiKey ? { apiKey: dbApiKey, model: dbModel || 'google/gemini-2.0-flash-001' } : undefined;

      const res = await regenerateNaturalLanguageAction(analysisResult.id, openRouterConfig);
      if (res.error) throw new Error(res.error);

      setTextDescription(res.data || '');
      toast({ title: "Descrizione aggiornata", description: "Il testo è stato allineato con la struttura della regola." });
    } catch (e: any) {
      toast({ title: "Errore", description: e.message || "Errore aggiornamento descrizione", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const getStarted = !analysisResult && !isLoading;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1">
        <div className="container mx-auto flex flex-col flex-1 gap-8 px-4 py-8 md:px-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Crea una Nuova Regola</CardTitle>
                  <CardDescription>
                    Descrivi un processo per generare una regola decisionale.
                    <span className="flex items-center gap-2 mt-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs font-medium"
                        onClick={handleProviderToggle}
                      >
                        {aiProvider === 'claude-cli' ? '🤖 Claude CLI' : '🌐 OpenRouter'}
                      </Button>
                      <Popover open={modelSelectorOpen} onOpenChange={setModelSelectorOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs font-mono gap-1">
                            {isSavingModel ? 'Salvando...' : (availableModels.find(m => m.id === currentModel)?.name || currentModel)}
                            <ChevronsUpDown className="h-2.5 w-2.5 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
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
                                    className="flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Check className={cn("h-3 w-3 shrink-0", currentModel === m.id ? "opacity-100" : "opacity-0")} />
                                      <span className="truncate text-xs">{m.name}</span>
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
                    </span>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant={isRecording ? 'destructive' : 'ghost'} size="sm" onClick={toggleRecording} className="shrink-0">
                          {isRecording ? <MicOff className="mr-2 h-4 w-4 animate-pulse" /> : <Mic className="mr-2 h-4 w-4" />}
                          {isRecording ? 'Registrando...' : ''}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{isRecording ? 'Ferma registrazione' : 'Avvia registrazione'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button variant="ghost" size="sm" onClick={handleSetExample} className="shrink-0">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Esempio AI
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4">
                  <Textarea
                    placeholder="Ad esempio: 'Se un cliente ha un account premium e il suo acquisto supera i 50€, ottiene la spedizione gratuita...'"
                    className="min-h-[120px] resize-y"
                    value={textDescription}
                    onChange={(e) => setTextDescription(e.target.value)}
                    disabled={isLoading}
                  />
                  {!isSpeechSupported && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
                      <AlertCircle className="h-4 w-4" />
                      <p>Riconoscimento vocale non supportato dal browser.</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className={`flex-1 ${analysisResult ? "border-[#ff2800] text-[#ff2800] hover:bg-red-50 hover:text-[#ff2800]" : ""}`}
                      variant={analysisResult ? "outline" : "default"}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {analysisResult ? 'Sovrascrivendo...' : 'Analizzando...'}
                        </>
                      ) : (
                        analysisResult ? (
                          <>
                            ⚠️ Sovrascrivi Regola
                          </>
                        ) : 'Analizza e Salva'
                      )}
                    </Button>

                    {analysisResult && (
                      <Button type="button" variant="secondary" onClick={handleUpdateDescription} disabled={isLoading} title="Aggiorna la descrizione basandosi sulla regola attuale">
                        {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Sync Testo
                      </Button>
                    )}
                  </div>
                </div>
              </form>

              {/* Excel to Pipeline Section */}
              {excelFiles.length > 0 && (
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">Oppure seleziona un file Excel per generare una Pipeline</span>
                  </div>
                  <Select
                    value={selectedExcelFile}
                    onValueChange={(value) => handleExcelAnalyze(value)}
                    disabled={isLoading || isAnalyzingExcel}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona un file Excel dalla repository..." />
                    </SelectTrigger>
                    <SelectContent>
                      {excelFiles.map((file) => (
                        <SelectItem key={file.name} value={file.name}>
                          <span className="flex items-center gap-2">
                            <FileSpreadsheet className="h-3 w-3 text-emerald-600" />
                            {file.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isAnalyzingExcel && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analizzando il file Excel...
                    </div>
                  )}
                  {excelAnalysis && (
                    <>
                      <ExcelAnalysisSummary analysis={excelAnalysis} />
                      {connectors.length > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Database className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium">Connettore DB (per query SQL reali)</span>
                          </div>
                          <Select
                            value={selectedConnectorId}
                            onValueChange={setSelectedConnectorId}
                            disabled={isLoading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona connettore database..." />
                            </SelectTrigger>
                            <SelectContent>
                              {connectors.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  <span className="flex items-center gap-2">
                                    <Database className="h-3 w-3 text-blue-600" />
                                    {c.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!selectedConnectorId && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Senza connettore, le query SQL saranno generate con nomi colonne approssimativi.
                            </p>
                          )}
                        </div>
                      )}
                      <Button
                        onClick={handleExcelToPipeline}
                        disabled={isLoading}
                        className="mt-3 w-full"
                        variant="default"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Generando Pipeline...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Genera Pipeline da Excel
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            {isLoading && !analysisResult && (
              <Card>
                <CardHeader>
                  <Skeleton className="h-8 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-6">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-48 w-full" />
                </CardContent>
              </Card>
            )}

            {analysisResult && !isLoading && (
              <ResultsDisplay
                result={analysisResult}
                onDataRefresh={async () => {
                  if (analysisResult.id) {
                    const refreshed = await getTreeAction(analysisResult.id);
                    if (refreshed.data) {
                      setAnalysisResult(refreshed.data);
                    }
                  }
                }}
              />
            )}

            {getStarted && (
              <div className="flex h-full min-h-[500px] flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card p-8 text-center">
                <BotMessageSquare className="h-16 w-16 text-muted-foreground" />
                <h2 className="mt-6 text-xl font-semibold">Inizia il processo</h2>
                <p className="mt-2 text-muted-foreground">
                  Descrivi un processo, usa la voce o un esempio AI per generare e salvare una nuova regola decisionale.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="border-t">
        <div className="container mx-auto flex h-14 items-center justify-center px-4 md:px-6">
          <p className="text-sm text-muted-foreground">FridAI &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}



