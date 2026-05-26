"""
DRF serializers for the programs app.
All write operations validate organisation matches the authenticated user's org
(enforced in the views — serializers stay lean).
"""
from rest_framework import serializers
from .models import (
    ServiceCenter, Client,
    ClinicVisit, HIVSTITestResult, ADRRecord, AutoclaveLog, AntenatalCard,
    HTCCounselling, IndividualCounselling, MHScreening,
    GBVCase,
    OutreachSession, GroupEducationSession,
    Referral,
    StockEntry, TemperatureLog, SafetyHygieneKit, StoreRequisition,
    TrainingEvent, CoordMeeting, MobileHealthCamp, VisitorRegister,
)


class ServiceCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceCenter
        fields = [
            'id', 'organisation', 'name', 'name_bangla', 'code',
            'center_type', 'district', 'upazila', 'address',
            'latitude', 'longitude', 'is_active',
        ]
        read_only_fields = ['id']


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        exclude = ['raw_payload']
        read_only_fields = [
            'id', 'approval_status', 'approved_by', 'approved_at',
            'kobo_submission_id', 'submitted_at',
        ]


class ClinicVisitSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicVisit
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class ClinicVisitApprovalSerializer(serializers.ModelSerializer):
    """Used by manager approve/reject endpoints."""
    class Meta:
        model = ClinicVisit
        fields = ['approval_status', 'rejected_reason']


class HIVSTITestResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = HIVSTITestResult
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class ADRRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ADRRecord
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class AutoclaveLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutoclaveLog
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class AntenatalCardSerializer(serializers.ModelSerializer):
    class Meta:
        model = AntenatalCard
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class HTCCounsellingSerializer(serializers.ModelSerializer):
    class Meta:
        model = HTCCounselling
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class IndividualCounsellingSerializer(serializers.ModelSerializer):
    class Meta:
        model = IndividualCounselling
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class MHScreeningSerializer(serializers.ModelSerializer):
    class Meta:
        model = MHScreening
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class GBVCaseSerializer(serializers.ModelSerializer):
    """
    Sensitive encrypted fields (survivor_name etc.) are excluded by default.
    A separate GBVCaseDetailSerializer exposes them to GBV officer / super admin.
    """
    class Meta:
        model = GBVCase
        exclude = [
            'raw_payload',
            'survivor_name', 'survivor_contact', 'survivor_address',
            'perpetrator_name', 'perpetrator_address',
        ]
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class GBVCaseDetailSerializer(serializers.ModelSerializer):
    """Full serializer — only for GBV officers and super admins."""
    class Meta:
        model = GBVCase
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class OutreachSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = OutreachSession
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class GroupEducationSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupEducationSession
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class ReferralSerializer(serializers.ModelSerializer):
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = Referral
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at',
                            'outcome_updated_by']


class ReferralOutcomeSerializer(serializers.ModelSerializer):
    """Used for outcome update endpoint."""
    class Meta:
        model = Referral
        fields = ['outcome', 'outcome_date', 'outcome_notes']


class StockEntrySerializer(serializers.ModelSerializer):
    closing_balance = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockEntry
        fields = '__all__'


class TemperatureLogSerializer(serializers.ModelSerializer):
    is_out_of_range = serializers.BooleanField(read_only=True)

    class Meta:
        model = TemperatureLog
        fields = '__all__'


class SafetyHygieneKitSerializer(serializers.ModelSerializer):
    class Meta:
        model = SafetyHygieneKit
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id']


class StoreRequisitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreRequisition
        fields = '__all__'


def _validate_photo_under_2mb(uploaded_file):
    """Serializer-level photo size check. Mirrors the model's
    validate_photo_size() so the gate holds regardless of code path."""
    if uploaded_file in (None, ''):
        return uploaded_file
    size = getattr(uploaded_file, 'size', None)
    max_bytes = 2 * 1024 * 1024
    if size is not None and size > max_bytes:
        raise serializers.ValidationError(
            f'Photo too large ({size / 1024 / 1024:.2f} MiB). '
            f'Maximum allowed is 2 MiB.'
        )
    return uploaded_file


class TrainingEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingEvent
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']

    def validate_report_file(self, value):
        """Step 5 hard gate: training report upload is mandatory."""
        if not value:
            raise serializers.ValidationError(
                'A training report file is required.'
            )
        return value

    def validate_photo(self, value):
        return _validate_photo_under_2mb(value)


class CoordMeetingSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoordMeeting
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']

    def validate_meeting_notes(self, value):
        """Step 5 hard gate: meeting notes upload is mandatory.

        Blocks PATCH/POST when the file is missing or empty, with a
        clear, user-facing error. Never silently accepts a meeting
        record without supporting documentation."""
        if not value:
            raise serializers.ValidationError(
                'A meeting notes file is required.'
            )
        return value

    def validate_photo(self, value):
        return _validate_photo_under_2mb(value)


class MobileHealthCampSerializer(serializers.ModelSerializer):
    class Meta:
        model = MobileHealthCamp
        exclude = ['raw_payload']
        read_only_fields = ['approval_status', 'approved_by', 'approved_at',
                            'kobo_submission_id', 'submitted_at']


class VisitorRegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisitorRegister
        fields = '__all__'
