/**
 * Bandhu submission-readout labels for the Manager Approvals "What was
 * submitted" card.
 *
 * Bandhu's Kobo field names are prefixed per tool (pr_ = Patient Record F-05,
 * htc_ = HTC F-06, or_ = Daily Outreach F-04, …). The generic readout strips
 * "_" and title-cases, which turns `pr_tg` into the meaningless "Pr tg". This
 * helper instead (a) groups each field under its source tool and (b) humanises
 * the leaf with the project's real abbreviations expanded (STI, HIV, TG, IEC,
 * ART, GBV, …). Nothing is invented — labels are derived from the tool columns.
 */

// prefix → human group title (source tool). Order matters: first match wins.
const PREFIX_GROUPS: [string, string][] = [
  ['log_', 'Wellness Logbook (F-01)'],
  ['pr_',  'Patient Record (F-05)'],
  ['htc_', 'HTC Register (F-06)'],
  ['gbv_', 'GBV Register (F-02)'],
  ['mh_',  'Mental Health Counseling (F-03)'],
  ['cn_',  'Daily Counseling'],
  ['rf_',  'Referral Register'],
  ['hv_',  'HIV Identified (F-08)'],
  ['or_',  'Daily Outreach (F-04)'],
  ['mc_',  'Mobile Health Camp (F-10)'],
  ['at_',  'Attendance (F-11)'],
  ['ev_',  'Event Report (F-12)'],
  ['st_',  'Stock Register (F-13)'],
  ['eb_',  'e-Billboard (F-14)'],
]

// tokens that should render upper-cased (programme abbreviations)
const UPPER = new Set([
  'sti', 'hiv', 'tg', 'gh', 'iec', 'bcc', 'art', 'gbv', 'fp', 'htc',
  'hts', 'psd', 'mhpss', 'kp', 'uid', 'dic', 'tb', 'id', 'mh',
])

function humanise(leaf: string): string {
  const words = leaf.split('_').filter(Boolean)
  if (words.length === 0) return leaf
  const out = words.map((w) =>
    UPPER.has(w.toLowerCase())
      ? w.toUpperCase()
      : w.charAt(0).toUpperCase() + w.slice(1),
  )
  return out.join(' ')
}

/**
 * Resolve a Bandhu field key to its readout label + group, or null if the key
 * isn't a Bandhu field (caller falls back to the generic humaniser).
 */
export function bandhuField(key: string): { label: string; group: string } | null {
  if (key === 'record_type') return { label: 'Record type', group: 'Submission' }
  for (const [prefix, group] of PREFIX_GROUPS) {
    if (key.startsWith(prefix)) {
      return { label: humanise(key.slice(prefix.length)), group }
    }
  }
  return null
}

/**
 * True when a submission belongs to Bandhu — accepts either the organisation
 * ("Bandhu") or a Bandhu form slug ("bandhu_service_log_v1").
 */
export function isBandhuForm(orgOrForm?: string): boolean {
  return !!orgOrForm && (orgOrForm === 'Bandhu' || orgOrForm.startsWith('bandhu_'))
}

// ─── Value decoding ───────────────────────────────────────────────────────────
// Kobo stores coded answers (TG="03", referral="htc_hts sti_kp"). A reviewer
// can't approve what they can't read, so decode the known coded values to their
// real labels for the submission readout. Unknown values pass through unchanged.

const TG_CODES: Record<string, string> = {
  '01': 'MSM', '02': 'MSW', '03': 'FSW', '04': 'EVA',
  '05': 'TG / Hijra', '06': 'Others',
}

const RECORD_TYPES: Record<string, string> = {
  patient_record: 'Patient Record (F-05)', htc: 'HTC Register (F-06)',
  gbv: 'GBV Register (F-02)', mh_counseling: 'Mental Health Counselling (F-03)',
  counseling_daily: 'Daily Counselling', referral: 'Referral',
  hiv_identified: 'HIV Identified (F-08)', wellness_logbook: 'Wellness Logbook (F-01)',
}

const REFERRAL_CODES: Record<string, string> = {
  tb: 'TB', sti_kp: 'STI (KP clinic)', general_health: 'General health',
  htc_hts: 'HIV testing (HTC/HTS)', mental_health: 'Mental health',
  gbv: 'GBV', fp: 'Family planning',
}

/**
 * Decode a coded Bandhu field VALUE to a readable label, given the leaf field
 * key (e.g. 'pr_tg', 'record_type', 'pr_referral'). Returns the value unchanged
 * when no decode rule applies, so it is always safe to wrap.
 */
export function decodeBandhuValue(key: string, value: any): any {
  if (value === null || value === undefined || value === '') return value
  const v = String(value).trim()
  if (key === 'record_type') return RECORD_TYPES[v] || value
  // Target-group code fields: pr_tg, htc_tg, hv_tg, mc_tg, …
  if (/(^|_)tg$/.test(key) || key === 'target_group') {
    return TG_CODES[v] ? `${TG_CODES[v]} (${v})` : value
  }
  // Referral select_multiple — Kobo joins selected codes with spaces.
  if (key === 'pr_referral' || key.endsWith('_referral') || key.endsWith('referral')) {
    const labels = v.split(/\s+/).filter(Boolean).map((c) => REFERRAL_CODES[c] || c)
    return labels.length ? labels.join(', ') : value
  }
  return value
}
