# SPS Parma 2026 - Batch 10 Research Plan
## Comprehensive Lead Generation Strategy

**Date:** April 5, 2026
**Status:** Active Research Phase
**Target:** ~350+ remaining SPS Parma exhibitors (companies 0-280 + batch 10+)

---

## Completed Batches Summary

| Batch | Range | Count | Status | Notes |
|-------|-------|-------|--------|-------|
| 1-3 | Various | ~98 | Complete | Original leads (email stage filtered out) |
| 5-7 | Various | ~60 | Complete | Batch series completed |
| 8 | 281-320 | 38 | Complete | Full contact info (95% phone, 90% email) |
| 9 | 321-382 | 62 | Complete | 40 verified, 15 partial, 9 clarification needed |
| **TOTAL** | **0-382** | **~258** | **Verified** | Multiple source consolidation |

---

## Remaining Work (Batch 10+)

**Estimated companies remaining:** ~350-400
**From:** Companies 0-280 (gaps in coverage) + new exhibitors 383+

### Research Strategy by Company Type

#### Type A: Tier 1 Global Companies (80 companies)
- Siemens, Bosch, ABB, KUKA, Schneider Electric, Festo, etc.
- **Contact method:** Company LinkedIn pages → Executive Team → Email format patterns
- **Efficiency:** 85% have public contact info via official sites
- **Time per company:** 2-3 minutes

#### Type B: Mid-Tier Specialists (150 companies)
- Direct automation/robotics/sensors manufacturers
- **Contact method:** WebSearch + company website /contacts + /team pages
- **Efficiency:** 60% have direct CEO/exec emails discoverable
- **Time per company:** 5-8 minutes

#### Type C: Small/Regional Suppliers (120 companies)
- Local Italian/EU suppliers, distributors, integrators
- **Contact method:** Company site, business registry (Italië, Alemania), LinkedIn
- **Efficiency:** 40% have public direct contacts, rest need phone follow-up
- **Time per company:** 8-15 minutes

---

## Data Collection Fields (per lead)

```json
{
  "company_name": "String",
  "company_domain": "String",
  "country": "String",
  "primary_contact": {
    "name": "String",
    "title": "String (CEO, CTO, Sales Director, etc.)",
    "email": "String or 'Not found'",
    "phone": "String or 'Not found'",
    "linkedin": "String (URL)",
    "verified": "Boolean"
  },
  "company_info": {
    "website": "String",
    "industry": "String",
    "employee_count": "Number or 'Not found'",
    "description": "String"
  },
  "research_notes": "String",
  "source": "Array of sources used",
  "data_quality_score": "1-100"
}
```

---

## Parallel Research Batches

### Batch 10.1 - Global Automation Leaders (20 companies)
Companies: Siemens, Bosch, ABB, KUKA, Schneider Electric, Phoenix Contact, Festo, Rockwell, Eaton, Omron, Danfoss, Weidmüller, Rittal, Beldect, STAHL, Pilz, Phönix, Pfeiffer, Beckhoff, Moeller

**Execution:** Parallel WebSearch x20 for "[Company] CEO email LinkedIn contact"

---

### Batch 10.2 - Italian Mid-Tier (50 companies)
Companies: Lovato Electric, Bonfiglioli, Duplomatic, Nord Drivesystems (full roster), Comau, CAP, Metrologic, ATOS, Parker Hannifin, Hydac, etc.

**Execution:**
- WebSearch: "[Company Name] CEO email telefono"
- WebFetch: company website /contacts, /team, /about pages
- LinkedIn: Company page → Executive directory

---

### Batch 10.3 - European Specialists (100 companies)
Companies: SMC (Japan/Europe), Aventics, Faulhaber, Leuze, Sick, Turck, Banner, Eaton, Idem Safety, Lapp, Helukabel, PHOENIX CONTACT, etc.

**Execution:**
- WebSearch: "[Company] [Country] sales director CEO contact"
- Cross-reference: LinkedIn Company pages
- Fallback: contact@[domain] for research databases

---

### Batch 10.4 - Emerging/Startup (50 companies)
Companies: NEOCAD, StartUp AI companies, Tech integrators, System designers

**Execution:**
- LinkedIn advanced search: CTO/Founder + [Industry] + [Country]
- Crunchbase profiles
- LinkedIn founder/CEO profiles direct

---

## Execution Timeline

**Hour 1-2:** Batch 10.1 (20 global companies) - Parallel searches
**Hour 2-3:** Batch 10.2 (50 Italian companies) - Parallel searches
**Hour 3-4:** Batch 10.3 (100 European) - Batched WebSearch x25
**Hour 4-5:** Batch 10.4 (50 startups) - LinkedIn + Crunchbase
**Hour 5-6:** Data consolidation + quality check + save to DB

---

## Quality Standards

### Email Verification
- ✓ VERIFIED: Direct personal email from company official sources
- ⚠ PARTIAL: Professional email domain but incomplete
- ✗ INVALID: Generic/masked (info@, sales@, contact@)
- ? UNVERIFIED: Format correct but not validated via tool

### Confidence Scoring
- **90-100:** Name + Title + Email (source-verified) + LinkedIn
- **70-89:** Name + Title + Email (inferred) + one external source
- **50-69:** Name + Title (no email) + LinkedIn or partial contact
- **30-49:** Name only or executive-level role unclear
- **0-29:** Company only or minimal verification

---

## Key Data Sources

1. **WebSearch** - Company discovery + key personnel
2. **WebFetch** - Official website contact pages
3. **LinkedIn** - Executive directory + company pages
4. **RocketReach** - Professional contact DB (masked results)
5. **Hunter.io** - Email pattern generation (fallback)
6. **Business Registries** - Italian Camere di Commercio, German HRB
7. **Crunchbase** - Startup founder info + funding

---

## Expected Output

**Target leads:** 150-200 new verified leads
**Total with existing batches:** 400-450 leads
**Success metrics:**
- Email discovery rate: >60%
- LinkedIn profile availability: >75%
- Phone number availability: >40%
- Average data quality score: >65

---

## Next Actions

1. ✅ Complete 28-CEO enrichment (in progress)
2. ⏳ Launch Batch 10.1-10.4 parallel research
3. ⏳ Consolidate all batch results into master JSON
4. ⏳ Quality review + duplicates elimination
5. ⏳ Save all leads to DB via saveLeads endpoint
6. ⏳ Generate final reports

---

**Research Lead:** Claude AI Agent
**Execution Status:** Ready to Deploy
**Last Updated:** 2026-04-05 14:15 UTC
