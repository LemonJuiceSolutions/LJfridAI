# NIS2 Incident Response Plan

**Owner:** Security Lead | **Last reviewed:** 2026-04-23 | **Next review:** 2026-10-23

---

## 1. Roles and Responsibilities

| Role | Responsibility | Backup |
|------|---------------|--------|
| **Incident Commander (IC)** | Owns the incident lifecycle, makes escalation decisions | CTO |
| **Security Lead** | Triages, classifies, and coordinates technical response | Senior Backend Engineer |
| **Communications Lead** | Handles internal/external notifications, NIS2 authority contact | Legal / DPO |
| **Engineering On-Call** | Contains and remediates the technical issue | Rotating schedule |
| **DPO / Legal** | Assesses GDPR/NIS2 reporting obligations | External counsel |

---

## 2. Incident Classification

| Priority | Severity | Description | Response SLA | Examples |
|----------|----------|-------------|-------------|----------|
| **P1 - Critical** | Service down or data breach | Active data exfiltration, full outage, ransomware | 15 min acknowledge, 1 hr contain | DB breach, production keys leaked |
| **P2 - High** | Major degradation or confirmed intrusion | Unauthorized access, partial outage affecting users | 30 min acknowledge, 4 hr contain | SQL injection exploited, auth bypass |
| **P3 - Medium** | Limited impact, no data loss | Vulnerability discovered, suspicious activity | 4 hr acknowledge, 24 hr contain | Unpatched CVE (high), brute-force attempts |
| **P4 - Low** | Informational, no immediate risk | Failed pen-test finding, policy violation | 1 business day acknowledge | Low-severity CVE, minor misconfiguration |

---

## 3. 72-Hour Notification Timeline (NIS2 Art. 23)

NIS2 requires notification to the national CSIRT and competent authority for **significant incidents** (P1, P2).

| Deadline | Action | Owner | Details |
|----------|--------|-------|---------|
| **T+0** | Incident detected | Monitoring / On-Call | Automated alert or manual report |
| **T+15 min** | IC assigned, war room opened | IC | Slack `#incident` channel + video call |
| **T+1 hr** | Classification confirmed (P1-P4) | Security Lead | Document in incident log |
| **T+24 hr** | **Early warning** to CSIRT | Communications Lead | Submit via national CSIRT portal. Include: suspected cause, affected systems, cross-border impact |
| **T+72 hr** | **Incident notification** to CSIRT | Communications Lead | Include: severity assessment, IoCs, impact scope, mitigation measures taken |
| **T+30 days** | **Final report** to CSIRT | Security Lead + Legal | Root cause analysis, remediation completed, lessons learned |

> If the incident involves personal data, also notify the Data Protection Authority per GDPR Art. 33 (72 hr).

---

## 4. Communication Channels

| Channel | Purpose | Access |
|---------|---------|--------|
| Slack `#incident` | Real-time coordination | IC, Security Lead, On-Call |
| Slack `#incident-updates` | Status broadcasts (read-only for most) | All engineering |
| Video call (Google Meet / Zoom) | War room for P1/P2 | IC, responders |
| Email `security@<company>.com` | External reports, authority notifications | Security Lead, Legal |
| Incident log (Notion / Confluence) | Timestamped record of all actions | IC (write), all (read) |
| Phone tree | Escalation when Slack is unavailable | IC, CTO |

---

## 5. Evidence Preservation

Perform these steps **before** any remediation that could destroy forensic data.

| Step | Action | Tool / Command |
|------|--------|---------------|
| 1 | Snapshot affected server disks | Cloud provider snapshot (e.g., `aws ec2 create-snapshot`) |
| 2 | Export application logs | `vercel logs <deployment> > incident-YYYY-MM-DD.log` |
| 3 | Export database audit logs | `pg_dump` of audit tables, WAL archive |
| 4 | Capture network flow data | Cloud VPC flow logs export |
| 5 | Screenshot affected UI states | Browser DevTools / automated capture |
| 6 | Preserve access logs | Copy Nginx/CDN access logs to secure bucket |
| 7 | Hash all evidence files | `sha256sum <file>` and store hashes separately |
| 8 | Store evidence in write-once storage | S3 with Object Lock or equivalent |

> Chain of custody: every evidence file must be logged with collector name, timestamp, and SHA-256 hash.

---

## 6. Response Procedure (P1/P2)

1. **Detect** -- Alert fires or report received. On-call acknowledges within SLA.
2. **Triage** -- Security Lead classifies severity. IC opens war room.
3. **Contain** -- Isolate affected systems (revoke credentials, block IPs, disable endpoints).
4. **Preserve** -- Follow evidence preservation steps above.
5. **Eradicate** -- Remove threat (patch vulnerability, rotate secrets, rebuild from clean image).
6. **Recover** -- Restore service from verified backups. Monitor for re-compromise.
7. **Notify** -- Communications Lead submits early warning (T+24h) and notification (T+72h).
8. **Review** -- Post-incident review within 5 business days.

---

## 7. Post-Incident Review

Conduct within **5 business days** of incident closure.

| Item | Description |
|------|-------------|
| **Attendees** | IC, Security Lead, all responders, CTO |
| **Format** | Blameless retrospective |
| **Document** | Timeline, root cause, what worked, what failed, action items |
| **Action items** | Each assigned an owner and deadline. Track in project board. |
| **Metrics to capture** | Time to detect, time to contain, time to recover, notification compliance |
| **Distribution** | Share report with leadership. Redacted version for broader team. |
| **NIS2 final report** | Incorporate findings into the T+30 day final report to CSIRT. |

---

## Appendix: National CSIRT Contact

| Country | Authority | Portal |
|---------|-----------|--------|
| Italy | ACN (Agenzia per la Cybersicurezza Nazionale) | https://www.acn.gov.it |

Update this table if operations expand to additional EU member states.
