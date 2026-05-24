from rest_framework import serializers
from .models import IndicatorTarget


class IndicatorTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = IndicatorTarget
        fields = '__all__'


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
