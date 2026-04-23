# Registro delle Attivita di Trattamento

**ai sensi dell'Art. 30 del Regolamento (UE) 2016/679 (GDPR)**

Data di redazione: 2026-04-23
Ultima revisione: 2026-04-23
Versione: 1.0

---

## 1. Titolare del Trattamento

| Campo | Valore |
|-------|--------|
| Ragione sociale | _[INSERIRE RAGIONE SOCIALE]_ |
| Sede legale | _[INSERIRE INDIRIZZO SEDE LEGALE]_ |
| P.IVA / C.F. | _[INSERIRE P.IVA / C.F.]_ |
| Rappresentante legale | _[INSERIRE NOME E COGNOME]_ |
| Email di contatto | _[INSERIRE EMAIL]_ |
| PEC | _[INSERIRE PEC]_ |
| Telefono | _[INSERIRE TELEFONO]_ |

---

## 2. Responsabile della Protezione dei Dati (DPO)

| Campo | Valore |
|-------|--------|
| Nome e cognome / Societa | _[INSERIRE NOME DPO O SOCIETA INCARICATA]_ |
| Email | _[INSERIRE EMAIL DPO]_ |
| Telefono | _[INSERIRE TELEFONO DPO]_ |
| Indirizzo | _[INSERIRE INDIRIZZO DPO]_ |

> **Nota**: la nomina del DPO e obbligatoria ai sensi dell'Art. 37 GDPR qualora il trattamento sia effettuato su larga scala o riguardi categorie particolari di dati. Valutare la necessita in base al volume di dati trattati e al numero di interessati.

---

## 3. Registro delle Attivita di Trattamento

### 3.1 Autenticazione utenti e gestione account

| Campo | Descrizione |
|-------|-------------|
| **N.** | 1 |
| **Finalita** | Autenticazione degli utenti, gestione delle sessioni, controllo degli accessi basato su ruoli (RBAC) e verifica dell'identita tramite MFA/TOTP |
| **Categorie di dati personali** | Email, password (hash bcrypt), nome, immagine profilo, data di verifica email, ruolo organizzativo, dipartimento, segreto MFA (TOTP), token di sessione, token di verifica email, token di reset password, indirizzo IP (log di accesso) |
| **Categorie di interessati** | Utenti registrati della piattaforma (dipendenti e collaboratori delle aziende clienti) |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto di servizio; Art. 6(1)(f) - legittimo interesse alla sicurezza del sistema |
| **Destinatari / Trasferimenti** | Nessun trasferimento a terzi. I dati restano nel database PostgreSQL gestito dal Titolare. I token di sessione transitano nel browser dell'utente (cookie httpOnly) |
| **Termini di cancellazione** | Account utente: su richiesta dell'interessato (Art. 17) tramite endpoint `DELETE /api/gdpr/delete`. Sessioni scadute: cancellazione automatica tramite cron job di retention. Token di verifica/reset password: cancellazione automatica alla scadenza |
| **Misure di sicurezza** | Hash password con bcrypt, MFA/TOTP (RFC 6238) con segreto cifrato AES-256-GCM a riposo, rate limiting su login (5 tentativi / 15 min per email), sessioni JWT con scadenza, isolamento multi-tenant per `companyId`, audit logging di ogni accesso |

**Modelli Prisma coinvolti**: `User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken`, `Role`, `Permission`

---

### 3.2 Creazione e gestione alberi decisionali

| Campo | Descrizione |
|-------|-------------|
| **N.** | 2 |
| **Finalita** | Creazione, modifica e navigazione interattiva di alberi decisionali per la gestione di regole aziendali, con assistenza AI |
| **Categorie di dati personali** | Dati aziendali inseriti dall'utente nelle descrizioni e nei nodi degli alberi (potenzialmente contenenti dati personali a seconda del caso d'uso: nomi clienti, riferimenti a ordini, variabili di business). Variabili definite dall'utente con possibili valori |
| **Categorie di interessati** | Utenti della piattaforma; indirettamente, soggetti menzionati nelle regole decisionali (clienti, fornitori, dipendenti dell'azienda cliente) |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto; Art. 6(1)(f) - legittimo interesse all'automazione dei processi decisionali |
| **Destinatari / Trasferimenti** | Il contenuto degli alberi viene inviato a provider AI esterni (OpenRouter, Google AI/Gemini) per la generazione e l'elaborazione. Trasferimento extra-UE verso USA (vedi Sezione 5). La redazione PII e applicata prima dell'invio ai provider AI |
| **Termini di cancellazione** | Per tutta la durata del contratto di servizio. Cancellazione su richiesta dell'interessato o alla cessazione del rapporto contrattuale. Cache preview nodi: 30 giorni (retention automatica) |
| **Misure di sicurezza** | Isolamento multi-tenant per `companyId`, redazione automatica PII prima dell'invio a LLM esterni (`pii-redact.ts`), controllo accessi basato su ruoli |

**Modelli Prisma coinvolti**: `Tree`, `Variable`, `NodePreviewCache`, `KnowledgeBaseEntry`

---

### 3.3 Conversazioni con agenti AI (SQL Agent, Python Agent, Super Agent)

| Campo | Descrizione |
|-------|-------------|
| **N.** | 3 |
| **Finalita** | Esecuzione di query SQL assistite da AI, generazione di codice Python/Pandas per analisi dati, orchestrazione multi-strumento tramite Super Agent. Storicizzazione delle conversazioni per continuita di contesto |
| **Categorie di dati personali** | Messaggi dell'utente (prompt), risposte dell'AI, script SQL/Python generati, schemi di tabelle, dati di input, risultati di query che possono contenere dati personali estratti da database aziendali (nomi clienti, email, numeri di telefono, codici fiscali, IBAN, indirizzi) |
| **Categorie di interessati** | Utenti della piattaforma; indirettamente, soggetti i cui dati sono presenti nei database aziendali interrogati |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto; Art. 6(1)(f) - legittimo interesse all'analisi dati aziendale |
| **Destinatari / Trasferimenti** | Provider AI: OpenRouter (USA), Google AI / Gemini (USA). I prompt contenenti dati di database vengono sottoposti a redazione PII automatica prima dell'invio. Trasferimento extra-UE (vedi Sezione 5) |
| **Termini di cancellazione** | 12 mesi dalla data di ultimo aggiornamento (retention automatica via cron job `retention-cleanup`). Cancellazione anticipata su richiesta dell'interessato |
| **Misure di sicurezza** | Redazione PII automatica sui prompt in uscita (email, telefono, IBAN, codice fiscale, P.IVA, IP, numeri carta di credito), circuit breaker sui provider AI, rate limiting, timeout sulle chiamate AI, isolamento multi-tenant |

**Modelli Prisma coinvolti**: `AgentConversation`, `SuperAgentConversation`

---

### 3.4 Generazione lead e CRM

| Campo | Descrizione |
|-------|-------------|
| **N.** | 4 |
| **Finalita** | Ricerca e acquisizione di potenziali clienti (lead generation), arricchimento dati aziendali, gestione contatti commerciali assistita da AI |
| **Categorie di dati personali** | Nome, cognome, qualifica professionale, email, stato email, numero di telefono, URL LinkedIn, nome azienda, dominio web, sito aziendale, dimensione azienda, settore, citta, paese, LinkedIn aziendale, dati finanziari (fatturato e utili su 3 anni), note, tag, rating, fonte dati, dati grezzi del provider, lista contatti multipli per azienda (JSON con nome, cognome, qualifica, email, telefono, LinkedIn) |
| **Categorie di interessati** | Persone fisiche identificate come potenziali contatti commerciali; referenti aziendali; rappresentanti di societa prospect |
| **Base giuridica** | Art. 6(1)(f) GDPR - legittimo interesse alla prospezione commerciale, bilanciato con i diritti degli interessati. Necessaria valutazione di impatto (DPIA) per trattamenti su larga scala. In alternativa, Art. 6(1)(a) - consenso dell'interessato ove applicabile |
| **Destinatari / Trasferimenti** | Provider AI per conversazioni di generazione lead (OpenRouter/Google AI, USA). Dati di contatto provenienti da fonti esterne (API di data provider). Trasferimento extra-UE (vedi Sezione 5) |
| **Termini di cancellazione** | Conversazioni lead generator: 12 mesi (retention automatica). Dati lead: per tutta la durata del rapporto contrattuale, salvo richiesta di cancellazione. Rivalutazione periodica della necessita di conservazione |
| **Misure di sicurezza** | Cifratura a riposo AES-256-GCM per campi sensibili (`Lead.phone`, `Lead.linkedinUrl`, `Lead.notes`), isolamento multi-tenant per `companyId`, indici dedicati per performance e segregazione |

**Modelli Prisma coinvolti**: `Lead`, `LeadSearch`, `LeadGeneratorConversation`

---

### 3.5 Messaggistica WhatsApp

| Campo | Descrizione |
|-------|-------------|
| **N.** | 5 |
| **Finalita** | Gestione di sessioni di messaggistica WhatsApp per raccolta dati e interazione con contatti, integrazione con flussi decisionali |
| **Categorie di dati personali** | Numero di telefono, nome del contatto, messaggi scambiati (JSON), dati raccolti durante la sessione (JSON), note sui contatti, stato della sessione |
| **Categorie di interessati** | Contatti WhatsApp (clienti, prospect, utenti esterni che interagiscono tramite WhatsApp) |
| **Base giuridica** | Art. 6(1)(a) GDPR - consenso dell'interessato (raccolto tramite la sessione WhatsApp); Art. 6(1)(b) - esecuzione di un contratto o misure precontrattuali |
| **Destinatari / Trasferimenti** | Meta/WhatsApp Business API (USA) per il transito dei messaggi. Dati conservati nel database interno. Trasferimento extra-UE (vedi Sezione 5) |
| **Termini di cancellazione** | Per la durata della relazione commerciale. Cancellazione su richiesta o alla cessazione del rapporto. Inclusione nell'export GDPR Art. 15 |
| **Misure di sicurezza** | Cifratura a riposo per note contatto (`WhatsAppContact.notes`), isolamento multi-tenant, vincoli di unicita su `phoneNumber + connectorId` |

**Modelli Prisma coinvolti**: `WhatsAppSession`, `WhatsAppContact`

---

### 3.6 Pipeline e task schedulati

| Campo | Descrizione |
|-------|-------------|
| **N.** | 6 |
| **Finalita** | Automazione di flussi di lavoro (pipeline) con esecuzione programmata (cron, intervalli), orchestrazione di nodi computazionali, monitoraggio esecuzioni |
| **Categorie di dati personali** | ID dell'utente creatore del task, configurazione dei nodi (potenzialmente contenente riferimenti a dati personali), risultati delle esecuzioni (potenzialmente contenenti dati estratti da query), messaggi di errore |
| **Categorie di interessati** | Utenti della piattaforma; indirettamente, soggetti i cui dati sono elaborati dalle pipeline |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto di servizio |
| **Destinatari / Trasferimenti** | I dati elaborati possono transitare verso provider AI (OpenRouter, Google AI) se i nodi della pipeline contengono operazioni AI. Trasferimento extra-UE (vedi Sezione 5) |
| **Termini di cancellazione** | Esecuzioni task: 12 mesi (retention automatica). Configurazioni pipeline: per la durata del contratto |
| **Misure di sicurezza** | Isolamento multi-tenant, audit logging delle esecuzioni, gestione retry con backoff, timeout sulle esecuzioni |

**Modelli Prisma coinvolti**: `Pipeline`, `ScheduledTask`, `ScheduledTaskExecution`

---

### 3.7 Audit logging

| Campo | Descrizione |
|-------|-------------|
| **N.** | 7 |
| **Finalita** | Registrazione delle attivita degli utenti per sicurezza, conformita normativa (GDPR, NIS2), indagini forensi, tracciabilita delle operazioni |
| **Categorie di dati personali** | ID utente, ID azienda, azione eseguita, risorsa interessata, dettagli contestuali (JSON), indirizzo IP, timestamp |
| **Categorie di interessati** | Tutti gli utenti della piattaforma |
| **Base giuridica** | Art. 6(1)(c) GDPR - obbligo legale (NIS2 Art. 21); Art. 6(1)(f) - legittimo interesse alla sicurezza dei sistemi informativi |
| **Destinatari / Trasferimenti** | Nessun trasferimento a terzi. I log restano nel database PostgreSQL e in file di fallback locali (`logs/audit-fallback.jsonl`). Accessibili solo ad amministratori autorizzati |
| **Termini di cancellazione** | 2 anni (730 giorni) dalla creazione, come richiesto da obblighi di conformita NIS2 e best practice di sicurezza. Cancellazione automatica tramite cron job `retention-cleanup`. In caso di cancellazione account utente, i log vengono pseudonimizzati (userId sostituito, IP rimosso) anziche eliminati |
| **Misure di sicurezza** | Scrittura append-only, fallback su file system in caso di errore DB, pseudonimizzazione alla cancellazione utente, indici per ricerca efficiente, accesso limitato ad amministratori |

**Modelli Prisma coinvolti**: `AuditLog`

---

### 3.8 Tracciamento consenso cookie

| Campo | Descrizione |
|-------|-------------|
| **N.** | 8 |
| **Finalita** | Registrazione e prova del consenso ai cookie e alle finalita di trattamento (essenziali, analytics, marketing), conformita Art. 7(1) GDPR per l'onere della prova |
| **Categorie di dati personali** | ID utente (opzionale, per visitatori anonimi viene usato un ID anonimo), ID anonimo (UUID/cookie), preferenze di consenso per categoria (essenziali, analytics, marketing), versione della policy, indirizzo IP, user agent del browser, timestamp |
| **Categorie di interessati** | Tutti i visitatori del sito/applicazione, sia autenticati sia anonimi |
| **Base giuridica** | Art. 6(1)(c) GDPR - obbligo legale di dimostrare il consenso (Art. 7(1)); Direttiva ePrivacy (Art. 5(3)) |
| **Destinatari / Trasferimenti** | Nessun trasferimento a terzi. Dati conservati nel database PostgreSQL interno |
| **Termini di cancellazione** | Conservazione per la durata necessaria a dimostrare il consenso. Rivalutazione periodica. Cancellazione automatica dei record dell'utente in caso di esercizio del diritto alla cancellazione (Art. 17) |
| **Misure di sicurezza** | Registrazione server-side (non solo localStorage), versioning della policy per richiesta di rinnovo consenso, indici per ricerca efficiente |

**Modelli Prisma coinvolti**: `ConsentLog`

---

### 3.9 Upload file (Data Lake)

| Campo | Descrizione |
|-------|-------------|
| **N.** | 9 |
| **Finalita** | Caricamento e archiviazione di documenti aziendali (PDF, fogli di calcolo, immagini, video, CSV) per utilizzo nei flussi decisionali e nelle analisi dati |
| **Categorie di dati personali** | Contenuto dei file caricati (potenzialmente qualsiasi categoria di dato personale presente nei documenti: nomi, indirizzi, dati finanziari, ecc.), metadati del file (nome, tipo MIME, dimensione) |
| **Categorie di interessati** | Utenti della piattaforma; indirettamente, soggetti i cui dati sono contenuti nei documenti caricati |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto di servizio |
| **Destinatari / Trasferimenti** | I file sono conservati nel file system locale (data lake) organizzato per `companyId`. Nessun trasferimento a terzi, salvo invio del contenuto a provider AI per elaborazione (con redazione PII) |
| **Termini di cancellazione** | Per la durata del contratto. Cancellazione su richiesta dell'interessato o alla cessazione del rapporto |
| **Misure di sicurezza** | Validazione tipo MIME e magic bytes, blocco estensioni pericolose (HTML, JS, PHP, eseguibili), limite dimensione file (50 MB), isolamento per `companyId` nel file system, autenticazione obbligatoria |

**Percorso file system**: `public/documents/{companyId}/`

---

### 3.10 Abbonamenti e fatturazione

| Campo | Descrizione |
|-------|-------------|
| **N.** | 10 |
| **Finalita** | Gestione degli abbonamenti SaaS, elaborazione dei pagamenti, gestione del ciclo di vita della sottoscrizione |
| **Categorie di dati personali** | ID cliente Stripe, ID sottoscrizione Stripe, ID piano tariffario, stato dell'abbonamento, date di inizio/fine periodo, flag di cancellazione a fine periodo. I dati di pagamento completi (carta di credito, indirizzo di fatturazione) sono gestiti e conservati esclusivamente da Stripe e NON transitano nel database dell'applicazione |
| **Categorie di interessati** | Aziende clienti (rappresentate dal modello `Company`); indirettamente, i titolari dei metodi di pagamento |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto; obblighi fiscali e contabili |
| **Destinatari / Trasferimenti** | Stripe, Inc. (USA) - processore di pagamenti. I dati di pagamento sono gestiti interamente da Stripe in qualita di responsabile del trattamento. Trasferimento extra-UE (vedi Sezione 5) |
| **Termini di cancellazione** | Per la durata del rapporto contrattuale e per il periodo richiesto dalla normativa fiscale (10 anni per documentazione contabile). Record Stripe: secondo la data retention policy di Stripe |
| **Misure di sicurezza** | Verifica firma webhook Stripe (signature validation), nessun dato carta memorizzato localmente, comunicazione TLS, isolamento multi-tenant |

**Modelli Prisma coinvolti**: `Subscription`

---

### 3.11 Connessioni a database esterni e connettori

| Campo | Descrizione |
|-------|-------------|
| **N.** | 11 |
| **Finalita** | Configurazione e gestione delle connessioni a database esterni dell'azienda cliente per l'esecuzione di query SQL e l'analisi dati tramite agenti AI |
| **Categorie di dati personali** | Stringhe di connessione a database (contenenti potenzialmente hostname, porta, username, password), mappe struttura database, cache token di accesso |
| **Categorie di interessati** | Aziende clienti; indirettamente, soggetti i cui dati sono contenuti nei database connessi |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto di servizio |
| **Destinatari / Trasferimenti** | I dati di configurazione restano nel database interno. Le credenziali di connessione (`Connector.config`) sono cifrate a riposo con AES-256-GCM. I database esterni sono gestiti dal cliente |
| **Termini di cancellazione** | Per la durata del contratto. Cancellazione alla cessazione del rapporto o su richiesta |
| **Misure di sicurezza** | Cifratura a riposo AES-256-GCM per il campo `config` (contiene credenziali), isolamento multi-tenant, query parametrizzate per prevenire SQL injection |

**Modelli Prisma coinvolti**: `Connector`, `Connection`, `TokenCache`

---

### 3.12 Inviti e onboarding

| Campo | Descrizione |
|-------|-------------|
| **N.** | 12 |
| **Finalita** | Invio di inviti per la registrazione di nuovi utenti nella piattaforma, gestione del processo di onboarding |
| **Categorie di dati personali** | Email dell'invitato, token di invito, ruolo assegnato, stato dell'invito, data di scadenza |
| **Categorie di interessati** | Persone invitate a registrarsi nella piattaforma |
| **Base giuridica** | Art. 6(1)(b) GDPR - misure precontrattuali su richiesta dell'interessato; Art. 6(1)(f) - legittimo interesse dell'organizzazione all'onboarding |
| **Destinatari / Trasferimenti** | Provider email per l'invio degli inviti (Resend / SMTP configurato). Trasferimento extra-UE se il provider email e statunitense (vedi Sezione 5) |
| **Termini di cancellazione** | Inviti scaduti: cancellazione alla scadenza del token. Inviti accettati: conservati per la durata del contratto |
| **Misure di sicurezza** | Token univoci e con scadenza, vincolo di unicita email + azienda, isolamento multi-tenant |

**Modelli Prisma coinvolti**: `Invitation`

---

### 3.13 VPN aziendale

| Campo | Descrizione |
|-------|-------------|
| **N.** | 13 |
| **Finalita** | Configurazione e gestione di tunnel VPN WireGuard per l'accesso sicuro ai database aziendali da parte degli utenti |
| **Categorie di dati personali** | Chiave pubblica del server, chiave pubblica del peer (utente), IP assegnati, nome del dispositivo (es. "MacBook Pro di Mario"), data dell'ultimo handshake, associazione utente-peer |
| **Categorie di interessati** | Utenti della piattaforma che utilizzano la connessione VPN |
| **Base giuridica** | Art. 6(1)(b) GDPR - esecuzione del contratto; Art. 6(1)(f) - legittimo interesse alla sicurezza delle connessioni |
| **Destinatari / Trasferimenti** | Nessun trasferimento a terzi. Le configurazioni VPN restano nel database interno |
| **Termini di cancellazione** | Cancellazione alla rimozione del peer o alla cancellazione dell'account utente (cascade). Cancellazione su richiesta dell'interessato |
| **Misure di sicurezza** | Protocollo WireGuard con cifratura end-to-end, chiavi pubbliche (non private) memorizzate nel DB, isolamento per azienda, vincolo di unicita per configurazione |

**Modelli Prisma coinvolti**: `VpnConfig`, `VpnPeer`

---

## 4. Sub-responsabili del Trattamento (Art. 28 GDPR)

Ai sensi dell'Art. 28 GDPR, i seguenti sub-responsabili sono coinvolti nel trattamento dei dati personali. Per ciascuno e necessario stipulare un accordo di trattamento dati (DPA - Data Processing Agreement).

| # | Sub-responsabile | Sede | Servizio | Dati trattati | DPA |
|---|-----------------|------|----------|---------------|-----|
| 1 | **OpenRouter, Inc.** | USA | Routing e proxy per modelli LLM (GPT, Gemini, Claude, ecc.) | Prompt utente (con PII redatta), risposte AI, contenuto alberi decisionali | _[VERIFICARE E ALLEGARE DPA]_ |
| 2 | **Google LLC (Google AI / Gemini)** | USA | Modelli AI generativi (Gemini) tramite Genkit SDK | Prompt utente (con PII redatta), descrizioni alberi decisionali, analisi dati | _[VERIFICARE E ALLEGARE DPA]_ |
| 3 | **Stripe, Inc.** | USA | Elaborazione pagamenti, gestione abbonamenti | ID cliente, ID sottoscrizione, piano tariffario, stato pagamento. Dati carta di credito gestiti esclusivamente da Stripe (PCI DSS Level 1) | _[VERIFICARE E ALLEGARE DPA]_ |
| 4 | **Resend, Inc.** (o provider SMTP configurato) | USA (Resend) | Invio email transazionali (inviti, reset password, notifiche) | Email destinatario, contenuto del messaggio | _[VERIFICARE E ALLEGARE DPA]_ |
| 5 | **Meta Platforms, Inc. (WhatsApp Business API)** | USA | Transito messaggi WhatsApp | Numeri di telefono, contenuto messaggi, dati raccolti durante sessioni | _[VERIFICARE E ALLEGARE DPA]_ |
| 6 | **Provider hosting / cloud** | _[INSERIRE]_ | Hosting infrastruttura (server, database PostgreSQL) | Tutti i dati dell'applicazione | _[VERIFICARE E ALLEGARE DPA]_ |

> **Azione richiesta**: verificare che per ciascun sub-responsabile sia in essere un DPA conforme all'Art. 28 GDPR, contenente le clausole obbligatorie (finalita, durata, natura del trattamento, obblighi di sicurezza, diritto di audit).

---

## 5. Trasferimenti di Dati Extra-UE (Artt. 44-49 GDPR)

I seguenti trasferimenti di dati personali verso paesi terzi sono effettuati nell'ambito del trattamento:

| # | Destinatario | Paese | Garanzia adeguata | Note |
|---|-------------|-------|-------------------|------|
| 1 | OpenRouter, Inc. | USA | Data Privacy Framework (DPF) UE-USA e/o Clausole Contrattuali Standard (SCC) | I prompt vengono sottoposti a redazione PII automatica prima dell'invio. Verificare l'adesione al DPF o stipulare SCC |
| 2 | Google LLC | USA | Data Privacy Framework (DPF) UE-USA | Google e certificata nell'ambito del DPF. Verificare la copertura del servizio specifico (Vertex AI / Gemini API) |
| 3 | Stripe, Inc. | USA | Data Privacy Framework (DPF) UE-USA e/o SCC | Stripe e certificata DPF. I dati carta di credito non transitano nel sistema dell'applicazione |
| 4 | Resend, Inc. (o SMTP) | USA (Resend) | SCC e/o DPF | Verificare l'adesione del provider email al DPF o stipulare SCC |
| 5 | Meta Platforms, Inc. | USA | Data Privacy Framework (DPF) UE-USA e/o SCC | Meta e certificata DPF. Verificare la copertura per WhatsApp Business API |

> **Azioni richieste**:
> 1. Verificare lo stato di certificazione DPF di ciascun provider su [https://www.dataprivacyframework.gov/](https://www.dataprivacyframework.gov/)
> 2. Per i provider non certificati DPF, stipulare Clausole Contrattuali Standard (SCC) approvate dalla Commissione Europea (Decisione 2021/914)
> 3. Effettuare un Transfer Impact Assessment (TIA) per ciascun trasferimento
> 4. Documentare le misure supplementari adottate ai sensi della sentenza Schrems II

---

## 6. Misure Tecniche e Organizzative (Art. 32 GDPR)

### 6.1 Misure tecniche implementate nel sistema

#### Cifratura

| Misura | Stato | Dettaglio implementativo |
|--------|-------|------------------------|
| **Cifratura a riposo (AES-256-GCM)** | Implementata | Estensione Prisma trasparente (`src/lib/db.ts`) che cifra/decifra automaticamente i campi PII definiti in `src/lib/pii-fields.ts`. Campi cifrati: `Lead.phone`, `Lead.linkedinUrl`, `Lead.notes`, `Connector.config`, `User.openRouterApiKey`, `User.mfaSecret`, `WhatsAppContact.notes`. Richiede variabili d'ambiente `ENCRYPTION_KEY` (32 byte base64) e `PII_ENCRYPTION_ENABLED=true` |
| **Cifratura in transito (TLS)** | Implementata | Tutte le comunicazioni HTTP/HTTPS protette da TLS. Connessioni al database PostgreSQL via SSL |
| **Hash password** | Implementata | bcrypt con salt (via `bcryptjs`) per tutti gli hash password |

#### Autenticazione e Controllo Accessi

| Misura | Stato | Dettaglio implementativo |
|--------|-------|------------------------|
| **Multi-Factor Authentication (MFA)** | Implementata | TOTP (RFC 6238) tramite `otpauth`, algoritmo SHA1, 6 cifre, periodo 30s. Segreto cifrato a riposo (`src/lib/totp.ts`) |
| **Rate limiting** | Implementato | Limite tentativi login (5/15min per email), export GDPR (5/ora), cancellazione account (2/ora), chiamate AI. Implementazione in `src/lib/rate-limit.ts` |
| **RBAC (Role-Based Access Control)** | Implementato | Ruoli `user`, `admin`, `superadmin` con permessi granulari per azione/risorsa (`Role`, `Permission`). Middleware di protezione route (`src/middleware.ts`) |
| **Sessioni JWT** | Implementate | NextAuth.js v4 con sessioni JWT, scadenza configurabile, cookie httpOnly |
| **Isolamento multi-tenant** | Implementato | Tutti i dati filtrati per `companyId` dalla sessione. Nessun accesso cross-tenant possibile |

#### Protezione dei Dati

| Misura | Stato | Dettaglio implementativo |
|--------|-------|------------------------|
| **Redazione PII per LLM** | Implementata | Redazione automatica e obbligatoria di email, telefono, IBAN, codice fiscale, P.IVA, IP, numeri carta di credito prima dell'invio a provider AI esterni (`src/lib/pii-redact.ts`). Include sia redazione pattern-based sia redazione per nome colonna |
| **Diritto all'export (Art. 15/20)** | Implementato | Endpoint `GET /api/gdpr/export` per download di tutti i dati personali in formato JSON |
| **Diritto alla cancellazione (Art. 17)** | Implementato | Endpoint `DELETE /api/gdpr/delete` con transazione atomica, pseudonimizzazione audit log, conferma esplicita richiesta |
| **Data retention automatica** | Implementata | Cron job `POST /api/cron/retention-cleanup` con politiche per modello: audit log 2 anni, conversazioni 1 anno, cache preview 30 giorni, token scaduti immediati |
| **Validazione upload** | Implementata | Controllo tipo MIME, verifica magic bytes, blocco estensioni pericolose, limite 50 MB (`src/app/api/upload/route.ts`) |

#### Logging e Monitoraggio

| Misura | Stato | Dettaglio implementativo |
|--------|-------|------------------------|
| **Audit logging** | Implementato | Registrazione di tutte le operazioni significative (login, export GDPR, cancellazione, CRUD risorse) con userId, companyId, azione, IP, timestamp (`src/lib/audit.ts`). Fallback su file in caso di errore DB |
| **Registrazione consenso** | Implementata | Log server-side del consenso cookie con versioning della policy, supporto utenti anonimi, granularita per finalita (essenziale/analytics/marketing) |

#### Sicurezza Applicativa

| Misura | Stato | Dettaglio implementativo |
|--------|-------|------------------------|
| **Circuit breaker** | Implementato | Protezione contro guasti a cascata nelle chiamate a provider AI (`src/lib/circuit-breaker.ts`) |
| **SQL injection prevention** | Implementata | Query parametrizzate tramite Prisma ORM; protezione aggiuntiva per query dinamiche generate dagli agenti AI |
| **Connection pooling** | Implementato | Pool connessioni PostgreSQL con limiti configurabili (20 connessioni, 10s timeout) |

### 6.2 Misure organizzative

| Misura | Stato | Azione richiesta |
|--------|-------|-----------------|
| Nomina DPO (se applicabile) | _[DA VERIFICARE]_ | Valutare obbligo Art. 37 GDPR |
| Formazione dipendenti sulla protezione dati | _[DA IMPLEMENTARE]_ | Pianificare formazione periodica |
| Procedura di notifica data breach (Art. 33-34) | _[VEDI docs/NIS2-INCIDENT-RESPONSE.md]_ | Verificare e aggiornare la procedura |
| Registro dei data breach | _[DA IMPLEMENTARE]_ | Predisporre registro conforme Art. 33(5) |
| DPIA per trattamenti ad alto rischio | _[DA EFFETTUARE]_ | Effettuare DPIA per lead generation e profilazione AI |
| Accordi di riservatezza con il personale | _[DA VERIFICARE]_ | Verificare clausole nei contratti di lavoro |
| Procedura di gestione diritti interessati | _[PARZIALMENTE IMPLEMENTATA]_ | Endpoint tecnici implementati; formalizzare la procedura organizzativa |
| Piano di business continuity | _[VEDI docs/NIS2-BUSINESS-CONTINUITY.md]_ | Verificare e aggiornare |
| Politica di backup | _[DA DOCUMENTARE]_ | Documentare frequenza, retention, test di ripristino |

---

## 7. Riepilogo Policy di Conservazione dei Dati

| Categoria di dati | Periodo di conservazione | Meccanismo |
|-------------------|------------------------|------------|
| Audit log | 2 anni (730 giorni) | Cron job `retention-cleanup` |
| Conversazioni agenti AI | 1 anno (365 giorni) | Cron job `retention-cleanup` |
| Conversazioni Super Agent | 1 anno (365 giorni) | Cron job `retention-cleanup` |
| Conversazioni Lead Generator | 1 anno (365 giorni) | Cron job `retention-cleanup` |
| Esecuzioni task schedulati | 1 anno (365 giorni) | Cron job `retention-cleanup` |
| Trigger log | 1 anno (365 giorni) | Cron job `retention-cleanup` |
| Cache preview nodi | 30 giorni | Cron job `retention-cleanup` |
| Sessioni scadute | Immediato alla scadenza | Cron job `retention-cleanup` |
| Token di verifica scaduti | Immediato alla scadenza | Cron job `retention-cleanup` |
| Token reset password scaduti | Immediato alla scadenza | Cron job `retention-cleanup` |
| Dati account utente | Fino a richiesta cancellazione (Art. 17) | Endpoint GDPR delete |
| Lead e dati CRM | Durata rapporto contrattuale | Manuale / su richiesta |
| File caricati (data lake) | Durata rapporto contrattuale | Manuale / su richiesta |
| Dati abbonamento | Durata contrattuale + obblighi fiscali (10 anni) | Manuale |

---

## 8. Storico Revisioni

| Versione | Data | Autore | Modifiche |
|----------|------|--------|-----------|
| 1.0 | 2026-04-23 | _[INSERIRE]_ | Prima redazione del registro |

---

## 9. Approvazione

| Ruolo | Nome | Firma | Data |
|-------|------|-------|------|
| Titolare del trattamento | _[INSERIRE]_ | _______________ | ____________ |
| DPO (se nominato) | _[INSERIRE]_ | _______________ | ____________ |
| Responsabile IT | _[INSERIRE]_ | _______________ | ____________ |

---

> **Nota legale**: questo registro e redatto sulla base dell'analisi tecnica del codice sorgente dell'applicazione FridAI. Le informazioni relative a misure organizzative, basi giuridiche e accordi contrattuali devono essere verificate e completate dal Titolare del trattamento e/o dal DPO. Il registro deve essere aggiornato a ogni modifica significativa dei trattamenti e deve essere messo a disposizione dell'Autorita Garante su richiesta (Art. 30(4) GDPR).
