"""
Management command: generate_phd_forms

Generates the THREE consolidated PHD KoboToolbox XLSForms (the 3-form
consolidation that replaces ~13 single-purpose forms):

  1. KF-PHD-1_Registration.xlsx     id: spondon_client_reg_v1
        FSW master-list registration (creates the ID No.).

  2. KF-PHD-2_Patient_Service.xlsx  id: spondon_patient_service_v1
        One form, a "What service?" selector → Clinic visit / HIV-STI test /
        Counselling / MH screening / GBV case / Referral. Keyed by ID No.

  3. KF-PHD-3_Activity_Ops.xlsx     id: spondon_activity_ops_v1
        One form, a "What are you recording?" selector → Outreach /
        Group education / Training event / Coordination meeting /
        Mobile camp / Stock / IEC material.

Mechanics: each section reuses the proven field-builders from
generate_kobo_forms.py, strips their per-form metadata block, prefixes every
field name with "<section>__", rewrites intra-section ${refs}, and wraps the
section in a group gated on the selector. The webhook
(programs.webhook._handle_patient_service / _handle_activity_ops) un-prefixes
the active section and delegates to the original single-form handlers, so the
field contract is preserved with NO change to those handlers.

"Who filled it" without login: every form requires `enumerator_name` at the
top; the dispatcher stamps it into each section's natural identity field.

Usage:
    python manage.py generate_phd_forms [--output-dir koboforms/]
"""
import os
import re

from django.core.management.base import BaseCommand

from .generate_kobo_forms import (
    _survey_row, _choice, _build_wb,
    _common_choices, _center_choices,
    _form_client_registration, _form_clinic_visit, _form_hiv_sti_test,
    _form_individual_counselling, _form_mh_screening, _form_gbv_case,
    _form_referral, _form_outreach_session, _form_group_education,
    _form_training_event, _form_coord_meeting, _form_mobile_camp,
)

# Column indices in a _survey_row list (see generate_kobo_forms.SURVEY_HEADERS):
# 0 type 1 name 2 label_en 3 label_bn 4 hint 5 required 6 relevant
# 7 constraint 8 constraint_msg 9 default 10 appearance 11 calculation
_C_NAME, _C_RELEVANT, _C_CONSTRAINT, _C_CALC = 1, 6, 7, 11
_REF = re.compile(r'\$\{([^}]+)\}')


# ─── Shared header rows ─────────────────────────────────────────────────────────

def _meta_rows():
    """GPS + org + centre + enumerator identity, shared by all three forms."""
    return [
        _survey_row('begin_group', 'grp_meta', 'Submission Info', 'তথ্য'),
        _survey_row('geopoint', 'location',
                    'GPS Location (required — step outside if no signal)',
                    'জিপিএস অবস্থান (প্রয়োজনীয়)', required='yes'),
        _survey_row('select_one partner_org', 'partner_org', 'Organisation', 'সংগঠন',
                    required='yes', default='PHD'),
        _survey_row('select_one center_code', 'center_code', 'Service Centre', 'সেবাকেন্দ্র',
                    required='yes'),
        _survey_row('text', 'enumerator_name', 'Your name (who is filling this form)',
                    'আপনার নাম (কে পূরণ করছেন)', required='yes'),
        _survey_row('text', 'enumerator_phone', 'Your phone', 'আপনার ফোন'),
        _survey_row('end_group', 'grp_meta', '', ''),
    ]


# ─── Section transform ──────────────────────────────────────────────────────────

def _strip_meta(rows):
    """Drop the leading grp_meta block emitted by _common_metadata_rows()."""
    for i, r in enumerate(rows):
        if r[0] == 'end_group' and r[_C_NAME] == 'grp_meta':
            return rows[i + 1:]
    return rows


def _section(prefix, builder, selector_field, selector_value, drop_names=()):
    """Reuse a single-form builder as a gated, prefixed section."""
    body = _strip_meta(builder())
    body = [r for r in body if r[_C_NAME] not in drop_names]

    # Names local to this section (questions + groups) — used to decide which
    # ${refs} to prefix. Shared refs (partner_org, client_id, service_type…)
    # are NOT in this set, so they are left untouched.
    local = {r[_C_NAME] for r in body if r[_C_NAME]}

    def _rw(expr):
        if not expr:
            return expr
        return _REF.sub(
            lambda m: '${%s__%s}' % (prefix, m.group(1)) if m.group(1) in local else m.group(0),
            expr,
        )

    out = []
    for r in body:
        r = list(r)
        if r[_C_NAME]:
            r[_C_NAME] = f'{prefix}__{r[_C_NAME]}'
        r[_C_RELEVANT] = _rw(r[_C_RELEVANT])
        r[_C_CONSTRAINT] = _rw(r[_C_CONSTRAINT])
        r[_C_CALC] = _rw(r[_C_CALC])
        out.append(r)

    gate = "${%s} = '%s'" % (selector_field, selector_value)
    return (
        [_survey_row('begin_group', f'sec_{prefix}', '', '', relevant=gate)]
        + out
        + [_survey_row('end_group', f'sec_{prefix}', '', '')]
    )


# ─── New section builders (Stock + IEC had no form yet) ─────────────────────────

def _form_stock():
    return [
        _survey_row('date', 'reporting_month', 'Reporting Month (any day in month)', 'রিপোর্টিং মাস', required='yes'),
        _survey_row('text', 'item_name', 'Item name', 'পণ্যের নাম', required='yes'),
        _survey_row('select_one item_category', 'item_category', 'Category', 'শ্রেণি', required='yes'),
        _survey_row('text', 'batch_number', 'Batch No.', 'ব্যাচ নম্বর'),
        _survey_row('date', 'expiry_date', 'Expiry date', 'মেয়াদ উত্তীর্ণের তারিখ'),
        _survey_row('text', 'delivery_challan_no', 'Delivery challan / voucher', 'ডেলিভারি চালান'),
        _survey_row('integer', 'opening_balance', 'Opening balance', 'প্রারম্ভিক মজুদ'),
        _survey_row('integer', 'quantity_received', 'Quantity received', 'গৃহীত পরিমাণ'),
        _survey_row('integer', 'quantity_issued', 'Quantity issued', 'বিতরণকৃত পরিমাণ'),
        _survey_row('integer', 'quantity_expired_lost', 'Quantity expired / lost', 'মেয়াদোত্তীর্ণ / ক্ষতি'),
        _survey_row('text', 'notes', 'Notes', 'মন্তব্য', appearance='multiline'),
    ]


def _form_iec():
    return [
        _survey_row('select_one material_type', 'material_type', 'Material type', 'উপকরণের ধরন', required='yes'),
        _survey_row('integer', 'quantity', 'Quantity installed / distributed', 'স্থাপিত / বিতরণকৃত সংখ্যা', required='yes'),
        _survey_row('date', 'date_distributed', 'Date installed / distributed', 'স্থাপনের তারিখ', required='yes'),
        _survey_row('text', 'district', 'District', 'জেলা'),
        _survey_row('text', 'notes', 'Notes', 'মন্তব্য', appearance='multiline'),
    ]


def _extra_choices():
    rows = []
    for v, en, bn in [
        ('clinic', 'Clinic visit / Patient record', 'ক্লিনিক ভিজিট'),
        ('htc', 'HIV / STI test (HTC)', 'এইচআইভি/এসটিআই পরীক্ষা'),
        ('counselling', 'Counselling session', 'কাউন্সেলিং'),
        ('mh', 'Mental-health screening', 'মানসিক স্বাস্থ্য স্ক্রিনিং'),
        ('gbv', 'GBV case', 'জিবিভি কেস'),
        ('referral', 'Referral', 'রেফারেল'),
    ]:
        rows.append(_choice('service_type', v, en, bn))
    for v, en, bn in [
        ('outreach', 'Outreach session', 'আউটরিচ সেশন'),
        ('group_edu', 'Group education', 'দলগত শিক্ষা'),
        ('training', 'Training / orientation event', 'প্রশিক্ষণ / ওরিয়েন্টেশন'),
        ('meeting', 'Coordination meeting', 'সমন্বয় সভা'),
        ('camp', 'Mobile health camp', 'মোবাইল ক্যাম্প'),
        ('stock', 'Stock entry', 'স্টক এন্ট্রি'),
        ('iec', 'IEC material installed', 'আইইসি উপকরণ'),
    ]:
        rows.append(_choice('activity_type', v, en, bn))
    for v, en, bn in [
        ('medicine', 'Medicine', 'ওষুধ'), ('contraceptive', 'Contraceptive', 'গর্ভনিরোধক'),
        ('condom', 'Condom / Lubricant', 'কনডম / লুব্রিকেন্ট'), ('test_kit', 'Test kit', 'টেস্ট কিট'),
        ('ipc', 'IPC / Sterilisation', 'আইপিসি'), ('gbv_dignity', 'GBV / Dignity kit', 'জিবিভি / ডিগনিটি কিট'),
        ('other', 'Other', 'অন্যান্য'),
    ]:
        rows.append(_choice('item_category', v, en, bn))
    for v, en, bn in [
        ('message_board', 'Message board', 'মেসেজ বোর্ড'), ('poster', 'Poster', 'পোস্টার'),
        ('signboard', 'Signboard', 'সাইনবোর্ড'), ('billboard', 'Billboard', 'বিলবোর্ড'),
        ('digital', 'Digital / E-billboard', 'ডিজিটাল'), ('leaflet', 'Leaflet / Flyer', 'লিফলেট'),
        ('other', 'Other', 'অন্যান্য'),
    ]:
        rows.append(_choice('material_type', v, en, bn))
    return rows


# ─── Form assembly ──────────────────────────────────────────────────────────────

def _build_registration():
    return _meta_rows() + _strip_meta(_form_client_registration())


def _build_patient_service():
    rows = _meta_rows()
    rows += [
        _survey_row('begin_group', 'grp_woman', 'Woman (by registered ID)', 'নারী (নিবন্ধিত আইডি)'),
        _survey_row('text', 'client_id', 'ID No. (from registry)', 'আইডি নম্বর',
                    required='yes', hint='Type her registered ID No. — auto-links her record.'),
        _survey_row('text', 'client_name', 'Name (for reference)', 'নাম'),
        _survey_row('end_group', 'grp_woman', '', ''),
        _survey_row('select_one service_type', 'service_type',
                    'What service are you recording?', 'কোন সেবা নথিভুক্ত করছেন?', required='yes'),
    ]
    drop = ('client_id', 'client_name')
    rows += _section('clinic', _form_clinic_visit, 'service_type', 'clinic', drop)
    rows += _section('htc', _form_hiv_sti_test, 'service_type', 'htc', drop)
    rows += _section('counselling', _form_individual_counselling, 'service_type', 'counselling', drop)
    rows += _section('mh', _form_mh_screening, 'service_type', 'mh', drop)
    rows += _section('gbv', _form_gbv_case, 'service_type', 'gbv', drop)
    rows += _section('referral', _form_referral, 'service_type', 'referral', drop)
    return rows


def _build_activity_ops():
    rows = _meta_rows()
    rows += [
        _survey_row('select_one activity_type', 'activity_type',
                    'What are you recording?', 'কী নথিভুক্ত করছেন?', required='yes'),
    ]
    rows += _section('outreach', _form_outreach_session, 'activity_type', 'outreach')
    rows += _section('group_edu', _form_group_education, 'activity_type', 'group_edu')
    rows += _section('training', _form_training_event, 'activity_type', 'training')
    rows += _section('meeting', _form_coord_meeting, 'activity_type', 'meeting')
    rows += _section('camp', _form_mobile_camp, 'activity_type', 'camp')
    rows += _section('stock', _form_stock, 'activity_type', 'stock')
    rows += _section('iec', _form_iec, 'activity_type', 'iec')
    return rows


FORMS = [
    {'filename': 'KF-PHD-1_Registration.xlsx',    'id': 'spondon_client_reg_v1',
     'title': 'PHD 1 — FSW Registration (Mother List)', 'fn': _build_registration},
    {'filename': 'KF-PHD-2_Patient_Service.xlsx', 'id': 'spondon_patient_service_v1',
     'title': 'PHD 2 — Patient Service (Clinic / HTC / Counselling / MH / GBV / Referral)', 'fn': _build_patient_service},
    {'filename': 'KF-PHD-3_Activity_Ops.xlsx',    'id': 'spondon_activity_ops_v1',
     'title': 'PHD 3 — Activity & Operations', 'fn': _build_activity_ops},
]

WEBHOOK_URL = 'https://web-production-091fa.up.railway.app/webhook/programs/'


class Command(BaseCommand):
    help = 'Generate the 3 consolidated PHD KoboToolbox XLSForms.'

    def add_arguments(self, parser):
        parser.add_argument('--output-dir', default='koboforms')

    def handle(self, *args, **options):
        out_dir = options['output_dir']
        os.makedirs(out_dir, exist_ok=True)
        choices = _common_choices() + _extra_choices() + _center_choices()

        self.stdout.write(f'\n  Generating {len(FORMS)} consolidated PHD forms -> {out_dir}/\n')
        for form in FORMS:
            survey_rows = form['fn']()
            wb = _build_wb(form['id'], form['title'], survey_rows, choices)
            path = os.path.join(out_dir, form['filename'])
            wb.save(path)
            self.stdout.write(self.style.SUCCESS(
                f'  OK  {form["filename"]:34s}  id_string: {form["id"]}  ({len(survey_rows)} rows)'))

        self.stdout.write(self.style.WARNING(
            '\n  NEXT (per form, in KoboToolbox):\n'
            '  1. New Project -> Import XLSForm -> upload the .xlsx -> Deploy.\n'
            f'  2. Settings -> REST Services -> Register: URL = {WEBHOOK_URL}form/<id_string>/\n'
            '  3. Settings -> Sharing -> allow submissions without a username/password.\n'
            '  4. Share the collect link with field staff.\n'))
