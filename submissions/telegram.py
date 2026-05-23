import json
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _chat_ids() -> dict:
    try:
        return json.loads(settings.TELEGRAM_CHAT_IDS)
    except (json.JSONDecodeError, AttributeError):
        return {}


def send_submission_alert(submission) -> None:
    """
    Sends a Telegram message to the org's group chat.
    Called synchronously from the webhook view — kept fast with a 5 s timeout.
    Logs errors without raising so a Telegram outage never breaks submission ingestion.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return

    chat_id = _chat_ids().get(submission.partner)
    if not chat_id:
        logger.warning('No Telegram chat ID for partner "%s"', submission.partner)
        return

    text = (
        f'<b>New Submission — {submission.get_form_type_display()}</b>\n\n'
        f'Partner: {submission.partner}\n'
        f'Worker: {submission.worker_name or "—"}\n'
        f'District: {submission.district or "—"}\n'
        f'Submitted: {submission.submitted_at:%d %b %Y %H:%M} UTC\n\n'
        f'<i>Open Spondon to review and approve.</i>'
    )

    try:
        resp = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
            timeout=5,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error('Telegram alert failed for submission %s: %s', submission.id, exc)
