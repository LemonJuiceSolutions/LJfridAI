# SPS Parma 2026 - Batch 3 Integration Guide

## Overview
This guide provides step-by-step instructions for integrating the Batch 3 lead research (companies 81-120) into the FridAI lead-generator system.

## Files Provided

### Primary Data Files
1. **batch-3-sps-parma-2026-leads.json** (27 KB)
   - Complete lead records (40 companies)
   - Ready for `saveLeads()` API
   - All non-email fields populated

2. **batch-3-sps-parma-2026-leads.csv** (9.4 KB)
   - Excel-compatible format
   - Quick reference view
   - Good for manual review

### Documentation Files
3. **BATCH_3_REPORT.md**
   - Detailed analysis by region, industry, confidence
   - Recommendations for enrichment phases
   
4. **BATCH_3_SUMMARY.txt**
   - Executive summary
   - Statistics and breakdown
   - Next actions prioritized

5. **BATCH_3_VALIDATION.txt**
   - Data quality checks
   - Field completeness
   - JSON validation results

## Integration Steps

### Step 1: Load Data into FridAI Lead Generator

```bash
# Copy JSON file to FridAI project
cp batch-3-sps-parma-2026-leads.json /path/to/FridAI/

# Access the lead-generator UI at:
# http://localhost:9002/lead-generator
```

### Step 2: Import Batch 3 Data

In the FridAI UI:
1. Click "Import Leads" or "Load from File"
2. Select `batch-3-sps-parma-2026-leads.json`
3. Verify: Should show 40 companies loaded
4. Review sample leads (top 5)
5. Check confidence distribution
6. Click "Confirm Import"

### Step 3: Save to Database

Once imported, the system will display the leads. Save them using:

```javascript
// Via API or UI button
POST /api/lead-generator/leads
{
  "searchName": "SPS Parma 2026 - Batch 3 (Companies 81-120)",
  "criteria": {
    "event": "SPS Parma 2026",
    "exhibitors": "batch3",
    "companies": 40,
    "batch": "81-120"
  },
  "leads": [40 lead objects from JSON]
}
```

Or use the UI: **Save Batch → Confirm**

### Step 4: Email Enrichment (Phase 1)

After saving to database, run Hunter enrichment:

**Configuration:**
- API: Hunter API (v2)
- Target confidence: > 30%
- Expected leads to process: 28 (high confidence)
- Estimated credits: 20-25

**Command (if using API):**
```javascript
POST /api/lead-generator/enrich
{
  "searchId": "[id from step 3]",
  "enrichmentType": "hunter",
  "filters": {
    "minConfidence": 30,
    "hasEmail": false
  },
  "options": {
    "verifyEmails": true
  }
}
```

**Expected Results:**
- Emails found: 15-20
- Confidence increase: +25-35 points
- Execution time: 15-20 minutes

### Step 5: Website Scraping (Phase 2)

For the 8 problematic companies (confidence < 15%):

**Target Companies:**
1. GENERAL COM
2. MARCOM
3. PRIVIUS
4. STEGO ITALIA
5. DELTA ELECTRONICS NETHERLANDS
6. NVENT HOFFMAN
7. CONDUCTIX WAMPFLER
8. RECHNER SENSORS

**Configuration:**
- Tool: Firecrawl (or scrapeWithFirecrawl)
- Pages to scan: `/team`, `/about`, `/management`, `/contatti`, `/chi-siamo`
- Field extraction: name, title, email, phone
- Follow redirects: yes
- Timeout: 30 seconds per page

**Command:**
```javascript
POST /api/lead-generator/scrape
{
  "searchId": "[id from step 3]",
  "companies": [8 problematic companies],
  "pages": ["/team", "/about", "/management", "/contatti"],
  "extractFields": ["name", "title", "email", "phone"]
}
```

**Expected Results:**
- Additional emails: 5-10
- Confidence increase: +15-20 points
- CEO identification: 3-5 companies
- Execution time: 1-2 hours

### Step 6: Apollo Enrichment (Phase 3)

For remaining unconfirmed leads:

**Configuration:**
- API: Apollo API
- Filter: `role = "CEO" OR role = "CTO" OR role = "Manager"`
- Domain: company domain
- Exclude: already identified leads
- Max results per company: 3

**Command:**
```javascript
POST /api/lead-generator/enrich
{
  "searchId": "[id from step 3]",
  "enrichmentType": "apollo",
  "filters": {
    "hasEmail": false,
    "minConfidence": 10
  },
  "roleFilter": ["CEO", "CTO", "Manager", "Director"]
}
```

**Expected Results:**
- New contacts found: 5-10
- Confidence increase: +20-25 points
- Execution time: 20-30 minutes

### Step 7: Email Verification (Vibe)

After email collection, verify with Vibe Prospecting:

**Configuration:**
- Tool: Vibe Prospecting
- Verify: All newly found emails
- Check: Deliverability, syntax, validity
- Exclude: Generic emails (info@, sales@)

**Command:**
```javascript
POST /api/lead-generator/verify
{
  "searchId": "[id from step 3]",
  "verificationTool": "vibe",
  "filters": {
    "hasEmail": true,
    "excludeGeneric": true
  }
}
```

**Expected Results:**
- Valid emails: 22-28 (60-70% of leads)
- Invalid/risky: 8-12 (20-30%)
- Execution time: 10-15 minutes

## Data Quality Expectations

### After Phase 1 (Hunter) - 1 Hour
- Confidence average: 40-45
- Email rate: 50-60%
- High confidence (>50%): 15-18 leads

### After Phase 2 (Scraping) - Additional 2 Hours
- Confidence average: 50-55
- Email rate: 62-72%
- High confidence (>50%): 20-24 leads

### After Phase 3 (Apollo) - Additional 1 Hour
- Confidence average: 55-60
- Email rate: 68-78%
- High confidence (>50%): 25-30 leads

### After Phase 4 (Vibe Verification) - Additional 15 minutes
- Confidence average: 60-70
- Verified email rate: 60-75%
- High confidence (>60%): 28-32 leads

## File Locations

All generated files are located in:
```
/Users/manuelezanoni/Desktop/VisualStudio/FridAI/
```

### Core Files
- `batch-3-sps-parma-2026-leads.json` ← **PRIMARY INPUT**
- `batch-3-sps-parma-2026-leads.csv`

### Documentation
- `BATCH_3_REPORT.md`
- `BATCH_3_SUMMARY.txt`
- `BATCH_3_VALIDATION.txt`
- `BATCH_3_INTEGRATION_GUIDE.md` ← This file

## Troubleshooting

### Issue: JSON Import Fails
**Solution:**
- Verify JSON syntax: `jq . batch-3-sps-parma-2026-leads.json`
- Check encoding: `file -i batch-3-sps-parma-2026-leads.json`
- Ensure file not corrupted

### Issue: Some Leads Show null Email
**Expected Behavior:**
- This is normal for initial import
- Phase 1 (Hunter) will fill emails
- Confidence < 40 = expected to need enrichment

### Issue: GENERAL COM / MARCOM Unresolved
**Next Steps:**
- Contact SPS Parma organizers for clarification
- Search company registry (CCIAA) for Italian companies
- Manually verify which entity is exhibitor

### Issue: LinkedIn URLs 404
**Solution:**
- URLs are research artifacts, not critical
- Email is more important than LinkedIn URL
- Firecrawl will extract from websites

## Key Metrics to Monitor

```
Target Success Rates:
├── Email Discovery: 60-75% (target: 75%)
├── CEO Confirmation: 70-85% (target: 85%)
├── Confidence Average: 60-70 (target: >65)
├── Processing Time: 5-6 hours total
└── Quality Score: 75%+ (no invented data)
```

## API Endpoints Used

```
POST /api/lead-generator/leads         - Save leads
POST /api/lead-generator/enrich        - Run enrichment
POST /api/lead-generator/scrape        - Website scraping
POST /api/lead-generator/verify        - Email verification
GET  /api/lead-generator/leads/[id]    - Fetch lead
GET  /api/lead-generator/search/[id]   - Fetch search status
```

## Export / Next Steps

After completion, the enriched batch can be:

1. **Exported for Outreach**
   - CSV for mail merge campaigns
   - JSON for CRM import
   - LinkedIn for recruitment campaigns

2. **Used for Sales Pipeline**
   - Create opportunity records
   - Assign to sales teams by region
   - Setup email sequences

3. **Compared with Other Batches**
   - Merge with Batches 1-2 and 4+
   - Remove duplicates
   - Create unified database

4. **Archived for Reference**
   - Store all research artifacts
   - Tag by event, year, batch
   - Enable future updates

## Support

For questions or issues:
1. Check `BATCH_3_VALIDATION.txt` for data quality status
2. Review `BATCH_3_REPORT.md` for analysis details
3. Consult `BATCH_3_SUMMARY.txt` for recommendations
4. Check FridAI logs: `npm run dev` output

---

**Status:** Ready for Integration  
**Date:** 2026-04-05  
**Batch:** 3 of 10 (382 total companies)  
**Next Batch:** Companies 121-160
