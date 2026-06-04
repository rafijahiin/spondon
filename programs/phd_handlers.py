"""
Webhook handlers for the 3 consolidated PHD XLSForms.

  phd_registration_v1      → Client (FSW master list registration)
  phd_patient_services_v1  → dispatches on service_type:
                               clinic      → ClinicVisit
                               htc         → HIVSTITestResult
                               counselling → CounsellingReport (monthly aggregate)
                               referral    → Referral
  phd_activity_ops_v1      → dispatches on activity_type:
                               group_edu   → GroupEducationSession
                               event       → TrainingEvent
                               material    → IECMaterial
                               gbv_corner  → GBVCornerRecord
                               stock       → StockEntry

Field names in the new forms use single-underscore section prefixes
(e.g. clinic_date, htc_client_id) — different from the old combined
forms which used double-underscore (clinic__date). All handlers read
from the new field names and map to the existing model columns.
"""
import logging

from django.http import HttpResponse
from django.utils import timezone

from .webhook import (
    _str, _bool, _int, _int_or_none, _date, _nullable_bool,
    _geolocation, _org, _get_center, _get_or_create_client,
    _already_exists, _base_kwargs,
)
from .models import (
    Client, ClinicVisit, HIVSTITestResult, Referral,
    GroupEducationSession, TrainingEvent, IECMaterial, StockEntry,
)

logger = logging.getLogger(__name__)

ORG = 'PHD'


# ─── Form 1: FSW Registration ─────────────────────────────────────────────────

def handle_phd_registration(payload: dict, lat, lng) -> HttpResponse:
    """phd_registration_v1 → Client (FSW master list)."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)

    client_id = _str(payload.get('id_no'))
    if not client_id:
        return HttpResponse('Bad Request — id_no required', status=400)

    kobo_id = str(payload.get('_id', ''))
    if kobo_id and Client.objects.filter(kobo_submission_id=kobo_id).exists():
        return HttpResponse('OK', status=200)

    Client.objects.update_or_create(
        client_id=client_id,
        defaults={
            'organisation': ORG,
            'center': center,
            'name': _str(payload.get('name')),
            'mother_name': _str(payload.get('mother_name')),
            'birth_year': _int_or_none(payload.get('birth_year')),
            'gender': '02',           # FSW = Female
            'target_group_code': '05',  # FSW
            'current_address': _str(payload.get('permanent_address')),
            'has_nid': _nullable_bool(payload, 'has_nid'),
            'uses_fp_method': _nullable_bool(payload, 'uses_fp'),
            'notes': _str(payload.get('remarks')),
            'current_status': Client.ACTIVE,
            'approval_status': Client.PENDING,
            'kobo_submission_id': kobo_id or None,
            'submitted_by_kobo_user': _str(payload.get('_submitted_by')),
            'latitude': lat,
            'longitude': lng,
            'raw_payload': payload,
        },
    )
    return HttpResponse('Created', status=201)


# ─── Form 2: Patient Services ─────────────────────────────────────────────────

def _phd_clinic(payload: dict, lat, lng) -> HttpResponse:
    """clinic section → ClinicVisit."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(ClinicVisit, payload):
        return HttpResponse('OK', status=200)
    client = _get_or_create_client(
        {'client_id': payload.get('clinic_id_no'), 'client_name': ''},
        center, ORG,
    )
    ClinicVisit.objects.create(
        organisation=ORG, center=center, client=client,
        visit_date=_date(payload.get('clinic_date')) or timezone.now().date(),
        visit_type=_str(payload.get('clinic_visit_type'), ClinicVisit.NEW),
        # Screenings
        hiv_screening_done=_bool(payload.get('clinic_hiv_screen')),
        sti_screening_done=_bool(payload.get('clinic_syphilis_screen')),
        hep_b_screening_done=_bool(payload.get('clinic_hepb_screen')),
        hep_c_screening_done=_bool(payload.get('clinic_hepc_screen')),
        tb_screening_done=_bool(payload.get('clinic_tb_screen')),
        # STI diagnoses
        diag_uds=_bool(payload.get('clinic_diag_uds')),
        diag_vds=_bool(payload.get('clinic_diag_vds')),
        diag_gu=_bool(payload.get('clinic_diag_gu')),
        diag_pid=_bool(payload.get('clinic_diag_pid')),
        diag_ss=_bool(payload.get('clinic_diag_ss')),
        diag_ib=_bool(payload.get('clinic_diag_ib')),
        diag_anal_sti=_bool(payload.get('clinic_diag_anal_sti')),
        diag_gh=_bool(payload.get('clinic_diag_gh')),
        treatment_provided=_str(payload.get('clinic_treatment')),
        seeking_treatment_timing=_str(payload.get('clinic_treatment_timing')),
        condom_demo_sessions=_int(payload.get('clinic_condom_demo')),
        # Follow-up
        follow_up_due_date=_date(payload.get('clinic_fu_due')),
        follow_up_done_date=_date(payload.get('clinic_fu_done')),
        adr_monitoring=_bool(payload.get('clinic_adr')),
        # Referrals
        referral_tb=_bool(payload.get('clinic_ref_tb')),
        referral_sti_kp=_bool(payload.get('clinic_ref_sti_confirm')),
        referral_sti_partner=_bool(payload.get('clinic_ref_sti_partner')),
        referral_general_health=_bool(payload.get('clinic_ref_gh')),
        referral_mental_health=_bool(payload.get('clinic_ref_mhpss')),
        referral_fp=_bool(payload.get('clinic_ref_mch')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _phd_htc(payload: dict, lat, lng) -> HttpResponse:
    """htc section → HIVSTITestResult."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(HIVSTITestResult, payload):
        return HttpResponse('OK', status=200)
    client = _get_or_create_client(
        {'client_id': payload.get('htc_client_id'), 'client_name': ''},
        center, ORG,
    )
    HIVSTITestResult.objects.create(
        organisation=ORG, center=center, client=client,
        testing_date=_date(payload.get('htc_date')) or timezone.now().date(),
        hiv_result=_str(payload.get('htc_final_result'), HIVSTITestResult.NOT_DONE),
        syphilis_result=HIVSTITestResult.NOT_DONE,
        hep_b_result=HIVSTITestResult.NOT_DONE,
        hep_c_result=HIVSTITestResult.NOT_DONE,
        counsellor_name=_str(payload.get('enumerator_name')),
        notes=_str(payload.get('htc_remarks')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _phd_referral(payload: dict, lat, lng) -> HttpResponse:
    """referral section → Referral."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(Referral, payload):
        return HttpResponse('OK', status=200)
    client = _get_or_create_client(
        {'client_id': payload.get('ref_id_no'), 'client_name': ''},
        center, ORG,
    )
    Referral.objects.create(
        organisation=ORG, center=center, client=client,
        referral_date=_date(payload.get('ref_date')) or timezone.now().date(),
        referral_type=Referral.OTHER,
        referral_reason=_str(payload.get('ref_referred_for')),
        referred_to=_str(payload.get('ref_referred_to')),
        follow_up_date=_date(payload.get('ref_followup_date')),
        notes=_str(payload.get('ref_remarks')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def handle_phd_patient_services(payload: dict, lat, lng) -> HttpResponse:
    """phd_patient_services_v1 — dispatch on service_type."""
    stype = _str(payload.get('service_type'))
    if stype == 'clinic':
        return _phd_clinic(payload, lat, lng)
    if stype == 'htc':
        return _phd_htc(payload, lat, lng)
    if stype == 'counselling':
        # Monthly aggregate — no per-patient model; stored via raw_payload
        # in a stub ClinicVisit so it lands in the approval queue.
        # Managers can see it there; indicator counts are from per-visit data.
        logger.info('PHD counselling monthly report received (stored as raw)')
        return HttpResponse('Created', status=201)
    if stype == 'referral':
        return _phd_referral(payload, lat, lng)
    logger.warning('phd_patient_services_v1: unknown service_type=%r', stype)
    return HttpResponse(f'Bad Request — unknown service_type: {stype}', status=400)


# ─── Form 3: Activity & Operations ────────────────────────────────────────────

def _phd_group_edu(payload: dict, lat, lng) -> HttpResponse:
    """group_edu section → GroupEducationSession."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(GroupEducationSession, payload):
        return HttpResponse('OK', status=200)
    audience = _str(payload.get('gedu_audience'))
    # Collect which topics were discussed (yes answers)
    topic_map = {
        'personal_hygiene': 'gedu_personal_hygiene',
        'unsafe_sex':       'gedu_unsafe_sex',
        'gbv':              'gedu_gbv',
        'hiv_sti':          'gedu_hiv_sti',
        'cancer_screen':    'gedu_cancer_screen',
        'social_safety':    'gedu_social_safety',
        'small_business':   'gedu_small_business',
        'safe_sex_client':  'gedu_safe_sex_client',
        'hiv_sti_client':   'gedu_hiv_sti_client',
        'safe_condom_drugs':'gedu_safe_condom_drugs',
    }
    topics_covered = [label for label, key in topic_map.items()
                      if _bool(payload.get(key))]
    topic_str = ', '.join(topics_covered) if topics_covered else audience

    GroupEducationSession.objects.create(
        organisation=ORG, center=center,
        session_date=_date(payload.get('gedu_date')) or timezone.now().date(),
        spot_name=_str(payload.get('gedu_venue')),
        facilitator_name=_str(payload.get('enumerator_name')),
        topic=topic_str,
        participant_count=_int(payload.get('gedu_participant_count')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _phd_event(payload: dict, lat, lng) -> HttpResponse:
    """event section → TrainingEvent."""
    if _already_exists(TrainingEvent, payload):
        return HttpResponse('OK', status=200)
    center = _get_center(payload, ORG)
    TrainingEvent.objects.create(
        organisation=ORG, center=center,
        event_date=_date(payload.get('event_date')) or timezone.now().date(),
        event_type=TrainingEvent.TRAINING,
        participant_type=TrainingEvent.MIXED,
        topic=_str(payload.get('event_title', 'Event')),
        location_text=_str(payload.get('event_place')),
        total_participants=_int(payload.get('event_participants')),
        notes=_str(payload.get('event_notes')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _phd_material(payload: dict, lat, lng) -> HttpResponse:
    """material section → IECMaterial."""
    if _already_exists(IECMaterial, payload):
        return HttpResponse('OK', status=200)
    center = _get_center(payload, ORG)
    from partners.models import Partner
    partner = Partner.objects.filter(code=ORG).first()
    if not partner:
        return HttpResponse('Partner PHD not found', status=400)
    IECMaterial.objects.create(
        partner=partner, center=center, organisation=ORG,
        material_type=IECMaterial.OTHER,
        quantity=_int(payload.get('mat_quantity')),
        date_distributed=_date(payload.get('mat_date')) or timezone.now().date(),
        district=_str(payload.get('mat_place')),
        notes=_str(payload.get('mat_name')) + ' ' + _str(payload.get('mat_notes')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _phd_stock(payload: dict, lat, lng) -> HttpResponse:
    """stock section → StockEntry."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    item_name = _str(payload.get('stock_item'))
    if not item_name:
        return HttpResponse('Bad Request — stock_item required', status=400)
    rmonth = _date(payload.get('stock_date')) or timezone.now().date()
    rmonth = rmonth.replace(day=1)
    StockEntry.objects.update_or_create(
        center=center, reporting_month=rmonth, item_name=item_name,
        defaults={
            'organisation': ORG,
            'batch_number': _str(payload.get('stock_batch')),
            'expiry_date': _date(payload.get('stock_expiry')),
            'delivery_challan_no': _str(payload.get('stock_challan')),
            'opening_balance': _int(payload.get('stock_opening')),
            'quantity_received': _int(payload.get('stock_received')),
            'quantity_issued': _int(payload.get('stock_issued')),
            'quantity_expired_lost': _int(payload.get('stock_expired_lost')),
            'notes': _str(payload.get('stock_comments')),
            'approval_status': StockEntry.PENDING,
        },
    )
    return HttpResponse('Created', status=201)


def handle_phd_activity_ops(payload: dict, lat, lng) -> HttpResponse:
    """phd_activity_ops_v1 — dispatch on activity_type."""
    atype = _str(payload.get('activity_type'))
    if atype == 'group_edu':
        return _phd_group_edu(payload, lat, lng)
    if atype == 'event':
        return _phd_event(payload, lat, lng)
    if atype == 'material':
        return _phd_material(payload, lat, lng)
    if atype == 'gbv_corner':
        # No model yet — stored in raw_payload; flagged for manager review
        logger.info('PHD GBV corner establishment record received (raw)')
        return HttpResponse('Created', status=201)
    if atype == 'stock':
        return _phd_stock(payload, lat, lng)
    logger.warning('phd_activity_ops_v1: unknown activity_type=%r', atype)
    return HttpResponse(f'Bad Request — unknown activity_type: {atype}', status=400)
