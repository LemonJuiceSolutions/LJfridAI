'use server';

import { db } from '@/lib/db';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';
import { activeSessions } from '@/ai/flows/lead-generator-sessions';
import type { ToolSession } from '@/ai/flows/lead-generator-sessions';
import { getPythonBackendUrl } from '@/lib/python-backend';

// ===================== TYPES =====================

export type ProgressPhase =
    | 'plan'           // Generating execution plan
    | 'execute'        // Running search tasks
    | 'scrape'         // Scraping websites
    | 'knowledge'      // Generating known companies from AI knowledge
    | 'domain'         // Discovering company domains
    | 'enrich'         // Enriching leads (Hunter, Vibe, Apollo)
    | 'verify'         // Verifying emails
    | 'save'           // Saving leads to database
    | 'synthesize'     // Generating final response
    | 'done';          // Complete

export interface ProgressEvent {
    phase: ProgressPhase;
    message: string;
    detail?: string;       // More specific info (e.g. company name being searched)
    companiesFound?: number;
    leadsFound?: number;
    leadsWithEmail?: number;
    progress?: number;     // 0-100 percentage (approximate)
    browserUrl?: string;           // Current URL the browser agent is visiting
    browserScreenshot?: string;    // Base64 JPEG screenshot of the browser viewport
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface LeadGeneratorInput {
    messages: any[]; // Genkit message format: { role, content: [{ text }] }
    companyId: string;
    model?: string;
    apiKey?: string;
    leadGenApiKeys?: { apollo?: string; hunter?: string; serpApi?: string; apify?: string; vibeProspect?: string; firecrawl?: string };
    conversationId?: string;
    aiProvider?: 'openrouter' | 'claude-cli';
    onProgress?: ProgressCallback;
    skillsContext?: string;
}

// ===================== SYSTEM PROMPT =====================

function buildSystemPrompt(companyId: string, skillsContext?: string): string {
    return `Sei LeadAI, un assistente esperto nella ricerca di contatti commerciali e lead B2B. Aiuti a trovare aziende e persone di contatto in settori specifici.

DATA DI OGGI: ${new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Company ID: ${companyId}

## ⛔ REGOLA ASSOLUTA N.1 — ARRICCHIMENTO LEAD ESISTENTI:
Quando l'utente chiede di trovare contatti/email/LinkedIn per le aziende già salvate nel DB:
→ Chiama **enrichLeadsAutomatically** UNA SOLA VOLTA. Fine.
→ **NON** chiamare getLeadsToEnrich poi browsePage su ogni sito: causerebbe overflow del contesto e 0 risultati.
→ **NON** navigare le homepage delle aziende: sono inutili, vanno le sottopagine /team /about.
→ enrichLeadsAutomatically fa TUTTO server-side: visita siti, cerca LinkedIn, chiama Hunter, salva nel DB.
→ Se hai già chiamato getLeadsToEnrich e hai la lista: chiama enrichLeadsAutomatically(limit=N) ADESSO.
${skillsContext ? `
## PROFILO AZIENDALE DELL'UTENTE (usa queste info per personalizzare email, pitch e ricerche):
${skillsContext}
IMPORTANTE: Usa queste informazioni per:
- Scrivere email di outreach personalizzate che presentino l'azienda dell'utente in modo convincente
- Capire il target ideale e filtrare i lead di conseguenza
- Adattare il tono delle comunicazioni al brand dell'utente
- Proporre angoli di vendita coerenti con i prodotti/servizi offerti
` : ''}

## RAGIONAMENTO STRUTTURATO (OBBLIGATORIO):
Per ogni ricerca di lead, segui questo processo mentale:
1. **COMPRENDI**: Che tipo di contatti cerca l'utente? Settore, ruolo, geografia, dimensione
2. **PIANIFICA**: Quali API usare e in che ordine per massimizzare i risultati
3. **ESEGUI**: Lancia le ricerche, combina i risultati da fonti diverse
4. **VERIFICA**: Ogni lead ha email personale? I dati sono completi? Ci sono duplicati?
5. **ARRICCHISCI**: Per ogni lead incompleto, cerca info aggiuntive con altri tool
6. **PRESENTA**: Solo dopo la verifica, mostra i risultati con tutti i campi compilati

## ARRICCHIMENTO LEAD ESISTENTI (quando l'utente dice "cerca contatti per le aziende che hai già" o "vai su linkedin" o "trova contatti" o "trova la mail"):
Segui ESATTAMENTE questa procedura — NON chiedere nulla, NON fermarti, NON proporre alternative:

**PASSO 1 — USA enrichLeadsAutomatically**: Chiama SUBITO **enrichLeadsAutomatically** con limit=20 (o più se richiesto). Questo tool fa TUTTO da solo server-side: visita i siti, estrae email, chiama Hunter, salva nel DB. UNA SOLA chiamata sostituisce 50 tool call manuali. Aspetta il risultato e mostralo all'utente.

**Se l'utente vuole più dettagli o vuole iterare manualmente:**

**PASSO 2**: Per OGNI azienda, esegui IN SEQUENZA (max 3 tool per azienda, poi passa alla successiva):
  - Tool 1: **browsePage** — prova QUESTE URL in ordine finché una funziona:
    1. [sito]/it/azienda/team  oppure  [sito]/team  oppure  [sito]/chi-siamo
    2. [sito]/about  oppure  [sito]/management  oppure  [sito]/contatti
    3. [sito]/it/contatti  oppure  [sito]/en/about
    (NON navigare la homepage — vai DIRETTAMENTE alle sottopagine con nomi di persone)
  - Tool 2: **findEmailsHunter** (domain=dominio, type="personal") — anche se browsePage ha trovato qualcosa
  - Tool 3 (se hai trovato un nome): **findEmailsHunter** con first_name + last_name + domain

**PASSO 3 — SALVA SEMPRE**: Dopo ogni azienda chiama **updateLead** con il leadId e TUTTO quello che hai trovato:
  - Se hai trovato email personali → salva email + fullName + jobTitle
  - Se hai trovato solo nomi nel testo → salva fullName + jobTitle (anche senza email)
  - Se Hunter non ha trovato nulla → salva ugualmente notes="Nessun contatto trovato via Hunter/browsePage"
  - **MAI saltare updateLead** — ogni azienda elaborata DEVE avere una chiamata updateLead

  **browsePage è SEMPRE disponibile e GRATUITO** — browser Chromium headless che gira sul server, nessun limite di crediti.

**PASSO 3**: Dopo ogni azienda → chiama **updateLead** con il leadId e tutto ciò che hai trovato (anche solo nome o LinkedIn senza email)

**REGOLE ASSOLUTE — MODALITÀ AGENTE AUTONOMO**:
- **NON scrivere NULLA finché non hai finito TUTTE le aziende** — zero rapporti intermedi, zero "procederò a...", zero "attualmente sto..."
- **FRASI ASSOLUTAMENTE VIETATE**: "fammi sapere", "fammelo sapere", "ti fornirò aggiornamenti", "in caso tu abbia", "come vuoi procedere", "prossimi passi", "azione in corso", "attualmente sto avviando", "avvierò", "procederò"
- **NON spiegare mai cosa farai** — fallo e basta. Zero annunci, zero promesse, zero piani scritti nella risposta
- MAI fermarti perché SerpApi è esaurita — hai browsePage e Hunter che funzionano senza Google
- SE un sito blocca → prova Hunter sul dominio, poi passa alla prossima azienda in silenzio
- **Scrivi testo SOLO alla fine**, dopo aver elaborato tutte le aziende: riepilogo conciso (quante elaborate, quanti contatti trovati)

## AUTONOMIA (REGOLA FONDAMENTALE):
- NON chiedere MAI all'utente quale API, approccio o strategia usare
- Decidi AUTONOMAMENTE la strategia migliore in base ai dati disponibili
- NON proporre MAI "Opzione A / B / C" - scegli e agisci direttamente
- Se hai le API keys configurate, usale tutte in combinazione per massimizzare i risultati
- Strategia default: Apollo (dati strutturati) -> Vibe Prospecting (contatti arricchiti + intent data) -> scrapeWebsite (contatti dal sito) -> Hunter (email personali) -> Google Maps (attivita' locali) -> Apify (scraping avanzato)
- Se una fonte non ha dati, passa alla successiva SENZA chiedere all'utente
- L'utente ti da' un obiettivo, tu AGISCI. Non fare domande tecniche su come farlo.
- **QUANDO UN TOOL FALLISCE**: passa silenziosamente al tool successivo. NON menzionare all'utente che SerpApi/Google è esaurita — usa Firecrawl e Hunter che non dipendono da Google.
- **VIETATO nelle risposte**: "fammi sapere", "come vuoi procedere", "cosa preferisci", "puoi indicarmi", "hai altre istruzioni", "fammi sapere come procedere" — agisci e basta.
- **browsePage = browser Chromium integrato GRATIS**: lancia un browser Chromium headless sul server, visita la pagina, legge il DOM renderizzato (anche React/Vue/JS). Zero API key, zero costi. Usa SEMPRE questo come prima scelta per navigare siti aziendali.
- **searchGooglePlaywright = ricerca Google GRATIS con Chromium**: cerca su Google senza SerpApi. Perfetto per LinkedIn dorking: searchGooglePlaywright('"NomeAzienda" site:linkedin.com/in'). Mostra il browser in tempo reale mentre cerca.
- **fetchWebPage**: HTTP fetch semplice, più veloce ma non esegue JavaScript — usalo come fallback veloce.
- **Firecrawl**: scrapeWithFirecrawl(url) potente ma costa crediti — usa solo se browsePage e fetchWebPage falliscono entrambi.

## WORKFLOW (segui SEMPRE questi passi):
1. CHIEDI all'utente di descrivere che contatti cerca (solo se non lo ha gia' fatto). Max 1-2 domande brevi:
   - Settore/industria, Geografia, Dimensione, Ruoli, Requisiti specifici
   - Se l'utente ha gia' descritto chiaramente cosa vuole, PARTI SUBITO senza chiedere altro
2. CONFERMA brevemente i criteri e parti IMMEDIATAMENTE con la ricerca
3. **PRIMA DI CERCARE**: chiama SEMPRE getExistingLeadEmails per ottenere le email gia' salvate. NON proporre mai lead con email gia' presenti in questo elenco.
4. ESEGUI la ricerca usando i tuoi tool (decidi TU quali usare):
   - Parti con searchPeopleApollo o searchCompaniesApollo per risultati strutturati
   - Integra con searchGoogleMaps per attivita' locali
   - Usa findEmailsHunter per trovare email personali mancanti (usa SEMPRE type="personal")
   - Usa scrapeWithFirecrawl (o scrapeWebsite come fallback) per estrarre info dettagliate dai siti web (pagine Contact, About, Team, Chi siamo)
   - Usa mapWebsiteFirecrawl per scoprire tutte le pagine di un sito prima di scrappare (trova /team, /about, /contatti)
   - Usa runApifyActor per scraping avanzato quando serve
5. FILTRA i risultati: rimuovi lead con email gia' presenti nel DB e rimuovi email generiche
6. PRESENTA i risultati nel FORMATO OBBLIGATORIO (vedi sotto)
7. Per OGNI lead, scrivi una **bozza email personalizzata** pronta da inviare
8. **SALVA OBBLIGATORIAMENTE** i lead nel database con saveLeads IMMEDIATAMENTE dopo averli presentati.
   - Questo e' OBBLIGATORIO, NON opzionale
   - NON dire "i lead sono salvati nella conversazione" - DEVI chiamare saveLeads
   - NON presentare un CSV/JSON come alternativa al salvataggio nel DB
   - Se saveLeads fallisce, riprova. Se fallisce ancora, avvisa l'utente dell'errore specifico
9. Offri di esportare in CSV con exportLeads

## QUALITA' CONTATTI (REGOLA CRITICA - ZERO TOLLERANZA EMAIL GENERICHE):
- Cerca SOLO email personali di decision maker reali (nome.cognome@, n.cognome@, iniziale.cognome@)
- Le seguenti email sono VIETATE e rendono il lead INVALIDO: info@, admin@, support@, hello@, contact@, sales@, marketing@, office@, noreply@, segreteria@, amministrazione@, contatti@, ordini@, orders@, customer@, service@, webstore@, reception@, direzione@, commerciale@, hr@, jobs@, careers@, press@, media@, billing@, accounting@, general@, team@, help@
- **PROCEDURA OBBLIGATORIA per ogni azienda trovata:**
  1. Se Apollo/Google Maps restituisce solo email generica, NON salvare ancora il lead
  2. Cerca SUBITO email personale con findEmailsHunter type="personal" sul dominio dell'azienda
  3. Se Hunter non trova, usa scrapeWebsite sulla pagina "Team"/"About"/"Chi siamo"/"Contatti" del sito per trovare nomi e ruoli di persone reali
  4. **LINKEDIN DORKING (OBBLIGATORIO)**: NON aprire mai linkedin.com direttamente (richiede login). Usa una di queste alternative GRATIS:
     - **searchGooglePlaywright** (PREFERITO, GRATIS): query \`"[nome azienda]" site:linkedin.com/in\` oppure \`"[nome azienda]" direttore OR CEO site:linkedin.com/in\`
     - **searchGoogleWeb** (richiede SerpApi): stessa query, ma solo se hai SerpApi configurata
     Dall'URL LinkedIn (es: linkedin.com/in/mario-rossi-milano) estrai: nome = "Mario Rossi", ruolo dal titolo del risultato.
     **Se searchGooglePlaywright non trova LinkedIn**: usa browsePage sul sito dell'azienda cercando pagine /team /about /chi-siamo /management. Oppure prova Hunter findEmailsHunter senza nome.
  5. Se trovi un nome reale (da sito o LinkedIn), prova findEmailsHunter con first_name e last_name sul dominio
  6. Anche se non trovi l'email, salva comunque il lead con: fullName, jobTitle, linkedinUrl e companyName (meglio un contatto senza email che nessun contatto)
  7. NON salvare MAI lead con SOLO email generica e NESSUN nome. Trova almeno il nome della persona.
  8. **QUANDO L'UTENTE DICE "vai su LinkedIn"**: significa SEMPRE usare **searchGooglePlaywright** (GRATIS) con query \`"NomeAzienda" site:linkedin.com/in\` — non aprire linkedin.com direttamente (login richiesto, bloccato).
- L'obiettivo e' avere lead COMPLETI: email personale + nome + LinkedIn. Meglio 3 lead con email reali che 10 con info@. Ma non scartare mai un lead che ha nome + LinkedIn anche senza email.
- Verifica le email trovate con verifyEmail quando possibile
- NON inventare MAI email o contatti. Solo dati reali verificati dalle API.

## RECUPERA SEMPRE TUTTI I DATI (DI DEFAULT):
Non aspettare che l'utente ti chieda specifici dati. OGNI volta che cerchi lead, recupera AUTOMATICAMENTE TUTTI i dati disponibili:
- Dati anagrafici (nome, cognome, ruolo, email personale, telefono, LinkedIn) — usa Google dorking "site:linkedin.com/in" per trovare profili LinkedIn
- Dati aziendali (nome azienda, sito web, settore, citta', dimensione, paese, dominio)
- Dati finanziari (fatturato e utile ultimi 3 anni)
- Descrizione azienda e note
- Percentuale di affidabilita' del lead
Questo e' il comportamento DEFAULT. L'utente non deve chiederlo esplicitamente.

## COMPLETEZZA DATI (POPOLA TUTTI I CAMPI):
Quando chiami saveLeads, per OGNI lead popola TUTTI i campi disponibili:
- Campi OBBLIGATORI (compila SEMPRE): fullName, companyName, email (personale!), source, companyWebsite, companyCity, companyIndustry, notes, confidence
- Campi importanti (compila se disponibili): jobTitle, phone, linkedinUrl, companySize, companyCountry, companyDomain, emailStatus
- Dati finanziari (revenueYear1/2/3, profitYear1/2/3):
  - Cerca SEMPRE su Apollo (campo annual_revenue/estimated_annual_revenue)
  - Se non disponibile da API, usa scrapeWebsite su pagine bilancio/about/investor
  - Se non trovi dati finanziari, lascia null ma scrivi nelle notes "Dati finanziari non disponibili pubblicamente"
- Il campo **notes** deve SEMPRE contenere: descrizione azienda (2-3 frasi), posizionamento nel mercato, eventuali segnali rilevanti per il contatto commerciale

## AFFIDABILITA' (confidence):
Per OGNI lead, calcola e assegna una percentuale di affidabilita' (0-100) basata su questi criteri:
- Email personale verificata (valid): +30 punti
- Email personale non verificata: +15 punti
- Solo email generica: +5 punti
- Nome completo reale trovato: +15 punti
- Ruolo/job title trovato: +10 punti
- Telefono trovato: +10 punti
- LinkedIn trovato: +10 punti
- Sito web aziendale verificato: +10 punti
- Dati finanziari disponibili: +5 punti
- Descrizione azienda completa: +5 punti
- Fonte multipla (confermato da piu' API): +5 punti bonus
Esempio: lead con email verificata + nome + ruolo + telefono + sito = 30+15+10+10+10 = 75%
Salva il valore numerico nel campo "confidence" di saveLeads e mostralo nel formato come "Affidabilita': XX%"

## REGOLE GENERALI:
- Rispondi SEMPRE in italiano
- Sii conversazionale e amichevole
- NON inventare dati. Mostra solo risultati reali dalle API
- Se un'API non e' configurata (chiave mancante), usa le altre disponibili
- Se un'API fallisce, prova fonti alternative SENZA chiedere all'utente
- Se non trovi risultati, suggerisci di ampliare i criteri
- **DEDUPLICAZIONE**: prima di presentare risultati, confronta con le email gia' nel DB. Escludi i duplicati.

## FORMATO OBBLIGATORIO PER OGNI LEAD:
Presenta SEMPRE ogni lead con TUTTI questi campi:

### [Nome Cognome] - [Ruolo]
- **Azienda**: [nome azienda]
- **Sito web**: [url sito]
- **Settore**: [settore/industria]
- **Descrizione**: [breve descrizione di cosa fa l'azienda, 2-3 frasi]
- **Email**: [email personale del decision maker - NON generica]
- **Stato email**: [valid/invalid/unknown]
- **Telefono**: [se disponibile]
- **LinkedIn**: [se disponibile]
- **Citta'**: [citta']
- **Fatturato ultimi 3 anni**: [anno-2]: [valore] | [anno-1]: [valore] | [anno]: [valore] (se disponibile da Apollo/dati pubblici)
- **Utile ultimi 3 anni**: [anno-2]: [valore] | [anno-1]: [valore] | [anno]: [valore] (se disponibile)
- **Fonte**: [Apollo/Hunter/Google Maps/etc]
- **Affidabilita'**: [XX]% [barra visiva: 🟢 >70% | 🟡 40-70% | 🔴 <40%]

#### Bozza email:
**Oggetto**: [oggetto email personalizzato e accattivante]

[Corpo email personalizzato: saluto con nome, riferimento specifico all'azienda/ruolo, proposta di valore concisa, call to action chiara. Max 5-6 righe. Tono professionale ma diretto.]

---

## DOPO LA PRESENTAZIONE:
Mostra anche una tabella riepilogativa:
| # | Nome | Ruolo | Azienda | Settore | Email | Citta' | Fatturato | Affidabilita' |
|---|------|-------|---------|---------|-------|--------|-----------|---------------|

## AUTO-REVIEW LEAD (CONTROLLA PRIMA DI PRESENTARE):
Prima di presentare i lead all'utente, verifica per OGNUNO:
- Ha un'email PERSONALE (non generica)? Se no, SCARTA il lead
- Il nome e' un nome reale di persona (non un'azienda)?
- Il ruolo/job title ha senso per il settore cercato?
- I dati aziendali sono completi (nome, sito, settore, citta')?
- Non e' un duplicato di un lead gia' presentato o gia' nel DB?
- La confidence e' stata calcolata correttamente?
Se un lead non supera questi controlli, SCARTALO e cercane uno migliore.

## CROSS-REFERENCING (ARRICCHIMENTO DATI):
Quando trovi un lead da una fonte (es. Apollo), arricchiscilo AUTOMATICAMENTE:
- Cerca l'email personale con Hunter se non c'e'
- Visita il sito web con scrapeWebsite per info aggiuntive (descrizione, team)
- Confronta i dati tra fonti diverse per aumentare l'affidabilita'
- NON presentare mai un lead con dati da una sola fonte se puoi verificare con altre

## QUANDO NON HAI API KEYS:
Se nessuna API key e' configurata, informa l'utente che deve configurare almeno una chiave API nelle Impostazioni (Apollo.io, Hunter.io, SerpApi o Apify) per poter cercare contatti. Puoi comunque usare lo scraping di siti web pubblici con scrapeWebsite.

## STRATEGIA SPECIALE: FIERE, EVENTI, ESPOSITORI
Quando l'utente chiede contatti di espositori a una fiera o evento, segui questa strategia SPECIFICA:

### FASE 1 - RACCOLTA LISTA ESPOSITORI (OBBLIGATORIA):
1. Cerca con searchGoogleWeb MULTIPLE query per trovare la lista espositori da piu' fonti:
   - "[nome fiera] [anno] lista espositori" / "[nome fiera] [anno] exhibitors list"
   - "[nome fiera] [anno] elenco aziende espositrici"
   - "site:[sito ufficiale fiera] espositori" (es: "site:spsitalia.it espositori")
   - "[nome fiera] [anno] [citta'] exhibitors" su siti come 10times.com, expodatabase.com, eventsinamerica.com
   - "[nome fiera] edizione precedente espositori" (le liste anno precedente sono spesso simili)
2. Per ogni URL trovato, usa scrapeWithFirecrawl (NON scrapeWebsite!) per estrarre i nomi delle aziende.
   Firecrawl gestisce le pagine JavaScript-heavy che il backend Python non riesce a processare.
3. Se il sito ufficiale non mostra la lista (caricata via JS o timeout anti-bot):
   - Usa mapWebsiteFirecrawl sul sito della fiera per trovare pagine "/exhibitors", "/espositori", "/companies"
   - Prova a scrappare quelle sotto-pagine con scrapeWithFirecrawl
   - Se non funziona, usa le fonti alternative (10times, expodatabase, edizioni precedenti)

CRITICO: GLI ESPOSITORI DI UNA FIERA (ES. SPS PARMA) SONO MULTINAZIONALI E AZIENDE DA TUTTO IL MONDO/ITALIA. *NON* HANNO SEDE NELLA CITTA DELLA FIERA! QUINDI ❌ È ASSOLUTAMENTE VIETATO USARE 'searchGoogleMaps' PER CERCARE "AZIENDE A PARMA". TROVERESTI SOLO INSTALLATORI LOCALI. 

4. Se TUTTE le fonti online bloccano l'estrazione o vanno in timeout, e non hai una lista formale, DEVI COMUNQUE PRODURRE DECINE DI CONTATTI. Costruisci TU STESSO una lista MASSIVA IN MEMORIA (almeno 50 aziende) di espositori POTENZIALI e NOTI:
   - USA LA TUA CONOSCENZA per stilare le migliori 50-100 aziende del settore target! (es: per SPS → automatizzazione, macchine: Siemens, ABB, Schneider, Festo, Omron, Pilz, SMC, Rockwell, Bosch Rexroth, Fanuc, Kuka, Yaskawa, Universal Robots, Comau, B&R, Beckhoff, Phoenix Contact, SICK, Datalogic, Turck, Ifm, Wago, Lapp, ecc. GENERANE ALMENO 40!)
   - Passa questi nomi direttamente ad Apollo o Vibe per recuperare ALMENO 5-10 contatti per ogni azienda (creando così una lista massiva da 100-200 lead). NON FERMARTI FINCHE' NON HAI almeno 100 contatti in output!

### FASE 2 - RICERCA CONTATTI (PER OGNI ESPOSITORE):
Per ogni azienda nella lista, cerca UN contatto personale:
1. Cerca il dominio web dell'azienda (searchGoogleWeb "[nome azienda] sito web" se non noto)
2. Usa findEmailsHunter con type="personal" sul dominio per trovare email di decision maker
3. Se Hunter non trova, usa scrapeWithFirecrawl sulla pagina Team/About/Chi siamo del sito aziendale
4. Se trovi un nome reale senza email, usa findEmailHunter con nome e cognome
5. Se disponibile Apollo, cerca con searchPeopleApollo per ruoli commerciali/vendite nell'azienda
6. Privilegia ruoli: Sales Manager, Area Manager, Business Development, Key Account, Direttore Commerciale, Export Manager

### FASE 3 - COMPLETAMENTO:
- Salva TUTTI i lead trovati, anche con confidence bassa, purche' abbiano email personale
- Nella nota, specifica SEMPRE: "Espositore a [nome fiera] [anno] [citta']"
- Se non trovi contatti per un'azienda, SEGNALALO nella risposta ma prosegui con le altre
- Obiettivo: almeno 1 contatto per azienda. Meglio 30 lead con 40% confidence che 0 lead.

### REGOLA IMPORTANTE PER FIERE:
Per le ricerche legate a fiere, RILASSA la regola "zero tolleranza email generiche":
- Preferisci SEMPRE email personali quando disponibili
- MA se per un espositore trovi solo email generica (info@, commerciale@), SALVALO COMUNQUE con confidence bassa (15-25%)
- E' meglio avere un contatto generico per un espositore confermato che perdere completamente quell'azienda
- Segna nelle note: "Solo email generica disponibile - cercare contatto personale manualmente"

## APIFY ACTORS UTILI:
- "compass/crawler-google-places" → Scraping Google Maps con dettagli completi (indirizzo, telefono, sito, orari, recensioni)
- "apify/google-search-scraper" → Risultati Google Search
- "curious_coder/google-maps-reviews-scraper" → Recensioni Google Maps
Quando usi Apify, l'esecuzione puo' richiedere fino a 2 minuti. Avvisa l'utente.`;
}

// ===================== TOOL DEFINITIONS =====================

const leadGenTools = [
    {
        type: 'function' as const,
        function: {
            name: 'searchPeopleApollo',
            description: 'Cerca persone/contatti usando Apollo.io API. Trova lead per ruolo, azienda, settore, localita\'.',
            parameters: {
                type: 'object',
                properties: {
                    jobTitles: { type: 'array', items: { type: 'string' }, description: 'Ruoli/titoli (OBBLIGATORIO IN INGLESE, es: "Marketing Manager", "CEO", "Sales Director")' },
                    industries: { type: 'array', items: { type: 'string' }, description: 'Settori (OBBLIGATORIO IN INGLESE, es: "Industrial Automation", "Software")' },
                    locations: { type: 'array', items: { type: 'string' }, description: 'Paesi/Citta\' (OBBLIGATORIO IN INGLESE, es: "Italy", "Milan")' },
                    companySize: { type: 'string', description: 'Range dipendenti: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001+' },
                    keywords: { type: 'string', description: 'Parole chiave aggiuntive' },
                    limit: { type: 'number', description: 'Numero max risultati (default 25)' },
                },
                required: ['jobTitles'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchCompaniesApollo',
            description: 'Cerca aziende usando Apollo.io API per settore, localita\', dimensione.',
            parameters: {
                type: 'object',
                properties: {
                    industries: { type: 'array', items: { type: 'string' }, description: 'Settori/industrie (OBBLIGATORIO IN INGLESE, es: "Industrial Automation")' },
                    locations: { type: 'array', items: { type: 'string' }, description: 'Citta\'/paesi (OBBLIGATORIO IN INGLESE, es: "Italy")' },
                    companySize: { type: 'string', description: 'Range dipendenti' },
                    keywords: { type: 'string', description: 'Parole chiave' },
                    limit: { type: 'number', description: 'Numero max risultati (default 25)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'findEmailsHunter',
            description: 'Trova tutti gli indirizzi email di un dominio aziendale usando Hunter.io.',
            parameters: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'Dominio aziendale (es: "example.com")' },
                    type: { type: 'string', description: 'Filtro tipo email: "personal" o "generic"' },
                },
                required: ['domain'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'verifyEmail',
            description: 'Verifica se un indirizzo email e\' valido e recapitabile usando Hunter.io.',
            parameters: {
                type: 'object',
                properties: {
                    email: { type: 'string', description: 'L\'indirizzo email da verificare' },
                },
                required: ['email'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchGoogleMaps',
            description: 'Cerca attivita\' su Google Maps. Ottimo per attivita\' puramente locali (ristoranti, negozi). ❌ ASSOLUTAMENTE VIETATO USARE QUESTO TOOL PER CERCARE ESPOSITORI DI FIERE O AZIENDE DI SETTORI GLOBALI/NAZIONALI. (Gli espositori di una fiera non hanno sede nella città in cui si svolge la fiera!).',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Query di ricerca (es: "ristoranti Milano", "aziende software Roma")' },
                    location: { type: 'string', description: 'Localita\' geografica per i risultati' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'scrapeWebsite',
            description: 'Scraping di un sito web pubblico per estrarre informazioni di contatto, pagina about, team.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'L\'URL da analizzare' },
                    extractType: { type: 'string', description: 'Cosa estrarre: "contacts", "about", "team", "all"' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'saveLeads',
            description: 'Salva i lead trovati nel database per uso futuro ed export.',
            parameters: {
                type: 'object',
                properties: {
                    searchName: { type: 'string', description: 'Nome per questo batch di ricerca' },
                    criteria: { type: 'object', description: 'I criteri di ricerca usati' },
                    leads: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                firstName: { type: 'string' },
                                lastName: { type: 'string' },
                                fullName: { type: 'string' },
                                jobTitle: { type: 'string' },
                                email: { type: 'string' },
                                phone: { type: 'string' },
                                linkedinUrl: { type: 'string' },
                                companyName: { type: 'string' },
                                companyDomain: { type: 'string' },
                                companyWebsite: { type: 'string' },
                                companySize: { type: 'string' },
                                companyIndustry: { type: 'string' },
                                companyCity: { type: 'string' },
                                companyCountry: { type: 'string' },
                                source: { type: 'string' },
                                notes: { type: 'string', description: 'Breve descrizione dell\'azienda e settore' },
                                revenueYear1: { type: 'string', description: 'Fatturato 3 anni fa (es: "€2.5M")' },
                                revenueYear2: { type: 'string', description: 'Fatturato 2 anni fa' },
                                revenueYear3: { type: 'string', description: 'Fatturato ultimo anno' },
                                profitYear1: { type: 'string', description: 'Utile netto 3 anni fa' },
                                profitYear2: { type: 'string', description: 'Utile netto 2 anni fa' },
                                profitYear3: { type: 'string', description: 'Utile netto ultimo anno' },
                                confidence: { type: 'number', description: 'Percentuale di affidabilita\' del lead (0-100). Basata su: email verificata, dati completi, fonte attendibile.' },
                                emailStatus: { type: 'string', description: 'Stato verifica email: "valid", "invalid", "accept_all", "unknown"' },
                            },
                        },
                        description: 'Array di lead da salvare',
                    },
                },
                required: ['searchName', 'leads'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'getLeadStats',
            description: 'Statistiche sui lead esistenti nel database: totale, per ricerca, per settore.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'getLeadsToEnrich',
            description: 'Recupera le aziende/lead dal database che mancano di email personale, LinkedIn o nome contatto. Usalo per sapere su quali aziende devi cercare contatti. Ritorna lista con companyName, companyWebsite, companyDomain, leadId.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Quante aziende restituire (default 50, max 200)' },
                    missingField: { type: 'string', enum: ['email', 'linkedinUrl', 'fullName', 'any'], description: 'Filtra per campo mancante (default: email)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'enrichLeadsAutomatically',
            description: 'Arricchisce AUTOMATICAMENTE tutti i lead nel DB senza email/contatti. Esegue server-side: per ogni azienda visita il sito con browser reale, cerca /team /about /chi-siamo, estrae email e nomi, chiama Hunter per email personali, salva tutto nel DB. Una sola chiamata fa tutto. Usalo quando l\'utente chiede di trovare contatti per le aziende esistenti.',
            parameters: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: 'Quante aziende processare (default 20, max 50)' },
                    useHunter: { type: 'boolean', description: 'Usa Hunter.io per trovare email (default: true se API key disponibile)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchGooglePlaywright',
            description: 'Cerca su Google usando un browser Chromium reale (GRATUITO, nessuna API key). Restituisce i primi risultati con titolo, URL e descrizione. Usa questo per cercare profili LinkedIn (query: "NomeAzienda" site:linkedin.com/in), siti di aziende, persone, o qualsiasi ricerca web. Alternativa GRATIS a searchGoogleWeb (che richiede SerpApi).',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Query di ricerca Google (es. "Mario Rossi" site:linkedin.com/in, oppure "automazione industriale Italia" direttore)' },
                    numResults: { type: 'number', description: 'Numero di risultati da restituire (default 10, max 20)' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'browsePage',
            description: 'Apre una pagina web con un browser Chromium reale (headless) interno al server — GRATUITO, nessuna API esterna. Funziona anche su siti JavaScript, React, Vue, Angular. Estrae testo, email, nomi dal DOM renderizzato. Usa questo per siti che fetchWebPage non riesce a leggere.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL completo da visitare' },
                    waitForText: { type: 'string', description: 'Testo da aspettare prima di estrarre (opzionale)' },
                    clickSelector: { type: 'string', description: 'Selettore CSS da cliccare prima di leggere (opzionale, es. "button.cookie-accept")' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'fetchWebPage',
            description: 'Scarica e legge il contenuto di qualsiasi pagina web GRATUITAMENTE, senza API esterne. Funziona su molti siti aziendali. Usa questo come prima scelta per navigare siti web — è gratuito e non consuma crediti. Non funziona su siti con Cloudflare o login richiesto.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL completo della pagina da leggere (es. https://azienda.it/team)' },
                    extractEmails: { type: 'boolean', description: 'Se true, estrae automaticamente tutte le email trovate nel testo (default: true)' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'getExistingLeadEmails',
            description: 'Recupera tutte le email dei lead gia\' salvati nel database per questa azienda. Usalo PRIMA di cercare nuovi lead per evitare duplicati.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'updateLead',
            description: 'Aggiorna campi specifici di un lead esistente nel database (es. aggiunge email, LinkedIn, nome contatto trovati dopo). Usa leadId restituito da getLeadsToEnrich.',
            parameters: {
                type: 'object',
                properties: {
                    leadId: { type: 'string', description: 'ID del lead da aggiornare' },
                    fullName: { type: 'string', description: 'Nome completo del contatto' },
                    email: { type: 'string', description: 'Email personale del contatto' },
                    jobTitle: { type: 'string', description: 'Ruolo/titolo del contatto' },
                    linkedinUrl: { type: 'string', description: 'URL profilo LinkedIn' },
                    phone: { type: 'string', description: 'Telefono' },
                    notes: { type: 'string', description: 'Note aggiuntive' },
                    confidence: { type: 'number', description: 'Affidabilità 0-100' },
                },
                required: ['leadId'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'exportLeads',
            description: 'Esporta i lead di una ricerca specifica o tutti i lead in formato CSV.',
            parameters: {
                type: 'object',
                properties: {
                    searchId: { type: 'string', description: 'ID ricerca specifica (opzionale, esporta tutti se omesso)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'runApifyActor',
            description: 'Esegue un actor Apify per web scraping avanzato. Utile per scraping Google Maps, LinkedIn, siti web, directory aziendali, pagine gialle, e altro. Actor consigliati: "compass/crawler-google-places" per Google Maps, "apify/google-search-scraper" per ricerca Google, "curious_coder/google-maps-reviews-scraper" per recensioni.',
            parameters: {
                type: 'object',
                properties: {
                    actorId: { type: 'string', description: 'ID dell\'actor Apify (es: "compass/crawler-google-places", "apify/google-search-scraper")' },
                    input: { type: 'object', description: 'Input per l\'actor (varia per actor). Per Google Places: { "searchStringsArray": ["query"], "locationQuery": "city", "maxCrawledPlacesPerSearch": 20 }' },
                },
                required: ['actorId', 'input'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchProspectsVibe',
            description: 'Cerca contatti/persone usando Vibe Prospecting (Explorium). Ottimo per trovare decision maker con email, dati aziendali e segnali di intento. Supporta filtri per job title, livello, dipartimento, localita\', dimensione azienda, fatturato, categoria LinkedIn/NAICS.',
            parameters: {
                type: 'object',
                properties: {
                    job_titles: { type: 'array', items: { type: 'string' }, description: 'Ruoli da cercare (es: "Software Engineer", "CTO", "Marketing Director")' },
                    job_levels: { type: 'array', items: { type: 'string' }, description: 'Livello: "owner", "c-suite", "vice president", "director", "manager", "senior non-managerial", "partner", "founder"' },
                    job_departments: { type: 'array', items: { type: 'string' }, description: 'Dipartimento (IN INGLESE): "engineering", "sales", "marketing", "finance", "it", "operations", "c-suite", "human resources", "legal", "product", "design"' },
                    country_codes: { type: 'array', items: { type: 'string' }, description: 'Codici paese ISO-2 (es: "IT", "US", "DE")' },
                    company_country_codes: { type: 'array', items: { type: 'string' }, description: 'Paese sede azienda ISO-2 (es: "IT", "US")' },
                    company_names: { type: 'array', items: { type: 'string' }, description: 'Nomi aziende specifiche' },
                    company_sizes: { type: 'array', items: { type: 'string' }, description: 'Range dipendenti: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"' },
                    company_revenues: { type: 'array', items: { type: 'string' }, description: 'Range fatturato: "0-500K", "500K-1M", "1M-5M", "5M-10M", "10M-25M", "25M-75M", "75M-200M", "200M-500M", "500M-1B"' },
                    linkedin_categories: { type: 'array', items: { type: 'string' }, description: 'Categorie LinkedIn dell\'azienda (es: "Market research", "Information Technology")' },
                    has_email: { type: 'boolean', description: 'Filtra solo prospect con email (consigliato: true)' },
                    limit: { type: 'number', description: 'Numero max risultati per pagina (max 500, default 25)' },
                },
                required: ['job_titles'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchBusinessesVibe',
            description: 'Cerca aziende usando Vibe Prospecting (Explorium). Trova aziende per settore, localita\', dimensione con dati finanziari, tecnografici e intent data. Supporta filtri per categoria LinkedIn/Google/NAICS, tecnologie, keyword sito web.',
            parameters: {
                type: 'object',
                properties: {
                    country_codes: { type: 'array', items: { type: 'string' }, description: 'Codici paese ISO (es: "IT", "US", "DE")' },
                    company_sizes: { type: 'array', items: { type: 'string' }, description: 'Range dipendenti: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"' },
                    company_revenues: { type: 'array', items: { type: 'string' }, description: 'Range fatturato: "0-500K", "500K-1M", "1M-5M", "5M-10M", "10M-25M", "25M-75M", "75M-200M", "200M-500M", "500M-1B", "1B-10B"' },
                    company_names: { type: 'array', items: { type: 'string' }, description: 'Nomi aziende specifiche' },
                    linkedin_categories: { type: 'array', items: { type: 'string' }, description: 'Categorie LinkedIn (es: "Market research", "Software Development")' },
                    google_categories: { type: 'array', items: { type: 'string' }, description: 'Categorie Google (es: "Retail", "Restaurant")' },
                    website_keywords: { type: 'array', items: { type: 'string' }, description: 'Parole chiave presenti nel sito web dell\'azienda' },
                    tech_stack: { type: 'array', items: { type: 'string' }, description: 'Tecnologie usate (es: "JavaScript", "Salesforce", "AWS")' },
                    has_website: { type: 'boolean', description: 'Solo aziende con sito web' },
                    limit: { type: 'number', description: 'Numero max risultati per pagina (max 500, default 25)' },
                },
                required: [],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'searchGoogleWeb',
            description: 'Cerca su Google Web (via SerpApi). Ottimo per trovare liste espositori, directory aziendali, pagine "chi siamo", elenchi partecipanti a fiere/eventi. Restituisce titoli, link e snippet dei risultati.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Query di ricerca Google (es: "lista espositori SPS Italia 2026", "aziende automazione Parma")' },
                    num: { type: 'number', description: 'Numero risultati (default 10, max 100)' },
                    gl: { type: 'string', description: 'Codice paese per risultati localizzati (es: "it" per Italia, "de" per Germania). Default: "it"' },
                    hl: { type: 'string', description: 'Lingua risultati (es: "it" per italiano, "en" per inglese). Default: "it"' },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'findEmailHunter',
            description: 'Trova l\'email di una persona specifica dato nome, cognome e dominio aziendale usando Hunter.io Email Finder.',
            parameters: {
                type: 'object',
                properties: {
                    domain: { type: 'string', description: 'Dominio aziendale (es: "example.com")' },
                    first_name: { type: 'string', description: 'Nome della persona' },
                    last_name: { type: 'string', description: 'Cognome della persona' },
                    company: { type: 'string', description: 'Nome azienda (opzionale, migliora i risultati)' },
                },
                required: ['domain', 'first_name', 'last_name'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'scrapeWithFirecrawl',
            description: 'Scraping avanzato di una pagina web con Firecrawl. Supporta pagine JavaScript-heavy (SPA, React, Angular). Restituisce contenuto pulito in markdown, HTML o entrambi. Ideale per liste espositori, pagine team/about/contatti. Molto piu\' affidabile dello scraping base.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'L\'URL della pagina da scrappare' },
                    formats: { type: 'array', items: { type: 'string' }, description: 'Formati output: "markdown", "html", "links", "screenshot". Default: ["markdown"]' },
                    onlyMainContent: { type: 'boolean', description: 'Estrai solo contenuto principale (no header/footer/nav). Default: true' },
                    waitFor: { type: 'number', description: 'Millisecondi da attendere per il rendering JavaScript prima di estrarre il contenuto. Utile per pagine che caricano contenuto dinamicamente. Default: 0. Usa 3000-5000 per pagine JS-heavy come liste espositori.' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'mapWebsiteFirecrawl',
            description: 'Scopri tutte le URL accessibili di un sito web con Firecrawl. Utile per trovare pagine team, contatti, about prima di scrappare. Non consuma molti crediti.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'URL del sito (es: "https://example.com")' },
                    search: { type: 'string', description: 'Filtro opzionale per cercare URL specifiche (es: "team", "contact", "about")' },
                    limit: { type: 'number', description: 'Numero max URL da restituire (default 100)' },
                },
                required: ['url'],
            },
        },
    },
];

// ===================== TOOL DISPATCHER =====================

export async function executeToolCall(
    name: string,
    args: any,
    companyId: string,
    apiKeys: { apollo?: string; hunter?: string; serpApi?: string; apify?: string; vibeProspect?: string; firecrawl?: string },
    conversationId?: string,
    emit?: (evt: any) => void
): Promise<string> {
    const _emit = emit || (() => {});
    switch (name) {
        case 'searchPeopleApollo': {
            if (!apiKeys.apollo) {
                return JSON.stringify({ error: 'API key Apollo.io non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                const body: any = {
                    person_titles: args.jobTitles || [],
                    per_page: args.limit || 25,
                };
                if (args.industries?.length) body.organization_industry_tag_ids = args.industries;
                if (args.locations?.length) body.person_locations = args.locations;
                if (args.companySize) {
                    const sizeMap: Record<string, string[]> = {
                        '1-10': ['1,10'], '11-50': ['11,50'], '51-200': ['51,200'],
                        '201-500': ['201,500'], '501-1000': ['501,1000'], '1001+': ['1001,5000'],
                    };
                    body.organization_num_employees_ranges = sizeMap[args.companySize] || [];
                }
                if (args.keywords) body.q_keywords = args.keywords;

                const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKeys.apollo },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const err = await response.text();
                    if (response.status === 403 || response.status === 401 || response.status === 429) {
                        return JSON.stringify({ warning: `Apollo API quota/piano limitato (${response.status})`, people: [] });
                    }
                    return JSON.stringify({ error: `Apollo API errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const people = (data.people || []).map((p: any) => ({
                    firstName: p.first_name,
                    lastName: p.last_name,
                    fullName: p.name,
                    jobTitle: p.title,
                    email: p.email,
                    emailStatus: p.email_status,
                    phone: p.phone_numbers?.[0]?.sanitized_number,
                    linkedinUrl: p.linkedin_url,
                    companyName: p.organization?.name,
                    companyDomain: p.organization?.primary_domain,
                    companyWebsite: p.organization?.website_url,
                    companySize: p.organization?.estimated_num_employees ? `${p.organization.estimated_num_employees}` : null,
                    companyIndustry: p.organization?.industry,
                    companyCity: p.city,
                    companyCountry: p.country,
                }));

                return JSON.stringify({
                    totalResults: data.pagination?.total_entries || people.length,
                    returned: people.length,
                    people,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Apollo: ${e.message}` });
            }
        }

        case 'searchCompaniesApollo': {
            if (!apiKeys.apollo) {
                return JSON.stringify({ error: 'API key Apollo.io non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                const body: any = { per_page: args.limit || 25 };
                if (args.industries?.length) body.organization_industry_tag_ids = args.industries;
                if (args.locations?.length) body.organization_locations = args.locations;
                if (args.companySize) {
                    const sizeMap: Record<string, string[]> = {
                        '1-10': ['1,10'], '11-50': ['11,50'], '51-200': ['51,200'],
                        '201-500': ['201,500'], '501-1000': ['501,1000'], '1001+': ['1001,5000'],
                    };
                    body.organization_num_employees_ranges = sizeMap[args.companySize] || [];
                }
                if (args.keywords) body.q_keywords = args.keywords;

                const response = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKeys.apollo },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const err = await response.text();
                    if (response.status === 403 || response.status === 401 || response.status === 429) {
                        return JSON.stringify({ warning: `Apollo API quota/piano limitato (${response.status})`, organizations: [] });
                    }
                    return JSON.stringify({ error: `Apollo API errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const organizations = (data.organizations || []).map((o: any) => ({
                    companyName: o.name,
                    companyDomain: o.primary_domain,
                    companyWebsite: o.website_url,
                    companySize: o.estimated_num_employees ? `${o.estimated_num_employees}` : null,
                    companyIndustry: o.industry,
                    companyCity: o.city,
                    companyCountry: o.country,
                    companyLinkedin: o.linkedin_url,
                    phone: o.phone,
                }));

                return JSON.stringify({
                    totalResults: data.pagination?.total_entries || organizations.length,
                    returned: organizations.length,
                    organizations,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Apollo: ${e.message}` });
            }
        }

        case 'findEmailsHunter': {
            if (!apiKeys.hunter) {
                return JSON.stringify({ error: 'API key Hunter.io non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                let url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(args.domain)}&api_key=${apiKeys.hunter}`;
                if (args.type) url += `&type=${args.type}`;

                const response = await fetch(url);
                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `Hunter API errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const emails = (data.data?.emails || []).map((e: any) => ({
                    email: e.value,
                    type: e.type,
                    confidence: e.confidence,
                    firstName: e.first_name,
                    lastName: e.last_name,
                    position: e.position,
                    department: e.department,
                    linkedinUrl: e.linkedin,
                }));

                return JSON.stringify({
                    domain: args.domain,
                    organization: data.data?.organization,
                    totalEmails: data.data?.emails?.length || 0,
                    emails,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Hunter: ${e.message}` });
            }
        }

        case 'verifyEmail': {
            if (!apiKeys.hunter) {
                return JSON.stringify({ error: 'API key Hunter.io non configurata.' });
            }
            try {
                const response = await fetch(
                    `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(args.email)}&api_key=${apiKeys.hunter}`
                );
                if (!response.ok) {
                    return JSON.stringify({ error: `Hunter verification errore: ${response.status}` });
                }
                const data = await response.json();
                return JSON.stringify({
                    email: args.email,
                    result: data.data?.result,
                    score: data.data?.score,
                    status: data.data?.status,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore verifica: ${e.message}` });
            }
        }

        case 'searchGoogleWeb': {
            if (!apiKeys.serpApi) {
                return JSON.stringify({ error: 'API key SerpApi non configurata.' });
            }
            try {
                const num = Math.min(args.num || 10, 100);
                const gl = args.gl || 'it';
                const hl = args.hl || 'it';
                const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(args.query)}&num=${num}&gl=${gl}&hl=${hl}&api_key=${apiKeys.serpApi}`;
                const response = await fetch(url);
                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `SerpApi Google Search errore: ${response.status} - ${err}` });
                }
                const data = await response.json();
                const organicResults = (data.organic_results || []).map((r: any) => ({
                    title: r.title,
                    link: r.link,
                    snippet: r.snippet,
                    displayedLink: r.displayed_link,
                }));
                return JSON.stringify({
                    query: args.query,
                    totalResults: organicResults.length,
                    results: organicResults,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Google Search: ${e.message}` });
            }
        }

        case 'findEmailHunter': {
            if (!apiKeys.hunter) {
                return JSON.stringify({ error: 'API key Hunter.io non configurata.' });
            }
            try {
                let url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(args.domain)}&first_name=${encodeURIComponent(args.first_name)}&last_name=${encodeURIComponent(args.last_name)}&api_key=${apiKeys.hunter}`;
                if (args.company) url += `&company=${encodeURIComponent(args.company)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `Hunter Email Finder errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const d = data.data || {};
                return JSON.stringify({
                    email: d.email,
                    score: d.score,
                    position: d.position,
                    firstName: d.first_name || args.first_name,
                    lastName: d.last_name || args.last_name,
                    domain: args.domain,
                    company: d.company || args.company,
                    linkedinUrl: d.linkedin_url,
                    sources: d.sources?.length || 0,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Hunter Email Finder: ${e.message}` });
            }
        }

        case 'searchGoogleMaps': {
            if (!apiKeys.serpApi) {
                return JSON.stringify({ error: 'API key SerpApi non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                let url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(args.query)}&api_key=${apiKeys.serpApi}`;
                if (args.location) url += `&ll=@${encodeURIComponent(args.location)}`;

                const response = await fetch(url);
                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `SerpApi errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const results = (data.local_results || []).map((r: any) => ({
                    companyName: r.title,
                    companyCity: r.address ? r.address.split(',')[0] : null,
                    phone: r.phone,
                    companyWebsite: r.website,
                    rating: r.rating,
                    reviews: r.reviews,
                    type: r.type,
                    companyIndustry: r.type,
                    source: 'google_maps',
                }));

                return JSON.stringify({
                    query: args.query,
                    totalResults: results.length,
                    results,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore SerpApi: ${e.message}` });
            }
        }

        case 'scrapeWebsite': {
            try {
                const response = await fetch(`${getPythonBackendUrl()}/scrape`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        url: args.url,
                        extractType: args.extractType || 'all',
                    }),
                });

                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `Scraping errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                return JSON.stringify(data, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore scraping: ${e.message}. Il Python backend potrebbe non essere in esecuzione.` });
            }
        }

        case 'saveLeads': {
            try {
                const rawLeads = args.leads || [];
                // Filter out leads with generic or missing emails
                const genericEmailPrefixes = ['info@', 'admin@', 'support@', 'contatti@', 'hello@', 'office@', 'sales@', 'marketing@', 'noreply@', 'contact@', 'segreteria@', 'amministrazione@', 'ordini@', 'orders@', 'customer@', 'service@', 'webstore@', 'reception@', 'direzione@', 'commerciale@', 'hr@', 'jobs@', 'careers@', 'press@', 'media@', 'billing@', 'accounting@', 'general@', 'team@', 'help@'];
                const isGeneric = (email: string) => email && genericEmailPrefixes.some(p => email.toLowerCase().startsWith(p));

                // ===== GROUP CONTACTS BY COMPANY =====
                // Each lead = 1 company with N contacts inside
                const companyMap = new Map<string, { companyData: any; contacts: any[] }>();

                for (const l of rawLeads) {
                    // Build a company key from name or domain
                    const companyKey = (l.companyName || l.companyDomain || l.email?.split('@')[1] || 'unknown').toLowerCase().trim();
                    if (!companyMap.has(companyKey)) {
                        companyMap.set(companyKey, {
                            companyData: {
                                companyName: l.companyName || null,
                                companyDomain: l.companyDomain || null,
                                companyWebsite: l.companyWebsite || null,
                                companySize: l.companySize || null,
                                companyIndustry: l.companyIndustry || null,
                                companyCity: l.companyCity || null,
                                companyCountry: l.companyCountry || null,
                                source: l.source || 'manual',
                                notes: l.notes || null,
                                revenueYear1: l.revenueYear1 || null,
                                revenueYear2: l.revenueYear2 || null,
                                revenueYear3: l.revenueYear3 || null,
                                profitYear1: l.profitYear1 || null,
                                profitYear2: l.profitYear2 || null,
                                profitYear3: l.profitYear3 || null,
                            },
                            contacts: [],
                        });
                    }

                    const entry = companyMap.get(companyKey)!;
                    // Merge company-level data (prefer non-null values)
                    for (const key of Object.keys(entry.companyData)) {
                        if (!entry.companyData[key] && (l as any)[key]) {
                            entry.companyData[key] = (l as any)[key];
                        }
                    }

                    // Add as contact if it has a name or personal email
                    const hasPersonalEmail = l.email && !isGeneric(l.email);
                    const hasName = l.fullName || l.firstName || l.lastName;
                    if (hasPersonalEmail || hasName) {
                        const contactFullName = l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim() || null;
                        // Avoid duplicate contacts (same email)
                        const isDupe = l.email && entry.contacts.some((c: any) => c.email?.toLowerCase() === l.email.toLowerCase());
                        if (!isDupe) {
                            entry.contacts.push({
                                fullName: contactFullName,
                                firstName: l.firstName || null,
                                lastName: l.lastName || null,
                                jobTitle: l.jobTitle || null,
                                email: l.email || null,
                                emailStatus: l.emailStatus || null,
                                phone: l.phone || null,
                                linkedinUrl: l.linkedinUrl || null,
                            });
                        }
                    }
                }

                // Filter out companies with zero useful contacts (no personal email at all)
                // For fair/event searches, also keep companies WITHOUT personal email contacts
                // (they're still valuable as an exhibitor list to enrich later)
                const companiesWithContacts = [...companyMap.entries()].filter(([_, v]) =>
                    v.contacts.some(c => c.email && !isGeneric(c.email))
                );
                // Also keep companies with at least a domain (valuable company records even without personal contacts)
                const companiesWithDomainOnly = [...companyMap.entries()].filter(([key, v]) =>
                    !companiesWithContacts.some(([k]) => k === key) &&
                    (v.companyData.companyDomain || v.companyData.companyWebsite)
                );
                const allCompaniesToSave = [...companiesWithContacts, ...companiesWithDomainOnly];

                console.log(`[saveLeads] Grouped ${rawLeads.length} raw leads into ${companyMap.size} companies, ${companiesWithContacts.length} with personal contacts, ${companiesWithDomainOnly.length} with domain only`);

                // Reuse existing search for this conversation (all batches go into one search)
                let search = conversationId
                    ? await db.leadSearch.findFirst({
                        where: { conversationId, companyId },
                        orderBy: { createdAt: 'asc' },
                    })
                    : null;

                if (search) {
                    // Update existing search count
                    search = await db.leadSearch.update({
                        where: { id: search.id },
                        data: {
                            resultCount: { increment: allCompaniesToSave.length },
                            status: 'completed',
                        },
                    });
                    console.log(`[saveLeads] Reusing search ${search.id} (conversationId: ${conversationId})`);
                } else {
                    // Create new search record
                    search = await db.leadSearch.create({
                        data: {
                            name: args.searchName || 'Ricerca Lead',
                            criteria: args.criteria || {},
                            status: 'completed',
                            resultCount: allCompaniesToSave.length,
                            companyId,
                            ...(conversationId ? { conversationId } : {}),
                        },
                    });
                    console.log(`[saveLeads] Created new search ${search.id}`);
                }

                // Create one lead per company, with contacts array + best contact as primary
                const leadsData = allCompaniesToSave.map(([_, { companyData, contacts }]) => {
                    // Pick best contact (highest: verified email > has phone > has linkedin > has job title)
                    const scored = contacts.map(c => ({
                        ...c,
                        _score: (c.emailStatus === 'valid' ? 4 : c.email ? 2 : 0)
                            + (c.phone ? 2 : 0) + (c.linkedinUrl ? 1 : 0) + (c.jobTitle ? 1 : 0),
                    }));
                    scored.sort((a, b) => b._score - a._score);
                    const best = scored[0] || {};

                    // Compute confidence based on company completeness + contact quality
                    let conf = 0;
                    if (best.email && !isGeneric(best.email)) conf += 25;
                    if (best.emailStatus === 'valid') conf += 10;
                    if (best.fullName) conf += 12;
                    if (best.jobTitle) conf += 8;
                    if (best.phone) conf += 8;
                    if (best.linkedinUrl) conf += 7;
                    if (companyData.companyName) conf += 8;
                    if (companyData.companyWebsite || companyData.companyDomain) conf += 5;
                    if (companyData.companyIndustry) conf += 5;
                    if (companyData.companyCity) conf += 4;
                    if (companyData.companyCountry) conf += 3;
                    if (contacts.length > 1) conf += 5; // bonus for multiple contacts
                    // For companies without any contacts, set minimal confidence
                    if (contacts.length === 0) {
                        conf = 0;
                        if (companyData.companyName) conf += 8;
                        if (companyData.companyWebsite || companyData.companyDomain) conf += 5;
                        if (companyData.companyIndustry) conf += 3;
                        if (companyData.companyCity) conf += 2;
                        if (companyData.companyCountry) conf += 2;
                        conf = Math.min(100, conf);
                    }
                    conf = Math.min(100, conf);

                    // Clean _score from contacts before storing
                    const cleanContacts = scored.map(({ _score, ...rest }) => rest);

                    return {
                        // Primary contact (best one)
                        firstName: best.firstName || null,
                        lastName: best.lastName || null,
                        fullName: best.fullName || null,
                        jobTitle: best.jobTitle || null,
                        email: best.email || null,
                        emailStatus: best.emailStatus || null,
                        phone: best.phone || null,
                        linkedinUrl: best.linkedinUrl || null,
                        // All contacts
                        contacts: cleanContacts,
                        // Company data
                        ...companyData,
                        confidence: conf / 100,
                        searchId: search.id,
                        companyId,
                    };
                });

                if (leadsData.length > 0) {
                    const result = await db.lead.createMany({ data: leadsData });
                    console.log(`[saveLeads] Created ${result.count} company leads in DB (${rawLeads.length} raw → ${result.count} companies)`);
                }

                const totalContacts = allCompaniesToSave.reduce((s, [_, v]) => s + v.contacts.length, 0);
                return JSON.stringify({
                    success: true,
                    searchId: search.id,
                    savedCount: leadsData.length,
                    totalContacts,
                    message: `Salvati ${leadsData.length} aziende (${totalContacts} contatti totali) nella ricerca "${args.searchName}".`,
                });
            } catch (e: any) {
                console.error(`[saveLeads] ERROR:`, e);
                return JSON.stringify({ error: `Errore salvataggio: ${e.message}` });
            }
        }

        case 'getLeadsToEnrich': {
            try {
                const limit = Math.min(args.limit || 50, 200);
                const missingField = args.missingField || 'email';

                // Build where clause based on what's missing
                let whereExtra: any = {};
                if (missingField === 'email' || missingField === 'any') {
                    whereExtra = { OR: [{ email: null }, { email: '' }] };
                } else if (missingField === 'linkedinUrl') {
                    whereExtra = { OR: [{ linkedinUrl: null }, { linkedinUrl: '' }] };
                } else if (missingField === 'fullName') {
                    whereExtra = { OR: [{ fullName: null }, { fullName: '' }] };
                }

                const leads = await db.lead.findMany({
                    where: { companyId, ...whereExtra },
                    select: {
                        id: true,
                        companyName: true,
                        companyWebsite: true,
                        companyDomain: true,
                        fullName: true,
                        email: true,
                        linkedinUrl: true,
                        jobTitle: true,
                        companyCity: true,
                        companyIndustry: true,
                    },
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                });

                // Deduplicate by company
                const seen = new Set<string>();
                const companies = leads
                    .filter((l: any) => {
                        const key = l.companyName?.toLowerCase() || l.id;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    })
                    .map((l: any) => ({
                        leadId: l.id,
                        companyName: l.companyName || '',
                        companyWebsite: l.companyWebsite || '',
                        companyDomain: l.companyDomain || (l.companyWebsite ? l.companyWebsite.replace(/^https?:\/\//, '').split('/')[0] : ''),
                        companyCity: l.companyCity || '',
                        companyIndustry: l.companyIndustry || '',
                        existingContact: l.fullName || '',
                        hasEmail: !!(l.email),
                        hasLinkedin: !!(l.linkedinUrl),
                    }));

                return JSON.stringify({
                    total: companies.length,
                    companies,
                    // CRITICAL instruction embedded in response so the model reads it
                    AZIONE_OBBLIGATORIA: `⚠️ HAI LA LISTA. ORA CHIAMA IMMEDIATAMENTE enrichLeadsAutomatically(limit=${companies.length}) — NON fare browsePage manualmente su ogni sito, causerebbe overflow del contesto e 0 risultati. enrichLeadsAutomatically fa tutto in UNA sola chiamata: visita i siti, cerca LinkedIn, chiama Hunter, salva nel DB. CHIAMALO ORA.`,
                });
            } catch (e: any) {
                return JSON.stringify({ error: `Errore getLeadsToEnrich: ${e.message}` });
            }
        }

        case 'updateLead': {
            try {
                if (!args.leadId) return JSON.stringify({ error: 'leadId obbligatorio' });
                const updateData: any = {};
                if (args.fullName !== undefined) updateData.fullName = args.fullName;
                if (args.email !== undefined) updateData.email = args.email;
                if (args.jobTitle !== undefined) updateData.jobTitle = args.jobTitle;
                if (args.linkedinUrl !== undefined) updateData.linkedinUrl = args.linkedinUrl;
                if (args.phone !== undefined) updateData.phone = args.phone;
                if (args.notes !== undefined) updateData.notes = args.notes;
                if (args.confidence !== undefined) updateData.confidence = args.confidence;

                // Verify the lead belongs to this company
                const existing = await db.lead.findFirst({ where: { id: args.leadId, companyId } });
                if (!existing) return JSON.stringify({ error: 'Lead non trovato o non autorizzato' });

                await db.lead.update({ where: { id: args.leadId }, data: updateData });
                return JSON.stringify({
                    success: true,
                    leadId: args.leadId,
                    updated: Object.keys(updateData),
                    message: `Lead aggiornato: ${Object.keys(updateData).join(', ')}`,
                });
            } catch (e: any) {
                return JSON.stringify({ error: `Errore updateLead: ${e.message}` });
            }
        }

        case 'getLeadStats': {
            try {
                const [totalLeads, totalSearches, leads] = await Promise.all([
                    db.lead.count({ where: { companyId } }),
                    db.leadSearch.count({ where: { companyId } }),
                    db.lead.findMany({ where: { companyId }, select: { source: true, companyIndustry: true } }),
                ]);

                const bySource: Record<string, number> = {};
                const byIndustry: Record<string, number> = {};
                for (const lead of leads) {
                    const src = lead.source || 'unknown';
                    bySource[src] = (bySource[src] || 0) + 1;
                    const ind = lead.companyIndustry || 'unknown';
                    byIndustry[ind] = (byIndustry[ind] || 0) + 1;
                }

                return JSON.stringify({ totalLeads, totalSearches, bySource, byIndustry }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore stats: ${e.message}` });
            }
        }

        case 'getExistingLeadEmails': {
            try {
                const leads = await db.lead.findMany({
                    where: { companyId },
                    select: { email: true, fullName: true, companyName: true },
                });
                const existingEmails = leads
                    .filter((l: any) => l.email)
                    .map((l: any) => ({
                        email: l.email,
                        name: l.fullName || '',
                        company: l.companyName || '',
                    }));

                return JSON.stringify({
                    totalExisting: existingEmails.length,
                    leads: existingEmails,
                    message: existingEmails.length > 0
                        ? `Ci sono ${existingEmails.length} lead gia' salvati. Escludi queste email dai nuovi risultati.`
                        : 'Nessun lead esistente nel database.',
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore lettura lead esistenti: ${e.message}` });
            }
        }

        case 'exportLeads': {
            try {
                const where: any = { companyId };
                if (args.searchId) where.searchId = args.searchId;

                const leads = await db.lead.findMany({ where, orderBy: { createdAt: 'desc' } });

                if (leads.length === 0) {
                    return JSON.stringify({ message: 'Nessun lead trovato da esportare.' });
                }

                const headers = ['Nome', 'Ruolo', 'Email', 'Telefono', 'LinkedIn', 'Azienda', 'Settore', 'Citta\'', 'Paese', 'Fonte'];
                const rows = leads.map(l => [
                    l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim(),
                    l.jobTitle || '', l.email || '', l.phone || '', l.linkedinUrl || '',
                    l.companyName || '', l.companyIndustry || '', l.companyCity || '',
                    l.companyCountry || '', l.source || '',
                ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));

                const csv = [headers.join(','), ...rows].join('\n');

                return JSON.stringify({
                    format: 'csv',
                    totalRows: leads.length,
                    csv,
                    message: `Esportati ${leads.length} lead in formato CSV. L'utente puo' scaricare il file dalla pagina.`,
                });
            } catch (e: any) {
                return JSON.stringify({ error: `Errore export: ${e.message}` });
            }
        }

        case 'runApifyActor': {
            if (!apiKeys.apify) {
                return JSON.stringify({ error: 'API key Apify non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                // Start the actor run
                const startResponse = await fetch(
                    `https://api.apify.com/v2/acts/${encodeURIComponent(args.actorId)}/runs?token=${apiKeys.apify}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(args.input || {}),
                    }
                );

                if (!startResponse.ok) {
                    const err = await startResponse.text();
                    return JSON.stringify({ error: `Apify errore avvio: ${startResponse.status} - ${err}` });
                }

                const runData = await startResponse.json();
                const runId = runData.data?.id;
                if (!runId) {
                    return JSON.stringify({ error: 'Apify: impossibile ottenere run ID' });
                }

                // Poll for completion (max 120 seconds)
                let status = 'RUNNING';
                for (let i = 0; i < 24; i++) {
                    await new Promise(r => setTimeout(r, 5000));
                    const statusRes = await fetch(
                        `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKeys.apify}`
                    );
                    const statusData = await statusRes.json();
                    status = statusData.data?.status || 'UNKNOWN';
                    if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'ABORTED') break;
                }

                if (status !== 'SUCCEEDED') {
                    return JSON.stringify({ error: `Apify run terminato con stato: ${status}` });
                }

                // Get results from the default dataset
                const datasetRes = await fetch(
                    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKeys.apify}&limit=50`
                );
                const items = await datasetRes.json();

                return JSON.stringify({
                    actorId: args.actorId,
                    status: 'SUCCEEDED',
                    resultCount: Array.isArray(items) ? items.length : 0,
                    results: Array.isArray(items) ? items.slice(0, 50) : items,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Apify: ${e.message}` });
            }
        }

        case 'searchProspectsVibe': {
            if (!apiKeys.vibeProspect) {
                return JSON.stringify({ error: 'API key Vibe Prospecting non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                const filters: any = {};
                if (args.job_titles?.length) filters.job_title = { values: args.job_titles, include_related_job_titles: true };
                if (args.job_levels?.length) filters.job_level = { values: args.job_levels };
                if (args.job_departments?.length) filters.job_department = { values: args.job_departments };
                if (args.country_codes?.length) filters.country_code = { values: args.country_codes };
                if (args.company_country_codes?.length) filters.company_country_code = { values: args.company_country_codes };
                if (args.company_names?.length) filters.company_name = { values: args.company_names };
                if (args.company_sizes?.length) filters.company_size = { values: args.company_sizes };
                if (args.company_revenues?.length) filters.company_revenue = { values: args.company_revenues };
                if (args.linkedin_categories?.length) filters.linkedin_category = { values: args.linkedin_categories };
                if (args.has_email !== undefined) filters.has_email = { value: args.has_email };

                const pageSize = Math.min(args.limit || 25, 500);
                const body = {
                    mode: 'full',
                    page_size: pageSize,
                    page: 1,
                    filters,
                };

                const response = await fetch('https://api.explorium.ai/v1/prospects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api_key': apiKeys.vibeProspect,
                    },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const err = await response.text();
                    if (response.status === 403 || response.status === 422 || response.status === 401) {
                        return JSON.stringify({ warning: `Vibe API errore/limite crediti (${response.status})`, data: [] });
                    }
                    return JSON.stringify({ error: `Vibe Prospecting API errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const prospects = (data.data || []).map((p: any) => ({
                    firstName: p.first_name,
                    lastName: p.last_name,
                    fullName: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    jobTitle: p.job_title,
                    email: p.professional_email_hashed ? null : (p.email || p.professional_email),
                    phone: p.phone,
                    linkedinUrl: p.linkedin || (p.linkedin_url_array?.[0]),
                    companyName: p.company_name,
                    companyDomain: p.company_website ? new URL(p.company_website).hostname.replace('www.', '') : null,
                    companyWebsite: p.company_website,
                    companySize: p.number_of_employees_range || null,
                    companyIndustry: p.naics_description || p.job_department_main,
                    companyCity: p.city,
                    companyCountry: p.country_name,
                    companyLinkedin: p.company_linkedin,
                    jobLevel: p.job_level_main,
                    jobDepartment: p.job_department_main,
                    skills: p.skills,
                    businessId: p.business_id,
                    source: 'vibe_prospecting',
                }));

                return JSON.stringify({
                    totalResults: data.total_results || prospects.length,
                    returned: prospects.length,
                    page: data.page,
                    totalPages: data.total_pages,
                    people: prospects,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Vibe Prospecting: ${e.message}` });
            }
        }

        case 'searchBusinessesVibe': {
            if (!apiKeys.vibeProspect) {
                return JSON.stringify({ error: 'API key Vibe Prospecting non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                const filters: any = {};
                if (args.country_codes?.length) filters.country_code = { values: args.country_codes };
                if (args.company_sizes?.length) filters.company_size = { values: args.company_sizes };
                if (args.company_revenues?.length) filters.company_revenue = { values: args.company_revenues };
                if (args.company_names?.length) filters.company_name = { values: args.company_names };
                if (args.linkedin_categories?.length) filters.linkedin_category = { values: args.linkedin_categories };
                if (args.google_categories?.length) filters.google_category = { values: args.google_categories };
                if (args.website_keywords?.length) filters.website_keywords = { values: args.website_keywords };
                if (args.tech_stack?.length) filters.company_tech_stack_tech = { values: args.tech_stack };
                if (args.has_website !== undefined) filters.has_website = { value: args.has_website };

                const pageSize = Math.min(args.limit || 25, 500);
                const body = {
                    mode: 'full',
                    page_size: pageSize,
                    page: 1,
                    filters,
                };

                const response = await fetch('https://api.explorium.ai/v1/businesses', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'api_key': apiKeys.vibeProspect,
                    },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const err = await response.text();
                    if (response.status === 403 || response.status === 422 || response.status === 401) {
                        return JSON.stringify({ warning: `Vibe API errore/limite crediti (${response.status})`, data: [] });
                    }
                    return JSON.stringify({ error: `Vibe Prospecting API errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const businesses = (data.data || []).map((b: any) => ({
                    companyName: b.name,
                    companyDomain: b.domain,
                    companyWebsite: b.website || (b.domain ? `https://${b.domain}` : null),
                    companySize: b.number_of_employees_range || null,
                    companyIndustry: b.naics_description || b.sic_code_description,
                    companyCity: b.city_name,
                    companyCountry: b.country_name,
                    revenue: b.yearly_revenue_range,
                    companyLinkedin: b.linkedin_profile,
                    description: b.business_description,
                    logo: b.logo,
                    region: b.region,
                    businessId: b.business_id,
                    intentTopics: b.business_intent_topics,
                    source: 'vibe_prospecting',
                }));

                return JSON.stringify({
                    totalResults: data.total_results || businesses.length,
                    returned: businesses.length,
                    page: data.page,
                    totalPages: data.total_pages,
                    businesses,
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Vibe Prospecting: ${e.message}` });
            }
        }

        case 'scrapeWithFirecrawl': {
            if (!apiKeys.firecrawl) {
                // Fallback al Python backend locale se Firecrawl non configurato
                try {
                    const response = await fetch(`${getPythonBackendUrl()}/scrape`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: args.url, extractType: 'all' }),
                    });
                    if (!response.ok) {
                        return JSON.stringify({ error: `Scraping fallback errore: ${response.status}. Configura Firecrawl nelle Impostazioni per scraping affidabile.` });
                    }
                    const data = await response.json();
                    return JSON.stringify(data, null, 2);
                } catch (e: any) {
                    return JSON.stringify({ error: `API key Firecrawl non configurata e Python backend non disponibile. Vai nelle Impostazioni per aggiungere Firecrawl.` });
                }
            }
            try {
                const formats = args.formats || ['markdown'];
                // For fair/exhibitor pages, use longer timeout and wait for JS rendering
                const isFairUrl = (args.url || '').match(/espositor|exhibitor|aussteller|exposan/i);
                const timeout = args.timeout || (isFairUrl ? 60000 : 30000);
                const waitFor = args.waitFor || (isFairUrl ? 5000 : undefined);
                const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKeys.firecrawl}`,
                    },
                    body: JSON.stringify({
                        url: args.url,
                        formats,
                        onlyMainContent: args.onlyMainContent !== false,
                        timeout,
                        ...(waitFor ? { waitFor } : {}),
                    }),
                });

                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `Firecrawl scrape errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                const result: any = {
                    url: args.url,
                    success: data.success,
                };

                if (data.data) {
                    if (data.data.markdown) result.markdown = data.data.markdown;
                    if (data.data.html) result.html = data.data.html;
                    if (data.data.links) result.links = data.data.links;
                    if (data.data.metadata) result.metadata = data.data.metadata;
                }

                return JSON.stringify(result, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Firecrawl: ${e.message}` });
            }
        }

        case 'mapWebsiteFirecrawl': {
            if (!apiKeys.firecrawl) {
                return JSON.stringify({ error: 'API key Firecrawl non configurata. Vai nelle Impostazioni per aggiungerla.' });
            }
            try {
                const body: any = {
                    url: args.url,
                    limit: args.limit || 100,
                };
                if (args.search) body.search = args.search;

                const response = await fetch('https://api.firecrawl.dev/v1/map', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKeys.firecrawl}`,
                    },
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    const err = await response.text();
                    return JSON.stringify({ error: `Firecrawl map errore: ${response.status} - ${err}` });
                }

                const data = await response.json();
                return JSON.stringify({
                    url: args.url,
                    success: data.success,
                    totalUrls: data.links?.length || 0,
                    links: data.links || [],
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore Firecrawl map: ${e.message}` });
            }
        }

        case 'enrichLeadsAutomatically': {
            try {
                const limit = Math.min(args.limit || 20, 50);
                const useHunter = args.useHunter !== false && !!apiKeys.hunter;

                // 1. Get leads to enrich
                const leads = await db.lead.findMany({
                    where: { companyId, OR: [{ email: null }, { email: '' }] },
                    select: { id: true, companyName: true, companyWebsite: true, companyDomain: true, fullName: true, companyCity: true },
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                });

                const seen = new Set<string>();
                const companies = leads.filter((l: any) => {
                    const key = (l.companyName || '').toLowerCase();
                    if (seen.has(key) || !l.companyWebsite) return false;
                    seen.add(key);
                    return true;
                });

                _emit({ phase: 'plan', message: `🚀 Avvio arricchimento automatico di ${companies.length} aziende...`, progress: 5 });

                const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
                const genericPatterns = /^(info|contact|support|admin|noreply|no-reply|hello|sales|marketing|office|hr|jobs|press|webmaster|help|service|team|privacy|dpo|legal|commerciale|segreteria|amministrazione|contatti|ordini)@/i;
                const nameRegex = /([A-ZÀÁÂÃÄÅ][a-zàáâãäå]{2,}(?:\s+[A-ZÀÁÂÃÄÅ][a-zàáâãäå]{2,}){1,2})/g;

                const results: { company: string; found: string[]; linkedinUrl?: string; foundName?: string }[] = [];
                const { chromium } = await import('playwright');

                for (let i = 0; i < companies.length; i++) {
                    const lead = companies[i];
                    const site = lead.companyWebsite!;
                    const domain = lead.companyDomain || site.replace(/^https?:\/\//, '').split('/')[0];
                    const companyName = lead.companyName || domain;
                    const progress = Math.round(10 + (i / companies.length) * 80);

                    _emit({ phase: 'scrape', message: `🔍 [${i+1}/${companies.length}] ${companyName}`, browserUrl: site, progress });

                    const foundEmails: string[] = [];
                    const foundNames: string[] = [];
                    let linkedinUrl = '';

                    // ── Step 1: Visit company website subpages ──
                    const subpages = ['/team', '/about', '/chi-siamo', '/management', '/it/azienda/team', '/en/about', '/contatti', '/it/contatti'];
                    const baseUrl = site.replace(/\/$/, '');

                    for (const sub of subpages) {
                        const url = `${baseUrl}${sub}`;
                        _emit({ phase: 'scrape', message: `  🌐 Navigando ${url}`, browserUrl: url });
                        try {
                            const res = await fetch(url, {
                                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
                                signal: AbortSignal.timeout(6000),
                            });
                            if (!res.ok) continue;
                            const html = await res.text();
                            const emails = (html.match(emailRegex) || []).filter(e => !genericPatterns.test(e));
                            foundEmails.push(...emails);
                            const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);
                            const nameMatches = [...text.matchAll(nameRegex)];
                            for (const m of nameMatches) {
                                const n = m[1].trim();
                                if (n.split(' ').length >= 2 && !foundNames.includes(n)) foundNames.push(n);
                                if (foundNames.length >= 5) break;
                            }
                            if (foundEmails.length > 0) break;
                        } catch { continue; }
                    }

                    // ── Step 2: Google → LinkedIn via Playwright (free, no SerpApi, stealth) ──
                    if (!linkedinUrl) {
                        const linkedinQuery = `${companyName} site:linkedin.com/in`;
                        const linkedinSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(linkedinQuery)}&hl=it&gl=it`;
                        _emit({ phase: 'scrape', message: `  🔎 Google LinkedIn: ${linkedinQuery}`, browserUrl: linkedinSearchUrl });
                        const lisBrowser = await chromium.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
                        });
                        try {
                            const lisContext = await lisBrowser.newContext({
                                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                locale: 'it-IT',
                                viewport: { width: 1280, height: 800 },
                                extraHTTPHeaders: { 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8' },
                            });
                            await lisContext.addInitScript(() => {
                                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                                (window as any).chrome = { runtime: {} };
                            });
                            const lisPage = await lisContext.newPage();
                            await lisPage.goto(linkedinSearchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                            await lisPage.waitForTimeout(2000);
                            // Accept cookie consent
                            for (const sel of ['button:has-text("Accetta tutto")', '#L2AGLb', 'button:has-text("Accept all")']) {
                                try { await lisPage.click(sel, { timeout: 2000 }); await lisPage.waitForTimeout(800); break; } catch { /* ignore */ }
                            }
                            // 📸 Screenshot Google results
                            try {
                                const ssBuf = await lisPage.screenshot({ type: 'jpeg', quality: 50, clip: { x: 0, y: 0, width: 1280, height: 600 } });
                                _emit({ phase: 'scrape', message: `📸 Google: ${linkedinQuery}`, browserUrl: linkedinSearchUrl, browserScreenshot: ssBuf.toString('base64') });
                            } catch { /* ignore */ }
                            // Extract LinkedIn profile URLs
                            const items = await lisPage.evaluate(() => {
                                const links: { href: string; text: string }[] = [];
                                document.querySelectorAll('a[href*="linkedin.com/in"]').forEach(a => {
                                    const href = (a as HTMLAnchorElement).href;
                                    if (href && !links.find(l => l.href === href)) {
                                        links.push({ href, text: (a as HTMLElement).textContent?.trim() || '' });
                                    }
                                });
                                // Also try h3 near linkedin links
                                document.querySelectorAll('h3').forEach(h3 => {
                                    const parent = h3.closest('div');
                                    const a = parent?.querySelector('a[href*="linkedin.com/in"]') as HTMLAnchorElement;
                                    if (a?.href && !links.find(l => l.href === a.href)) {
                                        links.push({ href: a.href, text: h3.textContent?.trim() || '' });
                                    }
                                });
                                return links.slice(0, 5);
                            });
                            if (items.length > 0) {
                                linkedinUrl = items[0].href;
                                const slug = linkedinUrl.match(/\/in\/([^/?]+)/)?.[1] || '';
                                const nameFromSlug = slug.replace(/-\d+$/, '').split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                                if (nameFromSlug && nameFromSlug.split(' ').length >= 2) foundNames.unshift(nameFromSlug);
                                _emit({ phase: 'execute', message: `  ✅ LinkedIn trovato: ${linkedinUrl}` });
                            }
                        } catch { /* ignore */ } finally {
                            await lisBrowser.close();
                        }
                    }

                    // ── Step 3: Hunter ──
                    if (useHunter && domain) {
                        _emit({ phase: 'execute', message: `  📧 Hunter: ${domain}` });
                        try {
                            const hRes = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&type=personal&limit=3&api_key=${apiKeys.hunter}`);
                            if (hRes.ok) {
                                const hData = await hRes.json();
                                const hEmails = (hData.data?.emails || []).map((e: any) => e.value).filter(Boolean);
                                foundEmails.push(...hEmails);
                                const hNames = (hData.data?.emails || []).filter((e: any) => e.first_name).map((e: any) => `${e.first_name} ${e.last_name}`.trim());
                                foundNames.push(...hNames);
                            }
                        } catch { /* ignore */ }

                        // Hunter email-finder with first found name
                        if (foundNames.length > 0) {
                            const [first, ...rest] = foundNames[0].split(' ');
                            const last = rest.join(' ');
                            if (first && last) {
                                try {
                                    const hRes = await fetch(`https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&api_key=${apiKeys.hunter}`);
                                    if (hRes.ok) {
                                        const hData = await hRes.json();
                                        if (hData.data?.email) foundEmails.push(hData.data.email);
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                    }

                    // ── Step 4: Save to DB ──
                    const uniqueEmails = [...new Set(foundEmails.filter(e => !genericPatterns.test(e)))];
                    const updateData: any = {
                        notes: `Arricchito il ${new Date().toLocaleDateString('it-IT')}. Email: ${uniqueEmails.length > 0 ? uniqueEmails.join(', ') : 'nessuna'}. Nomi: ${foundNames.slice(0,3).join(', ') || 'nessuno'}.`,
                    };
                    if (uniqueEmails.length > 0) updateData.email = uniqueEmails[0];
                    if (foundNames.length > 0 && !lead.fullName) updateData.fullName = foundNames[0];
                    if (linkedinUrl) updateData.linkedinUrl = linkedinUrl;

                    await db.lead.update({ where: { id: lead.id }, data: updateData });

                    const status = uniqueEmails.length > 0 ? `✅ email: ${uniqueEmails[0]}` : linkedinUrl ? `🔗 solo LinkedIn` : `❌ nessun contatto`;
                    _emit({ phase: 'execute', message: `  → ${companyName}: ${status}` });
                    results.push({ company: companyName, found: uniqueEmails, linkedinUrl, foundName: foundNames[0] });
                }

                const withEmail = results.filter(r => r.found.length > 0).length;
                const withLinkedin = results.filter(r => r.linkedinUrl).length;
                _emit({ phase: 'save', message: `✅ Completato: ${withEmail} email, ${withLinkedin} LinkedIn trovati su ${results.length} aziende`, progress: 100 });

                return JSON.stringify({
                    success: true,
                    processed: results.length,
                    withEmailFound: withEmail,
                    withLinkedin,
                    results: results.slice(0, 30),
                    summary: `Elaborate ${results.length} aziende: ${withEmail} con email, ${withLinkedin} con LinkedIn. Tutti i lead aggiornati nel DB.`,
                });
            } catch (e: any) {
                return JSON.stringify({ error: `Errore enrichLeadsAutomatically: ${e.message}` });
            }
        }

        case 'searchGooglePlaywright': {
            try {
                const query = args.query as string;
                if (!query?.trim()) {
                    return JSON.stringify({ error: 'Query di ricerca mancante' });
                }
                const numResults = Math.min(args.numResults || 10, 20);
                const isLinkedinSearch = query.includes('linkedin.com');

                // ── Helper: parse HTML links into result items ──────────────────
                const parseLinks = (html: string, skipDomains: string[]): { title: string; url: string; description: string }[] => {
                    const items: { title: string; url: string; description: string }[] = [];
                    const seen = new Set<string>();
                    // Extract href + surrounding text via regex (no DOM needed server-side)
                    const linkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]*(?:<[^/][^>]*>[^<]*<\/[^>]*>)*[^<]*)<\/a>/gi;
                    let m: RegExpExecArray | null;
                    while ((m = linkRe.exec(html)) !== null && items.length < numResults) {
                        const url = m[1].split('&amp;')[0]; // DDG redirects, clean
                        const rawTitle = m[2].replace(/<[^>]+>/g, '').trim();
                        if (!url || skipDomains.some(d => url.includes(d)) || seen.has(url) || rawTitle.length < 5) continue;
                        seen.add(url);
                        items.push({ title: rawTitle, url, description: '' });
                    }
                    return items;
                };

                // ── Step 1: DuckDuckGo HTML (no browser, no bot detection) ──────
                const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=it-it`;
                _emit({ phase: 'scrape', message: `🔎 DDG: ${query}`, browserUrl: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` });
                let results: { title: string; url: string; description: string }[] = [];
                let usedEngine = 'DuckDuckGo';

                try {
                    const ddgRes = await fetch(ddgUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml',
                            'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
                        },
                        signal: AbortSignal.timeout(12000),
                    });
                    if (ddgRes.ok) {
                        const html = await ddgRes.text();
                        // DDG HTML results are in <a class="result__a"> tags
                        const ddgResults: { title: string; url: string; description: string }[] = [];
                        const ddgRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
                        // Also extract from redirect URLs: uddg= param
                        const uddgRe = /uddg=([^&"]+)/gi;
                        let dm: RegExpExecArray | null;
                        while ((dm = ddgRe.exec(html)) !== null && ddgResults.length < numResults) {
                            let url = dm[1];
                            // DDG wraps real URLs in //duckduckgo.com/l/?uddg=
                            const uddgMatch = url.match(/uddg=([^&]+)/);
                            if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
                            const title = dm[2].replace(/<[^>]+>/g, '').trim();
                            const skipDomains = ['duckduckgo.com', 'google.com', 'bing.com'];
                            if (url.startsWith('http') && !skipDomains.some(d => url.includes(d)) && title.length > 3) {
                                ddgResults.push({ title, url, description: '' });
                            }
                        }
                        // Fallback: extract any linkedin.com/in links
                        if (ddgResults.length === 0 && isLinkedinSearch) {
                            const liRe = /href="(https?:\/\/[^"]*linkedin\.com\/in\/[^"]+)"/gi;
                            let lm: RegExpExecArray | null;
                            while ((lm = liRe.exec(html)) !== null) {
                                const url = lm[1].split('?')[0];
                                if (!ddgResults.find(r => r.url === url)) {
                                    ddgResults.push({ title: url, url, description: '' });
                                }
                            }
                        }
                        if (ddgResults.length > 0) results = ddgResults;
                    }
                } catch { /* fall through to Bing */ }

                // ── Step 2: Bing fallback via simple fetch (if DDG got 0) ────────
                if (results.length === 0) {
                    usedEngine = 'Bing';
                    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}&setlang=IT`;
                    _emit({ phase: 'scrape', message: `  🔎 Bing fallback: ${query}`, browserUrl: bingUrl });
                    try {
                        const bRes = await fetch(bingUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
                                'Accept': 'text/html',
                                'Accept-Language': 'it-IT,it;q=0.9',
                            },
                            signal: AbortSignal.timeout(12000),
                        });
                        if (bRes.ok) {
                            const html = await bRes.text();
                            // Bing results: <h2><a href="...">title</a></h2>
                            const bingRe = /<h2[^>]*><a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]+)<\/a>/gi;
                            let bm: RegExpExecArray | null;
                            const skipDomains = ['bing.com', 'microsoft.com', 'msn.com'];
                            while ((bm = bingRe.exec(html)) !== null && results.length < numResults) {
                                const url = bm[1], title = bm[2].trim();
                                if (!skipDomains.some(d => url.includes(d)) && title.length > 3) {
                                    results.push({ title, url, description: '' });
                                }
                            }
                            // LinkedIn links from Bing
                            if (isLinkedinSearch && results.length === 0) {
                                const liRe = /href="(https?:\/\/[^"]*linkedin\.com\/in\/[^"]+)"/gi;
                                let lm: RegExpExecArray | null;
                                while ((lm = liRe.exec(html)) !== null && results.length < numResults) {
                                    const url = lm[1].split('?')[0];
                                    if (!results.find(r => r.url === url)) results.push({ title: url, url, description: '' });
                                }
                            }
                        }
                    } catch { /* ignore */ }
                }

                // ── Step 3: Playwright + Bing as last resort ────────────────────
                if (results.length === 0) {
                    usedEngine = 'Playwright/Bing';
                    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}`;
                    _emit({ phase: 'scrape', message: `  🔎 Playwright Bing: ${query}`, browserUrl: bingUrl });
                    try {
                        const { chromium } = await import('playwright');
                        const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
                        try {
                            const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36' });
                            await page.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                            await page.waitForTimeout(2000);
                            // Screenshot
                            try {
                                const ss = await page.screenshot({ type: 'jpeg', quality: 50, clip: { x: 0, y: 0, width: 1280, height: 600 } });
                                _emit({ phase: 'scrape', message: `📸 Bing: ${query}`, browserUrl: bingUrl, browserScreenshot: ss.toString('base64') });
                            } catch { /* ignore */ }
                            results = await page.evaluate((params: { max: number; isLI: boolean }) => {
                                const items: { title: string; url: string; description: string }[] = [];
                                const seen = new Set<string>();
                                document.querySelectorAll('h2 > a[href^="http"], li.b_algo a[href^="http"]').forEach(a => {
                                    const url = (a as HTMLAnchorElement).href;
                                    const title = (a as HTMLElement).textContent?.trim() || '';
                                    if (!url.includes('bing.com') && !url.includes('microsoft.com') && title && !seen.has(url)) {
                                        seen.add(url);
                                        items.push({ title, url, description: '' });
                                    }
                                });
                                if (params.isLI) {
                                    document.querySelectorAll('a[href*="linkedin.com/in"]').forEach(a => {
                                        const url = (a as HTMLAnchorElement).href.split('?')[0];
                                        if (!seen.has(url)) { seen.add(url); items.push({ title: url, url, description: '' }); }
                                    });
                                }
                                return items.slice(0, params.max);
                            }, { max: numResults, isLI: isLinkedinSearch });
                        } finally { await browser.close(); }
                    } catch { /* ignore */ }
                }

                const linkedinResults = results.filter(r => r.url.includes('linkedin.com/in'));
                _emit({ phase: 'execute', message: `  ✅ ${usedEngine}: ${results.length} risultati${linkedinResults.length > 0 ? `, ${linkedinResults.length} LinkedIn` : ''} per "${query.slice(0, 60)}"` });

                return JSON.stringify({
                    query,
                    engine: usedEngine,
                    resultsCount: results.length,
                    linkedinProfilesFound: linkedinResults.length,
                    results: results.slice(0, numResults),
                    tip: linkedinResults.length > 0
                        ? `LinkedIn trovati! Estrai nome dallo slug (es. /in/mario-rossi-123 → "Mario Rossi") poi findEmailHunter(domain, first_name, last_name).`
                        : results.length === 0
                        ? 'Nessun risultato su DDG/Bing. Prova: browsePage sul sito /team /about, oppure findEmailsHunter sul dominio.'
                        : 'Risultati trovati ma nessun profilo LinkedIn. Prova query più specifica.',
                }, null, 2);
            } catch (e: any) {
                return JSON.stringify({ error: `Errore searchGooglePlaywright: ${e.message}` });
            }
        }

        case 'browsePage': {
            try {
                const url = args.url as string;
                if (!url || !url.startsWith('http')) {
                    return JSON.stringify({ error: 'URL non valido' });
                }
                const blockedDomains = ['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com'];
                if (blockedDomains.some(d => url.includes(d))) {
                    return JSON.stringify({ error: `Non posso navigare ${url} — richiede login. Per trovare profili LinkedIn usa enrichLeadsAutomatically oppure searchGooglePlaywright con query '"NomeAzienda" site:linkedin.com/in'` });
                }

                // Emit browser URL so the panel shows navigation
                _emit({ phase: 'scrape', message: `🌐 Navigando: ${url}`, browserUrl: url });

                const { chromium } = await import('playwright');
                const browser = await chromium.launch({ headless: true });
                const context = await browser.newContext({
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    locale: 'it-IT',
                    viewport: { width: 1280, height: 800 },
                });
                const page = await context.newPage();

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                    // Click cookie banner if selector provided
                    if (args.clickSelector) {
                        try { await page.click(args.clickSelector, { timeout: 3000 }); } catch { /* ignore */ }
                    }

                    // Auto-dismiss common cookie banners
                    const cookieSelectors = [
                        'button[id*="accept"]', 'button[class*="accept"]', 'button[class*="cookie"]',
                        'a[id*="accept"]', '#CybotCookiebotDialogBodyButtonAccept',
                        '.cookie-accept', '.accept-cookies', '[data-cookiebanner="accept"]',
                    ];
                    for (const sel of cookieSelectors) {
                        try { await page.click(sel, { timeout: 1000 }); break; } catch { /* ignore */ }
                    }

                    // Wait for optional text
                    if (args.waitForText) {
                        try { await page.waitForSelector(`text=${args.waitForText}`, { timeout: 5000 }); } catch { /* ignore */ }
                    } else {
                        await page.waitForTimeout(1500);
                    }

                    // 📸 Take screenshot and emit to browser panel
                    try {
                        const screenshotBuf = await page.screenshot({ type: 'jpeg', quality: 55, clip: { x: 0, y: 0, width: 1280, height: 600 } });
                        const screenshotB64 = screenshotBuf.toString('base64');
                        _emit({ phase: 'scrape', message: `📸 ${url}`, browserUrl: url, browserScreenshot: screenshotB64 });
                    } catch { /* ignore screenshot errors */ }

                    // Extract visible text
                    const text = await page.evaluate(() => {
                        // Remove scripts, styles, nav, footer
                        ['script','style','nav','footer','header'].forEach(tag => {
                            document.querySelectorAll(tag).forEach(el => el.remove());
                        });
                        return (document.body?.innerText || '').replace(/\s{3,}/g, '\n\n').trim().slice(0, 800);
                    });

                    // Extract all emails from full HTML
                    const html = await page.content();
                    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
                    const allEmails = html.match(emailRegex) || [];
                    const genericPatterns = /^(info|contact|support|admin|noreply|no-reply|hello|sales|marketing|office|hr|jobs|press|webmaster|help|service|team|privacy|dpo|legal)@/i;
                    const emails = [...new Set(allEmails)].filter(e => !genericPatterns.test(e)).slice(0, 20);

                    // Extract page title
                    const title = await page.title();

                    return JSON.stringify({
                        url,
                        title,
                        textLength: text.length,
                        emails,
                        emailsFound: emails.length,
                        text,
                        note: emails.length > 0
                            ? `✅ Trovate ${emails.length} email personali nella pagina`
                            : 'Nessuna email trovata — cerca nomi nel testo e usa Hunter per trovarle',
                    });
                } finally {
                    await browser.close();
                }
            } catch (e: any) {
                return JSON.stringify({ error: `Errore browsePage: ${e.message}`, url: args.url });
            }
        }

        case 'fetchWebPage': {
            try {
                const url = args.url as string;
                if (!url || !url.startsWith('http')) {
                    return JSON.stringify({ error: 'URL non valido. Deve iniziare con http:// o https://' });
                }
                // Block social networks that require login
                const blockedDomains = ['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com'];
                if (blockedDomains.some(d => url.includes(d))) {
                    return JSON.stringify({ error: `Non posso navigare ${url} — richiede login. Per trovare profili LinkedIn usa enrichLeadsAutomatically oppure searchGooglePlaywright con query '"NomeAzienda" site:linkedin.com/in'` });
                }

                // Emit browser URL so the panel shows the fetch
                _emit({ phase: 'scrape', message: `🌐 Fetching: ${url}`, browserUrl: url });

                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
                    },
                    signal: AbortSignal.timeout(15000),
                });

                if (!response.ok) {
                    return JSON.stringify({ error: `HTTP ${response.status} — pagina non accessibile`, url });
                }

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('html') && !contentType.includes('text')) {
                    return JSON.stringify({ error: `Contenuto non testuale (${contentType}), non leggibile`, url });
                }

                const html = await response.text();

                // Strip HTML tags and clean up text
                const text = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/\s{3,}/g, '\n\n')
                    .trim()
                    .slice(0, 800); // Limit to avoid context overflow

                // Auto-extract emails if requested
                const extractEmails = args.extractEmails !== false;
                let emails: string[] = [];
                if (extractEmails) {
                    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
                    const allEmails = html.match(emailRegex) || [];
                    // Filter out generic/noreply emails
                    const genericPatterns = /^(info|contact|support|admin|noreply|no-reply|hello|sales|marketing|office|hr|jobs|press|webmaster|help|service|team)@/i;
                    emails = [...new Set(allEmails)].filter(e => !genericPatterns.test(e)).slice(0, 20);
                }

                return JSON.stringify({
                    url,
                    status: response.status,
                    textLength: text.length,
                    emails,
                    emailsFound: emails.length,
                    text,
                    note: emails.length > 0 ? `Trovate ${emails.length} email personali nella pagina` : 'Nessuna email personale trovata — cerca nomi nel testo e usa Hunter',
                });
            } catch (e: any) {
                if (e.name === 'TimeoutError') return JSON.stringify({ error: 'Timeout — sito troppo lento o non raggiungibile', url: args.url });
                return JSON.stringify({ error: `Errore fetchWebPage: ${e.message}`, url: args.url });
            }
        }

        default:
            return JSON.stringify({
                error: `Tool "${name}" non esiste. Usa SOLO i tool elencati qui sotto.`,
                available_tools: [
                    'enrichLeadsAutomatically',
                    'getExistingLeadEmails',
                    'getLeadsToEnrich',
                    'updateLead',
                    'browsePage',
                    'fetchWebPage',
                    'searchGooglePlaywright',
                    'searchGoogleWeb',
                    'scrapeWithFirecrawl',
                    'mapWebsiteFirecrawl',
                    'scrapeWebsite',
                    'findEmailsHunter',
                    'findEmailHunter',
                    'verifyEmail',
                    'searchPeopleApollo',
                    'searchCompaniesApollo',
                    'searchProspectsVibe',
                    'searchBusinessesVibe',
                    'searchGoogleMaps',
                    'runApifyActor',
                    'saveLeads',
                    'getLeadStats',
                    'exportLeads',
                ],
                hint: 'Per navigare il web usa browsePage(url) o fetchWebPage(url). Per cercare su Google GRATIS usa searchGooglePlaywright(query). Per cercare LinkedIn: searchGooglePlaywright con query "NomeAzienda" site:linkedin.com/in. Per arricchire lead esistenti usa enrichLeadsAutomatically. NON usare fetch, browser_navigate, ddg_search o altri tool non in lista.',
            });
    }
}

// ===================== MAIN FLOW =====================

export interface LeadGeneratorResult {
    text: string;
    cost: number;
    totalTokens: number;
}

export async function leadGeneratorFlow(input: LeadGeneratorInput): Promise<LeadGeneratorResult> {
    // Route to Claude CLI (Anthropic API) if selected
    if (input.aiProvider === 'claude-cli') {
        return leadGeneratorFlowClaude(input);
    }

    if (!input.apiKey) {
        throw new Error('API key OpenRouter mancante. Configura la chiave nelle Impostazioni.');
    }

    const apiKeys = input.leadGenApiKeys || {};

    const systemMessage = {
        role: 'system' as const,
        content: [{ text: buildSystemPrompt(input.companyId, input.skillsContext) }],
    };

    // Truncate conversation history
    const MAX_HISTORY_MESSAGES = 20;
    const truncatedMessages = input.messages.length > MAX_HISTORY_MESSAGES
        ? input.messages.slice(-MAX_HISTORY_MESSAGES)
        : input.messages;

    // Convert Genkit message format to OpenAI format
    const fullHistory = [systemMessage, ...truncatedMessages];
    const openaiMessages = fullHistory.map(m => {
        const text = m.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '';
        const role = m.role === 'model' ? 'assistant' : m.role;
        return { role, content: text };
    });

    const activityLog: string[] = [];
    const emit = (evt: any) => {
        if (input.onProgress) input.onProgress(evt);
        if (evt.message) activityLog.push(evt.message);
    };
    const MAX_TOOL_ROUNDS = 150;
    let lastError = '';
    let accumulatedCost = 0;
    let accumulatedTokens = 0;
    let totalLeadsFound = 0;
    let totalLeadsWithEmail = 0;

    const modelName = input.model || 'google/gemini-2.5-flash';
    emit({ phase: 'plan', message: `Avvio ricerca con ${modelName}...`, progress: 2 });

    // ── PRE-FLIGHT: verify model supports tool calling ──────────────────────
    try {
        const testRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                messages: [{ role: 'user', content: 'Chiama il tool getLeadStats.' }],
                tools: leadGenTools,
                tool_choice: 'auto',
                max_tokens: 100,
            }),
        });
        if (testRes.ok) {
            const testData = await testRes.json();
            const testChoice = testData.choices?.[0];
            const hasToolCall = !!(testChoice?.message?.tool_calls?.length);
            const hasContent = !!(testChoice?.message?.content);
            if (!hasToolCall && !hasContent) {
                // Empty response — model likely doesn't support tool calling
                return {
                    text: `❌ Il modello **${modelName}** non supporta tool calling (risposta vuota al test).\n\nModelli compatibili con il Lead Generator:\n• \`google/gemini-2.5-flash-preview\` 🟢 gratis, ottimo\n• \`google/gemini-flash-1.5\` 🟢 gratis, veloce\n• \`google/gemini-2.0-flash-001\` 🟢 gratis\n• \`meta-llama/llama-3.3-70b-instruct\` 🟢 gratis\n• \`openai/gpt-4o-mini\` 🟡 economico\n• \`openai/gpt-4o\` 🟡 potente\n\nCambia modello nel selettore in alto a destra e riprova.`,
                    cost: 0, totalTokens: 0,
                };
            }
            if (!hasToolCall && hasContent) {
                // Model responded with text instead of tool call
                return {
                    text: `❌ Il modello **${modelName}** non esegue tool calling: ha risposto con testo invece di chiamare un tool.\n\nQuesto modello non è compatibile con il Lead Generator.\n\nModelli compatibili:\n• \`google/gemini-2.5-flash-preview\` 🟢 gratis, ottimo\n• \`google/gemini-flash-1.5\` 🟢 gratis, veloce\n• \`google/gemini-2.0-flash-001\` 🟢 gratis\n• \`meta-llama/llama-3.3-70b-instruct\` 🟢 gratis\n• \`openai/gpt-4o-mini\` 🟡 economico\n• \`openai/gpt-4o\` 🟡 potente\n\nCambia modello nel selettore in alto a destra e riprova.`,
                    cost: 0, totalTokens: 0,
                };
            }
            // hasToolCall = true → model works, proceed
            emit({ phase: 'plan', message: `✅ ${modelName} supporta tool calling — avvio ricerca...`, progress: 5 });
        } else {
            const errData = await testRes.json().catch(() => ({}));
            const errMsg = errData?.error?.message || `HTTP ${testRes.status}`;
            const errLower = errMsg.toLowerCase();
            if (errLower.includes('tool') || errLower.includes('function') || testRes.status === 400) {
                return {
                    text: `❌ Il modello **${modelName}** ha rifiutato il tool calling: "${errMsg}"\n\nModelli compatibili:\n• \`google/gemini-2.5-flash-preview\` 🟢 gratis\n• \`google/gemini-flash-1.5\` 🟢 gratis\n• \`openai/gpt-4o-mini\` 🟡 economico\n\nCambia modello e riprova.`,
                    cost: 0, totalTokens: 0,
                };
            }
            // Other error (auth, quota) — let the main loop handle it
        }
    } catch (e: any) {
        // Network error during test — skip test, let main loop handle
        console.warn('[LeadGen] Pre-flight test failed:', e.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // Track search results and whether saveLeads was called
    let saveLeadsCalled = false;
    const collectedLeads: any[] = [];
    let consecutiveTextRounds = 0; // detect models that refuse to call tools
    let unknownToolCount = 0; // detect models that invent tool names
    let totalToolCallsMade = 0; // total tool calls executed across all rounds

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${input.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: input.model || 'google/gemini-2.5-flash',
                    messages: openaiMessages,
                    tools: leadGenTools,
                    tool_choice: 'auto',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                lastError = errorData?.error?.message || `HTTP ${response.status}`;
                if (response.status === 429) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                // Detect tool calling not supported errors
                const errLower = lastError.toLowerCase();
                if (
                    response.status === 400 &&
                    (errLower.includes('tool') || errLower.includes('function') || errLower.includes('tool_choice'))
                ) {
                    throw new Error(TOOL_NOT_SUPPORTED_ERROR(input.model || 'questo modello'));
                }
                throw new Error(lastError);
            }

            const data = await response.json();

            // Track tokens from usage data
            if (data.usage) {
                accumulatedTokens += data.usage.total_tokens || 0;
            }

            // Fetch actual cost from OpenRouter generation stats
            const generationId = data.id;
            if (generationId && input.apiKey) {
                try {
                    // Small delay to let OpenRouter finalize generation stats
                    await new Promise(r => setTimeout(r, 800));
                    const costRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                        headers: { 'Authorization': `Bearer ${input.apiKey}` },
                    });
                    if (costRes.ok) {
                        const costData = await costRes.json();
                        const genCost = costData.data?.total_cost ?? costData.data?.usage?.cost ?? 0;
                        console.log(`[LeadGen-Cost] id=${generationId} cost=${genCost}`, JSON.stringify(costData.data).slice(0, 200));
                        if (genCost > 0) accumulatedCost += genCost;
                    } else {
                        console.warn(`[LeadGen-Cost] generation stats failed: ${costRes.status}`);
                    }
                } catch (e) {
                    console.warn('[LeadGen-Cost] cost fetch error:', e);
                }
            }

            const choice = data.choices?.[0];
            if (!choice || (!choice.message?.content && !choice.message?.tool_calls?.length)) {
                // Some models return empty choices when they can't proceed
                lastError = 'Nessuna risposta dal modello';
                consecutiveTextRounds++;
                if (consecutiveTextRounds >= 3 && totalToolCallsMade === 0) {
                    throw new Error(TOOL_NOT_SUPPORTED_ERROR(input.model || 'questo modello'));
                }
                // If we already did some work, just exit gracefully
                if (totalToolCallsMade > 0) break;
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }

            const message = choice.message;

            // If the model made tool calls, execute them and continue
            if (message.tool_calls && message.tool_calls.length > 0) {
                consecutiveTextRounds = 0; // reset — model is cooperating
                totalToolCallsMade += message.tool_calls.length;
                openaiMessages.push(message);

                for (const toolCall of message.tool_calls) {
                    const fnName = toolCall.function.name;
                    let fnArgs: any = {};
                    try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }

                    console.log(`[LeadGen] Tool call: ${fnName}`, fnName === 'saveLeads' ? `(${fnArgs.leads?.length || 0} leads)` : '');

                    // Emit progress before executing tool
                    const isScrape = ['scrapeWithFirecrawl', 'scrapeWebsite', 'mapWebsiteFirecrawl', 'browsePage', 'fetchWebPage'].includes(fnName);
                    const isSearch = ['searchGoogleWeb', 'searchGoogleMaps', 'searchPeopleApollo', 'searchCompaniesApollo', 'searchProspectsVibe', 'searchBusinessesVibe'].includes(fnName);
                    const detail = fnArgs.url || fnArgs.domain || fnArgs.query || fnArgs.searchName || '';

                    const toolMsg: Record<string, string> = {
                        browsePage: `🌐 Browser: ${fnArgs.url || ''}`,
                        fetchWebPage: `🌐 Fetch: ${fnArgs.url || ''}`,
                        getLeadsToEnrich: '📋 Caricando lista aziende da arricchire...',
                        updateLead: `✏️ Aggiornando lead ${fnArgs.leadId || ''}`,
                        searchPeopleApollo: '🔍 Apollo: cercando persone...',
                        searchCompaniesApollo: '🔍 Apollo: cercando aziende...',
                        findEmailsHunter: `📧 Hunter: scansione dominio ${fnArgs.domain || ''}`,
                        findEmailHunter: `📧 Hunter: email per ${fnArgs.first_name || ''} ${fnArgs.last_name || ''}`,
                        verifyEmail: `✉️ Verificando ${fnArgs.email || ''}`,
                        searchGoogleWeb: `🔍 Google: "${(fnArgs.query || '').substring(0, 60)}"`,
                        searchGoogleMaps: `🗺️ Maps: "${fnArgs.query || ''}"`,
                        scrapeWithFirecrawl: `🌐 Navigando: ${fnArgs.url || ''}`,
                        mapWebsiteFirecrawl: `🌐 Mappando: ${fnArgs.url || ''}`,
                        scrapeWebsite: `🌐 Navigando: ${fnArgs.url || ''}`,
                        runApifyActor: '🤖 Apify: scraping avanzato...',
                        searchProspectsVibe: '🔍 Vibe: cercando contatti...',
                        searchBusinessesVibe: '🔍 Vibe: cercando aziende...',
                        saveLeads: `💾 Salvando ${fnArgs.leads?.length || 0} lead...`,
                        getExistingLeadEmails: '🔎 Controllo duplicati nel DB...',
                    };

                    const msg = toolMsg[fnName] || `⚙️ ${fnName}${detail ? ': ' + detail.substring(0, 50) : ''}`;
                    emit({
                        phase: fnName === 'saveLeads' ? 'save' : isScrape ? 'scrape' : 'execute',
                        message: msg,
                        detail,
                        browserUrl: isScrape ? (fnArgs.url || undefined) : undefined,
                        leadsFound: totalLeadsFound,
                        leadsWithEmail: totalLeadsWithEmail,
                    });

                    if (fnName === 'saveLeads') saveLeadsCalled = true;

                    // Track unknown tools
                    const knownTools = ['enrichLeadsAutomatically','getExistingLeadEmails','getLeadsToEnrich','updateLead','browsePage','fetchWebPage','searchGooglePlaywright','searchGoogleWeb','scrapeWithFirecrawl','mapWebsiteFirecrawl','scrapeWebsite','findEmailsHunter','findEmailHunter','verifyEmail','searchPeopleApollo','searchCompaniesApollo','searchProspectsVibe','searchBusinessesVibe','searchGoogleMaps','runApifyActor','saveLeads','getLeadStats','exportLeads'];
                    if (!knownTools.includes(fnName)) {
                        unknownToolCount++;
                        emit({ phase: 'execute', message: `⚠️ Tool "${fnName}" non valido (${unknownToolCount}/5) — correggo...` });
                        if (unknownToolCount >= 5) {
                            throw new Error(TOOL_NOT_SUPPORTED_ERROR(input.model || 'questo modello'));
                        }
                    }

                    let result: string;
                    try {
                        result = await executeToolCall(fnName, fnArgs, input.companyId, apiKeys, input.conversationId, emit);
                        // Update counters + notify after saveLeads
                        if (fnName === 'saveLeads' && fnArgs.leads?.length) {
                            totalLeadsFound += fnArgs.leads.length;
                            totalLeadsWithEmail += fnArgs.leads.filter((l: any) => l.email).length;
                            emit({
                                phase: 'save',
                                message: `✅ Salvati ${fnArgs.leads.length} lead — totale: ${totalLeadsFound} (${totalLeadsWithEmail} con email)`,
                                leadsFound: totalLeadsFound,
                                leadsWithEmail: totalLeadsWithEmail,
                            });
                        }
                    } catch (e: any) {
                        console.error(`[LeadGen] Tool error: ${fnName}:`, e.message);
                        result = JSON.stringify({ error: e.message, suggestion: 'Prova un approccio diverso o controlla le chiavi API nelle Impostazioni.' });
                    }

                    // Collect leads from search tool results for auto-save
                    const searchToolNames = ['searchPeopleApollo', 'findEmailsHunter', 'findEmailHunter', 'searchGoogleMaps', 'searchCompaniesApollo', 'searchProspectsVibe', 'searchBusinessesVibe'];
                    if (searchToolNames.includes(fnName)) {
                        try {
                            const parsed = JSON.parse(result);
                            if (!parsed.error) {
                                const people = parsed.people || parsed.emails || parsed.results || parsed.organizations || parsed.businesses || [];
                                const items = fnName === 'findEmailHunter' && parsed.email ? [parsed] : people;
                                for (const p of items) {
                                    if (p.email || p.companyName || p.fullName || p.companyWebsite) {
                                        collectedLeads.push(normalizeLead(p, fnName));
                                    }
                                }
                            }
                        } catch { /* ignore parse errors */ }
                    }

                    // Truncate ALL tool results aggressively to avoid context overflow
                    let storedResult = result;
                    try {
                        const parsed = JSON.parse(result);
                        const heavyTools = ['browsePage', 'fetchWebPage', 'scrapeWithFirecrawl', 'scrapeWebsite', 'mapWebsiteFirecrawl', 'searchGooglePlaywright'];
                        if (heavyTools.includes(fnName)) {
                            // Heavy tools: keep only structured data + 500 chars of text
                            storedResult = JSON.stringify({
                                url: parsed.url,
                                query: parsed.query,
                                emails: parsed.emails || [],
                                emailsFound: parsed.emailsFound || 0,
                                resultsCount: parsed.resultsCount,
                                results: (parsed.results || []).slice(0, 5),
                                linkedinProfilesFound: parsed.linkedinProfilesFound,
                                text: (parsed.text || parsed.content || '').slice(0, 500),
                                note: parsed.note || parsed.tip || '',
                                error: parsed.error,
                            });
                        } else if (result.length > 1000) {
                            // Other large results: truncate to 1000 chars
                            storedResult = result.slice(0, 1000) + '…[troncato]';
                        }
                    } catch { /* keep original if parse fails */ }

                    openaiMessages.push({
                        role: 'tool',
                        content: storedResult,
                        tool_call_id: toolCall.id,
                    } as any);
                }

                // Prune old messages aggressively to prevent context overflow
                if (openaiMessages.length > 30) {
                    const systemMsg = openaiMessages[0];
                    const recent = openaiMessages.slice(-20);
                    openaiMessages.length = 0;
                    openaiMessages.push(systemMsg, ...recent);
                    emit({ phase: 'execute', message: `♻️ Contesto potato (tengo ultimi 20 messaggi)` });
                }

                continue;
            }

            // Model returned text without tool calls
            consecutiveTextRounds++;

            // Force tool use if model is writing text mid-work instead of calling tools
            const isJustStarting = totalToolCallsMade < 3;
            const isWritingReportMidWork = totalToolCallsMade >= 3 && consecutiveTextRounds <= 1 && round < MAX_TOOL_ROUNDS - 5;
            if ((isJustStarting && consecutiveTextRounds <= 2) || isWritingReportMidWork) {
                emit({ phase: 'execute', message: '⚡ Forzo continuazione lavoro...' });
                openaiMessages.push(message);
                openaiMessages.push({
                    role: 'user',
                    content: isJustStarting
                        ? 'SMETTI DI SCRIVERE PIANI. Chiama SUBITO getLeadsToEnrich poi browsePage. NON scrivere altro testo. AGISCI ORA.'
                        : 'NON scrivere rapporti intermedi. Hai ancora aziende da elaborare. Chiama SUBITO il prossimo tool (browsePage o findEmailsHunter) sulla prossima azienda. CONTINUA SENZA FERMARTI.',
                } as any);
                continue;
            }

            // After 3 consecutive text-only rounds at startup → model doesn't support tools
            if (isJustStarting && consecutiveTextRounds >= 3) {
                throw new Error(TOOL_NOT_SUPPORTED_ERROR(input.model || 'questo modello'));
            }

            // No tool calls - auto-save collected leads if model didn't call saveLeads
            if (!saveLeadsCalled && collectedLeads.length > 0) {
                console.warn(`[LeadGen] WARNING: Model did NOT call saveLeads! Auto-saving ${collectedLeads.length} leads as fallback.`);
                try {
                    // Use quality engine for filtering and deduplication
                    const uniqueLeads = deduplicateLeads(collectedLeads, new Set())
                        .filter(l => l.email && !isGenericEmail(l.email))
                        .map(l => {
                            l.confidence = scoreLeadCompleteness(l);
                            delete l._enriched;
                            delete l._sources;
                            return l;
                        });

                    if (uniqueLeads.length > 0) {
                        await executeToolCall('saveLeads', {
                            searchName: 'Ricerca automatica',
                            leads: uniqueLeads,
                        }, input.companyId, apiKeys, input.conversationId);
                        console.log(`[LeadGen] Auto-saved ${uniqueLeads.length} leads`);
                    }
                } catch (e: any) {
                    console.error('[LeadGen] Auto-save failed:', e.message);
                }
            }

            // Return the final text response with cost info
            return {
                text: message.content || 'Nessuna risposta.',
                cost: accumulatedCost,
                totalTokens: accumulatedTokens,
            };
        } catch (e: any) {
            lastError = e.message;
            if (round < MAX_TOOL_ROUNDS - 1) {
                openaiMessages.push({
                    role: 'assistant',
                    content: `[Errore interno round ${round + 1}: ${e.message}. Riprovo con approccio diverso...]`,
                } as any);
                continue;
            }
        }
    }

    // Don't show "tool not supported" error if the model clearly did work
    const isToolSupportError = lastError?.includes('non supporta') || lastError?.includes('tool calling');
    const relevantError = (lastError && !isToolSupportError) ? lastError : '';

    // Build log summary for the chat message
    const logSummary = activityLog.length > 0
        ? `\n\n---\n**Log operazioni:**\n\`\`\`\n${activityLog.slice(-80).join('\n')}\n\`\`\``
        : '';

    return {
        text: totalToolCallsMade > 0
            ? `Ho completato ${totalToolCallsMade} operazioni e trovato ${totalLeadsFound} lead.${relevantError ? ` Nota: ${relevantError}` : ''}${logSummary}`
            : `❌ Il modello non ha eseguito nessuna operazione dopo ${MAX_TOOL_ROUNDS} tentativi.\n\nPossibili cause:\n• Il modello selezionato non supporta tool calling\n• Quota API esaurita\n• Errore: ${lastError || 'sconosciuto'}\n\nProva con: google/gemini-flash-1.5 o openai/gpt-4o-mini${logSummary}`,
        cost: accumulatedCost,
        totalTokens: accumulatedTokens,
    };
}

// ===================== LEAD QUALITY ENGINE =====================

const GENERIC_EMAIL_PREFIXES = [
    'info@', 'admin@', 'support@', 'contatti@', 'hello@', 'office@', 'sales@',
    'marketing@', 'noreply@', 'contact@', 'segreteria@', 'amministrazione@',
    'ordini@', 'orders@', 'customer@', 'service@', 'webstore@', 'reception@',
    'direzione@', 'commerciale@', 'hr@', 'jobs@', 'careers@', 'press@', 'media@',
    'billing@', 'accounting@', 'general@', 'team@', 'help@', 'enquiries@',
    'feedback@', 'helpdesk@', 'postmaster@', 'abuse@', 'webmaster@',
];

function isGenericEmail(email: string): boolean {
    if (!email) return true;
    const lower = email.toLowerCase();
    return GENERIC_EMAIL_PREFIXES.some(p => lower.startsWith(p));
}

function extractDomain(urlOrDomain: string | null | undefined): string | null {
    if (!urlOrDomain) return null;
    try {
        if (urlOrDomain.includes('://')) {
            return new URL(urlOrDomain).hostname.replace(/^www\./, '');
        }
        return urlOrDomain.replace(/^www\./, '').split('/')[0];
    } catch { return urlOrDomain.replace(/^www\./, '').split('/')[0]; }
}

function scoreLeadCompleteness(lead: any): number {
    let score = 0;
    if (lead.email && !isGenericEmail(lead.email)) score += 25;
    else if (lead.email) score += 5;
    if (lead.emailStatus === 'valid') score += 10;
    if (lead.fullName && lead.fullName.trim().split(/\s+/).length >= 2) score += 12;
    if (lead.jobTitle) score += 8;
    if (lead.phone) score += 8;
    if (lead.linkedinUrl) score += 7;
    if (lead.companyName) score += 8;
    if (lead.companyWebsite || lead.companyDomain) score += 5;
    if (lead.companyIndustry) score += 5;
    if (lead.companyCity) score += 4;
    if (lead.companyCountry) score += 3;
    if (lead.companySize) score += 3;
    if (lead.revenueYear3 || lead.revenueYear2) score += 2;
    if (lead.notes && lead.notes.length > 30) score += 3;
    return Math.min(100, score);
}

function normalizeLead(raw: any, toolName: string): any {
    const firstName = raw.firstName || raw.first_name || null;
    const lastName = raw.lastName || raw.last_name || null;
    let fullName = raw.fullName || raw.full_name || raw.name || null;
    if (!fullName && (firstName || lastName)) {
        fullName = `${firstName || ''} ${lastName || ''}`.trim();
    }
    if (fullName) fullName = fullName.replace(/\b\w/g, (c: string) => c.toUpperCase());

    const companyWebsite = raw.companyWebsite || raw.company_website || raw.website || null;
    const companyDomain = raw.companyDomain || raw.company_domain || raw.domain || extractDomain(companyWebsite);

    const source = toolName.includes('Apollo') ? 'apollo'
        : toolName.includes('Hunter') ? 'hunter'
        : toolName.includes('Google') ? 'google_maps'
        : toolName.includes('Vibe') ? 'vibe_prospecting'
        : toolName.includes('Firecrawl') ? 'firecrawl'
        : toolName.includes('Apify') ? 'apify'
        : 'scraping';

    return {
        firstName, lastName, fullName,
        jobTitle: raw.jobTitle || raw.job_title || raw.position || raw.title || null,
        email: raw.email || raw.value || raw.professional_email || null,
        phone: raw.phone || raw.direct_phone || null,
        linkedinUrl: raw.linkedinUrl || raw.linkedin_url || raw.linkedin || null,
        companyName: raw.companyName || raw.company_name || raw.organization || null,
        companyDomain, companyWebsite,
        companySize: raw.companySize || raw.company_size || raw.number_of_employees_range || null,
        companyIndustry: raw.companyIndustry || raw.company_industry || raw.industry || raw.naics_description || raw.type || null,
        companyCity: raw.companyCity || raw.company_city || raw.city || raw.city_name || null,
        companyCountry: raw.companyCountry || raw.company_country || raw.country || raw.country_name || null,
        source,
        notes: raw.notes || raw.description || raw.business_description || null,
        confidence: null,
        emailStatus: raw.emailStatus || raw.email_status || null,
        revenueYear1: raw.revenueYear1 || null,
        revenueYear2: raw.revenueYear2 || null,
        revenueYear3: raw.revenueYear3 || raw.revenue || null,
        profitYear1: raw.profitYear1 || null,
        profitYear2: raw.profitYear2 || null,
        profitYear3: raw.profitYear3 || null,
    };
}

function mergeLeadData(base: any, enricher: any): any {
    const merged = { ...base };
    for (const key of Object.keys(enricher)) {
        if (key.startsWith('_')) continue;
        if (enricher[key] && !base[key]) {
            merged[key] = enricher[key];
        }
    }
    return merged;
}

function deduplicateLeads(leads: any[], existingEmails: Set<string>): any[] {
    const byEmail = new Map<string, any>();
    const noEmail: any[] = [];
    for (const lead of leads) {
        if (!lead.email) { noEmail.push(lead); continue; }
        const key = lead.email.toLowerCase();
        if (existingEmails.has(key)) continue;
        if (byEmail.has(key)) {
            byEmail.set(key, mergeLeadData(byEmail.get(key), lead));
        } else {
            byEmail.set(key, lead);
        }
    }
    const result = [...byEmail.values()];
    for (const lead of noEmail) {
        if (lead.companyDomain || lead.companyWebsite) {
            const exists = result.some(r => r.companyName && r.companyName === lead.companyName);
            if (!exists) result.push(lead);
        }
    }
    return result;
}

// ===================== SESSION MANAGEMENT =====================

function registerSession(input: LeadGeneratorInput): string {
    const token = randomUUID();
    activeSessions.set(token, {
        companyId: input.companyId,
        apiKeys: (input.leadGenApiKeys || {}) as Record<string, string>,
        conversationId: input.conversationId,
        createdAt: Date.now(),
    });
    // Auto-cleanup after 30 minutes
    // 4 hours timeout — enough time to process 400+ companies
    setTimeout(() => activeSessions.delete(token), 4 * 60 * 60 * 1000);
    return token;
}

// ===================== CLI AGENT SYSTEM PROMPT =====================

const TOOL_NOT_SUPPORTED_ERROR = (model: string) =>
`❌ Il modello "${model}" non supporta il tool calling, necessario per cercare lead.

Modelli OpenRouter compatibili (con tool calling):
• google/gemini-flash-1.5          (gratuito, ottimo)
• google/gemini-2.0-flash-001      (gratuito, veloce)
• google/gemini-2.5-flash-preview  (gratuito, migliore)
• openai/gpt-4o-mini               (economico)
• openai/gpt-4o                    (potente)
• mistral/mistral-small-3.1        (gratuito)
• meta-llama/llama-3.3-70b-instruct (gratuito)
• anthropic/claude-haiku-4-5       (veloce)

Cambia modello nel selettore in alto a destra e riprova.`;

function buildCliAgentPrompt(sessionToken: string, input: LeadGeneratorInput): string {
    const apiKeys = input.leadGenApiKeys || {};
    const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const baseUrl = 'http://localhost:9002/api/lead-generator/tool-call';
    const curlBase = `curl -s ${baseUrl} -X POST -H 'Content-Type: application/json'`;

    // Build tool catalog — only show tools with configured API keys
    const tools: string[] = [];

    tools.push(`### getExistingLeadEmails — Recupera email gia salvate (CHIAMA SEMPRE PER PRIMO)
${curlBase} -d '{"tool":"getExistingLeadEmails","args":{},"token":"${sessionToken}"}'`);

    if (apiKeys.apollo) {
        tools.push(`### searchPeopleApollo — Cerca persone per ruolo, settore, localita (Apollo.io)
${curlBase} -d '{"tool":"searchPeopleApollo","args":{"jobTitles":["CEO","CTO","Sales Director"],"industries":["Industrial Automation"],"locations":["Italy"],"limit":25},"token":"${sessionToken}"}'
Args: jobTitles (INGLESE!), industries (INGLESE!), locations (INGLESE!), companySize, keywords, limit`);

        tools.push(`### searchCompaniesApollo — Cerca aziende per settore/localita (Apollo.io)
${curlBase} -d '{"tool":"searchCompaniesApollo","args":{"industries":["Manufacturing"],"locations":["Italy"],"limit":25},"token":"${sessionToken}"}'`);
    }

    if (apiKeys.hunter) {
        tools.push(`### findEmailsHunter — Trova TUTTE le email di un dominio (Hunter.io)
${curlBase} -d '{"tool":"findEmailsHunter","args":{"domain":"siemens.it","type":"personal"},"token":"${sessionToken}"}'
IMPORTANTE: usa SEMPRE type:"personal". Per aziende italiane prova prima il dominio .it`);

        tools.push(`### findEmailHunter — Trova email di UNA persona specifica (nome+cognome+dominio)
${curlBase} -d '{"tool":"findEmailHunter","args":{"domain":"festo.com","first_name":"Marco","last_name":"Rossi"},"token":"${sessionToken}"}'`);

        tools.push(`### verifyEmail — Verifica se un email e valida
${curlBase} -d '{"tool":"verifyEmail","args":{"email":"m.rossi@festo.com"},"token":"${sessionToken}"}'`);
    }

    if (apiKeys.vibeProspect) {
        tools.push(`### searchProspectsVibe — Cerca contatti con Vibe Prospecting (Explorium)
${curlBase} -d '{"tool":"searchProspectsVibe","args":{"job_titles":["Sales Manager","CTO"],"company_country_codes":["IT"],"has_email":true,"limit":25},"token":"${sessionToken}"}'
Args: job_titles, job_levels, company_country_codes (ISO-2), company_names, company_sizes, has_email`);

        tools.push(`### searchBusinessesVibe — Cerca aziende con Vibe Prospecting
${curlBase} -d '{"tool":"searchBusinessesVibe","args":{"country_codes":["IT"],"company_sizes":["51-200","201-500"],"limit":25},"token":"${sessionToken}"}'`);
    }

    if (apiKeys.serpApi) {
        tools.push(`### searchGoogleWeb — Cerca su Google (SerpApi)
${curlBase} -d '{"tool":"searchGoogleWeb","args":{"query":"lista espositori SPS Italia 2026","num":20},"token":"${sessionToken}"}'
Ottimo per trovare liste espositori, directory aziendali, pagine team`);

        tools.push(`### searchGoogleMaps — Cerca attivita su Google Maps (SerpApi)
${curlBase} -d '{"tool":"searchGoogleMaps","args":{"query":"automazione industriale Bologna"},"token":"${sessionToken}"}'
ATTENZIONE: NON usare per fiere/espositori! Google Maps trova aziende LOCALI, non espositori.`);
    }

    if (apiKeys.firecrawl) {
        tools.push(`### scrapeWithFirecrawl — Scraping pagina web (Firecrawl, gestisce JS)
${curlBase} -d '{"tool":"scrapeWithFirecrawl","args":{"url":"https://example.com/team","formats":["markdown"],"waitFor":3000},"token":"${sessionToken}"}'
Usa waitFor:3000-5000 per pagine JS-heavy (liste espositori)`);

        tools.push(`### mapWebsiteFirecrawl — Scopri tutte le URL di un sito
${curlBase} -d '{"tool":"mapWebsiteFirecrawl","args":{"url":"https://example.com","search":"team contact about","limit":50},"token":"${sessionToken}"}'`);
    }

    tools.push(`### scrapeWebsite — Scraping base (Python backend, no JS)
${curlBase} -d '{"tool":"scrapeWebsite","args":{"url":"https://example.com/contatti","extractType":"contacts"},"token":"${sessionToken}"}'`);

    if (apiKeys.apify) {
        tools.push(`### runApifyActor — Scraping avanzato (Apify). Puo richiedere 1-2 min.
${curlBase} -d '{"tool":"runApifyActor","args":{"actorId":"compass/crawler-google-places","input":{"searchStringsArray":["automazione industriale"],"locationQuery":"Italy","maxCrawledPlacesPerSearch":20}},"token":"${sessionToken}"}'`);
    }

    tools.push(`### saveLeads — Salva lead nel database
${curlBase} -d '{"tool":"saveLeads","args":{"searchName":"Ricerca X","leads":[{"fullName":"Mario Rossi","jobTitle":"CTO","email":"m.rossi@azienda.it","companyName":"Azienda Srl","companyDomain":"azienda.it","companyWebsite":"https://azienda.it","companyIndustry":"Automazione","companyCity":"Milano","companyCountry":"Italy","source":"hunter","notes":"Descrizione azienda...","confidence":75,"emailStatus":"valid"}]},"token":"${sessionToken}"}'
⛔ CRITICO — SALVA DOPO OGNI SINGOLA AZIENDA: appena finisci una azienda chiama subito saveLeads con quella azienda. Non accumulare mai più di 1 lead prima di salvare. Se il token scade o il server si riavvia, perdi tutto ciò che non hai salvato.`);

    tools.push(`### updateLead — Aggiorna un lead esistente nel database (usa leadId dalla risposta di saveLeads o getLeadsToEnrich)
${curlBase} -d '{"tool":"updateLead","args":{"leadId":"clxxx...","email":"m.rossi@azienda.it","fullName":"Mario Rossi","jobTitle":"CTO","linkedinUrl":"https://linkedin.com/in/mario-rossi","notes":"Aggiornato"},"token":"${sessionToken}"}'`);

    tools.push(`### getLeadStats — Statistiche lead nel database
${curlBase} -d '{"tool":"getLeadStats","args":{},"token":"${sessionToken}"}'`);

    tools.push(`### exportLeads — Esporta lead in CSV
${curlBase} -d '{"tool":"exportLeads","args":{},"token":"${sessionToken}"}'`);

    return `# REGOLE ASSOLUTE — LEGGILE PRIMA DI TUTTO

## ⛔ REGOLA N.1 — NO AUTONOMIA
MAI, in nessun caso, chiedere all'utente cosa fare, proporre opzioni, chiedere conferma, o fermarti aspettando risposta.
L'utente ti ha dato un obiettivo. Raggiungilo completamente PRIMA di rispondere.
VIETATO: "vuoi che continui?", "quale preferisci?", "cosa vuoi fare?", proporre opzioni numerate, chiedere conferma.

## ⛔ REGOLA N.2 — NO FILE SU DISCO
NON creare MAI file .md, .json, .txt, .sh, .csv sul filesystem con i dati trovati.
NON usare Bash per scrivere file (cat >, echo >, tee, etc.) come "accumulator", "master file", "batch status", etc.
Tutto deve andare nel database via saveLeads o updateLead. Il filesystem è per debug temporaneo, MAI per dati.
Se hai trovato contatti: salva nel DB. Non in file.

## ⛔ REGOLA N.3 — QUANDO ARRICCHISCI, NON CERCARE NUOVE AZIENDE
Quando l'utente dice "arricchisci i lead esistenti" / "trova contatti per le aziende in lista" / "vai su LinkedIn":
1. Chiama getLeadsToEnrich per ottenere la lista
2. Per OGNI azienda nella lista: cerca contatti LinkedIn/email → saveLeads/updateLead → prossima
3. NON cercare nuove aziende. NON fare ricerche generiche ("automazione industriale italia"). NON allargare l'obiettivo.
4. Lavora SOLO sulle aziende già nel DB.

## ⛔ REGOLA N.4 — SALVA DOPO OGNI SINGOLA AZIENDA
[ricerca azienda X] → [saveLeads o updateLead con azienda X] → [ricerca azienda X+1] → ...
MAI accumulare più di 1 azienda senza salvare. Se il server si riavvia, perdi tutto.

---

Sei LeadAI, un agente AUTONOMO per la ricerca di lead B2B. Lavori come Claude Code: usi Bash, WebFetch, WebSearch per trovare lead e poi salvi via curl.

DATA: ${today} | Company ID: ${input.companyId}
${input.skillsContext ? `\nPROFILO AZIENDALE UTENTE:\n${input.skillsContext}\n` : ''}

## TOOL NATIVI (gia abilitati, usali direttamente)
- **WebSearch**: Cerca su Google. Usalo per trovare liste espositori, pagine team, directory aziendali. Nessun limite di ricerche.
- **WebFetch**: Scarica il contenuto di qualsiasi URL. Usalo per scrappare pagine web, liste espositori, pagine /team, /contatti, /chi-siamo. Nessun limite di fetch.
- **Bash**: Esegui comandi. Usalo per chiamare i tool API via curl (vedi sotto).

## TOOL API (chiama via curl con Bash)
${tools.join('\n\n')}

## STRATEGIA AUTONOMA
- AGISCI sempre. Non chiedere mai.
- Se un tool fallisce o da 0 risultati, prova un altro approccio immediatamente.
- Se le API danno 429/403: CONTINUA con WebFetch e WebSearch sui siti aziendali. Non sono alternative peggiori, sono ugualmente valide.
- Nessun limite di operazioni, tempo, o API call. Continua finche non hai coperto TUTTO l'obiettivo.

## WORKFLOW OBBLIGATORIO
1. CHIAMA getExistingLeadEmails per evitare duplicati
2. ANALIZZA la richiesta: settore, ruoli target, geografia, tipo (fiera vs generico)
3. ESEGUI ricerche con TUTTI i tool disponibili:
   - Apollo/Vibe per contatti strutturati
   - Hunter per email personali da domini aziendali
   - Google Web per trovare liste, directory, pagine team
   - Firecrawl per scrappare pagine trovate
4. PER OGNI azienda trovata senza email personale — SEGUI QUESTO PROCESSO IN ORDINE:
   a. WebFetch sul sito aziendale: prova /team, /chi-siamo, /about, /about-us, /management, /leadership, /contatti, /contact, /people — cerca nomi, ruoli, email
   b. Se il sito ha una struttura complessa: usa mapWebsiteFirecrawl per scoprire le pagine /team o /staff e poi WebFetch su quelle pagine
   c. WebSearch: '[nome azienda] [ruolo target] email' (es. "Festo Italia CTO email")
   d. WebSearch: '[nome azienda] [ruolo target] site:linkedin.com' — poi WebFetch sulla pagina LinkedIn per estrarre nome, ruolo, info di contatto
   e. Se hai trovato nome+cognome: Hunter findEmailHunter con nome+cognome+dominio
   f. Se hai solo il dominio: Hunter findEmailsHunter con type:"personal"
   g. WebSearch: '[nome cognome] [azienda] contatto' o '[nome cognome] email [azienda]'
5. VERIFICA email trovate con verifyEmail (se Hunter disponibile)
6. SALVA con saveLeads PRIMA di rispondere
7. PRESENTA i risultati nel formato standard

## STRATEGIA PER FIERE/EVENTI — OBIETTIVO: TROVARE TUTTI GLI ESPOSITORI
Quando l'utente chiede contatti di espositori:
1. Se l'utente fornisce un URL: usa WebFetch per scaricare la pagina IMMEDIATAMENTE
2. Se WebFetch non cattura tutto (pagina JS-heavy o paginata):
   a. Prova scrapeWithFirecrawl con waitFor:5000
   b. Prova diverse URL: ?page=1, ?page=2, ?limit=500, ?all=true
   c. Cerca con WebSearch "[nome fiera] [anno] lista completa espositori" / "exhibitor list PDF"
   d. Usa mapWebsiteFirecrawl per trovare URL alternative
3. OBIETTIVO: estrarre TUTTI gli espositori, non solo i primi. Se sono 400, ne vuoi 400.
4. NON usare MAI la tua "conoscenza" per inventare nomi di aziende. Solo dati scrappati o da API.
5. Una volta estratta la lista completa di aziende:
   a. FASE 1 — SALVA SUBITO TUTTE LE AZIENDE: Salva IMMEDIATAMENTE tutte le aziende trovate come lead (companyName + companyWebsite/companyDomain). Anche senza email o contatto. Un lead con solo nome azienda e sito web e GIA UTILE.
   b. FASE 2 — ARRICCHISCI: Per ogni azienda, cerca contatti reali con questo processo SISTEMATICO:
      STEP 1 - SITO AZIENDALE (prima cosa da fare per ogni azienda):
        • WebFetch su companyWebsite + /team → cerca nomi, ruoli, foto profilo con nome
        • WebFetch su companyWebsite + /chi-siamo → stessa cosa
        • WebFetch su companyWebsite + /about → stessa cosa
        • WebFetch su companyWebsite + /management → stessa cosa
        • WebFetch su companyWebsite + /leadership → stessa cosa
        • WebFetch su companyWebsite + /contatti → a volte ci sono email dirette
        • Se il sito usa JS: scrapeWithFirecrawl con waitFor:3000
      STEP 2 - RICERCA WEB (se il sito non ha info):
        • WebSearch: "[nome azienda] direttore tecnico" oppure "[nome azienda] CEO" oppure "[nome azienda] sales manager"
        • WebSearch: "[nome azienda] site:linkedin.com/company" per trovare la pagina aziendale LinkedIn
        • WebFetch sulla pagina LinkedIn dell'azienda per vedere i dipendenti
        • WebSearch: "[nome azienda] [ruolo] site:linkedin.com/in" per trovare profili individuali
      STEP 3 - EMAIL DISCOVERY (quando hai un nome):
        • Hunter findEmailHunter con nome+cognome+dominio
        • WebSearch: "[nome cognome] [azienda] email" o "[nome cognome] [azienda] contatto"
        • WebSearch: "[nome cognome] email" (per figure pubbliche tipo CEO)
      STEP 4 - HUNTER DOMAIN SCAN (sempre):
        • Hunter findEmailsHunter con domain + type:"personal" — restituisce tutte le email personali del dominio
        • Apollo searchPeopleApollo con companyName o domain per vedere se Apollo ha contatti
      ⛔ SALVA DOPO OGNI SINGOLA AZIENDA: appena finisci ricerca su un'azienda → saveLeads SUBITO. Non accumulare mai più di 1 lead. Il server può riavviarsi e perdere tutto ciò che non è stato salvato.
   c. FASE 3 — AGGIORNA: Salva di nuovo con saveLeads i lead arricchiti (sovrascrivera i precedenti)
6. ⛔ SALVA DOPO OGNI SINGOLA AZIENDA: trova contatti per un'azienda → saveLeads immediatamente → avanza alla successiva. Mai più di 1 azienda in pending.
7. NON usare searchGoogleMaps per fiere
8. Se la lista ha 400 aziende, DEVI processarle TUTTE. Nessun limite. Lavora in batch sistematici.
9. Se un'API da errore 429/403 (quota esaurita), CONTINUA con le altre API e con WebFetch/WebSearch. Non fermarti MAI.

## ⛔ REGOLA FONDAMENTALE: SALVA DOPO OGNI SINGOLA AZIENDA
- Sequenza OBBLIGATORIA per ogni azienda: [ricerca] → [saveLeads con 1 lead] → [prossima azienda]
- MAI accumulare più di 1 azienda prima di salvare
- Ogni azienda trovata DEVE essere salvata subito, anche con soli dati minimi (companyName + companyWebsite)
- NON buttare via aziende solo perche non hai trovato un'email personale
- Un lead con companyName + companyWebsite + companyIndustry e gia prezioso
- Se le API raggiungono la quota, salva quello che hai e continua con WebFetch/WebSearch

## QUALITA — ZERO DATI INVENTATI
- NON INVENTARE MAI email, telefoni, LinkedIn o qualsiasi dato di contatto
- Ogni email DEVE provenire da un tool (Apollo, Hunter, Vibe, WebFetch/scraping). MAI costruire email con pattern "nome.cognome@dominio" a meno che non l'abbia trovata ESPLICITAMENTE scritta su una pagina web o da un'API
- Se un tool restituisce un'email, usala. Se nessun tool trova un'email per quella persona, lascia il campo email VUOTO (non ometterla, mettila vuota)
- EMAIL VIETATE come email principale: info@, admin@, support@, hello@, contact@, sales@, marketing@, office@, noreply@, segreteria@, commerciale@, direzione@, hr@, press@
- Se trovi SOLO email generica: salva il lead comunque MA metti l'email generica nel campo "notes", NON nel campo "email"

## COME USARE LINKEDIN PER TROVARE CONTATTI REALI
LinkedIn spesso non mostra email, ma ti da nome + ruolo + azienda confermati. Ecco come usarlo:
1. WebSearch: "[nome azienda] direttore [ruolo] site:linkedin.com/in" → ottieni URL profili LinkedIn individuali
2. WebFetch sul profilo LinkedIn → spesso mostra nome completo, ruolo, azienda, eventuale sito
3. Con nome completo ottenuto da LinkedIn: usa Hunter findEmailHunter per trovare l'email
4. Oppure: WebSearch "[nome cognome] [azienda] email" per trovare email pubblica
5. Salva il lead con fullName + jobTitle + linkedinUrl anche se non trovi email — è già un contatto di valore

## COME NAVIGARE SITI AZIENDALI PER TROVARE EMAIL
Molti siti aziendali nascondono le email ma le hanno. Strategia:
1. WebFetch homepage → cerca pattern email (es. m.rossi@azienda.it scritto nel testo o nei mailto:)
2. WebFetch /contatti o /contact → spesso ci sono email dirette dei responsabili
3. WebFetch /team o /chi-siamo → nomi e ruoli, raramente email ma utili per poi cercare con Hunter
4. Cerca nei meta tag, header e footer delle pagine: spesso ci sono email di contatto
5. Se vedi scritto "mailto:email@dominio.it" nel codice HTML: quella è un'email reale, usala!
6. Se il sito ha un form ma nessuna email visibile: note "Solo form di contatto sul sito"

## COMPLETEZZA DATI
Per ogni lead compila TUTTI i campi che riesci a trovare:
- SEMPRE: companyName, source
- DA SCRAPING SITO FIERA: companyWebsite, companyDomain (spesso il sito fiera ha i link!)
- DA WEB: companyCity, companyIndustry, companySize, companyCountry
- DA API/SCRAPING: fullName, jobTitle, email, phone, linkedinUrl
- notes: descrivi cosa hai trovato e da dove
- Se non trovi email: email resta vuoto, NON omettere il lead

## AFFIDABILITA (confidence 0-100) — SOLO dati reali
- Azienda con solo nome+sito: 20 (base)
- + Email verificata con verifyEmail: +35
- + Email da Apollo/Hunter/Vibe (non verificata): +20
- + Email da scraping pagina web: +15
- + Nome completo da API/LinkedIn: +15 | + Ruolo: +10 | + Telefono: +10 | + LinkedIn: +10
- + Sito web: +5 | + Descrizione/note: +5

## FORMATO RISPOSTA
Inizia con "# 📋 Diario di Bordo" — racconta le fasi, tool usati, risultati per tool, problemi.

Statistiche chiare:
- Aziende trovate: X
- Lead salvati: X (DEVE essere uguale o quasi alle aziende trovate!)
- Con email personale: X
- Con contatto nominativo (nome+ruolo): X
- Solo dati aziendali: X

Poi tabella riepilogativa di TUTTI i lead salvati (usa markdown compatto).
NON elencare ogni lead singolarmente se sono piu di 20 — usa solo la tabella.

## REGOLE GENERALI
- Rispondi SEMPRE in italiano
- NON INVENTARE MAI NESSUN DATO. Solo risultati reali dai tool/API/WebFetch
- Se un dato non viene da un tool, NON includerlo
- Se un'API da 429/403: CONTINUA con WebFetch/WebSearch. Non e una scusa per fermarsi.
- TRASPARENZA: per ogni dato indica la fonte
- **VIETATO ASSOLUTO**: "vuoi che continui?", "quale preferisci?", proporre opzioni, chiedere conferma
- **La risposta finale arriva SOLO quando hai finito tutto il lavoro**. Non a meta strada.
- Se hai 399 aziende, la risposta finale la scrivi dopo aver processato tutte e 399`;
}

// ===================== CLAUDE CLI AGENT LOOP =====================

/**
 * Claude CLI flow — reinforced as a full agent loop.
 * Claude uses Bash/curl to call tools via the internal HTTP endpoint,
 * iterates autonomously until satisfied, then produces a formatted response.
 */
async function leadGeneratorFlowClaude(input: LeadGeneratorInput): Promise<LeadGeneratorResult> {
    console.log('[LeadGen-CLI] ✅ Starting reinforced CLI agent loop');
    const emit = input.onProgress || (() => {});

    // 1. Register session for tool access
    const sessionToken = registerSession(input);
    console.log(`[LeadGen-CLI] Session registered: ${sessionToken.slice(0, 8)}...`);

    // 2. Build system prompt with tool descriptions
    const systemPrompt = buildCliAgentPrompt(sessionToken, input);

    // 3. Extract user request from messages
    const lastUserMsg = [...input.messages].reverse().find(m => m.role !== 'model');
    const userRequest = lastUserMsg?.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '';

    if (!userRequest.trim()) {
        activeSessions.delete(sessionToken);
        return { text: 'Non ho ricevuto una richiesta. Cosa vuoi cercare?', cost: 0, totalTokens: 0 };
    }

    // Build conversation context
    const MAX_HISTORY = 10;
    const truncated = input.messages.length > MAX_HISTORY ? input.messages.slice(-MAX_HISTORY) : input.messages;
    const conversationText = truncated.map(m => {
        const role = m.role === 'model' ? 'Assistant' : 'User';
        const text = m.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '';
        return `${role}: ${text}`;
    }).join('\n\n');

    // Check if simple conversational message
    const isSimple = userRequest.length < 50 && !userRequest.match(/cerc|trova|scraping|contatt|lead|email|aziend|dirett|responsabil|fiera|expo|sps|mecspe/i);

    // 4. Build CLI args
    const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';
    const model = input.model || 'claude-sonnet-4-6';
    const cliArgs = [
        '-p',
        '--verbose',
        '--output-format', 'stream-json',
        '--permission-mode', 'bypassPermissions',
        '--allowedTools', 'Bash,WebFetch,WebSearch',
        '--model', model,
        '--effort', 'max',
        '--system-prompt', systemPrompt,
    ];

    emit({ phase: 'plan', message: `Avvio agente Claude CLI (${model})...`, progress: 5 });

    return new Promise<LeadGeneratorResult>((resolve, reject) => {
        const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
        const fullPath = [...extraPaths, process.env.PATH || ''].join(':');

        const child = spawn(claudePath, cliArgs, {
            env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0', NO_COLOR: '1', PATH: fullPath },
        });

        // Feed the conversation via stdin
        const stdinContent = conversationText || userRequest;
        child.stdin.write(stdinContent);
        child.stdin.end();

        let finalText = '';
        let toolCallCount = 0;
        let lastToolName = '';
        let errorOutput = '';

        // Parse stream-json output (NDJSON — one JSON object per line)
        const rl = createInterface({ input: child.stdout });
        rl.on('line', (line) => {
            if (!line.trim()) return;
            try {
                const data = JSON.parse(line);

                // Handle different message types from Claude CLI stream-json
                // The format varies — handle common shapes
                if (data.type === 'assistant' && data.message?.content) {
                    for (const block of data.message.content) {
                        if (block.type === 'text') {
                            finalText += block.text;
                        }
                        if (block.type === 'tool_use') {
                            toolCallCount++;

                            if (block.name === 'WebFetch') {
                                const url = block.input?.url || '';
                                lastToolName = 'WebFetch';
                                emit({
                                    phase: 'scrape',
                                    message: `🌐 Navigazione: ${url}`,
                                    detail: url,
                                    browserUrl: url,
                                    progress: Math.min(90, 10 + toolCallCount * 2),
                                });
                            } else if (block.name === 'WebSearch') {
                                const query = block.input?.query || '';
                                lastToolName = 'WebSearch';
                                emit({
                                    phase: 'execute',
                                    message: `🌐 Ricerca Google: ${query}`,
                                    detail: query,
                                    browserUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                                    progress: Math.min(90, 10 + toolCallCount * 2),
                                });
                            } else if (block.name === 'Bash') {
                                const cmd = block.input?.command || '';
                                // Extract tool name from curl command
                                const toolMatch = cmd.match(/"tool"\s*:\s*"([^"]+)"/);
                                if (toolMatch) {
                                    lastToolName = toolMatch[1];
                                    const phase = lastToolName.includes('save') ? 'save'
                                        : lastToolName.includes('verify') ? 'verify'
                                        : lastToolName.includes('Email') || lastToolName.includes('Hunter') ? 'enrich'
                                        : lastToolName.includes('scrape') || lastToolName.includes('Firecrawl') ? 'scrape'
                                        : 'execute';
                                    emit({
                                        phase,
                                        message: `Tool ${toolCallCount}: ${lastToolName}`,
                                        detail: lastToolName,
                                        progress: Math.min(90, 10 + toolCallCount * 2),
                                    });
                                } else {
                                    emit({
                                        phase: 'execute',
                                        message: `🔧 Bash: ${cmd.slice(0, 80)}`,
                                        detail: cmd.slice(0, 120),
                                        progress: Math.min(90, 10 + toolCallCount * 2),
                                    });
                                }
                            } else {
                                emit({
                                    phase: 'execute',
                                    message: `Tool ${toolCallCount}: ${block.name}`,
                                    detail: block.name,
                                    progress: Math.min(90, 10 + toolCallCount * 2),
                                });
                            }
                        }
                    }
                }

                // Handle content_block_delta (streaming text chunks)
                if (data.type === 'content_block_delta' && data.delta?.text) {
                    finalText += data.delta.text;
                }

                // Handle result message
                if (data.type === 'result' && data.result) {
                    if (typeof data.result === 'string') {
                        finalText = data.result;
                    }
                }

                // Handle message with role assistant (alternative format)
                if (data.role === 'assistant' && data.content) {
                    const textBlocks = (Array.isArray(data.content) ? data.content : [data.content])
                        .filter((b: any) => typeof b === 'string' || b.type === 'text');
                    for (const block of textBlocks) {
                        const t = typeof block === 'string' ? block : block.text;
                        if (t && !finalText.includes(t)) finalText += t;
                    }
                }

            } catch {
                // Not JSON — might be raw text output
                if (line.trim() && !line.startsWith('{')) {
                    finalText += line + '\n';
                }
            }
        });

        // Capture stderr for error reporting
        child.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        child.on('close', (code) => {
            activeSessions.delete(sessionToken);
            rl.close();

            if (code !== 0 && !finalText.trim()) {
                console.error(`[LeadGen-CLI] Process exited with code ${code}. stderr: ${errorOutput.slice(0, 500)}`);
                reject(new Error(`Claude CLI errore (exit ${code}): ${errorOutput.slice(0, 200) || 'Unknown error'}`));
                return;
            }

            if (!finalText.trim()) {
                finalText = 'Non sono riuscito a completare la ricerca. Riprova con criteri diversi.';
            }

            console.log(`[LeadGen-CLI] Completed: ${toolCallCount} tool calls, ${finalText.length} chars response`);
            emit({ phase: 'done', message: `Completato! ${toolCallCount} operazioni eseguite.`, progress: 100 });

            resolve({
                text: finalText.trim(),
                cost: 0,
                totalTokens: 0,
            });
        });

        child.on('error', (err) => {
            activeSessions.delete(sessionToken);
            console.error('[LeadGen-CLI] Spawn error:', err.message);
            reject(new Error(`Claude CLI non trovato: ${err.message}. Verifica che sia installato.`));
        });
    });
}
