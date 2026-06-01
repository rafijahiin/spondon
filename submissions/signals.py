import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import FormType, KoboSubmission, SubmissionStatus

logger = logging.getLogger(__name__)


@receiver(post_save, sender=KoboSubmission)
def on_submission_status_change(sender, instance, **kwargs):
    if instance.status == SubmissionStatus.APPROVED:
        _create_mpdsr_case(instance)
        _create_fistula_campaign(instance)
        _create_baseline_survey(instance)
        _send_approval_telegram(instance)
    elif instance.status == SubmissionStatus.REJECTED:
        _send_rejection_telegram(instance)


def _create_mpdsr_case(submission):
    if submission.form_type != FormType.MPDSR:
        return
    try:
        from mpdsr.models import MPDSRCase
        MPDSRCase.objects.get_or_create_from_submission(submission)
    except Exception as exc:
        logger.error('MPDSRCase creation failed for submission %s: %s', submission.id, exc)


def _create_fistula_campaign(submission):
    if submission.form_type != FormType.FISTULA:
        return
    try:
        from fistula.models import FistulaCampaign
        FistulaCampaign.objects.get_or_create_from_submission(submission)
    except Exception as exc:
        logger.error('FistulaCampaign creation failed for submission %s: %s', submission.id, exc)


def _create_baseline_survey(submission):
    if submission.form_type != FormType.BASELINE:
        return
    try:
        from baseline.models import BaselineSurvey
        BaselineSurvey.objects.get_or_create_from_submission(submission)
    except Exception as exc:
        logger.error('BaselineSurvey creation failed for submission %s: %s', submission.id, exc)


def _send_approval_telegram(submission):
    try:
        from .notify import send_approval_confirmation
        send_approval_confirmation(submission)
    except Exception as exc:
        logger.error('Approval Telegram failed for submission %s: %s', submission.id, exc)


def _send_rejection_telegram(submission):
    try:
        from .notify import send_rejection_notification
        send_rejection_notification(submission)
    except Exception as exc:
        logger.error('Rejection Telegram failed for submission %s: %s', submission.id, exc)
