from rest_framework import serializers

from .models import IndicatorTarget, KoboFormMapping


class KoboFormMappingSerializer(serializers.ModelSerializer):
    partner_code = serializers.CharField(source='partner.code', read_only=True, allow_null=True)

    class Meta:
        model = KoboFormMapping
        fields = [
            'id', 'form_slug', 'form_label', 'partner', 'partner_code',
            'kobo_asset_uid', 'is_active', 'notes',
        ]
        read_only_fields = ['id']


class IndicatorTargetSerializer(serializers.ModelSerializer):
    """Read+write serializer for /api/indicators/targets/.

    `partner` is exposed both as the FK id (for writes) and as a denormalised
    `partner_code` and `partner_color` (for the frontend's grouped render).
    `updated_by` is read-only — the view's perform_update sets it from
    request.user."""
    partner_code = serializers.CharField(source='partner.code', read_only=True)
    partner_color = serializers.CharField(source='partner.color_hex', read_only=True)
    source_form_slug = serializers.CharField(
        source='source_form.form_slug', read_only=True, allow_null=True,
    )
    updated_by_email = serializers.CharField(
        source='updated_by.email', read_only=True, allow_null=True,
    )

    class Meta:
        model = IndicatorTarget
        fields = [
            'id',
            'partner', 'partner_code', 'partner_color',
            'objective_number',
            'activity_code', 'activity_label',
            'indicator_label',
            'target_value', 'unit',
            'source_form', 'source_form_slug',
            'notes', 'is_active',
            'created_at', 'updated_at',
            'updated_by', 'updated_by_email',
        ]
        read_only_fields = [
            'id', 'created_at', 'updated_at',
            'updated_by', 'updated_by_email',
            'partner_code', 'partner_color', 'source_form_slug',
        ]


class IndicatorProgressSerializer(serializers.Serializer):
    """Read-only serializer for computed indicator progress.
    Unchanged from the previous shape — service layer still emits the
    same dict structure for the live progress endpoints."""
    code = serializers.CharField()
    label = serializers.CharField()
    actual = serializers.FloatField()
    target = serializers.FloatField(allow_null=True)
    pct = serializers.FloatField(allow_null=True)
    unit = serializers.CharField()
    on_track = serializers.BooleanField(allow_null=True)
    objective = serializers.CharField(required=False, allow_blank=True)
    activity_ref = serializers.CharField(required=False, allow_blank=True)
