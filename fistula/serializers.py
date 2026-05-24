from rest_framework import serializers
from .models import FistulaCampaign


class FistulaCampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = FistulaCampaign
        fields = [
            'id', 'case_hash', 'partner',
            'district', 'upazila', 'union', 'village', 'facility_name', 'region',
            'campaign_date',
            'women_screened', 'women_reached_awareness', 'men_reached_awareness',
            'community_sessions',
            'suspected_fistula_cases', 'confirmed_fistula_cases',
            'new_cases', 'repeat_cases',
            'fistula_type', 'fistula_cause',
            'cases_referred', 'cases_accepted_referral', 'cases_reached_facility',
            'cases_surgery_completed', 'cases_surgery_pending', 'cases_surgery_not_eligible',
            'cases_followup_due', 'cases_followup_completed', 'cases_lost_followup',
            'cases_counselling_provided', 'cases_social_reintegration',
            'main_barriers', 'notes',
            'latitude', 'longitude',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'case_hash', 'partner', 'district', 'upazila', 'union', 'village',
            'facility_name', 'region', 'campaign_date',
            'women_screened', 'women_reached_awareness', 'men_reached_awareness',
            'community_sessions', 'suspected_fistula_cases', 'confirmed_fistula_cases',
            'new_cases', 'repeat_cases', 'fistula_type', 'fistula_cause',
            'cases_referred', 'cases_accepted_referral', 'cases_reached_facility',
            'cases_surgery_completed', 'cases_surgery_pending', 'cases_surgery_not_eligible',
            'cases_followup_due', 'cases_followup_completed', 'cases_lost_followup',
            'cases_counselling_provided', 'cases_social_reintegration',
            'latitude', 'longitude', 'created_at',
        ]
