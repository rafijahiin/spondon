# CIPRB dashboard — semantic decisions ledger

Every row below is a choice about **what a term means** on the `/ciprb` dashboard
that is *not* forced by the data and could be wrong. Each was a candidate for the
kind of silent misinterpretation that this month put backwards and fabricated
numbers on the screen (CDN/FDN by place instead of slip; `notified_md = f1+f2`).

**Why this file exists:** a wrong number traced to a *reconciliation* gap is
caught by the reconciliation guard; a wrong number traced to a *meaning* is only
caught by a human who knows the domain. This ledger makes each meaning explicit,
names who owns it, and records whether it is confirmed — so a reviewer can check
the interpretation, not just the arithmetic.

**How it is enforced:** `mpdsr/test_semantics_ledger.py` parses the Ledger table
and asserts every `Anchor` string still exists in its `File`. If code that
implements a decision is rewritten and the anchor disappears, the test fails —
forcing whoever changed it to re-confirm the meaning and update this row, rather
than let the meaning drift unnoticed. Adding a new interpretive decision without
a row here is a review miss, not a test failure.

**Status legend:** `confirmed` = signed off by the named authority;
`pending` = implemented on a best reading, awaiting the authority; `derived` =
the form has no direct question, the value is computed from a documented rule.

---

## Ledger

| Key | Decision | File | Anchor | Authority | Status |
|-----|----------|------|--------|-----------|--------|
| CDN/FDN | Community vs facility notification = **which slip was filed** (Slip 01 = community/CHW, Slip 02 = facility), NOT place of death. Slip 02 has no place field. | mpdsr/views.py | `slip_variant=MPDSRDeathNotification.SLIP_01` | CIPRB (verbatim forms) | confirmed |
| Reporting period | The `/ciprb` period toggle filters on **`created_at`** (when the case entered surveillance), not `date_of_death` — MPDSR reviews deaths retrospectively. | mpdsr/views.py | `created_at__date__gte` | Animesh | pending |
| Reviewed ≠ notified | Review counts and notified counts are **separate sources** and are never derived from each other (the fabricated `notified_md = f1 + f2` is gone). | mpdsr/views.py | `review_counts = {r['sub_form_type']` | CIPRB | confirmed |
| SA maternal-only | The Social Autopsy tile is titled "(Maternal Death)"; it counts **maternal SA re-reviews only** (`sa_md_maternal`), excluding the ~3/17 neonatal autopsies. | mpdsr/views.py | `review_counts['sa_md_maternal']` | Animesh | pending |
| Indicator cohort | The 11 MPDSR "major indicators" are maternal-death indicators from **Form 01 + Form 04 only** (`death_type=maternal AND sub_form_type in f1,f4`); drops f2/f5/sa_md. | mpdsr/views.py | `sub_form_type__in=['f1', 'f4']` | Animesh | confirmed |
| Cause split by form | The two maternal cause-of-death charts split by **source form** (f1 community / f4 facility), NOT place of death. | frontend/src/components/ciprb/MPDSRVisualizations.tsx | `c.sub_form_type === 'f1'` | CIPRB | confirmed |
| f3/f6 excluded | F3 (community stillbirth review) + F6 (facility stillbirth review) are **excluded from every dashboard surface**; rows are retained in the DB for audit. | mpdsr/views.py | `exclude(sub_form_type__in=['f3', 'f6'])` | Animesh | confirmed |
| Reporting-rate denominators | Estimated deaths use fixed ratios per live birth: MD 136/100 000, ND 20/1 000, SB 21/1 000. Reporting rate = notified / estimated. | frontend/src/components/ciprb/MPDSRVisualizations.tsx | `Live Birth × 136` | MPDSR M&E Framework (via CIPRB) | confirmed |
| Neonatal panel cohort | "Neonatal Deaths" counts **all perinatal** cases in scope (f2 + f5 + Social-Autopsy perinatal), f3/f6 excluded. Whether SA perinatal belongs here is open. | mpdsr/views.py | `death_type=DeathType.PERINATAL` | Animesh | pending |
| Place coarsening (review) | Rich per-form place-of-death values are coarsened to HOME / IN_TRANSIT / FACILITY by substring; any unmatched non-empty value → FACILITY. | programs/ciprb_handlers.py | `case.place_of_death = PlaceOfDeath.FACILITY` | CIPRB | confirmed |
| Place coarsening (slip) | Slip-01 place choice → coarse enum: `on_the_way`→IN_TRANSIT, `govt_facility`+`private_ngo`→FACILITY, unmatched→'' (blank, NOT facility). | programs/ciprb_handlers.py | `def _ns_place(payload)` | CIPRB | confirmed |
| Consent | Only an **explicit** consent "No" triggers de-identification (facility/narrative/action-plan withheld). Absent or "unknown" is not a refusal. | programs/ciprb_handlers.py | `consent_refused = (_bool(payload.get('consent_given')) is False)` | CIPRB | confirmed |
| SA death type | Social Autopsy `sa_death_type` 1/2/3 collapses to MATERNAL(==1) vs PERINATAL(else) — neonatal and stillbirth SA both become PERINATAL. | programs/ciprb_handlers.py | `DeathType.MATERNAL if _s(payload.get('sa_death_type')) == '1'` | CIPRB | confirmed |
| Fistula stage monotonic | `current_stage` never regresses — a later-arriving earlier-stage submission does not roll the case back; underpins the cumulative funnel. | programs/ciprb_handlers.py | `stage_order` | CIPRB | confirmed |
| Baseline indicator | The home "Baseline records entered" indicator counts verified `BaselineResponse` rows (post-verification) — replacing a broken import of a deleted model. | indicators/ciprb.py | `from baseline.models import BaselineResponse` | CIPRB | confirmed |
| District canonicalisation | District slugs are Title-cased so live submissions match seed/Excel rows (all 18 CIPRB districts are single words). | programs/ciprb_handlers.py | `raw.replace('_', ' ').title()` | CIPRB | confirmed |
| MNM primary cause | The Near-Miss "primary cause" is **derived** (the form has no single primary-cause question): first "present" item in a fixed clinical-priority order. | programs/ciprb_handlers.py | `_MNM_CAUSE_PRIORITY` | CIPRB | derived |
| MNM screening flag | WHO 0–4 criterion codes collapse to a boolean: 1/2/3 → True (present at some point), 0 → False, 4/blank → None (unknown). | programs/ciprb_handlers.py | `def _mnm_flag(v)` | WHO MNM (via CIPRB) | confirmed |
| facility_totals null | An empty `MPDSRFacilityCount` returns `facility_totals = None` (not a truthy zero-dict) so the frontend fallback to live slips actually fires. | mpdsr/views.py | `facility_totals = None` | CIPRB (correctness contract) | confirmed |
| Notification source pref | The CDN/FDN level panel prefers Sayeed's Excel ingest when present (whole-programme), falling back to live Kobo slips when the table is empty. | mpdsr/views.py | `notification_by_level_source` | Animesh | confirmed |

---

## Open items (status = pending) — need the named authority's sign-off

- **Reporting period = entered surveillance (created_at).** Under death-date
  semantics the contract window would start in January and show different totals.
  Animesh to confirm which the dashboard should mean.
- **SA maternal-only tile** and **SA perinatal in the Neonatal panel.** Whether
  Social-Autopsy re-reviews count alongside the primary review forms is Animesh's
  call; today SA maternal is shown as its own tile and SA perinatal is inside the
  neonatal total.
- The **40-minute baseline interview threshold** (a baseline, not CIPRB-dashboard,
  decision) remains pending Nuruzzaman's pilot timing — tracked separately.
