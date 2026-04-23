# Registro dei Sistemi di Intelligenza Artificiale — EU AI Act Art. 51

**Applicazione**: FridAI (LikeAiSaid)
**Organizzazione**: [Nome Azienda]
**Data ultima revisione**: 2026-04-23
**Responsabile AI**: [Da nominare]
**Versione documento**: 1.0

---

## Indice

1. [Panoramica dell'applicazione](#1-panoramica-dellapplicazione)
2. [Infrastruttura AI comune](#2-infrastruttura-ai-comune)
3. [Registro dei sistemi AI](#3-registro-dei-sistemi-ai)
   - 3.1 [SQL Agent](#31-sql-agent)
   - 3.2 [Python Agent](#32-python-agent)
   - 3.3 [Super Agent](#33-super-agent)
   - 3.4 [Generatore Albero Decisionale](#34-generatore-albero-decisionale)
   - 3.5 [Estrattore Variabili](#35-estrattore-variabili)
   - 3.6 [DetAI — Assistente Q&A](#36-detai--assistente-qa)
   - 3.7 [Diagnosi Problemi](#37-diagnosi-problemi)
   - 3.8 [Lead Generator](#38-lead-generator)
   - 3.9 [Report Generator](#39-report-generator)
4. [Riepilogo classificazione rischio](#4-riepilogo-classificazione-rischio)
5. [Misure trasversali di conformita](#5-misure-trasversali-di-conformità)
6. [Piano di revisione](#6-piano-di-revisione)

---

## 1. Panoramica dell'applicazione

FridAI e un Business Rules Engine che consente agli utenti di creare alberi decisionali a partire da linguaggio naturale, navigarli interattivamente con assistenza AI, ed eseguire analisi dati tramite agenti AI specializzati (SQL, Python, Super Agent).

L'applicazione opera in contesto B2B con isolamento multi-tenant per azienda (`companyId`). Tutti i dati sono segregati a livello di sessione JWT.

---

## 2. Infrastruttura AI comune

### Modelli utilizzati

| Modello | Fornitore | Accesso tramite |
|---------|-----------|-----------------|
| `google/gemini-2.0-flash-001` | Google (DeepMind) | OpenRouter API |
| Modelli configurabili dall'utente | Google / Anthropic / OpenAI / Meta / altri | OpenRouter API |
| `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5` | Anthropic | Claude CLI (alternativa) |

Il modello predefinito e `google/gemini-2.0-flash-001` (definito in `src/ai/ai-client.ts`). Gli utenti possono selezionare modelli alternativi tramite le impostazioni OpenRouter.

### Routing modelli

Tutti i modelli transitano attraverso OpenRouter (`https://openrouter.ai/api/v1`), che funge da gateway unificato. In alternativa, il provider Claude CLI comunica direttamente con i modelli Anthropic.

### Logging centralizzato (Art. 12 AI Act)

Il modulo `src/lib/ai-audit.ts` implementa il logging strutturato di ogni decisione AI:

| Campo | Descrizione |
|-------|-------------|
| `timestamp` | Momento della decisione |
| `userId` | Identificativo utente (anonimizzato) |
| `companyId` | Tenant aziendale |
| `flowName` | Nome del flusso AI (es. `sql-agent`, `python-agent`, `detai`) |
| `model` | Modello utilizzato |
| `promptTokens` / `completionTokens` | Consumo token |
| `durationMs` | Latenza della risposta |
| `inputSummary` | Prime 200 caratteri dell'input (con redazione PII) |
| `outputSummary` | Prime 200 caratteri dell'output |
| `action` | Tipo: `generated`, `executed`, `rejected`, `modified` |
| `metadata` | Dati contestuali (nodeId, connectorId, provider) |

I log sono scritti in formato JSONL nel file `logs/ai-decisions.jsonl`, compatibile con sistemi SIEM per analisi e audit.

### Protezione PII (GDPR)

Il modulo `src/lib/pii-redact.ts` effettua redazione automatica di:
- Indirizzi email
- Numeri di telefono
- Codici fiscali

La redazione avviene sia in ingresso (prima dell'invio al modello) sia in uscita (nei log di audit).

### Rate limiting

Tutti gli endpoint AI sono protetti da rate limiting: 60 richieste streaming per minuto per utente, per prevenire abusi e costi incontrollati.

### Circuit breaker

Le chiamate a OpenRouter sono protette da circuit breaker (`src/lib/circuit-breaker.ts`) che interrompe le richieste in caso di errori ripetuti dal provider.

---

## 3. Registro dei sistemi AI

---

### 3.1 SQL Agent

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | SQL Agent |
| **Identificativo** | `sql-agent-flow` |
| **File sorgente** | `src/ai/flows/sql-agent-flow.ts`, `src/app/api/agents/chat-stream/route.ts` |
| **Descrizione** | Agente AI che genera, testa e corregge query SQL in modo autonomo. Esplora lo schema del database, testa le query prima di proporle, e corregge automaticamente gli errori. Supporta esplorazione cross-albero/pipeline per trovare pattern SQL esistenti. |
| **Classificazione rischio** | **Limitato** — Il sistema genera query SQL che operano su dati aziendali. Le query vengono sempre testate prima dell'esecuzione e l'utente mantiene il controllo finale sull'esecuzione. Non prende decisioni autonome con impatto su persone fisiche. Il rischio principale e l'accesso non autorizzato ai dati, mitigato dall'isolamento multi-tenant e dalla redazione PII. |
| **Modelli utilizzati** | Configurabile dall'utente, default `google/gemini-2.0-flash-001` via OpenRouter. Alternativa: modelli Claude via Claude CLI. |
| **Fornitore modello** | Google (default), Anthropic, OpenAI, Meta (configurabile) |
| **Dati di input** | Messaggio utente in linguaggio naturale; schema del database (tabelle, colonne, tipi); dati di esempio (prime righe, con redazione PII); cronologia conversazione (ultime 10 interazioni); query SQL esistenti da nodi fratelli e altri alberi/pipeline; Knowledge Base aziendale. |
| **Dati di output** | Query SQL generata e testata; messaggio esplicativo in italiano; indicazione di nodi consultati; metriche di utilizzo token. |
| **Supervisione umana** | L'utente deve esplicitamente avviare l'agente con una richiesta; la query generata e presentata all'utente prima dell'esecuzione nel nodo; l'utente puo modificare o rifiutare la query proposta; il sistema non esegue query di scrittura (INSERT/UPDATE/DELETE) senza azione esplicita dell'utente. |
| **Trasparenza** | L'interfaccia identifica chiaramente il pannello come "Agente AI SQL"; il modello in uso e indicato nel prompt di sistema; la risposta include i nodi consultati come fonte di ispirazione; la cronologia delle interazioni e visibile all'utente. |
| **Logging** | Ogni interazione e registrata via `logAiDecision()` con: `flowName: 'sql-agent'`, modello, token usati, durata, riassunto input/output con PII redatto. Log scritti in `logs/ai-decisions.jsonl`. Conversazione persistita nel modello `AgentConversation`. |
| **Rischi identificati** | 1. **Esposizione dati sensibili**: le query potrebbero restituire dati personali dal database aziendale. 2. **SQL injection**: un prompt malevolo potrebbe tentare di generare query distruttive. 3. **Hallucination**: il modello potrebbe generare query con nomi tabella/colonna inesistenti. 4. **Costi incontrollati**: loop di tool call con alto consumo di token. |
| **Mitigazioni** | 1. Redazione PII automatica prima dell'invio al modello (`maybeRedact`). 2. Le query vengono eseguite in modalita preview/read-only (`executeSqlPreviewAction`). 3. Test obbligatorio della query prima della presentazione all'utente. 4. Limite massimo di 15 round nel loop agente (25 in modalita streaming). 5. Rate limiting (60 req/min per utente). 6. Isolamento dati per `companyId`. 7. Timeout 90 secondi sulle richieste streaming. |

---

### 3.2 Python Agent

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Python Agent |
| **Identificativo** | `python-agent-flow` |
| **File sorgente** | `src/ai/flows/python-agent-flow.ts`, `src/app/api/agents/chat-stream/route.ts` |
| **Descrizione** | Agente AI che genera codice Python per analisi dati, visualizzazioni (Plotly), interfacce HTML interattive e operazioni CRUD su database. Supporta integrazione con API esterne (HubSpot, Lemlist) tramite connettori configurati. |
| **Classificazione rischio** | **Limitato** — Il sistema genera ed esegue codice Python in un ambiente sandbox (backend Flask separato). Il codice puo leggere e scrivere dati nel database aziendale tramite funzioni controllate (`query_db`, `execute_db`, `saveToDb`). Il rischio e mitigato dalla sandbox di esecuzione e dall'approvazione implicita dell'utente che avvia l'anteprima. |
| **Modelli utilizzati** | Configurabile dall'utente, default `google/gemini-2.0-flash-001` via OpenRouter. Alternativa: modelli Claude via Claude CLI. |
| **Fornitore modello** | Google (default), Anthropic, OpenAI, Meta (configurabile) |
| **Dati di input** | Messaggio utente; codice Python corrente del nodo; schema tabelle e dati di esempio; cronologia conversazione; documenti selezionati dall'utente (Excel, CSV, JSON, XBRL); variabili d'ambiente da connettori (token API); Knowledge Base aziendale. |
| **Dati di output** | Codice Python completo (analisi, grafici Plotly, HTML interattivo); messaggio esplicativo in italiano; nodi consultati; metriche token. |
| **Supervisione umana** | L'utente avvia l'agente con una richiesta specifica; il codice generato e visibile e modificabile nel nodo; l'utente preme esplicitamente "Esegui anteprima" per eseguire il codice; le operazioni di scrittura DB (saveToDb/insertToDb/deleteFromDb) dall'HTML richiedono azione esplicita dell'utente (click su bottone "Salva"). |
| **Trasparenza** | Pannello identificato come "Agente AI Python"; modello dichiarato; cronologia visibile; il codice sorgente generato e sempre ispezionabile dall'utente; risultati di test visibili nella tab Debug. |
| **Logging** | `logAiDecision()` con `flowName: 'python-agent'`. Conversazione persistita in `AgentConversation`. Log di esecuzione Python nel backend Flask. |
| **Rischi identificati** | 1. **Esecuzione codice arbitrario**: il codice Python potrebbe contenere istruzioni dannose. 2. **Accesso a dati sensibili**: `query_db()` e `execute_db()` accedono direttamente al database. 3. **Scrittura non autorizzata**: `execute_db()` puo modificare dati nel DB. 4. **Token API esposti**: i token dei connettori sono accessibili come variabili d'ambiente nel runtime Python. 5. **Dati PII nelle visualizzazioni HTML**: grafici e tabelle potrebbero mostrare dati personali. |
| **Mitigazioni** | 1. Esecuzione in backend Flask separato (sandbox). 2. Divieto esplicito nel prompt di scrivere file su disco. 3. Le funzioni `saveToDb`/`insertToDb`/`deleteFromDb` richiedono azione utente dall'interfaccia HTML. 4. Divieto di dati hardcoded nel codice. 5. Test obbligatorio con `pyTestCode` prima della presentazione. 6. Rate limiting e timeout. 7. I token API sono iniettati dal connettore, non hardcoded nel codice. |

---

### 3.3 Super Agent

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Super Agent (FridAI) |
| **Identificativo** | `super-agent-flow` |
| **File sorgente** | `src/ai/flows/super-agent-flow.ts` |
| **Descrizione** | Agente orchestratore che combina capacita SQL, Python, ricerca nella Knowledge Base, esplorazione alberi/pipeline e creazione widget. Opera come assistente conversazionale per analisi dati aziendali complesse, con capacita di creare alberi decisionali di tipo PIPELINE pronti all'uso. |
| **Classificazione rischio** | **Limitato** — Orchestratore che combina i sottosistemi SQL e Python. Ha accesso piu ampio (tutti gli alberi e pipeline della company), ma non prende decisioni autonome con impatto diretto su persone fisiche. Il rischio principale e la complessita della catena di tool call (fino a 30 round). |
| **Modelli utilizzati** | Configurabile dall'utente via OpenRouter. |
| **Fornitore modello** | Google, Anthropic, OpenAI, Meta (configurabile) |
| **Dati di input** | Cronologia conversazione completa (ultimi 20 messaggi); companyId; elenco alberi/pipeline disponibili; risultati delle ricerche nella Knowledge Base; risultati di query SQL e codice Python eseguito durante la sessione. |
| **Dati di output** | Risposte testuali con dati (tabelle markdown, grafici Recharts inline); alberi PIPELINE creati (nodi SQL + Python + Grafico); entry nella Knowledge Base; nodi consultati. |
| **Supervisione umana** | Interazione conversazionale: l'utente guida l'agente con domande; l'utente conferma o corregge i risultati; la creazione di widget/alberi richiede conferma esplicita; le query SQL vengono eseguite in modalita preview. |
| **Trasparenza** | Interfaccia chat identificata come "FridAI"; le fonti dei dati sono citate (nome albero, tabella, database); i nodi consultati sono tracciati e visibili; i grafici mostrano i dati originali. |
| **Logging** | Log non diretto (il Super Agent utilizza i tool SQL/Python che loggano individualmente). La conversazione e mantenuta nel contesto della sessione. Redazione PII sulle query SQL eseguite (`maybeRedact`). |
| **Rischi identificati** | 1. **Catena di errori**: errori in una tool call possono propagarsi nelle successive. 2. **Consumo token elevato**: fino a 30 round di tool call. 3. **Accesso trasversale**: accede a tutti gli alberi e pipeline della company. 4. **Creazione automatica di asset**: puo creare alberi PIPELINE senza approvazione esplicita granulare. |
| **Mitigazioni** | 1. Limite massimo di 30 round. 2. Redazione PII su tutti i risultati SQL. 3. L'agente propone all'utente prima di creare widget. 4. Rate limiting e autenticazione. 5. Isolamento per companyId. 6. Retry automatico con wait in caso di rate limiting (429). |

---

### 3.4 Generatore Albero Decisionale

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Generatore Albero Decisionale |
| **Identificativo** | `generate-decision-tree` |
| **File sorgente** | `src/ai/flows/generate-decision-tree.ts` |
| **Descrizione** | Genera un albero decisionale strutturato (JSON) e la sua versione in linguaggio naturale a partire da una descrizione testuale di un processo e da una tabella di variabili estratte. Produce anche uno script di domande per la navigazione guidata. |
| **Classificazione rischio** | **Minimo** — Il sistema genera una struttura dati (albero decisionale) a partire da una descrizione fornita dall'utente. Non accede a dati personali, non prende decisioni autonome, e l'output e sempre revisionabile e modificabile dall'utente prima dell'utilizzo. |
| **Modelli utilizzati** | `google/gemini-2.0-flash-001` (default) via OpenRouter, tramite Vercel AI SDK (`generateObject`). |
| **Fornitore modello** | Google (DeepMind) |
| **Dati di input** | Descrizione testuale del processo aziendale in linguaggio naturale; tabella di variabili con i rispettivi valori possibili (output di `extract-variables`). |
| **Dati di output** | Albero decisionale in JSON (nodi con domande, opzioni e decisioni); versione in linguaggio naturale dell'albero; script di domande per guida interattiva. |
| **Supervisione umana** | L'utente fornisce il testo sorgente; l'albero generato e presentato in un editor visuale (XYFlow) dove l'utente puo modificare nodi, aggiungere opzioni, eliminare rami; l'utente deve salvare esplicitamente l'albero; fino a 3 tentativi automatici in caso di JSON non valido. |
| **Trasparenza** | L'interfaccia indica chiaramente che l'albero e "generato dall'AI"; l'utente vede sia la versione JSON sia quella in linguaggio naturale; ogni nodo e ispezionabile e modificabile. |
| **Logging** | Input redatto tramite `maybeRedact` prima dell'invio al modello. Nessun logging specifico tramite `ai-audit.ts` (da considerare per futura implementazione). |
| **Rischi identificati** | 1. **Albero incompleto o logicamente errato**: il modello potrebbe generare percorsi decisionali con gap logici. 2. **JSON non parsabile**: il modello potrebbe restituire JSON malformato. |
| **Mitigazioni** | 1. Validazione obbligatoria del JSON generato (`JSON.parse`). 2. Fino a 3 tentativi automatici in caso di errore. 3. Schema Zod per la validazione strutturale dell'output (`generateObject`). 4. Editor visuale per revisione umana prima del salvataggio. 5. Redazione PII sull'input. |

---

### 3.5 Estrattore Variabili

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Estrattore Variabili |
| **Identificativo** | `extract-variables` |
| **File sorgente** | `src/ai/flows/extract-variables.ts` |
| **Descrizione** | Analizza un testo in linguaggio naturale che descrive un processo e ne estrae le variabili chiave (fattori decisionali) con i relativi valori possibili, tipi e abbreviazioni. E il primo passo nella creazione di un albero decisionale. |
| **Classificazione rischio** | **Minimo** — Il sistema effettua solo estrazione di entita (variabili e valori) da testo fornito dall'utente. Non accede a database, non prende decisioni, e l'output e sempre revisionabile. Nessun impatto su persone fisiche. |
| **Modelli utilizzati** | `google/gemini-2.0-flash-001` (default) via OpenRouter, tramite Vercel AI SDK (`generateObject`). |
| **Fornitore modello** | Google (DeepMind) |
| **Dati di input** | Testo descrittivo in linguaggio naturale di un processo aziendale. |
| **Dati di output** | Array strutturato di variabili, ciascuna con: nome, tipo (`boolean`, `enumeration`, `numeric`, `text`), valori possibili con abbreviazioni. ID univoci generati lato server (`nanoid`). |
| **Supervisione umana** | L'utente fornisce il testo sorgente; le variabili estratte sono presentate in un'interfaccia dove l'utente puo modificarle, aggiungerne di nuove o rimuoverne prima di procedere alla generazione dell'albero. |
| **Trasparenza** | L'interfaccia indica che le variabili sono "estratte dall'AI"; l'utente vede e modifica il risultato prima dell'uso successivo. |
| **Logging** | Input redatto tramite `maybeRedact`. Nessun logging specifico via `ai-audit.ts`. |
| **Rischi identificati** | 1. **Variabili mancanti**: il modello potrebbe non identificare tutte le variabili rilevanti. 2. **Variabili irrilevanti**: inclusione di fattori che non sono vere variabili decisionali. |
| **Mitigazioni** | 1. Regole esplicite nel prompt per scartare variabili generiche. 2. Validazione tramite schema Zod. 3. Revisione umana obbligatoria prima dell'uso. 4. Prompt con esempi concreti per guidare il modello. |

---

### 3.6 DetAI — Assistente Q&A

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | DetAI — Assistente Q&A |
| **Identificativo** | `detai-flow` |
| **File sorgente** | `src/ai/flows/detai-flow.ts` |
| **Descrizione** | Chatbot conversazionale che risponde alle domande degli utenti cercando informazioni nel database degli alberi decisionali. Puo cercare proattivamente procedure e regole aziendali e correggere affermazioni errate dell'utente basandosi sui dati trovati. |
| **Classificazione rischio** | **Limitato** — Il sistema fornisce informazioni basate sugli alberi decisionali aziendali. Potrebbe influenzare decisioni operative dell'utente. Il rischio e mitigato dall'obbligo di attribuzione delle fonti e dalla possibilita dell'utente di verificare le informazioni. |
| **Modelli utilizzati** | `google/gemini-2.0-flash-001` (default) via OpenRouter, tramite Vercel AI SDK (`generateText` con tool). |
| **Fornitore modello** | Google (DeepMind) |
| **Dati di input** | Cronologia conversazione; query di ricerca derivata dalla domanda dell'utente. |
| **Dati di output** | Risposta testuale in italiano con attribuzione delle fonti (tag `[Fonte: ID] ... [Fine Fonte]`); informazioni in grassetto quando provenienti dal database. |
| **Supervisione umana** | Interazione conversazionale: l'utente pone domande e valuta le risposte; le fonti sono indicate esplicitamente con ID per verifica; limite di 10 step massimi per evitare loop. |
| **Trasparenza** | Interfaccia identificata come "detAI"; ogni informazione dal database e attribuita alla fonte specifica con ID; le risposte distinguono visivamente (grassetto) i dati dal database dalle considerazioni generali dell'AI; se non trova informazioni, lo dichiara esplicitamente. |
| **Logging** | Nessun logging specifico via `ai-audit.ts` (da considerare per futura implementazione). Conversazione mantenuta lato client. |
| **Rischi identificati** | 1. **Informazioni errate**: il modello potrebbe interpretare male i dati degli alberi decisionali. 2. **Correzione inappropriata**: il sistema potrebbe "correggere" l'utente basandosi su dati non aggiornati. 3. **Mancata ricerca**: il modello potrebbe rispondere senza consultare il database. |
| **Mitigazioni** | 1. Regola nel prompt di cercare SEMPRE nel database prima di rispondere. 2. Obbligo di attribuzione delle fonti con tag strutturati. 3. Istruzione di dichiarare onestamente quando non trova informazioni. 4. Limite step (`stepCountIs(10)`). 5. Tool `searchDecisionTrees` con accesso read-only. |

---

### 3.7 Diagnosi Problemi

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Diagnosi Problemi |
| **Identificativo** | `diagnose-problem` |
| **File sorgente** | `src/ai/flows/diagnose-problem.ts` |
| **Descrizione** | Sistema di diagnosi interattivo che guida l'utente attraverso un albero decisionale per identificare la causa di un problema e proporre la soluzione corretta. Opera in due fasi: identificazione dell'albero corretto e navigazione nodo per nodo. |
| **Classificazione rischio** | **Limitato** — Il sistema guida l'utente attraverso procedure di troubleshooting predefinite. Le decisioni finali sono determinate dall'albero decisionale (creato da un umano), non generate liberamente dal modello. Il rischio e che una navigazione errata porti a una diagnosi sbagliata. |
| **Modelli utilizzati** | `google/gemini-2.0-flash-001` (default) via OpenRouter, tramite Vercel AI SDK (`generateObject`). |
| **Fornitore modello** | Google (DeepMind) |
| **Dati di input** | Descrizione del problema dall'utente; libreria completa degli alberi decisionali disponibili (nome, descrizione, JSON); cronologia domande/risposte; ultima risposta dell'utente. |
| **Dati di output** | Prossima domanda dall'albero decisionale con opzioni di risposta; oppure decisione finale (diagnosi); nome dell'albero identificato; ID dei nodi correnti; media, link e trigger allegati ai nodi. |
| **Supervisione umana** | L'utente guida la navigazione scegliendo tra le opzioni proposte; il sistema chiede almeno 4 domande di chiarimento prima di identificare l'albero; l'utente puo riformulare il problema in qualsiasi momento; la decisione finale e quella predefinita nell'albero (non generata dal modello). |
| **Trasparenza** | Interfaccia di diagnosi chiaramente identificata; le opzioni provengono direttamente dall'albero decisionale; il nome dell'albero identificato e comunicato all'utente; media e allegati del nodo sono mostrati. |
| **Logging** | Input redatto tramite `maybeRedact`. Nessun logging specifico via `ai-audit.ts`. |
| **Rischi identificati** | 1. **Identificazione albero errata**: il modello potrebbe selezionare l'albero sbagliato. 2. **Navigazione errata**: il modello potrebbe non seguire correttamente la struttura JSON dell'albero. 3. **Diagnosi prematura**: saltare domande importanti. |
| **Mitigazioni** | 1. Obbligo di almeno 4 domande di chiarimento prima dell'identificazione. 2. L'output e validato tramite schema Zod. 3. I `nodeIds` nell'output consentono la verifica della navigazione. 4. L'albero decisionale e creato e validato da un umano. 5. Redazione PII sull'input. |

---

### 3.8 Lead Generator

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Lead Generator (LeadAI) |
| **Identificativo** | `lead-generator-flow` |
| **File sorgente** | `src/ai/flows/lead-generator-flow.ts` |
| **Descrizione** | Agente autonomo per la ricerca e l'arricchimento di contatti commerciali B2B. Integra molteplici fonti dati (Apollo, Hunter, SerpApi, Apify, Firecrawl, Google Maps, Vibe Prospect) e un browser Chromium headless per navigazione web. Cerca aziende e persone di contatto, arricchisce i dati con email personali verificate e profili LinkedIn, e salva i lead nel database. |
| **Classificazione rischio** | **Alto** — Questo sistema raccoglie, elabora e salva dati personali (nomi, email, numeri di telefono, profili LinkedIn, ruoli professionali) da fonti pubbliche e API di terze parti. Rientra nelle categorie di trattamento dati personali su larga scala. Richiede valutazione DPIA ai sensi del GDPR e conformita con le disposizioni dell'AI Act per sistemi ad alto rischio nell'ambito del trattamento dati personali per finalita commerciali. |
| **Modelli utilizzati** | Configurabile dall'utente via OpenRouter o Claude CLI. |
| **Fornitore modello** | Google, Anthropic, OpenAI, Meta (configurabile) |
| **Dati di input** | Messaggi dell'utente con criteri di ricerca (settore, geografia, ruoli target); API keys per servizi esterni (Apollo, Hunter, SerpApi, Apify, Vibe Prospect, Firecrawl); dati aziendali dell'utente (profilo, competenze — per personalizzazione email). |
| **Dati di output** | Lead strutturati con: nome completo, email personale (verificata), azienda, ruolo, telefono, profilo LinkedIn, sito web, settore, citta, dimensione azienda, fatturato (ultimi 3 anni), utile, note, indice di affidabilita (0-100); bozze email personalizzate; export CSV. |
| **Supervisione umana** | L'utente definisce i criteri di ricerca; i risultati sono presentati prima del salvataggio nel DB; l'utente puo esportare in CSV per revisione; le bozze email sono proposte ma non inviate automaticamente; l'utente puo eliminare o modificare i lead salvati. NOTA: il sistema opera in modo altamente autonomo durante la ricerca (fino a 30 tool call) con limitata visibilita intermedia. |
| **Trasparenza** | Interfaccia identificata come "LeadAI"; eventi di progresso in tempo reale (`ProgressEvent`) che mostrano la fase corrente (piano, esecuzione, scraping, arricchimento, verifica, salvataggio); screenshot del browser headless durante la navigazione; fonti dei dati indicate per ogni lead. |
| **Logging** | Conversazione persistita. Log delle API esterne chiamate. NOTA: il logging via `ai-audit.ts` non e attualmente implementato per questo flusso (raccomandazione: aggiungere). |
| **Rischi identificati** | 1. **Trattamento dati personali su larga scala**: raccolta sistematica di nomi, email, telefoni, profili social. 2. **Conformita GDPR**: base giuridica del trattamento (legittimo interesse vs consenso), diritti degli interessati, informativa. 3. **Profilazione**: il calcolo del `confidence` score costituisce profilazione automatizzata. 4. **Scraping non autorizzato**: il browser headless potrebbe violare i ToS di siti web. 5. **Email non sollecitate**: le bozze email generate potrebbero essere usate per spam. 6. **Accuratezza dati**: email o nomi errati potrebbero portare a comunicazioni a persone sbagliate. 7. **Costi API incontrollati**: chiamate multiple a servizi a pagamento. |
| **Mitigazioni** | 1. Filtraggio email generiche (info@, admin@, etc.) per qualita dei dati. 2. Verifica email con servizio dedicato (`verifyEmail`). 3. Deduplicazione contro lead gia esistenti nel DB (`getExistingLeadEmails`). 4. Rate limiting sulle API esterne (`time.sleep`). 5. L'utente definisce i criteri di ricerca e rivede i risultati. 6. Indice di affidabilita (`confidence`) per ogni lead. 7. **Raccomandazioni non ancora implementate**: DPIA formale, informativa privacy per i contatti raccolti, meccanismo di opt-out, retention policy per i lead, logging via ai-audit.ts. |

---

### 3.9 Report Generator

| Campo | Contenuto |
|-------|-----------|
| **Nome sistema** | Report Generator |
| **Identificativo** | `report-flow` |
| **File sorgente** | `src/ai/flows/report-flow.ts` |
| **Descrizione** | Pipeline di generazione report che aggrega dati di vendita simulati, identifica prodotti migliori/peggiori e produce dati formattati per grafici. Attualmente utilizza dati mock (`mockSalesData`), non dati reali e non chiama modelli AI. |
| **Classificazione rischio** | **Minimo** — Il sistema effettua aggregazioni statistiche su dati mock senza coinvolgimento di modelli AI generativi. Non tratta dati personali e non prende decisioni autonome. E una pipeline di trasformazione dati deterministica. |
| **Modelli utilizzati** | Nessuno (pipeline deterministica senza chiamate a modelli AI). |
| **Fornitore modello** | N/A |
| **Dati di input** | Dati di vendita mock (`mockSalesData` da `src/lib/data.ts`). |
| **Dati di output** | Prodotto con vendite massime e minime; tabella aggregata per prodotto; dati formattati per grafici a barre. |
| **Supervisione umana** | L'utente avvia la generazione del report; i risultati sono presentati come tabella e grafico interattivo. |
| **Trasparenza** | I dati sono presentati come report statistico senza indicazione di AI generativa (in quanto non viene utilizzata). |
| **Logging** | Nessuno. |
| **Rischi identificati** | Rischi minimi. Il sistema usa solo dati mock. Se in futuro venissero usati dati reali, andrebbero aggiunte le protezioni PII. |
| **Mitigazioni** | Schema Zod per validazione strutturale dell'output. Pipeline deterministica e verificabile. |

---

## 4. Riepilogo classificazione rischio

| Sistema | Classificazione | Justification |
|---------|----------------|---------------|
| SQL Agent | Limitato | Genera query su dati aziendali, esecuzione controllata dall'utente |
| Python Agent | Limitato | Genera ed esegue codice in sandbox, operazioni DB controllate |
| Super Agent | Limitato | Orchestratore con accesso ampio ma supervisione conversazionale |
| Generatore Albero | Minimo | Genera strutture dati, nessun accesso a dati personali |
| Estrattore Variabili | Minimo | Estrazione entita da testo, output revisionabile |
| DetAI Q&A | Limitato | Fornisce informazioni da database, potrebbe influenzare decisioni |
| Diagnosi Problemi | Limitato | Guida diagnostica, decisioni predefinite nell'albero |
| **Lead Generator** | **Alto** | **Raccolta e trattamento sistematico di dati personali** |
| Report Generator | Minimo | Pipeline deterministica su dati mock, nessun modello AI |

---

## 5. Misure trasversali di conformita

### 5.1 Obblighi di trasparenza (Art. 52)

- Tutti i sistemi AI sono identificati nell'interfaccia utente con etichette esplicite ("Agente AI SQL", "Agente AI Python", "detAI", "LeadAI").
- Le risposte AI sono visivamente distinguibili dai dati di sistema.
- L'utente e informato quando interagisce con un sistema AI.

### 5.2 Gestione dei dati (Art. 10)

- Isolamento multi-tenant per `companyId` su tutti i dati.
- Redazione PII automatica sugli input inviati ai modelli (`pii-redact.ts`).
- I modelli AI non vengono addestrati sui dati degli utenti (utilizzo tramite API inference-only).

### 5.3 Registro delle attivita (Art. 12)

- Logging strutturato in `logs/ai-decisions.jsonl` per SQL Agent e Python Agent.
- Formato JSONL compatibile con sistemi SIEM.
- **Gap identificato**: DetAI, Diagnosi Problemi, Estrattore Variabili, Generatore Albero e Lead Generator non utilizzano ancora `ai-audit.ts`. Raccomandazione: estendere il logging a tutti i flussi.

### 5.4 Robustezza tecnica (Art. 15)

- Circuit breaker sulle chiamate API esterne.
- Rate limiting per utente (60 req/min).
- Timeout sulle richieste (90 secondi streaming, 120 secondi max duration).
- Limiti sui round di tool call (15-30 a seconda del flusso).
- Retry automatico con backoff esponenziale.

### 5.5 Sicurezza (Art. 15)

- Autenticazione obbligatoria (NextAuth.js) su tutti gli endpoint AI.
- Validazione input tramite schema Zod.
- CSP nonce per protezione XSS.
- Sanitizzazione SQL per prevenire injection.
- MFA/TOTP disponibile per utenti admin.

---

## 6. Piano di revisione

| Azione | Priorita | Scadenza |
|--------|----------|----------|
| Estendere `ai-audit.ts` a DetAI, Diagnosi, Estrattore, Generatore e Lead Generator | Alta | Q2 2026 |
| Completare DPIA per Lead Generator | Critica | Q2 2026 |
| Implementare informativa privacy per contatti raccolti da Lead Generator | Critica | Q2 2026 |
| Aggiungere meccanismo di opt-out per lead raccolti | Alta | Q3 2026 |
| Definire retention policy per dati dei lead | Alta | Q3 2026 |
| Nominare Responsabile AI (AI Officer) | Media | Q2 2026 |
| Audit esterno della classificazione rischio | Media | Q4 2026 |
| Revisione semestrale del presente registro | Media | Continua |
| Implementare dashboard di monitoraggio delle metriche AI | Bassa | Q4 2026 |

---

*Documento generato in conformita con il Regolamento (UE) 2024/1689 (AI Act), Articolo 51 — Registrazione dei sistemi di IA nella banca dati dell'UE.*
