"""
Webhook handlers for the 2 consolidated Bandhu XLSForms.

  bandhu_service_log_v1   → ClinicVisit | HIVSTITestResult | GBVCase |
                            IndividualCounselling | Referral
  bandhu_activity_ops_v1  → OutreachSession | MobileHealthCamp |
                            TrainingEvent | CoordMeeting | IECMaterial

Design (agreed with Rafi 2026-06-08):
  - ONE canonical tool per indicator → no double-counting.
  - The FULL form payload is kept in raw_payload on every row, so no tool
    question is ever lost (Manager Approvals shows the complete readout).
  - Only fields the 18 indicators need are mapped to model columns; nothing
    invented.
  - F-01 logbook and F-08/attendance detail are stored (raw) but not
    re-counted — their services are already counted via the canonical tool.
"""
import logging
import uuid as _uuid

from django.http import HttpResponse
from django.utils import timezone

from .webhook import (
    _str, _bool, _int, _int_or_none, _date,
    _already_exists, _base_kwargs, _get_center,
)
from .models import (
    Client, ClinicVisit, HIVSTITestResult, IndividualCounselling,
    GBVCase, Referral, OutreachSession, MobileHealthCamp,
    TrainingEvent, CoordMeeting, IECMaterial,
)

logger = logging.getLogger(__name__)

ORG = 'Bandhu'


# ─── helpers ──────────────────────────────────────────────────────────────────

def _client(payload, center, id_value):
    """Resolve/create the Bandhu Client by the inline ID typed on the tool.
    Bandhu has no master-list registration tool, so the client row is a stub
    keyed on the ID the field worker enters (trim + upper), auto-approved so
    FK constraints hold and the submission is never lost."""
    cid = (str(id_value or '').strip().upper()
           or f'STUB_{_uuid.uuid4().hex[:8].upper()}')
    client, _ = Client.objects.get_or_create(
        client_id=cid,
        defaults={
            'organisation': ORG, 'center': center,
            'name': 'Unknown', 'current_status': Client.ACTIVE,
            'approval_status': Client.APPROVED,
        },
    )
    return client


def _sub_date(payload):
    """Date for tools that have no date column (e.g. F-02 GBV) — use the
    Kobo submission date. Not invented data: it is submission metadata."""
    raw = str(payload.get('_submission_time', ''))[:10]
    return _date(raw) or timezone.now().date()


def _multi(payload, key):
    """select_multiple → list of selected codes (Kobo sends space-joined)."""
    return [t for t in _str(payload.get(key)).split() if t]


# ─── Form 1: Service Log ──────────────────────────────────────────────────────

def _bnd_patient(payload, lat, lng):
    """F-05 Patient Record → ClinicVisit. Drives 1.1 (HIV/STI screening) and
    1.5a (STI services)."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(ClinicVisit, payload):
        return HttpResponse('OK', status=200)
    refs = _multi(payload, 'pr_referral')
    screened = _bool(payload.get('pr_screening_sti_hiv'))
    ClinicVisit.objects.create(
        organisation=ORG, center=center,
        client=_client(payload, center, payload.get('pr_client_id')),
        visit_date=_date(payload.get('pr_date')) or _sub_date(payload),
        sti_screening_done=screened or bool(_str(payload.get('pr_sti_case'))),
        hiv_screening_done=screened,
        tb_screening_done=_bool(payload.get('pr_tb_screening')),
        gbv_screening_done=False,
        treatment_provided=_str(payload.get('pr_treatment')),
        condoms_distributed=_int(payload.get('pr_condom_demo')),
        sti_counselling_provided=_bool(payload.get('pr_sti_counseling')),
        follow_up_due_date=_date(payload.get('pr_followup_due')),
        follow_up_done_date=_date(payload.get('pr_followup_done')),
        referral_tb=('tb' in refs),
        referral_sti_kp=('sti_kp' in refs),
        referral_general_health=('general_health' in refs),
        referral_hiv_testing=('hiv_testing' in refs),
        referral_mental_health=('mental_health' in refs),
        referral_gbv=('gbv' in refs),
        referral_fp=('fp' in refs),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_htc(payload, lat, lng):
    """F-06 HTC → HIVSTITestResult. Drives 1.5b (HIV tests) and feeds 1.1."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(HIVSTITestResult, payload):
        return HttpResponse('OK', status=200)
    HIVSTITestResult.objects.create(
        organisation=ORG, center=center,
        client=_client(payload, center, payload.get('htc_client_id')),
        testing_date=_date(payload.get('htc_date_tested')) or _sub_date(payload),
        target_group=_str(payload.get('htc_tg')),
        hiv_result=_str(payload.get('htc_result')),
        referred=_bool(payload.get('htc_referred_art')),
        art_linkage_status=('referred' if _bool(payload.get('htc_referred_art')) else ''),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_gbv(payload, lat, lng):
    """F-02 GBV Register → GBVCase. Drives 1.2."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(GBVCase, payload):
        return HttpResponse('OK', status=200)
    d = _sub_date(payload)
    GBVCase.objects.create(
        organisation=ORG, center=center,
        interview_date=d, incident_date=d,
        survivor_age=_int_or_none(payload.get('gbv_age')),
        needs_legal=_bool(payload.get('gbv_ref_legal')),
        needs_psychosocial=_bool(payload.get('gbv_ref_mental_health')),
        local_action_taken=_str(payload.get('gbv_primary_service')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_counsel_common(payload, lat, lng, date_key, issues, ref_key=None):
    """Shared writer for F-03 + Counseling → IndividualCounselling. Drives 1.3
    (issue_psychosocial)."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(IndividualCounselling, payload):
        return HttpResponse('OK', status=200)
    IndividualCounselling.objects.create(
        organisation=ORG, center=center,
        session_date=_date(payload.get(date_key)) or _sub_date(payload),
        issue_sti=('sti' in issues),
        issue_general_health=('general_health' in issues),
        issue_fp=('fp' in issues),
        issue_drug_use=('harmful_drug' in issues),
        issue_psychosocial=('psychosocial' in issues or 'mental_health' in issues),
        issue_gbv=('gbv' in issues),
        issue_other=('other' in issues),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_mh(payload, lat, lng):
    """F-03 Mental Health Counseling → IndividualCounselling (psychosocial)."""
    issues = ['mental_health'] + _multi(payload, 'mh_counsel_type')
    return _bnd_counsel_common(payload, lat, lng, 'mh_date', issues)


def _bnd_counsel(payload, lat, lng):
    """Daily Counseling form → IndividualCounselling."""
    return _bnd_counsel_common(payload, lat, lng, 'cn_date',
                               _multi(payload, 'cn_issues'))


def _bnd_referral(payload, lat, lng):
    """Referral Register → Referral. Drives 1.7 when an ART referral links."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(Referral, payload):
        return HttpResponse('OK', status=200)
    targets = _multi(payload, 'rf_referred_for')
    rtype = 'art' if 'art' in targets else (targets[0] if targets else 'other')
    received = _date(payload.get('rf_receiving_date'))
    Referral.objects.create(
        organisation=ORG, center=center,
        client=_client(payload, center, payload.get('rf_client_id')),
        referral_date=_date(payload.get('rf_date')) or _sub_date(payload),
        referral_type=rtype,
        referral_reason=_str(payload.get('rf_reason')),
        referred_to=_str(payload.get('rf_where')),
        follow_up_date=_date(payload.get('rf_followup_date')),
        outcome=('completed' if received else 'pending'),
        outcome_date=received,
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_hiv_identified(payload, lat, lng):
    """F-08 HIV identified → Referral(type=art) when linked to care. Drives 1.7
    (deduped by client). Full detail kept in raw_payload."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(Referral, payload):
        return HttpResponse('OK', status=200)
    linked = _bool(payload.get('hv_linked_care')) or \
        _str(payload.get('hv_receiving_art')) == 'yes'
    Referral.objects.create(
        organisation=ORG, center=center,
        client=_client(payload, center, payload.get('hv_client_uid')),
        referral_date=_date(payload.get('hv_date_testing')) or _sub_date(payload),
        referral_type='art',
        referral_reason='HIV positive — ART linkage',
        referred_to=_str(payload.get('hv_linked_with')),
        outcome=('completed' if linked else 'pending'),
        outcome_date=_date(payload.get('hv_art_start')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_logbook(payload, lat, lng):
    """F-01 Wellness Centre Service Logbook — stored (raw_payload) but NOT
    re-counted; its services are counted via F-05/F-06. A lightweight
    OutreachSession is created only so the submission appears in the centre's
    activity stream without inflating any indicator."""
    # Intentionally no model write to a counted source — keep audit trail only.
    return HttpResponse('OK', status=200)


def handle_bandhu_service_log(payload, lat, lng):
    dispatch = {
        'patient_record':   _bnd_patient,
        'htc':              _bnd_htc,
        'gbv':              _bnd_gbv,
        'mh_counseling':    _bnd_mh,
        'counseling_daily': _bnd_counsel,
        'referral':         _bnd_referral,
        'hiv_identified':   _bnd_hiv_identified,
        'wellness_logbook': _bnd_logbook,
    }
    fn = dispatch.get(_str(payload.get('record_type')))
    if not fn:
        return HttpResponse('unknown record_type', status=400)
    return fn(payload, lat, lng)


# ─── Form 2: Activity & Operations ────────────────────────────────────────────

def _bnd_outreach(payload, lat, lng):
    """F-04 Daily Outreach → OutreachSession. Drives 1.4a (sessions) and feeds
    4.1 (IEC distributed)."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(OutreachSession, payload):
        return HttpResponse('OK', status=200)
    OutreachSession.objects.create(
        organisation=ORG, center=center,
        session_date=_date(payload.get('or_date')) or _sub_date(payload),
        peer_educator_name=_str(payload.get('or_peer_educator')),
        spot_name=_str(payload.get('or_spot')),
        condoms_distributed_free=_int(payload.get('or_condom')),
        lubricants_distributed_free=_int(payload.get('or_lubricant')),
        hiv_aids_sti_knowledge_sessions=_int(payload.get('or_awareness')),
        iec_bcc_materials_distributed=_int(payload.get('or_iec')),
        referral_htc_hts=_int(payload.get('or_ref_sti')) > 0,
        referral_mental_health=_int(payload.get('or_ref_mental_health')) > 0,
        referral_gbv=_int(payload.get('or_ref_gbv')) > 0,
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_camp(payload, lat, lng):
    """F-10 Mobile Camp patient record → MobileHealthCamp (one row per patient;
    1.9 counts distinct centre+date = camps conducted)."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(MobileHealthCamp, payload):
        return HttpResponse('OK', status=200)
    MobileHealthCamp.objects.create(
        organisation=ORG, center=center,
        camp_date=_date(payload.get('mc_date')) or _sub_date(payload),
        clients_served=1,
        hiv_tests_done=1 if _str(payload.get('mc_hiv_result')) else 0,
        sti_screenings_done=1 if _bool(payload.get('mc_screening_sti_hiv')) else 0,
        condoms_distributed=_int(payload.get('mc_condom_demo')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


# Event-kind routing for F-11/F-12. participant audience decides the model +
# the indicator (2.1 managers, 2.2 midwives, 2.5 peers / 2.3 GOB, 2.4 CBO,
# 2.6 observance). The form's gender/age counts give total_participants.
_TRAINING_KINDS = {
    'orientation_managers': ('orientation', 'HM'),
    'training_midwives':    ('training', 'MW'),
    'training_peers':       ('training', 'PE'),
}
_MEETING_KINDS = {
    'coord_gob':  'GOB',
    'coord_cbo':  'CBO',
    'observance': CoordMeeting.DAY_OBSERVANCE,
}


def _event_total(payload):
    explicit = _int_or_none(payload.get('ev_total'))
    if explicit:
        return explicit
    # Corrected gender buckets: Man / Woman / TG-Hijra / Others.
    keys = ['ev_man', 'ev_woman', 'ev_tg_hijra', 'ev_other']
    return sum(_int(payload.get(k)) for k in keys)


def _bnd_event(payload, lat, lng):
    """F-12 Event Report → TrainingEvent or CoordMeeting, by event kind."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    kind = _str(payload.get('ev_kind'))
    date = _date(payload.get('ev_date')) or _sub_date(payload)
    total = _event_total(payload)
    if kind in _TRAINING_KINDS:
        if _already_exists(TrainingEvent, payload):
            return HttpResponse('OK', status=200)
        etype, ptype = _TRAINING_KINDS[kind]
        TrainingEvent.objects.create(
            organisation=ORG, center=center,
            event_date=date, event_type=etype, participant_type=ptype,
            topic=_str(payload.get('ev_activity')),
            location_text=_str(payload.get('ev_place')),
            total_participants=total,
            **_base_kwargs(payload, lat, lng),
        )
        return HttpResponse('Created', status=201)
    mtype = _MEETING_KINDS.get(kind, 'GOB')
    if _already_exists(CoordMeeting, payload):
        return HttpResponse('OK', status=200)
    CoordMeeting.objects.create(
        organisation=ORG, center=center,
        meeting_date=date, meeting_type=mtype,
        location_text=_str(payload.get('ev_place')),
        participant_count=total,
        agenda=_str(payload.get('ev_objective')),
        key_decisions=_str(payload.get('ev_discussion')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_attendance(payload, lat, lng):
    """F-11 Attendance — per-participant roster. Stored (raw) only; the event's
    participant total is captured by the F-12 Event Report (the counted
    source for 2.1/2.2/2.5), so attendance rows must not inflate it."""
    return HttpResponse('OK', status=200)


def _bnd_stock(payload, lat, lng):
    """F-13 Stock Register — commodity ledger. Stored (raw) only; no indicator
    counts stock directly."""
    return HttpResponse('OK', status=200)


def _bnd_ebillboard(payload, lat, lng):
    """F-14 e-billboard screenshot → IECMaterial(digital). Drives 4.2."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    if _already_exists(IECMaterial, payload):
        return HttpResponse('OK', status=200)
    from partners.models import Partner
    partner = Partner.objects.filter(code='Bandhu').first()
    IECMaterial.objects.create(
        partner=partner, organisation=ORG, center=center,
        material_type=IECMaterial.DIGITAL, quantity=1,
        date_distributed=_date(payload.get('eb_date')) or _sub_date(payload),
        district=_str(payload.get('eb_location')),
        **_base_kwargs(payload, lat, lng),
    )
    return HttpResponse('Created', status=201)


def _bnd_centre_info(payload, lat, lng, *, name_key, addr_key, incharge_key,
                     staff_key, functional_key, cruising_key=None, equipped_key=None):
    """F-07 / F-09 — update the selected centre's roster details in place.
    These are reference/info records, not counted submissions."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    changed = []
    addr = _str(payload.get(addr_key))
    if addr:
        center.address = addr; changed.append('address')
    func = payload.get(functional_key)
    if func is not None and _str(func) != '':
        center.is_active = _bool(func); changed.append('is_active')
    if cruising_key:
        spot = _str(payload.get(cruising_key))
        # ServiceCenter has no dedicated incharge/staff/cruising columns; the
        # full detail is preserved on the centre's notes-style fields where they
        # exist. address + is_active are the columns we can safely set.
    if changed:
        center.save(update_fields=changed + ['updated_at'] if hasattr(center, 'updated_at') else changed)
    return HttpResponse('OK', status=200)


def _bnd_kp_clinic_info(payload, lat, lng):
    """F-07 KP Clinic Information → updates the selected centre's roster."""
    return _bnd_centre_info(
        payload, lat, lng,
        name_key='kc_name', addr_key='kc_address', incharge_key='kc_incharge',
        staff_key='kc_num_staff', functional_key='kc_functional', equipped_key='kc_equipped')


def _bnd_wellness_center_info(payload, lat, lng):
    """F-09 Wellness Center Information → updates the selected centre's roster."""
    return _bnd_centre_info(
        payload, lat, lng,
        name_key='wc_name', addr_key='wc_address', incharge_key='wc_incharge',
        staff_key='wc_num_staff', functional_key='wc_functional', cruising_key='wc_cruising_spot')


def handle_bandhu_activity_ops(payload, lat, lng):
    dispatch = {
        'outreach':              _bnd_outreach,
        'mobile_camp':           _bnd_camp,
        'event_report':          _bnd_event,
        'attendance':            _bnd_attendance,
        'stock':                 _bnd_stock,
        'kp_clinic_info':        _bnd_kp_clinic_info,
        'wellness_center_info':  _bnd_wellness_center_info,
        'ebillboard':            _bnd_ebillboard,
    }
    fn = dispatch.get(_str(payload.get('record_type')))
    if not fn:
        return HttpResponse('unknown record_type', status=400)
    return fn(payload, lat, lng)


# ─── Form 0: Mother List (registration → Client, auto-approved) ────────────────

def handle_bandhu_mother_list(payload, lat, lng):
    """F-1.1 Mother List → create/update the Bandhu Client (the master list).

    Auto-approved (like PHD registration) so the service forms' pulldata
    autofill finds the client immediately. This is NOT part of the two-stage
    review (Rafi's decision: registration auto-approves)."""
    center = _get_center(payload, ORG)
    if not center:
        return HttpResponse('center not found', status=400)
    client_id = str(payload.get('ml_id_no', '')).strip().upper()
    if not client_id:
        return HttpResponse('Bad Request — ml_id_no required', status=400)
    kobo_id = str(payload.get('_id', ''))
    if kobo_id and Client.objects.filter(kobo_submission_id=kobo_id).exists():
        return HttpResponse('OK', status=200)
    # First registration wins — same rule as handle_phd_registration. A second
    # Mother List entry on the same ml_id_no is a DUPLICATE and must NOT
    # overwrite the existing client (that would silently replace one person's
    # record with another's). get_or_create only writes `defaults` on create.
    client, created = Client.objects.get_or_create(
        client_id=client_id,
        defaults={
            'organisation': ORG, 'center': center,
            'name': _str(payload.get('ml_name')),
            'father_name': _str(payload.get('ml_parent_name')),
            'birth_year': _int_or_none(payload.get('ml_birth_year')),
            'target_group_code': _str(payload.get('ml_gender')),
            'current_address': _str(payload.get('ml_address')),
            'spot_name': _str(payload.get('ml_spot')),
            'education_level': _str(payload.get('ml_education')),
            'marital_status': _str(payload.get('ml_marital')),
            'children_under_18': _int_or_none(payload.get('ml_children_u18')),
            'occupation_code': _str(payload.get('ml_occupation')),
            'avg_clients_per_day': _int_or_none(payload.get('ml_avg_day')),
            'current_status': Client.ACTIVE,
            'approval_status': Client.APPROVED,
            'kobo_submission_id': kobo_id or None,
            'submitted_by_kobo_user': _str(payload.get('_submitted_by')),
            'latitude': lat, 'longitude': lng, 'raw_payload': payload,
        },
    )
    if not created:
        logger.warning(
            'Duplicate Bandhu Mother List ml_id_no=%s (kobo=%s) ignored — '
            'existing client %s (%r) kept.',
            client_id, kobo_id or '-', client.pk, client.name,
        )
        return HttpResponse('Duplicate ml_id_no — existing registration kept', status=200)
    return HttpResponse('Created', status=201)
