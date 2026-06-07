"""
Webhook handlers for the 9 CIPRB KoboToolbox forms (Phase 2).

  ciprb_fistula_questions_v1          → fistula.CIPRBFistulaCase
  ciprb_mpdsr_community_maternal_v1   → mpdsr.MPDSRCase (sub_form_type='f1')
  ciprb_mpdsr_community_neonatal_v1   → mpdsr.MPDSRCase (sub_form_type='f2')
  ciprb_mpdsr_facility_maternal_v1    → mpdsr.MPDSRCase (sub_form_type='f4')
  ciprb_mpdsr_facility_neonatal_v1    → mpdsr.MPDSRCase (sub_form_type='f5')
  ciprb_social_autopsy_v1             → mpdsr.MPDSRCase (sub_form_type='sa_md')
  ciprb_notification_slip_01_v1       → mpdsr.MPDSRDeathNotification (slip 01)
  ciprb_notification_slip_02_v1       → mpdsr.MPDSRDeathNotification (slip 02)
  ciprb_near_miss_v1                  → mpdsr.MaternalNearMissCase

The webhook dispatcher (programs.webhook) flattens grouped Kobo keys
before calling these handlers, so all fields are at the top level.
"""
import logging
from datetime import datetime

from django.db import transaction
from django.http import HttpResponse
from django.utils.dateparse import parse_date

from fistula.ciprb_models import CIPRBFistulaCase
from mpdsr.ciprb_models import MPDSRDeathNotification, MaternalNearMissCase
from mpdsr.models import MPDSRCase, DeathType, PlaceOfDeath, ReviewStatus

logger = logging.getLogger(__name__)

ORG = 'CIPRB'


# ─── Coercion helpers (forgiving — Kobo sends strings) ──────────────────────
def _s(v):
    if v is None: return ''
    return str(v).strip()


def _int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def _bool(v):
    if v is None: return None
    s = str(v).strip().lower()
    if s in ('1', 'yes', 'true', 'y', 't'):  return True
    if s in ('0', 'no',  'false','n', 'f'):  return False
    return None


def _date(v):
    if not v: return None
    if isinstance(v, datetime): return v.date()
    try:
        return parse_date(str(v))
    except (TypeError, ValueError):
        return None


def _geo(payload):
    geo = payload.get('_geolocation') or [None, None]
    if isinstance(geo, (list, tuple)) and len(geo) >= 2:
        return geo[0], geo[1]
    return None, None


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   Form 1 — CIPRB Fistula Question Bank                                  ║
# ║   The form is staged: each submission carries data for ONE stage.        ║
# ║   Upsert on (district, case_serial, name) and merge stage-specific       ║
# ║   fields onto the row so the case accumulates over time.                ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def handle_ciprb_fistula(payload, lat, lng):
    stage = _s(payload.get('stage')) or CIPRBFistulaCase.STAGE_SUSPECTED
    if stage not in dict(CIPRBFistulaCase.STAGE_CHOICES):
        return HttpResponse(f'Bad Request — unknown stage {stage!r}', status=400)

    district = _s(payload.get('district'))
    serial   = _s(payload.get('case_serial'))
    name     = _s(payload.get('name'))
    if not (district and name):
        return HttpResponse('Bad Request — district and name required',
                            status=400)

    with transaction.atomic():
        # Find an existing case row for this woman in this district, keyed by
        # serial first (if the field worker carried one) otherwise by name.
        qs = CIPRBFistulaCase.objects.select_for_update().filter(district=district)
        if serial:
            qs = qs.filter(case_serial=serial)
        else:
            qs = qs.filter(name=name)
        case = qs.first()
        if case is None:
            case = CIPRBFistulaCase(
                district=district, case_serial=serial, name=name,
                organisation=ORG,
            )

        # ── Stage-agnostic identity (always overwrite — newer is truthier).
        case.upazila = _s(payload.get('upazila'))    or case.upazila
        case.union   = _s(payload.get('union'))      or case.union
        case.village = _s(payload.get('village'))    or case.village

        for fld in ('age', 'age_at_marriage', 'age_at_first_delivery',
                    'number_of_children'):
            v = _int(payload.get(fld))
            if v is not None: setattr(case, fld, v)

        for fld in ('education', 'husband', 'husband_profession',
                    'profession_patient', 'current_condition',
                    'contact_number', 'marital_status',
                    'delivery_complication', 'last_delivery_labour_duration',
                    'mode_of_last_delivery', 'place_of_last_delivery',
                    'conducted_last_delivery', 'delivery_outcome',
                    'reasons_no_institutional_delivery',
                    'time_duration_fistula_occurrence',
                    'duration_suffering'):
            v = _s(payload.get(fld))
            if v: setattr(case, fld, v)

        # ── Stage-specific fields.
        if stage == CIPRBFistulaCase.STAGE_SUSPECTED:
            case.suspected_date     = _date(payload.get('suspected_date')) or case.suspected_date
            case.source_information = _s(payload.get('source_information')) or case.source_information
        elif stage == CIPRBFistulaCase.STAGE_DIAGNOSED:
            case.diagnosed_date  = _date(payload.get('diagnosed_date'))  or case.diagnosed_date
            case.diagnosed_place = _s(payload.get('diagnosed_place'))    or case.diagnosed_place
            case.diagnosed_by    = _s(payload.get('diagnosed_by'))       or case.diagnosed_by
        elif stage == CIPRBFistulaCase.STAGE_REFERRED:
            case.refer_date          = _date(payload.get('refer_date')) or case.refer_date
            case.refer_place         = _s(payload.get('refer_place'))   or case.refer_place
            case.referred_by_person  = _s(payload.get('referred_by_person')) or case.referred_by_person
            case.refer_outcome       = _s(payload.get('refer_outcome')) or case.refer_outcome
        elif stage == CIPRBFistulaCase.STAGE_REPAIRED:
            case.operation_date      = _date(payload.get('operation_date')) or case.operation_date
            case.operation_place     = _s(payload.get('operation_place')) or case.operation_place
            hsd = _int(payload.get('hospital_stay_days'))
            if hsd is not None: case.hospital_stay_days = hsd
            tops = _int(payload.get('times_of_operations'))
            if tops is not None: case.times_of_operations = tops
            for fld in ('fistula_type_v2', 'iatrogenic_cause',
                        'genital_fistula_type', 'operation_route',
                        'surgery_outcome_v2'):
                v = _s(payload.get(fld))
                if v: setattr(case, fld, v)
        elif stage == CIPRBFistulaCase.STAGE_REHABILITATED:
            rb = _bool(payload.get('rehabilitation_received'))
            if rb is not None: case.rehabilitation_received = rb
            case.rehabilitation_date = _date(payload.get('rehabilitation_date')) or case.rehabilitation_date
            case.rehab_place         = _s(payload.get('rehab_place'))   or case.rehab_place
            case.rehab_support_types = _s(payload.get('rehab_support_types')) or case.rehab_support_types
            case.rehab_notes         = _s(payload.get('rehab_notes'))   or case.rehab_notes

        # ── Pipeline forward-progression: never let the stage go backwards.
        stage_order = {s: i for i, (s, _) in enumerate(CIPRBFistulaCase.STAGE_CHOICES)}
        if stage_order[stage] >= stage_order[case.current_stage]:
            case.current_stage = stage

        case.enumerator_name = _s(payload.get('enumerator_name'))
        case.enumerator_mobile = _s(payload.get('enumerator_mobile'))
        case.latitude, case.longitude = lat, lng
        case.raw_payload = payload
        case.save()

    return HttpResponse('OK', status=200)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   MPDSR Forms 1, 2, 4, 5 + Social Autopsy                               ║
# ║   All five upsert into MPDSRCase. sub_form_type distinguishes them.     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

_PLACE_MAP = {
    'home':       PlaceOfDeath.HOME,
    'facility':   PlaceOfDeath.FACILITY,
    'in_transit': PlaceOfDeath.IN_TRANSIT,
}

_REVIEW_STATUS_MAP = {
    'reviewed':    ReviewStatus.CLOSED,
    'pending':     ReviewStatus.REPORTED,
    'in_progress': ReviewStatus.UNDER_REVIEW,
}


def _save_mpdsr_case(payload, lat, lng, *, sub_form_type, death_type,
                     death_field_name='cause_of_death'):
    """Common upsert for any MPDSR review form."""
    serial   = _s(payload.get('case_serial'))
    district = _s(payload.get('district'))
    dod = _date(payload.get('date_of_death'))
    if not (district and dod):
        return HttpResponse('Bad Request — district and date_of_death required',
                            status=400)

    qs = MPDSRCase.objects.select_for_update().filter(
        partner=ORG, sub_form_type=sub_form_type, district=district,
    )
    if serial:
        qs = qs.filter(case_hash=serial)
    else:
        qs = qs.filter(date_of_death=dod,
                       facility_name=_s(payload.get('facility_name')))

    with transaction.atomic():
        case = qs.first()
        if case is None:
            case = MPDSRCase(
                partner=ORG, sub_form_type=sub_form_type,
                district=district, date_of_death=dod,
                death_type=death_type,
            )
        case.partner = ORG
        case.sub_form_type = sub_form_type
        case.district = district
        case.upazila = _s(payload.get('upazila'))
        case.union   = _s(payload.get('union'))
        case.date_of_death = dod
        # Facility admission date (Form 04 only) — drives the admission→death
        # interval visual. Absent on community forms → stays null.
        adm = _date(payload.get('admission_date'))
        if adm: case.admission_date = adm
        case.death_type    = death_type
        case.cause_of_death = _s(payload.get(death_field_name))
        place = _PLACE_MAP.get(_s(payload.get('place_of_death')), '')
        if place: case.place_of_death = place
        case.facility_name = _s(payload.get('facility_name'))
        age = _int(payload.get('deceased_age')) or _int(payload.get('woman_age'))
        if age: case.age_years = age

        rs = _REVIEW_STATUS_MAP.get(_s(payload.get('review_status')))
        if rs: case.status = rs
        case.committee_date = _date(payload.get('review_date'))
        case.action_plan    = _s(payload.get('action_plan_summary'))
        case.notes          = (
            _s(payload.get('three_delays'))
            + ('\n' if payload.get('three_delays') and payload.get('contributory_factors') else '')
            + _s(payload.get('contributory_factors'))
        )
        if serial:
            case.case_hash = serial[:30]

        # ── CIPRB dashboard "major indicators" — persist the 9 fields that
        #    were previously dropped. Only the review forms (f1/f2/f4/f5)
        #    carry them; Social Autopsy (sa_md) is a qualitative re-review of
        #    an already-counted death and emits none of these, so skip it to
        #    avoid writing empty indicator rows.
        if sub_form_type != 'sa_md':
            case.time_of_death            = _s(payload.get('time_of_death'))
            gw = _int(payload.get('gestational_weeks'))
            if gw is not None: case.gestational_weeks = gw
            case.anc_visits_count         = _s(payload.get('anc_visits_count'))
            case.pnc_received             = _s(payload.get('pnc_received'))
            case.mode_of_delivery         = _s(payload.get('mode_of_delivery'))
            case.delivery_outcome         = _s(payload.get('delivery_outcome'))
            case.place_of_delivery        = _s(payload.get('place_of_delivery'))
            case.person_assisted_delivery = _s(payload.get('person_assisted_delivery'))
            tdab = _int(payload.get('time_death_after_birth_hours'))
            if tdab is not None: case.time_death_after_birth_hours = tdab

        case.latitude, case.longitude = lat, lng
        case.source = 'kobo'
        case.save()
    return HttpResponse('OK', status=200)


def handle_ciprb_mpdsr_community_maternal(payload, lat, lng):
    return _save_mpdsr_case(payload, lat, lng,
                             sub_form_type='f1',
                             death_type=DeathType.MATERNAL)


def handle_ciprb_mpdsr_community_neonatal(payload, lat, lng):
    return _save_mpdsr_case(payload, lat, lng,
                             sub_form_type='f2',
                             death_type=DeathType.PERINATAL)


def handle_ciprb_mpdsr_facility_maternal(payload, lat, lng):
    return _save_mpdsr_case(payload, lat, lng,
                             sub_form_type='f4',
                             death_type=DeathType.MATERNAL)


def handle_ciprb_mpdsr_facility_neonatal(payload, lat, lng):
    return _save_mpdsr_case(payload, lat, lng,
                             sub_form_type='f5',
                             death_type=DeathType.PERINATAL)


def handle_ciprb_social_autopsy(payload, lat, lng):
    # The Social Autopsy form's only cause-of-death field is the
    # downstream MPDSR Form 1; here the notes capture the three delays.
    return _save_mpdsr_case(payload, lat, lng,
                             sub_form_type='sa_md',
                             death_type=DeathType.MATERNAL,
                             death_field_name='cause_brief')


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   Notification slips 01 + 02                                            ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _save_notification(payload, lat, lng, slip_variant: str):
    district = _s(payload.get('district'))
    dod = _date(payload.get('date_of_death'))
    name = _s(payload.get('deceased_name'))
    if not (district and dod and name):
        return HttpResponse(
            'Bad Request — district, date_of_death, deceased_name required',
            status=400)
    place = _s(payload.get('place_of_death'))
    obj, _ = MPDSRDeathNotification.objects.update_or_create(
        slip_variant=slip_variant,
        district=district, date_of_death=dod, deceased_name=name,
        defaults=dict(
            organisation=ORG,
            upazila=_s(payload.get('upazila')),
            union=_s(payload.get('union')),
            village=_s(payload.get('village')),
            case_serial=_s(payload.get('case_serial')),
            death_kind=_s(payload.get('death_kind')) or MPDSRDeathNotification.KIND_MATERNAL,
            deceased_age=_int(payload.get('deceased_age')),
            deceased_address=_s(payload.get('deceased_address')),
            place_of_death=place if place in dict(MPDSRDeathNotification.PLACE_CHOICES) else '',
            cause_brief=_s(payload.get('cause_brief')),
            reporter_name=_s(payload.get('reporter_name')) or _s(payload.get('enumerator_name')),
            reporter_role=_s(payload.get('reporter_role')),
            reporter_mobile=_s(payload.get('reporter_mobile')) or _s(payload.get('enumerator_mobile')),
            notification_date=_date(payload.get('notification_date')) or dod,
            latitude=lat, longitude=lng,
            raw_payload=payload,
        ),
    )
    return HttpResponse('OK', status=200)


def handle_ciprb_notification_slip_01(payload, lat, lng):
    return _save_notification(payload, lat, lng, MPDSRDeathNotification.SLIP_01)


def handle_ciprb_notification_slip_02(payload, lat, lng):
    return _save_notification(payload, lat, lng, MPDSRDeathNotification.SLIP_02)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   Maternal Near Miss audit                                              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

_MNM_BOOL_FIELDS = (
    'sev_pph', 'sev_preec', 'eclampsia', 'sepsis', 'rupt_uterus', 'sev_abortion',
    'crit_blood', 'crit_radiol', 'crit_laparot', 'crit_icu',
    'life_cardio', 'life_resp', 'life_renal', 'life_coag',
    'life_hepatic', 'life_neuro', 'life_uterine',
)


def handle_ciprb_near_miss(payload, lat, lng):
    district = _s(payload.get('district'))
    event_date = _date(payload.get('event_date'))
    name = _s(payload.get('woman_name'))
    if not (district and event_date and name):
        return HttpResponse(
            'Bad Request — district, event_date, woman_name required',
            status=400)

    serial = _s(payload.get('case_serial'))
    qs = MaternalNearMissCase.objects.select_for_update().filter(
        district=district, woman_name=name, event_date=event_date,
    )
    with transaction.atomic():
        case = qs.first() or MaternalNearMissCase(
            district=district, woman_name=name, event_date=event_date,
            organisation=ORG,
        )
        case.upazila = _s(payload.get('upazila'))
        case.union   = _s(payload.get('union'))
        case.village = _s(payload.get('village'))
        case.case_serial = serial
        age = _int(payload.get('woman_age'))
        if age: case.woman_age = age
        gw = _int(payload.get('gestational_weeks'))
        if gw: case.gestational_weeks = gw
        case.facility_name = _s(payload.get('facility_name'))

        for fld in _MNM_BOOL_FIELDS:
            b = _bool(payload.get(fld))
            if b is not None: setattr(case, fld, b)

        case.mode_of_delivery   = _s(payload.get('mode_of_delivery'))
        case.delivery_outcome   = _s(payload.get('delivery_outcome'))
        case.cause_of_near_miss = _s(payload.get('cause_of_near_miss'))
        case.contributory_conditions = _s(payload.get('contributory_conditions'))
        case.audit_summary           = _s(payload.get('audit_summary'))

        case.enumerator_name   = _s(payload.get('enumerator_name'))
        case.enumerator_mobile = _s(payload.get('enumerator_mobile'))
        case.latitude, case.longitude = lat, lng
        case.raw_payload = payload
        case.save()
    return HttpResponse('OK', status=200)
