# Piano Annuale di Formazione Cybersecurity

**NIS2 – Direttiva (UE) 2022/2555, Art. 20**

Anno di riferimento: 2026
Versione: 1.0
Responsabile: ____________
Data approvazione: ____________

---

## 1. Obiettivi

Il presente piano definisce il programma di formazione in materia di cybersecurity in conformità all'Art. 20 della Direttiva NIS2, che richiede che gli organi di gestione e i dipendenti ricevano una formazione adeguata per identificare i rischi e valutare le pratiche di gestione del rischio di cybersecurity.

---

## 2. Destinatari

| Gruppo | Descrizione | Frequenza formazione |
|--------|-------------|---------------------|
| Tutti i dipendenti | Personale aziendale con accesso a sistemi informatici | Annuale |
| Amministratori di sistema | Personale con privilegi amministrativi | Trimestrale |
| Sviluppatori (Dev) | Team di sviluppo software | Trimestrale |
| Management / Organi di gestione | Dirigenti e responsabili (Art. 20(2) NIS2) | Semestrale |
| Nuovi assunti | Personale in fase di onboarding | Entro 30 giorni dall'assunzione |

---

## 3. Moduli formativi

### Modulo 1 – Phishing Awareness
**Target**: Tutti i dipendenti
**Frequenza**: Annuale + simulazioni trimestrali
**Contenuti**:
- Riconoscimento email di phishing e spear phishing
- Social engineering e pretexting
- Segnalazione tentativi sospetti
- Simulazioni pratiche con report risultati

### Modulo 2 – Password Hygiene e Autenticazione
**Target**: Tutti i dipendenti
**Frequenza**: Annuale
**Contenuti**:
- Politiche password aziendali
- Autenticazione multi-fattore (MFA/TOTP)
- Gestione credenziali e password manager
- Rischi del riutilizzo password

### Modulo 3 – Incident Reporting
**Target**: Tutti i dipendenti
**Frequenza**: Annuale
**Contenuti**:
- Procedura di segnalazione incidenti (NIS2 Art. 23)
- Tempistiche di notifica (24h early warning, 72h notification)
- Catena di escalation interna
- Cosa costituisce un "incidente significativo"

### Modulo 4 – Data Handling e GDPR
**Target**: Tutti i dipendenti
**Frequenza**: Annuale
**Contenuti**:
- Classificazione dei dati (pubblico, interno, riservato, strettamente riservato)
- Trattamento dati personali e GDPR
- Trasferimento sicuro dei dati
- Cancellazione e retention policy

### Modulo 5 – AI Security
**Target**: Sviluppatori, Amministratori
**Frequenza**: Trimestrale
**Contenuti**:
- Rischi specifici dei sistemi AI (prompt injection, data poisoning)
- PII redaction e minimizzazione dati verso modelli AI
- Validazione output AI
- Conformità AI Act (Reg. UE 2024/1689)
- Sicurezza delle API verso provider AI esterni

### Modulo 6 – Sicurezza applicativa (per sviluppatori)
**Target**: Sviluppatori
**Frequenza**: Trimestrale
**Contenuti**:
- OWASP Top 10
- Secure coding practices
- Gestione dipendenze e vulnerabilità (npm audit, SAST)
- Code review orientata alla sicurezza
- Gestione secrets e variabili d'ambiente

### Modulo 7 – Gestione accessi e privilegi (per admin)
**Target**: Amministratori di sistema
**Frequenza**: Trimestrale
**Contenuti**:
- Principio del minimo privilegio
- Revisione periodica degli accessi
- Logging e monitoraggio accessi privilegiati
- Hardening dei sistemi

---

## 4. Calendario formativo 2026

| Trimestre | Moduli | Target |
|-----------|--------|--------|
| Q1 (Gen-Mar) | Moduli 1, 2, 3, 4 (sessione annuale completa) | Tutti |
| Q1 (Gen-Mar) | Moduli 5, 6, 7 | Dev, Admin |
| Q2 (Apr-Giu) | Simulazione phishing + Moduli 5, 6, 7 | Tutti (sim.) / Dev, Admin (moduli) |
| Q3 (Lug-Set) | Simulazione phishing + Moduli 5, 6, 7 | Tutti (sim.) / Dev, Admin (moduli) |
| Q4 (Ott-Dic) | Simulazione phishing + Moduli 5, 6, 7 + Riepilogo annuale | Tutti (sim.) / Dev, Admin (moduli) |

---

## 5. Verifica dell'apprendimento

Ogni modulo formativo prevede una verifica tramite quiz post-formazione:

| Parametro | Valore |
|-----------|--------|
| Tipo | Quiz a risposta multipla |
| Numero domande | 10-15 per modulo |
| Soglia superamento | 80% risposte corrette |
| Tentativi | Massimo 3 |
| In caso di mancato superamento | Ripetizione del modulo entro 15 giorni |

---

## 6. Registro presenze e completamento

| Data | Cognome | Nome | Reparto | Modulo | Completato | Score quiz | Firma |
|------|---------|------|---------|--------|------------|------------|-------|
| ______ | ______ | ______ | ______ | ______ | [ ] Si [ ] No | ______% | ______ |
| ______ | ______ | ______ | ______ | ______ | [ ] Si [ ] No | ______% | ______ |
| ______ | ______ | ______ | ______ | ______ | [ ] Si [ ] No | ______% | ______ |
| ______ | ______ | ______ | ______ | ______ | [ ] Si [ ] No | ______% | ______ |
| ______ | ______ | ______ | ______ | ______ | [ ] Si [ ] No | ______% | ______ |

---

## 7. KPI di formazione

| KPI | Target | Frequenza misurazione |
|-----|--------|----------------------|
| % completamento formazione annuale (tutti) | >= 95% | Trimestrale |
| % completamento formazione trimestrale (dev/admin) | >= 90% | Trimestrale |
| Score medio quiz post-formazione | >= 85% | Per sessione |
| % dipendenti che superano il quiz al primo tentativo | >= 75% | Per sessione |
| Tasso di click su simulazioni phishing | <= 5% | Trimestrale |
| Tempo medio di segnalazione incidente simulato | <= 15 minuti | Trimestrale |
| Nuovi assunti formati entro 30 giorni | 100% | Mensile |

---

## 8. Responsabilità

| Ruolo | Responsabilità |
|-------|---------------|
| CISO / Responsabile sicurezza | Approvazione piano, supervisione esecuzione |
| HR | Coordinamento logistico, monitoraggio completamento |
| DPO | Contenuti modulo GDPR, verifica conformità |
| Team Lead Dev | Contenuti moduli tecnici, partecipazione dev |
| Amministratore IT | Contenuti moduli admin, gestione piattaforma e-learning |

---

## 9. Approvazione

| Campo | Valore |
|-------|--------|
| Approvato da | ____________ |
| Ruolo | ____________ |
| Data | ____________ |
| Firma | ____________ |

---

*Piano redatto in conformità all'Art. 20 della Direttiva (UE) 2022/2555 (NIS2). Da revisionare e aggiornare annualmente.*
