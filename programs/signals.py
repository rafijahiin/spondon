"""
Programs app signals.

Single job today: keep the phd_clients.csv attachment on the PHD Kobo
forms in sync with the live Client table. The Kobo Service Log form uses
pulldata() against that CSV to auto-fill patient identity when a field
worker types an FSW ID — if the CSV is stale, every newly-registered
patient looks "not in Master List" until a manual export is run.

Strategy:
  * Hook post_save on Client.
  * Only react for PHD-organisation clients (Bandhu / CIPRB don't use
    pulldata yet).
  * Use transaction.on_commit so the upload only fires after the row is
    actually persisted (we never push a CSV that includes a transaction
    that rolled back).
  * Run the network call in a daemon thread so the webhook response
    isn't blocked by Kobo's API. The push is idempotent — even if two
    fire at once the second simply replaces the first.
  * Coalesce bursts with a 2-second debounce so a flood of registrations
    (re-seed / bulk import) only produces one or two CSV uploads.
"""
import logging
import threading
import time
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Client

logger = logging.getLogger(__name__)

# ── debounce state ────────────────────────────────────────────────────
# A pending push is one that has been scheduled but hasn't fired yet.
# When another save comes in during the debounce window we reset the
# timer instead of stacking a new thread.
_DEBOUNCE_SECONDS = 2.0
_pending_lock = threading.Lock()
_pending_timer: Optional[threading.Timer] = None


def _do_push() -> None:
    """Build + upload the PHD clients CSV. Runs off the request thread."""
    # Local imports — the management command pulls Django settings + the
    # requests library; keep import cost off the module-load path.
    try:
        from .management.commands.export_phd_clients import (
            build_csv, upload_to_kobo,
        )
    except Exception:
        logger.exception('phd-csv sync: failed to import export command')
        return

    if not (
        getattr(settings, 'KOBO_API_TOKEN', '')
        or __import__('os').environ.get('KOBO_TOKEN', '')
    ):
        logger.info('phd-csv sync: KOBO_TOKEN unset — skipping push')
        return

    class _SilentStdout:
        def write(self, msg):  # the command writes human-readable progress
            logger.info('phd-csv sync: %s', str(msg).rstrip())

    try:
        csv_bytes, row_count = build_csv()
        ok = upload_to_kobo(csv_bytes, _SilentStdout())
        logger.info('phd-csv sync: pushed %d rows, ok=%s', row_count, ok)
    except Exception:
        logger.exception('phd-csv sync: push failed')


def _schedule_push() -> None:
    """Reset the debounce timer; the actual push fires in a daemon thread."""
    global _pending_timer
    with _pending_lock:
        if _pending_timer is not None:
            _pending_timer.cancel()

        def _fire() -> None:
            # Run the network call in a daemon thread so the timer thread
            # itself returns immediately and a second debounce can land
            # while the upload is in flight.
            t = threading.Thread(target=_do_push, daemon=True,
                                 name='phd-csv-sync')
            t.start()

        _pending_timer = threading.Timer(_DEBOUNCE_SECONDS, _fire)
        _pending_timer.daemon = True
        _pending_timer.start()


@receiver(post_save, sender=Client)
def _client_changed(sender, instance: Client, created: bool, **kwargs):
    """Refresh phd_clients.csv on any PHD Client insert / update.

    The CSV filter (build_csv) already drops stubs with empty names, so
    a registration that hasn't been completed yet is silently ignored.
    """
    if instance.organisation != 'PHD':
        return
    # Defer the push until the DB transaction commits, so we never
    # ship a CSV row that gets rolled back.
    transaction.on_commit(_schedule_push)
