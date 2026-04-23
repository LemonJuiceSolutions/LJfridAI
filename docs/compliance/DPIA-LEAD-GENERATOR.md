# DPIA – Lead Generator

**Data Protection Impact Assessment (GDPR Art. 35)**

Data: ____________
Versione: 1.0
Responsabile: ____________

---

## 1. Descrizione del trattamento

Il modulo Lead Generator raccoglie i seguenti dati personali di contatti B2B:

- Nome e cognome
- Indirizzo email professionale
- Numero di telefono
- Ruolo aziendale
- Nome azienda
- Profilo LinkedIn

**Fonti dei dati**: fonti esterne pubblicamente accessibili tramite web scraping via API.

**Modello AI utilizzato**: gemini-2.0-flash-001 via OpenRouter (provider terzo, server extra-UE).

**Finalità del trattamento**: generazione di contatti commerciali B2B (prospecting).

**Volume stimato**: ____________ contatti/mese.

---

## 2. Necessità e proporzionalità

| Criterio | Valutazione |
|----------|-------------|
| Base giuridica | Legittimo interesse (Art. 6(1)(f) GDPR) per attività di B2B prospecting |
| Minimizzazione dei dati | Solo dati professionali raccolti; nessun dato sensibile (Art. 9) trattato |
| Periodo di conservazione | 12 mesi dalla raccolta, poi cancellazione automatica |
| Limitazione della finalità | Dati utilizzati esclusivamente per contatto commerciale B2B |
| Test di bilanciamento (LIA) | Documentato separatamente – interesse legittimo prevalente per dati professionali pubblici |

---

## 3. Rischi per i diritti e le libertà degli interessati

| Rischio | Probabilità | Gravità | Livello |
|---------|-------------|---------|---------|
| Profilazione non autorizzata | Media | Alto | **ALTO** |
| Dati inesatti generati da AI | Alta | Medio | **ALTO** |
| Mancata informativa agli interessati | Alta | Alto | **CRITICO** |
| Trasferimento dati extra-UE (OpenRouter) | Certa | Medio | **ALTO** |

---

## 4. Misure di mitigazione

| Rischio | Misura | Stato |
|---------|--------|-------|
| Profilazione non autorizzata | Limitazione del trattamento a solo contatto iniziale; nessun scoring automatizzato | [ ] Implementata |
| Dati inesatti da AI | PII redaction prima dell'invio al modello AI; verifica qualità dati post-generazione | [ ] Implementata |
| Mancata informativa | Informativa privacy inviata a ogni contatto generato entro 30 giorni (Art. 14) | [ ] Implementata |
| Mancata informativa | Meccanismo di opt-out facilmente accessibile in ogni comunicazione | [ ] Implementata |
| Trasferimento extra-UE | DPA (Data Processing Agreement) con provider AI conforme Art. 28; SCC in allegato | [ ] Implementata |
| Generale | Data quality verification manuale su campione del 10% | [ ] Implementata |
| Generale | Registro dei trattamenti aggiornato (Art. 30) | [ ] Implementata |

---

## 5. Parere del DPO

_Spazio riservato al parere del Data Protection Officer (Art. 35(2) GDPR)._

Data parere: ____________

Parere:

____________________________________________________________________________

____________________________________________________________________________

____________________________________________________________________________

Firma DPO: ____________

---

## 6. Decisione

| Campo | Valore |
|-------|--------|
| Decisione | [ ] Approvato [ ] Approvato con condizioni [ ] Respinto |
| Condizioni | ____________ |
| Data decisione | ____________ |
| Firma Titolare del trattamento | ____________ |

---

*Documento generato in conformità al GDPR Art. 35. Da revisionare annualmente o in caso di modifiche significative al trattamento.*
