# -*- coding: utf-8 -*-
"""
Build the 3 PHD KoboToolbox XLSForms from the final source files.

Source files → Form mapping:
  Form 1  Registration         ← Master list.xlsx (Motherlist-BBFSWs + Parameters)
  Form 2  Patient Services     ← Patient Record Register + HTC Service register
                                  + Counselling Report + referral register
  Form 3  Activity & Ops       ← group health education + event database
                                  + material database + gbv corner database
                                  + Stock register

Rules:
  - PHD only — organisation is a hidden calculate field, no choice shown.
  - No fields that are not in the source files.
  - Bangla labels from the source files where available.
"""
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
from django.core.management.base import BaseCommand
from programs.models import ServiceCenter

HERE   = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', 'koboforms'))

_HFILL = PatternFill("solid", fgColor="003F72")
_HFONT = Font(color="FFFFFF", bold=True, size=10)


# ─── XLSForm helpers ──────────────────────────────────────────────────────────

SURVEY_HDR = [
    'type','name','label::English','label::Bangla',
    'hint','required','relevant','constraint','constraint_message',
    'default','appearance','calculation',
]
CHOICES_HDR = ['list_name','name','label::English','label::Bangla']
SETTINGS_HDR = ['form_title','form_id','version','default_language','style']


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
        ('survey',  SURVEY_HDR,   survey),
        ('choices', CHOICES_HDR,  choices),
        ('settings', SETTINGS_HDR, [[form_title, form_id, '20260606', 'English', 'pages theme-grid']]),
    ]:
        ws = wb.create_sheet(sheet_name)
        ws.append(headers)
        for ci in range(1, len(headers)+1):
            c = ws.cell(1, ci)
            c.font = _HFONT
            c.fill = _HFILL
            c.alignment = Alignment(horizontal='center', wrap_text=True)
        for ri, row in enumerate(rows, 2):
            for ci, val in enumerate(row, 1):
                cell = ws.cell(ri, ci, value=val)
                cell.alignment = Alignment(wrap_text=True, vertical='top')
        for ci in range(1, len(headers)+1):
            ws.column_dimensions[get_column_letter(ci)].width = 28
        ws.freeze_panes = 'A2'
    return wb


# ─── Shared header (GPS + PHD hidden + centre + enumerator) ──────────────────

def _meta(center_required=True):
    req = 'yes' if center_required else ''
    return [
        _sr('begin_group','grp_meta','Submission info','তথ্য প্রেরণ'),
        _sr('calculate','organisation','','',calc="'PHD'"),
        _sr('geopoint','location',
            'GPS location (required — step outside if no signal)',
            'জিপিএস অবস্থান (প্রয়োজনীয়)', required='yes'),
        _sr('select_one centre','centre_id',
            'Wellness Centre','ওয়েলনেস সেন্টার', required=req),
        _sr('text','enumerator_name',
            'Your name (person filling this form)',
            'আপনার নাম (কে পূরণ করছেন)', required='yes'),
        _sr('end_group','grp_meta'),
    ]


def _centre_choices():
    rows = []
    for c in ServiceCenter.objects.filter(is_active=True).order_by('organisation','name'):
        rows.append(_ch('centre', c.code, c.name, c.name_bangla or c.name))
    if not rows:
        rows.append(_ch('centre','PLACEHOLDER',
                        'Placeholder — add centres before deployment',
                        'কেন্দ্র যোগ করুন'))
    return rows


# ─── FORM 1: FSW Registration ─────────────────────────────────────────────────
# Source: Master list.xlsx  →  Motherlist-BBFSWs columns + Parameters sheet

def _form1_survey():
    rows = _meta()
    rows += [
        _sr('begin_group','grp_fsw','FSW Registration','যৌনকর্মী নিবন্ধন'),

        _sr('text','id_no',
            'ID No. (unique per FSW)',
            'আইডি নম্বর (অনন্য)',
            required='yes'),

        _sr('text','name',
            'Name','নাম', required='yes'),

        _sr('text','mother_name',
            "Mother's name","মাতার নাম"),

        _sr('integer','birth_year',
            'Birth year','জন্ম সাল',
            constraint='. >= 1940 and . <= 2010',
            cmsg='1940–2010 এর মধ্যে হতে হবে'),

        _sr('text','permanent_address',
            'Permanent address','স্থায়ী ঠিকানা', app='multiline'),

        _sr('select_one education','education',
            'Education','শিক্ষা'),

        _sr('select_one marital_status','marital_status',
            'Marital status','বৈবাহিক অবস্থা'),

        _sr('integer','years_in_profession',
            'How many years in this profession?',
            'কত বছর ধরে এই পেশায়?'),

        # Average clients — value + period (per day/week/month/year)
        # 4 separate sub-columns exactly as in masterlist r6 (day/week/month/year)
        _sr('begin_group','grp_avg_clients',
            'Average sex-work contacts (fill applicable period)',
            'সাধারণত গড়ে কতবার যৌনকাজ করেন (প্রযোজ্য ঘরটি পূরণ করুন)'),
        _sr('integer','avg_clients_per_day',
            'Per day','দিনে'),
        _sr('integer','avg_clients_per_week',
            'Per week','সপ্তাহে'),
        _sr('integer','avg_clients_per_month',
            'Per month','মাসে'),
        _sr('integer','avg_clients_per_year',
            'Per year','বছরে'),
        _sr('end_group','grp_avg_clients'),

        _sr('integer','children_under_18',
            'Number of children under 18',
            '১৮ বছরের নিচে সন্তান সংখ্যা'),

        _sr('select_one yes_no','tobacco_use',
            'Uses tobacco or drugs? (Yes/No)',
            'নেশা গ্রহণ করেন কি না?'),

        _sr('select_one yes_no','has_nid',
            'Has National ID? (Yes/No)',
            'জাতীয় পরিচয়পত্র আছে কি না?'),

        _sr('select_one yes_no','uses_fp',
            'Uses any family-planning method? (Yes/No)',
            'পরিবার পরিকল্পনার কোনো পদ্ধতি ব্যবহার করেন?'),

        _sr('text','fp_method',
            'Which FP method?','কোন পদ্ধতি?',
            relevant="${uses_fp}='yes'"),

        # RiCH quarterly tracking — 3 sub-columns from masterlist r5
        _sr('begin_group','grp_rich',
            'RiCH details (quarterly months)',
            'রিচ বিবরণ (কোয়ার্টারের মাস)'),
        _sr('text','rich_q_month_1',
            '1st month of quarter',
            'কোয়ার্টারের প্রথম মাস'),
        _sr('text','rich_q_month_2',
            '2nd month of quarter',
            'কোয়ার্টারের দ্বিতীয় মাস'),
        _sr('text','rich_q_month_3',
            '3rd month of quarter',
            'কোয়ার্টারের তৃতীয় মাস'),
        _sr('end_group','grp_rich'),

        _sr('text','remarks',
            'Remarks','মন্তব্য', app='multiline'),

        _sr('end_group','grp_fsw'),
    ]
    return rows


def _form1_choices():
    rows = []
    rows += [_ch('yes_no','yes','Yes','হ্যাঁ'), _ch('yes_no','no','No','না')]
    for v,en,bn in [
        ('1','Illiterate','নিরক্ষর'),
        ('2','Primary','প্রাথমিক'),
        ('3','Secondary','মাধ্যমিক'),
        ('4','Higher Secondary','উচ্চ মাধ্যমিক'),
        ('5','Graduate / Masters','স্নাতক/স্নাতকোত্তর'),
    ]:
        rows.append(_ch('education', v, en, bn))
    for v,en,bn in [
        ('1','Single — never married','অবিবাহিত'),
        ('2','Married','বিবাহিত'),
        ('3','Widowed','বিধবা'),
        ('4','Separated','আলাদা'),
        ('5','Divorced','তালাকপ্রাপ্ত'),
        ('6','Others','অন্যান্য'),
    ]:
        rows.append(_ch('marital_status', v, en, bn))
    rows += _centre_choices()
    return rows


# ─── FORM 2: Patient Services ─────────────────────────────────────────────────
# Sections: clinic | htc | counselling | referral
# Sources:
#   clinic      ← Patient Record Register_Rev_May 2026.xlsx
#   htc         ← HTC Service register.xlsx
#   counselling ← Counselling Report.docx  (monthly aggregate per counsellor)
#   referral    ← referral register.xlsx

def _form2_survey():
    rows = _meta()
    rows += [
        _sr('select_one service_type','service_type',
            'What service are you recording?',
            'কোন সেবা নথিভুক্ত করছেন?', required='yes'),
    ]

    # ── Clinic Visit (Patient Record Register) ────────────────────────────────
    REL_C = "${service_type}='clinic'"
    rows += [
        _sr('begin_group','sec_clinic',
            'Clinic Visit / Patient Record',
            'ক্লিনিক ভিজিট / রোগীর তথ্য',
            relevant=REL_C),

        _sr('date','clinic_date','Date','তারিখ', required='yes'),
        _sr('text','clinic_id_no','ID No.','আইডি নম্বর', required='yes'),
        _sr('integer','clinic_age','Age (as per motherlist)','বয়স (মাদারলিস্ট অনুযায়ী)'),
        _sr('select_one sex','clinic_sex','Sex','লিঙ্গ'),

        # Screenings
        _sr('begin_group','grp_clinic_screen','Screenings','স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_hiv_screen','HIV Screening','এইচআইভি স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_syphilis_screen','Syphilis Screening','সিফিলিস স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_hepb_screen','Hepatitis B Screening','হেপাটাইটিস বি স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_hepc_screen','Hepatitis C Screening','হেপাটাইটিস সি স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_tb_screen','TB Screening','যক্ষ্মা স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_gbv_screen','GBV Screening','জিবিভি স্ক্রিনিং'),
        _sr('select_one yes_no','clinic_mh_screen','Mental Health Screening','মানসিক স্বাস্থ্য স্ক্রিনিং'),
        _sr('end_group','grp_clinic_screen'),

        _sr('text','clinic_chief_complaints','Chief Complaints','প্রধান অভিযোগ', app='multiline'),
        _sr('select_one visit_type','clinic_visit_type','STI Case Type','এসটিআই কেস ধরন'),

        # STI Diagnoses
        _sr('begin_group','grp_clinic_diag','STI Diagnosis','এসটিআই নির্ণয়'),
        _sr('select_one yes_no','clinic_diag_uds','UDS','ইউডিএস'),
        _sr('select_one yes_no','clinic_diag_vds','VDS','ভিডিএস'),
        _sr('select_one yes_no','clinic_diag_gu','GU','জিইউ'),
        _sr('select_one yes_no','clinic_diag_pid','PID','পিআইডি'),
        _sr('select_one yes_no','clinic_diag_ss','SS','এসএস'),
        _sr('select_one yes_no','clinic_diag_ib','IB','আইবি'),
        _sr('select_one yes_no','clinic_diag_anal_sti','Anal STIs','অ্যানাল এসটিআই'),
        _sr('select_one yes_no','clinic_diag_hiv','HIV','এইচআইভি'),
        _sr('select_one yes_no','clinic_diag_gh','GH (General Health)','জিএইচ (সাধারণ স্বাস্থ্য)'),
        _sr('end_group','grp_clinic_diag'),

        _sr('text','clinic_treatment','Treatment Provided (medicine name & quantity)',
            'প্রদত্ত চিকিৎসা (ওষুধের নাম ও পরিমাণ)', app='multiline'),
        _sr('select_one treatment_timing','clinic_treatment_timing',
            'Seeking treatment after onset of STI symptoms',
            'এসটিআই লক্ষণ শুরুর পর চিকিৎসা নিতে এসেছেন'),

        _sr('integer','clinic_condom_demo',
            '# of condom demonstrations','কনডম প্রদর্শনীর সংখ্যা'),

        # Follow up
        _sr('begin_group','grp_clinic_fu','Follow Up','ফলো-আপ'),
        _sr('date','clinic_fu_due','Follow-up due date','ফলো-আপের নির্ধারিত তারিখ'),
        _sr('date','clinic_fu_done','Follow-up done date','ফলো-আপ সম্পন্নের তারিখ'),
        _sr('select_one yes_no','clinic_adr','Adverse Drug Reaction (Y/N)','এডিআর (হ্যাঁ/না)'),
        _sr('end_group','grp_clinic_fu'),

        # Referrals (from source: STI-confirmatory, STI-non-responsive, STI-Partner,
        #            MCH/RH, GBV, MHPSS, MR, TB, General Health, EPI)
        _sr('begin_group','grp_clinic_ref','Referral Cases','রেফারেল কেস'),
        _sr('select_one yes_no','clinic_ref_sti_confirm','STI-confirmatory test','এসটিআই নিশ্চিত পরীক্ষা'),
        _sr('select_one yes_no','clinic_ref_sti_nonres','STI-non-responsive / complicated','এসটিআই অ-প্রতিক্রিয়াশীল'),
        _sr('select_one yes_no','clinic_ref_sti_partner','STI-Partner','এসটিআই সঙ্গী'),
        _sr('select_one yes_no','clinic_ref_mch','MCH / Reproductive Health','এমসিএইচ / প্রজনন স্বাস্থ্য'),
        _sr('select_one yes_no','clinic_ref_gbv','GBV referral','জিবিভি রেফারেল'),
        _sr('select_one yes_no','clinic_ref_mhpss','MHPSS referral','এমএইচপিএসএস রেফারেল'),
        _sr('select_one yes_no','clinic_ref_mr','MR','এমআর'),
        _sr('select_one yes_no','clinic_ref_tb','TB','যক্ষ্মা'),
        _sr('select_one yes_no','clinic_ref_gh','General Health','সাধারণ স্বাস্থ্য'),
        _sr('select_one yes_no','clinic_ref_epi','EPI','ইপিআই'),
        _sr('end_group','grp_clinic_ref'),

        _sr('select_one yes_no','clinic_contraception',
            'Use of current contraception (Y/N)',
            'বর্তমান গর্ভনিরোধক ব্যবহার (হ্যাঁ/না)'),
        _sr('text','clinic_contraception_method',
            'Which method?','কোন পদ্ধতি?',
            relevant="${clinic_contraception}='yes'"),

        _sr('end_group','sec_clinic'),
    ]

    # ── HTC Service Register ──────────────────────────────────────────────────
    REL_H = "${service_type}='htc'"
    rows += [
        _sr('begin_group','sec_htc',
            'HTC Service Register','এইচটিসি সেবা রেজিস্টার',
            relevant=REL_H),

        _sr('date','htc_date','Date (dd/mm/yy)','তারিখ', required='yes'),
        _sr('text','htc_client_id',
            "Client's ID (partner: add 'P' prefix)",
            'ক্লায়েন্ট আইডি (সঙ্গী হলে P যোগ করুন)', required='yes'),
        _sr('integer','htc_age','Age (in years)','বয়স (বছরে)'),
        _sr('select_one sex','htc_sex','Sex (M/F)','লিঙ্গ (পুরুষ/মহিলা)'),
        _sr('select_one test_occasion','htc_test_type',
            'New test or Re-test',
            'নতুন পরীক্ষা নাকি পুনরায় পরীক্ষা'),
        _sr('select_one tested_at','htc_tested_at',
            'Tested at (DIC=1 / Outreach or Mobile Camp=2)',
            'কোথায় পরীক্ষা (DIC=1 / আউটরিচ বা মোবাইল ক্যাম্প=2)'),
        _sr('select_one tested_by','htc_tested_by',
            'Tested by (Paramedic/MA=1 / CO/FM/PV/CW=2)',
            'কে পরীক্ষা করলেন (প্যারামেডিক/এমএ=1 / CO/FM/PV/CW=2)'),
        _sr('select_one yes_no','htc_pretest_counsel',
            'Pre-test counselling (Y/N)','পরীক্ষা-পূর্ব কাউন্সেলিং (হ্যাঁ/না)'),

        # 3-test algorithm
        _sr('begin_group','grp_htc_tests','HIV Test Results','এইচআইভি পরীক্ষার ফলাফল'),
        _sr('select_one rnrinv','htc_test1',
            'Test 1: Determine (R / NR / INV)',
            'পরীক্ষা ১: ডিটারমাইন'),
        _sr('select_one rnrinv','htc_test2',
            'Test 2: Uni Gold (R / NR / INV)',
            'পরীক্ষা ২: ইউনি গোল্ড',
            relevant="${htc_test1}='R'"),
        _sr('select_one rnrinv','htc_test3',
            'Test 3: First Response (R / NR / INV)',
            'পরীক্ষা ৩: ফার্স্ট রেসপন্স',
            relevant="${htc_test1}='R'"),
        _sr('select_one final_result','htc_final_result',
            'Final Result (Positive / Negative / Indeterminate)',
            'চূড়ান্ত ফলাফল'),
        _sr('end_group','grp_htc_tests'),

        _sr('select_one yes_no','htc_eqa',
            'Send for EQA? (tick if yes)','ইকিউএ-তে পাঠাবেন?'),
        _sr('date','htc_dbs_date',
            'DBS prepared on (dd/mm/yy)','ডিবিএস তৈরির তারিখ',
            relevant="${htc_eqa}='yes'"),
        _sr('text','htc_eqa_result',
            'Result from EQA / Retesting','ইকিউএ / পুনঃপরীক্ষার ফলাফল',
            relevant="${htc_eqa}='yes'"),

        _sr('select_one yes_no','htc_posttest_counsel',
            'Post-test counselling (Y/N)','পরীক্ষা-পরবর্তী কাউন্সেলিং'),
        _sr('select_one yes_no','htc_client_received_result',
            'Client received result (Y/N)','ক্লায়েন্ট ফলাফল পেয়েছেন?'),
        _sr('text','htc_remarks','Remarks','মন্তব্য', app='multiline'),

        _sr('end_group','sec_htc'),
    ]

    # ── Counselling Report (monthly aggregate per counsellor) ─────────────────
    REL_CO = "${service_type}='counselling'"
    rows += [
        _sr('begin_group','sec_counsel',
            'Counselling Report (monthly)',
            'কাউন্সেলিং রিপোর্ট (মাসিক)',
            relevant=REL_CO),

        _sr('text','counsel_prepared_by',
            'Prepared by','প্রস্তুতকারী', required='yes'),
        _sr('date','counsel_date',
            'Date','তারিখ', required='yes'),
        _sr('text','counsel_month',
            'Name of the month','মাসের নাম', required='yes',
            hint='e.g. June 2026'),
        _sr('text','counsel_counsellor',
            'Counsellor (Medical Assistant / Midwife cum Counsellor)',
            'কাউন্সেলর (মেডিকেল অ্যাসিস্ট্যান্ট / মিডওয়াইফ কাম কাউন্সেলর)',
            required='yes'),

        _sr('integer','counsel_hiv_test',
            'HIV Test & Counselling (count)',
            'এইচআইভি পরীক্ষা ও কাউন্সেলিং (সংখ্যা)'),
        _sr('integer','counsel_sti',
            'STI Counselling (count)',
            'এসটিআই কাউন্সেলিং (সংখ্যা)'),
        _sr('integer','counsel_srhr',
            'SRHR Counselling (count)',
            'এসআরএইচআর কাউন্সেলিং (সংখ্যা)'),
        _sr('integer','counsel_gbv',
            'GBV Counselling (count)',
            'জিবিভি কাউন্সেলিং (সংখ্যা)'),
        _sr('integer','counsel_art',
            'ART Counselling (count)',
            'এআরটি কাউন্সেলিং (সংখ্যা)'),
        _sr('integer','counsel_mh',
            'Mental Health Counselling (count)',
            'মানসিক স্বাস্থ্য কাউন্সেলিং (সংখ্যা)'),
        _sr('calculate','counsel_total',
            'Total number of individual counselling (auto)',
            'মোট ব্যক্তিগত কাউন্সেলিং (স্বয়ংক্রিয়)',
            calc='${counsel_hiv_test} + ${counsel_sti} + ${counsel_srhr} + ${counsel_gbv} + ${counsel_art} + ${counsel_mh}'),
        _sr('integer','counsel_group_mh',
            'Total Mental Health Group Counselling (count)',
            'মোট মানসিক স্বাস্থ্য গ্রুপ কাউন্সেলিং (সংখ্যা)'),
        _sr('text','counsel_note','Note','মন্তব্য', app='multiline'),

        _sr('end_group','sec_counsel'),
    ]

    # ── Referral Register ─────────────────────────────────────────────────────
    REL_R = "${service_type}='referral'"
    rows += [
        _sr('begin_group','sec_referral',
            'Referral Register','রেফারেল রেজিস্টার',
            relevant=REL_R),

        _sr('text','ref_month_year',
            'Month and Year','মাস ও বছর',
            required='yes', hint='e.g. June 2026'),
        _sr('date','ref_date','Date','তারিখ', required='yes'),
        _sr('text','ref_id_no','ID No.','আইডি নম্বর', required='yes'),
        _sr('text','ref_referred_for',
            'Referred for','কী কারণে রেফার'),
        _sr('text','ref_referred_to',
            'Referred to','কোথায় রেফার'),
        _sr('date','ref_date_received',
            'Date of receiving service',
            'সেবা প্রাপ্তির তারিখ'),
        _sr('date','ref_followup_date',
            'Date of follow-up (if applicable)',
            'ফলো-আপের তারিখ (প্রযোজ্য হলে)'),
        _sr('text','ref_remarks',
            'Remarks (for TB: write the result)',
            'মন্তব্য (যক্ষ্মার ক্ষেত্রে ফলাফল লিখুন)',
            app='multiline'),

        _sr('end_group','sec_referral'),
    ]

    return rows


def _form2_choices():
    rows = []
    rows += [_ch('yes_no','yes','Yes','হ্যাঁ'), _ch('yes_no','no','No','না')]
    for v,en,bn in [
        ('clinic','Clinic Visit / Patient Record','ক্লিনিক ভিজিট / রোগীর তথ্য'),
        ('htc','HTC Service (HIV test)','এইচটিসি সেবা (এইচআইভি পরীক্ষা)'),
        ('counselling','Counselling Report (monthly)','কাউন্সেলিং রিপোর্ট (মাসিক)'),
        ('referral','Referral','রেফারেল'),
    ]:
        rows.append(_ch('service_type', v, en, bn))
    for v,en,bn in [
        ('new','New','নতুন'),
        ('follow_up','Follow-up','ফলো-আপ'),
        ('recurrent','Recurrent (within last 6 months)','পুনরাবৃত্তি (শেষ ৬ মাসে)'),
    ]:
        rows.append(_ch('visit_type', v, en, bn))
    for v,en,bn in [
        ('within_7','Within 7 days','৭ দিনের মধ্যে'),
        ('more_7','More than 7 days','৭ দিনের বেশি'),
    ]:
        rows.append(_ch('treatment_timing', v, en, bn))
    for v,en,bn in [
        ('M','Male','পুরুষ'), ('F','Female','মহিলা'),
    ]:
        rows.append(_ch('sex', v, en, bn))
    for v,en,bn in [
        ('new','New test','নতুন পরীক্ষা'),
        ('retest','Re-test (2nd/3rd time same year)','পুনরায় পরীক্ষা'),
    ]:
        rows.append(_ch('test_occasion', v, en, bn))
    for v,en,bn in [
        ('1','DIC','ডিআইসি'),
        ('2','Outreach / Mobile Camp','আউটরিচ / মোবাইল ক্যাম্প'),
    ]:
        rows.append(_ch('tested_at', v, en, bn))
    for v,en,bn in [
        ('1','Paramedic / MA','প্যারামেডিক / এমএ'),
        ('2','CO / FM / PV / CW','CO / FM / PV / CW'),
    ]:
        rows.append(_ch('tested_by', v, en, bn))
    for v,en in [('R','R (Reactive)'),('NR','NR (Non-Reactive)'),('INV','INV (Invalid)')]:
        rows.append(_ch('rnrinv', v, en, ''))
    for v,en,bn in [
        ('positive','Positive','পজিটিভ'),
        ('negative','Negative','নেগেটিভ'),
        ('indeterminate','Indeterminate','অনির্ধারিত'),
    ]:
        rows.append(_ch('final_result', v, en, bn))
    rows += _centre_choices()
    return rows


# ─── FORM 3: Activity & Operations ────────────────────────────────────────────
# Sections: group_edu | event | material | gbv_corner | stock
# Sources:
#   group_edu  ← group health education.docx (monthly by topic)
#   event      ← event database.docx
#   material   ← material database.docx
#   gbv_corner ← gbv corner establishment database.docx
#   stock      ← Stock register.xlsx

# Group education topics by audience — from both source files:
#   group health education.docx   (monthly summary, 8 topics)
#   3. Register Group Education   (per-session register, 4 tables by audience)
#
# Table 1 & 2 (Adult FSW / Old Aged FSW): 5 topic columns
# Table 3 (General): 2 topic columns
# Table 4 (Clients of FSW): 3 topic columns
#
# Topics shown per audience type via relevant conditions.
FSW_TOPICS = [
    # slug, English, Bangla
    ('personal_hygiene', 'Personal hygiene / cleanliness',
     'ব্যক্তিগত পরিষ্কার পরিচ্ছন্নতা'),
    ('unsafe_sex',       'Unsafe sex behaviour / unexpected pregnancy',
     'অনিরাপদ যৌন আচরণ ও অপ্রত্যাশিত গর্ভধারণ'),
    ('gbv',              'What is GBV / types of GBV / prevention',
     'জিবিভি কী, জিবিভি-র ধরনসমূহ; জিবিভি প্রতিরোধ'),
    ('hiv_sti',          'HIV, AIDS and STI awareness',
     'এইচআইভি, এইডস ও এসটিআই সম্পর্কে আলোচনা'),
    ('cancer_screen',    'Cervical and breast cancer screening for sex workers',
     'জরায়ু ও স্তন ক্যান্সার স্ক্রিনিং যৌনকর্মীদের জন্য'),
]
GENERAL_TOPICS = [
    ('social_safety',    'Social safety-net',
     'সোশ্যাল সেফটি-নেট'),
    ('small_business',   'Small / micro business / income generation',
     'ক্ষুদ্র ব্যবসায় আয়ের উদ্যোগ গ্রহণ সম্পর্কে'),
]
CLIENT_TOPICS = [
    ('safe_sex_client',  'Safe sex — how to protect yourself and partner',
     'নিরাপদ যৌন আচরণ কীভাবে নিজে ও সঙ্গীকে সুরক্ষিত রাখবেন'),
    ('hiv_sti_client',   'HIV, AIDS and STI awareness',
     'এইচআইভি, এইডস ও এসটিআই সম্পর্কে আলোচনা'),
    ('safe_condom_drugs','Safe condom use / extra drug use',
     'নিরাপদ চ্যাম্প সেক্স বা অতিরিক্ত মাদক সেবন করে যৌনকাজ'),
]


def _form3_survey():
    rows = _meta(center_required=False)
    rows += [
        _sr('select_one activity_type','activity_type',
            'What are you recording?',
            'কী নথিভুক্ত করছেন?', required='yes'),
    ]

    # ── Group Health Education — per-session register ─────────────────────────
    # Source: 3. Register Group Education_rev_May_2026.docx (4 tables by audience)
    #       + group health education.docx (monthly summary same topics)
    # Structure: one Kobo submission = one group session
    # Audience selector → relevant topics shown per audience type
    REL_G = "${activity_type}='group_edu'"
    IS_FSW    = "(${gedu_audience}='adult_fsw' or ${gedu_audience}='old_fsw')"
    IS_GEN    = "${gedu_audience}='general'"
    IS_CLIENT = "${gedu_audience}='client'"
    rows += [
        _sr('begin_group','sec_group_edu',
            'Group Health Education (per session)',
            'দলগত স্বাস্থ্য শিক্ষা (প্রতি সেশন)',
            relevant=REL_G),
        _sr('date','gedu_date',
            'Date of session','সেশনের তারিখ', required='yes'),
        _sr('text','gedu_venue',
            'Venue (house number / location)',
            'স্থান (বাড়ির নম্বর / অবস্থান)', required='yes'),
        _sr('select_one gedu_audience','gedu_audience',
            'Target audience','লক্ষ্য দল', required='yes'),
        _sr('integer','gedu_participant_count',
            'Number of participants','অংশগ্রহণকারীর সংখ্যা'),
    ]
    # Topics for Adult FSW / Old Aged FSW (Tables 1 & 2)
    for slug, en, bn in FSW_TOPICS:
        rows.append(_sr('select_one yes_no', f'gedu_{slug}', en, bn,
                        relevant=IS_FSW))
    # Topics for General (Table 3)
    for slug, en, bn in GENERAL_TOPICS:
        rows.append(_sr('select_one yes_no', f'gedu_{slug}', en, bn,
                        relevant=IS_GEN))
    # Topics for Clients of FSW (Table 4)
    for slug, en, bn in CLIENT_TOPICS:
        rows.append(_sr('select_one yes_no', f'gedu_{slug}', en, bn,
                        relevant=IS_CLIENT))
    rows.append(_sr('end_group','sec_group_edu'))

    # ── Event Database ────────────────────────────────────────────────────────
    REL_E = "${activity_type}='event'"
    rows += [
        _sr('begin_group','sec_event',
            'Event Database','ইভেন্ট ডেটাবেস',
            relevant=REL_E),
        _sr('select_one event_subtype','event_subtype',
            'Type of event','ইভেন্টের ধরন', required='yes'),
        _sr('text','event_title',
            'Title of the event','ইভেন্টের শিরোনাম', required='yes'),
        _sr('date','event_date',
            'Date of the event','ইভেন্টের তারিখ', required='yes'),
        _sr('text','event_place',
            'Place of the event','ইভেন্টের স্থান'),
        _sr('integer','event_participants',
            'Total participants','মোট অংশগ্রহণকারী'),
        _sr('text','event_notes',
            'Notes','মন্তব্য', app='multiline'),
        _sr('end_group','sec_event'),
    ]

    # ── Material Database ─────────────────────────────────────────────────────
    REL_M = "${activity_type}='material'"
    rows += [
        _sr('begin_group','sec_material',
            'Material Database','উপকরণ ডেটাবেস',
            relevant=REL_M),
        _sr('text','mat_name',
            'Name of the material','উপকরণের নাম', required='yes'),
        _sr('date','mat_date',
            'Date of installation','স্থাপনের তারিখ', required='yes'),
        _sr('text','mat_place',
            'Place / Centre / Brothel of installation',
            'স্থাপনের স্থান / কেন্দ্র / ব্রথেল'),
        _sr('integer','mat_quantity',
            'Total material installed','মোট স্থাপিত উপকরণ'),
        _sr('text','mat_notes',
            'Notes','মন্তব্য', app='multiline'),
        _sr('end_group','sec_material'),
    ]

    # ── GBV Corner Establishment Database ────────────────────────────────────
    REL_GBV = "${activity_type}='gbv_corner'"
    rows += [
        _sr('begin_group','sec_gbv_corner',
            'GBV Corner Establishment',
            'জিবিভি কর্নার স্থাপন',
            relevant=REL_GBV),
        _sr('text','gbv_place',
            'Place of establishment','স্থাপনের স্থান', required='yes'),
        _sr('date','gbv_date',
            'Date of establishment','স্থাপনের তারিখ', required='yes'),
        _sr('integer','gbv_furniture',
            'Furniture (add numbers)','আসবাবপত্র (সংখ্যা)'),
        _sr('integer','gbv_equipment',
            'Essential equipment / commodities (add numbers)',
            'প্রয়োজনীয় সরঞ্জাম / পণ্যসামগ্রী (সংখ্যা)'),
        _sr('select_one yes_no','gbv_functional',
            'Fully functional? (Yes/No)',
            'সম্পূর্ণ কার্যকর? (হ্যাঁ/না)'),
        _sr('end_group','sec_gbv_corner'),
    ]

    # ── Stock Register ────────────────────────────────────────────────────────
    REL_S = "${activity_type}='stock'"
    rows += [
        _sr('begin_group','sec_stock',
            'Stock Register','স্টক রেজিস্টার',
            relevant=REL_S),
        _sr('text','stock_item',
            'Item description','পণ্যের বিবরণ', required='yes'),
        _sr('date','stock_date',
            'Date','তারিখ', required='yes'),
        _sr('text','stock_received_issued_to',
            'Received from* / Issued to**',
            'প্রাপ্তির উৎস* / বিতরণের গন্তব্য**'),
        _sr('text','stock_challan',
            'Delivery challan / issue voucher no.',
            'ডেলিভারি চালান / ইস্যু ভাউচার নম্বর'),
        _sr('text','stock_batch',
            'Batch no.','ব্যাচ নম্বর'),
        _sr('date','stock_expiry',
            'Expiry date','মেয়াদ উত্তীর্ণের তারিখ'),
        _sr('integer','stock_opening',
            'Opening balance','প্রারম্ভিক মজুদ'),
        _sr('integer','stock_received',
            'Quantity received','গৃহীত পরিমাণ'),
        _sr('integer','stock_issued',
            'Quantity issued','বিতরণকৃত পরিমাণ'),
        _sr('integer','stock_expired_lost',
            'Quantity expired / loss / adjustment / QA sample',
            'মেয়াদোত্তীর্ণ / ক্ষতি / সমন্বয় / QA নমুনা'),
        _sr('calculate','stock_closing',
            'Closing stock balance (auto)',
            'সমাপনী মজুদ (স্বয়ংক্রিয়)',
            calc='${stock_opening} + ${stock_received} - ${stock_issued} - ${stock_expired_lost}'),
        _sr('text','stock_comments',
            'Comments','মন্তব্য', app='multiline'),
        _sr('end_group','sec_stock'),
    ]

    return rows


def _form3_choices():
    rows = []
    rows += [_ch('yes_no','yes','Yes','হ্যাঁ'), _ch('yes_no','no','No','না')]
    for v,en,bn in [
        ('adult_fsw', 'Adult Sex Workers',     'প্রাপ্তবয়স্ক যৌনকর্মী'),
        ('old_fsw',   'Old Aged Sex Workers',  'বয়স্ক যৌনকর্মী'),
        ('general',   'General (all)',          'সাধারণ (সকলের জন্য)'),
        ('client',    'Clients of Sex Workers','যৌনকর্মীদের ক্লায়েন্ট'),
    ]:
        rows.append(_ch('gedu_audience', v, en, bn))
    for v,en,bn in [
        ('training',      'Training',              'প্রশিক্ষণ'),
        ('orientation',   'Orientation/Workshop',  'ওরিয়েন্টেশন/কর্মশালা'),
        ('camp',          'Mobile Health Camp',    'মোবাইল স্বাস্থ্য ক্যাম্প'),
        ('coord_meeting', 'Coordination Meeting',  'সমন্বয় সভা'),
    ]:
        rows.append(_ch('event_subtype', v, en, bn))
    for v,en,bn in [
        ('group_edu','Group Health Education (per session)','দলগত স্বাস্থ্য শিক্ষা (প্রতি সেশন)'),
        ('event','Event','ইভেন্ট'),
        ('material','Material installation','উপকরণ স্থাপন'),
        ('gbv_corner','GBV Corner establishment','জিবিভি কর্নার স্থাপন'),
        ('stock','Stock entry','স্টক এন্ট্রি'),
    ]:
        rows.append(_ch('activity_type', v, en, bn))
    rows += _centre_choices()
    return rows


# ─── Command ──────────────────────────────────────────────────────────────────

FORMS = [
    {
        'file': 'PHD-1_Registration.xlsx',
        'id':   'phd_registration_v1',
        'title':'PHD 1 — FSW Registration',
        'survey': _form1_survey,
        'choices': _form1_choices,
    },
    {
        'file': 'PHD-2_Patient_Services.xlsx',
        'id':   'phd_patient_services_v1',
        'title':'PHD 2 — Patient Services',
        'survey': _form2_survey,
        'choices': _form2_choices,
    },
    {
        'file': 'PHD-3_Activity_Ops.xlsx',
        'id':   'phd_activity_ops_v1',
        'title':'PHD 3 — Activity & Operations',
        'survey': _form3_survey,
        'choices': _form3_choices,
    },
]


class Command(BaseCommand):
    help = 'Build the 3 PHD XLSForms from the final source files.'

    def add_arguments(self, parser):
        parser.add_argument('--output-dir', default=OUTDIR)

    def handle(self, *args, **options):
        out = options['output_dir']
        os.makedirs(out, exist_ok=True)
        for f in FORMS:
            survey  = f['survey']()
            choices = f['choices']()
            wb = _wb(f['id'], f['title'], survey, choices)
            path = os.path.join(out, f['file'])
            wb.save(path)
            self.stdout.write(self.style.SUCCESS(
                f"  OK  {f['file']:35s}  {len(survey)} rows  id: {f['id']}"))
        self.stdout.write(f'\nWritten to {os.path.abspath(out)}/')
