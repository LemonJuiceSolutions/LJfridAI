# Mappatura Conti Economici (CE) — Riferimento per What-If Analysis

Questo file elenca tutti i **NumeroConto** del Conto Economico, raggruppati per voce CE.
Usa questi codici per definire le perturbazioni nella matrice what-if.

## Struttura del Conto Economico

| Voce CE | Acronimo | Tipo |
|---------|----------|------|
| Ricavi Netti di Vendita | RIC | Dato |
| Corrispettivi | CORR | Dato |
| Variazione magazzino PF | VARPF | Dato |
| Altri Ricavi | ALTRI | Dato |
| **Ricavi Totali** | — | KPI = RIC + CORR + VARPF + ALTRI |
| Consumi | ACQ | Dato |
| Lavorazioni esterne | LAV | Dato |
| Costo del personale diretto | DIR | Dato |
| **Margine di Contribuzione** | — | KPI = Ricavi Totali + ACQ + LAV + DIR |
| % Margine di Contribuzione | — | KPI % su Ricavi Totali |
| Altri costi di produzione | PRD | Dato |
| Costo del personale indiretto | PAY | Dato |
| Affitti | AFF | Dato |
| Costi generali, commerciali ed amm. | COSTI | Dato |
| **EBITDA** | — | KPI = Margine + PRD + PAY + AFF + COSTI |
| % EBITDA | — | KPI % su Ricavi Totali |
| Ammortamenti | AMM | Dato |
| Accantonamenti | ACC | Dato |
| **EBIT** | — | KPI = EBITDA + AMM + ACC |
| % EBIT | — | KPI % su Ricavi Totali |
| Gestione Finanziaria | FIN | Dato |
| Gestione Straordinaria | EXT | Dato |
| **EBT** | — | KPI = EBIT + FIN + EXT |
| Imposte | TAX | Dato |
| **Risultato d'esercizio** | — | KPI = EBT + TAX |

> **Nota**: `NetAmount = Credit − Debit`. I ricavi sono tipicamente positivi, i costi tipicamente negativi.
> Le perturbazioni `delta` traslano NetAmount e i bound CI; le perturbazioni `mult` scalano proporzionalmente.

---

## Conti per Voce CE

Ogni sezione mostra: `NumeroConto` | descrizione | centro di responsabilità (CdR)

### RIC — Ricavi Netti di Vendita (11 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 07011000 | VENDITE | Penazzi |
| 07011001 | VENDITE B2B | Penazzi |
| 07011002 | VENDITE MB | Penazzi |
| 07011003 | VENDITE BOTTEGHE ALTROMERCATO | Liviero |
| 07011004 | RICAVI DELLE VENDITE ALTRI | Liviero |
| 07011005 | RICAVI MASCHERINE | Direzionali |
| 07011007 | VENDITA TESSUTI | Penazzi |
| 07011008 | SERVIZI B2B | Liviero |
| 07011009 | RICAVI DA EVENTI ISTITUZIONALI | Liviero |
| 07011100 | RICAVI DA PRESTAZIONE SERVIZI | Liviero |
| 07051004 | RESI SU VENDITE | Liviero |

### CORR — Corrispettivi (1 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 07011200 | INCASSI PER CORRISPETTIVI | Liviero |

### VARPF — Variazione magazzino PF (3 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06061000 | Rimanenze iniziali Prodotti Finiti | Maestrello |
| 07021100 | RIMANENZE FINALI PRODOTTI FINITI | Maestrello |
| XXXX011 | Variazione magazzino PF | Maestrello |

### ALTRI — Altri Ricavi (18 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 07011104 | CONSULENZE PER MASCHERINE | Direzionali |
| 07051001 | SCONTI, RIBASSI E ABBUONI ATTIVI | Tornieri |
| 07051002 | ARROTONDAMENTI ATTIVI | Tornieri |
| 07051003 | DIFFERENZE DI CAMBIO ATTIVE | Tornieri |
| 07051005 | RIMBORSI SPESE VARI | Tornieri |
| 07051006 | RIMBORSI SPESE INCASSO | Tornieri |
| 07051008 | RIMBORSI SPESE DI SPEDIZIONE | Tornieri |
| 07051009 | INDENNIZZI ASSICURATIVI | Tornieri |
| 07051010 | OMAGGI ATTIVI | Tornieri |
| 07051011 | RICAVI E PROVENTI VARI | Valotto |
| 07051014 | RIMBORSI SPESE EVENTI | Valotto |
| 07052000 | RICAVI PER CONTRIBUTI IN CONTO  ESERCIZIO | Valotto |
| 07052001 | EROGAZIONI LIBERALI RICEVUTE | Valotto |
| 07052002 | CONTRIBUTI DE MINIMIS | Valotto |
| 07052004 | ALTRI RICAVI E PROVENTI | Valotto |
| 07052007 | RICAVI PROGETTO FSE | Valotto |
| XXXX012 | Altri Ricavi | Valotto |
| XXXX016 | SPONSORIZZAZIONI E RICAVI DA EVENTI | XXXX016 |

### ACQ — Consumi (23 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06011001 | ACQUISTO TESSUTI | Ramponi |
| 06011002 | ACQUISTO ACCESSORI | Ramponi |
| 06011003 | ACQUISTO ETICHETTE E CARTELLINI | Ramponi |
| 06011005 | IMBALLI GENERICI | Maestrello |
| 06011011 | ACQUISTI VARI | Ramponi |
| 06011013 | ACQUISTI DI ACCESSORI PER  MASCHERINE | Ramponi |
| 06011014 | ACQ. TESSUTI PER MASCHERINE | Ramponi |
| 06011015 | ACQUISTO ACCESSORI MASCHERINE  INVITALIA | Ramponi |
| 06011016 | Acq. tessuto masch. INVITALIA | Ramponi |
| 06011017 | IMBALLI MASCHERINE INVITALIA | Maestrello |
| 06011018 | ACQUISTO TESSUTO COMMERCIALIZZATO | Ramponi |
| 06011019 | ACQUISTO PRODOTTI COMMERCIALIZZATI | Ramponi |
| 06011020 | TESSUTI OMAGGIO | Tornieri |
| 06011021 | ACQUISTO SEMILAVORATI | Ramponi |
| 06021353 | RESI SU ACQUISTI | Ramponi |
| 06061001 | Rimanenze iniziali semilavorati | Maestrello |
| 06063000 | Rimanenze iniziali materie prime | Maestrello |
| 07021000 | RIMANENZE FINALI SEMILAVORATI | Maestrello |
| 07023000 | Rimanenze finali materie prime | Maestrello |
| 07051015 | SOPRAVVENIENZE ATTIVE TESSUTI | Tornieri |
| 07051017 | Sopravvenienze attive merce donata | Direzionali |
| XXXX009 | Acquisti diretti di produzione | Ramponi |
| XXXX010 | Variazioni magazzino MP / SL | Maestrello |

### LAV — Lavorazioni esterne (7 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06021000 | LAVORAZIONE DI TERZI - TAGLIATORE | Ramponi |
| 06021002 | LAVORAZIONE STAMPE | Ramponi |
| 06021006 | Lavorazione presso terzi per mascherine | Ramponi |
| 06021007 | Lavorazione presso terzi prodotti vari | Ramponi |
| 06021008 | Lavorazione presso terzi mascherine  Invitalia | Ramponi |
| 06021009 | LAVORAZIONI PRESSO TERZI PELLAME | Ramponi |
| 06021053 | ALTRI COSTI INDUSTRIALI | Ramponi |

### DIR — Costo del personale diretto (2 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06041000/A | SALARI OPERAI - Diretti di Produzione | Tornieri |
| XXXX002 | MANODOPERA DIRETTA DI PRODUZIONE | Tornieri |

### PRD — Altri costi di produzione (20 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06011004 | ACQUISTO MATERIALI DI CONSUMO | Tornieri |
| 06011006 | MATERIALE DI PULIZIA | Tornieri |
| 06011007 | BENI STRUM. COSTO INF. € 516,46 | Tornieri |
| 06011009 | CARBURANTE AUTOMEZZI | Maestrello |
| 06021001 | LAVANDERIA | Ramponi |
| 06021003 | PROVE E COLLAUDI | Ramponi |
| 06021004 | CAMPIONATURE | Penazzi |
| 06021103 | CONSULENZE TECNICHE | Ramponi |
| 06021109 | CONSULENZE ORGANIZZATIVE | Ramponi |
| 06021153 | Emolumenti Resp. Servizio di Prevenzione e  Protezione | Tornieri |
| 06021201 | ASSICURAZIONI AUTOMEZZI | Maestrello |
| 06021202 | ASSICURAZIONI AUTOVETTURE | Maestrello |
| 06021206 | ASSICURAZIONI TRASPORTI | Maestrello |
| 06021251 | SPESE DI MANUTENZIONE MACCHINARI | Ramponi |
| 06021254 | SPESE DI MANUTENZIONE VARIE | Tornieri |
| 06021257 | SPESE DIVERSE FURGONE | Maestrello |
| 06021350 | TRASPORTO CLIENTI | Maestrello |
| 06021351 | TRASPORTO FORNITORI | Maestrello |
| 06021354 | Dazi doganali | Maestrello |
| 06033000 | NOLEGGI | Tornieri |

### PAY — Costo del personale indiretto (6 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06041000/B | SALARI OPERAI - Diretti Improduttivi | Tornieri |
| 06041000/C | SALARI OPERAI - Indiretto di Fabbrica | Tornieri |
| 06041000/D | SALARI OPERAI - Struttura | Tornieri |
| XXXX003 | COSTI DEL PERSONALE INDIRETTO DI FABBRICA | Tornieri |
| XXXX004 | COSTI DEL PERSONALE DI STRUTTURA | Tornieri |
| XXXX005 | Costi del personale diretto improduttivo | Tornieri |

### AFF — Affitti (18 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06031000 | AFFITTI PASSIVI DIVERSI | Tornieri |
| 06031001 | AFFITTO SEDE VIA CONSORTIA 10 | Tornieri |
| 06031002 | AFFITTO VR VIA ROSA | Tornieri |
| 06031003 | AFFITTO VR VALLESE | Tornieri |
| 06031004 | AFFITTO MESTRE | Tornieri |
| 06031005 | AFFITTO BASSANO | Tornieri |
| 06031006 | AFFITTO CADRIANO | Tornieri |
| 06031007 | AFFITTO MILANO | Tornieri |
| 06031008 | AFFITTO GENOVA | Tornieri |
| 06031009 | AFFITTO PORTE DELL'ADIGE BUSSOLENGO | Tornieri |
| 06031010 | AFFITTO PORTE DI MESTRE | Tornieri |
| 06031011 | AFFITTO MAGAZZINO VALLESE VR | Tornieri |
| 06031012 | AFFITTO MANTOVA | Tornieri |
| 06031013 | AFFITTO MILANO MAGAZZINO | Tornieri |
| 06031014 | AFFITTO BENINI | Tornieri |
| 06031015 | AFFITTO MAGAZZINO VIA DELLA CONSORTIA 1 | Tornieri |
| 06031016 | AFFITTO PADOVA | Tornieri |
| XXXX001 | NUOVO AFFITTO 2024 | Tornieri |

### COSTI — Costi generali, commerciali ed amm. (108 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06011008 | CANCELLERIA | Barbagallo |
| 06011010 | CARBURANTE AUTOVETTURE | Tornieri |
| 06011012 | ACQUISTI PER DIPENDENTI | Tornieri |
| 06011022 | MATERIALE PUBBLICITARIO | Liviero |
| 06012000 | CARBURANTE | Maestrello |
| 06021005 | CERTIFICAZIONI | Tornieri |
| 06021050 | ENERGIA ELETTRICA | Tornieri |
| 06021051 | GAS | Tornieri |
| 06021052 | ACQUA | Tornieri |
| 06021054 | SPESE TELEFONIA FISSA | Tornieri |
| 06021055 | SPESE TELEFONIA MOBILE | Tornieri |
| 06021100 | CONSULENZE LEGALI | Tornieri |
| 06021101 | CONSULENZE FISCALI | Barbagallo |
| 06021102 | CONSULENZE DEL PERSONALE | Tornieri |
| 06021104 | CONSULENZE INFORMATICHE | Tornieri |
| 06021105 | CONSULENZE COMMERCIALI | Tornieri |
| 06021106 | CONSULENZE NOTARILI | Tornieri |
| 06021107 | CONSULENZE DIVERSE | Tornieri |
| 06021108 | CONSULENZE COMUNICAZIONE | Liviero |
| 06021110 | CONSULENZE DIGITAL | Tornieri |
| 06021111 | SITO ECOMMERCE TEDESCO - SIMEST | Tornieri |
| 06021112 | MODELLO ORGANIZZATIVO 231 | Tornieri |
| 06021113 | CONSULENZE AMIF-CRISALIS | Tornieri |
| 06021115 | CONSULENZE FSE | Tornieri |
| 06021116 | COSTI PER LA SOMMINISTRAZIONE DI  LAVORO | Tornieri |
| 06021117 | SUPPORTO PEDAGOGICO GENERALE | Tornieri |
| 06021150 | EMOLUMENTI COLLEGIO SINDACALE | Tornieri |
| 06021151 | EMOLUMENTI REVISORE CONTABILE | Tornieri |
| 06021152 | EMOLUMENTI AMMINISTRATORI | Tornieri |
| 06021154 | ONERI SOCIALI AMMINISTRATORI | Tornieri |
| 06021200 | ASSICURAZIONI RCOT | Tornieri |
| 06021203 | ASSICURAZIONI AMMINISTRATORI | Tornieri |
| 06021204 | ALTRE ASSICURAZIONI | Tornieri |
| 06021205 | ASSICURAZIONI INFORTUNI | Tornieri |
| 06021250 | SPESE DI MANUTENZIONE IMMOBILE | Tornieri |
| 06021252 | SPESE DI MANUTENZIONE AUTOVETTURE | Tornieri |
| 06021253 | SPESE DIVERSE AUTOVETTURE | Tornieri |
| 06021255 | CANONI DI MANUTENZIONE SW | Tornieri |
| 06021256 | CANONI DI ASSISTENZA | Tornieri |
| 06021300 | PROVVIGIONI | Penazzi |
| 06021301 | FIERE | Tornieri |
| 06021302 | CATALOGHI | Tornieri |
| 06021303 | MEETING E EVENTI | Liviero |
| 06021304 | SPESE PUBBLICITARIE OFFLINE | Liviero |
| 06021306 | SPESE DI RAPPRESENTANZA | Tornieri |
| 06021307 | SHOOTING | Liviero |
| 06021308 | SPESE VIAGGIO | Tornieri |
| 06021309 | SPESE PEDAGGI AUTOSTRADALI E  PARCHEGGI | Penazzi |
| 06021310 | SPESE ALBERGHIERE E RISTORANTE | Penazzi |
| 06021311 | RIMBORSI SPESE | Penazzi |
| 06021312 | RIMBORSI KM | Penazzi |
| 06021313 | CORSI DI FORMAZIONE | Tornieri |
| 06021314 | ALTRE SPESE PER IL PERSONALE | Tornieri |
| 06021315 | ROYALTIES | Tornieri |
| 06021316 | ALLESTIMENTI NEGOZI | Liviero |
| 06021319 | SPESE PUBBLICITARIE ONLINE | Liviero |
| 06021320 | MODELLE FITTING | Liviero |
| 06021321 | SPESE GESTIONE CENTRI COMMERCIALI | Tornieri |
| 06021322 | RIMBORSI SPESE SOCI VOLONTARI | Tornieri |
| 06021323 | EVENTO 8 MARZO (PROGETTI) | Valotto |
| 06021352 | ADDEBITI DA CLIENTI PER NON  CONFORMITA' | Tornieri |
| 06021400 | SPESE PER PULIZIE | Tornieri |
| 06021401 | SPESE DI VIGILANZA | Tornieri |
| 06021402 | SPESE PER LA SICUREZZA | Tornieri |
| 06021403 | ALTRI COSTI PER SERVIZI | Tornieri |
| 06021404 | ALTRI COSTI PER SERVIZI INDEDUCIBILI | Tornieri |
| 06021500 | LICENZE SOFTWARE | Tornieri |
| 06021501 | SPESE E-COMMERCE E SITO | Liviero |
| 06021600 | SPESE BANCARIE | Barbagallo |
| 06021601 | SPESE POSTALI | Tornieri |
| 06021602 | ABBONAMENTI E LIBRI | Tornieri |
| 06021603 | SPESE BOLLI | Tornieri |
| 06021604 | SPESE PAYPAL | Barbagallo |
| 06021610 | COMMISSIONI VARIE | Tornieri |
| 06021700 | COSTI SERVIZI VARI | Tornieri |
| 06021701 | Bolla doganale | Tornieri |
| 06021702 | COSTI SERVIZI ALTROMERCATO | Liviero |
| 06021800 | Costi di smaltimento | Tornieri |
| 06021900 | CONSULENZE PROGETTI | Valotto |
| 06021901 | FORMAZIONE PROGETTI | Tornieri |
| 06021902 | ALTRE SPESE PROGETTI | Liviero |
| 06021903 | Consulenza contrattualistica e servizi  welfare | Tornieri |
| 06032000 | ROYALTIES | Tornieri |
| 06033001 | NOLEGGI AUTOVETTURE | Tornieri |
| 06033002 | ALTRI NOLEGGI | Tornieri |
| 06033003 | NOLEGGIO FURGONE | Maestrello |
| 06081000 | CONTRIBUTI ASSOCIATIVI | Tornieri |
| 06081001 | EROGAZIONI LIBERALI VERSATE | Tornieri |
| 06081002 | IMPOSTE DI BOLLO | Tornieri |
| 06081003 | IMPOSTE DI REGISTRO | Tornieri |
| 06081005 | IMU-TASI | Tornieri |
| 06081006 | TARI | Tornieri |
| 06081007 | IMPOSTE E TASSE INDEDUCIBILI | Tornieri |
| 06081008 | IMPOSTE VARIE | Tornieri |
| 06081009 | DIRITTI DI SEGRETERIA | Tornieri |
| 06081011 | LEGACOOP - COOPFOND | Tornieri |
| 06081012 | COSTI DIVERSI INDEDUCIBILI | Tornieri |
| 06081013 | COSTI DIVERSI | Tornieri |
| 06081014 | COMMISSIONI SU FIDEJUSSIONI | Barbagallo |
| 06081015 | SCONTI E ABBUONI PASSIVI | Tornieri |
| 06081016 | ARROTONDAMENTI PASSIVI | Tornieri |
| 06081020 | SPESE DI ISTRUTTORIA | Tornieri |
| 06081021 | OMAGGI A TERZI | Liviero |
| 06081023 | SPESE AMMINISTRATIVE | Barbagallo |
| 06081026 | OMAGGI A CLIENTI INDEDUCIBILI | Tornieri |
| 07011102 | SPESE DI TRASPORTO | Tornieri |
| XXXX014 | CONTRIBUTO FORMAZIONE TM | Tornieri |
| XXXX015 | STORNO | Tornieri |

### AMM — Ammortamenti (14 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06051001 | AMMORTAMENTO SOFTWARE | Direzionali |
| 06051002 | AMMORTAMENTO DIRITTTI DI BREVETTO E  OPERE INGEGNO | Direzionali |
| 06051003 | AMMORTAMENTO AVVIAMENTO | Direzionali |
| 06051004 | AMMORTAMENTO MIGLIORIE BENI DI TERZI | Direzionali |
| 06051101 | AMMORTAMENTO IMPIANTI GENERICI E  SPECIFICI | Direzionali |
| 06051102 | AMMORTAMENTO MACCHINE UFF. ELETTR. | Direzionali |
| 06051103 | AMMORTAMENTO ATTREZZATURE | Direzionali |
| 06051104 | AMMORTAMENTO FABBRICATI | Direzionali |
| 06051105 | AMMORTAMENTO MIGLIORIE BENI PROPRI | Direzionali |
| 06051106 | AMMORTAMENTO MOBILI E ARREDI | Direzionali |
| 06051107 | AMMORTAMENTO INSEGNE | Direzionali |
| 06051108 | AMMORTAMENTO AUTOMEZZI | Direzionali |
| XXXX007 | Ammortamenti indiretti di fabbrica | Direzionali |
| XXXX008 | Ammortamenti di struttura | Direzionali |

### ACC — Accantonamenti (3 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06071000 | ACCANTONAMENTI PER RISCHI | Direzionali |
| 06071200 | ACCANTONAMENTO SVALUTAZIONE  MAGAZZINO | Direzionali |
| 06071300 | ACCANTONAMENTO SVALUTAZIONE  CREDITI | Direzionali |

### FIN — Gestione Finanziaria (13 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06091301 | INTERESSI PASSIVI SU MUTUI | Direzionali |
| 06091501 | INTERESSI PASSIVI SU FINANZIAMENTI | Direzionali |
| 06091502 | INTERESSI PASSIVI FINANZ.CREDIT  AGRICOLE | Direzionali |
| 06091503 | INTERESSI PASSIVI FINANZ.34878755 BPM | Direzionali |
| 06091504 | INT. PASSIVI FINANZ. UNICREDIT 8931002 | Direzionali |
| 06091505 | INT. PASSIVI FINANZ. SIMEST 51339/EC/FP | Direzionali |
| 06091601 | INTERESSI DI MORA | Direzionali |
| 06091602 | INTERESSI PASSIVI DIVERSI | Direzionali |
| 07051901 | INTERESSI ATTIVI | Direzionali |
| 07071300 | PROVENTI DA CREDITI IMM. DA ALTRI | Direzionali |
| 07071400 | PROVENTI DA TITOLI IMMOBILIZZAZIONI  NON PARTECIPAZIONI | Direzionali |
| 07073000 | INTERESSI ATTIVI BANCARI | Barbagallo |
| 07073001 | ALTRI INTERESSI ATTIVI | Direzionali |

### EXT — Gestione Straordinaria (21 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06021114 | Consulenze diverse Progetto Yeah | Tornieri |
| 06021317 | Corsi di formazione progetto Yeah | Tornieri |
| 06021318 | RIMBORSI SPESE YEAH | Tornieri |
| 06021405 | Costi diversi Yeah | Tornieri |
| 06051200 | SVALUTAZIONI DELLE IMMOBILIZZAZIONI | Direzionali |
| 06081010 | SANZIONI - MULTE | Tornieri |
| 06081017 | SOPRAVVENIENZE PASSIVE | Tornieri |
| 06081018 | MINUSVALENZE DA ALIENAZIONE | Direzionali |
| 06081024 | SOPRAVVENIENZA PASSIVA INDEDUCIBILE | Direzionali |
| 06081025 | SOPRAVVENIENZE PASSIVE PROGETTI | Direzionali |
| 06081027 | COSTI INDEDUCIBILI YEAH | Tornieri |
| 07011101 | PRESTAZIONI DI SERVIZI YEAH | Tornieri |
| 07051012 | SOPRAVVENIENZE ATTIVE | Tornieri |
| 07051013 | PLUSVALENZE DA ALIENAZIONE | Direzionali |
| 07051016 | SOPRAVVENIENZE ATTIVE BLAZING | Direzionali |
| 07052003 | CONTRIBUTI DA CREDITI D'IMPOSTA | Direzionali |
| 07052005 | ALTRE DONAZIONI | Valotto |
| 07052006 | DONAZIONI YEAH | Tornieri |
| 07061200 | PARTECIPAZIONI IN ALTRE IMPRESE | Direzionali |
| XXXX006 | PLUSVALENZA MILANO | Direzionali |
| XXXX013 | SERVICE PROGETTO YEAH | Tornieri |

### TAX — Imposte (1 conti)

| NumeroConto | Descrizione | CdR |
|-------------|-------------|-----|
| 06111100 | IMPOSTE RELATIVE ESERCIZI PRECEDENTI | Direzionali |
