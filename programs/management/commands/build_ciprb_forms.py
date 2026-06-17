# -*- coding: utf-8 -*-
"""
Build the 9 CIPRB KoboToolbox XLSForms — Phase 2 deliverable.

  1. CIPRB Fistula Question Bank          ← Fistula Question.xlsx
  2. MPDSR Form 01 Community Maternal     ← MPDSR Form 01 (Community Mother).pdf
  3. MPDSR Form 02 Community Neonatal     ← MPDSR Form 02 (Community Neonate).pdf
  4. MPDSR Form 04 Facility Maternal      ← MPDSR Form 04 (Facility Maternal).pdf
  5. MPDSR Form 05 Facility Neonatal      ← MPDSR Form 05 (Facility Neonates).pdf
  6. Social Autopsy (Maternal Death)      ← Social Autopsy.pdf (Bangla)
  7. Death Notification Slip 01           ← notification slip01.pdf
  8. Death Notification Slip 02           ← notification slip02.pdf
  9. Maternal Near Miss audit             ← Tool_Near Miss.xlsx (WHO MNM)

Conventions (mirror build_phd_forms.py):
  - All forms CIPRB-tagged. organisation hidden calculate = 'CIPRB'.
  - Bilingual: English + Bangla. Govt MoHFW phrasing where the source
    PDF uses it; otherwise CIPRB-confirmed labels.
  - Single-page (theme-grid, no pages) — Enketo's pages mode hides the
    relevant-logic conditions, slows phones, breaks the staged workflow.
  - Case-ID = system UUID + visible CIPRB serial number per form.
  - 18 CIPRB districts from the Near Miss tool — the canonical
    working footprint across every form.

Run:
    python manage.py build_ciprb_forms                # writes xlsx
    python manage.py build_ciprb_forms --upload       # also uploads to Kobo
"""
import os
import openpyxl
import requests
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from django.conf import settings
from django.core.management.base import BaseCommand

HERE   = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', 'koboforms_ciprb'))

KOBO_BASE = 'https://kf.kobotoolbox.org'

_HFILL = PatternFill("solid", fgColor="003F72")
_HFONT = Font(color="FFFFFF", bold=True, size=10)


# ─── XLSForm helpers ──────────────────────────────────────────────────────────

SURVEY_HDR = [
    'type', 'name', 'label::English', 'label::Bangla',
    'hint', 'required', 'relevant', 'constraint', 'constraint_message',
    'default', 'appearance', 'calculation',
]
CHOICES_HDR  = ['list_name', 'name', 'label::English', 'label::Bangla']
SETTINGS_HDR = ['form_title', 'form_id', 'version', 'default_language', 'style']


def _sr(qtype, name, en='', bn='', hint='', required='',
        relevant='', constraint='', cmsg='', default='', app='', calc=''):
    return [qtype, name, en, bn, hint, required, relevant,
            constraint, cmsg, default, app, calc]


def _ch(lst, name, en, bn=''):
    return [lst, name, en, bn]


def _wb(form_id, form_title, survey, choices):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet_name, headers, rows in [
        ('survey',   SURVEY_HDR,  survey),
        ('choices',  CHOICES_HDR, choices),
        ('settings', SETTINGS_HDR,
         [[form_title, form_id, '20260607', 'English', 'theme-grid']]),
    ]:
        ws = wb.create_sheet(sheet_name)
        ws.append(headers)
        for ci in range(1, len(headers) + 1):
            c = ws.cell(1, ci)
            c.font = _HFONT
            c.fill = _HFILL
            c.alignment = Alignment(horizontal='center', wrap_text=True)
        for ri, row in enumerate(rows, 2):
            for ci, val in enumerate(row, 1):
                cell = ws.cell(ri, ci, value=val)
                cell.alignment = Alignment(wrap_text=True, vertical='top')
        for ci in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(ci)].width = 30
        ws.freeze_panes = 'A2'
    return wb


# ─── 18 canonical CIPRB districts ────────────────────────────────────────────
CIPRB_DISTRICTS = [
    'Sunamganj', 'Sherpur', 'Bhola', 'Kurigram', 'Gaibandha',
    'Khagrachari', 'Noakhali', 'Patuakhali', 'Sirajganj', 'Barguna',
    'Jamalpur', 'Bagerhat', 'Habiganj', 'Moulavibazar', 'Sylhet',
    'Bandarban', 'Chandpur', 'Rangpur', 'Dhaka',
]
DISTRICT_BANGLA = {
    'Sunamganj': 'সুনামগঞ্জ', 'Sherpur': 'শেরপুর', 'Bhola': 'ভোলা',
    'Kurigram': 'কুড়িগ্রাম', 'Gaibandha': 'গাইবান্ধা',
    'Khagrachari': 'খাগড়াছড়ি', 'Noakhali': 'নোয়াখালী',
    'Patuakhali': 'পটুয়াখালী', 'Sirajganj': 'সিরাজগঞ্জ',
    'Barguna': 'বরগুনা', 'Jamalpur': 'জামালপুর', 'Bagerhat': 'বাগেরহাট',
    'Habiganj': 'হবিগঞ্জ', 'Moulavibazar': 'মৌলভীবাজার',
    'Sylhet': 'সিলেট', 'Bandarban': 'বান্দরবান', 'Chandpur': 'চাঁদপুর',
    'Rangpur': 'রংপুর', 'Dhaka': 'ঢাকা',
}

DISTRICT_CHOICES = [
    _ch('district', d.lower().replace(' ', '_'), d, DISTRICT_BANGLA[d])
    for d in CIPRB_DISTRICTS
]

YES_NO = [
    _ch('yes_no', 'yes',     'Yes',     'হ্যাঁ'),
    _ch('yes_no', 'no',      'No',      'না'),
    _ch('yes_no', 'unknown', 'Unknown', 'অজানা'),
]


# ─── Shared submission header (CIPRB org + GPS + district + enumerator) ─────
def _meta(form_id_visible, form_id_visible_bn=''):
    """Common opening section every CIPRB form starts with.

    `form_id_visible` is the human-visible serial number CIPRB uses on
    paper (e.g. মাতৃমৃত্যুর বাৎসরিক ক্রমিক নং on MPDSR Form 1). It is
    captured as text so the field worker can copy what the paper carries;
    Django persists a UUID separately."""
    bn_label = form_id_visible_bn or form_id_visible
    return [
        _sr('begin_group', 'grp_meta', 'Submission info', 'তথ্য প্রেরণ'),
        _sr('calculate', 'organisation', '', '', calc="'CIPRB'"),
        _sr('geopoint', 'location',
            'GPS location (required — step outside if no signal)',
            'জিপিএস অবস্থান (প্রয়োজনীয়)', required='yes'),
        _sr('date', 'collection_date', 'Date', 'তারিখ', required='yes'),
        _sr('select_one district', 'district',
            'District', 'জেলা', required='yes'),
        _sr('text', 'upazila',  'Upazila',  'উপজেলা'),
        _sr('text', 'union',    'Union / Pourashava', 'ইউনিয়ন / পৌরসভা'),
        _sr('text', 'ward',     'Ward',     'ওয়ার্ড'),
        _sr('text', 'village',  'Village / Mahalla', 'গ্রাম / মহল্লা'),
        _sr('text', 'enumerator_name',
            'Your name (person filling this form)',
            'আপনার নাম (কে পূরণ করছেন)', required='yes'),
        _sr('text', 'enumerator_designation',
            'Designation', 'পদবী'),
        _sr('text', 'enumerator_mobile',
            'Mobile number', 'মোবাইল নম্বর',
            constraint='regex(., "^[0-9+ -]{6,20}$")',
            cmsg='Enter a valid phone number.'),
        _sr('text', 'case_serial',
            form_id_visible, bn_label,
            hint='The handwritten serial number from the paper form, if any.'),
        _sr('end_group', 'grp_meta'),
    ]


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 1 — CIPRB Fistula Question Bank                                  ║
# ║   Source: Fistula Question.xlsx                                          ║
# ║   5 staged sections: Suspected → Diagnosed → Referred → Repaired →       ║
# ║                      Rehabilitated & Reintegrated                        ║
# ╚══════════════════════════════════════════════════════════════════════════╝

# District slug → numeric code for the fistula patient-ID prefix. The spec
# names 10 base districts (codes 1–10); the remaining CIPRB districts get
# 11–18 in slug order so every option yields a deterministic prefix. The
# slug keys MUST match the `district` choice values (lower-cased, spaces→'_').
FISTULA_DISTRICT_CODE = {
    'sunamganj': 1, 'bhola': 2, 'noakhali': 3, 'gaibandha': 4,
    'kurigram': 5, 'sirajganj': 6, 'sherpur': 7, 'patuakhali': 8,
    'khagrachari': 9, 'dhaka': 10,
    # extras (no spec code) — kept deterministic so their IDs still validate:
    'barguna': 11, 'jamalpur': 12, 'bagerhat': 13, 'habiganj': 14,
    'moulavibazar': 15, 'sylhet': 16, 'bandarban': 17, 'rangpur': 18,
    'chandpur': 19,
}


def _fistula_dist_code_calc():
    """Build the nested if() that maps the selected district slug → its
    numeric code string. Enketo is XPath 1.0, so we use an explicit if()
    chain rather than a lookup — and we never use substr() on the code,
    which avoids the '10-' vs '1-' starts-with collision (the regex
    constraint anchors the full prefix instead)."""
    expr = "''"
    for slug, code in reversed(list(FISTULA_DISTRICT_CODE.items())):
        expr = f"if(${{district}}='{slug}','{code}',{expr})"
    return expr


_FISTULA_STAGES = [
    ('suspected',     'Suspected (community identification)',
     'সন্দেহজনক (সম্প্রদায়ে শনাক্ত)'),
    ('diagnosed',     'Diagnosed (at Fistula Corner)',
     'নির্ণীত (ফিস্টুলা কর্নারে)'),
    ('referred',      'Referred for Surgical Management',
     'অস্ত্রোপচারের জন্য প্রেরিত'),
    ('repaired',      'Surgically Repaired',
     'অস্ত্রোপচার সম্পন্ন'),
    ('rehabilitated', 'Rehabilitated & Reintegrated',
     'পুনর্বাসিত ও পুনরায় সমাজে অন্তর্ভুক্ত'),
]


def _fistula_survey():
    rows = _meta('Annual fistula serial number', 'ফিস্টুলা বাৎসরিক ক্রমিক নং')

    # ── Stage selector — drives every relevant() below.
    rows += [
        _sr('select_one stage', 'stage',
            'Which stage are you recording today?',
            'আজ আপনি কোন ধাপের তথ্য নিবন্ধন করছেন?',
            required='yes',
            hint='A case progresses through five stages. Pick the one you are recording now.'),
    ]

    # ── Derive the numeric district code from the selected district slug.
    #    Used to build the required ID prefix (e.g. district 1 → '1-0001').
    rows += [
        _sr('calculate', '_dist_code', calc=_fistula_dist_code_calc()),
    ]

    # XPath 1.0 trim+upper — Kobo/Enketo cannot evaluate upper-case() (XPath 2.0).
    NORM_PC = ("translate(normalize-space(${patient_code}),"
               "'abcdefghijklmnopqrstuvwxyz',"
               "'ABCDEFGHIJKLMNOPQRSTUVWXYZ')")

    # ── Patient identity (captured ONCE, at the Suspected stage only).
    #    Later stages identify the woman via the grp_lookup dropdown below.
    rows += [
        _sr('begin_group', 'grp_patient', 'Patient identity', 'রোগীর পরিচয়',
            relevant="${stage}='suspected'"),

        # The unique registry ID — typed at registration. Two hard rules:
        #   (1) regex anchors the FULL prefix (^<code>-<4 digits>$), so a
        #       Sunamganj (1-) ID can never be accepted as a Dhaka (10-) ID;
        #   (2) pulldata(...)='' blocks re-registering an existing ID.
        _sr('text', 'patient_code',
            'Patient ID (district code + serial, e.g. 1-0001)',
            'রোগীর আইডি (জেলা কোড + ক্রমিক, যেমন ১-০০০১)',
            required='yes',
            relevant="${stage}='suspected'",
            constraint=("regex(normalize-space(.), "
                        "concat('^', ${_dist_code}, '-[0-9]{4}$')) and "
                        "pulldata('fistula_clients','patient_name','id_no'," + NORM_PC
                        + ")=''"),
            cmsg='⚠ Invalid or duplicate ID. It must be <district-code>-<4 digits> '
                 '(e.g. 1-0001, Dhaka = 10-0001) and not already registered. / '
                 'ভুল বা ডুপ্লিকেট আইডি — জেলা কোড + ৪ অঙ্ক হতে হবে এবং আগে নিবন্ধিত থাকা যাবে না।',
            hint='Format: district number + 4-digit serial. Dhaka = 10-0001.'),

        # Duplicate-ID soft warning — shows who already holds this ID.
        _sr('calculate', '_dup_name',
            calc=("pulldata('fistula_clients','patient_name','id_no'," + NORM_PC + ")")),
        _sr('note', '_dup_warn',
            '⚠ This ID is already registered for ${_dup_name}. '
            'Do not re-register — record her later stages via the dropdown instead.',
            '⚠ এই আইডি ইতিমধ্যে ${_dup_name} নামে নিবন্ধিত। '
            'পুনঃনিবন্ধন করবেন না — পরবর্তী ধাপ ড্রপডাউন থেকে নির্বাচন করুন।',
            relevant="${patient_code}!='' and ${_dup_name}!=''"),

        _sr('text', 'name', 'Name of woman', 'মহিলার নাম', required='yes'),
        _sr('integer', 'age', 'Age (years)', 'বয়স (বছর)',
            constraint='. >= 8 and . <= 80'),
        _sr('select_one education', 'education',
            'Education', 'শিক্ষা'),
        _sr('text', 'husband', "Husband's name", 'স্বামীর নাম'),
        _sr('text', 'husband_profession',
            "Husband's profession", 'স্বামীর পেশা'),
        _sr('text', 'profession_patient',
            'Profession of patient', 'রোগীর পেশা'),
        _sr('text', 'current_condition',
            'Present condition of patient',
            'রোগীর বর্তমান অবস্থা'),
        _sr('text', 'contact_number',
            'Contact number', 'যোগাযোগের নম্বর'),
        _sr('select_one marital_status', 'marital_status',
            'Marital status', 'বৈবাহিক অবস্থা'),
        _sr('integer', 'age_at_marriage',
            'Age at marriage', 'বিবাহের সময় বয়স'),
        _sr('integer', 'age_at_first_delivery',
            'Age at first delivery', 'প্রথম প্রসবের সময় বয়স'),
        _sr('integer', 'number_of_children',
            'Number of children', 'সন্তান সংখ্যা'),
        _sr('end_group', 'grp_patient'),
    ]

    # ── Obstetric history (captured ONCE, at the Suspected stage only).
    rows += [
        _sr('begin_group', 'grp_obs_history',
            'Obstetric history', 'প্রসূতি ইতিহাস',
            relevant="${stage}='suspected'"),
        _sr('text', 'delivery_complication',
            'Delivery complication', 'প্রসব জটিলতা'),
        _sr('text', 'last_delivery_labour_duration',
            'Duration of labour during last delivery',
            'শেষ প্রসবের সময় শ্রমকালের সময়কাল'),
        _sr('select_one mode_of_delivery', 'mode_of_last_delivery',
            'Mode of last delivery', 'শেষ প্রসবের পদ্ধতি'),
        _sr('select_one place_of_delivery', 'place_of_last_delivery',
            'Place of last delivery', 'শেষ প্রসবের স্থান'),
        _sr('select_one delivery_conductor', 'conducted_last_delivery',
            'Who conducted the last delivery',
            'শেষ প্রসব কে পরিচালনা করেন'),
        _sr('select_one delivery_outcome', 'delivery_outcome',
            'Delivery outcome', 'প্রসবের ফলাফল'),
        _sr('select_multiple reasons_no_facility',
            'reasons_no_institutional_delivery',
            'Reasons for not availing institutional delivery',
            'প্রাতিষ্ঠানিক প্রসব না নেওয়ার কারণ'),
        _sr('text', 'time_duration_fistula_occurrence',
            'Time duration of fistula occurrence after delivery',
            'প্রসবের পর ফিস্টুলা সংঘটনের সময়কাল'),
        _sr('text', 'duration_suffering',
            'Duration of suffering from fistula (years / months)',
            'ফিস্টুলায় ভোগার সময়কাল (বছর / মাস)'),
        _sr('end_group', 'grp_obs_history'),
    ]

    # ── Patient lookup (stages 2–5). The woman was already registered at the
    #    Suspected stage; here the field worker picks her from the CSV-backed
    #    dropdown (fistula_clients.csv) instead of re-typing identity. The
    #    selected value is her id_no; pulldata() shows her details read-only so
    #    the worker confirms the right woman before recording the new stage.
    LATER = ("${stage}='diagnosed' or ${stage}='referred' or "
             "${stage}='repaired' or ${stage}='rehabilitated'")
    # Normalise the dropdown value the same way the CSV / handler key is stored.
    # Braces around the field name are doubled so str.format() (below) leaves
    # the ${...} XPath reference intact and only substitutes {col}.
    NORM_SEL = ("translate(normalize-space(${{patient_code_sel}}),"
                "'abcdefghijklmnopqrstuvwxyz',"
                "'ABCDEFGHIJKLMNOPQRSTUVWXYZ')")
    PULL = "pulldata('fistula_clients','{col}','id_no'," + NORM_SEL + ")"
    FOUND = "${_pull_name}!=''"
    rows += [
        _sr('begin_group', 'grp_lookup',
            'Select the registered patient', 'নিবন্ধিত রোগী নির্বাচন করুন',
            relevant=LATER),
        # Dropdown sourced from the attached CSV — the stored value is id_no,
        # the label shows "1-0001 — Rahima (Sunamganj)".
        _sr('select_one_from_file fistula_clients.csv', 'patient_code_sel',
            'Registered patient (ID — name)',
            'নিবন্ধিত রোগী (আইডি — নাম)',
            required='yes',
            relevant=LATER),
        _sr('calculate', '_pull_name',    calc=PULL.format(col='patient_name')),
        _sr('calculate', '_pull_age',     calc=PULL.format(col='age')),
        _sr('calculate', '_pull_husband', calc=PULL.format(col='husband')),
        _sr('calculate', '_pull_village', calc=PULL.format(col='village')),
        _sr('calculate', '_pull_susp',    calc=PULL.format(col='suspected_date')),
        _sr('note', '_show_name',
            'Name: ${_pull_name}', 'নাম: ${_pull_name}', relevant=FOUND),
        _sr('note', '_show_age',
            'Age: ${_pull_age} · Husband: ${_pull_husband}',
            'বয়স: ${_pull_age} · স্বামী: ${_pull_husband}',
            relevant=FOUND + " and (${_pull_age}!='' or ${_pull_husband}!='')"),
        _sr('note', '_show_addr',
            'Village: ${_pull_village} · Suspected: ${_pull_susp}',
            'গ্রাম: ${_pull_village} · সন্দেহ: ${_pull_susp}',
            relevant=FOUND + " and (${_pull_village}!='' or ${_pull_susp}!='')"),
        _sr('note', '_lookup_missing',
            '⚠ No registered patient found for this ID. Register her at the '
            'Suspected stage first, then record this stage.',
            '⚠ এই আইডির জন্য কোনো নিবন্ধিত রোগী পাওয়া যায়নি। প্রথমে সন্দেহজনক '
            'ধাপে নিবন্ধন করুন।',
            relevant="${patient_code_sel}!='' and ${_pull_name}=''"),
        _sr('end_group', 'grp_lookup'),
    ]

    # ── Unify the two ID sources so the handler always reads one key:
    #    free-text patient_code at registration, dropdown patient_code_sel after.
    rows += [
        _sr('calculate', 'patient_code_final', calc=(
            "if(${stage}='suspected', ${patient_code}, ${patient_code_sel})")),
    ]

    # ── STAGE 1 · Suspected.
    rows += [
        _sr('begin_group', 'grp_suspected',
            'Stage 1 · Suspected',
            'ধাপ ১ · সন্দেহজনক',
            relevant="${stage}='suspected'"),
        _sr('date', 'suspected_date',
            'Date of suspected', 'সন্দেহের তারিখ'),
        _sr('text', 'source_information',
            "Source of patient's information",
            'রোগীর তথ্যের উৎস'),
        _sr('end_group', 'grp_suspected'),
    ]

    # ── STAGE 2 · Diagnosed.
    rows += [
        _sr('begin_group', 'grp_diagnosed',
            'Stage 2 · Diagnosed (Fistula Corner)',
            'ধাপ ২ · নির্ণীত (ফিস্টুলা কর্নার)',
            relevant="${stage}='diagnosed'"),
        _sr('date', 'diagnosed_date',
            'Date of diagnosis', 'নির্ণয়ের তারিখ'),
        _sr('text', 'diagnosed_place',
            'Place of diagnosis', 'নির্ণয়ের স্থান'),
        _sr('text', 'diagnosed_by',
            'Diagnosed by', 'নির্ণয়কারী'),
        _sr('end_group', 'grp_diagnosed'),
    ]

    # ── STAGE 3 · Referred for Surgical Management.
    rows += [
        _sr('begin_group', 'grp_referred',
            'Stage 3 · Referred for Surgical Management',
            'ধাপ ৩ · অস্ত্রোপচারের জন্য প্রেরিত',
            relevant="${stage}='referred'"),
        _sr('date', 'refer_date',
            'Referral date', 'প্রেরণের তারিখ'),
        _sr('text', 'refer_place',
            'Refer place (facility)', 'প্রেরণের স্থান'),
        _sr('text', 'referred_by_person',
            'Person who referred the woman to the facility',
            'প্রেরণকারী ব্যক্তি'),
        _sr('select_one refer_outcome', 'refer_outcome',
            'Refer outcome', 'প্রেরণের ফলাফল'),
        _sr('end_group', 'grp_referred'),
    ]

    # ── STAGE 4 · Surgically Repaired.
    rows += [
        _sr('begin_group', 'grp_repaired',
            'Stage 4 · Surgically Repaired',
            'ধাপ ৪ · অস্ত্রোপচার সম্পন্ন',
            relevant="${stage}='repaired'"),
        _sr('date', 'operation_date',
            'Date of operation', 'অস্ত্রোপচারের তারিখ'),
        _sr('text', 'operation_place',
            'Place of operation', 'অস্ত্রোপচারের স্থান'),
        _sr('integer', 'hospital_stay_days',
            'Duration of hospital stay (days)',
            'হাসপাতালে অবস্থানের সময়কাল (দিন)'),
        _sr('integer', 'times_of_operations',
            'Times of operations', 'অস্ত্রোপচারের সংখ্যা'),
        # The 4 fistula types CIPRB asked for on the dashboard donut.
        _sr('select_one fistula_type', 'fistula_type_v2',
            'Type of fistula (cause)',
            'ফিস্টুলার ধরন (কারণ)'),
        _sr('select_one iatrogenic_cause', 'iatrogenic_cause',
            'Cause of iatrogenic fistula',
            'চিকিৎসাজনিত ফিস্টুলার কারণ',
            relevant="${fistula_type_v2}='iatrogenic'"),
        _sr('select_one genital_fistula_type', 'genital_fistula_type',
            'Type of genital fistula',
            'যৌনাঙ্গের ফিস্টুলার ধরন'),
        _sr('select_one operation_route', 'operation_route',
            'Route of operation',
            'অস্ত্রোপচারের পথ'),
        _sr('select_one surgery_outcome_v2', 'surgery_outcome_v2',
            'Outcome of surgery',
            'অস্ত্রোপচারের ফলাফল'),
        _sr('end_group', 'grp_repaired'),
    ]

    # ── STAGE 5 · Rehabilitated & Reintegrated.
    rows += [
        _sr('begin_group', 'grp_rehab',
            'Stage 5 · Rehabilitated & Reintegrated',
            'ধাপ ৫ · পুনর্বাসিত ও পুনরায় সমাজে অন্তর্ভুক্ত',
            relevant="${stage}='rehabilitated'"),
        _sr('select_one yes_no', 'rehabilitation_received',
            'Receive rehabilitation support? (Y/N)',
            'পুনর্বাসন সহায়তা পেয়েছেন? (হ্যাঁ/না)'),
        _sr('date', 'rehabilitation_date',
            'Date of receiving support',
            'সহায়তা প্রাপ্তির তারিখ',
            relevant="${rehabilitation_received}='yes'"),
        _sr('select_one rehab_place', 'rehab_place',
            'Place of receiving support',
            'সহায়তা প্রাপ্তির স্থান',
            relevant="${rehabilitation_received}='yes'"),
        _sr('select_multiple rehab_support_types', 'rehab_support_types',
            'Types of rehabilitation support received',
            'পুনর্বাসন সহায়তার ধরন',
            relevant="${rehabilitation_received}='yes'"),
        _sr('text', 'rehab_notes',
            'Notes (optional)', 'মন্তব্য (ঐচ্ছিক)',
            relevant="${stage}='rehabilitated'"),
        _sr('end_group', 'grp_rehab'),
    ]
    return rows


def _fistula_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    ch += [_ch('stage', s, en, bn) for s, en, bn in _FISTULA_STAGES]

    ch += [
        _ch('education', 'no_education',       'No education',
            'কোন শিক্ষা নাই'),
        _ch('education', 'primary_incomplete', 'Primary incomplete',
            'প্রাথমিক অসম্পূর্ণ'),
        _ch('education', 'primary',            'Primary',
            'প্রাথমিক'),
        _ch('education', 'secondary',          'Secondary',
            'মাধ্যমিক'),
        _ch('education', 'higher_secondary',   'Higher secondary',
            'উচ্চ মাধ্যমিক'),
        _ch('education', 'graduate',           'Graduate / Masters',
            'স্নাতক / স্নাতকোত্তর'),
    ]
    ch += [
        _ch('marital_status', 'married',   'Married',  'বিবাহিত'),
        _ch('marital_status', 'separated', 'Separated','পৃথক'),
        _ch('marital_status', 'divorced',  'Divorced', 'তালাকপ্রাপ্ত'),
        _ch('marital_status', 'widowed',   'Widowed',  'বিধবা'),
        _ch('marital_status', 'other',     'Other',    'অন্যান্য'),
    ]
    ch += [
        _ch('mode_of_delivery', 'nvd',
            'NVD (Normal Vaginal Delivery)',
            'এনভিডি (স্বাভাবিক প্রসব)'),
        _ch('mode_of_delivery', 'csection',
            'C-section', 'সিজারিয়ান'),
        _ch('mode_of_delivery', 'assisted_vaginal',
            'Assisted vaginal delivery',
            'সহায়ক স্বাভাবিক প্রসব'),
    ]
    ch += [
        _ch('place_of_delivery', 'gov_facility',
            'Government facility', 'সরকারি প্রতিষ্ঠান'),
        _ch('place_of_delivery', 'private_facility',
            'Private facility', 'বেসরকারি প্রতিষ্ঠান'),
        _ch('place_of_delivery', 'home', 'Home', 'বাড়ি'),
    ]
    ch += [
        _ch('delivery_conductor', 'relatives', 'Relatives',
            'আত্মীয়'),
        _ch('delivery_conductor', 'tba',       'TBA (traditional birth attendant)',
            'টিবিএ'),
        _ch('delivery_conductor', 'nurse',     'Nurse', 'নার্স'),
        _ch('delivery_conductor', 'midwife',   'Midwife', 'মিডওয়াইফ'),
        _ch('delivery_conductor', 'doctor',    'Doctor', 'ডাক্তার'),
    ]
    ch += [
        _ch('delivery_outcome', 'livebirth',  'Livebirth', 'জীবিত জন্ম'),
        _ch('delivery_outcome', 'stillbirth', 'Stillbirth','মৃত জন্ম'),
    ]
    ch += [
        _ch('reasons_no_facility', 'traditional', 'Traditional belief',
            'ঐতিহ্যবাহী বিশ্বাস'),
        _ch('reasons_no_facility', 'transport',   'Transport problem',
            'পরিবহন সমস্যা'),
        _ch('reasons_no_facility', 'financial',   'Financial problem',
            'আর্থিক সমস্যা'),
        _ch('reasons_no_facility', 'no_idea',     'No idea about hospital',
            'হাসপাতাল সম্পর্কে ধারণা নাই'),
        _ch('reasons_no_facility', 'no_faith',    'No faith in hospital service',
            'হাসপাতাল সেবায় আস্থা নাই'),
        _ch('reasons_no_facility', 'other',       'Other', 'অন্যান্য'),
    ]
    ch += [
        _ch('refer_outcome', 'reached',    'Reached the facility',
            'প্রতিষ্ঠানে পৌঁছেছেন'),
        _ch('refer_outcome', 'not_reached', 'Did not reach',
            'পৌঁছাননি'),
        _ch('refer_outcome', 'pending',    'Pending follow-up',
            'অপেক্ষমান'),
        _ch('refer_outcome', 'refused',    'Refused', 'অস্বীকার'),
    ]
    # The 4 fistula types CIPRB asked for (drop Other; add Congenital + Traumatic).
    ch += [
        _ch('fistula_type', 'obstetric',  'Obstetric',  'প্রসূতিজনিত'),
        _ch('fistula_type', 'iatrogenic', 'Iatrogenic', 'চিকিৎসাজনিত'),
        _ch('fistula_type', 'congenital', 'Congenital', 'জন্মগত'),
        _ch('fistula_type', 'traumatic',  'Traumatic',  'আঘাতজনিত'),
    ]
    ch += [
        _ch('iatrogenic_cause', 'hysterectomy', 'Hysterectomy',
            'জরায়ু অপসারণ'),
        _ch('iatrogenic_cause', 'csection',     'C-section',
            'সিজারিয়ান'),
        _ch('iatrogenic_cause', 'laparoscopy',  'Laparoscopy',
            'ল্যাপারোস্কপি'),
    ]
    ch += [
        _ch('genital_fistula_type', 'vvf', 'Vesico-vaginal fistula (VVF)',
            'ভেসিকো-ভ্যাজাইনাল ফিস্টুলা (VVF)'),
        _ch('genital_fistula_type', 'rvf', 'Recto-vaginal fistula (RVF)',
            'রেক্টো-ভ্যাজাইনাল ফিস্টুলা (RVF)'),
        _ch('genital_fistula_type', 'ureterovaginal',
            'Uretero-vaginal', 'ইউরেটেরো-ভ্যাজাইনাল'),
        _ch('genital_fistula_type', 'urethrovaginal',
            'Urethro-vaginal', 'ইউরেথ্রো-ভ্যাজাইনাল'),
        _ch('genital_fistula_type', 'vesicouterine',
            'Vesico-uterine', 'ভেসিকো-ইউটেরাইন'),
        _ch('genital_fistula_type', 'vesicocervical',
            'Vesico-cervical', 'ভেসিকো-সারভিকাল'),
    ]
    ch += [
        _ch('operation_route', 'vaginal',           'Vaginal', 'যৌনাঙ্গপথ'),
        _ch('operation_route', 'abdominal',         'Abdominal', 'উদর'),
        _ch('operation_route', 'abdomino_perineal', 'Abdomino-perineal',
            'উদর-পেরিনিয়াল'),
        _ch('operation_route', 'laparoscopy',       'Laparoscopy', 'ল্যাপারোস্কপি'),
    ]
    ch += [
        _ch('surgery_outcome_v2', 'success_dry',
            'Successfully repaired and dry',
            'সফলভাবে নিরাময়, শুকনো'),
        _ch('surgery_outcome_v2', 'success_not_dry',
            'Successfully repaired but not dry',
            'সফলভাবে নিরাময় কিন্তু শুকনো নয়'),
        _ch('surgery_outcome_v2', 'failed',
            'Failed', 'ব্যর্থ'),
    ]
    ch += [
        _ch('rehab_place', 'individual',        'Individual support',
            'ব্যক্তিগত সহায়তা'),
        _ch('rehab_place', 'ngo',               'NGO', 'এনজিও'),
        _ch('rehab_place', 'union_council',     'Union Council',
            'ইউনিয়ন পরিষদ'),
        _ch('rehab_place', 'womens_affairs',    'Women Affairs Office',
            'মহিলা বিষয়ক অধিদপ্তর'),
        _ch('rehab_place', 'uno',               'UNO Office',
            'উপজেলা নির্বাহী কর্মকর্তার কার্যালয়'),
        _ch('rehab_place', 'social_welfare',    'Social Welfare Department',
            'সমাজসেবা অধিদপ্তর'),
        _ch('rehab_place', 'other',             'Other', 'অন্যান্য'),
    ]
    ch += [
        _ch('rehab_support_types', 'cash',         'Cash', 'নগদ অর্থ'),
        _ch('rehab_support_types', 'livestock',    'Livestock', 'পশুসম্পদ'),
        _ch('rehab_support_types', 'training',     'Training', 'প্রশিক্ষণ'),
        _ch('rehab_support_types', 'tree_plant',   'Tree plant', 'বৃক্ষরোপণ'),
        _ch('rehab_support_types', 'sewing',       'Sewing machine',
            'সেলাই মেশিন'),
        _ch('rehab_support_types', 'vgf_card',     'VGF card',
            'ভিজিএফ কার্ড'),
        _ch('rehab_support_types', 'disability',   'Disability card',
            'প্রতিবন্ধী কার্ড'),
        _ch('rehab_support_types', 'psychosocial', 'Psychosocial support',
            'মনস্তাত্ত্বিক সহায়তা'),
        _ch('rehab_support_types', 'reintegration', 'Reintegration support',
            'পুনঃসংহতি সহায়তা'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 2 — MPDSR Form 01 · Community Maternal Death Review              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _shared_consent_block():
    """Standard Bangla consent paragraph that opens every MPDSR review."""
    return [
        _sr('note', 'consent_note',
            'CONSENT: How are you? My name is __ from the DGHS/DGFP. '
            'I would like to talk to you about the death and ask some '
            'questions as part of the Maternal & Perinatal Death '
            'Surveillance and Response (MPDSR) work jointly conducted '
            'by DGHS and DGFP. Your answers will be kept confidential. '
            'The interview takes 30–45 minutes. You may refuse or stop '
            'at any time. Your name will not be used in any report.',
            'সম্মতি: কেমন আছেন? আমার নাম __ আমি স্বাস্থ্য/পরিবার পরিকল্পনা '
            'অধিদপ্তরের একজন। মৃত্যু সম্পর্কে কিছু প্রশ্ন করব। সাক্ষাৎকার '
            '৩০–৪৫ মিনিট লাগবে। সকল তথ্য গোপন রাখা হবে; আপনি যেকোনো সময়ে '
            'সাক্ষাৎকার বন্ধ করতে পারেন। আপনার নাম প্রতিবেদনে উল্লেখ হবে না।'),
        _sr('select_one yes_no', 'consent_given',
            'Consent given by respondent?',
            'উত্তরদাতা সম্মতি দিয়েছেন?', required='yes'),
        _sr('date', 'interview_date',
            'Date of interview', 'সাক্ষাৎকারের তারিখ'),
    ]


def _respondent_block():
    return [
        _sr('begin_group', 'grp_respondent',
            "Respondent's information", 'উত্তরদাতার তথ্য'),
        _sr('text', 'respondent_main_name',
            'Main respondent — name',
            'মুখ্য উত্তরদাতা — নাম'),
        _sr('select_one relationship', 'respondent_main_rel',
            'Relationship with deceased',
            'মৃত ব্যক্তির সাথে সম্পর্ক'),
        _sr('select_one yes_no', 'respondent_main_present',
            'Present at time of death?',
            'মৃত্যুর সময় উপস্থিত ছিলেন?'),
        _sr('text', 'respondent_alt1_name',
            'Associate respondent 1 — name',
            'সহযোগী উত্তরদাতা ১ — নাম'),
        _sr('text', 'respondent_alt2_name',
            'Associate respondent 2 — name',
            'সহযোগী উত্তরদাতা ২ — নাম'),
        _sr('end_group', 'grp_respondent'),
    ]


def _community_maternal_survey():
    rows = _meta('Annual maternal death serial number',
                 'মাতৃমৃত্যুর বাৎসরিক ক্রমিক নং')
    rows += _shared_consent_block()
    rows += _respondent_block()

    rows += [
        _sr('begin_group', 'grp_deceased',
            "Deceased woman's information",
            'মৃত মহিলার তথ্য'),
        _sr('text', 'deceased_name', 'Name of deceased',
            'মৃত মহিলার নাম', required='yes'),
        _sr('integer', 'deceased_age', 'Age (years)',
            'বয়স (বছর)', constraint='. > 9 and . < 60'),
        _sr('text', 'deceased_husband',  "Husband's name",
            'স্বামীর নাম'),
        _sr('text', 'deceased_father',   "Father's name",
            'পিতার নাম'),
        _sr('text', 'deceased_address',  'Permanent address',
            'স্থায়ী ঠিকানা'),
        _sr('date', 'date_of_death',     'Date of death',
            'মৃত্যুর তারিখ', required='yes'),
        _sr('select_one time_of_death', 'time_of_death',
            'Time of death', 'মৃত্যুর সময়'),
        _sr('select_one place_of_death', 'place_of_death',
            'Place of death', 'মৃত্যুর স্থান', required='yes'),
        _sr('text', 'facility_name',
            'If facility — name of facility',
            'প্রতিষ্ঠান হলে — নাম',
            relevant="${place_of_death}='facility'"),
        _sr('end_group', 'grp_deceased'),
    ]

    rows += [
        _sr('begin_group', 'grp_pregnancy',
            'Pregnancy & ANC', 'গর্ভাবস্থা ও এএনসি'),
        _sr('integer', 'gestational_weeks',
            'Gestational week at death',
            'মৃত্যুর সময় গর্ভাবস্থার সপ্তাহ',
            constraint='. >= 0 and . <= 45'),
        _sr('integer', 'gravida', 'Gravida (G)', 'গ্রাভিডা'),
        _sr('integer', 'para',    'Parity (P)',  'প্যারিটি'),
        _sr('select_one anc_count', 'anc_visits_count',
            'Number of ANC visits',
            'এএনসি পরিদর্শনের সংখ্যা'),
        _sr('select_one yes_no', 'anc_skilled',
            'ANC by skilled provider?',
            'এএনসি দক্ষ প্রদানকারী দ্বারা?'),
        _sr('end_group', 'grp_pregnancy'),
    ]

    rows += [
        _sr('begin_group', 'grp_delivery',
            'Delivery', 'প্রসব'),
        _sr('select_one mode_of_delivery', 'mode_of_delivery',
            'Mode of delivery', 'প্রসবের পদ্ধতি'),
        _sr('select_one delivery_outcome', 'delivery_outcome',
            'Delivery outcome',
            'প্রসবের ফলাফল'),
        _sr('select_one place_of_delivery', 'place_of_delivery',
            'Place of delivery', 'প্রসবের স্থান'),
        _sr('select_one delivery_conductor', 'person_assisted_delivery',
            'Person assisted delivery',
            'প্রসবে সহায়তাকারী'),
        _sr('select_one yes_no', 'pnc_received',
            'PNC received?', 'পিএনসি গ্রহণ করেছেন?'),
        _sr('integer', 'time_death_after_birth_hours',
            'Time of death after birth (hours)',
            'প্রসবের পর মৃত্যুর সময় (ঘন্টা)'),
        _sr('end_group', 'grp_delivery'),
    ]

    rows += [
        _sr('begin_group', 'grp_cause',
            'Cause of death', 'মৃত্যুর কারণ'),
        _sr('select_one cod_maternal', 'cause_of_death',
            'Probable cause of death',
            'সম্ভাব্য মৃত্যুর কারণ', required='yes'),
        _sr('text', 'cause_of_death_other',
            'Other cause (specify)',
            'অন্যান্য কারণ (উল্লেখ করুন)',
            relevant="${cause_of_death}='other'"),
        _sr('text', 'contributory_factors',
            'Contributory factors / delays',
            'অবদানকারী কারণ / বিলম্ব'),
        _sr('text', 'three_delays',
            'Notes on the three delays',
            'তিন বিলম্ব সম্পর্কিত মন্তব্য'),
        _sr('end_group', 'grp_cause'),
    ]

    rows += [
        _sr('begin_group', 'grp_review',
            'Review committee', 'পর্যালোচনা কমিটি'),
        _sr('date', 'review_date',
            'Date of review meeting',
            'পর্যালোচনা সভার তারিখ'),
        _sr('text', 'review_meeting_place',
            'Place of meeting', 'সভার স্থান'),
        _sr('select_one review_status', 'review_status',
            'Review status', 'পর্যালোচনার অবস্থা'),
        _sr('text', 'action_plan_summary',
            'Action plan summary',
            'কর্মপরিকল্পনার সারসংক্ষেপ'),
        _sr('end_group', 'grp_review'),
    ]
    return rows


def _community_maternal_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    # Relationships (per MPDSR Form 01 paper list).
    rel = [
        ('husband',     'Husband',                 'স্বামী'),
        ('father_inlaw','Father-in-law',           'শ্বশুর'),
        ('mother',      'Mother',                  'মা'),
        ('aunt',        'Aunt / mother-in-law',    'খালা / শাশুড়ী'),
        ('neighbour',   'Neighbour',               'প্রতিবেশী'),
        ('mother_inlaw','Mother-in-law',           'শাশুড়ী'),
        ('sister_inlaw','Sister-in-law',           'শ্যালিকা'),
        ('father',      'Father',                  'বাবা'),
        ('sibling',     'Brother / sister',        'ভাই / বোন'),
        ('other',       'Other (specify)',         'অন্যান্য'),
    ]
    ch += [_ch('relationship', k, en, bn) for k, en, bn in rel]

    ch += [
        _ch('time_of_death', 'antepartum', 'Antepartum (before labour)',
            'প্রসবপূর্ব'),
        _ch('time_of_death', 'intrapartum','Intrapartum (during labour/delivery)',
            'প্রসবকালীন'),
        _ch('time_of_death', 'postpartum_42d',
            'Postpartum (within 42 days of delivery)',
            'প্রসবোত্তর (৪২ দিনের মধ্যে)'),
        _ch('time_of_death', 'unknown', 'Unknown', 'অজানা'),
    ]
    ch += [
        _ch('place_of_death', 'home',      'Home', 'বাড়ি'),
        _ch('place_of_death', 'facility',  'Health facility',
            'স্বাস্থ্য প্রতিষ্ঠান'),
        _ch('place_of_death', 'in_transit','In transit',
            'পরিবহন অবস্থায়'),
        _ch('place_of_death', 'other',     'Other', 'অন্যান্য'),
    ]
    ch += [
        _ch('anc_count', 'none',  'None',  'নাই'),
        _ch('anc_count', '1',     '1',     '১'),
        _ch('anc_count', '2',     '2',     '২'),
        _ch('anc_count', '3',     '3',     '৩'),
        _ch('anc_count', '4_plus','4 or more','৪ বা তার বেশি'),
        _ch('anc_count', 'unknown','Unknown','অজানা'),
    ]
    # Shared with the fistula form (delivery_outcome, mode_of_delivery,
    # place_of_delivery, delivery_conductor).
    ch += [
        _ch('mode_of_delivery', 'nvd', 'NVD', 'স্বাভাবিক'),
        _ch('mode_of_delivery', 'csection', 'C-section', 'সিজারিয়ান'),
        _ch('mode_of_delivery', 'assisted_vaginal',
            'Assisted vaginal', 'সহায়ক স্বাভাবিক'),
        _ch('mode_of_delivery', 'undelivered',
            'Undelivered (died before)', 'প্রসব হয়নি'),
    ]
    ch += [
        _ch('delivery_outcome', 'livebirth',  'Live birth', 'জীবিত জন্ম'),
        _ch('delivery_outcome', 'stillbirth', 'Stillbirth', 'মৃত জন্ম'),
        _ch('delivery_outcome', 'na',         'N/A (undelivered)',
            'প্রযোজ্য নয়'),
    ]
    ch += [
        _ch('place_of_delivery', 'home', 'Home', 'বাড়ি'),
        _ch('place_of_delivery', 'gov_facility', 'Government facility',
            'সরকারি প্রতিষ্ঠান'),
        _ch('place_of_delivery', 'private_facility', 'Private facility',
            'বেসরকারি প্রতিষ্ঠান'),
        _ch('place_of_delivery', 'in_transit', 'In transit',
            'পরিবহন অবস্থায়'),
        _ch('place_of_delivery', 'na', 'N/A (undelivered)', 'প্রযোজ্য নয়'),
    ]
    ch += [
        _ch('delivery_conductor', 'doctor', 'Doctor', 'ডাক্তার'),
        _ch('delivery_conductor', 'nurse',  'Nurse',  'নার্স'),
        _ch('delivery_conductor', 'midwife','Midwife','মিডওয়াইফ'),
        _ch('delivery_conductor', 'tba',    'TBA',    'টিবিএ'),
        _ch('delivery_conductor', 'relatives','Relatives','আত্মীয়'),
        _ch('delivery_conductor', 'self',   'Self',   'নিজে'),
        _ch('delivery_conductor', 'none',   'No-one', 'কেউ না'),
    ]
    # CIPRB cause-of-death buckets (GoB ICD-10 condensed).
    cod = [
        ('haemorrhage',       'Haemorrhage (PPH / APH)',
         'রক্তক্ষরণ (পিপিএইচ / এপিএইচ)'),
        ('eclampsia',         'Eclampsia / pre-eclampsia',
         'একলাম্পসিয়া / প্রি-একলাম্পসিয়া'),
        ('sepsis',            'Sepsis', 'সেপসিস'),
        ('obstructed_labour', 'Obstructed labour',
         'বাধাগ্রস্ত শ্রম'),
        ('abortion_related',  'Abortion-related',
         'গর্ভপাতজনিত'),
        ('embolism',          'Embolism', 'এমবোলিজম'),
        ('indirect',          'Indirect cause (cardiac / anemia / TB / etc.)',
         'পরোক্ষ কারণ'),
        ('other',             'Other (specify)', 'অন্যান্য'),
        ('unknown',           'Unknown', 'অজানা'),
    ]
    ch += [_ch('cod_maternal', k, en, bn) for k, en, bn in cod]
    ch += [
        _ch('review_status', 'pending',   'Pending review',
            'পর্যালোচনার অপেক্ষায়'),
        _ch('review_status', 'reviewed',  'Reviewed', 'পর্যালোচিত'),
        _ch('review_status', 'in_progress','In progress',
            'প্রক্রিয়াধীন'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 3 — MPDSR Form 02 · Community Neonatal Death Review              ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _community_neonatal_survey():
    rows = _meta('Annual neonatal death serial number',
                 'নবজাতক মৃত্যুর বাৎসরিক ক্রমিক নং')
    rows += _shared_consent_block()
    rows += _respondent_block()
    rows += [
        _sr('begin_group', 'grp_neonate', 'Neonate information',
            'নবজাতকের তথ্য'),
        _sr('text', 'mother_name', "Mother's name",
            'মাতার নাম', required='yes'),
        _sr('select_one sex_choices', 'sex_neonate',
            "Sex of neonate", 'নবজাতকের লিঙ্গ'),
        _sr('date', 'date_of_birth', 'Date of birth',
            'জন্মের তারিখ'),
        _sr('date', 'date_of_death', 'Date of death',
            'মৃত্যুর তারিখ', required='yes'),
        _sr('integer', 'age_at_death_hours',
            'Age at death (hours)',
            'মৃত্যুর সময় বয়স (ঘন্টা)'),
        _sr('integer', 'birth_weight_grams',
            'Birth weight (grams)',
            'জন্মের ওজন (গ্রাম)'),
        _sr('integer', 'gestational_weeks',
            'Gestational age (weeks)',
            'গর্ভাবস্থার সপ্তাহ'),
        _sr('select_one mode_of_delivery', 'mode_of_delivery',
            'Mode of delivery', 'প্রসবের পদ্ধতি'),
        _sr('select_one place_of_delivery', 'place_of_delivery',
            'Place of delivery', 'প্রসবের স্থান'),
        _sr('select_one place_of_death', 'place_of_death',
            'Place of death', 'মৃত্যুর স্থান'),
        _sr('end_group', 'grp_neonate'),
    ]
    rows += [
        _sr('begin_group', 'grp_cause_neo',
            'Cause of neonatal death', 'নবজাতক মৃত্যুর কারণ'),
        _sr('select_one cod_neonatal', 'cause_of_death',
            'Probable cause', 'সম্ভাব্য কারণ', required='yes'),
        _sr('text', 'cause_other',
            'Other (specify)',
            'অন্যান্য (উল্লেখ করুন)',
            relevant="${cause_of_death}='other'"),
        _sr('end_group', 'grp_cause_neo'),
    ]
    rows += [
        _sr('begin_group', 'grp_review',
            'Review committee', 'পর্যালোচনা কমিটি'),
        _sr('date', 'review_date',
            'Date of review meeting',
            'পর্যালোচনা সভার তারিখ'),
        _sr('select_one review_status', 'review_status',
            'Review status', 'পর্যালোচনার অবস্থা'),
        _sr('text', 'action_plan_summary',
            'Action plan summary',
            'কর্মপরিকল্পনার সারসংক্ষেপ'),
        _sr('end_group', 'grp_review'),
    ]
    return rows


def _community_neonatal_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    rel = [('mother','Mother','মা'),
           ('father','Father','বাবা'),
           ('grandmother','Grandmother','দাদী/নানী'),
           ('other','Other','অন্যান্য')]
    ch += [_ch('relationship', k, en, bn) for k, en, bn in rel]
    ch += [
        _ch('sex_choices', 'male',   'Male',   'পুরুষ'),
        _ch('sex_choices', 'female', 'Female', 'মহিলা'),
        _ch('sex_choices', 'ambiguous', 'Ambiguous', 'অস্পষ্ট'),
    ]
    ch += [
        _ch('mode_of_delivery', 'nvd', 'NVD', 'স্বাভাবিক'),
        _ch('mode_of_delivery', 'csection', 'C-section', 'সিজারিয়ান'),
        _ch('mode_of_delivery', 'assisted_vaginal', 'Assisted vaginal',
            'সহায়ক স্বাভাবিক'),
    ]
    ch += [
        _ch('place_of_delivery', 'home', 'Home', 'বাড়ি'),
        _ch('place_of_delivery', 'gov_facility', 'Government facility',
            'সরকারি প্রতিষ্ঠান'),
        _ch('place_of_delivery', 'private_facility', 'Private facility',
            'বেসরকারি প্রতিষ্ঠান'),
        _ch('place_of_delivery', 'in_transit', 'In transit',
            'পরিবহন অবস্থায়'),
    ]
    ch += [
        _ch('place_of_death', 'home',      'Home', 'বাড়ি'),
        _ch('place_of_death', 'facility',  'Health facility',
            'স্বাস্থ্য প্রতিষ্ঠান'),
        _ch('place_of_death', 'in_transit','In transit',
            'পরিবহন অবস্থায়'),
    ]
    cod = [
        ('preterm_lbw', 'Preterm / low birth weight',
         'প্রিটার্ম / কম জন্ম ওজন'),
        ('asphyxia',    'Birth asphyxia', 'জন্ম শ্বাসকষ্ট'),
        ('sepsis',      'Neonatal sepsis', 'নবজাতক সেপসিস'),
        ('pneumonia',   'Pneumonia / respiratory infection',
         'নিউমোনিয়া / শ্বাসতন্ত্রের সংক্রমণ'),
        ('congenital',  'Congenital anomaly', 'জন্মগত ত্রুটি'),
        ('diarrhoea',   'Diarrhoea', 'ডায়রিয়া'),
        ('other',       'Other', 'অন্যান্য'),
        ('unknown',     'Unknown', 'অজানা'),
    ]
    ch += [_ch('cod_neonatal', k, en, bn) for k, en, bn in cod]
    ch += [
        _ch('review_status', 'pending',  'Pending review',
            'পর্যালোচনার অপেক্ষায়'),
        _ch('review_status', 'reviewed', 'Reviewed', 'পর্যালোচিত'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 4 — MPDSR Form 04 · Facility Maternal Death Review               ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _facility_maternal_survey():
    rows = _meta('Annual facility maternal death serial number',
                 'প্রতিষ্ঠানিক মাতৃমৃত্যুর বাৎসরিক ক্রমিক নং')
    rows += [
        _sr('begin_group', 'grp_facility',
            'Facility information', 'প্রতিষ্ঠানের তথ্য'),
        _sr('text', 'facility_name',
            'Name of facility', 'প্রতিষ্ঠানের নাম', required='yes'),
        _sr('select_one facility_level', 'facility_level',
            'Level of facility', 'প্রতিষ্ঠানের স্তর'),
        _sr('text', 'department', 'Department / Ward',
            'বিভাগ / ওয়ার্ড'),
        _sr('text', 'reporting_officer',
            'Reporting officer', 'রিপোর্টিং কর্মকর্তা'),
        _sr('end_group', 'grp_facility'),
    ]
    rows += [
        _sr('begin_group', 'grp_deceased',
            "Deceased woman's information",
            'মৃত মহিলার তথ্য'),
        _sr('text', 'deceased_name',  'Name of deceased',
            'মৃত মহিলার নাম', required='yes'),
        _sr('integer', 'deceased_age',
            'Age (years)', 'বয়স (বছর)'),
        _sr('text', 'deceased_husband', "Husband's name", 'স্বামীর নাম'),
        _sr('text', 'deceased_address', 'Permanent address',
            'স্থায়ী ঠিকানা'),
        _sr('date', 'admission_date',
            'Date of admission', 'ভর্তির তারিখ'),
        _sr('date', 'date_of_death',
            'Date of death', 'মৃত্যুর তারিখ', required='yes'),
        _sr('select_one time_of_death', 'time_of_death',
            'Time of death (relative to delivery)',
            'মৃত্যুর সময় (প্রসবের সাপেক্ষে)'),
        _sr('integer', 'time_death_after_birth_hours',
            'Time of death after birth (hours)',
            'প্রসবের পর মৃত্যুর সময় (ঘন্টা)'),
        _sr('end_group', 'grp_deceased'),
    ]
    rows += [
        _sr('begin_group', 'grp_clinical',
            'Clinical details', 'ক্লিনিকাল বিবরণ'),
        _sr('integer', 'gestational_weeks',
            'Gestational age at admission (weeks)',
            'ভর্তির সময় গর্ভাবস্থার সপ্তাহ'),
        _sr('integer', 'gravida', 'Gravida', 'গ্রাভিডা'),
        _sr('integer', 'para',    'Parity',  'প্যারিটি'),
        _sr('select_one anc_count', 'anc_visits_count',
            'ANC visits', 'এএনসি পরিদর্শন'),
        _sr('select_one mode_of_delivery', 'mode_of_delivery',
            'Mode of delivery', 'প্রসবের পদ্ধতি'),
        _sr('select_one delivery_outcome', 'delivery_outcome',
            'Delivery outcome', 'প্রসবের ফলাফল'),
        _sr('select_one place_of_delivery', 'place_of_delivery',
            'Place of delivery (this facility / referred in)',
            'প্রসবের স্থান (এই প্রতিষ্ঠান / রেফার্ড ইন)'),
        _sr('select_one delivery_conductor', 'person_assisted_delivery',
            'Person assisted delivery',
            'প্রসবে সহায়তাকারী'),
        _sr('select_one yes_no', 'pnc_received',
            'PNC documented?', 'পিএনসি নথিভুক্ত?'),
        _sr('select_one cod_maternal', 'cause_of_death',
            'Primary cause of death',
            'প্রধান মৃত্যুর কারণ', required='yes'),
        _sr('text', 'cause_of_death_other',
            'Other cause (specify)', 'অন্যান্য (উল্লেখ করুন)',
            relevant="${cause_of_death}='other'"),
        _sr('text', 'contributory_factors',
            'Contributory factors / co-morbidities',
            'অবদানকারী কারণ / সহ-অসুস্থতা'),
        _sr('end_group', 'grp_clinical'),
    ]
    rows += [
        _sr('begin_group', 'grp_review',
            'Facility review committee',
            'প্রতিষ্ঠানিক পর্যালোচনা কমিটি'),
        _sr('date', 'review_date',
            'Date of review meeting',
            'পর্যালোচনা সভার তারিখ'),
        _sr('select_one review_status', 'review_status',
            'Review status', 'পর্যালোচনার অবস্থা'),
        _sr('text', 'action_plan_summary',
            'Action plan summary',
            'কর্মপরিকল্পনার সারসংক্ষেপ'),
        _sr('end_group', 'grp_review'),
    ]
    return rows


def _facility_maternal_choices():
    # Re-uses every code list from community maternal — facilities and
    # community reviewers fill the same vocabularies.
    ch = list(_community_maternal_choices())
    ch += [
        _ch('facility_level', 'medical_college', 'Medical college hospital',
            'মেডিকেল কলেজ হাসপাতাল'),
        _ch('facility_level', 'district', 'District hospital',
            'জেলা হাসপাতাল'),
        _ch('facility_level', 'upazila',  'Upazila health complex',
            'উপজেলা স্বাস্থ্য কমপ্লেক্স'),
        _ch('facility_level', 'union',    'Union health centre',
            'ইউনিয়ন স্বাস্থ্য কেন্দ্র'),
        _ch('facility_level', 'private',  'Private facility',
            'বেসরকারি প্রতিষ্ঠান'),
        _ch('facility_level', 'ngo',      'NGO clinic', 'এনজিও ক্লিনিক'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 5 — MPDSR Form 05 · Facility Neonatal Death Review               ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _facility_neonatal_survey():
    rows = _meta('Annual facility neonatal death serial number',
                 'প্রতিষ্ঠানিক নবজাতক মৃত্যুর বাৎসরিক ক্রমিক নং')
    rows += [
        _sr('begin_group', 'grp_facility', 'Facility information',
            'প্রতিষ্ঠানের তথ্য'),
        _sr('text', 'facility_name', 'Name of facility',
            'প্রতিষ্ঠানের নাম', required='yes'),
        _sr('select_one facility_level', 'facility_level',
            'Level of facility', 'প্রতিষ্ঠানের স্তর'),
        _sr('text', 'department', 'Department / Ward',
            'বিভাগ / ওয়ার্ড'),
        _sr('end_group', 'grp_facility'),
    ]
    rows += [
        _sr('begin_group', 'grp_neonate', 'Neonate information',
            'নবজাতকের তথ্য'),
        _sr('text', 'mother_name', "Mother's name",
            'মাতার নাম', required='yes'),
        _sr('select_one sex_choices', 'sex_neonate',
            'Sex', 'লিঙ্গ'),
        _sr('date', 'date_of_birth', 'Date of birth',
            'জন্মের তারিখ'),
        _sr('date', 'date_of_death', 'Date of death',
            'মৃত্যুর তারিখ', required='yes'),
        _sr('integer', 'age_at_death_hours',
            'Age at death (hours)',
            'মৃত্যুর সময় বয়স (ঘন্টা)'),
        _sr('integer', 'birth_weight_grams',
            'Birth weight (grams)',
            'জন্মের ওজন (গ্রাম)'),
        _sr('integer', 'gestational_weeks',
            'Gestational age (weeks)',
            'গর্ভাবস্থার সপ্তাহ'),
        _sr('select_one mode_of_delivery', 'mode_of_delivery',
            'Mode of delivery', 'প্রসবের পদ্ধতি'),
        _sr('select_one place_of_delivery', 'place_of_delivery',
            'Place of delivery', 'প্রসবের স্থান'),
        _sr('select_one cod_neonatal', 'cause_of_death',
            'Probable cause of death',
            'সম্ভাব্য মৃত্যুর কারণ', required='yes'),
        _sr('end_group', 'grp_neonate'),
    ]
    rows += [
        _sr('begin_group', 'grp_review',
            'Facility review committee',
            'প্রতিষ্ঠানিক পর্যালোচনা কমিটি'),
        _sr('date', 'review_date',
            'Date of review meeting',
            'পর্যালোচনা সভার তারিখ'),
        _sr('select_one review_status', 'review_status',
            'Review status', 'পর্যালোচনার অবস্থা'),
        _sr('text', 'action_plan_summary',
            'Action plan summary',
            'কর্মপরিকল্পনার সারসংক্ষেপ'),
        _sr('end_group', 'grp_review'),
    ]
    return rows


def _facility_neonatal_choices():
    ch = list(_community_neonatal_choices())
    ch += [
        _ch('facility_level', 'medical_college', 'Medical college hospital',
            'মেডিকেল কলেজ হাসপাতাল'),
        _ch('facility_level', 'district', 'District hospital',
            'জেলা হাসপাতাল'),
        _ch('facility_level', 'upazila',  'Upazila health complex',
            'উপজেলা স্বাস্থ্য কমপ্লেক্স'),
        _ch('facility_level', 'union',    'Union health centre',
            'ইউনিয়ন স্বাস্থ্য কেন্দ্র'),
        _ch('facility_level', 'private',  'Private facility',
            'বেসরকারি প্রতিষ্ঠান'),
        _ch('facility_level', 'ngo',      'NGO clinic', 'এনজিও ক্লিনিক'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 6 — Social Autopsy (Maternal Death)                              ║
# ║   Source: সামাজিক মৃত্যু পর্যালোচনা ফর্ম (Social Autopsy).pdf            ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _social_autopsy_survey():
    rows = _meta('Annual social autopsy serial number',
                 'সামাজিক ময়নাতদন্তের বাৎসরিক ক্রমিক নং')
    rows += _shared_consent_block()
    rows += _respondent_block()
    rows += [
        _sr('begin_group', 'grp_deceased',
            "Deceased woman's identity",
            'মৃত মহিলার পরিচয়'),
        _sr('text', 'deceased_name', 'Name of deceased',
            'মৃত মহিলার নাম', required='yes'),
        _sr('integer', 'deceased_age',
            'Age (years)', 'বয়স (বছর)'),
        _sr('date', 'date_of_death',
            'Date of death', 'মৃত্যুর তারিখ', required='yes'),
        _sr('select_one place_of_death', 'place_of_death',
            'Place of death', 'মৃত্যুর স্থান'),
        _sr('end_group', 'grp_deceased'),
    ]
    rows += [
        _sr('begin_group', 'grp_delays',
            'Three Delays analysis', 'তিন বিলম্ব বিশ্লেষণ'),
        _sr('note', 'three_delays_intro',
            'The Three-Delays framework: (1) recognising the problem and '
            'deciding to seek care; (2) reaching a health facility; '
            '(3) receiving appropriate care at the facility.',
            'তিন বিলম্ব কাঠামো: (১) সমস্যা চিহ্নিত করে যত্ন নেওয়ার সিদ্ধান্ত; '
            '(২) স্বাস্থ্য প্রতিষ্ঠানে পৌঁছানো; '
            '(৩) প্রতিষ্ঠানে যথাযথ যত্ন প্রাপ্তি।'),
        _sr('select_one yes_no', 'delay1_present',
            'Delay 1 — recognition / decision to seek care',
            'বিলম্ব ১ — যত্ন গ্রহণের সিদ্ধান্ত'),
        _sr('text', 'delay1_factors',
            'Factors behind Delay 1',
            'বিলম্ব ১-এর কারণ',
            relevant="${delay1_present}='yes'"),
        _sr('select_one yes_no', 'delay2_present',
            'Delay 2 — reaching facility',
            'বিলম্ব ২ — প্রতিষ্ঠানে পৌঁছানো'),
        _sr('text', 'delay2_factors',
            'Factors behind Delay 2',
            'বিলম্ব ২-এর কারণ',
            relevant="${delay2_present}='yes'"),
        _sr('select_one yes_no', 'delay3_present',
            'Delay 3 — receiving care at facility',
            'বিলম্ব ৩ — প্রতিষ্ঠানে যত্ন প্রাপ্তি'),
        _sr('text', 'delay3_factors',
            'Factors behind Delay 3',
            'বিলম্ব ৩-এর কারণ',
            relevant="${delay3_present}='yes'"),
        _sr('end_group', 'grp_delays'),
    ]
    rows += [
        _sr('begin_group', 'grp_social',
            'Social context', 'সামাজিক প্রেক্ষাপট'),
        _sr('select_one yes_no', 'gender_barrier',
            'Were there gender-related barriers to care?',
            'যত্ন গ্রহণে লিঙ্গ-সম্পর্কিত বাধা ছিল?'),
        _sr('text', 'gender_barrier_notes',
            'Gender barrier — notes', 'লিঙ্গ-বাধা সম্পর্কিত মন্তব্য',
            relevant="${gender_barrier}='yes'"),
        _sr('select_one yes_no', 'financial_barrier',
            'Were there financial barriers?',
            'আর্থিক বাধা ছিল?'),
        _sr('text', 'financial_barrier_notes',
            'Financial barrier — notes',
            'আর্থিক বাধা সম্পর্কিত মন্তব্য',
            relevant="${financial_barrier}='yes'"),
        _sr('text', 'community_recommendations',
            'Community-level recommendations',
            'সম্প্রদায় পর্যায়ের সুপারিশ'),
        _sr('end_group', 'grp_social'),
    ]
    rows += [
        _sr('begin_group', 'grp_action_plan',
            'Recommended action plan',
            'প্রস্তাবিত কর্মপরিকল্পনা'),
        _sr('text', 'action_plan_summary',
            'Action plan summary',
            'কর্মপরিকল্পনার সারসংক্ষেপ'),
        _sr('date', 'review_date',
            'Date of social autopsy meeting',
            'সামাজিক ময়নাতদন্তের সভার তারিখ'),
        _sr('end_group', 'grp_action_plan'),
    ]
    return rows


def _social_autopsy_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    rel = [('husband','Husband','স্বামী'),
           ('mother_inlaw','Mother-in-law','শাশুড়ী'),
           ('mother','Mother','মা'),
           ('neighbour','Neighbour','প্রতিবেশী'),
           ('other','Other','অন্যান্য')]
    ch += [_ch('relationship', k, en, bn) for k, en, bn in rel]
    ch += [
        _ch('place_of_death', 'home',      'Home', 'বাড়ি'),
        _ch('place_of_death', 'facility',  'Health facility',
            'স্বাস্থ্য প্রতিষ্ঠান'),
        _ch('place_of_death', 'in_transit','In transit',
            'পরিবহন অবস্থায়'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 7 + 8 — Death Notification Slips 01 & 02                         ║
# ║   Small CHW-completed slips that NOTIFY a death and trigger the         ║
# ║   review committee. Same shape, two slip variants.                      ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _notification_slip_survey(slip_num: int):
    rows = _meta(f'Notification slip {slip_num:02d} serial',
                 f'অবহিতকরণ স্লিপ {slip_num:02d} ক্রমিক')
    rows += [
        _sr('begin_group', 'grp_event', 'Death event', 'মৃত্যুর তথ্য'),
        _sr('select_one death_kind', 'death_kind',
            'Type of death notified',
            'অবহিত মৃত্যুর ধরন', required='yes'),
        _sr('text', 'deceased_name', 'Name of deceased',
            'মৃতের নাম', required='yes'),
        _sr('integer', 'deceased_age', 'Age', 'বয়স'),
        _sr('text', 'deceased_address', 'Address', 'ঠিকানা'),
        _sr('date', 'date_of_death', 'Date of death',
            'মৃত্যুর তারিখ', required='yes'),
        _sr('select_one place_of_death', 'place_of_death',
            'Place of death', 'মৃত্যুর স্থান'),
        _sr('text', 'cause_brief',
            'Brief cause (free text)',
            'সংক্ষিপ্ত কারণ'),
        _sr('end_group', 'grp_event'),
    ]
    rows += [
        _sr('begin_group', 'grp_reporter', 'Reporter', 'রিপোর্টকারী'),
        _sr('text', 'reporter_name', 'Reporter name',
            'রিপোর্টকারীর নাম', required='yes'),
        _sr('select_one reporter_role', 'reporter_role',
            'Reporter role', 'রিপোর্টকারীর ভূমিকা'),
        _sr('text', 'reporter_mobile', 'Reporter mobile',
            'রিপোর্টকারীর মোবাইল'),
        _sr('date', 'notification_date',
            'Notification date', 'অবহিতকরণের তারিখ'),
        _sr('end_group', 'grp_reporter'),
    ]
    return rows


def _notification_slip_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    ch += [
        _ch('death_kind', 'maternal',  'Maternal death',  'মাতৃমৃত্যু'),
        _ch('death_kind', 'neonatal',  'Neonatal death',  'নবজাতকের মৃত্যু'),
        _ch('death_kind', 'stillbirth','Stillbirth',      'মৃত জন্ম'),
    ]
    ch += [
        _ch('place_of_death', 'home',      'Home', 'বাড়ি'),
        _ch('place_of_death', 'facility',  'Health facility',
            'স্বাস্থ্য প্রতিষ্ঠান'),
        _ch('place_of_death', 'in_transit','In transit',
            'পরিবহন অবস্থায়'),
    ]
    ch += [
        _ch('reporter_role', 'chw',     'Community health worker',
            'সম্প্রদায় স্বাস্থ্যকর্মী'),
        _ch('reporter_role', 'fp_field','Family planning field worker',
            'পরিবার পরিকল্পনা মাঠকর্মী'),
        _ch('reporter_role', 'midwife', 'Midwife', 'মিডওয়াইফ'),
        _ch('reporter_role', 'nurse',   'Nurse', 'নার্স'),
        _ch('reporter_role', 'doctor',  'Doctor', 'ডাক্তার'),
        _ch('reporter_role', 'family',  'Family member',
            'পরিবারের সদস্য'),
        _ch('reporter_role', 'other',   'Other', 'অন্যান্য'),
    ]
    return ch


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 9 — Maternal Near Miss audit (WHO MNM)                           ║
# ║   Source: Tool_Near Miss.xlsx (18 district sheets, identical structure) ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _near_miss_survey():
    rows = _meta('Annual near-miss case serial number',
                 'নিকট-মৃত্যুর বাৎসরিক ক্রমিক নং')
    rows += [
        _sr('begin_group', 'grp_woman',
            "Woman's information", 'মহিলার তথ্য'),
        _sr('text', 'woman_name', 'Name', 'নাম', required='yes'),
        _sr('integer', 'woman_age', 'Age (years)',
            'বয়স (বছর)', constraint='. >= 10 and . <= 60'),
        _sr('integer', 'gestational_weeks',
            'Gestational age (weeks)',
            'গর্ভাবস্থার সপ্তাহ'),
        _sr('text', 'facility_name',
            'Facility where near-miss managed',
            'যেখানে ব্যবস্থাপনা হয়েছে'),
        _sr('date', 'event_date', 'Date of event',
            'ঘটনার তারিখ', required='yes'),
        _sr('end_group', 'grp_woman'),
    ]

    # ── Section 1: Screening — severe maternal complications.
    sevs = [
        ('sev_pph',       'Severe postpartum haemorrhage',
         'গুরুতর পিপিএইচ'),
        ('sev_preec',     'Severe pre-eclampsia',
         'গুরুতর প্রি-একলাম্পসিয়া'),
        ('eclampsia',     'Eclampsia', 'একলাম্পসিয়া'),
        ('sepsis',        'Sepsis or severe systemic infection',
         'সেপসিস / গুরুতর সংক্রমণ'),
        ('rupt_uterus',   'Ruptured uterus',
         'জরায়ু ফাটা'),
        ('sev_abortion',  'Severe complication of abortion',
         'গর্ভপাতের গুরুতর জটিলতা'),
    ]
    rows += [
        _sr('begin_group', 'grp_sec1',
            'Section 1 · Severe maternal complications',
            'প্রথম পর্যায় · গুরুতর মাতৃস্বাস্থ্য জটিলতা'),
    ]
    for code, en, bn in sevs:
        rows.append(_sr('select_one yes_no', code, en, bn))
    rows.append(_sr('end_group', 'grp_sec1'))

    # ── Section 2: Critical interventions.
    crits = [
        ('crit_blood',   'Use of blood products',
         'রক্ত পরিসঞ্চালন'),
        ('crit_radiol',  'Interventional radiology',
         'হস্তক্ষেপমূলক রেডিওলজি'),
        ('crit_laparot', 'Laparotomy (incl. hysterectomy)',
         'ল্যাপারোটমি (হিস্টেরেক্টমি সহ)'),
        ('crit_icu',     'Admission to intensive care unit',
         'নিবিড় পরিচর্যা ইউনিটে ভর্তি'),
    ]
    rows += [
        _sr('begin_group', 'grp_sec2',
            'Section 2 · Critical interventions',
            'দ্বিতীয় পর্যায় · ক্রিটিক্যাল হস্তক্ষেপ'),
    ]
    for code, en, bn in crits:
        rows.append(_sr('select_one yes_no', code, en, bn))
    rows.append(_sr('end_group', 'grp_sec2'))

    # ── Section 3: Life-threatening conditions.
    life = [
        ('life_cardio',  'Cardiovascular dysfunction (shock, arrest, severe hypoperfusion)',
         'হৃদ-পরিচ্ছেদ ব্যর্থতা'),
        ('life_resp',    'Respiratory dysfunction (severe tachypnoea, hypoxemia)',
         'শ্বাসতন্ত্রের ব্যর্থতা'),
        ('life_renal',   'Renal dysfunction (oliguria refractory to fluids, creatinine ≥1.4)',
         'বৃক্ষীয় ব্যর্থতা'),
        ('life_coag',    'Coagulation / haematological dysfunction (failure to clot, platelet <50k)',
         'রক্ত জমাট ব্যর্থতা'),
        ('life_hepatic', 'Hepatic dysfunction (jaundice, bilirubin >6.0)',
         'যকৃত ব্যর্থতা'),
        ('life_neuro',   'Neurological dysfunction (coma, seizure, stroke, status epilepticus)',
         'স্নায়বিক ব্যর্থতা'),
        ('life_uterine', 'Uterine dysfunction / hysterectomy',
         'জরায়ু ব্যর্থতা / হিস্টেরেক্টমি'),
    ]
    rows += [
        _sr('begin_group', 'grp_sec3',
            'Section 3 · Life-threatening conditions',
            'তৃতীয় পর্যায় · জীবন-হুমকির অবস্থা'),
    ]
    for code, en, bn in life:
        rows.append(_sr('select_one yes_no', code, en, bn))
    rows.append(_sr('end_group', 'grp_sec3'))

    rows += [
        _sr('begin_group', 'grp_delivery',
            'Delivery & outcome', 'প্রসব ও ফলাফল'),
        _sr('select_one mode_of_delivery', 'mode_of_delivery',
            'Mode of delivery', 'প্রসবের পদ্ধতি'),
        _sr('select_one delivery_outcome', 'delivery_outcome',
            'Delivery outcome', 'প্রসবের ফলাফল'),
        _sr('select_one cod_maternal', 'cause_of_near_miss',
            'Primary cause of near-miss',
            'নিকট-মৃত্যুর প্রধান কারণ', required='yes'),
        _sr('text', 'contributory_conditions',
            'Contributory / associated conditions',
            'অবদানকারী / সম্পর্কিত অবস্থা'),
        _sr('text', 'audit_summary',
            'Audit summary',
            'পর্যালোচনার সারসংক্ষেপ'),
        _sr('end_group', 'grp_delivery'),
    ]
    return rows


def _near_miss_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    ch += [
        _ch('mode_of_delivery', 'nvd', 'NVD', 'স্বাভাবিক'),
        _ch('mode_of_delivery', 'csection', 'C-section', 'সিজারিয়ান'),
        _ch('mode_of_delivery', 'assisted_vaginal', 'Assisted vaginal',
            'সহায়ক স্বাভাবিক'),
        _ch('mode_of_delivery', 'undelivered', 'Undelivered',
            'প্রসব হয়নি'),
    ]
    ch += [
        _ch('delivery_outcome', 'livebirth',  'Live birth', 'জীবিত জন্ম'),
        _ch('delivery_outcome', 'stillbirth', 'Stillbirth', 'মৃত জন্ম'),
        _ch('delivery_outcome', 'na', 'N/A (undelivered)', 'প্রযোজ্য নয়'),
    ]
    # MNM uses the same condensed cause buckets as MPDSR Form 1.
    cod = [
        ('haemorrhage',       'Haemorrhage', 'রক্তক্ষরণ'),
        ('eclampsia',         'Eclampsia / pre-eclampsia',
         'একলাম্পসিয়া'),
        ('sepsis',            'Sepsis', 'সেপসিস'),
        ('obstructed_labour', 'Obstructed labour', 'বাধাগ্রস্ত শ্রম'),
        ('abortion_related',  'Abortion-related', 'গর্ভপাতজনিত'),
        ('embolism',          'Embolism', 'এমবোলিজম'),
        ('indirect',          'Indirect cause', 'পরোক্ষ কারণ'),
        ('other',             'Other', 'অন্যান্য'),
    ]
    ch += [_ch('cod_maternal', k, en, bn) for k, en, bn in cod]
    return ch


# ─── Form catalogue ──────────────────────────────────────────────────────────

# ╔══════════════════════════════════════════════════════════════════════════╗
# ║   FORM 10 — MPDSR Response Plan (review-meeting action tracker)         ║
# ║   Source: MPDSR Response Plan_2026 (1).docx — district/meeting header + ║
# ║   3 sections (System Strengthening, Community-VA & Facility modifiable  ║
# ║   factors); each section is a repeat of agreed actions.                 ║
# ╚══════════════════════════════════════════════════════════════════════════╝

def _response_plan_survey():
    # Flat schema to match the existing submissions dispatcher
    # (_create_mpdsr_response_plan): meeting meta + 3 sections × up to 5
    # actions, each {sec}_a{i}_{field}. Slots reveal progressively (a2 once
    # a1's action is filled) so the form stays short in practice.
    rows = _meta('MPDSR Response Plan serial number', 'রেসপন্স প্ল্যান ক্রমিক নং')
    rows += [
        _sr('select_one rp_level', 'meeting_level', 'MPDSR review level',
            'এমপিডিএসআর পর্যালোচনার স্তর', required='yes'),
        _sr('date', 'meeting_date', 'Date of review meeting',
            'পর্যালোচনা সভার তারিখ', required='yes'),
        _sr('text', 'place_of_meeting', 'Place of meeting', 'সভার স্থান'),
        _sr('integer', 'participants_count', 'Number of participants',
            'অংশগ্রহণকারীর সংখ্যা', constraint='. >= 0 and . <= 500'),
    ]
    # (field-prefix, EN section, BN section, has_indicator) — only System
    # Strengthening carries the Indicator column (per the source doc).
    sections = [
        ('sys_strengthen', 'MPDSR System Strengthening',
         'এমপিডিএসআর সিস্টেম শক্তিশালীকরণ', True),
        ('community_va', 'Common modifiable factors (Community verbal autopsy)',
         'সাধারণ পরিবর্তনযোগ্য কারণ (কমিউনিটি ভার্বাল অটোপসি)', False),
        ('facility_dr', 'Common modifiable factors (Facility death review)',
         'সাধারণ পরিবর্তনযোগ্য কারণ (ফ্যাসিলিটি ডেথ রিভিউ)', False),
    ]
    for sec, en, bn, has_ind in sections:
        rows.append(_sr('begin_group', 'grp_%s' % sec, en, bn))
        rows.append(_sr('note', '_%s_note' % sec,
            'Enter up to 5 agreed actions. Fill Action 1 first; the next appears as you go.',
            'সর্বোচ্চ ৫টি সম্মত পদক্ষেপ লিখুন। আগে পদক্ষেপ ১ পূরণ করুন; পরেরটি আপনাআপনি আসবে।'))
        for i in range(1, 6):
            rel = '' if i == 1 else "${%s_a%d_action_taken}!=''" % (sec, i - 1)
            rows.append(_sr('begin_group', 'grp_%s_a%d' % (sec, i),
                            'Action %d' % i, 'পদক্ষেপ %d' % i, relevant=rel))
            rows.append(_sr('text', '%s_a%d_action_taken' % (sec, i),
                            'Action to be taken', 'গৃহীত পদক্ষেপ', app='multiline'))
            rows.append(_sr('text', '%s_a%d_responsible' % (sec, i),
                            'Responsible (person / office)', 'দায়িত্বপ্রাপ্ত (ব্যক্তি / দপ্তর)'))
            rows.append(_sr('date', '%s_a%d_timeline' % (sec, i),
                            'Timeline (target date)', 'সময়সীমা (লক্ষ্য তারিখ)'))
            if has_ind:
                rows.append(_sr('text', '%s_a%d_indicator' % (sec, i),
                                'Indicator', 'নির্দেশক'))
            rows.append(_sr('text', '%s_a%d_milestone' % (sec, i),
                            'Milestone', 'মাইলফলক'))
            rows.append(_sr('text', '%s_a%d_considerations' % (sec, i),
                            'Considerations', 'বিবেচ্য বিষয়', app='multiline'))
            rows.append(_sr('select_one rp_status', '%s_a%d_status' % (sec, i),
                            'Implementation status', 'বাস্তবায়ন অবস্থা'))
            rows.append(_sr('end_group', 'grp_%s_a%d' % (sec, i)))
        rows.append(_sr('end_group', 'grp_%s' % sec))
    return rows


def _response_plan_choices():
    ch = list(DISTRICT_CHOICES) + list(YES_NO)
    for k, en, bn in [
        ('DM', 'District MPDSR (DM)', 'জেলা এমপিডিএসআর'),
        ('UM', 'Upazila MPDSR (UM)', 'উপজেলা এমপিডিএসআর'),
    ]:
        ch.append(_ch('rp_level', k, en, bn))
    # Status values match the tracker: 'implemented' = green; 'in_progress' =
    # amber; anything else + past-timeline = red (Overdue) on the dashboard.
    for k, en, bn in [
        ('implemented', 'Implemented', 'বাস্তবায়িত'),
        ('in_progress', 'In progress', 'চলমান'),
        ('pending',     'Pending / not started', 'অপেক্ষমাণ / শুরু হয়নি'),
        ('delayed',     'Delayed', 'বিলম্বিত'),
        ('dropped',     'Dropped', 'বাতিল'),
    ]:
        ch.append(_ch('rp_status', k, en, bn))
    return ch


FORMS = [
    dict(file='CIPRB-1_Fistula_Question_Bank.xlsx',
         id='ciprb_fistula_questions_v1',
         title='CIPRB 1 — Fistula Question Bank',
         survey=_fistula_survey, choices=_fistula_choices),
    dict(file='CIPRB-2_MPDSR_Form_01_Community_Maternal.xlsx',
         id='ciprb_mpdsr_community_maternal_v1',
         title='CIPRB 2 — MPDSR Form 01 (Community Maternal Death)',
         survey=_community_maternal_survey,
         choices=_community_maternal_choices),
    dict(file='CIPRB-3_MPDSR_Form_02_Community_Neonatal.xlsx',
         id='ciprb_mpdsr_community_neonatal_v1',
         title='CIPRB 3 — MPDSR Form 02 (Community Neonatal Death)',
         survey=_community_neonatal_survey,
         choices=_community_neonatal_choices),
    dict(file='CIPRB-4_MPDSR_Form_04_Facility_Maternal.xlsx',
         id='ciprb_mpdsr_facility_maternal_v1',
         title='CIPRB 4 — MPDSR Form 04 (Facility Maternal Death)',
         survey=_facility_maternal_survey,
         choices=_facility_maternal_choices),
    dict(file='CIPRB-5_MPDSR_Form_05_Facility_Neonatal.xlsx',
         id='ciprb_mpdsr_facility_neonatal_v1',
         title='CIPRB 5 — MPDSR Form 05 (Facility Neonatal Death)',
         survey=_facility_neonatal_survey,
         choices=_facility_neonatal_choices),
    dict(file='CIPRB-6_Social_Autopsy.xlsx',
         id='ciprb_social_autopsy_v1',
         title='CIPRB 6 — Social Autopsy (Maternal Death)',
         survey=_social_autopsy_survey,
         choices=_social_autopsy_choices),
    dict(file='CIPRB-7_Notification_Slip_01.xlsx',
         id='ciprb_notification_slip_01_v1',
         title='CIPRB 7 — Death Notification Slip 01',
         survey=lambda: _notification_slip_survey(1),
         choices=_notification_slip_choices),
    dict(file='CIPRB-8_Notification_Slip_02.xlsx',
         id='ciprb_notification_slip_02_v1',
         title='CIPRB 8 — Death Notification Slip 02',
         survey=lambda: _notification_slip_survey(2),
         choices=_notification_slip_choices),
    dict(file='CIPRB-9_Maternal_Near_Miss.xlsx',
         id='ciprb_near_miss_v1',
         title='CIPRB 9 — Maternal Near Miss audit',
         survey=_near_miss_survey, choices=_near_miss_choices),
    dict(file='CIPRB-10_MPDSR_Response_Plan.xlsx',
         id='ciprb_mpdsr_response_plan_v1',
         title='CIPRB 10 — MPDSR Response Plan',
         survey=_response_plan_survey, choices=_response_plan_choices),
]


# ─── Kobo upload helper (mirrors export_phd_clients) ────────────────────────

def _kobo_token():
    return (getattr(settings, 'KOBO_API_TOKEN', '')
            or os.environ.get('KOBO_TOKEN', '')).strip()


def _import_xlsform(xlsx_path: str, asset_uid: str, token: str, stdout):
    """Replace the survey XML in an existing Kobo asset by importing the xlsx
    into it.  Returns True on success."""
    headers = {'Authorization': f'Token {token}'}
    api = f'{KOBO_BASE}/api/v2'
    with open(xlsx_path, 'rb') as fh:
        files = {'file': (os.path.basename(xlsx_path), fh,
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}
        data = {'destination': f'{api}/assets/{asset_uid}/', 'library': 'false'}
        r = requests.post(f'{api}/imports/', headers=headers,
                          files=files, data=data, timeout=120)
    if r.status_code not in (200, 201):
        stdout.write(f'    import FAILED ({r.status_code}): {r.text[:200]}')
        return False
    stdout.write('    imported')
    return True


def _create_asset(form_id: str, form_title: str, token: str, stdout):
    """Create a fresh KoboToolbox asset for a CIPRB form and return its uid."""
    headers = {'Authorization': f'Token {token}'}
    api = f'{KOBO_BASE}/api/v2'
    body = {
        'name':       form_title,
        'asset_type': 'survey',
        'settings':   {'description': f'CIPRB form {form_id}'},
    }
    r = requests.post(f'{api}/assets/', headers=headers, json=body, timeout=60)
    if r.status_code not in (200, 201):
        stdout.write(f'    create FAILED ({r.status_code}): {r.text[:200]}')
        return None
    return r.json().get('uid')


def _deploy(asset_uid: str, token: str, stdout):
    headers = {'Authorization': f'Token {token}'}
    api = f'{KOBO_BASE}/api/v2'
    # latest version_id
    v = requests.get(f'{api}/assets/{asset_uid}/versions/?limit=1',
                     headers=headers, timeout=30)
    try:
        vhash = v.json()['results'][0]['uid']
    except Exception:
        stdout.write('    no version yet — skipping deploy')
        return False
    r = requests.patch(
        f'{api}/assets/{asset_uid}/deployment/',
        headers=headers,
        json={'version_id': vhash, 'active': True},
        timeout=60,
    )
    if r.status_code in (200, 201):
        stdout.write('    deployed')
        return True
    # First-time deploy may need POST.
    r2 = requests.post(
        f'{api}/assets/{asset_uid}/deployment/',
        headers=headers,
        json={'version_id': vhash, 'active': True},
        timeout=60,
    )
    if r2.status_code in (200, 201):
        stdout.write('    deployed (POST)')
        return True
    stdout.write(f'    deploy FAILED ({r.status_code}/{r2.status_code}): {r2.text[:160]}')
    return False


class Command(BaseCommand):
    help = 'Build the 9 CIPRB XLSForms (Fistula Question Bank, MPDSR 1/2/4/5, Social Autopsy, 2 notification slips, Maternal Near Miss). Pass --upload to push to Kobo.'

    def add_arguments(self, parser):
        parser.add_argument('--output-dir', default=OUTDIR)
        parser.add_argument('--upload', action='store_true',
            help='Upload to Kobo, create assets when missing, deploy.')
        parser.add_argument('--only', default='',
            help='Build/deploy ONLY the form with this id (e.g. '
                 'ciprb_mpdsr_response_plan_v1). Avoids touching the others.')

    def handle(self, *args, **opts):
        out = opts['output_dir']
        os.makedirs(out, exist_ok=True)
        token = _kobo_token() if opts['upload'] else ''

        if opts['upload'] and not token:
            self.stdout.write(self.style.ERROR(
                'KOBO_TOKEN not set — cannot --upload.'))
            return

        only = opts.get('only', '')
        for f in FORMS:
            if only and f['id'] != only:
                continue
            survey  = f['survey']()
            choices = f['choices']()
            wb = _wb(f['id'], f['title'], survey, choices)
            path = os.path.join(out, f['file'])
            wb.save(path)
            self.stdout.write(self.style.SUCCESS(
                f"  OK  {f['file']:55s}  {len(survey):3d} rows  id: {f['id']}"))

            if opts['upload']:
                # Look up existing asset by form_id (id_string), create if absent.
                self.stdout.write('     uploading…')
                api = f'{KOBO_BASE}/api/v2'
                headers = {'Authorization': f'Token {token}'}
                q = requests.get(
                    f'{api}/assets/?q=settings__id_string:{f["id"]}',
                    headers=headers, timeout=30).json()
                asset_uid = None
                for a in q.get('results', []):
                    if a.get('settings', {}).get('id_string') == f['id']:
                        asset_uid = a.get('uid')
                        break
                if not asset_uid:
                    asset_uid = _create_asset(f['id'], f['title'], token, self.stdout)
                if not asset_uid:
                    continue
                ok = _import_xlsform(path, asset_uid, token, self.stdout)
                if ok:
                    _deploy(asset_uid, token, self.stdout)
                self.stdout.write(f'     uid: {asset_uid}')

        self.stdout.write(f'\nWritten to {os.path.abspath(out)}/')
