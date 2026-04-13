# Lead Generator — Architettura e Design UI

Documento di riferimento per replicare il modulo Lead Generator in un nuovo progetto standalone.

---

## 1. Panoramica

Il Lead Generator è un sistema B2B di ricerca contatti commerciali guidato da AI. L'utente descrive in linguaggio naturale i contatti che cerca (es. "marketing manager nel settore moda a Milano") e un agente AI orchestra chiamate a più API esterne (Apollo.io, Hunter.io, SerpApi, Apify, Vibe Prospecting, Firecrawl) per trovare, arricchire e salvare i lead nel database.

**Funzionalità principali:**
- Chat AI con streaming SSE e progress bar in tempo reale
- Ricerca multi-fonte con aggregazione automatica dei risultati
- Salvataggio lead raggruppati per azienda con contatti multipli
- KPI dashboard con filtri interattivi
- Tabella lead con sorting, filtri per colonna, selezione multipla
- Dettaglio lead con rating, tags, note, dati finanziari
- Composizione email con generazione AI
- Export CSV/Excel
- Profilo aziendale (Skills) per personalizzare outreach
- Gestione conversazioni con cronologia e costi AI

---

## 2. Stack Tecnologico

| Layer | Tecnologia |
|-------|-----------|
| Frontend | Next.js 15 App Router, React 18, TypeScript |
| UI Components | shadcn/ui (Radix primitives), Tailwind CSS, Lucide icons |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js v4, JWT con multi-tenancy (`companyId`) |
| AI | OpenRouter (multi-modello) + Claude CLI (Anthropic diretto) |
| API esterne | Apollo.io, Hunter.io, SerpApi, Apify, Vibe Prospecting, Firecrawl |
| Backend Python | Flask (solo per export Excel e scraping avanzato) |

---

## 3. Schema Database (Prisma)

### 3.1 Lead

```prisma
model Lead {
  id              String      @id @default(cuid())
  // Contatto principale (backward compatible)
  firstName       String?
  lastName        String?
  fullName        String?
  jobTitle        String?
  email           String?
  emailStatus     String?     // "valid", "invalid", "unknown"
  phone           String?
  linkedinUrl     String?
  // Tutti i contatti dell'azienda (JSON array)
  contacts        Json?       // [{fullName, firstName, lastName, jobTitle, email, emailStatus, phone, linkedinUrl}]
  // Info azienda
  companyName     String?
  companyDomain   String?
  companyWebsite  String?
  companySize     String?     // es. "50-200"
  companyIndustry String?
  companyCity     String?
  companyCountry  String?
  companyLinkedin String?
  // Metadata
  source          String?     // "apollo", "hunter", "google_maps", "vibe", "firecrawl"
  confidence      Float?      // 0.0 - 1.0
  rawData         Json?       // Dati grezzi dall'API originale
  notes           String?
  rating          Int?        // 1-5 stelle
  tags            String[]    @default([])
  // Dati finanziari (ultimi 3 anni)
  revenueYear1    String?
  revenueYear2    String?
  revenueYear3    String?
  profitYear1     String?
  profitYear2     String?
  profitYear3     String?
  // Relazioni
  searchId        String?
  companyId       String
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  search          LeadSearch? @relation(fields: [searchId], references: [id], onDelete: SetNull)
  company         Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([searchId])
  @@index([email])
  @@index([companyName])
}
```

### 3.2 LeadSearch

Raggruppa i lead di una singola sessione di ricerca.

```prisma
model LeadSearch {
  id              String                      @id @default(cuid())
  name            String                      // Titolo auto-generato dal messaggio utente
  criteria        Json                        // Criteri di ricerca originali
  status          String                      @default("pending") // "pending" | "completed" | "failed"
  resultCount     Int                         @default(0)
  companyId       String
  conversationId  String?
  createdAt       DateTime                    @default(now())
  updatedAt       DateTime                    @updatedAt
  company         Company                     @relation(...)
  conversation    LeadGeneratorConversation?   @relation(...)
  leads           Lead[]

  @@index([companyId])
  @@index([status])
  @@index([conversationId])
}
```

### 3.3 LeadGeneratorConversation

Storico chat con tracking costi.

```prisma
model LeadGeneratorConversation {
  id           String       @id @default(cuid())
  title        String?
  messages     Json         // Array di {role: "user"|"model", content: [{text: "..."}]}
  totalCost    Float        @default(0)  // Costo cumulativo in USD
  totalTokens  Int          @default(0)
  model        String?      // ID modello usato (es. "claude-sonnet-4-6")
  companyId    String
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
  company      Company      @relation(...)
  leadSearches LeadSearch[]

  @@index([companyId])
}
```

### 3.4 Company (campi aggiuntivi per lead gen)

```prisma
// Aggiungere al model Company esistente:
leadGenApiKeys  Json?    // {apollo?, hunter?, serpApi?, apify?, vibeProspect?, firecrawl?}
```

### Relazioni

```
Company 1──N LeadGeneratorConversation
Company 1──N LeadSearch
Company 1──N Lead
LeadGeneratorConversation 1──N LeadSearch
LeadSearch 1──N Lead
```

---

## 4. Architettura Backend

### 4.1 File Structure

```
src/
├── actions/
│   └── lead-generator.ts          # Server Actions (API keys, CRUD lead/search)
├── ai/
│   └── flows/
│       ├── lead-generator-flow.ts      # Core: system prompt + tool definitions + executeToolCall
│       └── lead-generator-sessions.ts  # In-memory session store (token-based auth per CLI)
├── app/
│   ├── lead-generator/
│   │   └── page.tsx               # UI monolitica (~2500 righe)
│   └── api/
│       └── lead-generator/
│           ├── route.ts           # POST (chat), GET (load conv), DELETE, PATCH (rename)
│           ├── leads/route.ts     # GET (list+filter), PATCH (update), DELETE (bulk)
│           ├── export/route.ts    # GET (CSV/Excel export)
│           └── tool-call/route.ts # POST (internal, per CLI agent)
```

### 4.2 Flusso Dati Principale

```
┌─────────────┐     POST /api/lead-generator     ┌──────────────────┐
│  UI (Chat)   │ ──────────────────────────────► │  route.ts        │
│  userMessage │     { userMessage, model,       │  - Auth check    │
│              │       aiProvider, stream:true }  │  - Load/create   │
└─────────────┘                                   │    conversation  │
                                                   │  - Build msgs    │
                                                   └────────┬─────────┘
                                                            │
                                                            ▼
                                                   ┌──────────────────┐
                                                   │ leadGeneratorFlow│
                                                   │  - System prompt │
                                                   │  - Tool defs     │
                                                   │  - LLM call      │
                                                   └────────┬─────────┘
                                                            │
                                              Tool calls ◄──┘
                                                   │
                         ┌─────────────────────────┼─────────────────────────┐
                         ▼                         ▼                         ▼
                  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
                  │  Apollo.io   │         │  Hunter.io   │         │  SerpApi     │
                  │  - People    │         │  - Emails    │         │  - Maps      │
                  │  - Companies │         │  - Verify    │         │  - Web       │
                  └──────────────┘         └──────────────┘         └──────────────┘
                         │                         │                         │
                         └─────────────────────────┼─────────────────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │  saveLeads tool  │
                                          │  - Group by co.  │
                                          │  - Filter generic│
                                          │  - Confidence    │
                                          │  - Create/Update │
                                          │    LeadSearch    │
                                          └────────┬─────────┘
                                                   │
                              SSE stream ◄─────────┘
                              (progress events)
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │  UI updates      │
                                          │  - Progress bar  │
                                          │  - Lead table    │
                                          │  - KPI refresh   │
                                          └──────────────────┘
```

### 4.3 SSE Streaming Protocol

Il backend invia eventi SSE durante l'esecuzione:

```
event: conversationId
data: {"conversationId": "clxyz..."}

event: progress
data: {"phase": "execute", "message": "Cerco su Apollo.io...", "progress": 30, "companiesFound": 5}

event: progress
data: {"phase": "enrich", "message": "Arricchisco lead con Hunter...", "progress": 60, "leadsFound": 12}

event: result
data: {"message": "Ho trovato 12 lead...", "conversationId": "...", "totalCost": 0.023, "totalTokens": 4500}
```

**Fasi di progresso (`ProgressPhase`):**
| Phase | Descrizione |
|-------|-------------|
| `plan` | L'AI genera il piano di esecuzione |
| `execute` | Esecuzione ricerche API |
| `scrape` | Scraping di siti web |
| `knowledge` | Generazione aziende da conoscenza AI |
| `domain` | Scoperta domini aziendali |
| `enrich` | Arricchimento lead (Hunter, Vibe, Apollo) |
| `verify` | Verifica email |
| `save` | Salvataggio nel database |
| `synthesize` | Generazione risposta finale |
| `done` | Completato |

### 4.4 Tool Definitions (AI Agent)

L'agente AI ha accesso a ~15 tool function-calling:

| Tool | API | Descrizione |
|------|-----|-------------|
| `searchPeopleApollo` | Apollo.io | Cerca persone per ruolo, settore, località, dimensione azienda |
| `searchCompaniesApollo` | Apollo.io | Cerca organizzazioni |
| `findEmailsHunter` | Hunter.io | Trova tutte le email di un dominio |
| `verifyEmail` | Hunter.io | Verifica validità email |
| `findEmailHunter` | Hunter.io | Trova email specifica (nome + dominio) |
| `searchGoogleMaps` | SerpApi | Cerca su Google Maps (locale) |
| `searchGoogleWeb` | SerpApi | Ricerca web Google |
| `runApifyActor` | Apify | Esegui actor di scraping |
| `scrapeWebsite` | Python backend | Scraping base di un URL |
| `searchProspectsVibe` | Vibe/Explorium | Cerca prospect con intent signals |
| `searchBusinessesVibe` | Vibe/Explorium | Cerca aziende |
| `scrapeWithFirecrawl` | Firecrawl | Scraping avanzato con JS rendering |
| `mapWebsiteFirecrawl` | Firecrawl | Mappa tutti gli URL di un sito |
| `saveLeads` | DB interno | Salva lead nel database (raggruppa per azienda) |
| `getLeadSearches` | DB interno | Recupera storico ricerche |

### 4.5 Server Actions (`src/actions/lead-generator.ts`)

| Action | Scopo |
|--------|-------|
| `saveLeadGenApiKeysAction` | Salva API keys criptate per company |
| `getLeadGenApiKeysAction` | Recupera API keys |
| `testApolloApiKeyAction` | Testa connessione Apollo |
| `testHunterApiKeyAction` | Testa connessione Hunter |
| `testGroqApiKeyAction` | Testa connessione Groq |
| `testVibeProspectApiKeyAction` | Testa connessione Vibe |
| `testFirecrawlApiKeyAction` | Testa connessione Firecrawl |
| `getLeadSearchesAction` | Lista ricerche con stats aggregate |
| `getLeadsAction` | Lista lead con paginazione |
| `deleteLeadAction` | Elimina lead singolo |
| `deleteLeadSearchAction` | Elimina ricerca + lead associati |
| `sendLeadEmailAction` | Invia email tramite SMTP/provider |
| `generateLeadEmailAction` | Genera email con AI |
| `getLeadGenApiCreditsAction` | Crediti residui per ogni API |

---

## 5. Design UI

### 5.1 Layout Generale

L'interfaccia ha **due modalità** principali:

#### Dashboard Mode (`viewMode === 'dashboard'`)

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo + Provider toggle + Model selector        │
│          + API provider badges (con crediti residui)     │
│          + Bottone "Nuova ricerca"                      │
├─────────────────────────────────────────────────────────┤
│  Costi AI: barra riassuntiva per modello                │
├─────────────────────────────────────────────────────────┤
│  Grid di Card (responsive: 1-4 colonne)                 │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐             │
│  │ + Nuova   │ │ Ricerca 1 │ │ Ricerca 2 │ ...         │
│  │  ricerca  │ │ 45 lead   │ │ 12 lead   │             │
│  │ (dashed)  │ │ 30 email  │ │ 8 email   │             │
│  └───────────┘ └───────────┘ └───────────┘             │
└─────────────────────────────────────────────────────────┘
```

#### Detail Mode (`viewMode === 'detail'`)

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: ← Back | Titolo (editable) | Copy chat | Provider/Model│
├──────────────────────────────────────────────────────────────────┤
│  Tabs: [Chat] [Lead (N)] [Export] [Skills]                       │
├────────────────────────────┬─────────────────────────────────────┤
│                            │                                     │
│  CHAT PANEL                │  LEADS PANEL                        │
│  (se tab = chat)           │  (sempre visibile a destra)         │
│                            │                                     │
│  ┌────────────────────┐   │  ┌─────────────────────────────┐   │
│  │ History sidebar    │   │  │ KPI Cards (cliccabili)      │   │
│  │ (conversazioni)    │   │  │ [Lead] [Aziende] [Email]    │   │
│  │                    │   │  │ [Tel] [LinkedIn] [Conf%]    │   │
│  ├────────────────────┤   │  ├─────────────────────────────┤   │
│  │ Messages           │   │  │ Search bar + Export buttons │   │
│  │ (markdown rich)    │   │  ├─────────────────────────────┤   │
│  │                    │   │  │ Table (sortable, filterable)│   │
│  │ Progress bar       │   │  │ □ Azienda | Contatto | ...  │   │
│  │ (durante ricerca)  │   │  │ □ row 1                     │   │
│  │                    │   │  │ □ row 2                     │   │
│  ├────────────────────┤   │  │ ...                         │   │
│  │ Input + Send       │   │  │ Bulk actions bar            │   │
│  └────────────────────┘   │  └─────────────────────────────┘   │
│                            │                                     │
└────────────────────────────┴─────────────────────────────────────┘
```

### 5.2 Componenti shadcn/ui Utilizzati

| Componente | Uso |
|------------|-----|
| `Button` | Azioni, submit, export, delete |
| `Input` | Ricerca, tag input, titolo |
| `Card` / `CardHeader` / `CardContent` | Dashboard cards, KPI cards |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | Navigazione Chat/Lead/Export/Skills |
| `Dialog` / `DialogContent` / `DialogHeader` | Dettaglio lead |
| `AlertDialog` | Conferme eliminazione |
| `Badge` | Tags, status, industry, provider |
| `ScrollArea` | Chat messages, lead list |
| `Popover` / `PopoverContent` | Model selector, source info |
| `Command` / `CommandInput` / `CommandList` / `CommandItem` | Ricerca modelli (combobox) |
| `DropdownMenu` | Azioni contestuali (3-dot menu) |
| `Avatar` / `AvatarFallback` | Icone messaggi chat |
| `useToast` | Notifiche successo/errore |

### 5.3 Icone Lucide Utilizzate

```tsx
import {
  Send, Bot, Loader2, Trash2, UserSearch, Download, Search,
  Users, Building2, Mail, Phone, Linkedin, Globe, FileSpreadsheet,
  ChevronRight, ChevronLeft, RefreshCw, ChevronsUpDown, Check,
  ArrowUpDown, ArrowUp, ArrowDown, Plus, MessageSquare, Clock,
  MoreHorizontal, Star, X, Tag, PenLine, ExternalLink, ShieldCheck,
  Info, CheckCircle2, Target, AtSign, TrendingUp, BarChart3,
  ArrowLeft, FolderOpen, Copy, Pencil, Save, Sparkles, Upload,
} from 'lucide-react';
```

### 5.4 Dashboard Card Design

Ogni card mostra:
- **Titolo** della conversazione (troncato)
- **Data** relativa ("Oggi", "Ieri", "3g fa")
- **Modello AI** usato (badge viola)
- **Costo** in EUR (font mono verde)
- **Stats**: N lead, N con email, N aziende (icone colorate)
- **3-dot menu**: rinomina, elimina
- Hover: `shadow-md` + border emerald

### 5.5 KPI Dashboard

6-8 card cliccabili che funzionano come filtri:

| KPI | Icona | Colore | Filtro |
|-----|-------|--------|--------|
| Totale Lead | `Users` | blue | tutti |
| Aziende Uniche | `Building2` | purple | - |
| Con Contatto Nominativo | `UserSearch` | teal | `with-contact` |
| Email Personali | `AtSign` | green | `email-personal` |
| Email Generiche | `Mail` | amber | `email-generic` |
| Con Telefono | `Phone` | emerald | `phone` |
| Con LinkedIn | `Linkedin` | blue | `linkedin` |
| Affidabilità Media | `ShieldCheck` | - | - |

Ogni card mostra un **dot rosso "new"** se il valore è cresciuto rispetto al baseline pre-ricerca.

### 5.6 Tabella Lead

**Colonne:**
| Colonna | Sortable | Filterable | Contenuto |
|---------|----------|------------|-----------|
| □ (checkbox) | No | No | Selezione multipla |
| Azienda | Sì | Sì | `companyName` + website link |
| Contatto | Sì | Sì | Nome da `contacts[0]` o fallback `fullName` |
| Ruolo | Sì | Sì | `jobTitle` |
| Email | Sì | Sì | Con badge "Verificato" se `emailStatus === 'valid'` |
| Telefono | Sì | Sì | Link `tel:` |
| Città | Sì | Sì | `companyCity` |
| Settore | Sì | Sì | `companyIndustry` |
| Affid. | Sì | No | Barra 5 segmenti colorata |

**Raggruppamento**: lead con stesso `companyName` vengono raggruppati in un'unica riga con contatti multipli (stile `↳`).

**Bulk actions bar** (appare quando ci sono selezioni):
- "N selezionati" + Deselect + Delete selected + Delete all

### 5.7 Lead Detail Dialog

Dialog modale (`max-w-lg, max-h-[85vh]`) con sezioni:

1. **Header**: Nome azienda + badge industry + badge contatti
2. **Company info**: Website link, città, paese, dimensione, fonte/affidabilità
3. **Source/Confidence panel** (espandibile): barra 5 segmenti, percentuale, data aggiornamento, descrizione fonte
4. **Contatti**: Card per ogni contatto con nome, ruolo, email (link mailto), telefono (link tel), LinkedIn (link esterno), badge "Verificato"
5. **Dati Finanziari**: Tabella fatturato/utile ultimi 3 anni
6. **Rating**: 5 stelle cliccabili (salvataggio immediato)
7. **Tags**: Badge rimuovibili + input per aggiungere
8. **Note**: Textarea con auto-save (debounce 800ms)
9. **Email compose**: 
   - Bottone "Prepara mail (AI)" → genera con `generateLeadEmailAction`
   - Editor: destinatario, oggetto, corpo
   - Azioni: Rigenera, Apri in client (mailto), Invia mail
10. **Delete**: Bottone rosso in fondo

### 5.8 Chat Interface

- **Sidebar sinistra** (collapsible): lista conversazioni con titolo, data, costo, lead count
- **Area messaggi**: markdown rendering custom con supporto per:
  - Headers (h1-h4)
  - Bold, italic, inline code
  - Link cliccabili
  - Liste puntate e numerate
  - Tabelle markdown → `<table>` HTML styled
  - Code blocks con syntax highlight header
  - Horizontal rules
- **Progress overlay** (durante ricerca):
  - Fase corrente (badge colorato)
  - Messaggio di stato
  - Barra percentuale animata
  - Stats in tempo reale (aziende trovate, lead, email)
  - Log attività scrollabile
  - Screenshot browser (se usa Firecrawl/scraping)
- **Input area**: Textarea auto-resize + bottone Send + indicatore modello attivo

### 5.9 Tab Skills (Profilo Aziendale)

Form con campi:
- Nome azienda, Tagline, Settore, Sede, Anno fondazione, Dimensione team
- Sito web, Descrizione, Prodotti/Servizi
- Clienti target, Proposta di valore unica, Tono comunicazione

Salvato in `localStorage` (key: `leadgen-skills`). Può essere esportato/importato come JSON.
Viene passato al system prompt dell'AI per personalizzare email e ricerche.

### 5.10 Model Selector

Popover con Command (combobox searchable):
- Toggle provider: `Claude CLI` ↔ `OpenRouter`
- Se Claude: lista modelli hardcoded (Sonnet 4.6, Opus 4.6, Haiku 4.5)
- Se OpenRouter: lista dinamica da API con prezzo input/output per 1M token
- Badge modello free evidenziato in verde

### 5.11 Provider Badges (Header)

Per ogni API configurata, mostra:
- Dot colorato (verde/amber/rosso in base a % utilizzo)
- Nome provider
- Crediti rimanenti (font mono)
- Tooltip con dettaglio

---

## 6. Stile e Theme

- **Colore primario**: Emerald/Teal gradient (`from-emerald-500 to-teal-600`)
- **Font sizes**: UI molto compatta, prevalentemente `text-xs` (12px) e `text-[10px]`/`text-[11px]`
- **Spacing**: Compatto, `gap-1` a `gap-3`, `p-2` a `p-4`
- **Dark mode**: Supportato via Tailwind `dark:` variants
- **Borders**: `rounded-md` e `rounded-lg`, `border` con `bg-muted/20` per sezioni
- **Animations**: `animate-spin` (loader), `animate-pulse` (dot status), `hover:scale-110` (stelle)
- **Costo in EUR**: Sempre font mono verde (`text-emerald-700 dark:text-emerald-400`)

---

## 7. API Routes Reference

### POST `/api/lead-generator`
Chat con l'agente AI. Supporta SSE streaming.

**Request:**
```json
{
  "userMessage": "Cerca marketing manager a Milano",
  "conversationId": "optional-existing-id",
  "model": "claude-sonnet-4-6",
  "aiProvider": "claude-cli",
  "stream": true,
  "skillsContext": "Azienda: Acme\nSettore: Tech"
}
```

**Response (SSE):** vedi sezione 4.3

### GET `/api/lead-generator?action=list`
Lista conversazioni. Returns `{ success, conversations: ConversationMeta[] }`.

### GET `/api/lead-generator?id=xxx`
Carica conversazione specifica con messaggi.

### DELETE `/api/lead-generator?id=xxx`
Elimina conversazione.

### PATCH `/api/lead-generator`
Rinomina conversazione: `{ id, title }`.

### GET `/api/lead-generator/leads`
**Query params:** `searchId`, `conversationId`, `search` (text filter), `limit`
Returns `{ leads: Lead[] }`.

### PATCH `/api/lead-generator/leads`
Update lead: `{ id, notes?, rating?, tags? }`.

### DELETE `/api/lead-generator/leads`
Bulk delete: `{ leadIds: string[] }` oppure `{ deleteAll: true, searchId? }`.

### GET `/api/lead-generator/export?format=csv|excel&searchId=xxx`
Export lead come file scaricabile.

---

## 8. Pattern Chiave da Replicare

### 8.1 Multi-tenancy
Ogni query DB filtra per `companyId` dalla sessione NextAuth. Mai esporre dati cross-tenant.

### 8.2 Raggruppamento Contatti per Azienda
Il tool `saveLeads` raggruppa automaticamente i contatti per `companyDomain`/`companyName`, creando un record Lead per azienda con campo `contacts` JSON array. La UI poi ri-raggruppa in `groupedTableLeads` per gestire lead multipli con stesso nome azienda.

### 8.3 Confidence Score
Calcolato automaticamente in base a completezza dati:
- Ha email? +0.3
- Ha telefono? +0.2
- Ha nome completo? +0.2
- Ha LinkedIn? +0.15
- Ha website? +0.15

### 8.4 SSE con Abort
Il frontend usa `AbortController` per cancellare richieste di lead in-flight quando l'utente cambia ricerca. Il polling lead ogni 15s durante la ricerca viene fermato nel `finally`.

### 8.5 Auto-save con Debounce
Note e rating nel detail dialog si salvano automaticamente con debounce 800ms tramite `setTimeout` + `clearTimeout`.

### 8.6 KPI Baseline per Delta
Prima di ogni ricerca, si salva uno snapshot dei KPI attuali in `kpiBaseline`. Dopo la ricerca, le card KPI mostrano un dot rosso se il valore è aumentato rispetto al baseline.

### 8.7 Email generica vs personale
Regex per classificare: `/^(info|admin|support|hello|contact|sales|marketing|office|noreply|...)@/i`

---

## 9. Dipendenze NPM Rilevanti

```json
{
  "next": "15.x",
  "react": "18.x",
  "prisma": "^5.x",
  "@prisma/client": "^5.x",
  "next-auth": "^4.x",
  "tailwindcss": "^3.x",
  "lucide-react": "latest",
  "@radix-ui/react-dialog": "latest",
  "@radix-ui/react-popover": "latest",
  "@radix-ui/react-tabs": "latest",
  "@radix-ui/react-dropdown-menu": "latest",
  "@radix-ui/react-alert-dialog": "latest",
  "@radix-ui/react-scroll-area": "latest",
  "@radix-ui/react-avatar": "latest",
  "cmdk": "latest",
  "class-variance-authority": "latest",
  "clsx": "latest",
  "tailwind-merge": "latest"
}
```

Per shadcn/ui: `npx shadcn@latest init` e poi aggiungere i componenti necessari (`button`, `input`, `card`, `tabs`, `dialog`, `badge`, etc.).
