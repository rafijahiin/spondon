from rest_framework import serializers

from accounts.serializers import UserSerializer
from .models import KoboSubmission


class KoboSubmissionSerializer(serializers.ModelSerializer):
    reviewed_by = UserSerializer(read_only=True)
    form_type_display = serializers.CharField(source='get_form_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    # Baseline duplication warning (Animesh's spec). For BASELINE submissions
    # only, expose whether the auto-created BaselineSurvey row was flagged as
    # a same-location-same-day duplicate of an existing one. Managers see
    # this on the approval queue and can override.
    is_baseline_duplicate = serializers.SerializerMethodField()

    def get_is_baseline_duplicate(self, obj) -> bool:
        bs = getattr(obj, 'baseline_survey', None)
        return bool(bs and getattr(bs, 'is_duplicate', False))

    class Meta:
        model = KoboSubmission
        fields = [
            'id', 'kobo_id', 'form_type', 'form_type_display', 'partner',
            'worker_name', 'district', 'region',
            'latitude', 'longitude',
            'submitted_at', 'received_at',
            'status', 'status_display',
            'reviewed_by', 'reviewed_at', 'rejection_reason',
            'is_baseline_duplicate',
        ]
        read_only_fields = fields


class KoboSubmissionDetailSerializer(KoboSubmissionSerializer):
    """Includes raw_data — only served on retrieve, not list."""

    class Meta(KoboSubmissionSerializer.Meta):
        fields = KoboSubmissionSerializer.Meta.fields + ['raw_data']


class RejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(allow_blank=False)
