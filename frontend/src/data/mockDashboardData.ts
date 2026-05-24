/**
 * ⚠️  MOCK DATA — SAFE TO DELETE
 *
 * This file contains illustrative demo data for the PHD and Bondhu dashboards.
 * It is used when the programs API returns zero submissions (i.e. no real data yet).
 *
 * When real field submissions start flowing in, delete this entire file and
 * remove the mockDashboardData import from OrgDashboard.tsx.
 *
 * Numbers are consistent with a UNFPA SRHR programme operating at typical
 * field scale in Bangladesh (CPE 2026 reference context).
 */

// ─── Type mirrors ────────────────────────────────────────────────────────────

export interface MockProgramsSummary {
  partner: string
  year: number
  month: number
  total: number
  prev_total: number
  mom_change: number
  categories: { Clinical: number; Community: number; Operations: number }
  counts: Record<string, { count: number; label: string; label_bn: string; category: string }>
  monthly_trend: Array<{
    month: number
    year: number
    month_name: string
    clinical: number
    community: number
    operations: number
    total: number
  }>
  top_forms: Array<{ key: string; count: number; label: string; label_bn: string; category: string }>
}

export interface MockCentresResponse {
  month: string
  districts: Array<{ district: string; count: number; rank: number }>
}

export interface MockPartnerKPIs {
  submissions_this_month: number
  pending: number
  active_workers: number
  fistula_cases: number
  mpdsr_cases: number
}

// ─── PHD ─────────────────────────────────────────────────────────────────────
// Focus: maternal health, ANC, MPDSR, fistula, community outreach
// Areas: Cox's Bazar (Rohingya + host community), Chattogram, Sylhet

const PHD_COUNTS: MockProgramsSummary['counts'] = {
  // Clinical
  clinic_visit:       { count: 89,  label: 'Clinic Visits',         label_bn: 'ক্লিনিক পরিদর্শন',    category: 'Clinical'   },
  antenatal_card:     { count: 67,  label: 'Antenatal Cards',       label_bn: 'প্রসব পূর্ব যত্ন',    category: 'Clinical'   },  // PHD only
  hiv_sti_test:       { count: 24,  label: 'HIV/STI Tests',         label_bn: 'এইচআইভি পরীক্ষা',     category: 'Clinical'   },
  htc_counselling:    { count: 18,  label: 'HTC Counselling',       label_bn: 'এইচটিসি পরামর্শ',     category: 'Clinical'   },
  mh_screening:       { count: 15,  label: 'MH Screenings',         label_bn: 'মানসিক স্বাস্থ্য',    category: 'Clinical'   },
  adr_record:         { count: 8,   label: 'ADR Records',           label_bn: 'পার্শ্বপ্রতিক্রিয়া', category: 'Clinical'   },
  autoclave_log:      { count: 4,   label: 'Autoclave Logs',        label_bn: 'অটোক্লেভ লগ',         category: 'Clinical'   },
  // Community
  outreach_session:   { count: 45,  label: 'Outreach Sessions',     label_bn: 'আউটরিচ সেশন',         category: 'Community'  },
  group_education:    { count: 28,  label: 'Group Education',       label_bn: 'গ্রুপ শিক্ষা',        category: 'Community'  },
  individual_counselling: { count: 32,  label: 'Individual Counselling',label_bn: 'ব্যক্তিগত পরামর্শ',   category: 'Community'  },
  referral:           { count: 21,  label: 'Referrals',             label_bn: 'রেফারেল',              category: 'Community'  },
  gbv_case:           { count: 9,   label: 'GBV Cases',             label_bn: 'জিবিভি কেস',          category: 'Community'  },
  // Operations (mobile_camp is PHD only)
  training_event:     { count: 3,   label: 'Training Events',       label_bn: 'প্রশিক্ষণ',           category: 'Operations' },
  coord_meeting:      { count: 4,   label: 'Coord. Meetings',       label_bn: 'সমন্বয় সভা',         category: 'Operations' },
  mobile_camp:        { count: 2,   label: 'Mobile Health Camps',   label_bn: 'মোবাইল ক্যাম্প',     category: 'Operations' },
}

export const MOCK_PHD: MockProgramsSummary = {
  partner: 'PHD',
  year: 2026,
  month: 5,
  total: 369,
  prev_total: 353,
  mom_change: 4.5,
  categories: { Clinical: 225, Community: 135, Operations: 9 },
  counts: PHD_COUNTS,
  monthly_trend: [
    { month: 12, year: 2025, month_name: 'Dec', clinical: 156, community:  70, operations:  9, total: 235 },
    { month:  1, year: 2026, month_name: 'Jan', clinical: 178, community:  78, operations: 11, total: 267 },
    { month:  2, year: 2026, month_name: 'Feb', clinical: 189, community:  90, operations: 13, total: 292 },
    { month:  3, year: 2026, month_name: 'Mar', clinical: 201, community:  99, operations: 15, total: 315 },
    { month:  4, year: 2026, month_name: 'Apr', clinical: 216, community: 128, operations:  9, total: 353 },
    { month:  5, year: 2026, month_name: 'May', clinical: 225, community: 135, operations:  9, total: 369 },
  ],
  top_forms: [
    { key: 'clinic_visit',       count: 89,  label: 'Clinic Visits',          label_bn: 'ক্লিনিক পরিদর্শন',    category: 'Clinical'   },
    { key: 'antenatal_card',     count: 67,  label: 'Antenatal Cards',        label_bn: 'প্রসব পূর্ব যত্ন',    category: 'Clinical'   },
    { key: 'outreach_session',   count: 45,  label: 'Outreach Sessions',      label_bn: 'আউটরিচ সেশন',         category: 'Community'  },
    { key: 'individual_counselling', count: 32,  label: 'Individual Counselling', label_bn: 'ব্যক্তিগত পরামর্শ',   category: 'Community'  },
    { key: 'group_education',    count: 28,  label: 'Group Education',        label_bn: 'গ্রুপ শিক্ষা',        category: 'Community'  },
    { key: 'hiv_sti_test',       count: 24,  label: 'HIV/STI Tests',          label_bn: 'এইচআইভি পরীক্ষা',     category: 'Clinical'   },
    { key: 'referral',           count: 21,  label: 'Referrals',              label_bn: 'রেফারেল',              category: 'Community'  },
    { key: 'htc_counselling',    count: 18,  label: 'HTC Counselling',        label_bn: 'এইচটিসি পরামর্শ',     category: 'Clinical'   },
  ],
}

export const MOCK_PHD_KPIS: MockPartnerKPIs = {
  submissions_this_month: 369,
  pending: 12,
  active_workers: 24,
  fistula_cases: 15,
  mpdsr_cases: 8,
}

export const MOCK_PHD_CENTRES: MockCentresResponse = {
  month: 'May 2026',
  districts: [
    { district: "Cox's Bazar", count: 156, rank: 1 },
    { district: 'Ukhiya',      count: 89,  rank: 2 },
    { district: 'Chattogram',  count: 78,  rank: 3 },
    { district: 'Sylhet',      count: 56,  rank: 4 },
    { district: 'Teknaf',      count: 46,  rank: 5 },
  ],
}

// ─── Bondhu: Bondhu Social Welfare Society ────────────────────────────────────
// Focus: key populations (FSW, transgender, MSM), HIV/STI, GBV, urban outreach
// Areas: Dhaka, Chittagong, Sylhet, Narayanganj, Comilla

const BONDHU_COUNTS: MockProgramsSummary['counts'] = {
  // Clinical (no antenatal_card — PHD only)
  hiv_sti_test:       { count: 203, label: 'HIV/STI Tests',         label_bn: 'এইচআইভি পরীক্ষা',     category: 'Clinical'   },
  clinic_visit:       { count: 156, label: 'Clinic Visits',         label_bn: 'ক্লিনিক পরিদর্শন',    category: 'Clinical'   },
  htc_counselling:    { count: 112, label: 'HTC Counselling',       label_bn: 'এইচটিসি পরামর্শ',     category: 'Clinical'   },
  mh_screening:       { count: 45,  label: 'MH Screenings',         label_bn: 'মানসিক স্বাস্থ্য',    category: 'Clinical'   },
  adr_record:         { count: 14,  label: 'ADR Records',           label_bn: 'পার্শ্বপ্রতিক্রিয়া', category: 'Clinical'   },
  autoclave_log:      { count: 7,   label: 'Autoclave Logs',        label_bn: 'অটোক্লেভ লগ',         category: 'Clinical'   },
  // Community (hygiene_kit is Bondhu only; no mobile_camp — PHD only)
  outreach_session:   { count: 134, label: 'Outreach Sessions',     label_bn: 'আউটরিচ সেশন',         category: 'Community'  },
  individual_counselling: { count: 189, label: 'Individual Counselling',label_bn: 'ব্যক্তিগত পরামর্শ',   category: 'Community'  },
  group_education:    { count: 78,  label: 'Group Education',       label_bn: 'গ্রুপ শিক্ষা',        category: 'Community'  },
  referral:           { count: 56,  label: 'Referrals',             label_bn: 'রেফারেল',              category: 'Community'  },
  gbv_case:           { count: 38,  label: 'GBV Cases',             label_bn: 'জিবিভি কেস',          category: 'Community'  },
  hygiene_kit:        { count: 112, label: 'Hygiene Kits',          label_bn: 'হাইজিন কিট',          category: 'Community'  },  // Bondhu only
  // Operations
  training_event:     { count: 5,   label: 'Training Events',       label_bn: 'প্রশিক্ষণ',           category: 'Operations' },
  coord_meeting:      { count: 4,   label: 'Coord. Meetings',       label_bn: 'সমন্বয় সভা',         category: 'Operations' },
}

export const MOCK_BONDHU: MockProgramsSummary = {
  partner: 'Bondhu',
  year: 2026,
  month: 5,
  total: 1156,
  prev_total: 1074,
  mom_change: 7.6,
  categories: { Clinical: 537, Community: 607, Operations: 9 },  // No Operations mobile_camp; 537 = 555-18
  counts: BONDHU_COUNTS,
  monthly_trend: [
    { month: 12, year: 2025, month_name: 'Dec', clinical: 285, community: 234, operations: 14, total: 533  },
    { month:  1, year: 2026, month_name: 'Jan', clinical: 307, community: 256, operations: 16, total: 579  },
    { month:  2, year: 2026, month_name: 'Feb', clinical: 328, community: 278, operations: 17, total: 623  },
    { month:  3, year: 2026, month_name: 'Mar', clinical: 350, community: 302, operations: 18, total: 670  },
    { month:  4, year: 2026, month_name: 'Apr', clinical: 497, community: 556, operations: 21, total: 1074 },
    { month:  5, year: 2026, month_name: 'May', clinical: 537, community: 607, operations:  9, total: 1156 },
  ],
  top_forms: [
    { key: 'hiv_sti_test',       count: 203, label: 'HIV/STI Tests',          label_bn: 'এইচআইভি পরীক্ষা',     category: 'Clinical'  },
    { key: 'individual_counselling', count: 189, label: 'Individual Counselling', label_bn: 'ব্যক্তিগত পরামর্শ',   category: 'Community' },
    { key: 'clinic_visit',       count: 156, label: 'Clinic Visits',          label_bn: 'ক্লিনিক পরিদর্শন',    category: 'Clinical'  },
    { key: 'outreach_session',   count: 134, label: 'Outreach Sessions',      label_bn: 'আউটরিচ সেশন',         category: 'Community' },
    { key: 'htc_counselling',    count: 112, label: 'HTC Counselling',        label_bn: 'এইচটিসি পরামর্শ',     category: 'Clinical'  },
    { key: 'hygiene_kit',        count: 112, label: 'Hygiene Kits',           label_bn: 'হাইজিন কিট',          category: 'Community' },
    { key: 'group_education',    count: 78,  label: 'Group Education',        label_bn: 'গ্রুপ শিক্ষা',        category: 'Community' },
    { key: 'gbv_case',           count: 38,  label: 'GBV Cases',              label_bn: 'জিবিভি কেস',          category: 'Community' },
  ],
}

export const MOCK_BONDHU_KPIS: MockPartnerKPIs = {
  submissions_this_month: 1156,
  pending: 18,
  active_workers: 31,
  fistula_cases: 7,
  mpdsr_cases: 2,
}

export const MOCK_BONDHU_CENTRES: MockCentresResponse = {
  month: 'May 2026',
  districts: [
    { district: 'Dhaka',       count: 312, rank: 1 },
    { district: 'Chittagong',  count: 198, rank: 2 },
    { district: 'Sylhet',      count: 145, rank: 3 },
    { district: 'Narayanganj', count: 89,  rank: 4 },
    { district: 'Comilla',     count: 67,  rank: 5 },
    { district: 'Khulna',      count: 45,  rank: 6 },
  ],
}

// ─── Convenience lookup ───────────────────────────────────────────────────────

export const MOCK_PROGRAMS: Record<'PHD' | 'Bondhu', MockProgramsSummary> = {
  PHD: MOCK_PHD,
  Bondhu: MOCK_BONDHU,
}

export const MOCK_KPIS: Record<'PHD' | 'Bondhu', MockPartnerKPIs> = {
  PHD: MOCK_PHD_KPIS,
  Bondhu: MOCK_BONDHU_KPIS,
}

export const MOCK_CENTRES: Record<'PHD' | 'Bondhu', MockCentresResponse> = {
  PHD: MOCK_PHD_CENTRES,
  Bondhu: MOCK_BONDHU_CENTRES,
}
