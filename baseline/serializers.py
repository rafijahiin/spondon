from rest_framework import serializers
from .models import BaselineSurvey


class BaselineSurveySerializer(serializers.ModelSerializer):
    survey_type_display = serializers.CharField(source='get_survey_type_display', read_only=True)

    class Meta:
        model = BaselineSurvey
        fields = [
            'id', 'partner', 'district', 'region',
            'survey_type', 'survey_type_display', 'participant_code',
            'date_conducted', 'is_duplicate', 'duplicate_of',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'is_duplicate', 'duplicate_of', 'created_at', 'updated_at']
