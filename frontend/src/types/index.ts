// Mirrors backend DRF serializers. Keep in sync with the corresponding *.py files.

export type Organisation = 'CIPRB' | 'UNFPA' | 'PHD' | 'Bondhu'
export type Role = 'super_admin' | 'manager' | 'developer'
export type FormType = 'mpdsr' | 'fistula' | 'activity' | 'baseline'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface User {
  id: string
  email: string
  full_name: string
  first_name?: string
  last_name?: string
  organisation: Organisation
  role: Role
  date_joined: string
}

export interface AdminUser extends User {
  username: string
  is_active: boolean
  last_login: string | null
}

export interface LoginResponse {
  requires_2fa: boolean
  totp_enrolled?: boolean
  user: User
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface KPIs {
  submissions_this_month: number
  submissions_pending: number
  active_workers: number
  fistula_cases_this_month: number
  mpdsr_cases_this_month: number
  previous_month_submissions: number
  mom_change_percent: number
  target_attainment: number | null
  as_of: string
}

export interface MonthlyRow {
  month: number
  month_name: string
  mpdsr: number
  fistula: number
  activity: number
  baseline: number
}

export interface MonthlyResponse {
  year: number
  months: MonthlyRow[]
}

export interface ActivityItem {
  id: string
  form_type: FormType
  form_type_display: string
  partner: string
  worker_name: string
  district: string
  submitted_at: string
  time_ago: string
}

export interface CentresResponse {
  month: string
  districts: { district: string; count: number; rank: number }[]
}

export interface PartnerKPIs {
  submissions_this_month: number
  pending: number
  active_workers: number
  fistula_cases: number
  mpdsr_cases: number
}
export type PartnerSummary = Record<'PHD' | 'Bondhu', PartnerKPIs>

export interface MapPoint {
  id: string
  lat: number
  lng: number
  form_type: FormType
  partner: string
  district: string
  submitted_at: string
}

export interface Submission {
  id: string
  kobo_id: string
  form_type: FormType
  form_type_display: string
  partner: string
  worker_name: string
  district: string
  region: string
  latitude: number | null
  longitude: number | null
  submitted_at: string
  received_at: string
  status: SubmissionStatus
  status_display: string
  reviewed_by: User | null
  reviewed_at: string | null
  rejection_reason: string
}

export interface SubmissionDetail extends Submission {
  raw_data: Record<string, unknown>
}

export type FistulaStatus =
  | 'identified'
  | 'action_required'
  | 'followup_pending'
  | 'referral_completed'

export interface FistulaCase {
  id: string
  case_hash: string
  partner: string
  district: string
  region: string
  date_identified: string
  patient_name: string
  patient_id_number: string
  age: number | null
  status: FistulaStatus
  status_display: string
  referral_status: string
  follow_up_date: string | null
  is_overdue: boolean
  latitude: number | null
  longitude: number | null
  notes: string
  created_at: string
  updated_at: string
}

export type MPDSRStatus =
  | 'reported'
  | 'under_review'
  | 'committee_review'
  | 'action_plan_drafted'
  | 'closed'
export type DeathType = 'maternal' | 'perinatal'

export type PlaceOfDeath = 'facility' | 'home' | 'in_transit'

export interface AuditEntry {
  timestamp: string
  user: string
  action: string
  notes?: string
}

export interface MPDSRCase {
  id: string
  case_hash: string
  partner: string
  district: string
  region: string
  date_of_death: string
  death_type: DeathType
  death_type_display: string
  cause_of_death: string
  place_of_death: PlaceOfDeath
  facility_name: string
  age_years: number | null
  status: MPDSRStatus
  status_display: string
  committee_date: string | null
  action_plan: string
  notes: string
  is_overdue_committee: boolean
  audit_trail: AuditEntry[]
  latitude: number | null
  longitude: number | null
  created_at: string
  updated_at: string
}

export interface MonthlyTarget {
  id: string
  partner: string
  form_type: FormType
  year: number
  month: number
  target: number
  created_at: string
  updated_at: string
}

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Alert {
  id: string
  partner: string
  alert_type: string
  alert_type_display: string
  severity: AlertSeverity
  severity_display: string
  title: string
  message: string
  acknowledged: boolean
  acknowledged_at: string | null
  created_at: string
}

export interface ForecastPoint {
  year: number
  month: number
  actual?: number
  forecast?: number
}

export interface ForecastResponse {
  partner: string
  form_type: FormType
  history: ForecastPoint[]
  attainment_percent: number | null
}

export type ReportFormat = 'pdf' | 'docx' | 'pptx'
export type ReportType = 'monthly_summary' | 'one_pager' | 'newsletter'

export interface Report {
  id: string
  report_type: ReportType
  report_type_display: string
  format: ReportFormat
  format_display: string
  partner: string
  year: number
  month: number
  title: string
  narrative: string
  file: string | null
  generated_by: string | null
  created_at: string
}

export type SurveyType = 'baseline' | 'endline'

export interface BaselineSurvey {
  id: string
  partner: string
  district: string
  region: string
  survey_type: SurveyType
  survey_type_display: string
  participant_code: string
  date_conducted: string
  is_duplicate: boolean
  duplicate_of: string | null
  created_at: string
  updated_at: string
}

export type ParticipantRole = 'community_worker' | 'supervisor' | 'health_staff' | 'other'

export interface TrainingAttendance {
  id: string
  participant_name: string
  role: ParticipantRole
  role_display: string
  attended: boolean
  notes: string
}

export interface TrainingSession {
  id: string
  partner: string
  district: string
  region: string
  topic: string
  facilitator: string
  date: string
  duration_hours: number | null
  expected_participants: number
  actual_participants: number
  attendance_rate: number | null
  notes: string
  attendances: TrainingAttendance[]
  created_at: string
  updated_at: string
}
