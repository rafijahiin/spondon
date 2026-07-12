"""Adapter: run the vendored FSW anomaly engine over our Kobo submissions.

Our `KoboSubmission.raw_data` is nested Kobo JSON keyed by xform FIELD NAMES
(`grp_admin/dc_code`, `b109` as a space-separated code string, a geopoint packed
as "lat lon alt acc"). The engine (see baseline/fsw_rules.py) is written against
flat records where select_multiple answers are split into `Question/Choice`
columns and a few identity fields are resolvable. This module bridges the two:

  * flatten group keys,
  * decode the select_one fields whose rules read the answer as TEXT
    (consent, b103 living arrangement, b105 duration category),
  * expand every select_multiple into `Label/ChoiceLabel` columns so the
    mutually-exclusive / "Other"-without-specify / Q9.5>5 rules can see them,
  * inject the enumerator NAME (from the roster, never the Kobo login),
    the GPS lat/lon/precision (parsed from the geopoint), and a total expenses,
  * pin an EXPLICIT field map (README: lock resolved keys so a wording change
    cannot silently remap a field).

Raw Kobo data is never modified — we build throwaway dicts for the scan.
"""
import logging

from django.core.cache import cache

from submissions.flatten import flatten_group_keys
from submissions.models import FormType, KoboSubmission

from .collectors import collector_name
from .fsw_rules import FieldMap, build_fsw_engine
from .populations import resolve_population
from .schema import load_schema

logger = logging.getLogger(__name__)

CACHE_KEY = 'baseline:fsw:anomalies:v1'
CACHE_SECONDS = 300  # 5 minutes; invalidated on new baseline ingest (see signals)

# select_one fields whose rule logic inspects the answer as free text, so the
# engine needs the decoded label, not the stored choice code.
_DECODE_AS_LABEL = ('consent', 'b103', 'b105')

# Monthly expense is split across these category fields; the engine wants a total.
_EXPENSE_FIELDS = ('b110_broker', 'b110_commission', 'b110_debt',
                   'b110_family', 'b110_fees', 'b110_food', 'b110_rent',
                   'b110_other', 'b110_children', 'b110_health')


def _san(label):
    """The engine uses '/' as the Question/Choice separator, but Kobo choice and
    question labels contain slashes ("Small business/trade", "Hepatitis B/C").
    Neutralise them so a group isn't fragmented at the wrong slash. Must be applied
    identically wherever a label becomes part of a column key (see _fsw_field_map)."""
    return str(label).replace('/', '-')


def _num(v):
    try:
        return float(str(v).replace(',', '').strip())
    except (TypeError, ValueError):
        return None


def _parse_geopoint(value):
    """Kobo packs a geopoint as "lat lon altitude accuracy". Return
    (lat, lon, accuracy_m) or (None, None, None)."""
    if not value:
        return None, None, None
    parts = str(value).split()
    if len(parts) < 2:
        return None, None, None
    lat, lon = _num(parts[0]), _num(parts[1])
    acc = _num(parts[3]) if len(parts) >= 4 else None
    return lat, lon, acc


def _shape_record(sub, schema):
    """One KoboSubmission -> a flat dict the engine understands. Pure; the
    submission's raw_data is left untouched."""
    raw = flatten_group_keys(sub.raw_data or {})
    labels = schema.get('labels', {})
    choices = schema.get('choices', {})
    types = schema.get('types', {})

    rec = {}
    for field, value in raw.items():
        t = str(types.get(field, ''))
        if t.startswith('select_multiple'):
            # Expand "1 3" -> {"<label>/<choice1>": "1", "<label>/<choice3>": "1"}.
            parent = _san(labels.get(field, field))
            cmap = choices.get(field, {})
            for code in str(value).split() if value not in (None, '') else []:
                rec[f'{parent}/{_san(cmap.get(str(code), code))}'] = '1'
        elif t.startswith('select_one') and field in _DECODE_AS_LABEL:
            rec[field] = choices.get(field, {}).get(str(value), value)
        else:
            rec[field] = value

    # Identity + metadata the engine resolves by exact key.
    dc = raw.get('dc_code')
    rec['_uuid'] = raw.get('_uuid') or raw.get('submission_id') or str(sub.id)
    rec['__version__'] = raw.get('__version__') or ''
    rec['site_code'] = raw.get('site_code') or ''
    rec['enumerator_name'] = (
        collector_name('fsw', dc)
        or (f'Collector {dc}' if dc not in (None, '') else 'Unknown')
    )

    # GPS from the geopoint, falling back to the parsed model columns.
    lat, lon, acc = _parse_geopoint(raw.get('location') or raw.get('geopoint')
                                    or raw.get('gps'))
    if lat is None and sub.latitude is not None and sub.longitude is not None:
        lat, lon = float(sub.latitude), float(sub.longitude)
    rec['latitude'], rec['longitude'] = lat, lon
    if acc is not None:
        rec['gps_precision'] = acc

    # Total monthly expenses across the category fields (only if any present).
    exp = [x for x in (_num(raw.get(f)) for f in _EXPENSE_FIELDS) if x is not None]
    if exp:
        rec['expenses_total'] = sum(exp)
    return rec


def _fsw_field_map(schema):
    """Explicit, pinned map from engine roles to our field names."""
    b109_label = _san(schema.get('labels', {}).get('b109', 'b109'))
    return FieldMap(
        record_id='_uuid',
        enumerator='enumerator_name',
        site='site_code',
        version='__version__',
        consent='consent',
        interview_start='interview_start',
        interview_end='interview_end_actual',     # the in-form end stamp only
        age_screening='s1_age',
        age_demographic='a203',
        children_total='a213',
        children_with_respondent='a214',
        children_other_location='a215',
        living_arrangement='b103',
        sex_work_start_age='b104',
        sex_work_years='b105',
        sex_work_income='b108',
        other_income_none=f'{b109_label}/None',
        expenses_total='expenses_total',
        latitude='latitude',
        longitude='longitude',
        gps_precision='gps_precision',
        observation=None,                          # FSW form has no observation field
        headers=(),                                # filled by build_fsw_engine
    )


def _fsw_submissions():
    qs = KoboSubmission.objects.filter(form_type=FormType.BASELINE)
    return [s for s in qs if resolve_population(flatten_group_keys(s.raw_data or {}),
                                                default='') == 'fsw']


def _current_version(records):
    """The live form version = the most common __version__ among records that
    carry the in-form end stamp (i.e. were taken on the current form)."""
    from collections import Counter
    versions = Counter(
        r.get('__version__') for r in records
        if r.get('interview_end_actual') and r.get('__version__'))
    return versions.most_common(1)[0][0] if versions else None


def build_report(*, force=False):
    """Scan every FSW submission and return the engine report (cached 5 min).
    Adds `resolved_fields` and `current_version` for transparency/debugging."""
    if not force:
        cached = cache.get(CACHE_KEY)
        if cached is not None:
            return cached

    schema = load_schema().get('fsw', {})
    records = [_shape_record(s, schema) for s in _fsw_submissions()]
    headers = sorted({k for r in records for k in r})
    field_map = _fsw_field_map(schema)
    current_version = _current_version(records)

    engine, field_map = build_fsw_engine(
        headers, current_version=current_version, gps_outlier_km=1.5,
        field_map=field_map,
    )
    report = engine.scan(records)
    report['current_version'] = current_version
    report['resolved_fields'] = {k: v for k, v in field_map.__dict__.items()
                                 if k != 'headers'}

    cache.set(CACHE_KEY, report, CACHE_SECONDS)
    return report


def invalidate_cache():
    cache.delete(CACHE_KEY)
