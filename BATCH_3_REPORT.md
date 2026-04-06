# SPS Parma 2026 - Batch 3 Research Report
## Aziende 81-120 (40 Società)

**Data Ricerca**: 5 Aprile 2026  
**Metodo**: LinkedIn Web Search + Company Research  
**Status**: Dati raccolti, pronti per Hunter/Apollo enrichment

---

## Summary Executive

| Metrica | Valore |
|---------|--------|
| **Totale Aziende** | 40 |
| **CEO/Manager Trovati** | 18 confermati |
| **Lead con Email Verificata** | 0 (richiede Hunter) |
| **Confidence Media** | 27.5% |
| **Lead High-Confidence** | 10 (>40%) |
| **Aziende che necesitano ricerca manuale** | 8 |

---

## Top 10 Lead (Highest Confidence)

### Tier 1 - Confidence 50-55%
1. **Björn Lidefelt** - HID Global (USA) - *President & CEO*
2. **Willem Hofmans** - IXON (Netherlands) - *CEO*
3. **Camillo Ghelfi** - 40FACTORY (Italy) - *CEO*
4. **Andrea Franceschini** - MINI MOTOR (Italy) - *CEO*

### Tier 2 - Confidence 45-50%
5. **William Douglas Zimmerman** - VisionLink (USA) - *CEO*
6. **Ulrich Wagner** - Wimex Gruppe (Germany) - *CEO*
7. **Marino Crippa** - KEB AUTOMATION ITALIA (Italy) - *CEO*
8. **James Solomon** - SUMITOMO DRIVE TECHNOLOGIES (USA) - *President & CEO*
9. **Emilio Bistoletti** - SERVOTECNICA (Italy) - *CEO*
10. **Marco Catalano** - LOVATO ELECTRIC (Switzerland/Italy) - *CEO/Geschäftsführer*

---

## Aziende Problematiche (Requireing Manual Research)

### Generiche o Non Trovate (Confidence < 15%)
1. **GENERAL COM** - Nessun risultato LinkedIn. Nome troppo generico.
2. **MARCOM** - Molteplici aziende con stesso nome. Necessaria clarificazione.
3. **PRIVIUS** - Solo company page trovata, CEO non identificato.
4. **STEGO ITALIA** - Filiale della STEGO Group (Germania), CEO locale sconosciuto.
5. **DELTA ELECTRONICS NETHERLANDS** - Filiale, non identificato CEO locale.
6. **NVENT HOFFMAN** - Multinazionale, CEO mention but unverified.
7. **CONDUCTIX WAMPFLER** - Multinazionale, ex-CEO ritirato, attuale sconosciuto.
8. **RECHNER SENSORS** - CEO non esplicitamente identificato.

---

## Breakdown per Paese

| Paese | # Aziende | CEO Trovati | %Success |
|-------|-----------|------------|----------|
| **Italy** | 18 | 11 | 61% |
| **USA/Canada** | 8 | 5 | 63% |
| **Germany** | 4 | 2 | 50% |
| **Netherlands** | 2 | 1 | 50% |
| **Brazil** | 1 | 1 | 100% |
| **Switzerland** | 1 | 1 | 100% |
| **Greece** | 1 | 1 | 100% |
| **International/Unknown** | 5 | -4 | 0% |

---

## Settori Rappresentati

| Settore | # Aziende |
|---------|-----------|
| Industrial Automation | 12 |
| Electrical/Electronics | 8 |
| Manufacturing/Engineering | 7 |
| Software/IoT/Industry 4.0 | 5 |
| Supply Chain/Distribution | 4 |
| Higher Education | 1 |
| Standards Organization | 3 |

---

## Azioni Successive (Priority Order)

### Phase 1: Enrichment (Hunter API)
```
- Target: 18 confirmed CEOs + 10 managers with partial data
- Use Hunter findEmails() with domain + first_name + last_name
- Priority: Confidence scores > 30
- Expected output: 15-20 verified emails
```

### Phase 2: Website Scraping (Firecrawl)
```
- Target: /team, /about, /management, /contatti pages
- Focus: 8 "problematic" companies
- Expected outcomes:
  - Find local Italian CEOs for international subsidiaries
  - Resolve GENERAL COM / MARCOM ambiguity
  - Extract direct emails + phone numbers
```

### Phase 3: Apollo/Vibe Prospecting
```
- Use Apollo searchPeopleApollo() for uncovered leads
- Filter by role = CEO|CTO|Manager
- Combine with website data to verify
```

### Phase 4: Manual Research
```
- GENERAL COM: Search company registry + website
- MARCOM: Verify which entity = SPS Parma exhibitor
- International subsidiaries: Check local registrations
```

---

## Quality Assessment

### Email Status
- **Direct Emails Found**: 0
- **Company Domains Extracted**: 35/40 (87.5%)
- **LinkedIn Profiles Found**: 28/40 (70%)
- **CEO Title Confirmed**: 18/40 (45%)

### Confidence Distribution
```
> 50%: 4 leads (10%)    ████
40-50%: 6 leads (15%)   ██████
30-40%: 8 leads (20%)   ████████
20-30%: 10 leads (25%)  ██████████
10-20%: 8 leads (20%)   ████████
< 10%:  4 leads (10%)   ████
```

---

## File Structure

**Output File**: `batch-3-sps-parma-2026-leads.json`

**Format**: JSON array with per-lead fields:
- `fullName`, `firstName`, `lastName`
- `jobTitle`, `email`, `phone`
- `linkedinUrl`
- `companyName`, `companyDomain`, `companyWebsite`
- `companySize`, `companyIndustry`, `companyCity`, `companyCountry`
- `source`, `notes`, `confidence` (0-100)

**Ready for**: `saveLeads()` API call with proper enrichment

---

## Recommendations

1. **Priority Searches**: Start with Tier 1 companies (confidence > 45%)
2. **Hunter Usage**: Allocate ~25 credits for top 20 leads
3. **Website Scraping**: Use Firecrawl for Italian subsidiaries
4. **Verification**: Email validation through Vibe after Hunter
5. **Manual Fallback**: For GENERAL COM / MARCOM, contact SPS organizers for clarification

---

**Note**: This batch focuses on companies 81-120. Email verification and enrichment will significantly increase confidence scores upon completion of Phase 1-3.
