# Valutazione del Rischio NIS2 — FridAI (LikeAiSaid)

**Versione:** 1.0
**Data:** 2026-04-23
**Responsabile:** Security Lead
**Prossima revisione:** 2026-10-23
**Classificazione:** Riservato — uso interno

---

## 1. Ambito e contesto

### 1.1 Descrizione dell'applicazione

FridAI (denominazione tecnica: LikeAiSaid / RuleSage) e un **Business Rules Engine SaaS multi-tenant** che consente agli utenti di creare alberi decisionali a partire dal linguaggio naturale, interrogarli interattivamente con assistenza AI, ed eseguire analisi dati tramite agenti SQL e Python.

### 1.2 Settore di riferimento

L'applicazione opera nel settore dei **servizi digitali e infrastrutture ICT** fornendo:
- Automazione di processi decisionali aziendali
- Elaborazione dati tramite agenti AI (generazione query SQL, esecuzione codice Python)
- Integrazione con basi dati aziendali contenenti dati operativi e potenzialmente personali
- Schedulazione automatica di pipeline di elaborazione dati

### 1.3 Applicabilita della Direttiva NIS2

FridAI rientra nell'ambito di applicazione della Direttiva (UE) 2022/2555 (NIS2) in quanto:

1. **Fornitore di servizi digitali** (Allegato II, punto 8): piattaforma SaaS che eroga servizi di cloud computing e gestione dati a soggetti terzi
2. **Trattamento dati multi-tenant**: gestione di dati aziendali di piu organizzazioni con obbligo di isolamento
3. **Integrazione AI con accesso a dati sensibili**: agenti AI che generano ed eseguono query SQL su database aziendali
4. **Automazione critica**: pipeline schedulate che operano su dati di business in modalita non presidiata

L'autorita nazionale competente e l'**ACN (Agenzia per la Cybersicurezza Nazionale)** — https://www.acn.gov.it

### 1.4 Perimetro della valutazione

La presente valutazione copre tutti i componenti dell'ecosistema FridAI:
- Applicazione web Next.js (frontend e API)
- Database PostgreSQL
- Backend Python (Flask)
- Servizio scheduler
- Integrazioni con provider AI esterni (OpenAI, Google Gemini, OpenRouter)
- Infrastruttura di deployment (Vercel, Docker, storage)

---

## 2. Inventario asset

| # | Asset | Tipo | Criticita | Ubicazione | Responsabile |
|---|-------|------|-----------|------------|--------------|
| A-01 | Applicazione Next.js 15 | Software — Frontend/API | **Critica** | Vercel / Docker (container `rulesage-app`, porta 9002) | Engineering Team |
| A-02 | Database PostgreSQL 15 | Dati — Database relazionale | **Critica** | Docker (container `rulesage-db`, porta 5432, bind su 127.0.0.1), volume `rulesage-db-data` | Database Admin |
| A-03 | Backend Python Flask | Software — Servizio di elaborazione | **Alta** | Docker (container `rulesage-python`, porta 5005, 4 worker Gunicorn) | Engineering Team |
| A-04 | Servizio Scheduler | Software — Automazione | **Alta** | Docker (container `rulesage-scheduler`, porta 3001, profilo opzionale) | Engineering Team |
| A-05 | Provider AI — OpenAI / OpenRouter | Servizio esterno — API AI | **Alta** | Cloud esterno (API key in variabili d'ambiente) | CTO |
| A-06 | Provider AI — Google Gemini (Genkit) | Servizio esterno — API AI | **Alta** | Cloud esterno (API key in variabili d'ambiente) | CTO |
| A-07 | File Storage (uploads, data lake) | Dati — Object storage | **Media** | Volume Docker `data_lake`, cloud object storage | DevOps |
| A-08 | Preview Cache (DuckDB) | Dati — Cache locale | **Media** | Volume Docker `preview_cache_data` condiviso tra app e scheduler | Engineering Team |
| A-09 | Repository Git (GitHub) | Software — Codice sorgente | **Critica** | GitHub (con mirror secondario) | Engineering Team |
| A-10 | Secrets / Variabili d'ambiente | Credenziali | **Critica** | Vercel env vars, `.env` locale, password manager vault | Security Lead |
| A-11 | Rete Docker interna | Infrastruttura — Rete | **Alta** | Bridge network `rulesage-network` (subnet 172.28.0.0/16) | DevOps |
| A-12 | Server MCP (Model Context Protocol) | Software — Interfaccia AI | **Media** | Integrato nell'applicazione Next.js (`src/mcp/server.ts`) | Engineering Team |
| A-13 | Sistema di autenticazione (NextAuth.js) | Software — Sicurezza | **Critica** | Integrato nell'applicazione Next.js, JWT con sessioni multi-tenant | Security Lead |
| A-14 | ORM Prisma | Software — Accesso dati | **Alta** | Integrato nell'applicazione Next.js, schema in `prisma/schema.prisma` | Engineering Team |

---

## 3. Identificazione minacce

| ID | Minaccia | Categoria | Probabilita | Impatto | Rischio |
|----|----------|-----------|-------------|---------|---------|
| T-01 | **Data breach — accesso non autorizzato ai dati tenant** | Violazione dati | Alta | Critico | **Critico** |
| T-02 | **SQL injection tramite agenti AI** | Iniezione codice | Alta | Critico | **Critico** |
| T-03 | **Esecuzione di codice arbitrario via agente Python** | Esecuzione remota | Alta | Critico | **Critico** |
| T-04 | **Cross-tenant data leakage** (isolamento multi-tenant insufficiente) | Violazione dati | Alta | Critico | **Critico** |
| T-05 | **Manipolazione AI / Prompt injection** | Manipolazione input | Media | Alto | **Alto** |
| T-06 | **Compromissione supply chain** (dipendenze npm/PyPI malevole) | Supply chain | Media | Alto | **Alto** |
| T-07 | **Furto di credenziali API** (chiavi AI provider, DB, SMTP) | Furto credenziali | Media | Alto | **Alto** |
| T-08 | **Ransomware / cifratura del database** | Malware | Bassa | Critico | **Alto** |
| T-09 | **DDoS sull'applicazione web** | Disponibilita | Media | Medio | **Medio** |
| T-10 | **Insider threat** (utente interno con accesso privilegiato) | Minaccia interna | Bassa | Alto | **Medio** |
| T-11 | **Account takeover** tramite credential stuffing o password deboli | Autenticazione | Media | Alto | **Alto** |
| T-12 | **Esposizione PII verso provider AI** | Privacy | Alta | Medio | **Alto** |
| T-13 | **Man-in-the-middle** su comunicazioni interne | Intercettazione | Bassa | Alto | **Medio** |
| T-14 | **Indisponibilita provider AI esterno** | Disponibilita | Media | Medio | **Medio** |
| T-15 | **Escalation di privilegi** (utente → admin → superadmin) | Autenticazione | Bassa | Critico | **Alto** |

**Legenda probabilita:** Bassa (<10%/anno), Media (10-50%/anno), Alta (>50%/anno)
**Legenda impatto:** Basso (operativo limitato), Medio (interruzione parziale), Alto (interruzione significativa + dati), Critico (compromissione completa + regolamentare)
**Matrice rischio:** Probabilita x Impatto

---

## 4. Valutazione vulnerabilita

Risultati dell'audit di sicurezza condotto il 14 aprile 2026 su 42 route API, branch `AGENT2.0`.

### 4.1 Vulnerabilita critiche

| ID | Vulnerabilita | File | Stato | Minaccia correlata |
|----|---------------|------|-------|--------------------|
| C-01 | Token di reset password hardcoded ("1230") — consente account takeover | `src/actions/reset-password.ts:44` | **Mitigato** (fase 1 hardening) | T-11 |
| C-02 | SQL injection via proxy mode — query raw dal body della richiesta | `src/app/api/update-commessa/route.ts:158-189` | **Mitigato** (SQL guard, fase 3) | T-02 |
| C-05 | 8 endpoint senza autenticazione (`/api/trees`, `/api/upload`, `/api/files`, ecc.) | Vari | **Mitigato** (fase 1 hardening) | T-01, T-04 |

### 4.2 Vulnerabilita ad alto rischio

| ID | Vulnerabilita | File | Stato | Minaccia correlata |
|----|---------------|------|-------|--------------------|
| C-03 | Chiavi API in chiaro nel database (openRouterApiKey, Connector.config) | `prisma/schema.prisma` | **In corso** — cifratura AES-256-GCM pianificata | T-07 |
| C-04 | Chiavi API inviate al client via getOpenRouterSettingsAction | `src/actions/openrouter.ts:46` | **In corso** | T-07 |
| H-04 | TLS disabilitato (rejectUnauthorized: false) in 7 punti | `src/lib/mail.ts`, `src/app/actions/connectors.ts` | **In corso** | T-13 |
| H-06 | Endpoint execute-sql/execute-python con auth ma senza filtro companyId | `src/app/api/internal/execute-*` | **Mitigato** (fase 3, access control) | T-04 |
| H-07 | MCP-tool accetta companyId dal chiamante, secret di default debole | `src/app/api/internal/mcp-tool/route.ts` | **Mitigato** (fase 3) | T-04, T-15 |

### 4.3 Vulnerabilita a rischio medio

| ID | Vulnerabilita | File | Stato | Minaccia correlata |
|----|---------------|------|-------|--------------------|
| M-01 | PII nei log (email, token di reset, query SQL) | `src/lib/mail.ts`, `src/actions/reset-password.ts` | **Aperto** | T-12 |
| M-02 | Policy password debole (min 6 caratteri, nessuna complessita) | `src/actions/reset-password.ts:21` | **Aperto** | T-11 |
| M-03 | Credenziali connector in JSON plaintext | `prisma/schema.prisma` (model Connector) | **In corso** | T-07 |
| M-04 | JWT senza maxAge esplicito (default 30 giorni) | `src/lib/auth.ts` | **Aperto** | T-11 |
| M-05 | CORS origin === 'null' su update-commessa | `src/app/api/update-commessa/route.ts` | **Mitigato** (fase 3) | T-01 |
| M-06 | Nessun rate limiting su alcun endpoint | Globale | **In corso** — rate limiter implementato (fase 2) | T-09, T-11 |

### 4.4 Vulnerabilita a basso rischio

| ID | Vulnerabilita | File | Stato | Minaccia correlata |
|----|---------------|------|-------|--------------------|
| L-01 | Fallback SMTP logga email completa + link di reset | `src/lib/mail.ts:162` | **Aperto** | T-12 |
| L-02 | MCP server accetta API key come parametro del tool | `src/mcp/server.ts:74` | **Aperto** | T-07 |
| L-03 | Endpoint claude-cli/status espone versione CLI senza auth | `src/app/api/claude-cli/status/route.ts` | **Aperto** | T-10 |

### 4.5 Riepilogo stato vulnerabilita

| Stato | Critico | Alto | Medio | Basso | Totale |
|-------|---------|------|-------|-------|--------|
| **Risolto / Mitigato** | 3 | 2 | 1 | 0 | **6** |
| **In corso** | 0 | 2 | 2 | 0 | **4** |
| **Aperto** | 0 | 0 | 3 | 3 | **6** |
| **Totale** | 3 | 4 | 6 | 3 | **16** |

### 4.6 Interventi di hardening completati

Le seguenti misure di hardening sono state implementate nelle fasi 1-3 (commit `6b1c0f30`, `248b4f4e`, `dc9fa0bf`, `6327ca4e`):

1. **Fase 1 — Correzione 8 vulnerabilita** dall'audit completo
2. **Fase 2 — CSP nonce, indici DB, I/O asincrono, timeout AI, persistenza scheduler**
3. **Fase 3 — Logging strutturato, SQL guard, limiti risorse Docker, resilienza audit, controllo accessi**
4. **MFA/TOTP — Suite di test, pipeline CI, documentazione conformita NIS2**

---

## 5. Controlli implementati

Mappatura ai requisiti dell'Art. 21(2) della Direttiva NIS2.

### a) Politiche di analisi dei rischi e di sicurezza dei sistemi informatici

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Valutazione del rischio formalizzata | **Implementato** | Il presente documento |
| Revisione periodica (semestrale) | **Implementato** | Prossima revisione: 2026-10-23 |
| Classificazione degli asset | **Implementato** | Sezione 2 del presente documento |
| Registro delle minacce | **Implementato** | Sezione 3 del presente documento |

### b) Gestione degli incidenti

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Piano di risposta agli incidenti | **Implementato** | [`docs/NIS2-INCIDENT-RESPONSE.md`](../NIS2-INCIDENT-RESPONSE.md) |
| Classificazione incidenti (P1-P4) | **Implementato** | Sezione 2 del piano IR |
| Timeline di notifica 72h (Art. 23 NIS2) | **Implementato** | Sezione 3 del piano IR |
| Conservazione delle prove | **Implementato** | Sezione 5 del piano IR |
| Revisione post-incidente | **Implementato** | Sezione 7 del piano IR |
| Contatto CSIRT nazionale (ACN) | **Implementato** | Appendice del piano IR |

### c) Continuita operativa e gestione delle crisi

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Piano di continuita operativa | **Implementato** | [`docs/NIS2-BUSINESS-CONTINUITY.md`](../NIS2-BUSINESS-CONTINUITY.md) |
| RPO/RTO definiti per ogni sistema | **Implementato** | Sezione 1 del piano BCP |
| Strategia di backup (DB, codice, secret, file) | **Implementato** | Sezione 2 del piano BCP |
| Procedure di recovery documentate | **Implementato** | Sezione 3 del piano BCP |
| Piano di failover | **Implementato** | Sezione 4 del piano BCP |
| Test annuale di DR | **Implementato** | Sezione 5 del piano BCP (trimestrale) |

### d) Sicurezza della catena di approvvigionamento

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Audit dipendenze npm | **Implementato** | `npm audit` nella pipeline CI |
| Dipendenze Python verificate | **Parziale** | `pip audit` da integrare nella CI |
| Lockfile utilizzati (package-lock.json) | **Implementato** | `npm ci` in CI e Docker build |
| Valutazione provider AI esterni | **Parziale** | Contratti e DPA da formalizzare con OpenAI, Google, OpenRouter |
| Monitoraggio CVE dipendenze | **In corso** | Dependabot/Renovate da attivare |

### e) Sicurezza nell'acquisizione, sviluppo e manutenzione dei sistemi

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Pipeline CI/CD con controlli di sicurezza | **Implementato** | `.github/workflows/ci.yml` — lint, typecheck, test, build |
| Code review obbligatoria | **Implementato** | Branch protection su `main` |
| Type safety (TypeScript strict) | **Implementato** | `tsconfig.json`, `npm run typecheck` |
| Validazione input ai confini del sistema | **Parziale** | Server Actions con validazione, alcune route API da completare |
| Scan sicurezza automatizzato | **In corso** | Semgrep, gitleaks da integrare |

### f) Politiche e procedure per valutare l'efficacia delle misure

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Audit trail delle azioni di sistema | **Implementato** | Modello `AuditLog` in Prisma, logging strutturato (fase 3) |
| Monitoraggio integrita | **Parziale** | Healthcheck Docker su tutti i servizi |
| Revisione periodica dei controlli | **Implementato** | Cadenza semestrale (presente documento) |
| Test di penetrazione | **Da pianificare** | Primo pen-test esterno da schedulare entro Q3 2026 |

### g) Pratiche di igiene informatica e formazione in materia di cybersicurezza

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Programma di formazione cybersecurity | **DA IMPLEMENTARE** | Piano di formazione da definire |
| Linee guida per la gestione delle password | **Parziale** | Policy attuale debole (min 6 caratteri) — da rafforzare |
| Awareness su phishing e social engineering | **DA IMPLEMENTARE** | Sessioni periodiche da pianificare |
| Procedure di onboarding sicuro | **DA IMPLEMENTARE** | Checklist di sicurezza per nuovi sviluppatori |

### h) Politiche e procedure relative all'uso della crittografia

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| Cifratura dati at rest (database) | **Implementato** | Backup cifrati AES-256, volume PostgreSQL |
| Cifratura dati in transito (TLS) | **Parziale** | HTTPS su Vercel; `rejectUnauthorized: false` in 7 punti (H-04) |
| Cifratura credenziali in DB | **In corso** | AES-256-GCM pianificato per chiavi API (C-03) |
| Hashing password | **Implementato** | bcrypt via NextAuth.js |
| Gestione chiavi crittografiche | **Parziale** | Variabili d'ambiente; migrazione a Doppler/Vault pianificata |

### i) Sicurezza delle risorse umane, controllo degli accessi e gestione degli asset

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| RBAC (Role-Based Access Control) | **Implementato** | Ruoli `user`, `admin`, `superadmin` nel modello `User` |
| Isolamento multi-tenant | **Implementato** | Filtro `companyId` su tutte le query Prisma |
| Middleware di protezione rotte | **Implementato** | `src/middleware.ts` protegge tutte le rotte |
| Sessioni JWT con scoping azienda | **Implementato** | `session.user.companyId` in ogni sessione |
| Principio del minimo privilegio | **Parziale** | Da rafforzare per accessi scheduler e MCP |

### j) Autenticazione a piu fattori o autenticazione continua

| Controllo | Stato | Evidenza |
|-----------|-------|----------|
| MFA/TOTP implementato | **Implementato** | TOTP con generazione QR, verifica a 6 cifre (commit `6327ca4e`) |
| MFA obbligatorio per admin | **Implementato** | Enforcement per ruoli `admin` e `superadmin` |
| Suite di test MFA | **Implementato** | Test unitari per generazione, verifica e enforcement |
| Backup codes | **Da valutare** | Codici di recovery da implementare come fallback |

---

## 6. Rischio residuo

Valutazione del rischio residuo dopo l'applicazione dei controlli implementati.

| ID | Minaccia | Rischio iniziale | Controlli applicati | Rischio residuo | Accettabilita |
|----|----------|-------------------|---------------------|-----------------|---------------|
| T-01 | Data breach | **Critico** | Auth su tutti gli endpoint (C-05 risolto), RBAC, middleware, isolamento tenant | **Medio** | Accettabile con monitoraggio |
| T-02 | SQL injection via AI | **Critico** | SQL guard (fase 3), validazione query, parametrizzazione | **Basso** | Accettabile |
| T-03 | Esecuzione codice arbitrario Python | **Critico** | Token auth backend Python, limiti risorse Docker (2GB RAM, 1.5 CPU), timeout Gunicorn 600s, policy AST, timeout applicativo `PYTHON_EXEC_TIMEOUT_SECONDS`, container hardening (`no-new-privileges`, `cap_drop: ALL`, `pids_limit`, tmpfs `/tmp` noexec) | **Medio-Basso** | Accettabile; valutare nsjail/Firecracker per isolamento multi-tenant ad alto rischio |
| T-04 | Cross-tenant leakage | **Critico** | Filtro companyId, rimozione system-override (in corso), access control (fase 3) | **Medio** | Accettabile a condizione di completare remediation 1.1 |
| T-05 | Prompt injection / AI manipulation | **Alto** | PII redaction middleware, validazione input | **Medio** | Accettabile — monitorare evoluzione minaccia |
| T-06 | Supply chain compromise | **Alto** | npm audit in CI, lockfile, build riproducibili, SBOM CycloneDX, Dependabot settimanale | **Basso** | Accettabile con monitoraggio CVE continuo |
| T-07 | Furto credenziali API | **Alto** | Variabili d'ambiente (non in codice), token interno Python backend | **Medio** | Ridurre a Basso con cifratura DB (C-03) |
| T-08 | Ransomware | **Alto** | Backup giornalieri cifrati, WAL continuo, RPO 1h, cross-region replica | **Basso** | Accettabile |
| T-09 | DDoS | **Medio** | Rate limiting (in corso), Vercel auto-scaling, Cloudflare DNS | **Basso** | Accettabile |
| T-10 | Insider threat | **Medio** | RBAC, audit log, MFA per admin | **Basso** | Accettabile |
| T-11 | Account takeover | **Alto** | MFA/TOTP, token reset corretto (C-01 risolto), JWT | **Medio** | Ridurre a Basso con policy password piu forte (M-02) |
| T-12 | Esposizione PII verso AI | **Alto** | PII redaction automatico (gateway AI in corso) | **Medio** | Ridurre a Basso completando gateway centralizzato |
| T-13 | Man-in-the-middle | **Medio** | TLS su Vercel, rete Docker isolata | **Medio** | Ridurre a Basso risolvendo H-04 (rejectUnauthorized) |
| T-14 | Indisponibilita provider AI | **Medio** | Multi-provider (OpenAI + Gemini + OpenRouter), fallback | **Basso** | Accettabile |
| T-15 | Escalation di privilegi | **Alto** | RBAC, MCP secret corretto (H-07 mitigato), session scoping | **Basso** | Accettabile |

### 6.1 Distribuzione rischio residuo

| Livello rischio residuo | Conteggio | Percentuale |
|--------------------------|-----------|-------------|
| **Basso** | 6 | 40% |
| **Medio** | 9 | 60% |
| **Alto** | 0 | 0% |
| **Critico** | 0 | 0% |

**Valutazione complessiva:** Il profilo di rischio residuo e **accettabile** a condizione che le azioni del piano di trattamento (sezione 7) vengano completate entro le scadenze indicate. Nessun rischio residuo critico o alto rimane aperto.

---

## 7. Piano di trattamento

### 7.1 Azioni immediate (entro 30 giorni — maggio 2026)

| # | Azione | Rischio trattato | Responsabile | Scadenza | Stato |
|---|--------|------------------|--------------|----------|-------|
| PT-01 | Completare rimozione `_bypassAuth` / `system-override` per isolamento tenant definitivo | T-04 | Engineering Team | 2026-05-07 | In corso |
| PT-02 | Cifratura AES-256-GCM per chiavi API in database (C-03, M-03) | T-07 | Security Lead | 2026-05-15 | In corso |
| PT-03 | Rimuovere invio chiavi API al client (C-04) | T-07 | Engineering Team | 2026-05-15 | In corso |
| PT-04 | Rafforzare policy password (min 12 caratteri, complessita) (M-02) | T-11 | Engineering Team | 2026-05-10 | Aperto |
| PT-05 | Impostare maxAge esplicito su JWT (M-04) | T-11 | Engineering Team | 2026-05-10 | Aperto |

### 7.2 Azioni a breve termine (entro 90 giorni — luglio 2026)

| # | Azione | Rischio trattato | Responsabile | Scadenza | Stato |
|---|--------|------------------|--------------|----------|-------|
| PT-06 | Riabilitare TLS verification (`rejectUnauthorized: true`) in tutti i punti (H-04) | T-13 | Engineering Team | 2026-06-15 | Aperto |
| PT-07 | Completare gateway AI centralizzato con PII redaction automatico | T-12 | Engineering Team | 2026-06-30 | In corso |
| PT-08 | Rimuovere PII dai log applicativi (M-01, L-01) | T-12 | Engineering Team | 2026-06-15 | Aperto |
| PT-09 | Attivare Dependabot/Renovate per monitoraggio CVE dipendenze | T-06 | DevOps | 2026-05-30 | Completato |
| PT-10 | Integrare `pip audit` nella pipeline CI per dipendenze Python | T-06 | DevOps | 2026-05-30 | Aperto |
| PT-11 | Implementare sandboxing aggiuntivo per esecuzione codice Python (container isolato, nsjail) | T-03 | DevOps | 2026-07-15 | Parzialmente completato: hardening Docker + timeout + policy AST; nsjail/Firecracker da valutare |
| PT-12 | Formalizzare DPA (Data Processing Agreement) con provider AI | T-05, T-12 | Legal / DPO | 2026-07-15 | Aperto |

### 7.3 Azioni a medio termine (entro 180 giorni — ottobre 2026)

| # | Azione | Rischio trattato | Responsabile | Scadenza | Stato |
|---|--------|------------------|--------------|----------|-------|
| PT-13 | Definire e avviare programma di formazione cybersecurity (Art. 21.2.g) | T-10, T-11 | HR / Security Lead | 2026-08-31 | Aperto |
| PT-14 | Primo penetration test esterno | Tutti | CTO | 2026-09-30 | Aperto |
| PT-15 | Migrazione gestione secret a Doppler o HashiCorp Vault | T-07 | DevOps | 2026-09-30 | Aperto |
| PT-16 | Implementare backup codes per MFA | T-11 | Engineering Team | 2026-08-31 | Aperto |
| PT-17 | Implementare OpenTelemetry APM per tracciabilita end-to-end | T-01, T-10 | Engineering Team | 2026-10-15 | Aperto |
| PT-18 | Integrare Semgrep e gitleaks nella pipeline CI | T-02, T-07 | DevOps | 2026-08-31 | Aperto |

### 7.4 Timeline visiva

```
Mag 2026  |====== PT-01, PT-02, PT-03, PT-04, PT-05 ======|
Giu 2026  |====== PT-06, PT-08, PT-09, PT-10 =============|
Lug 2026  |====== PT-07, PT-11, PT-12 ====================|
Ago 2026  |====== PT-13, PT-16, PT-18 ====================|
Set 2026  |====== PT-14, PT-15 ============================|
Ott 2026  |====== PT-17 + REVISIONE COMPLETA ==============|
```

---

## 8. Approvazione

Il presente documento di Valutazione del Rischio NIS2 e stato esaminato e approvato dai seguenti responsabili.

| Ruolo | Nome | Firma | Data |
|-------|------|-------|------|
| **CTO** | _________________________ | _________________________ | ____/____/________ |
| **Security Lead** | _________________________ | _________________________ | ____/____/________ |
| **DPO / Responsabile Privacy** | _________________________ | _________________________ | ____/____/________ |
| **Amministratore Delegato** | _________________________ | _________________________ | ____/____/________ |

### Storico delle revisioni

| Versione | Data | Autore | Modifiche |
|----------|------|--------|-----------|
| 1.0 | 2026-04-23 | Security Lead | Prima emissione |
| | | | |

---

*Documento redatto in conformita alla Direttiva (UE) 2022/2555 (NIS2), Art. 21 — Misure di gestione dei rischi di cybersicurezza.*
*Prossima revisione programmata: 2026-10-23.*
