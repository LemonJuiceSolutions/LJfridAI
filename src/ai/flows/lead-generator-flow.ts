'use server';

import { db } from '@/lib/db';

// ===================== TYPES =====================

export interface LeadGeneratorInput {
    messages: any[]; // Genkit message format: { role, content: [{ text }] }
    companyId: string;
    model?: string;
    apiKey?: string;
    leadGenApiKeys?: { apollo?: string; hunter?: string; serpApi?: string; apify?: string };
    conversationId?: string;
}

// ===================== SYSTEM PROMPT =====================

function buildSystemPrompt(companyId: string): string {
    return `Sei LeadAI, un assistente esperto nella ricerca di contatti commerciali e lead B2B. Aiuti a trovare aziende e persone di contatto in settori specifici.

DATA DI OGGI: ${new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Company ID: ${companyId}

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
- Strategia default: Apollo (dati strutturati) -> scrapeWebsite (contatti dal sito) -> Hunter (email personali) -> Google Maps (attivita' locali) -> Apify (scraping avanzato)
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
   - Usa scrapeWebsite per estrarre info dettagliate dai siti web (pagine Contact, About, Team, Chi siamo)
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
                    jobTitles: { type: 'array', items: { type: 'string' }, description: 'Ruoli/titoli da cercare (es: "Marketing Manager", "CEO")' },
                    industries: { type: 'array', items: { type: 'string' }, description: 'Settori/industrie' },
                    locations: { type: 'array', items: { type: 'string' }, description: 'Citta\' o paesi' },
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
                    industries: { type: 'array', items: { type: 'string' }, description: 'Settori/industrie' },
                    locations: { type: 'array', items: { type: 'string' }, description: 'Citta\'/paesi' },
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
            description: 'Cerca attivita\' su Google Maps in una zona specifica. Ottimo per attivita\' locali.',
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
];

// ===================== TOOL DISPATCHER =====================

async function executeToolCall(
    name: string,
    args: any,
    companyId: string,
    apiKeys: { apollo?: string; hunter?: string; serpApi?: string; apify?: string },
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
                // Filter out leads with generic or missing emails before saving
                const genericEmailPrefixes = ['info@', 'admin@', 'support@', 'contatti@', 'hello@', 'office@', 'sales@', 'marketing@', 'noreply@', 'contact@', 'segreteria@', 'amministrazione@', 'ordini@', 'orders@', 'customer@', 'service@', 'webstore@', 'reception@', 'direzione@', 'commerciale@', 'hr@', 'jobs@', 'careers@', 'press@', 'media@', 'billing@', 'accounting@', 'general@', 'team@', 'help@'];
                const leadsArray = rawLeads.filter((l: any) => {
                    if (!l.email) return false;
                    const emailLower = l.email.toLowerCase();
                    return !genericEmailPrefixes.some((prefix: string) => emailLower.startsWith(prefix));
                });
                if (leadsArray.length < rawLeads.length) {
                    console.log(`[saveLeads] Filtered out ${rawLeads.length - leadsArray.length} leads with generic/missing emails (kept ${leadsArray.length})`);
                }
                console.log(`[saveLeads] Saving ${leadsArray.length} leads for company ${companyId}`);

                // Create the search record
                const search = await db.leadSearch.create({
                    data: {
                        name: args.searchName || 'Ricerca Lead',
                        criteria: args.criteria || {},
                        status: 'completed',
                        resultCount: leadsArray.length,
                        companyId,
                        ...(conversationId ? { conversationId } : {}),
                    },
                });
                console.log(`[saveLeads] Created search ${search.id}`);

                // Create lead records
                const leadsData = leadsArray.map((l: any) => ({
                    firstName: l.firstName || null,
                    lastName: l.lastName || null,
                    fullName: l.fullName || `${l.firstName || ''} ${l.lastName || ''}`.trim() || null,
                    jobTitle: l.jobTitle || null,
                    email: l.email || null,
                    phone: l.phone || null,
                    linkedinUrl: l.linkedinUrl || null,
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
                    confidence: l.confidence != null ? (parseFloat(l.confidence) > 1 ? parseFloat(l.confidence) / 100 : parseFloat(l.confidence)) : null,
                    emailStatus: l.emailStatus || null,
                    searchId: search.id,
                    companyId,
                }));

                if (leadsData.length > 0) {
                    const result = await db.lead.createMany({ data: leadsData });
                    console.log(`[saveLeads] Created ${result.count} leads in DB`);
                }

                return JSON.stringify({
                    success: true,
                    searchId: search.id,
                    savedCount: leadsData.length,
                    message: `Salvati ${leadsData.length} lead con successo nella ricerca "${args.searchName}".`,
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
    if (!input.apiKey) {
        throw new Error('API key OpenRouter mancante. Configura la chiave nelle Impostazioni.');
    }

    const apiKeys = input.leadGenApiKeys || {};

    const systemMessage = {
        role: 'system' as const,
        content: [{ text: buildSystemPrompt(input.companyId) }],
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

    const MAX_TOOL_ROUNDS = 30;
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
                    if (fnName === 'searchPeopleApollo' || fnName === 'findEmailsHunter' || fnName === 'searchGoogleMaps' || fnName === 'searchCompaniesApollo') {
                        try {
                            const parsed = JSON.parse(result);
                            if (!parsed.error) {
                                const people = parsed.people || parsed.emails || parsed.results || parsed.organizations || [];
                                for (const p of people) {
                                    if (p.email || p.companyName || p.fullName || p.companyWebsite) {
                                        collectedLeads.push({
                                            firstName: p.firstName || p.first_name || null,
                                            lastName: p.lastName || p.last_name || null,
                                            fullName: p.fullName || p.name || `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() || null,
                                            jobTitle: p.jobTitle || p.position || p.title || null,
                                            email: p.email || p.value || null,
                                            phone: p.phone || null,
                                            linkedinUrl: p.linkedinUrl || p.linkedin_url || p.linkedin || null,
                                            companyName: p.companyName || p.organization || null,
                                            companyDomain: p.companyDomain || null,
                                            companyWebsite: p.companyWebsite || p.website || null,
                                            companySize: p.companySize || null,
                                            companyIndustry: p.companyIndustry || p.type || null,
                                            companyCity: p.companyCity || null,
                                            companyCountry: p.companyCountry || null,
                                            source: fnName === 'searchPeopleApollo' || fnName === 'searchCompaniesApollo' ? 'apollo'
                                                : fnName === 'findEmailsHunter' ? 'hunter'
                                                : fnName === 'searchGoogleMaps' ? 'google_maps'
                                                : 'manual',
                                            confidence: p.confidence != null ? (parseFloat(p.confidence) > 1 ? parseFloat(p.confidence) / 100 : parseFloat(p.confidence)) : null,
                                            emailStatus: p.emailStatus || p.email_status || null,
                                            notes: p.notes || p.description || null,
                                        });
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
                console.warn(`[LeadGen] WARNING: Model did NOT call saveLeads! Auto-saving ${collectedLeads.length} leads as fallback. The system prompt instructs the model to always call saveLeads.`);
                try {
                    // Strictly filter out leads with generic emails or no email at all
                    const genericPrefixes = ['info@', 'admin@', 'support@', 'contatti@', 'hello@', 'office@', 'sales@', 'marketing@', 'noreply@', 'contact@', 'segreteria@', 'amministrazione@', 'ordini@', 'orders@', 'customer@', 'service@', 'webstore@', 'reception@', 'direzione@', 'commerciale@', 'hr@', 'jobs@', 'careers@', 'press@', 'media@', 'billing@', 'accounting@', 'general@', 'team@', 'help@'];
                    const filteredLeads = collectedLeads.filter(l => {
                        if (!l.email) return false; // SKIP leads without email entirely
                        const emailLower = l.email.toLowerCase();
                        return !genericPrefixes.some(prefix => emailLower.startsWith(prefix));
                    });
                    if (filteredLeads.length < collectedLeads.length) {
                        console.log(`[LeadGen] Filtered out ${collectedLeads.length - filteredLeads.length} leads with generic/missing emails`);
                    }

                    // Deduplicate by email
                    const seen = new Set<string>();
                    const uniqueLeads = filteredLeads.filter(l => {
                        if (!l.email) return true;
                        const key = l.email.toLowerCase();
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
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
