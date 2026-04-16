# Lead Generator — Agente AI

Documento tecnico sull'**agente AI** del Lead Generator: architettura, provider, tool, skills, flusso esecutivo.

> Per UI, DB schema e replica progetto standalone → vedi [`lead-generator-architecture.md`](./lead-generator-architecture.md).

---

## 1. Architettura generale

```
┌─────────────────────────────────────────────────────────────┐
│  UI (src/app/lead-generator/page.tsx)                       │
│  - Chat, progress bar SSE, tabella lead, export CSV        │
└────────────────┬────────────────────────────────────────────┘
                 │ POST /api/lead-generator  (stream=true)
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  API Route (src/app/api/lead-generator/route.ts)            │
│  - Auth NextAuth + companyId                                │
│  - Carica/crea LeadGeneratorConversation                    │
│  - Legge leadGenApiKeys da Company                          │
│  - SSE streaming con ReadableStream                         │
└────────────────┬────────────────────────────────────────────┘
                 │ leadGeneratorFlow(input)
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Flow (src/ai/flows/lead-generator-flow.ts — 3346 righe)    │
│                                                              │
│  ┌─────────────────┐         ┌──────────────────────────┐  │
│  │ OpenRouter path │    OR   │ Claude CLI path          │  │
│  │ (tool calling)  │         │ (Bash+WebFetch via curl) │  │
│  └────────┬────────┘         └────────────┬─────────────┘  │
│           │                               │                 │
│           └───────┬───────────────────────┘                 │
│                   ▼                                         │
│         executeToolCall() dispatch                          │
└────────────────┬────────────────────────────────────────────┘
                 │
         ┌───────┴───────┐
         ▼               ▼
┌────────────────┐  ┌──────────────────────────────┐
│  API esterne   │  │  DB / Python backend         │
│ Apollo, Hunter,│  │  Prisma (Lead, LeadSearch)   │
│ SerpApi, Apify,│  │  Python Flask (scraping)     │
│ Vibe, Firecrawl│  │                              │
└────────────────┘  └──────────────────────────────┘
```

File principali:
- `src/ai/flows/lead-generator-flow.ts` — flow principale + tool dispatcher (3346 righe)
- `src/ai/flows/lead-generator-sessions.ts` — session store in-memory per Claude CLI
- `src/actions/lead-generator.ts` — server actions (CRUD leads, test API keys, email)
- `src/app/api/lead-generator/route.ts` — entry point HTTP con SSE
- `src/app/api/lead-generator/tool-call/route.ts` — endpoint interno per Claude CLI (via curl)

---

## 2. Provider AI (due modalità)

L'agente supporta **due backend AI** selezionabili dall'utente in Impostazioni → AI Provider:

### 2.1 OpenRouter (default)

- Provider HTTP multi-modello (Gemini, GPT-4o, Claude, Llama…)
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Auth: `Bearer ${apiKey}` (user-level, salvata in `User.openRouterApiKey`)
- Tool calling: formato OpenAI standard (`tools`, `tool_calls`, `tool_choice: "auto"`)
- Pre-flight check: prima round di chiamate, testa se il modello supporta tool calling; se modello risponde con testo invece che tool call → errore esplicito all'utente con lista modelli compatibili

**Modelli consigliati (supportano tool calling):**
| Modello | Costo | Note |
|---------|-------|------|
| `google/gemini-2.5-flash` | gratis | default, ottimo |
| `google/gemini-2.0-flash-001` | gratis | veloce |
| `meta-llama/llama-3.3-70b-instruct` | gratis | |
| `openai/gpt-4o-mini` | economico | |
| `openai/gpt-4o` | caro | potente |

### 2.2 Claude CLI (Anthropic diretto)

- Spawn processo `claude` (Claude Code CLI installato su server)
- Args: `-p --verbose --output-format stream-json --permission-mode bypassPermissions --allowedTools Bash,WebFetch,WebSearch --model $MODEL --effort max`
- Comunicazione: stdin (prompt+conversazione) → stdout (NDJSON stream)
- Tool calling: l'agente NON usa tool definition OpenAI-style — usa **Bash + curl** verso `/api/lead-generator/tool-call` con token di sessione
- Session token registrato in `activeSessions` Map (in-memory, persist cross-hot-reload via `globalThis._leadGenSessions`)

**Modelli Claude supportati:**
- `claude-sonnet-4-6` (default)
- `claude-opus-4-6`
- `claude-haiku-4-5`
- Alias: `sonnet`, `opus`, `haiku` (latest)

**Differenza chiave:** in Claude CLI, l'agente usa tool nativi Claude (Bash, WebFetch, WebSearch) gratis + chiama API esterne via curl. Più autonomo ma meno deterministico.

### 2.3 Selezione provider

```typescript
// src/app/api/lead-generator/route.ts
const { aiProvider, model } = body; // 'openrouter' | 'claude-cli'

// src/ai/flows/lead-generator-flow.ts:2304
export async function leadGeneratorFlow(input) {
    if (input.aiProvider === 'claude-cli') {
        return leadGeneratorFlowClaude(input);
    }
    // OpenRouter path...
}
```

Il provider è salvato per-utente in `User.aiProvider`. Può essere cambiato anche dal selector in cima alla chat Lead Generator.

---

## 3. Tool disponibili (23 tool)

Definiti in `leadGenTools` (`src/ai/flows/lead-generator-flow.ts:325`). Dispatcher in `executeToolCall()` (riga 738).

### 3.1 Ricerca contatti/aziende

| Tool | Provider | Descrizione |
|------|----------|-------------|
| `searchPeopleApollo` | Apollo.io | Contatti per ruolo/settore/localita |
| `searchCompaniesApollo` | Apollo.io | Aziende per settore/dimensione |
| `searchProspectsVibe` | Vibe Prospecting (Explorium) | Contatti con intent data |
| `searchBusinessesVibe` | Vibe Prospecting | Aziende con tecnografici |
| `searchGoogleWeb` | SerpApi | Ricerca Google Web (dorking LinkedIn, liste espositori) |
| `searchGoogleMaps` | SerpApi | Attivita locali (ristoranti, negozi). VIETATO per fiere |
| `searchGooglePlaywright` | Chromium headless | Google search **gratis** senza SerpApi |
| `runApifyActor` | Apify | Scraping avanzato (Google Places, scrapers custom) |

### 3.2 Email discovery

| Tool | Provider | Descrizione |
|------|----------|-------------|
| `findEmailsHunter` | Hunter.io | Email del dominio (filter: `personal`/`generic`) |
| `findEmailHunter` | Hunter.io | Email di persona specifica (nome+cognome+dominio) |
| `verifyEmail` | Hunter.io | Verifica deliverability email |

### 3.3 Web scraping

| Tool | Provider | Descrizione |
|------|----------|-------------|
| `scrapeWithFirecrawl` | Firecrawl | Scraping JS-heavy (markdown/HTML), `waitFor` per SPA |
| `mapWebsiteFirecrawl` | Firecrawl | Scopre URL di un sito (trova /team /about) |
| `scrapeWebsite` | Python backend | Scraping base (no JS), endpoint `/scrape-website` |
| `browsePage` | Playwright Chromium | Visita pagina con JS, estrae DOM. **Gratis** |
| `fetchWebPage` | fetch nativo | HTTP GET semplice, estrae testo+email. **Gratis** |

### 3.4 Gestione lead nel DB

| Tool | Descrizione |
|------|-------------|
| `saveLeads` | Salva batch lead + crea LeadSearch |
| `updateLead` | Aggiorna lead esistente (per arricchimento) |
| `getExistingLeadEmails` | Lista email gia salvate (deduplicazione) |
| `getLeadsToEnrich` | Lead senza email/LinkedIn/nome (per enrichment) |
| `enrichLeadsAutomatically` | **Mega-tool**: cicla tutti i lead da arricchire, visita siti, chiama Hunter, salva tutto lato server in UNA chiamata |
| `getLeadStats` | Conteggi (totali, per settore, per ricerca) |
| `exportLeads` | Esporta CSV |

### 3.5 Strategie di routing

L'agente decide autonomamente quale tool usare seguendo priorità nel system prompt:
1. Apollo (dati strutturati) → Vibe (intent data) → Hunter (email personali)
2. Scraping: `browsePage`/`fetchWebPage` (gratis) → Firecrawl (costa) solo se i primi falliscono
3. Google: `searchGooglePlaywright` (gratis, Chromium) > `searchGoogleWeb` (SerpApi, a pagamento)

---

## 4. Skills / Skills Context

**"Skills"** nel Lead Generator = **profilo aziendale utente** iniettato nel system prompt.

### 4.1 Cosa sono
Informazioni su azienda dell'utente (cosa vende, target, tono) — NON skill Claude-Code-style. Usate per:
- Personalizzare bozze email di outreach
- Filtrare lead per target ideale
- Adattare tono comunicazioni al brand

### 4.2 Come vengono iniettate

```typescript
// src/ai/flows/lead-generator-flow.ts:53
function buildSystemPrompt(companyId: string, skillsContext?: string): string {
    return `Sei LeadAI...
    ${skillsContext ? `
## PROFILO AZIENDALE DELL'UTENTE (usa queste info per personalizzare email, pitch e ricerche):
${skillsContext}
IMPORTANTE: Usa queste informazioni per:
- Scrivere email di outreach personalizzate...
- Capire il target ideale...
` : ''}
    ...`;
}
```

### 4.3 Da dove arriva `skillsContext`

Passato dall'UI nel body della request:
```typescript
// src/app/api/lead-generator/route.ts:27
const { userMessage, conversationId, model, aiProvider, stream, skillsContext } = body;
```

L'UI lo costruisce da:
- Profilo aziendale utente (dashboard Skills separata)
- Settings pagina — brand tone, pitch, prodotti/servizi

### 4.4 Claude CLI usa lo stesso pattern

```typescript
// src/ai/flows/lead-generator-flow.ts:2985
${input.skillsContext ? `\nPROFILO AZIENDALE UTENTE:\n${input.skillsContext}\n` : ''}
```

---

## 5. Flusso esecutivo (OpenRouter)

```
1. UI invia POST /api/lead-generator
   body: { userMessage, conversationId?, model, aiProvider: 'openrouter',
           stream: true, skillsContext? }

2. Route auth + carica/crea LeadGeneratorConversation

3. leadGeneratorFlow() chiamato con:
   - messages: cronologia + nuovo userMessage
   - apiKey: User.openRouterApiKey
   - leadGenApiKeys: { apollo, hunter, serpApi, apify, vibeProspect, firecrawl }
     (da Company.leadGenApiKeys JSON)

4. PRE-FLIGHT CHECK (1 round):
   Chiama OpenRouter con prompt "Chiama il tool getLeadStats."
   Se risponde senza tool_call → errore "modello non supporta tool calling"

5. LOOP PRINCIPALE (max 150 round):
   - POST openrouter.ai/api/v1/chat/completions
     { model, messages, tools: leadGenTools, tool_choice: 'auto' }
   - Risposta:
     a) choice.message.tool_calls[] → per ogni tool call:
          executeToolCall(name, args, companyId, apiKeys, conversationId, emit)
          → append tool result a messages come role='tool'
        → prossimo round
     b) choice.message.content senza tool_calls → risposta finale, exit loop

6. Per ogni round, fetch OpenRouter generation stats:
   GET /api/v1/generation?id={generationId}
   → somma accumulated_cost, accumulated_tokens

7. Progress events SSE emessi durante ogni tool:
   phase: 'plan' | 'execute' | 'scrape' | 'enrich' | 'verify' | 'save' | 'synthesize' | 'done'
   message: string, progress: 0-100, leadsFound?, leadsWithEmail?

8. Fine loop → salva conversation aggiornata in DB, ritorna { text, cost, totalTokens }
```

---

## 6. Flusso esecutivo (Claude CLI)

```
1-3. Stessi step 1-3 di OpenRouter (route, auth, flow)

4. leadGeneratorFlowClaude():
   - registerSession(input) → genera sessionToken UUID, salva in activeSessions Map
   - Costruisce CLI prompt dinamicamente, includendo curl commands per OGNI tool:

     ### findEmailsHunter — Trova tutte le email di un dominio
     curl -X POST http://localhost:9002/api/lead-generator/tool-call \
       -H "Content-Type: application/json" \
       -d '{"tool":"findEmailsHunter","args":{"domain":"festo.com"},"token":"<sessionToken>"}'

   - Solo tool con API key configurata vengono inclusi nel prompt (es. se hunter mancante, il tool non appare)

5. spawn('claude', [...cliArgs]) con stdin=conversationText

6. Claude CLI esegue autonomamente:
   - Legge system prompt con regole + curl commands
   - Usa Bash per curl verso /api/lead-generator/tool-call
   - Usa WebFetch/WebSearch nativi per scraping/ricerca

7. Endpoint tool-call:
   - Valida sessionToken contro activeSessions.get(token)
   - Verifica companyId
   - Chiama executeToolCall() con stessi parametri di OpenRouter path

8. Stream NDJSON da stdout:
   - type='assistant', content[].type='text' → accumula finalText
   - type='assistant', content[].type='tool_use' → emit progress

9. Fine processo → activeSessions.delete(token), ritorna risultato
```

---

## 7. Safety e anti-pattern

System prompt contiene regole strette per evitare derive dell'agente:

| Regola | Perche |
|--------|--------|
| Zero tolleranza email generiche | `info@`, `admin@`, `sales@` non sono lead utili |
| Salvare DOPO OGNI singola azienda | Se processo crasha, non si perde tutto |
| NO file su disco | Niente `cat > leads.csv` — tutto deve andare in DB |
| Enrichment ≠ nuova ricerca | "trova contatti per aziende esistenti" non deve allargare lo scope |
| browsePage prima, Firecrawl dopo | Costi contenuti |
| Mai aprire linkedin.com diretto | Login required, bloccato. Usa Google dorking `site:linkedin.com/in` |
| NO SearchGoogleMaps per fiere | Espositori non stanno nella citta della fiera |

---

## 8. API keys configurabili

Due livelli:

### 8.1 User-level (OpenRouter)
- `User.openRouterApiKey` — chiave per il modello LLM
- `User.openRouterModel` — modello default

### 8.2 Company-level (Lead gen data sources)
`Company.leadGenApiKeys` (JSON field):
```json
{
  "apollo": "...",
  "hunter": "...",
  "serpApi": "...",
  "apify": "...",
  "vibeProspect": "...",
  "firecrawl": "...",
  "groq": "..."
}
```

Test endpoint per ogni provider: `testApolloApiKeyAction`, `testHunterApiKeyAction`, etc. (in `src/actions/lead-generator.ts`).

Se una chiave manca, il tool corrispondente ritorna `{ error: "API key X non configurata..." }` e l'agente passa ad altra strategia.

---

## 9. Progress events (SSE)

```typescript
export interface ProgressEvent {
    phase: 'plan' | 'execute' | 'scrape' | 'knowledge' | 'domain'
         | 'enrich' | 'verify' | 'save' | 'synthesize' | 'done';
    message: string;
    detail?: string;
    companiesFound?: number;
    leadsFound?: number;
    leadsWithEmail?: number;
    progress?: number;     // 0-100
    browserUrl?: string;           // per browsePage/searchGooglePlaywright
    browserScreenshot?: string;    // base64 JPEG
}
```

Emessi da `executeToolCall()` via callback `emit`. UI li riceve su SSE `event: progress` e aggiorna:
- Progress bar principale
- Contatori companies/leads/emails
- Live browser view (URL + screenshot) durante scraping

---

## 10. Security (audit 2026-04-14)

Issues aperti (vedi [`security-audit-2026-04-14.md`](../.claude/projects/-Users-manuelezanoni-Desktop-VisualStudio-FridAI/memory/security-audit-2026-04-14.md)):

| ID | Issue | Status |
|----|-------|--------|
| H-05 | Lead PII unencrypted in DB (nome, email, telefono, LinkedIn) | ⏳ Deferred |
| M-03 | Connector creds plaintext JSON | ⏳ Deferred (encryption layer) |
| C-04 | API keys OpenRouter sent to client | ⏳ Deferred (refactor needed) |

Fix applicati:
- Tenant isolation su tutte le action (filtro `companyId` su ogni query)
- TLS enforcement su SMTP usato in `sendLeadEmailAction`
- Rate limiting su API esterne (gestito dai provider stessi)

---

## 11. Quick reference

**Start del flow:**
```
POST /api/lead-generator
Cookie: next-auth.session-token=...
Content-Type: application/json

{
  "userMessage": "trovami 20 CTO nel settore automazione in Italia",
  "conversationId": "optional-existing-id",
  "model": "google/gemini-2.5-flash",
  "aiProvider": "openrouter",
  "stream": true,
  "skillsContext": "Azienda: Acme Srl\nSettore: Industrial IoT\n..."
}
```

**Response (SSE):**
```
event: conversationId
data: {"conversationId":"clxxx..."}

event: progress
data: {"phase":"plan","message":"✅ gemini-2.5-flash supporta tool calling...","progress":5}

event: progress
data: {"phase":"execute","message":"Cerca su Apollo...","leadsFound":15}

event: done
data: {"text":"...","cost":0.0023,"totalTokens":12450}
```

**Switch provider:**
- UI: selector "OR / CLI" in cima alla chat
- API: cambia `aiProvider` nel body
- Persistenza: `User.aiProvider` nel DB
