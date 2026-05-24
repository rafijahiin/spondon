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


def _post(token: str, chat_id: str, text: str) -> None:
    try:
        resp = requests.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'},
            timeout=5,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.error('Telegram send failed to chat %s: %s', chat_id, exc)


def send_submission_alert(submission) -> None:
    """Notify partner chat when a new submission is received via webhook."""
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
    _post(token, chat_id, text)


def send_approval_confirmation(submission) -> None:
    """Notify partner chat when a submission is approved by a manager."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return

    chat_id = _chat_ids().get(submission.partner)
    if not chat_id:
        return

    reviewer = getattr(submission.reviewed_by, 'full_name', None) or 'Manager'
    text = (
        f'<b>✅ Submission Approved</b>\n\n'
        f'Form: {submission.get_form_type_display()}\n'
        f'Partner: {submission.partner}\n'
        f'Worker: {submission.worker_name or "—"}\n'
        f'District: {submission.district or "—"}\n'
        f'Approved by: {reviewer}\n'
        f'Approved at: {submission.reviewed_at:%d %b %Y %H:%M} UTC'
    )
    _post(token, chat_id, text)


def send_rejection_notification(submission) -> None:
    """Notify partner chat when a submission is rejected."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return

    chat_id = _chat_ids().get(submission.partner)
    if not chat_id:
        return

    reviewer = getattr(submission.reviewed_by, 'full_name', None) or 'Manager'
    reason = submission.rejection_reason or 'No reason provided'
    text = (
        f'<b>❌ Submission Rejected</b>\n\n'
        f'Form: {submission.get_form_type_display()}\n'
        f'Partner: {submission.partner}\n'
        f'Worker: {submission.worker_name or "—"}\n'
        f'Rejected by: {reviewer}\n'
        f'Reason: {reason}'
    )
    _post(token, chat_id, text)


def send_gap_alert(partner: str, form_type: str) -> None:
    """Alert partner chat when no submissions received in 48 hours."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return

    chat_id = _chat_ids().get(partner)
    if not chat_id:
        return

    text = (
        f'<b>⚠️ Submission Gap Detected</b>\n\n'
        f'Partner: {partner}\n'
        f'Form: {form_type.upper()}\n\n'
        f'No {form_type} submissions received in the last 48 hours.\n'
        f'<i>Please ensure field workers are submitting regularly.</i>'
    )
    _post(token, chat_id, text)
