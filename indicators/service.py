"""
Indicator compute service.

INDICATOR_REGISTRY maps each indicator_code to its compute function.
get_indicator_value()    → runs the function, returns raw number
get_indicator_progress() → returns {actual, target, pct, unit, label}

Results are cached for 1 hour per (org, code, period_start, period_end).
"""
import logging
from decimal import Decimal
from django.core.cache import cache

from .bandhu import (
    compute_I_BND_1_1, compute_I_BND_1_2, compute_I_BND_1_3,
    compute_I_BND_1_4A, compute_I_BND_1_4B, compute_I_BND_1_5,
    compute_I_BND_1_5_centers, compute_I_BND_1_6, compute_I_BND_1_7,
    compute_I_BND_1_8, compute_I_BND_1_9, compute_I_BND_2_1,
    compute_I_BND_2_2, compute_I_BND_2_3, compute_I_BND_2_4,
    compute_I_BND_2_5, compute_I_BND_4_1,
)
from .phd import (
    compute_I_PHD_1_1, compute_I_PHD_1_2, compute_I_PHD_1_3,
    compute_I_PHD_1_4, compute_I_PHD_1_5A, compute_I_PHD_1_5B,
    compute_I_PHD_1_5C, compute_I_PHD_1_5D, compute_I_PHD_1_5E,
    compute_I_PHD_1_6, compute_I_PHD_1_7, compute_I_PHD_1_8,
    compute_I_PHD_1_9, compute_I_PHD_2_1, compute_I_PHD_2_2,
    compute_I_PHD_2_3, compute_I_PHD_2_4,
)

logger = logging.getLogger(__name__)

CACHE_TTL = 3600  # 1 hour

# Functions that take only (org) — no period args
_ORG_ONLY_CODES = {
    'BND_1_5_centers', 'BND_1_6', 'BND_1_8',
    'PHD_1_7', 'PHD_1_9',
}

# ─── Registry ──────────────────────────────────────────────────────────────────

INDICATOR_REGISTRY: dict[str, callable] = {
    # Bandhu
    'BND_1_1':        compute_I_BND_1_1,
    'BND_1_2':        compute_I_BND_1_2,
    'BND_1_3':        compute_I_BND_1_3,
    'BND_1_4A':       compute_I_BND_1_4A,
    'BND_1_4B':       compute_I_BND_1_4B,
    'BND_1_5':        compute_I_BND_1_5,
    'BND_1_5_centers': compute_I_BND_1_5_centers,
    'BND_1_6':        compute_I_BND_1_6,
    'BND_1_7':        compute_I_BND_1_7,
    'BND_1_8':        compute_I_BND_1_8,
    'BND_1_9':        compute_I_BND_1_9,
    'BND_2_1':        compute_I_BND_2_1,
    'BND_2_2':        compute_I_BND_2_2,
    'BND_2_3':        compute_I_BND_2_3,
    'BND_2_4':        compute_I_BND_2_4,
    'BND_2_5':        compute_I_BND_2_5,
    'BND_4_1':        compute_I_BND_4_1,
    # PHD
    'PHD_1_1':        compute_I_PHD_1_1,
    'PHD_1_2':        compute_I_PHD_1_2,
    'PHD_1_3':        compute_I_PHD_1_3,
    'PHD_1_4':        compute_I_PHD_1_4,
    'PHD_1_5A':       compute_I_PHD_1_5A,
    'PHD_1_5B':       compute_I_PHD_1_5B,
    'PHD_1_5C':       compute_I_PHD_1_5C,
    'PHD_1_5D':       compute_I_PHD_1_5D,
    'PHD_1_5E':       compute_I_PHD_1_5E,
    'PHD_1_6':        compute_I_PHD_1_6,
    'PHD_1_7':        compute_I_PHD_1_7,
    'PHD_1_8':        compute_I_PHD_1_8,
    'PHD_1_9':        compute_I_PHD_1_9,
    'PHD_2_1':        compute_I_PHD_2_1,
    'PHD_2_2':        compute_I_PHD_2_2,
    'PHD_2_3':        compute_I_PHD_2_3,
    'PHD_2_4':        compute_I_PHD_2_4,
}


def _cache_key(org: str, code: str, period_start, period_end) -> str:
    return f'indicator:{org}:{code}:{period_start}:{period_end}'


def get_indicator_value(org: str, code: str, period_start=None, period_end=None) -> int | float:
    """
    Compute and return the raw indicator value.
    Caches for CACHE_TTL seconds.
    Returns 0 on error (logged).
    """
    fn = INDICATOR_REGISTRY.get(code)
    if fn is None:
        logger.warning('Unknown indicator code: %s', code)
        return 0

    cache_key = _cache_key(org, code, period_start, period_end)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        if code in _ORG_ONLY_CODES:
            value = fn(org)
        else:
            if period_start is None or period_end is None:
                raise ValueError(f'period_start and period_end required for {code}')
            value = fn(org, period_start, period_end)
    except Exception:
        logger.exception('Error computing indicator %s for org %s', code, org)
        value = 0

    cache.set(cache_key, value, CACHE_TTL)
    return value


def get_indicator_progress(
    org: str, code: str, period_start=None, period_end=None
) -> dict:
    """
    Returns a progress dict:
    {
        'code':        str,
        'actual':      int | float,
        'target':      float | None,
        'pct':         float | None,      # 0–100+
        'unit':        str,
        'label':       str,
        'on_track':    bool | None,
    }
    """
    from .models import IndicatorTarget

    actual = get_indicator_value(org, code, period_start, period_end)

    target_obj = IndicatorTarget.objects.filter(
        organisation=org,
        indicator_code=code,
        is_active=True,
    ).order_by('-period_start').first()

    if target_obj is None:
        return {
            'code': code,
            'actual': actual,
            'target': None,
            'pct': None,
            'unit': 'count',
            'label': code,
            'on_track': None,
        }

    target = float(target_obj.target_value)
    pct = round((actual / target) * 100, 1) if target > 0 else None

    # "on track" = ≥ 80% of period elapsed → ≥ 80% of target achieved
    # Simple threshold: pct ≥ 75 = on track
    on_track = (pct >= 75) if pct is not None else None

    return {
        'code': code,
        'actual': actual,
        'target': target,
        'pct': pct,
        'unit': target_obj.unit,
        'label': target_obj.indicator_name,
        'on_track': on_track,
    }


def get_all_indicators_for_org(org: str, period_start, period_end) -> list[dict]:
    """
    Returns get_indicator_progress() for every indicator belonging to this org.
    Used by Bandhu/PHD dashboard pages.
    """
    from .models import IndicatorTarget

    targets = IndicatorTarget.objects.filter(
        organisation=org, is_active=True
    ).order_by('indicator_code')

    results = []
    for t in targets:
        code = t.indicator_code
        is_org_only = code in _ORG_ONLY_CODES
        result = get_indicator_progress(
            org=org,
            code=code,
            period_start=None if is_org_only else period_start,
            period_end=None if is_org_only else period_end,
        )
        result['objective'] = t.objective
        result['activity_ref'] = t.activity_ref
        results.append(result)

    return results


def invalidate_indicator_cache(org: str, code: str, period_start=None, period_end=None):
    """Call this after a manager approves a submission."""
    key = _cache_key(org, code, period_start, period_end)
    cache.delete(key)
