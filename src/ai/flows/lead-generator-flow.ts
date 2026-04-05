'use server';

import { db } from '@/lib/db';
import { execSync } from 'child_process';

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

## AUTONOMIA (REGOLA FONDAMENTALE):
- NON chiedere MAI all'utente quale API, approccio o strategia usare
- Decidi AUTONOMAMENTE la strategia migliore in base ai dati disponibili
- NON proporre MAI "Opzione A / B / C" - scegli e agisci direttamente
- Se hai le API keys configurate, usale tutte in combinazione per massimizzare i risultati
- Strategia default: Apollo (dati strutturati) -> Vibe Prospecting (contatti arricchiti + intent data) -> scrapeWebsite (contatti dal sito) -> Hunter (email personali) -> Google Maps (attivita' locali) -> Apify (scraping avanzato)
- Se una fonte non ha dati, passa alla successiva SENZA chiedere all'utente
- L'utente ti da' un obiettivo, tu AGISCI. Non fare domande tecniche su come farlo.

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
  4. Se trovi un nome reale ma non la sua email, prova findEmailsHunter con first_name e last_name sul dominio
  5. **Se dopo tutti questi tentativi NON hai trovato un'email personale: SCARTA il lead completamente e cercane un altro**
  6. NON salvare MAI lead con solo email generica. Trova un'azienda alternativa con contatti reali al suo posto.
- L'obiettivo e' avere TUTTI i lead con email personali. Meglio 3 lead con email reali che 10 con info@
- Verifica le email trovate con verifyEmail quando possibile
- NON inventare MAI email o contatti. Solo dati reali verificati dalle API.

## RECUPERA SEMPRE TUTTI I DATI (DI DEFAULT):
Non aspettare che l'utente ti chieda specifici dati. OGNI volta che cerchi lead, recupera AUTOMATICAMENTE TUTTI i dati disponibili:
- Dati anagrafici (nome, cognome, ruolo, email personale, telefono, LinkedIn)
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

async function executeToolCall(
    name: string,
    args: any,
    companyId: string,
    apiKeys: { apollo?: string; hunter?: string; serpApi?: string; apify?: string; vibeProspect?: string; firecrawl?: string },
    conversationId?: string
): Promise<string> {
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
                const response = await fetch('http://localhost:5005/scrape', {
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

                // Create the search record
                const search = await db.leadSearch.create({
                    data: {
                        name: args.searchName || 'Ricerca Lead',
                        criteria: args.criteria || {},
                        status: 'completed',
                        resultCount: allCompaniesToSave.length,
                        companyId,
                        ...(conversationId ? { conversationId } : {}),
                    },
                });
                console.log(`[saveLeads] Created search ${search.id}`);

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
                    const response = await fetch('http://localhost:5005/scrape', {
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

        default:
            return JSON.stringify({ error: `Tool sconosciuto: ${name}` });
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

    // For fair/event searches, ALWAYS use Claude CLI flow — it has the full Playwright browser
    // pipeline (scrape exhibitor page, visit each website, Google+LinkedIn search) that the
    // OpenRouter tool-calling loop doesn't support
    const allMsgTexts = input.messages.map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) return m.content.map((c: any) => c.text || c).filter(Boolean).join(' ');
        return '';
    }).join(' ');
    const fairRegex = /fiera|sps|expo|esposi|mecspe|salone|fair|exhibit|event|espositor|exhibitor/i;
    const isFairRequest = fairRegex.test(allMsgTexts);
    console.log(`[LeadGen] Fair detection: isFairRequest=${isFairRequest}, aiProvider=${input.aiProvider}, textSample="${allMsgTexts.substring(0, 100)}"`);
    if (isFairRequest) {
        console.log('[LeadGen] ✅ Fair search detected — routing to Claude CLI flow (Firecrawl + Playwright pipeline)');
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

    const MAX_TOOL_ROUNDS = 50;
    let lastError = '';
    let accumulatedCost = 0;
    let accumulatedTokens = 0;

    // Track search results and whether saveLeads was called
    let saveLeadsCalled = false;
    const collectedLeads: any[] = [];

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
                    await new Promise(r => setTimeout(r, 500));
                    const costRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
                        headers: { 'Authorization': `Bearer ${input.apiKey}` },
                    });
                    if (costRes.ok) {
                        const costData = await costRes.json();
                        const genCost = costData.data?.total_cost || 0;
                        if (genCost > 0) accumulatedCost += genCost;
                    }
                } catch { /* ignore - cost tracking is best-effort */ }
            }

            const choice = data.choices?.[0];
            if (!choice) {
                lastError = 'Nessuna risposta dal modello';
                continue;
            }

            const message = choice.message;

            // If the model made tool calls, execute them and continue
            if (message.tool_calls && message.tool_calls.length > 0) {
                openaiMessages.push(message);

                for (const toolCall of message.tool_calls) {
                    const fnName = toolCall.function.name;
                    let fnArgs: any = {};
                    try { fnArgs = JSON.parse(toolCall.function.arguments); } catch { /* ignore */ }

                    console.log(`[LeadGen] Tool call: ${fnName}`, fnName === 'saveLeads' ? `(${fnArgs.leads?.length || 0} leads)` : '');

                    if (fnName === 'saveLeads') saveLeadsCalled = true;

                    let result: string;
                    try {
                        result = await executeToolCall(fnName, fnArgs, input.companyId, apiKeys, input.conversationId);
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

                    openaiMessages.push({
                        role: 'tool',
                        content: result,
                        tool_call_id: toolCall.id,
                    } as any);
                }
                continue;
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

    return {
        text: `Non sono riuscito a completare la ricerca dopo ${MAX_TOOL_ROUNDS} tentativi. Ultimo errore: ${lastError}. Puoi riprovare con criteri diversi.`,
        cost: accumulatedCost,
        totalTokens: accumulatedTokens,
    };
}

// ===================== CLAUDE CODE CLI PATH =====================
// Architecture: Plan → Execute → Synthesize
// - PLAN: One Claude CLI call to break user request into micro-tasks
// - EXECUTE: Pure Node.js tool execution (no Claude CLI needed)
// - SYNTHESIZE: One Claude CLI call to format results for the user
// This reduces Claude CLI calls from ~30 to 2-3, eliminating timeouts.

interface MicroTask {
    id: number;
    tool: string;
    args: Record<string, any>;
    description: string;
    dependsOn?: number[]; // task IDs this depends on
    status?: 'pending' | 'running' | 'done' | 'error';
    result?: any;
    error?: string;
}

interface ExecutionPlan {
    summary: string;
    tasks: MicroTask[];
}

/**
 * Call Claude CLI with a focused prompt. Returns the raw text response.
 */
function callClaudeCli(prompt: string, model: string, timeoutMs: number = 120_000): string {
    const claudePath = process.env.CLAUDE_PATH || '/opt/homebrew/bin/claude';
    const extraPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
    const fullPath = [...extraPaths, process.env.PATH || ''].join(':');

    return execSync(
        `${claudePath} -p --model ${model} --output-format text --permission-mode bypassPermissions --max-turns 1`,
        {
            input: prompt,
            encoding: 'utf-8',
            timeout: timeoutMs,
            maxBuffer: 10 * 1024 * 1024,
            env: { ...process.env, TERM: 'dumb', FORCE_COLOR: '0', NO_COLOR: '1', PATH: fullPath },
        }
    ).trim();
}

/**
 * Available tools description for the planner
 */
function getToolCatalog(apiKeys: Record<string, string | undefined>): string {
    const tools: string[] = [];
    if (apiKeys.apollo) {
        tools.push('- searchPeopleApollo: cerca persone per ruolo, settore, localita. Args: {jobTitles:[], industries:[], locations:[], companySize?, keywords?, limit?}');
        tools.push('- searchCompaniesApollo: cerca aziende per settore, localita, dimensione. Args: {industries:[], locations:[], companySize?, keywords?, limit?}');
    }
    if (apiKeys.hunter) {
        tools.push('- findEmailsHunter: trova TUTTE le email di un dominio. Args: {domain:string, type?:"personal"|"generic"}');
        tools.push('- findEmailHunter: trova email di UNA persona specifica. Args: {domain:string, first_name:string, last_name:string, company?:string}');
        tools.push('- verifyEmail: verifica email. Args: {email:string}');
    }
    if (apiKeys.serpApi) {
        tools.push('- searchGoogleMaps: cerca attivita su Google Maps. Args: {query:string, location?:string}');
        tools.push('- searchGoogleWeb: cerca su Google Web. Ottimo per trovare liste espositori, directory, elenchi aziende. Args: {query:string, num?:number}');
    }
    if (apiKeys.vibeProspect) {
        tools.push('- searchProspectsVibe: cerca contatti con Vibe Prospecting/Explorium. Args: {job_titles:[], country_codes?:[], company_country_codes?:[], company_names?:[], company_sizes?:[], linkedin_categories?:[], has_email?:boolean, limit?}');
        tools.push('- searchBusinessesVibe: cerca aziende con Vibe Prospecting. Args: {country_codes?:[], company_sizes?:[], company_revenues?:[], linkedin_categories?:[], google_categories?:[], website_keywords?:[], limit?}');
    }
    if (apiKeys.firecrawl) {
        tools.push('- scrapeWithFirecrawl: scraping pagina web. Args: {url:string, formats?:["markdown"], onlyMainContent?:boolean}');
        tools.push('- mapWebsiteFirecrawl: scopri URL di un sito. Args: {url:string, search?:string, limit?}');
    }
    if (apiKeys.apify) {
        tools.push('- runApifyActor: scraping avanzato. Args: {actorId:string, input:object}');
    }
    // Always available
    tools.push('- scrapeWebsite: scraping base (Python backend). Args: {url:string, extractType?:"contacts"|"about"|"team"|"all"}');
    tools.push('- getExistingLeadEmails: recupera email gia salvate nel DB (nessun argomento)');
    tools.push('- saveLeads: salva lead nel DB. Args: {searchName:string, leads:[{firstName,lastName,fullName,jobTitle,email,phone,linkedinUrl,companyName,companyDomain,companyWebsite,companySize,companyIndustry,companyCity,companyCountry,source,notes,confidence,emailStatus}]}');
    tools.push('- getLeadStats: statistiche lead esistenti (nessun argomento)');
    tools.push('- exportLeads: esporta lead in CSV. Args: {searchId?:string}');

    return tools.join('\n');
}

/**
 * PHASE 1: Generate execution plan from user request
 */
async function generatePlan(
    userRequest: string,
    conversationHistory: string,
    model: string,
    apiKeys: Record<string, string | undefined>,
    companyId: string
): Promise<ExecutionPlan> {
    const today = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const toolCatalog = getToolCatalog(apiKeys);

    const planPrompt = `Sei un planner AI per ricerche lead B2B. Data: ${today}. Company ID: ${companyId}.

CONVERSAZIONE PRECEDENTE:
${conversationHistory || '(nessuna)'}

RICHIESTA UTENTE: ${userRequest}

TOOL DISPONIBILI:
${toolCatalog}

COMPITO: Genera un piano di esecuzione in JSON. Ogni task e' un singolo tool call.

REGOLE GENERALI:
- Il PRIMO task deve SEMPRE essere getExistingLeadEmails per evitare duplicati
- Usa TUTTE le API disponibili in combinazione per massimizzare i risultati
- NON aggiungere task saveLeads — il sistema salva automaticamente dopo l'enrichment
- NON aggiungere task per arricchimento email (Hunter domain search, email finder, verifica) — il sistema li fa automaticamente dopo il piano
- Concentrati SOLO sulle ricerche principali: Apollo, Vibe, Google Maps, scraping
- Massimo 15 task. Sii efficiente — meglio poche task mirate che tante generiche
- Il sistema dopo il piano esegue AUTOMATICAMENTE: Hunter domain search, Hunter email finder, verifica email, Vibe enrichment per aziende senza contatti

REGOLE PER FIERE/EVENTI (CRITICO):
- Se l'utente chiede contatti di espositori di una fiera/evento, usa questa strategia multi-fonte:
  1. ${apiKeys.firecrawl ? 'Usa mapWebsiteFirecrawl per trovare la pagina espositori, poi scrapeWithFirecrawl per estrarre la lista' : 'Usa scrapeWebsite sul sito della fiera'}
  2. ${apiKeys.serpApi ? 'IN PARALLELO usa searchGoogleWeb per cercare "lista espositori [nome fiera] [anno]" per trovare pagine con elenchi' : ''}
  3. Se il sito ufficiale non funziona, cerca su Google le liste espositori con searchGoogleWeb
  4. Dopo lo scraping, il sistema AUTOMATICAMENTE: estrae nomi aziende → cerca contatti su Hunter/Vibe → verifica email
  5. Usa ANCHE searchProspectsVibe/searchPeopleApollo con company_names specifiche di aziende note del settore
- Per SPS Italia Parma: URL principale https://sps.messefrankfurt.it/espositori-prodotti/lista-espositori.html
- Strategia alternativa: searchGoogleWeb con query "espositori SPS Italia Parma 2026 lista" oppure "SPS IPC Drives Italia exhibitors list"

REGOLE PER HUNTER.IO (IMPORTANTE):
- Per aziende italiane, cerca SEMPRE prima sul dominio .it (es: abb.it, siemens.it, festo.it) — restituisce contatti della filiale italiana
- Solo se il dominio .it non esiste o non ha risultati, usa il dominio globale (.com)
- Usa SEMPRE type:"personal" per avere email nominative, non generiche

REGOLE PER VIBE PROSPECTING:
- company_country_codes: usa SEMPRE codici ISO a 2 lettere: ["IT"], ["US"], ["DE"], etc.
- company_sizes: usa ESATTAMENTE questi valori: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10001+"
- NON usare MAI il campo linkedin_categories (spesso genera errori API 422). Usa piuttosto job_titles e company_names.
- has_email: metti SEMPRE true per avere solo prospect con email
- Per cercare aziende specifiche usa company_names con i nomi esatti (piu affidabile delle categorie)
- Se usi company_names, eviterai filtri troppo restrittivi.

REGOLE PER GOOGLE MAPS (SerpApi):
- query: scrivi la ricerca completa (es: "automazione industriale Parma")
- NON usare il parametro location, metti la localita nella query stessa

REGOLE PER GOOGLE MAPS (CRITICO):
- NON usare MAI searchGoogleMaps per ricerche di fiere/eventi/espositori!
- Google Maps trova aziende LOCALI nella citta della fiera, NON gli espositori (che vengono da tutto il mondo)
- Usa searchGoogleMaps SOLO per ricerche locali esplicite ("aziende di automazione a Bologna")

REGOLE PER RICERCHE ITALIA:
- Per ricerche in Italia usa country_codes: ["IT"] (Vibe), locations: ["Italy"] (Apollo)
- Cerca contatti con titoli SIA in italiano SIA in inglese: ["Direttore Tecnico", "Technical Director", "CTO", "Responsabile Ufficio Tecnico", "Head of Engineering", "R&D Manager"]

Rispondi SOLO con JSON valido (no markdown, no commenti):
{"summary":"breve descrizione del piano","tasks":[{"id":1,"tool":"nome_tool","args":{...},"description":"cosa fa questo step"},{"id":2,"tool":"...","args":{...},"description":"...","dependsOn":[1]}]}`;

    const isOpus = model.includes('opus');
    const timeoutMs = isOpus ? 180_000 : 90_000;

    console.log(`[LeadGen-Plan] Generating plan with ${model}...`);
    const response = callClaudeCli(planPrompt, model, timeoutMs);

    // Parse plan JSON
    let plan: ExecutionPlan;
    try {
        let jsonStr = response;
        // Strip markdown code blocks if present
        const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();
        // Try to find JSON object in response
        const objMatch = jsonStr.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
        if (objMatch) jsonStr = objMatch[0];
        plan = JSON.parse(jsonStr);
        if (!plan.tasks || !Array.isArray(plan.tasks)) {
            throw new Error('Piano senza tasks');
        }
    } catch (e: any) {
        console.error('[LeadGen-Plan] Failed to parse plan:', e.message, 'Response:', response.slice(0, 500));
        // Fallback: create a simple default plan
        plan = createDefaultPlan(userRequest, apiKeys);
    }

    console.log(`[LeadGen-Plan] Plan: "${plan.summary}" with ${plan.tasks.length} tasks`);
    return plan;
}

/**
 * Default plan when Claude fails to generate one
 */
function createDefaultPlan(userRequest: string, apiKeys: Record<string, string | undefined>): ExecutionPlan {
    const tasks: MicroTask[] = [
        { id: 1, tool: 'getExistingLeadEmails', args: {}, description: 'Recupera email esistenti per evitare duplicati' },
    ];
    let id = 2;

    const reqLower = userRequest.toLowerCase();
    const isItaly = reqLower.match(/ital|parma|milano|roma|torino|bologna/i);
    const isFair = reqLower.match(/fiera|sps|expo|esposi|mecspe|salone/i);

    // If it's a fair/event, try to scrape the exhibitor page AND Google search
    if (isFair) {
        if (apiKeys.firecrawl) {
            if (reqLower.includes('sps')) {
                tasks.push({
                    id: id++, tool: 'scrapeWithFirecrawl',
                    args: { url: 'https://sps.messefrankfurt.it/espositori-prodotti/lista-espositori.html', formats: ['markdown'] },
                    description: 'Scraping lista espositori SPS Italia', dependsOn: [1],
                });
            }
        }
        // Always search Google for exhibitor lists as backup/additional source
        if (apiKeys.serpApi) {
            const fairName = reqLower.includes('sps') ? 'SPS Italia Parma' : reqLower.includes('mecspe') ? 'MECSPE' : 'fiera';
            tasks.push({
                id: id++, tool: 'searchGoogleWeb',
                args: { query: `lista espositori ${fairName} 2026`, num: 20 },
                description: `Google search lista espositori ${fairName}`, dependsOn: [1],
            });
        }
    }

    // Job titles in Italian + English — use commercial/sales roles for fairs, technical for general
    const jobTitles = isFair
        ? ['Sales Manager', 'Area Manager', 'Business Development Manager', 'Key Account Manager', 'Commercial Director', 'Export Manager', 'Direttore Commerciale', 'Responsabile Vendite']
        : ['Direttore Tecnico', 'Responsabile Ufficio Tecnico', 'CTO', 'Technical Director', 'Head of Engineering', 'R&D Manager'];

    if (apiKeys.apollo) {
        tasks.push({
            id: id++, tool: 'searchPeopleApollo',
            args: {
                jobTitles,
                industries: isFair ? ['Industrial Automation', 'Manufacturing', 'Electrical Equipment', 'Machinery'] : [],
                locations: isItaly ? ['Italy'] : [],
                limit: isFair ? 50 : 25,
            },
            description: 'Cerca contatti su Apollo', dependsOn: [1],
        });
    }
    if (apiKeys.vibeProspect) {
        tasks.push({
            id: id++, tool: 'searchProspectsVibe',
            args: {
                job_titles: isFair
                    ? ['Sales Manager', 'Business Development Manager', 'Key Account Manager', 'Commercial Director']
                    : ['Technical Director', 'CTO', 'Head of Engineering', 'R&D Director'],
                company_country_codes: isItaly ? ['IT'] : [],
                has_email: true,
                limit: isFair ? 50 : 25,
            },
            description: 'Cerca contatti su Vibe Prospecting', dependsOn: [1],
        });
    }

    // For fairs: add MULTIPLE Google web searches with different queries for max coverage
    if (apiKeys.serpApi && isFair) {
        const fairName = reqLower.includes('sps') ? 'SPS Italia Parma' : reqLower.includes('mecspe') ? 'MECSPE' : 'fiera';
        tasks.push({
            id: id++, tool: 'searchGoogleWeb',
            args: { query: `${fairName} 2025 espositori elenco completo`, num: 20 },
            description: `Google search espositori ${fairName} 2025 (anno precedente)`, dependsOn: [1],
        });
        tasks.push({
            id: id++, tool: 'searchGoogleWeb',
            args: { query: `${fairName} exhibitors list companies`, num: 20 },
            description: `Google search exhibitors ${fairName} (English)`, dependsOn: [1],
        });
    }

    // Note: Hunter enrichment + email verification are handled automatically by the enrichment pipeline
    return { summary: `Ricerca automatica per: ${userRequest.slice(0, 100)}`, tasks };
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

/** Calculate lead completeness score (0-100) */
function scoreLeadCompleteness(lead: any): number {
    let score = 0;
    // Personal email (not generic) = most important
    if (lead.email && !isGenericEmail(lead.email)) score += 25;
    else if (lead.email) score += 5;
    // Email verified
    if (lead.emailStatus === 'valid') score += 10;
    // Contact data
    if (lead.fullName && lead.fullName.trim().split(/\s+/).length >= 2) score += 12;
    if (lead.jobTitle) score += 8;
    if (lead.phone) score += 8;
    if (lead.linkedinUrl) score += 7;
    // Company data
    if (lead.companyName) score += 8;
    if (lead.companyWebsite || lead.companyDomain) score += 5;
    if (lead.companyIndustry) score += 5;
    if (lead.companyCity) score += 4;
    if (lead.companyCountry) score += 3;
    if (lead.companySize) score += 3;
    // Financial data bonus
    if (lead.revenueYear3 || lead.revenueYear2) score += 2;
    // Company intelligence bonus (notes with description/info)
    if (lead.notes && lead.notes.length > 30) score += 3;
    return Math.min(100, score);
}

/** Normalize a lead: consistent casing, fill derivable fields, set source */
function normalizeLead(raw: any, toolName: string): any {
    const firstName = raw.firstName || raw.first_name || null;
    const lastName = raw.lastName || raw.last_name || null;
    let fullName = raw.fullName || raw.full_name || raw.name || null;
    if (!fullName && (firstName || lastName)) {
        fullName = `${firstName || ''} ${lastName || ''}`.trim();
    }
    // Capitalize names
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
        companyDomain,
        companyWebsite,
        companySize: raw.companySize || raw.company_size || raw.number_of_employees_range || null,
        companyIndustry: raw.companyIndustry || raw.company_industry || raw.industry || raw.naics_description || raw.type || null,
        companyCity: raw.companyCity || raw.company_city || raw.city || raw.city_name || null,
        companyCountry: raw.companyCountry || raw.company_country || raw.country || raw.country_name || null,
        source,
        notes: raw.notes || raw.description || raw.business_description || null,
        confidence: null, // Will be computed after enrichment
        emailStatus: raw.emailStatus || raw.email_status || null,
        revenueYear1: raw.revenueYear1 || null,
        revenueYear2: raw.revenueYear2 || null,
        revenueYear3: raw.revenueYear3 || raw.revenue || null,
        profitYear1: raw.profitYear1 || null,
        profitYear2: raw.profitYear2 || null,
        profitYear3: raw.profitYear3 || null,
        _enriched: false, // internal tracking
        _sources: new Set<string>([source]), // multi-source tracking
    };
}

/** Merge two lead records (enrichment), preferring non-null values from enricher */
function mergeLeadData(base: any, enricher: any): any {
    const merged = { ...base };
    for (const key of Object.keys(enricher)) {
        if (key.startsWith('_')) continue;
        if (enricher[key] && !base[key]) {
            merged[key] = enricher[key];
        }
    }
    // Merge sources
    if (enricher._sources) {
        merged._sources = new Set([...(base._sources || []), ...enricher._sources]);
    }
    return merged;
}

/** Deduplicate leads by email (case-insensitive), merge data from duplicates */
function deduplicateLeads(leads: any[], existingEmails: Set<string>): any[] {
    const byEmail = new Map<string, any>();
    const noEmail: any[] = [];

    for (const lead of leads) {
        if (!lead.email) {
            noEmail.push(lead);
            continue;
        }
        const key = lead.email.toLowerCase();
        if (existingEmails.has(key)) continue; // skip existing
        if (byEmail.has(key)) {
            // Merge duplicate → combine fields
            byEmail.set(key, mergeLeadData(byEmail.get(key), lead));
        } else {
            byEmail.set(key, lead);
        }
    }

    // Add no-email leads only if they have a company with domain (for enrichment)
    const result = [...byEmail.values()];
    for (const lead of noEmail) {
        if (lead.companyDomain || lead.companyWebsite) {
            const exists = result.some(r => r.companyName && r.companyName === lead.companyName);
            if (!exists) result.push(lead);
        }
    }
    return result;
}

// ===================== EXECUTION ENGINE =====================

/**
 * PHASE 2: Execute all tasks with PARALLEL execution for independent tasks
 */
async function executePlan(
    plan: ExecutionPlan,
    companyId: string,
    apiKeys: Record<string, string | undefined>,
    conversationId?: string,
    onProgress?: ProgressCallback
): Promise<{ results: Map<number, any>; allLeads: any[] }> {
    const emit = onProgress || (() => {});
    const results = new Map<number, any>();
    const allLeads: any[] = [];
    const existingEmails = new Set<string>();

    const completed = new Set<number>();
    const pending = new Set(plan.tasks.map(t => t.id));
    let maxWaves = 20; // safety limit

    // ===================== FAIR MODE: PHASE 1 — AI EXHIBITOR LIST =====================
    // For fair/event searches, the FIRST thing we do is generate a massive list of exhibitors
    // with real domains using Claude's knowledge. This replaces scraping (which always fails on
    // JS-heavy fair websites) and gives us a solid list to search contacts for.
    const isFairSearch = plan.summary?.toLowerCase().match(/fiera|sps|expo|esposi|mecspe|salone|fair|exhibit|event/i)
        || plan.tasks.some(t => t.description?.toLowerCase().match(/fiera|espositor|exhibitor/i));

    console.log(`[LeadGen-ExecutePlan] isFairSearch=${!!isFairSearch}, plan.summary="${plan.summary?.substring(0, 80)}", tasks=${plan.tasks.length}`);
    console.log(`[LeadGen-ExecutePlan] apiKeys available: ${Object.keys(apiKeys).filter(k => apiKeys[k]).join(', ')}`);

    if (isFairSearch) {
        // Extract fair context from plan
        const fairContext = [
            plan.summary || '',
            ...plan.tasks.map(t => t.description || ''),
            ...plan.tasks.map(t => JSON.stringify(t.args || {})),
        ].join(' ');

        const allExhibitors: Array<{ name: string; domain: string; country?: string }> = [];
        const existingNames = new Set<string>();

        // Helper to add company names (deduplicated)
        const addExhibitor = (name: string, domain = '', country?: string): boolean => {
            const clean = name.trim();
            const key = clean.toLowerCase();
            if (existingNames.has(key)) return false;
            if (clean.length < 2 || clean.length > 100) return false;
            if (/^(home|contatti?|about|chi siamo|news|event|prodott|search|menu|login|register|cookie|privacy)/i.test(clean)) return false;
            existingNames.add(key);
            allExhibitors.push({ name: clean, domain, country });
            return true;
        };

        // Helper to extract company names from raw text using Claude
        const extractCompaniesFromText = (text: string, source: string): number => {
            if (text.length < 100) return 0;
            try {
                const extractPrompt = `Estrai TUTTI i nomi di AZIENDE ESPOSITRICI da questo testo di una pagina web di una fiera.
Rispondi SOLO con un JSON array di stringhe con i nomi delle aziende.
Non includere testo generico, titoli di pagina, elementi di navigazione, nomi di persone — solo NOMI DI AZIENDE.
Se non trovi aziende, rispondi con [].

TESTO (da ${source}):
${text.substring(0, 20000)}`;
                const result = callClaudeCli(extractPrompt, 'claude-haiku-4-5', 60_000);
                const jsonMatch = result.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const names: string[] = JSON.parse(jsonMatch[0]);
                    let added = 0;
                    for (const n of names) {
                        if (addExhibitor(n)) added++;
                    }
                    return added;
                }
            } catch { /* extraction failed */ }
            return 0;
        };

        // ===================== PHASE 0: SCRAPE EXHIBITOR LIST using available providers =====================
        // Strategy cascade: Firecrawl (JS rendering) → SerpApi (Google) → Apify → Claude knowledge
        // apiKeys is already available as a parameter of executePlan()
        console.log(`[LeadGen-Phase0] ✅ ENTERED PHASE 0 — firecrawl=${!!apiKeys.firecrawl}, serpApi=${!!apiKeys.serpApi}, apify=${!!apiKeys.apify}`);

        // Find exhibitor page URLs
        const exhibitorUrls = new Set<string>();
        const urlMatches = fairContext.match(/https?:\/\/[^\s"'<>]+/gi);
        if (urlMatches) urlMatches.forEach(u => exhibitorUrls.add(u.replace(/[.,;)]+$/, '')));
        if (fairContext.toLowerCase().includes('sps') && fairContext.toLowerCase().match(/parma|italia/)) {
            exhibitorUrls.add('https://www.spsitalia.it/it/elenco-ricerca-espositori');
        }

        // --- STRATEGY 1: Firecrawl (handles JS-rendered pages) ---
        if (apiKeys.firecrawl && allExhibitors.length < 50) {
            emit({ phase: 'knowledge', message: `Fase 0: Uso Firecrawl per leggere il sito ufficiale della fiera...`, progress: 2 });

            // First, map the fair website to find exhibitor/espositori pages
            try {
                const mapResult = await executeToolCall('mapWebsiteFirecrawl', {
                    url: [...exhibitorUrls][0] || 'https://www.spsitalia.it',
                    search: 'espositori exhibitor elenco list',
                    limit: 50,
                }, companyId, apiKeys as any, conversationId);
                const mapData = JSON.parse(mapResult);
                if (mapData.links?.length > 0) {
                    // Add exhibitor-related URLs
                    for (const link of mapData.links) {
                        if (typeof link === 'string' && link.match(/espositor|exhibitor|aussteller|elenco|list|company|aziend/i)) {
                            exhibitorUrls.add(link);
                        }
                    }
                    console.log(`[LeadGen-Phase0] Firecrawl map found ${mapData.links.length} URLs, ${exhibitorUrls.size} exhibitor-related`);
                }
            } catch (e: any) {
                console.error(`[LeadGen-Phase0] Firecrawl map failed:`, e.message);
            }

            // Scrape each exhibitor URL
            for (const url of exhibitorUrls) {
                if (allExhibitors.length >= 200) break; // Enough from scraping
                try {
                    emit({ phase: 'knowledge', message: `🌐 Firecrawl: scraping ${url}...`, browserUrl: url, progress: 3 });

                    const scrapeResult = await executeToolCall('scrapeWithFirecrawl', {
                        url,
                        formats: ['markdown'],
                        onlyMainContent: true,
                        waitFor: 5000,
                        timeout: 60000,
                    }, companyId, apiKeys as any, conversationId);
                    const scrapeData = JSON.parse(scrapeResult);

                    if (scrapeData.markdown && scrapeData.markdown.length > 200) {
                        const added = extractCompaniesFromText(scrapeData.markdown, url);
                        emit({
                            phase: 'knowledge',
                            message: `🌐 Firecrawl: ${added} aziende estratte da ${url}`,
                            companiesFound: allExhibitors.length,
                            progress: 4,
                        });
                        console.log(`[LeadGen-Phase0] Firecrawl scraped ${url}: ${added} new companies (total: ${allExhibitors.length})`);
                    }
                } catch (e: any) {
                    console.error(`[LeadGen-Phase0] Firecrawl scrape ${url} failed:`, e.message);
                }
            }
        }

        // --- STRATEGY 2: SerpApi Google search for exhibitor lists ---
        if (apiKeys.serpApi && allExhibitors.length < 100) {
            emit({ phase: 'knowledge', message: `Fase 0: Cerco lista espositori su Google (SerpApi)...`, progress: 5 });

            const googleQueries = [
                `"SPS 2026" OR "SPS Parma 2026" elenco espositori lista completa`,
                `"SPS Italia 2026" exhibitors list companies`,
                `spsitalia.it espositori 2026 elenco aziende`,
                `"SPS 2025" OR "SPS 2024" Parma elenco completo espositori`, // Previous editions have similar exhibitors
            ];

            for (const query of googleQueries) {
                if (allExhibitors.length >= 200) break;
                try {
                    emit({ phase: 'knowledge', message: `🔍 Google: "${query.substring(0, 50)}..."`, progress: 5 });

                    const searchResult = await executeToolCall('searchGoogleWeb', {
                        query,
                        num: 10,
                        gl: 'it',
                        hl: 'it',
                    }, companyId, apiKeys as any, conversationId);
                    const searchData = JSON.parse(searchResult);
                    const results = searchData.organic_results || searchData.results || [];

                    // For each result, if it looks like an exhibitor list, scrape it
                    for (const r of results.slice(0, 5)) {
                        if (allExhibitors.length >= 300) break;
                        const resultUrl = r.link || r.url;
                        if (!resultUrl) continue;
                        // Skip PDFs, videos, social media
                        if (resultUrl.match(/\.(pdf|mp4|youtube|facebook|twitter|instagram)/i)) continue;

                        // Check if snippet contains company names
                        const snippet = (r.snippet || r.description || '') + ' ' + (r.title || '');
                        if (snippet.length > 50) {
                            const addedFromSnippet = extractCompaniesFromText(snippet, 'Google snippet');
                            if (addedFromSnippet > 0) {
                                console.log(`[LeadGen-Phase0] Google snippet: ${addedFromSnippet} companies from "${resultUrl}"`);
                            }
                        }

                        // Scrape the page with Firecrawl if available
                        if (apiKeys.firecrawl && resultUrl.match(/espositor|exhibitor|list|elenco|companies|aziend/i)) {
                            try {
                                emit({ phase: 'knowledge', message: `🌐 Scraping: ${resultUrl.substring(0, 60)}...`, browserUrl: resultUrl, progress: 6 });

                                const pageResult = await executeToolCall('scrapeWithFirecrawl', {
                                    url: resultUrl,
                                    formats: ['markdown'],
                                    onlyMainContent: true,
                                    timeout: 30000,
                                }, companyId, apiKeys as any, conversationId);
                                const pageData = JSON.parse(pageResult);

                                if (pageData.markdown && pageData.markdown.length > 200) {
                                    const added = extractCompaniesFromText(pageData.markdown, resultUrl);
                                    if (added > 5) {
                                        emit({
                                            phase: 'knowledge',
                                            message: `✅ ${added} aziende trovate da ${resultUrl.substring(0, 50)}`,
                                            companiesFound: allExhibitors.length,
                                            progress: 7,
                                        });
                                    }
                                }
                            } catch { /* scrape failed, continue */ }
                        }
                    }
                } catch (e: any) {
                    console.error(`[LeadGen-Phase0] Google search failed:`, e.message);
                }
            }
        }

        // --- STRATEGY 3: Apify Google Search Scraper for deeper results ---
        if (apiKeys.apify && allExhibitors.length < 100) {
            emit({ phase: 'knowledge', message: `Fase 0: Apify search per lista espositori...`, progress: 7 });
            try {
                const apifyResult = await executeToolCall('runApifyActor', {
                    actorId: 'apify/google-search-scraper',
                    input: {
                        queries: `SPS 2026 Parma elenco completo espositori\nSPS Italia 2026 exhibitors full list\nSPS Parma 2025 lista espositori aziende`,
                        maxPagesPerQuery: 3,
                        languageCode: 'it',
                        countryCode: 'it',
                    },
                }, companyId, apiKeys as any, conversationId);
                const apifyData = JSON.parse(apifyResult);
                const items = apifyData.items || apifyData.results || [];
                for (const item of items) {
                    const text = (item.title || '') + ' ' + (item.description || '') + ' ' + (item.snippet || '');
                    if (text.length > 30) {
                        extractCompaniesFromText(text, 'Apify Google');
                    }
                    // Also scrape promising URLs
                    const itemUrl = item.url || item.link;
                    if (itemUrl && apiKeys.firecrawl && itemUrl.match(/espositor|exhibitor|list|elenco/i) && allExhibitors.length < 200) {
                        try {
                            const scrapeR = await executeToolCall('scrapeWithFirecrawl', {
                                url: itemUrl,
                                formats: ['markdown'],
                                onlyMainContent: true,
                            }, companyId, apiKeys as any, conversationId);
                            const scrapeD = JSON.parse(scrapeR);
                            if (scrapeD.markdown) extractCompaniesFromText(scrapeD.markdown, itemUrl);
                        } catch { /* skip */ }
                    }
                }
                console.log(`[LeadGen-Phase0] Apify search: total ${allExhibitors.length} companies after processing`);
            } catch (e: any) {
                console.error(`[LeadGen-Phase0] Apify failed:`, e.message);
            }
        }

        emit({
            phase: 'knowledge',
            message: allExhibitors.length > 0
                ? `Fase 0 completata: ${allExhibitors.length} espositori trovati online. Integro con AI...`
                : 'Nessun espositore trovato online. Genero lista con AI...',
            companiesFound: allExhibitors.length,
            progress: allExhibitors.length > 0 ? 10 : 5,
        });
        const MAX_BATCHES = 10; // safety limit (10 batches × ~100 each = ~1000 companies max)
        const MIN_NEW_PER_BATCH = 5; // stop if a batch adds fewer than this (Claude is running out)

        for (let batch = 1; batch <= MAX_BATCHES; batch++) {
            const isFirstBatch = batch === 1;
            const alreadyFoundList = allExhibitors.map(e => e.name);
            // Only send last 200 names to avoid exceeding token limits
            const alreadyFoundStr = alreadyFoundList.slice(-200).join(', ');

            const batchPrompt = isFirstBatch
                ? `Sei un esperto di fiere industriali. Genera la lista PIU' COMPLETA POSSIBILE di aziende REALI che espongono o che tipicamente espongono alla fiera descritta.

CONTESTO FIERA: ${fairContext}
${alreadyFoundList.length > 0 ? `\nAZIENDE GIA' TROVATE dal sito ufficiale (${alreadyFoundList.length}):\n${alreadyFoundStr}\n\nPer le aziende qui sopra che NON hanno ancora un dominio email, INCLUDILE nella tua risposta CON il dominio email corretto.\nGenera anche ALTRE aziende espositrici non ancora in lista.\n` : ''}
Per OGNI azienda indica:
- name: nome ufficiale
- domain: dominio EMAIL aziendale (quello usato per le email dei dipendenti, NON il sito generico). Es: "siemens.com", "festo.com", "sew-eurodrive.it". OBBLIGATORIO.
- country: paese (es: "Germany", "Italy")

REGOLE:
- GENERA IL MAGGIOR NUMERO POSSIBILE. Non fermarti a 50 o 100 — vai avanti finche ne conosci
- SOLO aziende REALI che esistono davvero e sono plausibili espositori
- Includi TUTTE le dimensioni: multinazionali, medie imprese, PMI italiane, startup
- Il dominio DEVE essere quello usato per le email aziendali
- Per aziende con filiale italiana, preferisci .it se usato per email (sew-eurodrive.it, lenze.it)
- Per multinazionali globali: siemens.com, festo.com, abb.com, schneider-electric.com
- Nomi composti: "BOSCH REXROTH"=boschrexroth.com, "ENDRESS+HAUSER"=endress.com, "NORD DRIVESYSTEMS"=nord.com
- Per SPS/automazione copri TUTTI i settori: PLC, sensori, drives, motori, robotica, pneumatica, connettori, cavi, software industriale, HMI, SCADA, safety, visione, motion control, fieldbus, IO-Link, edge computing, cobot, encoder, inverter, riduttori, switch Ethernet industriale, alimentatori, morsettiere, quadri elettrici, sistemi di trasporto, AGV, magazzini automatici, stampa 3D industriale, digital twin, cybersecurity OT, MES, ERP industriale

Rispondi SOLO con JSON array. Nessun testo prima o dopo.`
                : `Genera ALTRE aziende REALI espositrici della stessa fiera. Devono essere TUTTE DIVERSE da quelle gia trovate.

CONTESTO FIERA: ${fairContext}

AZIENDE GIA' TROVATE (${alreadyFoundList.length} — NON ripeterle):
${alreadyFoundStr}

Cerca aziende che NON hai ancora elencato:
${batch <= 3 ? '- Medie aziende europee del settore, PMI italiane specializzate, fornitori di componenti, distributori' :
  batch <= 5 ? '- Aziende di nicchia: integratori di sistema, produttori di connettori/cavi specializzati, aziende di visione artificiale, produttori di sensori di processo, pneumatica/oleodinamica, sicurezza macchine' :
  batch <= 7 ? '- Startup industriali, aziende di software MES/SCADA/digital twin, cybersecurity OT, cloud industriale, aziende asiatiche con presenza europea, distributori di componenti' :
  '- Qualsiasi altra azienda del settore automazione/industria che non hai ancora nominato, anche piccole o di nicchia'}

Stesse regole: name, domain (OBBLIGATORIO, email domain reale), country.
Se non hai piu aziende da aggiungere, rispondi con un array vuoto: []
Rispondi SOLO con JSON array.`;

            try {
                emit({
                    phase: 'knowledge',
                    message: `Fase 1: Generazione espositori [batch ${batch}]... ${allExhibitors.length} aziende trovate`,
                    companiesFound: allExhibitors.length,
                    progress: 5 + Math.min(15, batch * 2),
                });

                const result = callClaudeCli(batchPrompt, 'claude-sonnet-4-6', 120_000);
                let companies: Array<{ name: string; domain: string; country?: string }> = [];
                try {
                    const jsonMatch = result.match(/\[[\s\S]*\]/);
                    if (jsonMatch) companies = JSON.parse(jsonMatch[0]);
                } catch { /* parse failed */ }

                let newInBatch = 0;
                for (const co of companies) {
                    if (!co.name || !co.domain) continue;
                    const key = co.name.toLowerCase().trim();
                    if (existingNames.has(key)) continue;
                    if (!co.domain.includes('.')) continue;
                    allExhibitors.push(co);
                    existingNames.add(key);
                    newInBatch++;
                }

                console.log(`[LeadGen-FairMode] Batch ${batch}: Claude returned ${companies.length}, ${newInBatch} new unique → total: ${allExhibitors.length}`);

                // Stop if Claude is running out of companies
                if (newInBatch < MIN_NEW_PER_BATCH) {
                    console.log(`[LeadGen-FairMode] Batch ${batch} added only ${newInBatch} new companies (< ${MIN_NEW_PER_BATCH}). Stopping.`);
                    break;
                }
            } catch (e: any) {
                console.error(`[LeadGen-FairMode] Batch ${batch} failed:`, e.message);
                break; // stop on error
            }
        }

        // Convert exhibitors to leads
        if (allExhibitors.length > 0) {
            for (const co of allExhibitors) {
                allLeads.push({
                    firstName: null, lastName: null, fullName: null,
                    jobTitle: null, email: null, phone: null, linkedinUrl: null,
                    companyName: co.name,
                    companyDomain: co.domain.toLowerCase(),
                    companyWebsite: `https://www.${co.domain.toLowerCase()}`,
                    companySize: null, companyIndustry: null,
                    companyCity: null, companyCountry: co.country || null,
                    source: 'knowledge', notes: 'Espositore generato da AI (fase 1)',
                    confidence: null, emailStatus: null,
                    _enriched: false, _sources: new Set(['knowledge']),
                });
            }

            console.log(`[LeadGen-FairMode] Phase 1 complete: ${allExhibitors.length} exhibitors with domains ready for contact search`);
            emit({
                phase: 'knowledge',
                message: `Fase 1 completata: ${allExhibitors.length} espositori con domini pronti. Avvio fase 2: ricerca contatti...`,
                companiesFound: allExhibitors.length,
                progress: 20,
            });

            // Remove scraping tasks from plan — we don't need them, we have the list already
            const scrapingTools = ['scrapeWithFirecrawl', 'scrapeWebsite', 'mapWebsiteFirecrawl'];
            plan.tasks = plan.tasks.filter(t => !scrapingTools.includes(t.tool));
            // Re-index pending set
            pending.clear();
            for (const t of plan.tasks) pending.add(t.id);
        }
    }

    async function executeTask(task: MicroTask): Promise<void> {
        console.log(`[LeadGen-Exec] Task ${task.id}/${plan.tasks.length}: ${task.tool} - ${task.description}`);
        task.status = 'running';

        try {
            // Special handling for saveLeads — inject collected leads
            let args = { ...task.args };
            if (task.tool === 'saveLeads' && allLeads.length > 0 && (!args.leads || args.leads.length === 0)) {
                const cleanLeads = deduplicateLeads(allLeads, existingEmails).filter(l => l.email && !isGenericEmail(l.email));
                args = { ...args, leads: cleanLeads, searchName: args.searchName || plan.summary || 'Ricerca Lead' };
            }

            const resultStr = await executeToolCall(task.tool, args, companyId, apiKeys as any, conversationId);
            const parsed = JSON.parse(resultStr);
            results.set(task.id, parsed);

            // Check if the tool returned an error in its response body
            if (parsed.error) {
                console.warn(`[LeadGen-Exec] Task ${task.id} (${task.tool}) returned error: ${parsed.error}`);
                task.status = 'error';
                task.error = parsed.error;
            } else {
                task.status = 'done';
            }
            task.result = parsed;

            // Collect existing emails
            if (task.tool === 'getExistingLeadEmails' && parsed.leads) {
                for (const l of parsed.leads) {
                    if (l.email) existingEmails.add(l.email.toLowerCase());
                }
            }

            // Collect leads from search results
            const searchTools = ['searchPeopleApollo', 'searchCompaniesApollo', 'findEmailsHunter',
                'findEmailHunter', 'searchGoogleMaps', 'searchProspectsVibe', 'searchBusinessesVibe'];
            if (searchTools.includes(task.tool)) {
                const people = parsed.people || parsed.emails || parsed.results || parsed.organizations || parsed.businesses || [];
                // findEmailHunter returns a single person, not array
                const items = task.tool === 'findEmailHunter' && parsed.email ? [parsed] : people;

                for (const p of items) {
                    if (p.email || p.companyName || p.fullName || p.companyWebsite) {
                        allLeads.push(normalizeLead(p, task.tool));
                    }
                }
                console.log(`[LeadGen-Exec] Task ${task.id} collected ${items.length} leads (total: ${allLeads.length})`);
            }

            // Extract contacts from scraped pages
            if (['scrapeWithFirecrawl', 'scrapeWebsite'].includes(task.tool) && parsed.markdown) {
                console.log(`[LeadGen-Exec] Task ${task.id} scraped ${parsed.url}, markdown: ${parsed.markdown?.length || 0} chars`);
            }

        } catch (e: any) {
            const causeMsg = e.cause ? ` | cause: ${e.cause?.code || e.cause?.message || JSON.stringify(e.cause).slice(0, 200)}` : '';
            console.error(`[LeadGen-Exec] Task ${task.id} (${task.tool}) ERROR: ${e.message}${causeMsg}`);
            task.status = 'error';
            task.error = e.message;
            results.set(task.id, { error: e.message });
        }

        pending.delete(task.id);
        completed.add(task.id);
    }

    // Execute tasks in waves — parallel within each wave
    while (pending.size > 0 && maxWaves-- > 0) {
        const ready = plan.tasks.filter(t =>
            pending.has(t.id) &&
            (!t.dependsOn?.length || t.dependsOn.every(d => completed.has(d)))
        );

        if (ready.length === 0 && pending.size > 0) {
            // Break deadlock
            const first = plan.tasks.find(t => pending.has(t.id));
            if (first) ready.push(first);
            else break;
        }

        if (ready.length === 0) break;

        // Execute all ready tasks in parallel
        console.log(`[LeadGen-Exec] Wave: ${ready.length} parallel tasks [${ready.map(t => t.tool).join(', ')}]`);
        emit({
            phase: 'execute',
            message: `Esecuzione ricerche: ${ready.map(t => t.description || t.tool).join(', ')}`,
            detail: ready.map(t => t.tool).join(', '),
            leadsFound: allLeads.length,
            progress: Math.round((completed.size / plan.tasks.length) * 20), // 0-20% for plan execution
        });
        await Promise.all(ready.map(t => executeTask(t)));
    }

    // ===================== GOOGLE WEB → FOLLOW-UP SCRAPE =====================
    // If Google Web search found exhibitor list pages, scrape the top results
    const googleWebTasks = plan.tasks.filter(t => t.tool === 'searchGoogleWeb' && t.status === 'done');
    if (googleWebTasks.length > 0 && (apiKeys.firecrawl || true)) {
        for (const gwTask of googleWebTasks) {
            const gwResult = results.get(gwTask.id);
            if (!gwResult?.results?.length) continue;

            // Find exhibitor list URLs from Google results
            const exhibitorUrls = gwResult.results
                .filter((r: any) => {
                    const lowerTitle = (r.title || '').toLowerCase();
                    const lowerSnippet = (r.snippet || '').toLowerCase();
                    return lowerTitle.match(/espositor|exhibitor|lista|elenco|partecipan/) ||
                           lowerSnippet.match(/espositor|exhibitor|lista|elenco|partecipan/);
                })
                .map((r: any) => r.link)
                .slice(0, 3); // Scrape top 3 exhibitor pages

            if (exhibitorUrls.length > 0) {
                console.log(`[LeadGen-Exec] Scraping ${exhibitorUrls.length} exhibitor pages from Google results`);
                emit({ phase: 'scrape', message: `Scraping ${exhibitorUrls.length} pagine espositori trovate su Google...`, progress: 22 });
                const scrapePromises = exhibitorUrls.map(async (url: string) => {
                    try {
                        const toolName = apiKeys.firecrawl ? 'scrapeWithFirecrawl' : 'scrapeWebsite';
                        const args = apiKeys.firecrawl
                            ? { url, formats: ['markdown'] }
                            : { url, extractType: 'all' };
                        const resultStr = await executeToolCall(toolName, args, companyId, apiKeys as any, conversationId);
                        const parsed = JSON.parse(resultStr);
                        if (parsed.markdown && parsed.markdown.length > 200) {
                            // Store result so the company extraction phase can process it
                            const fakeTaskId = 9000 + Math.random() * 1000;
                            results.set(fakeTaskId, { ...parsed, url });
                            plan.tasks.push({
                                id: fakeTaskId, tool: toolName,
                                args: { url }, description: `Scraping follow-up: ${url}`,
                                status: 'done', result: parsed,
                            });
                            console.log(`[LeadGen-Exec] Scraped ${url}: ${parsed.markdown.length} chars`);
                        }
                    } catch { /* skip */ }
                });
                await Promise.all(scrapePromises);
            }
        }
    }

    // ===================== SCRAPE → COMPANY EXTRACTION =====================
    // If we scraped pages (e.g. exhibitor lists), extract company names and create leads
    for (const task of plan.tasks) {
        if (!['scrapeWithFirecrawl', 'scrapeWebsite'].includes(task.tool) || task.status !== 'done') continue;
        const scraped = results.get(task.id);
        if (!scraped?.markdown || scraped.markdown.length < 100) continue;

        console.log(`[LeadGen-Extract] Parsing companies from scraped content (${scraped.markdown.length} chars)`);

        // Use Claude CLI to extract company names from scraped exhibitor lists
        try {
            const extractPrompt = `Estrai i NOMI delle aziende dal seguente testo (lista espositori di una fiera).
Rispondi SOLO con un JSON array di oggetti con campi: name (nome azienda), website (URL se presente, altrimenti null).
Estrai TUTTE le aziende che trovi, senza limite. Se non trovi aziende, rispondi con [].
NON inventare aziende. Solo quelle presenti nel testo.

TESTO:
${scraped.markdown.slice(0, 30000)}

JSON:`;
            const extractResult = callClaudeCli(extractPrompt, 'claude-haiku-4-5', 60_000);
            let companies: Array<{ name: string; website?: string | null }> = [];
            try {
                const jsonMatch = extractResult.match(/\[[\s\S]*\]/);
                if (jsonMatch) companies = JSON.parse(jsonMatch[0]);
            } catch { /* parse failed */ }

            if (companies.length > 0) {
                console.log(`[LeadGen-Extract] Found ${companies.length} companies from scraping`);
                for (const co of companies) {
                    const domain = co.website ? extractDomain(co.website) : null;
                    allLeads.push({
                        firstName: null, lastName: null, fullName: null,
                        jobTitle: null, email: null, phone: null, linkedinUrl: null,
                        companyName: co.name,
                        companyDomain: domain,
                        companyWebsite: co.website || null,
                        companySize: null, companyIndustry: null,
                        companyCity: null, companyCountry: null,
                        source: 'scraping', notes: `Espositore trovato da ${scraped.url || task.args?.url || 'scraping'}`,
                        confidence: null, emailStatus: null,
                        _enriched: false, _sources: new Set(['scraping']),
                    });
                }
            }
        } catch (e: any) {
            console.error('[LeadGen-Extract] Failed to extract companies:', e.message);
        }
    }

    // ===================== KNOWLEDGE-BASED EXHIBITOR GENERATION (TOP-UP) =====================
    // If fair mode phase 1 didn't generate enough, or for non-fair searches that still match fair patterns
    // isFairSearch is already defined at the top of executePlan
    // Only count companies from scraping/knowledge (NOT Google Maps local businesses, which are irrelevant for fairs)
    const realExhibitorSources = ['scraping', 'knowledge', 'apollo', 'vibe_prospecting'];
    const companiesFromScraping = allLeads.filter(l => l.source === 'scraping' && l.companyName).length;
    const realExhibitorCompanies = new Set(
        allLeads.filter(l => l.companyName && realExhibitorSources.includes(l.source))
            .map(l => l.companyName!.toLowerCase())
    ).size;
    const totalCompanies = new Set(allLeads.filter(l => l.companyName).map(l => l.companyName!.toLowerCase())).size;

    // For fairs: ALWAYS generate knowledge if we have fewer than 100 real exhibitors
    // (SPS alone has 400+ exhibitors, so 100 is still conservative)
    const realExhibitorCompaniesWithDomain = new Set(
        allLeads.filter(l => l.companyName && l.companyDomain && realExhibitorSources.includes(l.source))
            .map(l => l.companyName!.toLowerCase())
    ).size;

    if (isFairSearch && realExhibitorCompaniesWithDomain < 80) {
        console.log(`[LeadGen-Knowledge] Fair search: ${realExhibitorCompaniesWithDomain} companies with domains (${realExhibitorCompanies} total real exhibitors, ${totalCompanies} total incl. local). Generating known exhibitors...`);
        emit({
            phase: 'knowledge',
            message: `${realExhibitorCompanies} aziende espositrici trovate (${totalCompanies} totali). Genero lista massiva espositori noti del settore...`,
            companiesFound: realExhibitorCompanies,
            progress: 30,
        });

        // Build context about which companies we already have
        const existingCompanyNames = [...new Set(allLeads.filter(l => l.companyName).map(l => l.companyName!))];

        // Extract fair name and sector from plan summary + task descriptions
        const fairContext = [
            plan.summary || '',
            ...plan.tasks.map(t => t.description || ''),
            ...plan.tasks.map(t => JSON.stringify(t.args || {})),
        ].join(' ');

        try {
            const knowledgePrompt = `Sei un esperto di fiere industriali. Genera una lista MASSIVA di aziende espositrici.

CONTESTO FIERA: ${fairContext}

AZIENDE GIA' TROVATE (${existingCompanyNames.length}): ${existingCompanyNames.slice(0, 50).join(', ')}

COMPITO: Genera una lista di almeno 80 aziende REALI che sono tipici espositori di questa fiera o del settore correlato.
Per ogni azienda indica:
- name: nome ufficiale dell'azienda
- website: sito web ufficiale (OBBLIGATORIO - es: "https://www.siemens.com"). Questo campo e' CRITICO perche' lo useremo per cercare contatti. Per aziende con filiale italiana usa il dominio .it se esiste (es: "https://www.abb.it", "https://www.festo.it"). Se non conosci il sito, prova il pattern https://www.[nomeazienda].com o .it
- domain: dominio email dell'azienda (es: "siemens.com", "abb.it", "festo.com"). Per aziende italiane o con filiale italiana, PREFERISCI il dominio .it
- country: paese sede principale (es: "Germany", "Italy", "Japan")

REGOLE:
- INCLUDI aziende di TUTTE le dimensioni: multinazionali, medie imprese, PMI italiane
- Per SPS/automazione includi: PLC, sensori, drives, robotica, pneumatica, connettori, cavi, software industriale, HMI, SCADA, safety, visione artificiale, motion control, bus di campo, IO-Link, edge computing industriale, cobot
- Includi sia aziende internazionali (Siemens, ABB, Schneider) che italiane (Datalogic, Gefran, Sew-Eurodrive Italia, Lenze Italia, Camozzi, Pizzato, Pneumax, Lovato Electric, Seneca, Telmotor)
- NON includere aziende gia' nella lista "GIA' TROVATE"
- SOLO aziende REALI che esistono davvero
- Il website e' FONDAMENTALE: senza di esso non possiamo cercare contatti. Mettilo SEMPRE.

Rispondi SOLO con un JSON array. Nessun testo prima o dopo.
Esempio: [{"name":"Siemens","website":"https://www.siemens.com","domain":"siemens.it","country":"Germany"},{"name":"Gefran","website":"https://www.gefran.com","domain":"gefran.com","country":"Italy"}]`;

            const knowledgeResult = callClaudeCli(knowledgePrompt, 'claude-sonnet-4-6', 120_000);
            let knownCompanies: Array<{ name: string; website?: string | null; domain?: string | null; country?: string | null }> = [];
            try {
                const jsonMatch = knowledgeResult.match(/\[[\s\S]*\]/);
                if (jsonMatch) knownCompanies = JSON.parse(jsonMatch[0]);
            } catch { /* parse failed */ }

            if (knownCompanies.length > 0) {
                console.log(`[LeadGen-Knowledge] Generated ${knownCompanies.length} known exhibitor companies`);
                const existingLower = new Set(existingCompanyNames.map(n => n.toLowerCase()));
                let added = 0;
                for (const co of knownCompanies) {
                    if (!co.name || existingLower.has(co.name.toLowerCase())) continue;
                    // Use explicit domain field if provided, otherwise extract from website
                    const domain = co.domain || (co.website ? extractDomain(co.website) : null);
                    allLeads.push({
                        firstName: null, lastName: null, fullName: null,
                        jobTitle: null, email: null, phone: null, linkedinUrl: null,
                        companyName: co.name,
                        companyDomain: domain,
                        companyWebsite: co.website || (domain ? `https://www.${domain}` : null),
                        companySize: null, companyIndustry: null,
                        companyCity: null, companyCountry: co.country || null,
                        source: 'knowledge', notes: `Espositore noto del settore — generato da conoscenza AI`,
                        confidence: null, emailStatus: null,
                        _enriched: false, _sources: new Set(['knowledge']),
                    });
                    added++;
                }
                console.log(`[LeadGen-Knowledge] Added ${added} new companies (total leads: ${allLeads.length})`);
                const withDomain = allLeads.filter(l => l.source === 'knowledge' && l.companyDomain).length;
                console.log(`[LeadGen-Knowledge] ${withDomain}/${added} companies have domains → ready for Hunter enrichment`);
                emit({
                    phase: 'knowledge',
                    message: `Generati ${added} espositori noti. ${withDomain} hanno già il dominio web.`,
                    companiesFound: totalCompanies + added,
                    progress: 35,
                });
            }
        } catch (e: any) {
            console.error('[LeadGen-Knowledge] Failed to generate known exhibitors:', e.message);
        }
    }

    // ===================== DOMAIN DISCOVERY =====================
    // For companies without a domain, use Claude to map company names → real domains
    // This is the #1 most critical step: without correct domains, Hunter can't find contacts
    const needDomain = allLeads.filter(l => l.companyName && !l.companyDomain && !l.companyWebsite);
    if (needDomain.length > 0) {
        console.log(`[LeadGen-Domain] ${needDomain.length} companies need domain discovery`);
        emit({
            phase: 'domain',
            message: `Ricerca domini reali per ${needDomain.length} aziende con AI...`,
            companiesFound: new Set(allLeads.filter(l => l.companyName).map(l => l.companyName!.toLowerCase())).size,
            progress: 38,
        });

        // ===== STRATEGY 1 (PRIMARY): Claude AI domain mapping =====
        // Ask Claude to provide the real corporate email domain for each company.
        // This is FREE (no API credits) and far more accurate than string guessing.
        // Claude knows that "SIEMENS" = siemens.com, "FESTO" = festo.com, "SEW-EURODRIVE ITALIA" = sew-eurodrive.it, etc.
        const companyNamesNeedingDomain = [...new Set(needDomain.filter(l => !l.companyDomain).map(l => l.companyName!))];
        const CLAUDE_DOMAIN_BATCH = 60; // Process 60 companies per Claude call
        let claudeMappedCount = 0;

        for (let batchStart = 0; batchStart < companyNamesNeedingDomain.length; batchStart += CLAUDE_DOMAIN_BATCH) {
            const batch = companyNamesNeedingDomain.slice(batchStart, batchStart + CLAUDE_DOMAIN_BATCH);
            const batchNum = Math.floor(batchStart / CLAUDE_DOMAIN_BATCH) + 1;
            const totalBatches = Math.ceil(companyNamesNeedingDomain.length / CLAUDE_DOMAIN_BATCH);

            emit({
                phase: 'domain',
                message: `AI: mappatura domini [${batchNum}/${totalBatches}] — ${batch.length} aziende...`,
                progress: 38 + Math.round((batchStart / companyNamesNeedingDomain.length) * 5),
            });

            try {
                const domainPrompt = `Per ciascuna delle seguenti aziende, indica il DOMINIO EMAIL AZIENDALE corretto (quello usato per le email dei dipendenti, NON necessariamente il sito web).

REGOLE CRITICHE:
- Rispondi SOLO con un JSON array
- Per ogni azienda: {"name":"NOME ESATTO","domain":"dominio.com"}
- Se l'azienda ha una filiale italiana con dominio .it usato per email, usa quello (es: sew-eurodrive.it, lenze.it, sick.it)
- Se l'azienda usa un dominio .com globale per le email, usa .com (es: siemens.com, festo.com, abb.com)
- Per aziende piccole/sconosciute, prova il pattern nomeazienda.it o nomeazienda.com
- Se non sei sicuro del dominio, indica comunque la tua migliore stima — NON lasciare null
- Per consorzi, università, associazioni: usa il loro dominio reale (es: unipr.it, profibus.com)
- ATTENZIONE ai nomi composti: "BOSCH REXROTH" = boschrexroth.com, "NORD DRIVESYSTEMS" = nord.com, "ENDRESS + HAUSER" = endress.com

AZIENDE:
${batch.map((name, i) => `${i + 1}. ${name}`).join('\n')}

JSON:`;

                const domainResult = callClaudeCli(domainPrompt, 'claude-haiku-4-5', 60_000);
                let mappings: Array<{ name: string; domain: string }> = [];
                try {
                    const jsonMatch = domainResult.match(/\[[\s\S]*\]/);
                    if (jsonMatch) mappings = JSON.parse(jsonMatch[0]);
                } catch { /* parse failed */ }

                if (mappings.length > 0) {
                    // Build a lookup by lowercase name
                    const domainLookup = new Map<string, string>();
                    for (const m of mappings) {
                        if (m.name && m.domain) {
                            domainLookup.set(m.name.toLowerCase().trim(), m.domain.toLowerCase().trim());
                        }
                    }

                    // Apply to leads
                    for (const lead of needDomain) {
                        if (lead.companyDomain) continue; // already has domain
                        const mapped = domainLookup.get(lead.companyName!.toLowerCase().trim());
                        if (mapped && mapped.includes('.')) {
                            lead.companyDomain = mapped;
                            lead.companyWebsite = `https://www.${mapped}`;
                            claudeMappedCount++;
                            console.log(`[LeadGen-Domain] AI: ${lead.companyName} → ${mapped}`);
                        }
                    }
                }
                console.log(`[LeadGen-Domain] AI batch ${batchNum}: mapped ${mappings.length} domains (cumulative: ${claudeMappedCount})`);
            } catch (e: any) {
                console.error(`[LeadGen-Domain] AI domain mapping batch ${batchNum} failed:`, e.message);
            }
        }

        console.log(`[LeadGen-Domain] Strategy 1 (AI mapping): ${claudeMappedCount}/${companyNamesNeedingDomain.length} companies mapped`);

        // ===== STRATEGY 2: Google search for remaining unknowns =====
        // Only for companies that Claude couldn't map (very niche/obscure ones)
        if (apiKeys.serpApi) {
            const stillNeedDomain = needDomain.filter(l => !l.companyDomain);
            const MAX_GOOGLE_LOOKUPS = 50;
            const toSearch = stillNeedDomain.slice(0, MAX_GOOGLE_LOOKUPS);
            if (toSearch.length > 0) {
                console.log(`[LeadGen-Domain] Strategy 2: Google search for ${toSearch.length} remaining companies`);
                emit({
                    phase: 'domain',
                    message: `Google: ricerca domini per ${toSearch.length} aziende non mappate...`,
                    progress: 43,
                });
                const BATCH_SIZE = 10;
                for (let i = 0; i < toSearch.length; i += BATCH_SIZE) {
                    const batch = toSearch.slice(i, i + BATCH_SIZE);
                    const domainPromises = batch.map(async (lead) => {
                        try {
                            const resultStr = await executeToolCall('searchGoogleWeb', {
                                query: `"${lead.companyName}" sito ufficiale OR official website`,
                                num: 3,
                            }, companyId, apiKeys as any, conversationId);
                            const parsed = JSON.parse(resultStr);
                            const skipDomains = ['linkedin.com', 'wikipedia', 'facebook.com', 'twitter.com', 'youtube.com', 'amazon.', 'bloomberg.com', 'crunchbase.com', 'glassdoor.', 'indeed.'];
                            for (const r of (parsed.results || [])) {
                                if (!r.link) continue;
                                const d = extractDomain(r.link);
                                if (d && !skipDomains.some(s => d.includes(s))) {
                                    lead.companyDomain = d;
                                    lead.companyWebsite = r.link;
                                    console.log(`[LeadGen-Domain] Google: ${lead.companyName} → ${d}`);
                                    break;
                                }
                            }
                        } catch { /* skip */ }
                    });
                    await Promise.all(domainPromises);
                }
            }
        }

        // ===== STRATEGY 3: Simple fallback for any still-unmapped =====
        const finalNeedDomain = needDomain.filter(l => !l.companyDomain);
        if (finalNeedDomain.length > 0) {
            console.log(`[LeadGen-Domain] Strategy 3: Simple fallback for ${finalNeedDomain.length} companies`);
            for (const lead of finalNeedDomain) {
                const cleanName = lead.companyName!
                    .replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|ltd|gmbh|inc|corp|co\.?|italia|italy|group|spa|srl|e\.v\.|a\.s\.|co\.,?\s*ltd)\b/gi, '')
                    .replace(/[^a-zA-Z0-9\-]/g, '')
                    .toLowerCase()
                    .trim();
                if (cleanName && cleanName.length >= 3) {
                    lead.companyDomain = `${cleanName}.com`;
                    lead.companyWebsite = `https://www.${cleanName}.com`;
                    console.log(`[LeadGen-Domain] Fallback: ${lead.companyName} → ${cleanName}.com`);
                }
            }
        }

        const totalFound = needDomain.filter(l => l.companyDomain).length;
        console.log(`[LeadGen-Domain] Domain discovery complete: ${totalFound}/${needDomain.length} (AI: ${claudeMappedCount}, Google+Fallback: ${totalFound - claudeMappedCount})`);
        emit({
            phase: 'domain',
            message: `Domini trovati: ${totalFound}/${needDomain.length} aziende (${claudeMappedCount} da AI). Avvio ricerca contatti...`,
            companiesFound: new Set(allLeads.filter(l => l.companyName).map(l => l.companyName!.toLowerCase())).size,
            progress: 45,
        });
    }

    // ===================== ENRICHMENT PIPELINE =====================
    console.log(`[LeadGen-Exec] === ENRICHMENT PIPELINE === ${allLeads.length} raw leads`);

    // Deduplicate first
    const uniqueLeads = deduplicateLeads(allLeads, existingEmails);
    console.log(`[LeadGen-Exec] After dedup: ${uniqueLeads.length} unique leads`);

    // ENRICHMENT PASS 0.5: For Google Maps/scraping leads without domain, try to guess Italian domain
    for (const lead of uniqueLeads) {
        if (lead.companyDomain || lead.companyWebsite) continue;
        if (!lead.companyName) continue;
        // Guess domain: "Festo S.p.A." → "festo.it", "ABB" → "abb.it"
        const cleanName = lead.companyName
            .replace(/\b(s\.?p\.?a\.?|s\.?r\.?l\.?|s\.?a\.?s\.?|s\.?n\.?c\.?|ltd|gmbh|inc|corp|co\.?)\b/gi, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()
            .trim();
        if (cleanName && cleanName.length >= 2) {
            lead.companyDomain = `${cleanName}.it`;
            lead.companyWebsite = `https://${cleanName}.it`;
            console.log(`[LeadGen-Enrich] Guessed domain for "${lead.companyName}": ${cleanName}.it`);
        }
    }

    // ENRICHMENT PASS 0.9 (FREE — Website scraping): Visit each company's contact/team page
    // Runs BEFORE paid APIs so we get free emails first
    {
        const companiesWithDomain = uniqueLeads.filter(l =>
            l.companyName && l.companyDomain && (!l.email || isGenericEmail(l.email))
        );
        // Deduplicate by domain
        const domainMap = new Map<string, any>();
        for (const l of companiesWithDomain) {
            const key = l.companyDomain!.toLowerCase();
            if (!domainMap.has(key)) domainMap.set(key, l);
        }
        const companiesToScrape = [...domainMap.values()];

        if (companiesToScrape.length > 0) {
            console.log(`[LeadGen-WebScrape] Pass 0.9: Scraping contact pages for ${companiesToScrape.length} companies`);
            emit({
                phase: 'enrich',
                message: `Visito i siti web di ${companiesToScrape.length} aziende per trovare email nelle pagine contatti (gratis)...`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 42,
            });

            try {
                const { chromium } = await import('playwright');
                const browser = await chromium.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox'],
                });

                const SCRAPE_BATCH = 5;
                let scrapedCount = 0;
                let foundCount = 0;
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
                const contactPaths = ['/contatti', '/contact', '/contact-us', '/chi-siamo', '/team', '/about-us', '/about', '/azienda', '/kontakt', '/impressum'];

                for (let i = 0; i < companiesToScrape.length; i += SCRAPE_BATCH) {
                    const batch = companiesToScrape.slice(i, i + SCRAPE_BATCH);
                    const batchNum = Math.floor(i / SCRAPE_BATCH) + 1;
                    const totalBatches = Math.ceil(companiesToScrape.length / SCRAPE_BATCH);

                    emit({
                        phase: 'enrich',
                        message: `🌐 Siti web [${batchNum}/${totalBatches}]: ${batch.map(l => l.companyName).join(', ')}`,
                        leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                        progress: 42 + Math.round((i / companiesToScrape.length) * 6),
                    });

                    const scrapePromises = batch.map(async (lead) => {
                        const context = await browser.newContext({
                            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            viewport: { width: 1280, height: 800 },
                        });
                        const page = await context.newPage();
                        page.setDefaultTimeout(10000);
                        const domain = lead.companyDomain!;
                        let bestPersonalEmail: string | null = null;
                        let bestGenericEmail: string | null = null;
                        let bestName: string | null = null;
                        let bestPhone: string | null = null;
                        let companyDescription = ''; // What the company does
                        let companyDetails: string[] = []; // Revenue, employees, year, etc.

                        // Helper to emit browser activity with optional screenshot
                        const emitBrowser = async (action: string, takeScreenshot = false) => {
                            let screenshot: string | undefined;
                            if (takeScreenshot) {
                                try {
                                    const buf = await page.screenshot({ type: 'jpeg', quality: 40, fullPage: false });
                                    screenshot = buf.toString('base64');
                                } catch { /* screenshot failed, skip */ }
                            }
                            const currentUrl = page.url();
                            emit({
                                phase: 'enrich',
                                message: `🌐 ${lead.companyName}: ${action}`,
                                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                                progress: 42 + Math.round((scrapedCount / companiesToScrape.length) * 6),
                                browserUrl: currentUrl !== 'about:blank' ? currentUrl : undefined,
                                browserScreenshot: screenshot,
                            });
                        };

                        try {
                            // First try homepage to verify domain is alive
                            try {
                                await emitBrowser(`Apro https://www.${domain}`);
                                await page.goto(`https://www.${domain}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
                                await emitBrowser(`Homepage caricata`, true);
                                const homeText = await page.innerText('body').catch(() => '');
                                if (homeText.length < 30) {
                                    await page.goto(`https://${domain}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
                                    await emitBrowser(`Homepage (no www)`, true);
                                }
                            } catch {
                                try {
                                    await page.goto(`https://${domain}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
                                    await emitBrowser(`Homepage (fallback)`, true);
                                } catch {
                                    await emitBrowser(`❌ Sito non raggiungibile`);
                                    await context.close().catch(() => {});
                                    scrapedCount++;
                                    return;
                                }
                            }

                            // === EXTRACT COMPANY INFO from homepage ===
                            try {
                                const homeText = await page.innerText('body').catch(() => '');
                                if (homeText.length > 50) {
                                    // Extract meta description or first meaningful paragraph as company description
                                    const metaDesc = await page.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => null);
                                    const ogDesc = await page.$eval('meta[property="og:description"]', el => el.getAttribute('content')).catch(() => null);
                                    companyDescription = metaDesc || ogDesc || '';

                                    // If no meta description, try to grab first substantial paragraph
                                    if (!companyDescription || companyDescription.length < 20) {
                                        const paragraphs = await page.$$eval('p', els => els.map(el => (el.textContent || '').trim()).filter(t => t.length > 40 && t.length < 500));
                                        if (paragraphs.length > 0) companyDescription = paragraphs[0];
                                    }

                                    // Extract structured data: revenue, employees, year founded
                                    const revenueMatch = homeText.match(/fatturato[:\s]+[€$]?\s*([\d.,]+)\s*(milion[ie]|mln|M|billion[ie]|miliard[ie])/i);
                                    if (revenueMatch) companyDetails.push(`Fatturato: ${revenueMatch[0].trim()}`);

                                    const employeeMatch = homeText.match(/(\d[\d.]*)\s*(dipendent[ie]|collaborator[ie]|employees|mitarbeiter)/i);
                                    if (employeeMatch) companyDetails.push(`Dipendenti: ${employeeMatch[1]} ${employeeMatch[2]}`);

                                    const yearMatch = homeText.match(/(fondат?a?|founded|seit|established|dal)\s*(nel\s+)?(\d{4})/i);
                                    if (yearMatch) companyDetails.push(`Fondata: ${yearMatch[3]}`);

                                    const certMatch = homeText.match(/(ISO\s*\d{3,5}(?:[:-]\d+)?)/gi);
                                    if (certMatch) companyDetails.push(`Certificazioni: ${[...new Set(certMatch)].slice(0, 3).join(', ')}`);

                                    if (companyDescription) {
                                        await emitBrowser(`📋 Info: ${companyDescription.substring(0, 80)}...`);
                                    }
                                }
                            } catch { /* homepage info extraction failed */ }

                            // === VISIT "chi siamo" / "about" page for more details ===
                            const aboutPaths = ['/chi-siamo', '/about', '/about-us', '/azienda', '/company', '/ueber-uns'];
                            for (const aboutPath of aboutPaths) {
                                if (companyDetails.length >= 3) break; // Already have enough info
                                try {
                                    await page.goto(`https://www.${domain}${aboutPath}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
                                    const aboutText = await page.innerText('body').catch(() => '');
                                    if (aboutText.length < 50) continue;

                                    await emitBrowser(`Leggo ${aboutPath}`, true);

                                    // Better description from about page
                                    if (!companyDescription || companyDescription.length < 30) {
                                        const metaDesc = await page.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => null);
                                        if (metaDesc && metaDesc.length > 30) companyDescription = metaDesc;
                                        else {
                                            const paragraphs = await page.$$eval('p', els => els.map(el => (el.textContent || '').trim()).filter(t => t.length > 40 && t.length < 500));
                                            if (paragraphs.length > 0 && paragraphs[0].length > (companyDescription?.length || 0)) {
                                                companyDescription = paragraphs[0];
                                            }
                                        }
                                    }

                                    // Extract additional details
                                    if (!companyDetails.some(d => d.startsWith('Fatturato'))) {
                                        const rev = aboutText.match(/fatturato[:\s]+[€$]?\s*([\d.,]+)\s*(milion[ie]|mln|M|billion[ie]|miliard[ie])/i);
                                        if (rev) companyDetails.push(`Fatturato: ${rev[0].trim()}`);
                                    }
                                    if (!companyDetails.some(d => d.startsWith('Dipendenti'))) {
                                        const emp = aboutText.match(/(\d[\d.]*)\s*(dipendent[ie]|collaborator[ie]|employees|mitarbeiter)/i);
                                        if (emp) companyDetails.push(`Dipendenti: ${emp[1]} ${emp[2]}`);
                                    }
                                    if (!companyDetails.some(d => d.startsWith('Fondata'))) {
                                        const yr = aboutText.match(/(fondat?a?|founded|seit|established|dal)\s*(nel\s+)?(\d{4})/i);
                                        if (yr) companyDetails.push(`Fondata: ${yr[3]}`);
                                    }
                                    // Sede / location
                                    if (!companyDetails.some(d => d.startsWith('Sede'))) {
                                        const sedeMatch = aboutText.match(/sede[:\s]+([\w\s,]+(?:Italia|Italy|Germany|Deutschland|France))/i);
                                        if (sedeMatch) companyDetails.push(`Sede: ${sedeMatch[1].trim()}`);
                                    }
                                    // Settori / markets served
                                    const settoriMatch = aboutText.match(/settor[ie][:\s]+([^.]{10,100})/i);
                                    if (settoriMatch && !companyDetails.some(d => d.startsWith('Settori'))) {
                                        companyDetails.push(`Settori: ${settoriMatch[1].trim()}`);
                                    }

                                    if (companyDetails.length > 0) {
                                        await emitBrowser(`📊 ${companyDetails[companyDetails.length - 1]}`);
                                    }
                                    break; // Got the about page, no need to try others
                                } catch { /* about page not found, try next */ }
                            }

                            // Scan contact paths for emails
                            for (const path of contactPaths) {
                                if (bestPersonalEmail) break;
                                try {
                                    const url = `https://www.${domain}${path}`;
                                    await emitBrowser(`Navigo ${path}`);
                                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
                                    await emitBrowser(`Pagina ${path} caricata`, true);
                                    const text = await page.innerText('body').catch(() => '');
                                    if (text.length < 30) continue;

                                    // Extract emails
                                    const emails: string[] = [...new Set<string>((text.match(emailRegex) as string[] | null) || [])];
                                    // Filter: must look like a real email, not image filenames etc.
                                    const validEmails = emails.filter(e =>
                                        !e.match(/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i) &&
                                        !e.includes('example.com') &&
                                        !e.includes('sentry') &&
                                        e.length < 60
                                    );

                                    const personal = validEmails.filter(e => !isGenericEmail(e) && e.toLowerCase().includes(domain.split('.')[0]));
                                    const domainEmails = validEmails.filter(e => e.toLowerCase().includes(domain.split('.')[0]));
                                    const anyValid = validEmails.filter(e => !isGenericEmail(e));

                                    if (personal.length > 0) {
                                        bestPersonalEmail = personal[0];
                                        // Try to extract name from local part
                                        const localPart = bestPersonalEmail.split('@')[0];
                                        const parts = localPart.split(/[._-]/);
                                        if (parts.length >= 2) {
                                            bestName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
                                        }
                                        await emitBrowser(`✅ Trovato ${bestPersonalEmail} su ${path}`);
                                        break;
                                    } else if (anyValid.length > 0 && !bestPersonalEmail) {
                                        bestPersonalEmail = anyValid[0];
                                        await emitBrowser(`📧 Trovato ${anyValid[0]} su ${path}`);
                                    } else if (domainEmails.length > 0 && !bestGenericEmail) {
                                        bestGenericEmail = domainEmails[0];
                                        await emitBrowser(`📧 Email generica: ${domainEmails[0]} su ${path}`);
                                    }

                                    // Also try to extract phone numbers
                                    if (!bestPhone) {
                                        const phoneMatch = text.match(/(?:\+39\s?|0)\d{2,4}[\s.-]?\d{4,8}/);
                                        if (phoneMatch) bestPhone = phoneMatch[0];
                                    }
                                } catch { /* page not found, try next */ }
                            }

                            // Also try to find emails by clicking "Contatti" link on homepage
                            if (!bestPersonalEmail) {
                                try {
                                    await page.goto(`https://www.${domain}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
                                    const contactLink = await page.$('a[href*="contatt"], a[href*="contact"], a[href*="about"]');
                                    if (contactLink) {
                                        const href = await contactLink.getAttribute('href');
                                        if (href) {
                                            await emitBrowser(`Seguo link "${href}"`);
                                            await contactLink.click();
                                            await page.waitForLoadState('domcontentloaded', { timeout: 6000 }).catch(() => {});
                                            await emitBrowser(`Pagina contatti via link`, true);
                                            const text = await page.innerText('body').catch(() => '');
                                            const emails: string[] = [...new Set<string>((text.match(emailRegex) as string[] | null) || [])];
                                            const personal = emails.filter(e => !isGenericEmail(e) && e.length < 60 && !e.match(/\.(png|jpg)$/i));
                                            if (personal.length > 0) {
                                                bestPersonalEmail = personal[0];
                                                await emitBrowser(`✅ Trovato ${personal[0]} via link contatti`);
                                            }
                                        }
                                    }
                                } catch { /* navigation failed */ }
                            }
                        } catch (e: any) {
                            await emitBrowser(`⚠️ Errore: ${e.message?.substring(0, 50)}`);
                        } finally {
                            await context.close().catch(() => {});
                        }

                        // Apply findings
                        const foundEmail = bestPersonalEmail || bestGenericEmail;
                        if (foundEmail) {
                            lead.email = foundEmail.toLowerCase();
                            lead.emailStatus = isGenericEmail(foundEmail) ? 'generic' : 'scraped';
                            lead._sources = lead._sources || new Set();
                            lead._sources.add('website');
                            lead._enriched = true;
                            foundCount++;
                        }
                        if (bestName && !lead.fullName) {
                            const nameParts = bestName.split(' ');
                            lead.firstName = lead.firstName || nameParts[0] || null;
                            lead.lastName = lead.lastName || nameParts.slice(1).join(' ') || null;
                            lead.fullName = bestName;
                        }
                        if (bestPhone && !lead.phone) {
                            lead.phone = bestPhone;
                        }

                        // Save company intelligence for email personalization
                        const noteParts: string[] = [];
                        if (foundEmail) noteParts.push(`Email da sito web (${domain})`);
                        if (companyDescription) {
                            // Truncate to 300 chars max
                            const desc = companyDescription.length > 300 ? companyDescription.substring(0, 297) + '...' : companyDescription;
                            noteParts.push(`Attività: ${desc}`);
                        }
                        if (companyDetails.length > 0) {
                            noteParts.push(companyDetails.join(' | '));
                        }
                        if (noteParts.length > 0) {
                            lead.notes = (lead.notes || '') + (lead.notes ? ' | ' : '') + noteParts.join(' | ');
                        }

                        // Set industry/sector from website description
                        if (companyDescription && !lead.companyIndustry) {
                            lead.companyIndustry = companyDescription.substring(0, 100);
                        }
                        // Set company size from employee count found on site
                        const empDetail = companyDetails.find(d => d.startsWith('Dipendenti'));
                        if (empDetail && !lead.companySize) {
                            lead.companySize = empDetail;
                        }
                        // Set revenue if found
                        const revDetail = companyDetails.find(d => d.startsWith('Fatturato'));
                        if (revDetail && !lead.revenueYear1) {
                            lead.revenueYear1 = revDetail;
                        }

                        scrapedCount++;
                    });

                    await Promise.all(scrapePromises);
                }

                await browser.close();
                console.log(`[LeadGen-WebScrape] Pass 0.9 complete: scraped ${scrapedCount} sites, found emails for ${foundCount}`);
                emit({
                    phase: 'enrich',
                    message: `Siti web visitati: ${foundCount} email trovate su ${scrapedCount} aziende navigate (gratis).`,
                    leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                    progress: 48,
                });
            } catch (e: any) {
                console.error(`[LeadGen-WebScrape] Playwright failed:`, e.message);
                emit({
                    phase: 'enrich',
                    message: `⚠️ Browser non disponibile: ${e.message?.substring(0, 60)}. Salto scraping siti web.`,
                    progress: 48,
                });
            }
        }
    }

    // ENRICHMENT PASS 0.8: For fair searches, batch-search Apollo/Vibe by company names
    // This finds actual people/contacts at the companies we've identified
    if (isFairSearch) {
        const companiesWithoutContacts = uniqueLeads.filter(l =>
            l.companyName && !l.fullName && !l.email
        );
        const companyNamesForSearch = [...new Set(companiesWithoutContacts.map(l => l.companyName!))];

        if (companyNamesForSearch.length > 0 && apiKeys.apollo) {
            console.log(`[LeadGen-Enrich] Pass 0.8a: Apollo batch search for ${companyNamesForSearch.length} companies`);
            emit({ phase: 'enrich', message: `Ricerca contatti Apollo per ${companyNamesForSearch.length} aziende...`, progress: 48 });
            // Apollo search by company name batches (max ~10 per query for best results)
            const APOLLO_BATCH = 10;
            for (let i = 0; i < companyNamesForSearch.length; i += APOLLO_BATCH) {
                const batch = companyNamesForSearch.slice(i, i + APOLLO_BATCH);
                try {
                    const resultStr = await executeToolCall('searchPeopleApollo', {
                        jobTitles: ['Sales Manager', 'Area Manager', 'Business Development Manager', 'Key Account Manager', 'Commercial Director', 'Export Manager', 'Direttore Commerciale'],
                        keywords: batch.join(', '),
                        locations: ['Italy'],
                        limit: Math.min(batch.length * 3, 25),
                    }, companyId, apiKeys as any, conversationId);
                    const parsed = JSON.parse(resultStr);
                    const people = parsed.people || [];
                    for (const p of people) {
                        if (p.email || p.companyName) {
                            const newLead = normalizeLead(p, 'searchPeopleApollo');
                            // Try to merge with existing company-only lead
                            const existing = uniqueLeads.find(l =>
                                l.companyName && newLead.companyName &&
                                l.companyName.toLowerCase().includes(newLead.companyName.toLowerCase().split(' ')[0]) &&
                                !l.fullName
                            );
                            if (existing) {
                                Object.assign(existing, mergeLeadData(existing, newLead));
                                existing._enriched = true;
                            } else {
                                uniqueLeads.push(newLead);
                            }
                        }
                    }
                    if (people.length > 0) {
                        console.log(`[LeadGen-Enrich] Apollo batch ${Math.floor(i / APOLLO_BATCH) + 1}: found ${people.length} contacts`);
                    }
                } catch { /* skip batch */ }
            }
        }

        if (companyNamesForSearch.length > 0 && apiKeys.vibeProspect) {
            console.log(`[LeadGen-Enrich] Pass 0.8b: Vibe batch search for ${companyNamesForSearch.length} companies`);
            emit({ phase: 'enrich', message: `Ricerca contatti Vibe per ${companyNamesForSearch.length} aziende...`, progress: 52 });
            // Vibe supports company_names directly — search in batches of 20
            const VIBE_BATCH = 20;
            for (let i = 0; i < companyNamesForSearch.length; i += VIBE_BATCH) {
                const batch = companyNamesForSearch.slice(i, i + VIBE_BATCH);
                try {
                    const resultStr = await executeToolCall('searchProspectsVibe', {
                        company_names: batch,
                        has_email: true,
                        limit: batch.length * 3,
                    }, companyId, apiKeys as any, conversationId);
                    const parsed = JSON.parse(resultStr);
                    const people = parsed.people || [];
                    for (const p of people) {
                        const newLead = normalizeLead(p, 'searchProspectsVibe');
                        const existing = uniqueLeads.find(l =>
                            l.companyName && newLead.companyName &&
                            l.companyName.toLowerCase().includes(newLead.companyName.toLowerCase().split(' ')[0]) &&
                            !l.fullName
                        );
                        if (existing) {
                            Object.assign(existing, mergeLeadData(existing, newLead));
                            existing._enriched = true;
                        } else {
                            uniqueLeads.push(newLead);
                        }
                    }
                    if (people.length > 0) {
                        console.log(`[LeadGen-Enrich] Vibe batch ${Math.floor(i / VIBE_BATCH) + 1}: found ${people.length} contacts`);
                    }
                } catch { /* skip batch */ }
            }
        }
    }

    // ENRICHMENT PASS 1: Find emails for leads missing personal email
    // Use Hunter domain search + email finder for leads with company domain but no/generic email
    if (apiKeys.hunter) {
        const needEmail = uniqueLeads.filter(l => (!l.email || isGenericEmail(l.email)) && (l.companyDomain || l.companyWebsite));
        const domainsSearched = new Set(plan.tasks.filter(t => t.tool === 'findEmailsHunter').map(t => t.args?.domain));

        // Group by domain to avoid duplicate API calls
        const byDomain = new Map<string, any[]>();
        for (const lead of needEmail) {
            const domain = lead.companyDomain || extractDomain(lead.companyWebsite);
            if (!domain || domainsSearched.has(domain)) continue;
            if (!byDomain.has(domain)) byDomain.set(domain, []);
            byDomain.get(domain)!.push(lead);
        }

        // Also enrich leads from Google Maps / scraping that have domain but no personal contacts
        const allDomains = new Set<string>();
        for (const lead of uniqueLeads) {
            const domain = lead.companyDomain || extractDomain(lead.companyWebsite);
            if (domain && !domainsSearched.has(domain) && !byDomain.has(domain)) {
                if (!lead.email || isGenericEmail(lead.email)) {
                    allDomains.add(domain);
                }
            }
        }

        // Rimosso il cap a 40 per supportare richieste massive come "tutti i contatti"
        const domainsToSearch = [...byDomain.keys(), ...allDomains];
        if (domainsToSearch.length > 0) {
            console.log(`[LeadGen-Enrich] Pass 1: Hunter domain search on ${domainsToSearch.length} domains`);
            emit({
                phase: 'enrich',
                message: `Hunter: ricerca contatti su ${domainsToSearch.length} domini aziendali...`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 55,
            });

            // Batch Hunter requests (15 parallel per batch) with progress updates
            const HUNTER_BATCH = 15;
            const hunterResultsRaw: (any | null)[] = [];
            for (let batchStart = 0; batchStart < domainsToSearch.length; batchStart += HUNTER_BATCH) {
                const batch = domainsToSearch.slice(batchStart, batchStart + HUNTER_BATCH);
                const batchNum = Math.floor(batchStart / HUNTER_BATCH) + 1;
                const totalBatches = Math.ceil(domainsToSearch.length / HUNTER_BATCH);
                const progressBase = 55;
                const progressRange = 15; // 55% → 70%
                const batchProgress = progressBase + Math.round((batchStart / domainsToSearch.length) * progressRange);

                emit({
                    phase: 'enrich',
                    message: `Hunter [${batchNum}/${totalBatches}]: ${batch.slice(0, 4).join(', ')}${batch.length > 4 ? ` +${batch.length - 4}` : ''}...`,
                    detail: batch.join(', '),
                    leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                    progress: batchProgress,
                });

                const batchPromises = batch.map(async (domain) => {
                    try {
                        const resultStr = await executeToolCall('findEmailsHunter', { domain, type: 'personal' }, companyId, apiKeys as any, conversationId);
                        const parsed = JSON.parse(resultStr);
                        if (!parsed.error && parsed.emails?.length > 0) {
                            return { domain, emails: parsed.emails, organization: parsed.organization };
                        }
                    } catch { /* skip */ }
                    return null;
                });
                const batchResults = await Promise.all(batchPromises);
                hunterResultsRaw.push(...batchResults);
            }

            // RETRY: for domains with no results, try alternate TLD (.it↔.com)
            const failedDomains = domainsToSearch.filter((domain, i) => !hunterResultsRaw[i]);
            const retryCount = failedDomains.length;
            if (retryCount > 0) {
                console.log(`[LeadGen-Enrich] Hunter retry: ${retryCount} domains failed, trying alternate TLDs...`);
                emit({
                    phase: 'enrich',
                    message: `Hunter retry: ${retryCount} domini senza risultati, provo TLD alternativo (.it↔.com)...`,
                    progress: 68,
                });
            }
            const retryPromises = failedDomains
                .map(async (domain) => {
                    // Try .it → .com OR .com → .it
                    let altDomain: string | null = null;
                    if (domain.endsWith('.it')) altDomain = domain.replace(/\.it$/, '.com');
                    else if (domain.endsWith('.com')) altDomain = domain.replace(/\.com$/, '.it');
                    else return null; // no alternate to try

                    try {
                        const resultStr = await executeToolCall('findEmailsHunter', { domain: altDomain, type: 'personal' }, companyId, apiKeys as any, conversationId);
                        const parsed = JSON.parse(resultStr);
                        if (!parsed.error && parsed.emails?.length > 0) {
                            // Update the leads' domain to the working alternate
                            for (const lead of uniqueLeads) {
                                if (lead.companyDomain === domain) {
                                    lead.companyDomain = altDomain;
                                    lead.companyWebsite = `https://${altDomain}`;
                                }
                            }
                            console.log(`[LeadGen-Enrich] Retry ${domain} → ${altDomain}: found ${parsed.emails.length} contacts`);
                            return { domain: altDomain, emails: parsed.emails, organization: parsed.organization };
                        }
                    } catch { /* skip */ }
                    return null;
                });
            const retryResults = await Promise.all(retryPromises);

            const hunterResults = [...hunterResultsRaw, ...retryResults].filter(Boolean);
            for (const hr of hunterResults) {
                if (!hr) continue;
                // Find leads needing enrichment for this domain
                const domainLeads = uniqueLeads.filter(l =>
                    (l.companyDomain === hr.domain || extractDomain(l.companyWebsite) === hr.domain)
                    && (!l.email || isGenericEmail(l.email))
                );

                // Cap at 2 contacts per domain to maximize company breadth
                const MAX_CONTACTS_PER_DOMAIN = 2;
                let addedForDomain = 0;

                for (const contact of hr.emails) {
                    if (addedForDomain >= MAX_CONTACTS_PER_DOMAIN) break;

                    // Hunter executeToolCall maps: e.value→email, e.first_name→firstName, e.last_name→lastName, e.position→position, e.linkedin→linkedinUrl, e.confidence→confidence
                    const contactEmail = contact.email || contact.value;
                    const contactFirstName = contact.firstName || contact.first_name;
                    const contactLastName = contact.lastName || contact.last_name;
                    const contactPosition = contact.position;
                    const contactLinkedin = contact.linkedinUrl || contact.linkedin;
                    const contactConfidence = contact.confidence;

                    if (!contactEmail || isGenericEmail(contactEmail)) continue;

                    const matchingLead = domainLeads.find(l =>
                        l.firstName && contactFirstName &&
                        l.firstName.toLowerCase() === contactFirstName.toLowerCase()
                    );

                    if (matchingLead) {
                        // Enrich existing lead
                        matchingLead.email = contactEmail;
                        matchingLead.emailStatus = contactConfidence > 80 ? 'valid' : 'unknown';
                        matchingLead.linkedinUrl = matchingLead.linkedinUrl || contactLinkedin;
                        matchingLead.jobTitle = matchingLead.jobTitle || contactPosition;
                        matchingLead._sources.add('hunter');
                        matchingLead._enriched = true;
                        addedForDomain++;
                        console.log(`[LeadGen-Enrich]   → Enriched ${matchingLead.fullName || matchingLead.companyName} with ${contactEmail}`);
                    } else {
                        // New lead from Hunter
                        const newLead = normalizeLead({
                            firstName: contactFirstName, lastName: contactLastName,
                            email: contactEmail, position: contactPosition,
                            linkedinUrl: contactLinkedin,
                            companyName: hr.organization || hr.domain,
                            companyDomain: hr.domain, companyWebsite: `https://${hr.domain}`,
                            emailStatus: contactConfidence > 80 ? 'valid' : 'unknown',
                        }, 'findEmailsHunter');
                        uniqueLeads.push(newLead);
                        addedForDomain++;
                        console.log(`[LeadGen-Enrich]   → New lead: ${newLead.fullName} <${contactEmail}> @ ${hr.domain}`);
                    }
                }
                console.log(`[LeadGen-Enrich] ${hr.domain}: found ${hr.emails.length} contacts, kept ${addedForDomain} (cap: ${MAX_CONTACTS_PER_DOMAIN})`);
            }
        }
    }

    // ENRICHMENT PASS 2: Use Hunter Email Finder for specific people with name+domain but no email
    if (apiKeys.hunter) {
        const needPersonalEmail = uniqueLeads.filter(l =>
            l.firstName && l.lastName && (l.companyDomain || l.companyWebsite)
            && (!l.email || isGenericEmail(l.email))
        ).slice(0, 200); // cap alzato a 200 per massimizzare la ricerca

        if (needPersonalEmail.length > 0) {
            console.log(`[LeadGen-Enrich] Pass 2: Hunter email-finder for ${needPersonalEmail.length} people`);
            emit({
                phase: 'enrich',
                message: `Hunter: ricerca email personali per ${needPersonalEmail.length} persone...`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 70,
            });
            const finderPromises = needPersonalEmail.map(async (lead) => {
                const domain = lead.companyDomain || extractDomain(lead.companyWebsite);
                if (!domain) return null;
                try {
                    const resultStr = await executeToolCall('findEmailHunter', {
                        domain, first_name: lead.firstName, last_name: lead.lastName,
                        company: lead.companyName || undefined,
                    }, companyId, apiKeys as any, conversationId);
                    const parsed = JSON.parse(resultStr);
                    if (parsed.email && !isGenericEmail(parsed.email)) {
                        lead.email = parsed.email;
                        lead.emailStatus = parsed.score > 80 ? 'valid' : 'unknown';
                        lead.linkedinUrl = lead.linkedinUrl || parsed.linkedinUrl;
                        lead._sources.add('hunter');
                        lead._enriched = true;
                        console.log(`[LeadGen-Enrich] Found email for ${lead.fullName}: ${parsed.email} (score: ${parsed.score})`);
                    }
                    return parsed;
                } catch { return null; }
            });
            await Promise.all(finderPromises);
        }
    }

    // ENRICHMENT PASS 3: Verify unverified emails (batch, up to 20)
    if (apiKeys.hunter) {
        const unverified = uniqueLeads.filter(l =>
            l.email && !isGenericEmail(l.email) && l.emailStatus !== 'valid'
        ).slice(0, 200);

        if (unverified.length > 0) {
            console.log(`[LeadGen-Enrich] Pass 3: Verifying ${unverified.length} emails`);
            emit({
                phase: 'verify',
                message: `Verifica ${unverified.length} email...`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 80,
            });
            const verifyPromises = unverified.map(async (lead) => {
                try {
                    const resultStr = await executeToolCall('verifyEmail', { email: lead.email }, companyId, apiKeys as any, conversationId);
                    const parsed = JSON.parse(resultStr);
                    if (parsed.result) {
                        lead.emailStatus = parsed.result; // 'deliverable', 'risky', 'undeliverable'
                        if (parsed.result === 'deliverable') lead.emailStatus = 'valid';
                        else if (parsed.result === 'undeliverable') lead.emailStatus = 'invalid';
                    }
                } catch { /* skip */ }
            });
            await Promise.all(verifyPromises);
        }
    }

    // ENRICHMENT PASS 4: For leads from Google Maps/scraping with company but no contacts,
    // try Vibe Prospecting to find decision makers
    if (apiKeys.vibeProspect) {
        const companiesWithoutContacts = uniqueLeads.filter(l =>
            l.companyName && !l.fullName && l.source !== 'vibe_prospecting'
        );

        if (companiesWithoutContacts.length > 0) {
            const companyNames = companiesWithoutContacts
                .map(l => l.companyName)
                .filter((v, i, a) => a.indexOf(v) === i) // unique
                .slice(0, 200); // Rimosso limite di 30 per ricercare massivamente

            console.log(`[LeadGen-Enrich] Pass 4: Vibe Prospecting for ${companyNames.length} companies without contacts`);
            emit({
                phase: 'enrich',
                message: `Vibe: ricerca contatti per ${companyNames.length} aziende senza email...`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 85,
            });
            try {
                const resultStr = await executeToolCall('searchProspectsVibe', {
                    company_names: companyNames,
                    has_email: true,
                    limit: companyNames.length * 3,
                }, companyId, apiKeys as any, conversationId);
                const parsed = JSON.parse(resultStr);
                if (parsed.people?.length > 0) {
                    for (const p of parsed.people) {
                        const newLead = normalizeLead(p, 'searchProspectsVibe');
                        // Try to merge with existing company-only lead
                        const existing = uniqueLeads.find(l =>
                            l.companyName && newLead.companyName &&
                            l.companyName.toLowerCase() === newLead.companyName.toLowerCase() &&
                            !l.fullName
                        );
                        if (existing) {
                            Object.assign(existing, mergeLeadData(existing, newLead));
                            existing._enriched = true;
                        } else {
                            uniqueLeads.push(newLead);
                        }
                    }
                    console.log(`[LeadGen-Enrich] Vibe added ${parsed.people.length} contacts for companies`);
                }
            } catch { /* skip */ }
        }
    }

    // ENRICHMENT PASS 5 (SerpApi): Google search + LinkedIn for ALL companies missing personal contacts
    // Uses SerpApi (structured API, no bot detection) instead of Playwright for Google searches
    // Searches Google for emails AND LinkedIn for real people names/roles
    {
        const companiesNeedEnrich = uniqueLeads.filter(l =>
            l.companyName && (l.companyDomain || l.companyWebsite) &&
            (!l.fullName || !l.email || isGenericEmail(l.email))
        );
        // Deduplicate by company
        const uniqueCompanies = new Map<string, any>();
        for (const l of companiesNeedEnrich) {
            const key = l.companyName!.toLowerCase();
            if (!uniqueCompanies.has(key)) uniqueCompanies.set(key, l);
        }
        const companiesToSearch = [...uniqueCompanies.values()];

        if (companiesToSearch.length > 0 && apiKeys.serpApi) {
            console.log(`[LeadGen-SerpApi] Pass 5: SerpApi Google + LinkedIn search for ${companiesToSearch.length} companies`);
            emit({
                phase: 'enrich',
                message: `SerpApi: ricerca Google + LinkedIn per ${companiesToSearch.length} aziende ancora senza contatti...`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 87,
            });

            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const SERP_BATCH = 5;
            let searchedCount = 0;
            let foundCount = 0;

            for (let i = 0; i < companiesToSearch.length; i += SERP_BATCH) {
                const batch = companiesToSearch.slice(i, i + SERP_BATCH);
                const batchNum = Math.floor(i / SERP_BATCH) + 1;
                const totalBatches = Math.ceil(companiesToSearch.length / SERP_BATCH);

                emit({
                    phase: 'enrich',
                    message: `🔍 SerpApi [${batchNum}/${totalBatches}]: ${batch.map(l => l.companyName).join(', ')}`,
                    leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                    progress: 87 + Math.round((i / companiesToSearch.length) * 8),
                });

                const searchPromises = batch.map(async (lead) => {
                    const domain = lead.companyDomain || extractDomain(lead.companyWebsite);
                    let bestEmail: string | null = null;
                    let bestName: string | null = null;
                    let bestTitle: string | null = null;
                    let bestLinkedin: string | null = null;

                    try {
                        // STRATEGY 1: Google search for email contacts via SerpApi
                        try {
                            const query = `"${lead.companyName}" email contatto commerciale OR sales OR "area manager" OR direttore`;
                            const resultStr = await executeToolCall('searchGoogleWeb', {
                                query, num: 10, gl: 'it', hl: 'it',
                            }, companyId, apiKeys as any, conversationId);
                            const parsed = JSON.parse(resultStr);
                            const results = parsed.results || [];

                            // Extract emails from snippets and titles
                            const allText = results.map((r: any) => `${r.title} ${r.snippet} ${r.displayedLink}`).join(' ');
                            const googleEmails: string[] = [...new Set<string>((allText.match(emailRegex) as string[] | null) || [])];
                            const domainEmails = domain ? googleEmails.filter(e => !isGenericEmail(e) && e.toLowerCase().includes(domain.split('.')[0])) : [];
                            const anyPersonal = googleEmails.filter(e =>
                                !isGenericEmail(e) && !e.includes('google') && !e.includes('example') &&
                                !e.match(/\.(png|jpg|css|js)$/i) && e.length < 60
                            );
                            // Also accept generic emails from the domain if no personal found
                            const genericDomainEmails = domain ? googleEmails.filter(e => isGenericEmail(e) && e.toLowerCase().includes(domain.split('.')[0])) : [];

                            if (domainEmails.length > 0) {
                                bestEmail = domainEmails[0];
                                emit({ phase: 'enrich', message: `✅ ${lead.companyName}: Google trovato ${bestEmail}`, progress: 87 + Math.round((searchedCount / companiesToSearch.length) * 8), browserUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
                            } else if (anyPersonal.length > 0) {
                                bestEmail = anyPersonal[0];
                                emit({ phase: 'enrich', message: `✅ ${lead.companyName}: Google trovato ${bestEmail} (esterno)`, progress: 87 + Math.round((searchedCount / companiesToSearch.length) * 8), browserUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
                            } else if (genericDomainEmails.length > 0 && !lead.email) {
                                bestEmail = genericDomainEmails[0];
                                emit({ phase: 'enrich', message: `📧 ${lead.companyName}: Google trovato ${bestEmail} (generica)`, progress: 87 + Math.round((searchedCount / companiesToSearch.length) * 8), browserUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}` });
                            }
                        } catch { /* Google search failed */ }

                        // STRATEGY 2: LinkedIn search via SerpApi for people names
                        // Use a single combined query to save API credits
                        if (!bestName) {
                            try {
                                const linkedinQuery = `site:linkedin.com/in "${lead.companyName}" sales OR commerciale OR manager OR direttore OR CEO Italy`;
                                const resultStr = await executeToolCall('searchGoogleWeb', {
                                    query: linkedinQuery, num: 5, gl: 'it', hl: 'it',
                                }, companyId, apiKeys as any, conversationId);
                                const parsed = JSON.parse(resultStr);
                                const results = parsed.results || [];

                                for (const r of results.slice(0, 5)) {
                                    const title = r.title || '';
                                    // Match patterns like "Nome Cognome - Ruolo" or "Nome Cognome | Ruolo" or "Nome Cognome – Ruolo"
                                    const match = title.match(/^([A-ZÀ-Ú][a-zà-ú]+)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s*[-–|]/);
                                    if (match) {
                                        bestName = `${match[1]} ${match[2]}`;
                                        // Extract LinkedIn URL from the result link
                                        if (r.link && r.link.includes('linkedin.com/in/')) {
                                            bestLinkedin = r.link;
                                        }
                                        // Extract role from after the dash
                                        const titleMatch = title.match(/[-–|]\s*(.+?)(?:\s*[-–|]|$)/);
                                        if (titleMatch) bestTitle = titleMatch[1].trim();
                                        emit({ phase: 'enrich', message: `👤 ${lead.companyName}: LinkedIn trovato ${bestName}${bestTitle ? ` (${bestTitle})` : ''}`, progress: 87 + Math.round((searchedCount / companiesToSearch.length) * 8), browserUrl: r.link });
                                        break;
                                    }
                                    // Also try: "Nome Cognome on LinkedIn" pattern (English results)
                                    const match2 = title.match(/^([A-ZÀ-Ú][a-zà-ú]+)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\s/);
                                    if (match2 && r.link?.includes('linkedin.com/in/')) {
                                        bestName = `${match2[1]} ${match2[2]}`;
                                        bestLinkedin = r.link;
                                        // Try to extract role from snippet
                                        const snippetRoleMatch = (r.snippet || '').match(/(Sales|Commercial|Area Manager|Business Development|Key Account|Export|CEO|CTO|Direttore|Responsabile|Managing Director|Founder)[^.]{0,40}/i);
                                        if (snippetRoleMatch) bestTitle = snippetRoleMatch[0].trim();
                                        emit({ phase: 'enrich', message: `👤 ${lead.companyName}: LinkedIn trovato ${bestName}${bestTitle ? ` (${bestTitle})` : ''}`, progress: 87 + Math.round((searchedCount / companiesToSearch.length) * 8), browserUrl: r.link });
                                        break;
                                    }
                                }
                            } catch { /* LinkedIn search failed */ }
                        }
                    } catch (e: any) {
                        console.warn(`[LeadGen-SerpApi] Error for ${lead.companyName}:`, e.message?.substring(0, 80));
                    }

                    // Apply findings
                    if (bestEmail) {
                        lead.email = bestEmail.toLowerCase();
                        lead.emailStatus = isGenericEmail(bestEmail) ? 'generic' : 'scraped';
                        lead._sources = lead._sources || new Set();
                        lead._sources.add('serpapi-google');
                        lead._enriched = true;
                        foundCount++;
                    }
                    if (bestName) {
                        const nameParts = bestName.split(' ');
                        lead.firstName = lead.firstName || nameParts[0] || null;
                        lead.lastName = lead.lastName || nameParts.slice(1).join(' ') || null;
                        lead.fullName = lead.fullName || bestName;
                    }
                    if (bestTitle) lead.jobTitle = lead.jobTitle || bestTitle;
                    if (bestLinkedin) lead.linkedinUrl = lead.linkedinUrl || bestLinkedin;
                    searchedCount++;
                });

                await Promise.all(searchPromises);
            }

            console.log(`[LeadGen-SerpApi] Pass 5 complete: searched ${searchedCount} companies, found contacts for ${foundCount}`);
            emit({
                phase: 'enrich',
                message: `SerpApi Google+LinkedIn completato: ${foundCount} contatti trovati su ${searchedCount} aziende.`,
                leadsFound: uniqueLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
                progress: 95,
            });
        } else if (companiesToSearch.length > 0 && !apiKeys.serpApi) {
            console.log(`[LeadGen-SerpApi] Pass 5 SKIPPED: no SerpApi key configured (${companiesToSearch.length} companies need enrichment)`);
            emit({
                phase: 'enrich',
                message: `⚠️ SerpApi non configurato: ${companiesToSearch.length} aziende senza contatto non potranno essere arricchite via Google/LinkedIn.`,
                progress: 95,
            });
        }
    }

    // FINAL: Compute confidence scores and clean up
    const finalLeads: any[] = [];
    for (const lead of uniqueLeads) {
        // Skip existing emails
        if (lead.email && existingEmails.has(lead.email.toLowerCase())) continue;

        // For fair searches: keep ALL leads with company name + domain, even without email
        // User wants ALL exhibitors saved with whatever info was found
        if (!isFairSearch) {
            if (!lead.email || isGenericEmail(lead.email)) continue;
        } else {
            // For fairs: keep everything that has at least a company name and domain/website
            // Companies without email still have value (descriptions, industry info, domain for future outreach)
            if (!lead.email && !lead.companyDomain && !lead.companyWebsite) continue;
            // At minimum need a company name
            if (!lead.companyName) continue;
        }

        // Compute confidence
        lead.confidence = scoreLeadCompleteness(lead);
        // Multi-source bonus
        if (lead._sources?.size > 1) lead.confidence = Math.min(100, lead.confidence + 5);

        // Clean internal fields
        delete lead._enriched;
        delete lead._sources;

        finalLeads.push(lead);
    }

    // Sort by confidence (highest first)
    finalLeads.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    console.log(`[LeadGen-Exec] Final: ${finalLeads.length} high-quality leads (from ${allLeads.length} raw)`);
    emit({
        phase: 'save',
        message: `${finalLeads.length} lead trovati. Salvataggio nel database...`,
        leadsFound: finalLeads.length,
        leadsWithEmail: finalLeads.filter(l => l.email && !isGenericEmail(l.email)).length,
        companiesFound: new Set(finalLeads.filter(l => l.companyName).map(l => l.companyName!.toLowerCase())).size,
        progress: 90,
    });

    // Auto-save
    if (finalLeads.length > 0) {
        console.log(`[LeadGen-Exec] Auto-saving ${finalLeads.length} leads...`);
        try {
            await executeToolCall('saveLeads', {
                searchName: plan.summary || 'Ricerca Lead',
                leads: finalLeads,
            }, companyId, apiKeys as any, conversationId);
            console.log(`[LeadGen-Exec] Saved ${finalLeads.length} leads`);
        } catch (e: any) {
            console.error('[LeadGen-Exec] Auto-save error:', e.message);
        }
    }

    return { results, allLeads: finalLeads };
}

/**
 * PHASE 3: Synthesize results into a rich response
 */
function synthesizeResults(
    plan: ExecutionPlan,
    allLeads: any[],
    results: Map<number, any>,
    userRequest: string,
    model: string,
    enrichmentStats?: { hunterEnriched: number; vibeEnriched: number; verified: number }
): string {
    // Build a compact summary of results
    const taskSummaries = plan.tasks.map(t => {
        const result = results.get(t.id);
        if (t.tool === 'getExistingLeadEmails') {
            return `- Check duplicati: ${result?.totalExisting || 0} lead gia esistenti`;
        }
        if (t.tool === 'saveLeads') {
            return `- Salvataggio: ${result?.savedCount || 0} lead salvati`;
        }
        if (result?.error) {
            return `- ${t.description}: ERRORE - ${result.error}`;
        }
        const count = result?.totalResults || result?.returned || result?.people?.length || result?.businesses?.length || result?.emails?.length || 0;
        return `- ${t.description}: ${count} risultati`;
    }).join('\n');

    // Format leads for presentation (up to 100 for fair searches, 50 otherwise)
    const displayLimit = allLeads.length > 50 ? 100 : 50;
    const leadsSummary = allLeads.slice(0, displayLimit).map((l, i) => {
        const parts = [
            `${i + 1}. **${l.fullName || 'N/A'}**`,
            l.jobTitle ? `Ruolo: ${l.jobTitle}` : null,
            l.companyName ? `Azienda: ${l.companyName}` : null,
            l.email ? `Email: ${l.email}` : null,
            l.emailStatus ? `Status: ${l.emailStatus}` : null,
            l.phone ? `Tel: ${l.phone}` : null,
            l.linkedinUrl ? `LinkedIn: si` : null,
            l.companyCity ? `Citta: ${l.companyCity}` : null,
            l.companyIndustry ? `Settore: ${l.companyIndustry}` : null,
            l.companySize ? `Dimensione: ${l.companySize}` : null,
            l.source ? `Fonte: ${l.source}` : null,
            l.confidence != null ? `Completezza: ${l.confidence}%` : null,
        ].filter(Boolean).join(' | ');
        return parts;
    }).join('\n');

    // Stats by source
    const bySource: Record<string, number> = {};
    for (const l of allLeads) {
        bySource[l.source || 'unknown'] = (bySource[l.source || 'unknown'] || 0) + 1;
    }
    const sourceStats = Object.entries(bySource).map(([k, v]) => `${k}: ${v}`).join(', ');

    // Quality stats
    const withEmail = allLeads.filter(l => l.email && !isGenericEmail(l.email)).length;
    const verified = allLeads.filter(l => l.emailStatus === 'valid').length;
    const withPhone = allLeads.filter(l => l.phone).length;
    const withLinkedin = allLeads.filter(l => l.linkedinUrl).length;
    const avgConfidence = allLeads.length > 0 ? Math.round(allLeads.reduce((s, l) => s + (l.confidence || 0), 0) / allLeads.length) : 0;

    const synthesizePrompt = `Sei LeadAI, un assistente per lead B2B. Rispondi in italiano.

RICHIESTA ORIGINALE: ${userRequest}

PIANO ESEGUITO:
${taskSummaries}

STATISTICHE QUALITA':
- Lead totali con email personale: ${withEmail}/${allLeads.length}
- Email verificate: ${verified}
- Con telefono: ${withPhone}
- Con LinkedIn: ${withLinkedin}
- Completezza media: ${avgConfidence}%
- Per fonte: ${sourceStats}

LEAD TROVATI (${allLeads.length} totali, ordinati per completezza):
${leadsSummary || 'Nessun lead trovato.'}

COMPITO: Presenta i risultati all'utente in modo chiaro e professionale.
- INIZIA OBBLIGATORIAMENTE con la sezione "📜 Diario di Bordo": riassumi a tuo modo o tramite bullet point il percorso che hai effettuato analizzando il "PIANO ESEGUITO". Racconta all'utente le tue scelte strategiche (ad esempio "Per prima cosa ho tentato una ricerca Vibe", "Poiché Vibe ha dato avviso di limite, ho preferito affidarmi ad Hunter e allo scraping del sito") in formato narrativo, logico ed esaustivo. L'utente deve capire ESATTAMENTE come hai lavorato dietro le quinte!
- DOPO il diario, fornisci il consueto riepilogo quantitativo: quanti lead trovati, fonti usate, qualita complessiva.
- Per OGNI lead mostra: nome, ruolo, azienda, email, stato email, telefono, LinkedIn, citta, settore, completezza %
- Usa formato ### per ogni lead con campi ben formattati
- AGGIUNGI una tabella riepilogativa markdown alla fine con colonne: #, Nome, Ruolo, Azienda, Email, Citta, Completezza
- Se ci sono meno di 5 lead, suggerisci come ampliare la ricerca
- I lead sono GIA' stati salvati nel database automaticamente — comunicalo
- NON generare bozze email a meno che l'utente non le abbia chieste
- Sii conciso ma completo`;

    try {
        const isOpus = model.includes('opus');
        return callClaudeCli(synthesizePrompt, model, isOpus ? 180_000 : 90_000);
    } catch (e: any) {
        console.error('[LeadGen-Synth] Error:', e.message);
        // Fallback: return raw results
        if (allLeads.length > 0) {
            let fallback = `## Risultati ricerca\n\nTrovati **${allLeads.length} lead** con email personale.\n`;
            fallback += `\n📊 **Qualita**: ${withEmail} email personali, ${verified} verificate, completezza media ${avgConfidence}%\n`;
            fallback += `📌 **Fonti**: ${sourceStats}\n\n`;
            fallback += `${taskSummaries}\n\n`;
            fallback += `${leadsSummary}\n\n`;
            fallback += `*Lead salvati automaticamente nel database.*`;
            return fallback;
        }
        return `Non sono riuscito a trovare lead per la tua richiesta. Dettaglio piano:\n${taskSummaries}`;
    }
}

/**
 * Main Claude CLI flow: Plan → Execute → Enrich → Synthesize
 */
async function leadGeneratorFlowClaude(input: LeadGeneratorInput): Promise<LeadGeneratorResult> {
    console.log('[LeadGen-Claude] ✅ ENTERED leadGeneratorFlowClaude — the correct flow with Firecrawl + Playwright');
    const apiKeys = input.leadGenApiKeys || {};
    const model = input.model || 'claude-sonnet-4-6';
    const emit = input.onProgress || (() => {});

    // Build conversation history as text for context
    const MAX_HISTORY_MESSAGES = 10;
    const truncated = input.messages.length > MAX_HISTORY_MESSAGES
        ? input.messages.slice(-MAX_HISTORY_MESSAGES)
        : input.messages;
    const conversationHistory = truncated.map(m => {
        const role = m.role === 'model' ? 'Assistant' : 'User';
        const text = m.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '';
        return `${role}: ${text}`;
    }).join('\n\n');

    // Extract last user message
    const lastUserMsg = [...input.messages].reverse().find(m => m.role !== 'model');
    const userRequest = lastUserMsg?.content?.map((c: any) => c.text).filter(Boolean).join('\n') || '';

    if (!userRequest.trim()) {
        return { text: 'Non ho ricevuto una richiesta. Cosa vuoi cercare?', cost: 0, totalTokens: 0 };
    }

    // Check if this is a simple conversational message (not a search request)
    const isSimple = userRequest.length < 50 && !userRequest.match(/cerc|trova|scraping|contatt|lead|email|aziend|dirett|responsabil|fiera|expo|sps|mecspe/i);
    if (isSimple) {
        try {
            const simplePrompt = `Sei LeadAI, un assistente per ricerche lead B2B. Rispondi in italiano in modo amichevole e conciso.\n\nConversazione:\n${conversationHistory}\n\nUtente: ${userRequest}`;
            const response = callClaudeCli(simplePrompt, model, 60_000);
            return { text: response, cost: 0, totalTokens: 0 };
        } catch (e: any) {
            return { text: `Errore: ${e.message}`, cost: 0, totalTokens: 0 };
        }
    }

    try {
        // DEBUG: Log which API keys are available
        const keyStatus = Object.entries(apiKeys).map(([k, v]) => `${k}:${v ? 'YES(' + String(v).slice(0, 4) + '...)' : 'NO'}`).join(', ');
        console.log(`[LeadGen-Claude] API Keys: ${keyStatus}`);

        // PHASE 1: PLAN
        console.log(`[LeadGen-Claude] === PHASE 1: PLAN === request: "${userRequest.slice(0, 100)}..."`);
        emit({ phase: 'plan', message: 'Analizzo la richiesta e creo il piano di ricerca...', progress: 5 });
        const plan = await generatePlan(userRequest, conversationHistory, model, apiKeys, input.companyId);
        emit({ phase: 'plan', message: `Piano creato: ${plan.summary} (${plan.tasks.length} operazioni)`, progress: 10 });

        // PHASE 2: EXECUTE + ENRICH
        console.log(`[LeadGen-Claude] === PHASE 2: EXECUTE + ENRICH === ${plan.tasks.length} tasks`);
        emit({ phase: 'execute', message: `Avvio ${plan.tasks.length} ricerche in parallelo...`, progress: 12 });
        const { results, allLeads } = await executePlan(plan, input.companyId, apiKeys, input.conversationId, input.onProgress);

        // PHASE 2.5: RE-PLAN if results are poor
        if (allLeads.length < 3 && plan.tasks.some(t => t.status === 'error')) {
            console.log(`[LeadGen-Claude] === PHASE 2.5: RE-PLAN === only ${allLeads.length} leads, retrying failed tasks`);
            const failedTools = plan.tasks.filter(t => t.status === 'error').map(t => t.tool);
            const availableTools = plan.tasks.filter(t => t.status === 'done' && !['getExistingLeadEmails', 'saveLeads'].includes(t.tool));

            // Try alternative strategies for failed tools
            const fallbackTasks: MicroTask[] = [];
            let fallbackId = 100;

            for (const failedTool of failedTools) {
                if (failedTool.includes('Apollo') && apiKeys.vibeProspect) {
                    // Apollo failed → try Vibe
                    const originalTask = plan.tasks.find(t => t.tool === failedTool);
                    if (originalTask) {
                        fallbackTasks.push({
                            id: fallbackId++, tool: 'searchProspectsVibe',
                            args: {
                                job_titles: originalTask.args.jobTitles || ['Technical Director', 'CTO', 'Engineering Manager'],
                                company_country_codes: originalTask.args.locations?.includes('Italy') ? ['IT'] : [],
                                has_email: true, limit: 25,
                            },
                            description: `Fallback Vibe per ${failedTool}`,
                        });
                    }
                }
                if (failedTool.includes('Vibe') && apiKeys.apollo) {
                    // Vibe failed → try Apollo
                    const originalTask = plan.tasks.find(t => t.tool === failedTool);
                    if (originalTask) {
                        fallbackTasks.push({
                            id: fallbackId++, tool: 'searchPeopleApollo',
                            args: {
                                jobTitles: originalTask.args.job_titles || ['Technical Director', 'CTO'],
                                locations: originalTask.args.company_country_codes?.includes('IT') ? ['Italy'] : [],
                                limit: 25,
                            },
                            description: `Fallback Apollo per ${failedTool}`,
                        });
                    }
                }
                if (failedTool.includes('Firecrawl') || failedTool.includes('scrape')) {
                    // Scraping failed → try Google Web Search + Google Maps
                    if (apiKeys.serpApi) {
                        fallbackTasks.push({
                            id: fallbackId++, tool: 'searchGoogleWeb',
                            args: { query: `${userRequest.slice(0, 80)} lista espositori`, num: 20 },
                            description: 'Fallback Google Web search per scraping fallito',
                        });
                        fallbackTasks.push({
                            id: fallbackId++, tool: 'searchGoogleMaps',
                            args: { query: userRequest.slice(0, 100) },
                            description: 'Fallback Google Maps per scraping fallito',
                        });
                    }
                }
            }

            if (fallbackTasks.length > 0) {
                emit({ phase: 'execute', message: `Risultati scarsi. Riprovo con ${fallbackTasks.length} strategie alternative...`, progress: 25 });
                const fallbackPlan: ExecutionPlan = { summary: `Re-plan: ${fallbackTasks.length} fallback tasks`, tasks: fallbackTasks };
                const fallbackResult = await executePlan(fallbackPlan, input.companyId, apiKeys, input.conversationId, input.onProgress);
                // Merge new leads into allLeads
                allLeads.push(...fallbackResult.allLeads);
                for (const [k, v] of fallbackResult.results) {
                    results.set(k, v);
                }
                console.log(`[LeadGen-Claude] Re-plan added ${fallbackResult.allLeads.length} leads (total: ${allLeads.length})`);
            }
        }

        // PHASE 3: SYNTHESIZE
        console.log(`[LeadGen-Claude] === PHASE 3: SYNTHESIZE === ${allLeads.length} leads collected`);
        emit({
            phase: 'synthesize',
            message: `Preparo il report finale con ${allLeads.length} lead...`,
            leadsFound: allLeads.length,
            progress: 95,
        });
        const text = synthesizeResults(plan, allLeads, results, userRequest, model);
        emit({ phase: 'done', message: `Completato! ${allLeads.length} lead trovati.`, leadsFound: allLeads.length, progress: 100 });

        return { text, cost: 0, totalTokens: 0 };
    } catch (e: any) {
        console.error('[LeadGen-Claude] Fatal error:', e.message);
        const stderr = e.stderr ? (typeof e.stderr === 'string' ? e.stderr : e.stderr.toString()).trim() : '';
        const detail = stderr ? `${e.message.split('\n')[0]} | ${stderr.slice(0, 200)}` : e.message.split('\n')[0];

        if (e.message.includes('ENOENT') || e.message.includes('No such file')) {
            return {
                text: `Errore: Claude CLI non trovato. Verifica che sia installato.\n\nDettaglio: ${detail}`,
                cost: 0, totalTokens: 0,
            };
        }

        return {
            text: `Errore durante la ricerca: ${detail}\n\nProva a ripetere la richiesta o switcha al provider OpenRouter.`,
            cost: 0, totalTokens: 0,
        };
    }
}
