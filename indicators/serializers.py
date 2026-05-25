from rest_framework import serializers
from .models import IndicatorTarget


class IndicatorTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = IndicatorTarget
        fields = [
            'id', 'organisation', 'indicator_code', 'indicator_name',
            'objective', 'activity_ref', 'unit',
            'target_value', 'period_start', 'period_end',
            'notes', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class IndicatorProgressSerializer(serializers.Serializer):
    """Read-only serializer for computed indicator progress."""
    code = serializers.CharField()
    label = serializers.CharField()
    actual = serializers.FloatField()
    target = serializers.FloatField(allow_null=True)
    pct = serializers.FloatField(allow_null=True)
    unit = serializers.CharField()
    on_track = serializers.BooleanField(allow_null=True)
    objective = serializers.CharField(required=False, allow_blank=True)
    activity_ref = serializers.CharField(required=False, allow_blank=True)
