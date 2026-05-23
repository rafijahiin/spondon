from rest_framework import serializers

from accounts.serializers import UserSerializer
from .models import KoboSubmission


class KoboSubmissionSerializer(serializers.ModelSerializer):
    reviewed_by = UserSerializer(read_only=True)
    form_type_display = serializers.CharField(source='get_form_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = KoboSubmission
        fields = [
            'id', 'kobo_id', 'form_type', 'form_type_display', 'partner',
            'worker_name', 'district', 'region',
            'latitude', 'longitude',
            'submitted_at', 'received_at',
            'status', 'status_display',
            'reviewed_by', 'reviewed_at', 'rejection_reason',
        ]
        read_only_fields = fields


class KoboSubmissionDetailSerializer(KoboSubmissionSerializer):
    """Includes raw_data — only served on retrieve, not list."""

    class Meta(KoboSubmissionSerializer.Meta):
        fields = KoboSubmissionSerializer.Meta.fields + ['raw_data']


class RejectSerializer(serializers.Serializer):
    rejection_reason = serializers.CharField(allow_blank=False)
