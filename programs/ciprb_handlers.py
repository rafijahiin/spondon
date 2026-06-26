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

from django.db import transaction, IntegrityError
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


def _norm_id(raw):
    """Normalise a patient ID the same way the form (translate(normalize-space()))
    and the export CSV (_norm_id) do: strip + upper-case. Keeps the stored
    patient_code, the CSV key, and the form's pulldata lookups all in sync, so
    ' 1-0001 ' and '1-0001' resolve to one row."""
    return _s(raw).upper()


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


def _district(payload):
    """Canonicalise the district to proper case.

    The Kobo `district` question is a select_one whose choice *values* are
    lowercase slugs ('sunamganj', 'moulavibazar'), so a live submission would
    otherwise store 'sunamganj' while seed / Excel rows use 'Sunamganj' —
    splitting per-district groupings and showing lowercase in tables. All 18
    CIPRB districts are single words, so slug→proper is a clean title-case.
    """
    raw = _s(payload.get('district'))
    if not raw:
        return ''
    return raw.replace('_', ' ').title()


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   Form 1 — CIPRB Fistula Question Bank                                  ║
# ║   The form is staged: each submission carries data for ONE stage.        ║
# ║   Identity is captured ONCE, at the Suspected stage, under a unique      ║
# ║   patient_code (<district-code>-<4 digits>). Every later stage           ║
# ║   references that exact code via the form's dropdown, so the upsert keys ║
# ║   on patient_code and merges stage-specific fields onto the one row.     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def handle_ciprb_fistula(payload, lat, lng):
    stage = _s(payload.get('stage')) or CIPRBFistulaCase.STAGE_SUSPECTED
    if stage not in dict(CIPRBFistulaCase.STAGE_CHOICES):
        return HttpResponse(f'Bad Request — unknown stage {stage!r}', status=400)

    # The form unifies the free-text (suspected) and dropdown (later) ID into
    # patient_code_final; fall back to the raw fields for resilience.
    code = _norm_id(payload.get('patient_code_final')
                    or payload.get('patient_code')
                    or payload.get('patient_code_sel'))
    district = _district(payload)
    name     = _s(payload.get('name'))
    is_suspected = stage == CIPRBFistulaCase.STAGE_SUSPECTED

    if is_suspected:
        # Registration: code + name + district all required.
        if not (code and name and district):
            return HttpResponse(
                'Bad Request — patient_code, name and district required at '
                'the suspected stage', status=400)
    else:
        # Later stages: identity comes from the registered row; only the code
        # (picked from the dropdown) is required.
        if not code:
            return HttpResponse('Bad Request — patient_code required', status=400)

    with transaction.atomic():
        # The patient_code is the single, unique upsert key.
        case = (CIPRBFistulaCase.objects.select_for_update()
                .filter(patient_code=code).first())
        if case is None:
            if not is_suspected:
                # A later-stage submission for an unknown ID — create a stub so
                # the data isn't lost. It carries the code + stage but no
                # identity (the registration that should have set it is missing).
                case = CIPRBFistulaCase(
                    patient_code=code, organisation=ORG,
                    district=district, name=(name or 'Unknown'),
                    approval_status='PENDING',
                )
            else:
                case = CIPRBFistulaCase(
                    patient_code=code, organisation=ORG,
                    district=district, name=name,
                    approval_status='PENDING',
                )
        # Record the Kobo submitter for the approval queue display (latest wins).
        case.submitted_by_kobo_user = _s(payload.get('_submitted_by')) or case.submitted_by_kobo_user
        case.kobo_submission_id = str(payload.get('_id', '')) or case.kobo_submission_id

        # ── Identity + obstetric history are captured ONLY at registration
        #    (the form omits these fields at later stages). Gating the writes
        #    here keeps a later-stage submission from blanking a registered
        #    woman's details even if the payload carried stray empties.
        if is_suspected:
            case.district = district or case.district
            case.name     = name or case.name
            case.case_serial = _s(payload.get('case_serial')) or case.case_serial
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
            # Anatomical type (VVF/RVF/…) is now classified at diagnosis.
            # When 'other' is chosen the worker types the specific type; keep
            # that free text so the specified problem isn't lost as a bare code.
            gft = _s(payload.get('genital_fistula_type'))
            if gft == 'other':
                gft = _s(payload.get('genital_fistula_type_other')) or gft
            case.genital_fistula_type = gft or case.genital_fistula_type
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
            # genital_fistula_type moved to the Diagnosed stage; the surgery
            # stage keeps only the cause classification + operative detail.
            for fld in ('fistula_type_v2', 'iatrogenic_cause',
                        'operation_route', 'surgery_outcome_v2'):
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
    district = _district(payload)
    # Verbatim forms name the death date 'death_date' (F01/F02/F05); F04 keeps
    # 'date_of_death'. Read either so community submissions aren't rejected.
    dod = _date(payload.get('date_of_death') or payload.get('death_date'))
    if not (district and dod):
        return HttpResponse('Bad Request — district and date_of_death required',
                            status=400)

    # Consent (community maternal/neonatal + social autopsy): an explicit 'No'
    # is HONOURED — we keep only a de-identified death count (district / date /
    # cause), withholding facility, narrative and action plan. Absent or
    # 'unknown' is NOT a refusal.
    consent_refused = (_bool(payload.get('consent_given')) is False)

    # De-dup key. With a serial, match on it. Without one, fall back to the Kobo
    # submission id so a genuine RETRY updates the same row, but two DIFFERENT
    # deaths never collide. (The old fallback keyed on (date, facility_name), so
    # two home deaths on the same date in the same district — facility_name=''
    # for both — silently overwrote each other.)
    sub_id = str(payload.get('_id') or '')
    qs = MPDSRCase.objects.select_for_update().filter(
        partner=ORG, sub_form_type=sub_form_type, district=district,
    )
    if serial:
        qs = qs.filter(case_hash=serial)
    elif sub_id:
        qs = qs.filter(case_hash='kobo:' + sub_id)
    else:
        qs = qs.none()   # nothing to match on — never overwrite a different death

    with transaction.atomic():
        case = qs.first()
        if case is None:
            case = MPDSRCase(
                partner=ORG, sub_form_type=sub_form_type,
                district=district, date_of_death=dod,
                death_type=death_type,
                approval_status='PENDING',
            )
        case.partner = ORG
        case.organisation = ORG
        case.submitted_by_kobo_user = _s(payload.get('_submitted_by')) or case.submitted_by_kobo_user
        case.kobo_submission_id = sub_id or case.kobo_submission_id
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
        # Cause of death — keep the typed cause when 'Other' is chosen
        # (previously only the slug 'other' was stored and the free text lost).
        # Cause field name differs per verbatim form: F04 'cause_of_death',
        # F01/F02 'icd_cause', F05 'cod_cause', Social Autopsy 'cause_brief'.
        cod = (_s(payload.get(death_field_name)) or _s(payload.get('cause_of_death'))
               or _s(payload.get('icd_cause')) or _s(payload.get('cod_cause')))
        if cod == 'other' and not consent_refused:
            other_txt = (_s(payload.get('cause_of_death_other')) or _s(payload.get('cause_other'))
                         or _s(payload.get('cause_name')) or _s(payload.get('icd_disease_name')))
            if other_txt:
                cod = 'other: ' + other_txt
        case.cause_of_death = cod
        # Place field differs per verbatim form (death_place / death_place_facility
        # / place_of_death_facility); the legacy _PLACE_MAP only knew
        # home/facility/in_transit, so map by substring (facility deaths → FACILITY).
        place_raw = _s(payload.get('place_of_death') or payload.get('death_place')
                       or payload.get('death_place_facility')
                       or payload.get('place_of_death_facility')).lower()
        if 'home' in place_raw:
            case.place_of_death = PlaceOfDeath.HOME
        elif 'transit' in place_raw or 'on_way' in place_raw or 'on the way' in place_raw:
            case.place_of_death = PlaceOfDeath.IN_TRANSIT
        elif place_raw:
            case.place_of_death = PlaceOfDeath.FACILITY
        case.facility_name = '' if consent_refused else _s(payload.get('facility_name'))
        age = (_int(payload.get('deceased_age')) or _int(payload.get('mother_age'))
               or _int(payload.get('woman_age')))
        if age: case.age_years = age

        rs = _REVIEW_STATUS_MAP.get(_s(payload.get('review_status')))
        if rs: case.status = rs
        case.committee_date = _date(payload.get('review_date'))
        if consent_refused:
            case.action_plan = ''
            case.notes = ('[Consent refused — recorded as a de-identified death '
                          "count; identifying details, narrative and action plan "
                          "withheld at the family's request]")
        else:
            case.action_plan = _s(payload.get('action_plan_summary'))
            if sub_form_type == 'sa_md':
                # Social Autopsy keeps its Three-Delays narrative in
                # delay1/2/3_factors + recommendations/barrier notes (NOT the
                # three_delays/contributory_factors the generic save assumed —
                # those fields don't exist on this form, so the narrative was
                # being dropped entirely).
                parts = [_s(payload.get(k)) for k in (
                    'delay1_factors', 'delay2_factors', 'delay3_factors',
                    'community_recommendations',
                    'gender_barrier_notes', 'financial_barrier_notes')]
                case.notes = '\n'.join(p for p in parts if p)
            else:
                # Verbatim forms carry the narrative under several keys
                # (community vs facility); gather whatever is present.
                case.notes = '\n'.join(p for p in (
                    _s(payload.get('three_delays')),
                    _s(payload.get('contributory_factors')),
                    _s(payload.get('narrative_before_death')),
                    _s(payload.get('cause_opinion')),
                    _s(payload.get('death_narrative')),
                ) if p)
        if serial:
            case.case_hash = serial[:30]
        elif sub_id:
            case.case_hash = ('kobo:' + sub_id)[:30]

        # ── CIPRB dashboard "major indicators" — persist the 9 fields that
        #    were previously dropped. Only the review forms (f1/f2/f4/f5)
        #    carry them; Social Autopsy (sa_md) is a qualitative re-review of
        #    an already-counted death and emits none of these, so skip it to
        #    avoid writing empty indicator rows.
        if sub_form_type != 'sa_md':
            case.time_of_death            = _s(payload.get('time_of_death') or payload.get('death_time'))
            gw = _int(payload.get('gestational_weeks') or payload.get('gestation_week'))
            if gw is not None: case.gestational_weeks = gw
            case.anc_visits_count         = _s(payload.get('anc_visits_count') or payload.get('anc_count'))
            case.pnc_received             = _s(payload.get('pnc_received') or payload.get('pnc_count'))
            case.mode_of_delivery         = _s(payload.get('mode_of_delivery') or payload.get('delivery_mode'))
            case.delivery_outcome         = _s(payload.get('delivery_outcome'))
            case.place_of_delivery        = _s(payload.get('place_of_delivery')
                                              or payload.get('delivery_place') or payload.get('birth_place'))
            case.person_assisted_delivery = _s(payload.get('person_assisted_delivery')
                                              or payload.get('delivery_conductor'))
            tdab = _int(payload.get('time_death_after_birth_hours')
                        or payload.get('death_after_delivery_h') or payload.get('age_death_hours'))
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
    """CIPRB-6 Social Autopsy — a committee MEETING report, not a death review.

    The verbatim paper carries NO death date or structured cause/place (it is keyed
    to a death-notification slip number), so it cannot go through _save_mpdsr_case
    (which requires date_of_death). Stored as MPDSRCase sub_form_type='sa_md':
    the meeting date stands in as the required date stamp + committee_date, the
    narrative → notes, the prevention points + decisions → action_plan, and the
    full submission (name, sex, age m/d, member counts, slip no.) is preserved in
    raw_payload. Held PENDING for CIPRB approval on create.
    """
    district = _district(payload)
    meeting_date = _date(payload.get('meeting_date'))
    if not (district and meeting_date):
        return HttpResponse('Bad Request — district and meeting_date required',
                            status=400)
    sub_id = str(payload.get('_id') or '')
    slip = _s(payload.get('slip_number'))
    # 1 = maternal, 2 = neonatal, 3 = stillbirth → MATERNAL vs PERINATAL.
    death_type = DeathType.MATERNAL if _s(payload.get('sa_death_type')) == '1' else DeathType.PERINATAL

    def _block(prefix, n):
        out = []
        for i in range(1, n + 1):
            v = _s(payload.get('%s_%d' % (prefix, i)))
            if v:
                out.append('%d. %s' % (i, v))
        return '\n'.join(out)

    narrative = _s(payload.get('death_narrative'))
    prevention = _block('prevention', 4)
    decisions = _block('decision', 4)
    action_plan = ''
    if prevention:
        action_plan += 'Preventable factors:\n' + prevention
    if decisions:
        action_plan += ('\n\n' if action_plan else '') + 'Decisions:\n' + decisions

    # De-dup: slip number when present (one social-autopsy per notified death),
    # else the Kobo submission id so a retry updates the same row.
    qs = MPDSRCase.objects.select_for_update().filter(
        partner=ORG, sub_form_type='sa_md', district=district)
    if slip:
        qs = qs.filter(case_hash='sa:' + slip)
    elif sub_id:
        qs = qs.filter(case_hash='kobo:' + sub_id)
    else:
        qs = qs.none()

    with transaction.atomic():
        case = qs.first()
        is_new = case is None
        if is_new:
            case = MPDSRCase(partner=ORG, sub_form_type='sa_md', district=district,
                             approval_status='PENDING')
            case.case_hash = ('sa:' + slip) if slip else ('kobo:' + sub_id if sub_id else '')
        case.organisation = ORG
        case.district = district
        case.upazila = _s(payload.get('upazila'))
        case.union = _s(payload.get('union'))
        case.date_of_death = meeting_date     # no death date on the paper; meeting date is the stamp
        case.committee_date = meeting_date
        case.death_type = death_type
        age = _int(payload.get('age_years'))
        if age:
            case.age_years = age
        case.notes = narrative
        case.action_plan = action_plan
        case.latitude = lat
        case.longitude = lng
        case.raw_payload = payload
        case.submitted_by_kobo_user = _s(payload.get('_submitted_by'))
        case.kobo_submission_id = sub_id or case.kobo_submission_id
        case.save()
    return HttpResponse('OK', status=200)


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   Notification slips 01 + 02                                            ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _save_notification(payload, lat, lng, slip_variant: str):
    district = _district(payload)
    dod = _date(payload.get('date_of_death'))
    name = _s(payload.get('deceased_name'))
    if not (district and dod and name):
        return HttpResponse(
            'Bad Request — district, date_of_death, deceased_name required',
            status=400)
    place = _s(payload.get('place_of_death'))
    obj, created = MPDSRDeathNotification.objects.update_or_create(
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
            submitted_by_kobo_user=_s(payload.get('_submitted_by')),
            kobo_submission_id=str(payload.get('_id') or ''),
        ),
    )
    # New notifications are held for CIPRB-manager approval; a re-submission
    # (update) keeps whatever status it already has — no re-pending.
    if created:
        obj.approval_status = 'PENDING'
        obj.save(update_fields=['approval_status'])
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
    district = _district(payload)
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
            organisation=ORG, approval_status='PENDING',
        )
        case.submitted_by_kobo_user = _s(payload.get('_submitted_by')) or case.submitted_by_kobo_user
        case.kobo_submission_id = str(payload.get('_id') or '') or case.kobo_submission_id
        case.upazila = _s(payload.get('upazila'))
        case.union   = _s(payload.get('union'))
        case.village = _s(payload.get('village'))
        case.case_serial = serial
        age = _int(payload.get('woman_age'))
        if age: case.woman_age = age
        gw = _int(payload.get('gestational_weeks'))
        if gw: case.gestational_weeks = gw
        case.facility_name = _s(payload.get('facility_name'))

        # 3-state flags: always write _bool(...) — True/False/None — so an
        # explicit 'Unknown' is stored as None (distinct from False = No)
        # instead of silently collapsing into the model default.
        for fld in _MNM_BOOL_FIELDS:
            setattr(case, fld, _bool(payload.get(fld)))

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


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   MPDSR Action Plan (CIPRB 10) — staged per-action tracker              ║
# ║   'new_plan' creates one MPDSRAction per agreed action (each gets a      ║
# ║   <district-code>-<NN> id); 'update_action' moves one forward by id.     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _flat_item(item):
    """Flatten one Kobo repeat instance to leaf field names — the dispatcher
    only flattens the TOP-level payload, not inside repeats."""
    if not isinstance(item, dict):
        return {}
    flat = dict(item)
    for k, v in item.items():
        if '/' in k:
            flat.setdefault(k.rsplit('/', 1)[-1], v)
    return flat


def _repeat(payload, *keys):
    """The list of instances for a repeat group. Kobo may serialise a repeat
    nested in groups either as a top-level slash-key (the dispatcher aliases it
    to the leaf name) OR as a nested dict — search both so the handler reads the
    actions regardless of how deep the form nests the repeat.

    Crucially, match only LIST values: Kobo can emit an empty-string scalar
    placeholder for a 0-instance repeat, and the dispatcher's first-wins leaf
    aliasing could let that scalar shadow the real array. Scanning for a
    list-valued key (exact OR by leaf) makes a scalar placeholder un-shadowing."""
    want = set(keys)
    for k, v in payload.items():
        if isinstance(v, list) and isinstance(k, str) and (k in want or k.rsplit('/', 1)[-1] in want):
            return v

    def _search(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(k, str) and k.rsplit('/', 1)[-1] in want and isinstance(v, list):
                    return v
                found = _search(v)
                if found is not None:
                    return found
        elif isinstance(obj, list):
            for it in obj:
                found = _search(it)
                if found is not None:
                    return found
        return None

    return _search(payload) or []


# Enumerator contact PII that does not belong in the persisted action record /
# the approval-queue detail serializer. Stripped from raw_payload on save.
_ACTION_PII_KEYS = ('enumerator_mobile',)


def _safe_action_payload(payload):
    """raw_payload copy with enumerator contact PII removed (audit FIX 2026-06).
    The action register never needs the enumerator's mobile number, and
    raw_payload is otherwise visible to the whole CIPRB approver pool."""
    if not isinstance(payload, dict):
        return payload
    return {k: v for k, v in payload.items()
            if k.rsplit('/', 1)[-1] not in _ACTION_PII_KEYS}


def _couple_status_completion(act, completion_date):
    """Keep status and completion% coherent (audit FIX 2026-06): Implemented ⇒
    100%, and 100% ⇒ Implemented. Without this the form's two independent
    questions allow 'Implemented at 0%' or '100% but Pending' to persist."""
    from mpdsr.models import ActionStatus
    if act.status == ActionStatus.IMPLEMENTED:
        act.completion_pct = 100
        if not act.completion_date:
            act.completion_date = completion_date or act.timeline
    elif act.completion_pct == 100 and act.status not in (
            ActionStatus.IMPLEMENTED, ActionStatus.DROPPED):
        act.status = ActionStatus.IMPLEMENTED
        if not act.completion_date:
            act.completion_date = completion_date or act.timeline


def handle_ciprb_mpdsr_action_plan(payload, lat, lng):
    """CIPRB-10 MPDSR Action Plan — staged per-action tracker (fistula pattern).

    Mode 'new_plan': register ONE action whose <district-code>-<NNN> id the field
    worker TYPED; upsert on (district, action_id).
    Mode 'update_action': move an existing action (picked by id) forward —
    status / completion % / completion date / remarks.

    Hardened (audit 2026-06): idempotent on the Kobo _id (re-delivery safe);
    lookups scoped to (district, action_id) to match the uniqueness constraint;
    concurrent same-id inserts retried instead of 500-stranding; a different
    enumerator who reuses an id already owning a real action is reallocated a
    fresh id rather than silently overwriting it; unknown-id updates are ignored
    (no phantom rows); status/completion kept coherent.
    """
    from mpdsr.models import (MPDSRAction, ActionSection, ActionStatus,
                              STUB_ACTIVITY_SENTINEL)
    mode = _s(payload.get('ap_mode'))
    district = _district(payload)
    sub_id = str(payload.get('_id') or '')
    user = _s(payload.get('_submitted_by')) or 'kobo'
    enum_name = _s(payload.get('enumerator_name'))   # the typed "YOUR NAME" — creator/editor

    # ── Idempotency: Kobo re-delivers on timeout / 500-retry. If this exact
    #    submission was already applied, ack and skip — a redelivery would
    #    otherwise revert a CIPRB approval granted between deliveries and
    #    double-log the audit trail.
    if sub_id and MPDSRAction.objects.filter(kobo_submission_id=sub_id).exists():
        return HttpResponse('OK (duplicate delivery)', status=200)

    def _lookup(code):
        # Scope by (district, action_id) to match unique_together; the update
        # dropdown is district-filtered and new_plan always carries a district,
        # so id-only is a fallback for malformed payloads only.
        qs = MPDSRAction.objects.select_for_update().filter(action_id=code)
        if district:
            qs = qs.filter(district=district)
        return qs.first()

    # ── Update an existing action by id ────────────────────────────────────
    if mode == 'update_action':
        code = _norm_id(payload.get('ap_action_sel') or payload.get('ap_action_id'))
        if not code:
            return HttpResponse('Bad Request — no action selected', status=400)
        for attempt in range(3):
            try:
                with transaction.atomic():
                    act = _lookup(code)
                    if act is None:
                        # No such action. With PENDING actions now in the dropdown
                        # CSV a real action is always selectable, so an unknown id
                        # has nothing to advance — ack + log rather than fabricate
                        # a phantom '[awaiting plan record]' row.
                        logger.warning('MPDSR update_action for unknown id %r '
                                       '(district %r) — ignored', code, district)
                        return HttpResponse('OK (no such action; ignored)', status=200)
                    st = _s(payload.get('ap_new_status'))
                    if st: act.status = st
                    cp = _int(payload.get('ap_new_completion'))
                    if cp is not None: act.completion_pct = cp
                    cd = _date(payload.get('ap_completion_date'))
                    if cd: act.completion_date = cd
                    rm = _s(payload.get('ap_remarks'))
                    if rm: act.remarks = rm
                    _couple_status_completion(act, cd)
                    act.kobo_submission_id = sub_id or act.kobo_submission_id
                    # Per-creator gate: an edit drops the action back to PENDING
                    # for CIPRB re-approval; record the editor.
                    if enum_name:
                        act.last_edited_by_name = enum_name
                    act.approval_status = 'PENDING'
                    act.approved_by = None
                    act.approved_at = None
                    act.add_audit_entry(user, 'status update — pending re-approval',
                                        '%s / %s%% · edited by %s'
                                        % (act.status, act.completion_pct, enum_name or user))
                    act.save()
                return HttpResponse('OK', status=200)
            except IntegrityError:
                if attempt == 2:
                    logger.exception('MPDSR update_action conflict (acked): %s', code)
                    return HttpResponse('OK (conflict, logged)', status=200)
                continue

    # ── New plan — register ONE action, keyed on the worker-typed action_id. ──
    if not district:
        return HttpResponse('Bad Request — district required', status=400)
    code = _norm_id(payload.get('action_id'))
    if not code:
        return HttpResponse('Bad Request — action_id required', status=400)
    activity = _s(payload.get('act_activity'))
    if not activity:
        return HttpResponse('Bad Request — activity required', status=400)
    # The form carries no separate review-meeting date; the entry date is the
    # best available stamp.
    meeting_date = _date(payload.get('collection_date'))
    section = _s(payload.get('rp_section'))
    if section not in ActionSection.values:
        section = ActionSection.SYSTEM_STRENGTHENING
    for attempt in range(3):
        try:
            with transaction.atomic():
                act = _lookup(code)
                is_new = act is None
                if not is_new:
                    # The id already exists in this district. Distinguish a
                    # legitimate re-registration (same creator, or reconciling a
                    # left-over stub) from a genuine COLLISION — a DIFFERENT
                    # enumerator grabbing an id that already owns a real action.
                    # Never overwrite someone else's logged maternal-death action:
                    # reallocate the incoming submission to a fresh id (lossless).
                    is_stub = (act.activity == STUB_ACTIVITY_SENTINEL)
                    same_creator = bool(enum_name) and act.creator_name == enum_name
                    if not (is_stub or same_creator):
                        new_code = MPDSRAction.next_action_id(district)
                        logger.warning(
                            'MPDSR action id collision: %s already owns %r in %s; '
                            'reallocating incoming submission to %s', code,
                            (act.creator_name or act.submitted_by_kobo_user or '?'),
                            district, new_code)
                        code = new_code
                        act = None
                        is_new = True
                if is_new:
                    act = MPDSRAction(action_id=code, district=district,
                                      organisation=ORG, source='kobo')
                act.district = district
                act.organisation = ORG
                act.meeting_date = meeting_date
                act.section = section
                act.sub_category = _s(payload.get('act_subcat'))
                act.activity = activity
                act.responsible = _s(payload.get('act_responsible'))
                act.timeline = _date(payload.get('act_timeline'))
                act.indicator = _s(payload.get('act_indicator'))
                act.milestone = _s(payload.get('act_milestone'))
                act.considerations = _s(payload.get('act_considerations'))
                # Status/creator are set only at registration — a later re-submit
                # of the same id must not reset an advanced action or its owner.
                if is_new:
                    act.status = _s(payload.get('act_status')) or ActionStatus.PENDING
                    act.creator_name = enum_name            # immutable: set ONCE
                if enum_name:
                    act.last_edited_by_name = enum_name
                _couple_status_completion(act, None)
                act.kobo_submission_id = sub_id
                act.submitted_by_kobo_user = user
                act.raw_payload = _safe_action_payload(payload)
                # Every plan submission re-enters the CIPRB approval gate.
                act.approval_status = 'PENDING'
                act.approved_by = None
                act.approved_at = None
                act.add_audit_entry(user, 'created' if is_new else 're-registered',
                                    'plan %s · by %s' % (meeting_date or '', enum_name or user))
                act.save()
            return HttpResponse('OK — 1 action (%s)' % code, status=200)
        except IntegrityError:
            if attempt == 2:
                logger.exception('MPDSR new_plan conflict (acked): %s', code)
                return HttpResponse('OK (conflict, logged)', status=200)
            continue
