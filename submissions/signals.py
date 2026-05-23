import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import FormType, KoboSubmission, SubmissionStatus

logger = logging.getLogger(__name__)


@receiver(post_save, sender=KoboSubmission)
def on_submission_status_change(sender, instance, **kwargs):
    if instance.status != SubmissionStatus.APPROVED:
        return

    if instance.form_type == FormType.FISTULA:
        _create_fistula_case(instance)
    elif instance.form_type == FormType.MPDSR:
        _create_mpdsr_case(instance)


def _create_fistula_case(submission):
    try:
        from fistula.models import FistulaCase
        FistulaCase.objects.get_or_create_from_submission(submission)
    except Exception as exc:
        logger.error('FistulaCase creation failed for submission %s: %s', submission.id, exc)


def _create_mpdsr_case(submission):
    try:
        from mpdsr.models import MPDSRCase
        MPDSRCase.objects.get_or_create_from_submission(submission)
    except Exception as exc:
        logger.error('MPDSRCase creation failed for submission %s: %s', submission.id, exc)
