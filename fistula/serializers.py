import datetime

from rest_framework import serializers

from .models import CaseStatus, FistulaCase


class FistulaCaseSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_id_number = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = FistulaCase
        fields = [
            'id', 'case_hash', 'partner', 'district', 'region',
            'date_identified', 'patient_name', 'patient_id_number', 'age',
            'status', 'status_display', 'referral_status', 'follow_up_date',
            'is_overdue', 'latitude', 'longitude', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'case_hash', 'partner', 'district', 'region',
            'date_identified', 'patient_name', 'patient_id_number', 'age',
            'latitude', 'longitude', 'created_at',
        ]

    def get_patient_name(self, obj):
        return obj.patient_name

    def get_patient_id_number(self, obj):
        return obj.patient_id

    def get_is_overdue(self, obj):
        return obj.is_overdue


class FistulaCaseUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FistulaCase
        fields = ['status', 'follow_up_date', 'referral_status', 'notes']

    def validate_follow_up_date(self, value):
        if value and value < datetime.date.today():
            raise serializers.ValidationError('Follow-up date cannot be in the past.')
        return value
