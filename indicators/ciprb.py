"""
CIPRB (Centre for Injury Prevention and Research, Bangladesh) indicator
compute functions.

Three activity codes from the fixture:

  F.C    — Fistula Corner: women diagnosed at District Hospital
           Counted from fistula.FistulaCornerCase rows whose
           diagnosis_date falls within the period. Target_value is
           NULL in the seed (workshop confirms).

  F.Camp — Fistula Campaign: suspected fistula cases identified via
           house visits. Counted from fistula.FistulaCampaignVisit
           rows whose visit_date falls within the period.

  B      — Baseline assessment: CIPRB-managed survey instrument. Maps
           to baseline.BaselineSurvey rows (already exists) — kept here
           as a passthrough for completeness even though the legacy
           Baseline webhook auto-approves at the FormType level.
"""
from django.db.models import Q

APPROVED = 'APPROVED'


def compute_F_C(org, period_start, period_end):
    """Fistula Corner — diagnosed cases at District Hospital."""
    from fistula.models import FistulaCornerCase
    return FistulaCornerCase.objects.filter(
        diagnosis_date__range=(period_start, period_end),
    ).count()


def compute_F_Camp(org, period_start, period_end):
    """Fistula Campaign — suspected cases identified via house visits."""
    from fistula.models import FistulaCampaignVisit
    return FistulaCampaignVisit.objects.filter(
        visit_date__range=(period_start, period_end),
    ).count()


def compute_Baseline(org, period_start, period_end):
    """Baseline survey entries during the period."""
    try:
        from baseline.models import BaselineSurvey
    except ImportError:
        return 0
    return BaselineSurvey.objects.filter(
        submission__submitted_at__date__range=(period_start, period_end),
    ).count()


# ─── Activity-code registry ──────────────────────────────────────────────────
# CIPRB rows in the fixture: F.C, F.Camp, B. All have target_value=NULL
# until the workshop confirms — the compute fns still run so the dashboard
# can show "X diagnosed / Not Set" rather than "Module pending".

ACTIVITY_REGISTRY = {
    'F.C':    compute_F_C,
    'F.Camp': compute_F_Camp,
    'B':      compute_Baseline,
}

# All CIPRB activities take (org, period_start, period_end) — no org-only codes.
ORG_ONLY_CODES: set[str] = set()
