"""In-process periodic reconciliation so the CIPRB health strip stays fresh.

Runs `reconcile_ciprb` on a timer and stores a snapshot, which the dashboard
reads via /api/mpdsr/reconciliation/. This is the same pattern as
programs/resync_loop.py (Railway can't add a cron schedule from the CLI), but it
is HEAVIER — each tick pulls every current CIPRB submission for all forms and
replays them through the handlers inside a rolled-back savepoint — so it runs on
a long interval and is OFF by default.

Nothing the tick writes to the domain tables persists: the replay is rolled back
inside a savepoint and only the snapshot row is committed (see
mpdsr.reconcile.run_and_store). It never sends an alert of any kind — the stored
snapshot, surfaced on the dashboard, is the whole point.

Enable with ENABLE_RECON_LOOP=1 on the web service. A Railway cron service
running `python manage.py reconcile_ciprb` on a schedule is an equivalent and
isolation-wise cleaner alternative; running both is harmless (each tick just
writes a fresh snapshot and the newest wins).
"""
import logging
import os
import sys
import threading
import time

logger = logging.getLogger(__name__)

_started = False
_lock = threading.Lock()

# Short-lived manage.py subcommands whose process also calls AppConfig.ready().
# Skip them so the loop only ever runs under a long-lived server (gunicorn).
_ONE_SHOT_COMMANDS = {
    'migrate', 'makemigrations', 'seed_users', 'seed_centers', 'collectstatic',
    'check', 'shell', 'test', 'createsuperuser', 'reconcile_ciprb',
    'replay_ciprb', 'loaddata', 'dumpdata',
}

# Long delay past the boot/migrate window before the first run.
_INITIAL_DELAY_SEC = 180


def _truthy(v) -> bool:
    return str(v or '').strip().lower() in ('1', 'true', 'yes', 'on')


def start_recon_loop() -> None:
    """Start the periodic CIPRB reconciliation daemon once. No-op unless
    ENABLE_RECON_LOOP is set. Safe to call repeatedly (idempotent)."""
    global _started
    if not _truthy(os.environ.get('ENABLE_RECON_LOOP')):
        return
    if not os.environ.get('KOBO_TOKEN'):
        logger.info('recon-loop: KOBO_TOKEN unset — not starting.')
        return
    argv = sys.argv or []
    if len(argv) > 1 and argv[1] in _ONE_SHOT_COMMANDS:
        return
    with _lock:
        if _started:
            return
        _started = True

    try:
        interval_min = max(15, int(os.environ.get('RECON_INTERVAL_MIN', '60')))
    except ValueError:
        interval_min = 60
    interval_sec = interval_min * 60

    def _loop():
        time.sleep(_INITIAL_DELAY_SEC)
        from mpdsr.reconcile import run_and_store
        while True:
            try:
                token = os.environ.get('KOBO_TOKEN', '')
                if token:
                    snap = run_and_store(token)
                    d = snap.data or {}
                    logger.info('recon-loop tick: stranded=%s crashes=%s',
                                d.get('total_stranded'), d.get('total_crashes'))
            except Exception:
                logger.exception('recon-loop tick failed')
            time.sleep(interval_sec)

    threading.Thread(target=_loop, name='ciprb-recon-loop', daemon=True).start()
    logger.info('Started ciprb-recon-loop (every %d min)', interval_min)
