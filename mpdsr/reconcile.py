"""Reconcile every CIPRB Kobo form against the app — the guard that would have
caught the 90 stranded death records.

The signal is computed by the handlers themselves, so there is no key logic to
keep in sync and get wrong. For each form we:

  1. count the app rows that form owns right now,
  2. replay every current Kobo submission through the real handler INSIDE a
     savepoint,
  3. count again, then roll the savepoint back.

A submission that already became a row upserts to NO new row; a submission that
was stranded (never delivered, or the handler 500ed) has no row yet, so the
handler CREATES one. The number of rows created during the replay is therefore
exactly how many Kobo submissions are missing from the app right now. Zero means
everything in Kobo is represented; a positive number is live data loss.

It also reads each form's Kobo webhook delivery health (guard 2) so a hook that
is failing to deliver shows up on the same surface.

MUST run where the real (prod) DB is reachable — on an empty/local DB every
payload looks "stranded". The command wraps this so the replay is rolled back and
only the snapshot persists.
"""
import os

import requests
from django.db import transaction
from django.utils import timezone

from programs.ciprb_replay import CIPRB_SLUG_TO_UID, _fetch
from programs.webhook import FORM_HANDLERS, _flatten_group_keys, _geolocation

KOBO_BASE = 'https://kf.kobotoolbox.org/api/v2'

# Submissions made before the production go-live are practice/pilot data that
# was deliberately flushed from the prod DB (full clean-slate wipe 2026-06-28,
# per Rafi: "no data before the go live is needed"). The 8 preserved near-miss
# pilot subs on the Kobo asset are exactly this. They are NOT missing data, so
# the reconciliation must not count them as stranded.
GO_LIVE_CUTOFF = os.environ.get('RECON_IGNORE_BEFORE', '2026-06-28')


def _is_live(sub):
    """True if this Kobo submission was made on/after the go-live cutoff."""
    ts = str(sub.get('_submission_time') or '')
    # ISO timestamps compare correctly as strings ('2026-06-27T…' < '2026-06-28').
    # A submission with NO timestamp is treated as live — never silently ignore
    # data we can't date.
    return not ts or ts >= GO_LIVE_CUTOFF


def _counter(slug):
    """A callable returning the current app-row count that `slug` owns."""
    from mpdsr.models import MPDSRCase, MPDSRAction
    from mpdsr.ciprb_models import MPDSRDeathNotification, MaternalNearMissCase
    from fistula.ciprb_models import CIPRBFistulaCase
    from fistula.models import FistulaCampaign

    def mpdsr_case(sub):
        return lambda: MPDSRCase.objects.filter(sub_form_type=sub).count()

    def notif(variant):
        return lambda: MPDSRDeathNotification.objects.filter(slip_variant=variant).count()

    return {
        'ciprb_mpdsr_community_maternal_v1': mpdsr_case('f1'),
        'ciprb_mpdsr_community_neonatal_v1': mpdsr_case('f2'),
        'ciprb_mpdsr_facility_maternal_v1':  mpdsr_case('f4'),
        'ciprb_mpdsr_facility_neonatal_v1':  mpdsr_case('f5'),
        'ciprb_social_autopsy_v1':           mpdsr_case('sa_md'),
        'ciprb_notification_slip_01_v1':     notif('01'),
        'ciprb_notification_slip_02_v1':     notif('02'),
        'ciprb_near_miss_v1':                MaternalNearMissCase.objects.count,
        'ciprb_fistula_questions_v1':        CIPRBFistulaCase.objects.count,
        'ciprb_fistula_campaign_v1':         FistulaCampaign.objects.count,
        'ciprb_mpdsr_response_plan_v1':      MPDSRAction.objects.count,
    }.get(slug)


def _hook_health(uid, token):
    """Per-asset webhook delivery health (guard 2). Read-only."""
    try:
        hooks = requests.get('%s/assets/%s/hooks/?format=json' % (KOBO_BASE, uid),
                             headers={'Authorization': 'Token ' + token},
                             timeout=60).json().get('results', [])
    except Exception as exc:  # noqa: BLE001
        return {'hook_active': None, 'hook_error': str(exc)[:120]}
    active = [h for h in hooks if h.get('active')]
    return {
        'hook_active': bool(active),
        'hook_endpoint_ok': all('web-production-091fa' in (h.get('endpoint') or '')
                                for h in active) if active else None,
        # Kobo never resets these counters, so this is cumulative-lifetime, shown
        # for context — the authoritative "missing now" signal is `stranded`.
        'failed_lifetime': sum(int(h.get('failed_count') or 0) for h in active),
        'pending': sum(int(h.get('pending_count') or 0) for h in active),
    }


def reconcile_ciprb(token, limit=None):
    """Compute the per-form reconciliation. Replays inside a savepoint that is
    rolled back here, so this function does NOT persist the replayed rows — but it
    must run inside an outer transaction the CALLER manages (so the savepoint has
    a parent). Returns a list of per-form dicts.
    """
    counters = _counter
    results = []
    for slug, uid in CIPRB_SLUG_TO_UID.items():
        handler = FORM_HANDLERS.get(slug)
        count_fn = counters(slug)
        if handler is None or count_fn is None:
            results.append({'slug': slug, 'error': 'no handler/counter'})
            continue

        subs = [s for s in _fetch(uid, token, limit) if _is_live(s)]
        before = count_fn()
        crashes = []
        sp = transaction.savepoint()
        for s in subs:
            payload = _flatten_group_keys(s)
            lat, lng = _geolocation(payload)
            try:
                with transaction.atomic():
                    handler(payload, lat, lng)
            except Exception as exc:  # noqa: BLE001
                crashes.append({'id': s.get('_id'), 'error': str(exc)[:160]})
        after = count_fn()
        transaction.savepoint_rollback(sp)   # discard everything the replay wrote

        stranded = max(0, after - before)
        rec = {
            'slug': slug,
            'uid': uid,
            'kobo_count': len(subs),
            'app_rows': before,
            # Rows the handlers had to create = submissions missing from the app.
            'stranded': stranded,
            'crashes': len(crashes),
            'crash_detail': crashes[:5],
            'ok': stranded == 0 and not crashes,
        }
        rec.update(_hook_health(uid, token))
        results.append(rec)
    return results


def latest_snapshot():
    from mpdsr.models import CIPRBReconSnapshot
    return CIPRBReconSnapshot.objects.order_by('-run_at').first()


def run_and_store(token, limit=None):
    """Run the reconciliation and persist ONE snapshot. The replay is rolled back
    inside reconcile_ciprb; the snapshot write below is what the outer atomic
    commits."""
    from mpdsr.models import CIPRBReconSnapshot
    with transaction.atomic():
        results = reconcile_ciprb(token, limit=limit)
        snap = CIPRBReconSnapshot.objects.create(
            run_at=timezone.now(),
            data={
                'forms': results,
                'total_stranded': sum(r.get('stranded', 0) for r in results),
                'total_crashes': sum(r.get('crashes', 0) for r in results),
                'all_ok': all(r.get('ok') for r in results if 'ok' in r),
            },
        )
    return snap
