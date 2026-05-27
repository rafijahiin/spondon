# CLAUDE.md — Spondon IDMS

You are building **Spondon** from scratch — a production Integrated Digital M&E System for CIPRB/UNFPA Bangladesh. Build the full stack: Django backend, React frontend, Railway deployment config. Everything. Do not read any existing codebase. Start fresh.

---

## Ground Rules

- Before starting each new module, explain what you are about to build in 3–4 lines and wait for confirmation
- If you hit any ambiguity — a data structure, a business rule, an API behaviour — stop and ask one focused question
- Do not pad responses. Rafi reads everything. Be direct.
- Never proceed on an assumption. Ask.

---

## What You Are Building

A Django 5 + React web application called Spondon. It is a real-time health programme monitoring system for two NGOs (PHD and Bondhu) operating under CIPRB and UNFPA Bangladesh. The system:

- Receives field health data from ~40 workers via KoboToolbox webhooks
- Provides a role-based dashboard for 13 users across 3 organisations
- Generates automated monthly reports (Word, PDF, PowerPoint, one-pager, newsletter)
- Sends Telegram alerts for submission gaps
- Uses Groq API (LLaMA 3.3 70B) for AI-written monthly narrative
- Tracks fistula campaigns, MPDSR cases, baseline/endline surveys, training sessions
- Deploys on Railway — no Nginx, no manual server config, no SSH

---

## Organisations and Access Control

| Role | Org | Count | Access |
|---|---|---|---|
| Super Admin | CIPRB | 1 | All data across all orgs |
| Super Admin | UNFPA | 1 | All data across all orgs |
| Manager | PHD | 5 | PHD data only |
| Manager | Bondhu | 5 | Bondhu data only |
| Developer | Rafi | 1 | Full access |
| Field Staff | PHD + Bondhu | ~40 | KoboToolbox only — no dashboard account |

**Non-negotiable:** Enforce org-level data isolation at the Django queryset level — not just in templates. PHD managers must never see Bondhu data under any condition.

---

## Data Flow

```
Field staff submits KoboToolbox form on phone (location mandatory)
        ↓
KoboToolbox webhook → Django /webhook/kobo/
        ↓
Validated, stored as KoboSubmission (status: Pending Review)
        ↓
Instant notification to org manager (Telegram)
        ↓
Manager approves → data live in dashboard and reports
Manager rejects → logged and discarded
        ↓
Approved Fistula form → auto-creates FistulaCase
Approved MPDSR form → auto-creates MPDSRCase
```

---

## Tech Stack — Do Not Deviate Without Asking

| Component | Technology |
|---|---|
| Backend | Django 5 + Django REST Framework |
| Database | PostgreSQL |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Field forms | KoboToolbox ODK — webhook receiver |
| AI narrative | Groq API, LLaMA 3.3 70B |
| Reports | python-docx, ReportLab, python-pptx |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts or Chart.js |
| Alerts | Telegram Bot API |
| Static files | WhiteNoise |
| Auth | Django built-in + session auth + TOTP 2FA for super admins |
| PII protection | Regex-based stripping only — NO spaCy (kills Railway memory) |
| Hosting | Railway Hobby Plan |
| Deployment | GitHub push → Railway auto-deploy |

---

## Build Order — One App at a Time

Complete and confirm each app before starting the next. Ask Rafi before moving forward.

### 1. Project Setup
- Django project named `spondon`
- Apps: accounts, submissions, dashboard, fistula, mpdsr, tracker, reports, baseline, training
- Settings split: base, development, production
- `requirements.txt`, `Procfile`, `runtime.txt` for Railway
- WhiteNoise, dj-database-url, gunicorn configured from the start
- React app scaffolded with Vite + TypeScript + Tailwind in `/frontend`

### 2. `accounts` — Auth and Roles
- Custom user model: `organisation` (CIPRB/UNFPA/PHD/Bandhu), `role` (7-role taxonomy: `developer`, `supervisor`, `org_lead`, `manager`, `field_staff`, `ciprb_baseline`, `focal`)
- Login, logout, password change views
- Middleware: every request filtered by `request.user.organisation`
- User management restricted to `developer` only (FIX 1.4 — supervisors lost user-mgmt write access)

### 3. `submissions` — KoboToolbox Webhook
- POST `/webhook/kobo/` — receives webhook, validates HMAC, stores submission
- `KoboSubmission` model: partner, worker name, district, region, form type, location (lat/lng), indicator fields, datetime, status
- Status: Pending Review → Approved / Rejected
- On approval: auto-create FistulaCase or MPDSRCase depending on form type
- Telegram notification to org managers on new submission
- KoboToolbox form UIDs stored in environment variables (placeholders for now — CIPRB will provide later)

### 4. `dashboard` — Core Analytics
- Separate views: PHD subpage, Bondhu subpage, Super Admin aggregate
- Data modes: cumulative totals, monthly breakdown, segregated by indicator, month-on-month comparison
- By-centre breakdown with performance ranking
- All data served as DRF API endpoints consumed by React
- KPI cards: total submissions this month, active workers, target attainment %, fistula cases

### 5. `fistula` — Campaign Tracker
- `FistulaCase`: hash ID, date, location, status, partner, age, referral status, follow-up date
- Status flow: Case ID'd → Action Required → Follow-up Pending → Referral Completed
- Overdue flagging: follow-up date passed + not Referral Completed = overdue
- Patient name and ID encrypted with Fernet at field level

### 6. `mpdsr` — Maternal Death Surveillance
- `MPDSRCase`: case ID, date, place of death, cause of death, district, partner, reporter, audit trail
- Place of death: Facility / Home / In Transit
- Cause: PPH / Eclampsia / Sepsis / Obstructed Labor / Other
- Full audit trail as JSON field — every action logged with timestamp and user

### 7. `tracker` — Reporting Progress
- Configurable submission schedule per partner per form per period
- Status: On Track / Behind / Critical
- 48-hour gap detection → Critical flag → Telegram alert
- Predictive trajectory: linear regression on historical data

### 8. `reports` — Automated Report Generation
- Railway cron triggers generation on 1st of each month
- Outputs: Word/PDF report with AI narrative, one-pager, newsletter, PowerPoint, infographic PNGs
- AI narrative: strip PII with regex → send aggregated data to Groq → label output as AI-assisted
- Anomaly detection: >20% drop vs previous period → alert card on dashboard
- All reports logged with timestamp, downloadable from dashboard

### 9. `baseline` — Baseline and Endline
- `BaselineSubmission`: location (mandatory), datetime, all survey fields, duplicate flag
- Duplication detection: same location + device in same period → manager warning card
- Analysis module: charts by partner, district, demographic, indicator

### 10. `training` — Training Log
- `TrainingSession`: date, topic, region, attendees, competency score
- `TrainingAttendee`: name, org, session, pass/fail
- Three sessions: dashboard navigation, KoboToolbox entry, report review
- Summary PDF downloadable

---

## Frontend — React

Build a clean, production-grade React frontend. This is a portfolio piece and will be seen by UNFPA.

### Design Rules — Non-Negotiable
- Mobile-first — managers approve on phone
- Bangla text: **Hind Siliguri** or **Noto Sans Bengali** — never system fonts
- Primary colour: UNFPA blue `#00658C`
- Status colours: traffic-light red/amber/green
- Progress rings for target vs actual — not bar charts
- Sparklines inside data tables
- Dark/light mode toggle
- Animated choropleth map on front page — Bangladesh districts light up as submissions arrive
- Live activity feed: "PHD field worker submitted from Sylhet, 2 minutes ago"
- Programme-wide KPI cards at top, updating live
- Separate subpages for PHD and Bondhu
- Mobile-optimised manager approval screen — submissions as cards, one-tap approve/reject
- AI anomaly alert cards on dashboard — live, not just in reports
- Natural language weekly summary per org subpage

### Pages to Build
- Login screen
- Home / Front page (map + KPI cards + activity feed)
- PHD Dashboard (managers + super admin)
- Bondhu Dashboard (managers + super admin)
- Manager Approvals (mobile-first card view)
- Fistula Tracker
- MPDSR Tracker
- Reporting Hub (download reports, view AI alerts)
- Baseline & Endline
- Training Log
- Admin panel (user management)

---

## Railway Deployment Config

- `Procfile`: `web: gunicorn spondon.wsgi --bind 0.0.0.0:$PORT`
- `runtime.txt`: `python-3.12.0`
- `requirements.txt` at root
- WhiteNoise serves static files — no separate static server
- All secrets in environment variables — never hardcoded
- `DATABASE_URL` auto-injected by Railway PostgreSQL plugin

---

## Environment Variables

```
SECRET_KEY=
DATABASE_URL=
ALLOWED_HOSTS=
GROQ_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS={"PHD": "", "Bondhu": "", "CIPRB": ""}
FERNET_KEY=
KOBO_WEBHOOK_SECRET=
KOBO_ASSET_UID_MPDSR=placeholder
KOBO_ASSET_UID_FISTULA=placeholder
KOBO_ASSET_UID_ACTIVITY=placeholder
KOBO_ASSET_UID_BASELINE=placeholder
KOBO_SERVER_URL=https://kobo.humanitarianresponse.info
# Reserved for future pull-based sync. Current architecture uses
# webhook-push via KOBO_ASSET_UID_* vars. Read but unused today.
KOBO_API_TOKEN=
```

---

## What You Must Never Do

- Never put PII in Groq API calls — strip with regex first
- Never use spaCy — too memory-heavy for Railway Hobby
- Never hardcode credentials
- Never bypass org-level queryset filtering
- Never start a new module without confirming with Rafi
- Never assume a requirement — ask

---

## Start Here

1. Propose the full folder and file structure for the project
2. List every environment variable you will need
3. Ask Rafi if anything is unclear before writing the first line of code
4. Then build `accounts` first — nothing else works without auth
