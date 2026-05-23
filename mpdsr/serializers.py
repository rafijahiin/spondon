import datetime

from rest_framework import serializers

from .models import MPDSRCase, ReviewStatus


class MPDSRCaseSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    death_type_display = serializers.CharField(source='get_death_type_display', read_only=True)
    is_overdue_committee = serializers.SerializerMethodField()

    class Meta:
        model = MPDSRCase
        fields = [
            'id', 'case_hash', 'partner', 'district', 'region',
            'date_of_death', 'death_type', 'death_type_display',
            'cause_of_death', 'facility_name', 'age_years',
            'status', 'status_display', 'committee_date',
            'action_plan', 'notes', 'is_overdue_committee',
            'latitude', 'longitude',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'case_hash', 'partner', 'district', 'region',
            'date_of_death', 'death_type', 'cause_of_death',
            'facility_name', 'age_years', 'latitude', 'longitude',
            'created_at',
        ]

    def get_is_overdue_committee(self, obj):
        return obj.is_overdue_committee


class MPDSRCaseUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MPDSRCase
        fields = ['status', 'committee_date', 'action_plan', 'notes']

    def validate_committee_date(self, value):
        if value and value < datetime.date.today():
            raise serializers.ValidationError('Committee date cannot be in the past.')
        return value
