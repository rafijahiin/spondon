"""Baseline fieldwork + data-quality monitoring.

Unlike insights.py (which summarises the SUBSTANTIVE answers of VERIFIED
interviews), this reads EVERY collected baseline submission — pending and
approved — because monitoring is about the data collection itself: pace against
target, per-site and per-enumerator throughput, interview duration and outcome,
and the quality flags that decide whether the dataset can be trusted.

Signals come from the fields the forms now capture: interview_start /
interview_end (device timestamps → duration), dc_code (data collector),
c3 (interview outcome), submission_id (dedup), GPS, and submitted_at.
"""
from collections import Counter, defaultdict
from datetime import datetime

from submissions.flatten import flatten_group_keys

from .collectors import collector_name
from .populations import resolve_population

# Sample-size targets per key population. UNKNOWN until the protocol sets them —
# leave blank so the dashboard shows collected COUNTS, not a fake % of target.
# Fill in (e.g. {'hijra': 250, 'fsw': 250}) once CIPRB confirms the sample size.
TARGETS: dict = {}

OUTCOME_LABEL = {'1': 'Completed', '2': 'Partial', '3': 'Refused', '4': 'Interrupted'}
DURATION_BANDS = [(0, 10, '<10m'), (10, 20, '10–20m'), (20, 30, '20–30m'),
                  (30, 40, '30–40m'), (40, 50, '40–50m'), (50, 60, '50–60m'),
                  (60, 10 ** 6, '60m+')]
# The baseline is a ~50-minute CAPI interview. Anything materially shorter was
# not administered in full, so CIPRB treats under 40 minutes as rushed.
SHORT_MINUTES = 40
# Duration is measured from CONSENT to SUBMIT. If the enumerator consents, then
# leaves the form open and submits hours later, that span is their working
# session, not the interview. Anything over this is flagged as "form left open"
# and excluded from the TYPICAL length, so it can't quietly inflate the average.
LONG_MINUTES = 120


def _parse_dt(v):
    if not v:
        return None
    s = str(v).strip().replace('Z', '')
    for fmt in ('%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S',
                '%Y-%m-%dT%H:%M'):
        try:
            return datetime.strptime(s[:26], fmt)
        except (ValueError, TypeError):
            continue
    # tolerate a trailing timezone offset like +06:00
    try:
        return datetime.fromisoformat(s.split('+')[0])
    except (ValueError, TypeError):
        return None


def _duration_min(raw):
    a, b = _parse_dt(raw.get('interview_start')), _parse_dt(raw.get('interview_end'))
    if not a or not b:
        return None
    m = (b - a).total_seconds() / 60.0
    return round(m, 1) if 0 < m < 600 else None


def _band(v, bands):
    for lo, hi, lab in bands:
        if lo <= v < hi:
            return lab
    return None


def _median(xs):
    if not xs:
        return None
    s = sorted(xs)
    n = len(s)
    return round((s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2), 1)


def compute_monitoring(subs):
    """`subs`: iterable of baseline KoboSubmission (all statuses). Returns a
    chart-ready fieldwork + quality dict."""
    total = 0
    by_pop = Counter()
    by_status = Counter()
    district = Counter()
    site = Counter()
    outcomes = Counter()
    daily = defaultdict(Counter)          # date -> {hijra, fsw}
    day_flags = defaultdict(lambda: {'hijra': 0, 'fsw': 0, 'total': 0,
                                     'completed': 0, 'partial': 0, 'refused': 0,
                                     'interrupted': 0, 'rushed': 0, 'gps_missing': 0})
    dur_band = Counter()
    durations = []
    gps_ok = gps_missing = 0
    coll = defaultdict(lambda: {'n': 0, 'dur': [], 'complete': 0, 'short': 0, 'long': 0, 'pop': Counter()})
    id_rows = defaultdict(list)   # submission_id -> the records sharing it
    short_rows = []
    long_rows = []
    points = []

    for s in subs:
        # Kobo stores grouped answers as 'group/field' — flatten so dc_code,
        # population, c3, submission_id and every field below actually resolve.
        raw = flatten_group_keys(s.raw_data or {})
        # Resolved from the source form, not defaulted (see baseline/populations.py).
        pop = resolve_population(raw, default='hijra')
        total += 1
        by_pop[pop] += 1
        by_status[(s.status or 'PENDING')] += 1
        dist = (raw.get('district') or s.district or '').strip().title()
        if dist:
            district[dist] += 1
        sc = raw.get('site_code')
        if sc:
            site[str(sc)] += 1

        oc = str(raw.get('c3') or '')
        if oc:
            outcomes[OUTCOME_LABEL.get(oc, oc)] += 1

        when = _parse_dt(raw.get('interview_end')) or s.submitted_at
        dkey = when.strftime('%Y-%m-%d') if when else None
        if dkey:
            daily[dkey][pop] += 1
            df = day_flags[dkey]
            df[pop] += 1
            df['total'] += 1
            ok = {'1': 'completed', '2': 'partial', '3': 'refused', '4': 'interrupted'}.get(oc)
            if ok:
                df[ok] += 1

        dm = _duration_min(raw)
        if dm is not None:
            durations.append(dm)
            b = _band(dm, DURATION_BANDS)
            if b:
                dur_band[b] += 1

        lat, lng = s.latitude, s.longitude
        if lat is not None and lng is not None:
            gps_ok += 1
            points.append({'lat': float(lat), 'lng': float(lng), 'pop': pop,
                           'district': dist, 'outcome': OUTCOME_LABEL.get(oc, '')})
        else:
            gps_missing += 1
            if dkey:
                day_flags[dkey]['gps_missing'] += 1

        # Collector identity comes from INSIDE the form, never the Kobo account
        # username. The live forms ask "Data Collector" as a select_one, so the
        # submission stores only the CODE (dc_code = '1', '2', …) — resolve it to
        # the enumerator's name via the shared roster, otherwise the roster would
        # read "1", "2", "3". dc_name / interviewer_name_code are honoured first
        # (older form versions + the demo seed write them). Un-tagged submissions
        # read 'Unknown', never the Kobo login.
        dc = str(raw.get('dc_name') or raw.get('interviewer_name_code') or '').strip()
        if not dc:
            code = raw.get('dc_code')
            dc = collector_name(pop, code) or (f'Collector {code}' if code not in (None, '') else '')
        dc = dc or 'Unknown'
        c = coll[dc]
        c['n'] += 1
        c['pop'][pop] += 1
        if dm is not None:
            c['dur'].append(dm)
        if oc == '1':
            c['complete'] += 1
        if dm is not None and dm < SHORT_MINUTES:
            c['short'] += 1
            short_rows.append({'collector': dc, 'district': dist, 'minutes': dm,
                               'population': pop, 'date': dkey or ''})
            if dkey:
                day_flags[dkey]['rushed'] += 1
        if dm is not None and dm > LONG_MINUTES:
            c['long'] += 1
            long_rows.append({'collector': dc, 'district': dist, 'minutes': dm,
                              'population': pop, 'date': dkey or ''})

        # A duplicate is the SAME interview uploaded more than once: submission_id
        # is a per-form-instance id (collector + area + the moment the interview
        # was opened), so a repeat means the same questionnaire was submitted twice
        # — a double-tap on Submit, or a saved draft re-sent. Keep the offending
        # records so the dashboard can SHOW which ones to go and fix in Kobo.
        sid = raw.get('submission_id')
        if sid:
            id_rows[str(sid)].append({
                'collector': dc, 'district': dist, 'population': pop,
                'date': dkey or '', 'minutes': dm,
            })

    # ── shape outputs ──
    def buckets(counter, top=None):
        items = counter.most_common(top)
        return [{'name': k, 'value': v} for k, v in items]

    collectors = []
    for dc, c in sorted(coll.items(), key=lambda kv: -kv[1]['n']):
        collectors.append({
            'code': dc, 'n': c['n'],
            'avg_min': round(sum(c['dur']) / len(c['dur']), 1) if c['dur'] else None,
            'completion_pct': round(100 * c['complete'] / c['n']) if c['n'] else 0,
            'short': c['short'], 'long': c['long'],
            'hijra': c['pop'].get('hijra', 0), 'fsw': c['pop'].get('fsw', 0),
        })

    # `duplicates` counts the EXTRA copies (3 uploads of one interview = 2 extras),
    # and duplicate_rows names them so the team can act instead of guessing.
    dup_groups = {sid: rows for sid, rows in id_rows.items() if len(rows) > 1}
    duplicates = sum(len(rows) - 1 for rows in dup_groups.values())
    duplicate_rows = sorted(
        ({'submission_id': sid, 'count': len(rows), 'records': rows}
         for sid, rows in dup_groups.items()),
        key=lambda g: -g['count'],
    )[:20]
    dup_ids = list(dup_groups)[:20]

    daily_series = [{'date': d, 'hijra': daily[d].get('hijra', 0),
                     'fsw': daily[d].get('fsw', 0),
                     'total': daily[d].get('hijra', 0) + daily[d].get('fsw', 0)}
                    for d in sorted(daily)]

    progress = []
    for pop in ('hijra', 'fsw'):
        tgt = TARGETS.get(pop) or 0
        got = by_pop.get(pop, 0)
        progress.append({'population': pop, 'collected': got,
                         'target': tgt or None,
                         'pct': round(100 * got / tgt) if tgt else None})

    days = [{'date': d, **day_flags[d]} for d in sorted(day_flags)]

    return {
        'total': total,
        'by_status': {k: by_status[k] for k in by_status},
        'progress': progress,
        'targets': TARGETS,
        'outcomes': buckets(outcomes),
        'districts': buckets(district),
        'sites': buckets(site, 15),
        'daily': daily_series,
        'days': days,
        'duration': {
            'bands': [{'name': lab, 'value': dur_band.get(lab, 0)}
                      for _, _, lab in DURATION_BANDS],
            'avg_min': round(sum(durations) / len(durations), 1) if durations else None,
            'median_min': _median(durations),
            # Best estimate of an actual interview: excludes forms left open.
            'typical_min': _median([d for d in durations if d <= LONG_MINUTES]),
            'measured': len(durations),
        },
        'collectors': collectors,
        'quality': {
            'gps_ok': gps_ok, 'gps_missing': gps_missing,
            'gps_pct': round(100 * gps_ok / total) if total else 0,
            'duplicates': duplicates, 'duplicate_ids': dup_ids,
            'duplicate_rows': duplicate_rows,
            'short_interviews': len(short_rows),
            'short_minutes': SHORT_MINUTES,
            'long_interviews': len(long_rows),
            'long_minutes': LONG_MINUTES,
            'long_rows': sorted(long_rows, key=lambda r: -r['minutes'])[:20],
            'short_rows': sorted(short_rows, key=lambda r: r['minutes'])[:20],
        },
        'map_points': points,
    }
