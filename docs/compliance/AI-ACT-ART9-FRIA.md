# Valutazione d'Impatto sui Diritti Fondamentali (FRIA)

**AI Act -- Articolo 9 (Regolamento UE 2024/1689)**

| Campo | Valore |
|---|---|
| Sistema | FridAI (LikeAiSaid) -- Business Rules Engine con assistenza AI |
| Versione documento | 1.0 |
| Data di redazione | 2026-04-23 |
| Responsabile | `[NOME DEL RESPONSABILE]` |
| Prossima revisione | `[DATA -- entro 12 mesi]` |

---

## 1. Descrizione del sistema AI

FridAI e un motore di regole aziendali che consente agli utenti di creare alberi decisionali a partire da descrizioni in linguaggio naturale, per poi navigarli in modo interattivo con l'ausilio di sistemi di intelligenza artificiale. L'applicazione integra i seguenti sotto-sistemi AI:

### 1.1 Estrazione variabili (`extract-variables`)

- **Funzione**: analizza un testo in linguaggio naturale e identifica le variabili chiave (booleane, enumerative, numeriche, testuali) con i rispettivi valori possibili.
- **Modello**: OpenRouter / Gemini (configurabile per utente).
- **Dati trattati**: testo descrittivo di un processo aziendale fornito dall'utente.
- **Output**: elenco strutturato di variabili e opzioni.

### 1.2 Generazione albero decisionale (`generate-decision-tree`)

- **Funzione**: a partire dalle variabili estratte, genera un albero decisionale sia in formato JSON (per il motore) sia in linguaggio naturale (per l'utente).
- **Modello**: OpenRouter / Gemini.
- **Dati trattati**: descrizione del processo + tabella variabili.
- **Output**: albero decisionale strutturato, script di domande guidate.

### 1.3 Assistente conversazionale DetAI (`detai-flow`)

- **Funzione**: chatbot general-purpose che ricerca e consulta il database degli alberi decisionali per rispondere alle domande dell'utente.
- **Modello**: OpenRouter / Gemini.
- **Dati trattati**: cronologia conversazione, contenuto degli alberi decisionali.
- **Output**: risposte testuali basate sulla knowledge base aziendale.

### 1.4 Diagnosi problemi (`diagnose-problem`)

- **Funzione**: guida l'utente passo-passo attraverso un albero decisionale per diagnosticare un problema, ponendo domande mirate.
- **Modello**: OpenRouter / Gemini.
- **Dati trattati**: descrizione del problema, albero decisionale, storico domande/risposte.
- **Output**: domanda successiva oppure diagnosi finale con media, link e azioni suggerite.

### 1.5 Agente SQL (`sql-agent-flow`)

- **Funzione**: genera ed esegue query SQL contestuali sul database aziendale dell'utente tramite connettori configurati.
- **Modello**: OpenRouter (modello agente configurabile per utente).
- **Dati trattati**: schema del database, cronologia conversazione, risultati delle query.
- **Output**: query SQL, dati tabulari, visualizzazioni.

### 1.6 Agente Python (`python-agent-flow`)

- **Funzione**: genera ed esegue codice Python (Pandas / Plotly) per analisi dati, grafici e report HTML interattivi. Supporta scrittura su database tramite `saveToDb`.
- **Modello**: OpenRouter (modello agente configurabile per utente).
- **Dati trattati**: schema del database, dati estratti via SQL, cronologia conversazione.
- **Output**: codice Python, grafici Plotly, tabelle HTML interattive.

### 1.7 Super Agent (`super-agent-flow`)

- **Funzione**: orchestratore che coordina agente SQL, agente Python e creazione widget in un unico flusso conversazionale.
- **Modello**: OpenRouter.
- **Dati trattati**: aggregazione dei dati degli agenti sottostanti.
- **Output**: widget, grafici, report composti.

### 1.8 Lead Generator (`lead-generator-flow`)

- **Funzione**: ricerca automatizzata di aziende e contatti commerciali tramite scraping web, arricchimento dati (Hunter, Apollo) e verifica email.
- **Modello**: OpenRouter + servizi esterni (Hunter.io, Apollo, VibeSearch).
- **Dati trattati**: criteri di ricerca, dati aziendali pubblici, indirizzi email.
- **Output**: lista di lead con dati di contatto.

### 1.9 Report di vendita (`report-flow`)

- **Funzione**: pipeline di aggregazione e analisi dati di vendita con generazione di grafici.
- **Modello**: nessuno (elaborazione deterministica su dati mock/reali).
- **Dati trattati**: dati di vendita.
- **Output**: report con grafici e analisi best/worst product.

### 1.10 Server MCP (`mcp/server.ts`)

- **Funzione**: espone gli alberi decisionali ad assistenti AI esterni (Claude, Cursor) tramite Model Context Protocol.
- **Dati trattati**: alberi decisionali, query di ricerca.
- **Output**: dati strutturati degli alberi.

---

## 2. Diritti fondamentali potenzialmente impattati

### 2.1 Dignita umana (Art. 1 Carta dei Diritti Fondamentali UE)

| Aspetto | Valutazione |
|---|---|
| **Rischio** | Basso |
| **Descrizione** | I sistemi AI assistono nella navigazione di alberi decisionali e nell'analisi dati, ma non prendono decisioni autonome che incidano sulla dignita delle persone. L'utente mantiene il controllo finale su ogni decisione. |
| **Scenario critico** | Se gli alberi decisionali venissero utilizzati per valutare prestazioni lavorative individuali senza adeguata supervisione umana. |
| **Mitigazione attuale** | Ogni output AI e presentato come suggerimento; la decisione finale spetta all'operatore umano. |

### 2.2 Protezione dei dati personali (Art. 8 Carta UE / GDPR)

| Aspetto | Valutazione |
|---|---|
| **Rischio** | Medio-alto |
| **Descrizione** | Gli agenti SQL e Python accedono a database aziendali che possono contenere dati personali (clienti, dipendenti, fornitori). Le query AI-generated potrebbero estrarre o esporre dati personali. Il Lead Generator raccoglie dati personali (nomi, email, profili professionali) da fonti pubbliche. |
| **Scenario critico** | Un agente SQL genera una query che estrae dati sensibili non pertinenti alla richiesta; il Lead Generator raccoglie dati di soggetti che non hanno acconsentito. |
| **Mitigazione attuale** | Isolamento multi-tenant per `companyId`; query SQL in modalita preview (sola lettura per default); autenticazione obbligatoria su tutte le rotte. |

### 2.3 Non discriminazione (Art. 21 Carta UE)

| Aspetto | Valutazione |
|---|---|
| **Rischio** | Basso-medio |
| **Descrizione** | Gli alberi decisionali sono creati dall'utente e potrebbero incorporare bias inconsapevoli nelle regole. I modelli AI (Gemini/OpenRouter) potrebbero amplificare stereotipi nel linguaggio generato. |
| **Scenario critico** | Un albero decisionale per il recruiting include criteri che discriminano indirettamente per genere, eta o origine etnica. |
| **Mitigazione attuale** | La generazione dell'albero e basata esclusivamente sul testo fornito dall'utente; non vengono utilizzati dati demografici per il training. |

### 2.4 Liberta di espressione (Art. 11 Carta UE)

| Aspetto | Valutazione |
|---|---|
| **Rischio** | Basso |
| **Descrizione** | Il sistema non modera, filtra o censura contenuti degli utenti. DetAI e un assistente informativo che consulta la knowledge base aziendale. |
| **Scenario critico** | Nessuno scenario significativo identificato. |
| **Mitigazione attuale** | Nessuna restrizione sulla liberta di espressione degli utenti all'interno della piattaforma. |

### 2.5 Diritto a un ricorso effettivo (Art. 47 Carta UE)

| Aspetto | Valutazione |
|---|---|
| **Rischio** | Medio |
| **Descrizione** | Le decisioni suggerite dagli alberi decisionali (es. esito di una procedura di garanzia, reso, reclamo) potrebbero essere percepite come definitive dall'utente finale se non adeguatamente comunicate come suggerimenti. |
| **Scenario critico** | Un cliente finale riceve un esito negativo da un albero decisionale e non e informato della possibilita di contestare la decisione o richiedere l'intervento di un operatore umano. |
| **Mitigazione attuale** | Il sistema presenta gli esiti come suggerimenti; tuttavia, non esiste un meccanismo esplicito di ricorso integrato nell'applicazione. |

### 2.6 Diritti dei lavoratori (Art. 27-34 Carta UE)

| Aspetto | Valutazione |
|---|---|
| **Rischio** | Medio |
| **Descrizione** | Se gli alberi decisionali vengono utilizzati per procedure HR (valutazione prestazioni, assegnazione turni, gestione ferie), le decisioni automatizzate impattano direttamente i diritti dei lavoratori. Gli agenti SQL/Python possono accedere a dati relativi ai dipendenti. |
| **Scenario critico** | Un albero decisionale automatizza la gestione di procedimenti disciplinari o la valutazione delle prestazioni senza adeguato coinvolgimento del lavoratore. |
| **Mitigazione attuale** | Il sistema e progettato come strumento di supporto, non di sostituzione del decisore umano. L'accesso ai dati e regolato da ruoli (`user`, `admin`, `superadmin`). |

---

## 3. Valutazione impatto per sistema AI

| Sistema AI | Diritto impattato | Probabilita | Gravita | Livello rischio | Mitigazione |
|---|---|---|---|---|---|
| **Estrazione variabili** | Non discriminazione | Bassa | Bassa | Basso | Revisione umana delle variabili estratte |
| **Generazione albero** | Non discriminazione | Bassa | Media | Basso-medio | Revisione e modifica dell'albero prima della pubblicazione |
| **DetAI (chatbot)** | Protezione dati | Media | Media | Medio | Isolamento multi-tenant; accesso autenticato |
| **DetAI (chatbot)** | Ricorso effettivo | Media | Media | Medio | Indicare chiaramente la natura di suggerimento delle risposte |
| **Diagnosi problemi** | Ricorso effettivo | Media | Media | Medio | Prevedere escalation a operatore umano |
| **Agente SQL** | Protezione dati | Media | Alta | Medio-alto | Query in modalita preview; logging delle query; audit trail |
| **Agente Python** | Protezione dati | Media | Alta | Medio-alto | Esecuzione sandboxed; limitazione operazioni di scrittura |
| **Super Agent** | Protezione dati | Media | Alta | Medio-alto | Eredita le mitigazioni degli agenti sottostanti |
| **Lead Generator** | Protezione dati | Alta | Alta | Alto | Consenso e base giuridica per il trattamento; opt-out |
| **Lead Generator** | Dignita umana | Bassa | Media | Basso-medio | Limitazione ai soli dati aziendali pubblici |
| **Report vendita** | Nessuno diretto | -- | -- | Trascurabile | Elaborazione deterministica su dati aggregati |
| **Server MCP** | Protezione dati | Bassa | Media | Basso-medio | Autenticazione; esposizione dei soli alberi decisionali |

---

## 4. Gruppi vulnerabili

### 4.1 Lavoratori soggetti a decisioni automatizzate

- **Descrizione**: dipendenti la cui attivita lavorativa e regolata o valutata tramite alberi decisionali (es. procedure operative, checklist qualita, gestione turni).
- **Rischio specifico**: riduzione dell'autonomia decisionale; percezione di sorveglianza automatizzata; decisioni impattanti senza adeguata spiegazione.
- **Misure necessarie**:
  - Informativa chiara sull'uso di sistemi AI nei processi HR (Art. 22 GDPR).
  - Diritto a ottenere l'intervento umano su qualsiasi decisione automatizzata.
  - Formazione specifica sull'uso degli strumenti AI.
  - Consultazione delle rappresentanze sindacali ove previsto.

### 4.2 Clienti e utenti finali delle decisioni degli alberi

- **Descrizione**: soggetti esterni (clienti, fornitori) che ricevono esiti generati dalla navigazione degli alberi decisionali (es. approvazione/rifiuto garanzia, classificazione reclami).
- **Rischio specifico**: decisioni percepite come automatiche e definitive senza possibilita di contestazione.
- **Misure necessarie**:
  - Comunicare chiaramente che l'esito e un suggerimento soggetto a conferma umana.
  - Fornire un canale di ricorso accessibile.
  - Garantire trasparenza sulle regole applicate dall'albero decisionale.

### 4.3 Soggetti dei dati raccolti dal Lead Generator

- **Descrizione**: professionisti i cui dati di contatto vengono raccolti automaticamente da fonti pubbliche per finalita commerciali.
- **Rischio specifico**: trattamento senza base giuridica adeguata; mancata informativa; profilazione non autorizzata.
- **Misure necessarie**:
  - Verifica della base giuridica (legittimo interesse con bilanciamento) prima dell'attivazione.
  - Informativa privacy al primo contatto.
  - Meccanismo di opt-out immediato.
  - Limitazione della raccolta ai soli dati strettamente necessari.

---

## 5. Misure di mitigazione

### 5.1 Misure gia implementate

| Misura | Descrizione | Sistemi coperti |
|---|---|---|
| **Multi-tenancy** | Isolamento completo dei dati per `companyId`; ogni query e filtrata per azienda | Tutti |
| **Autenticazione obbligatoria** | Middleware NextAuth.js su tutte le rotte; JWT con scope aziendale | Tutti |
| **Controllo accessi basato su ruoli** | Ruoli `user`, `admin`, `superadmin` con permessi differenziati | Tutti |
| **Query SQL in preview** | Le query generate dall'agente SQL sono eseguite in modalita sola lettura per default | Agente SQL |
| **Logging e audit** | Registrazione delle conversazioni agente nel modello `AgentConversation` | Agenti SQL, Python, Super |
| **Sandbox di esecuzione** | Il codice Python e eseguito in un backend separato (Flask, porta 5005) | Agente Python |
| **Revisione umana degli alberi** | L'utente puo modificare l'albero generato prima della pubblicazione | Generazione albero |
| **MFA/TOTP** | Autenticazione a due fattori disponibile | Tutti |

### 5.2 Misure da implementare

| Misura | Priorita | Descrizione | Sistemi interessati |
|---|---|---|---|
| **Avviso esplicito "suggerimento AI"** | Alta | Aggiungere un banner visibile su ogni output AI che indichi chiaramente la natura non vincolante della risposta | DetAI, Diagnosi, Agenti |
| **Meccanismo di escalation** | Alta | Pulsante "Parla con un operatore" integrato nel flusso di diagnosi e navigazione alberi | DetAI, Diagnosi |
| **Audit log immutabile** | Alta | Registrazione tamper-proof di tutte le query SQL e Python eseguite, con timestamp e utente | Agenti SQL, Python |
| **Data masking** | Media | Offuscamento automatico di dati sensibili (CF, IBAN, email personali) nei risultati delle query | Agenti SQL, Python |
| **Bias review checklist** | Media | Checklist di revisione bias da compilare prima della pubblicazione di alberi decisionali in ambito HR | Generazione albero |
| **Consenso Lead Generator** | Alta | Implementare verifica base giuridica e informativa automatica per i dati raccolti | Lead Generator |
| **Rate limiting per agente** | Media | Limitare il numero di query/esecuzioni per utente/sessione per prevenire abusi | Tutti gli agenti |
| **DPIA specifica Lead Generator** | Alta | Condurre una DPIA dedicata per il modulo Lead Generator (trattamento sistematico su larga scala) | Lead Generator |

---

## 6. Monitoraggio continuo

### 6.1 Frequenza delle revisioni

| Attivita | Frequenza | Responsabile |
|---|---|---|
| Revisione completa FRIA | Annuale (o a ogni modifica significativa del sistema) | DPO / Responsabile AI |
| Analisi log query agenti | Mensile | Team sicurezza |
| Verifica bias alberi decisionali | A ogni nuova pubblicazione in ambito HR | Responsabile HR + DPO |
| Audit accessi e permessi | Trimestrale | Team sicurezza |
| Test di penetrazione | Semestrale | Team sicurezza / consulente esterno |
| Verifica conformita Lead Generator | Trimestrale | DPO |

### 6.2 Indicatori chiave (KPI)

| KPI | Target | Metrica |
|---|---|---|
| Percentuale output AI con disclaimer visibile | 100% | Audit UI trimestrale |
| Tempo medio di escalation a operatore umano | < 2 minuti | Log applicativo |
| Incidenti di esposizione dati personali via agenti | 0 | Segnalazioni + audit log |
| Reclami per decisioni automatizzate senza ricorso | 0 | Registro reclami |
| Copertura audit log su query SQL/Python | 100% | Verifica mensile |

### 6.3 Processo di aggiornamento

1. **Trigger di revisione**: rilascio di nuove funzionalita AI, modifica dei modelli utilizzati, segnalazione di incidente, modifica normativa.
2. **Valutazione**: il responsabile AI effettua una valutazione preliminare dell'impatto della modifica sui diritti fondamentali.
3. **Aggiornamento FRIA**: se l'impatto e significativo, il presente documento viene aggiornato con nuova analisi e mitigazioni.
4. **Comunicazione**: le modifiche vengono comunicate al DPO, al management e, se necessario, alle rappresentanze dei lavoratori.
5. **Archiviazione**: le versioni precedenti del documento sono conservate per almeno 5 anni.

---

## Firme

| Ruolo | Nome | Data | Firma |
|---|---|---|---|
| Responsabile AI | `________________` | `____/____/________` | `________________` |
| DPO | `________________` | `____/____/________` | `________________` |
| Direzione | `________________` | `____/____/________` | `________________` |
| Rappresentanza lavoratori (ove applicabile) | `________________` | `____/____/________` | `________________` |
