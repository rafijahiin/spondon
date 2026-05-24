from rest_framework import serializers
from .models import BaselineSurvey


class BaselineSurveySerializer(serializers.ModelSerializer):
    survey_type_display = serializers.CharField(source='get_survey_type_display', read_only=True)

    class Meta:
        model = BaselineSurvey
        fields = [
            'id', 'partner', 'district', 'upazila', 'union', 'facility_name', 'region',
            'survey_type', 'survey_type_display', 'survey_date', 'participant_code',
            # Respondent profile
            'respondent_age', 'sex', 'education', 'ses',
            # FP
            'fp_use', 'fp_method',
            # Maternal
            'currently_pregnant', 'anc_4visits', 'skilled_birth_attendant',
            'danger_signs_knowledge',
            # Awareness
            'fistula_awareness', 'mpdsr_awareness', 'gbv_awareness',
            'child_marriage_knowledge',
            # Access
            'health_facility_distance', 'srh_service_satisfaction',
            # Meta
            'is_duplicate', 'duplicate_of',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'partner', 'district', 'upazila', 'union', 'facility_name', 'region',
            'survey_date', 'respondent_age', 'sex', 'education', 'ses',
            'fp_use', 'fp_method', 'currently_pregnant', 'anc_4visits',
            'skilled_birth_attendant', 'danger_signs_knowledge',
            'fistula_awareness', 'mpdsr_awareness', 'gbv_awareness',
            'child_marriage_knowledge', 'health_facility_distance', 'srh_service_satisfaction',
            'is_duplicate', 'duplicate_of', 'created_at',
        ]
