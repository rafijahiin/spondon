/**
 * MPDSR visualizations per Animesh's spec:
 *
 *   1. NotifyVsReview — bar chart of notified vs reviewed counts, split
 *      Maternal Death (MD) / Neonatal Death (ND).
 *   2. CauseBreakdown — % breakdown of PPH / Eclampsia / Sepsis / Obstructed
 *      Labour / Other, with tab switcher: Cumulative · SIDA · GAC · CP.
 *      (The SIDA/GAC/CP filters require Sayeed's district mapping;
 *       structure is in place so they activate the moment that mapping arrives.)
 *   3. ResponsePlanTracker — planned interventions vs executed, per district.
 *      (Placeholder structure; populates once the MPDSR Action Plan
 *       Excel is ingested.)
 *
 * Each block answers a programmatic question in one glance — no Excel-like
 * tables, no raw-number sprawl.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
  PieChart, Pie,
} from 'recharts'
import { Info, Database, AlertTriangle } from 'lucide-react'
import { api } from '@/api/client'
import { SourceChip } from '@/components/ui/SourceChip'
import type { MPDSRCase } from '@/types/index'
import { BarBreakdown, DonutBreakdown, Histogram, StatTile } from './IndicatorCharts'

// ─── Aggregates fetched from /api/mpdsr/aggregates/ ─────────────────────────

interface FacilityTotals {
  cdn_md?: number; cdn_nd?: number; cdn_sb?: number
  fdn_md: number; fdn_nd: number; fdn_sb: number
  fdr_md: number; fdr_nd: number; fdr_sb: number
}

interface LevelSplit { community: number; facility: number }
interface NotificationByLevel { md: LevelSplit; nd: LevelSplit; sb: LevelSplit }

interface ActionItem {
  section?: string; action?: string; responsible?: string; timeline?: string
  indicator?: string; milestone?: string; considerations?: string; status?: string
}

interface ActionPlanSummary {
  district: string; level: 'DM' | 'UM'
  place_of_meeting: string; meeting_date: string
  participants: number | null
  actions?: ActionItem[]
  meetings_planned: number; activities_planned: number; activities_implemented: number
  completion_pct: number
  source?: string
}

interface DistrictDenominator {
  district: string
  project_deaths_md: number | null
  project_deaths_nd: number | null
  project_deaths_sb: number | null
}

interface ReviewCounts {
  /** Community Maternal Death Reviewed (MPDSR Form 1 / verbal autopsy). */
  va_md?: number
  /** Community Neonatal Death Reviewed (MPDSR Form 2). */
  va_nd?: number
  /** Social Autopsy (Maternal Death). */
  sa_md?: number
  /** Facility Maternal Death Reviewed (MPDSR Form 4). */
  f4?: number
  /** Facility Neonatal Death Reviewed (MPDSR Form 5). */
  f5?: number
  /** F1 + F2 notification rows summed — denominator for review rates. */
  notified_md?: number
  notified_nd?: number
  /** Per-sub-form raw counts also returned for transparency. */
  f1?: number
  f2?: number
}

interface AggregatesPayload {
  denominators: DistrictDenominator[]
  facility_counts: any[]
  facility_totals: FacilityTotals
  notification_by_level?: NotificationByLevel
  action_plan_summaries: ActionPlanSummary[]
  totals: { mpdsr_cases: number; fistula_corner_cases: number; fistula_campaign_visits: number }
  review_counts?: ReviewCounts
  // CIPRB Phase 3 — the 11 MPDSR major indicators (per-case breakdowns).
  indicators?: Record<string, Record<string, number>>
  // Facility (Form 04) deep-dive — admission→death interval + review
  // committee progress. Only the facility form carries these.
  facility?: {
    total: number
    admission_to_death: Record<string, number>
    review_status: Record<string, number>
    action_plan_coverage: { with_plan: number; without_plan: number }
  }
  // Phase 2 gap charts — forms that feed the DB but had no chart yet.
  // Neonatal deaths (CIPRB 3 community + CIPRB 5 facility).
  neonatal?: {
    total: number
    cause_of_death: Record<string, number>
    by_level: { community: number; facility: number }
  }
  // Death notification slips (CIPRB 7 + CIPRB 8).
  notifications?: {
    total: number
    by_kind: Record<string, number>
    by_level: { community: number; facility: number }
    by_district: Record<string, number>
  }
  // Social Autopsy (CIPRB 6) — maternal-death re-review.
  social_autopsy?: {
    total: number
    place_of_death: Record<string, number>
  }
}

function useAggregates(
  period?: { from: string; to: string },
  districts?: readonly string[] | null,
): AggregatesPayload | null {
  const [data, setData] = useState<AggregatesPayload | null>(null)
  const periodFrom = period?.from
  const periodTo = period?.to
  // Donor filter (GAC / SIDA / All) must reach the aggregate endpoint too,
  // or every aggregate-derived visual (reporting rate, facility deep-dive,
  // 11 indicators, response plan) would silently show ALL-donor totals while
  // the donor pill is set — the bug the audit surfaced. The endpoint already
  // honours ?districts= via apply_donor().
  const districtsKey = districts ? districts.join(',') : ''
  useEffect(() => {
    let cancelled = false
    const params: Record<string, string> = {}
    if (periodFrom) params.from = periodFrom
    if (periodTo) params.to = periodTo
    if (districtsKey) params.districts = districtsKey
    api.get<AggregatesPayload>('/mpdsr/aggregates/', { params })
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { /* leave null; visualisations fall back to live-only */ })
    return () => { cancelled = true }
  }, [periodFrom, periodTo, districtsKey])
  return data
}

// UNFPA branding — orange across the board.
const CIPRB_BLUE = '#F96000'
const CIPRB_BLUE_SOFT = 'rgba(249,96,0,0.10)'
const CIPRB_BLUE_LIGHT = '#FB904D'   // UNFPA bright (lighter shade for secondary bars)

// ─── 1. Notification vs Review bar chart ─────────────────────────────────────

interface NotifyVsReviewData {
  notifiedMD: number
  reviewedMD: number
  notifiedND: number
  reviewedND: number
}

// A case is "reviewed" once it has progressed past REPORTED to under_review,
// committee_review, action_plan_drafted, or closed.
const REVIEWED_STATUSES = new Set(['under_review', 'committee_review', 'action_plan_drafted', 'closed'])

function computeNotifyVsReview(cases: MPDSRCase[]): NotifyVsReviewData {
  let nM = 0, rM = 0, nN = 0, rN = 0
  for (const c of cases) {
    const isMaternal = c.death_type === 'maternal'
    if (isMaternal) {
      nM++
      if (REVIEWED_STATUSES.has(c.status)) rM++
    } else {
      nN++
      if (REVIEWED_STATUSES.has(c.status)) rN++
    }
  }
  return { notifiedMD: nM, reviewedMD: rM, notifiedND: nN, reviewedND: rN }
}

function NotifyVsReview({
  cases, totals, denominators, reviewCounts, notificationByLevel,
}: {
  cases: MPDSRCase[]
  totals: FacilityTotals | null
  denominators: DistrictDenominator[]
  reviewCounts: ReviewCounts | null
  notificationByLevel: NotificationByLevel | null
}) {
  const { t } = useTranslation()
  const live = useMemo(() => computeNotifyVsReview(cases), [cases])

  // Prefer facility-level aggregate totals from Sayeed's Excel ingest when
  // available — gives the real programme-wide numbers, not just live Kobo
  // submissions. Falls back to live-only counts if the import hasn't run.
  const d = totals ? {
    notifiedMD: totals.fdn_md, reviewedMD: totals.fdr_md,
    notifiedND: totals.fdn_nd, reviewedND: totals.fdr_nd,
    notifiedSB: totals.fdn_sb,
  } : { ...live, notifiedSB: 0 }

  // Estimated maternal/neonatal/stillbirth deaths across all districts —
  // the denominator Animesh asked for to compute the REPORTING RATE
  // (notified / estimated) per Sayeed's 'Project Deaths 2026' column.
  const estimatedMD = denominators.reduce((s, x) => s + (x.project_deaths_md ?? 0), 0)
  const estimatedND = denominators.reduce((s, x) => s + (x.project_deaths_nd ?? 0), 0)
  const estimatedSB = denominators.reduce((s, x) => s + (x.project_deaths_sb ?? 0), 0)

  const chartData = [
    { category: t('mpdsrViz.maternalDeaths'), notified: d.notifiedMD, reviewed: d.reviewedMD },
    { category: t('mpdsrViz.neonatalDeaths'), notified: d.notifiedND, reviewed: d.reviewedND },
  ]

  const reviewRateMD = d.notifiedMD > 0 ? (d.reviewedMD / d.notifiedMD) * 100 : 0
  const reviewRateND = d.notifiedND > 0 ? (d.reviewedND / d.notifiedND) * 100 : 0
  const reportingRateMD = estimatedMD > 0 ? (d.notifiedMD / estimatedMD) * 100 : null
  const reportingRateND = estimatedND > 0 ? (d.notifiedND / estimatedND) * 100 : null
  const reportingRateSB = estimatedSB > 0 ? (d.notifiedSB / estimatedSB) * 100 : null

  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.notifyKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.notifyTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.notifySub')}
          </p>
        </div>
        <SourceChip>CIPRB 2 + CIPRB 3</SourceChip>
      </div>

      <div className="card" style={{ padding: 24 }}>
        {/* Reporting-rate tiles — MD / ND / SB (notified ÷ estimated).
            Denominators from Sayeed's Project Deaths 2026. */}
        {(() => {
          const FORMULA = (
            'MD = (Live Birth × 136) / 100,000\n' +
            'ND = (Live Birth × 20) / 1,000\n' +
            'SB = (Live Birth × 21) / 1,000\n\n' +
            'Source: MPDSR M&E Framework · Provided by CIPRB.\n' +
            'Decimals come from per-upazila Live Birth counts × ratio; rounded for display.'
          )
          const rateTile = (label: string, rate: number | null, reported: number, estimated: number) => (
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#AE4300', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {rate !== null ? (rate > 100 ? '100%+' : `${rate.toFixed(0)}%`) : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {reported.toLocaleString()} reported of {Math.round(estimated).toLocaleString()} estimated
                <span title={FORMULA} aria-label="Show denominator formula" style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 14, height: 14, borderRadius: 999, background: 'var(--surface-3)',
                  color: 'var(--muted)', fontSize: 9, fontWeight: 700, cursor: 'help',
                  border: '1px solid var(--hair)',
                }}>i</span>
              </div>
            </div>
          )
          return (reportingRateMD !== null || reportingRateND !== null || reportingRateSB !== null) ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
              marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid var(--hair)',
            }}>
              {rateTile('MATERNAL DEATH REPORTING RATE', reportingRateMD, d.notifiedMD, estimatedMD)}
              {rateTile('NEONATAL DEATH REPORTING RATE', reportingRateND, d.notifiedND, estimatedND)}
              {rateTile('STILLBIRTH REPORTING RATE', reportingRateSB, d.notifiedSB, estimatedSB)}
            </div>
          ) : null
        })()}

        {/* Notification by level — Animesh: "separated by Community / Facility".
            CDN = community death notification, FDN = facility death notification. */}
        {notificationByLevel && (
          <div style={{
            marginBottom: 18, paddingBottom: 18, borderBottom: '1px solid var(--hair)',
          }}>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 10 }}>
              NOTIFICATIONS BY LEVEL · COMMUNITY DEATH NOTIFICATION (CDN) vs FACILITY DEATH NOTIFICATION (FDN)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
              {([['Maternal Death (MD)', notificationByLevel.md], ['Neonatal Death (ND)', notificationByLevel.nd], ['Stillbirth (SB)', notificationByLevel.sb]] as const).map(([lbl, lv]) => (
                <div key={lbl}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>{lbl}</div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: CIPRB_BLUE, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{lv.community}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>Community</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#C44E00', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{lv.facility}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>Facility</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MPDSR review breakdown — 5 tiles, full names per CIPRB:
              · Community Maternal Death Reviewed (MPDSR Form 1)
              · Community Neonatal Death Reviewed (MPDSR Form 2)
              · Facility Maternal Death Reviewed  (MPDSR Form 4)
              · Facility Neonatal Death Reviewed  (MPDSR Form 5)
              · Social Autopsy (Maternal Death)
            MD tiles use MD-notified as the denominator; ND tiles use
            ND-notified. SA shares the MD denominator. */}
        {(() => {
          const baseMD = (reviewCounts?.notified_md ?? 0) > 0
            ? (reviewCounts!.notified_md as number)
            : d.notifiedMD
          const baseND = (reviewCounts?.notified_nd ?? 0) > 0
            ? (reviewCounts!.notified_nd as number)
            : d.notifiedND
          const cmd = reviewCounts?.va_md ?? 0                              // Form 1
          const cnd = reviewCounts?.va_nd ?? 0                              // Form 2
          const fmd = reviewCounts?.f4 ?? d.reviewedMD                      // Form 4
          const fnd = reviewCounts?.f5 ?? d.reviewedND                      // Form 5
          const sa  = reviewCounts?.sa_md ?? 0                              // Social Autopsy
          const pct = (n: number, base: number) => base > 0 ? (n / base) * 100 : null
          const tile = (label: string, value: number, pctVal: number | null, base: number, color: string) => (
            <div>
              <div className="mono" style={{
                fontSize: 9.5, color: 'var(--muted)',
                letterSpacing: '0.08em', marginBottom: 4,
                minHeight: 22, lineHeight: 1.2,
              }}>
                {label}
              </div>
              <div style={{
                fontSize: 26, fontWeight: 800, color,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {pctVal !== null ? (pctVal > 100 ? '100%+' : `${pctVal.toFixed(0)}%`) : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {value.toLocaleString()} of {base.toLocaleString()} notified
              </div>
            </div>
          )
          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 18, marginBottom: 24,
            }}>
              {tile(t('mpdsrViz.reviewCommunityMaternal'), cmd, pct(cmd, baseMD), baseMD, CIPRB_BLUE)}
              {tile(t('mpdsrViz.reviewCommunityNeonatal'), cnd, pct(cnd, baseND), baseND, CIPRB_BLUE_LIGHT)}
              {tile(t('mpdsrViz.reviewFacilityMaternal'),  fmd, pct(fmd, baseMD), baseMD, '#C44E00')}
              {tile(t('mpdsrViz.reviewFacilityNeonatal'),  fnd, pct(fnd, baseND), baseND, '#E8881C')}
              {tile(t('mpdsrViz.reviewSocialAutopsy'),     sa,  pct(sa,  baseMD), baseMD, CIPRB_BLUE)}
            </div>
          )
        })()}

        {/* Bar chart */}
        {(d.notifiedMD + d.notifiedND) > 0 ? (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }} barGap={6}>
                <XAxis dataKey="category"
                  tick={{ fontSize: 11.5, fill: 'var(--ink-3)' }}
                  axisLine={{ stroke: 'var(--hair)' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                  axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--hair)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'rgba(249,96,0,0.04)' }}
                />
                <Bar dataKey="notified" name={t('mpdsrViz.notified')} fill={CIPRB_BLUE_LIGHT}
                     radius={[6, 6, 0, 0]} animationDuration={700} />
                <Bar dataKey="reviewed" name={t('mpdsrViz.reviewed')} fill={CIPRB_BLUE}
                     radius={[6, 6, 0, 0]} animationDuration={700} animationBegin={120} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {t('mpdsrViz.barEmpty')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CIPRB_BLUE_LIGHT }} />
            {t('mpdsrViz.notified')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CIPRB_BLUE }} />
            {t('mpdsrViz.reviewed')}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── 2. Cause of Death breakdown (with district-grouping tabs) ───────────────

type DistrictGroup = 'cumulative' | 'sida' | 'gac' | 'cp'

// Labels are translated at render-time via t() — see CauseBreakdown.
const GROUP_TAB_KEYS: DistrictGroup[] = ['cumulative', 'sida', 'gac', 'cp']
const GROUP_LABEL_KEY: Record<DistrictGroup, string> = {
  cumulative: 'mpdsrViz.tabCumulative',
  sida: 'mpdsrViz.tabSida',
  gac: 'mpdsrViz.tabGac',
  cp: 'mpdsrViz.tabCp',
}

// Cause-of-death pie — UNFPA orange tonal scale, all sitting inside the
// brand family. Other stays neutral so it doesn't read as a partner colour.
// GoB ICD-10 cause groupings — per the MPDSR Form 01 PDF Sayed shared
// (2026-06-02). Six buckets cover all 15 maternal-death cause codes:
//
//   haemorrhage         PPH (O72) · APH (O46) · Early Pregnancy (O20) ·
//                        Placenta Previa (O44) · Abruptio (O45) ·
//                        Rupture Uterus (O71)
//   eclampsia           Eclampsia (O15)
//   sepsis              Puerperal Sepsis (O85)
//   obstructed_labour   Obstructed Labour due to malposition (O64)
//   abortion_related    Ectopic (O00) · Failed abortion (O07) ·
//                        Medical abortion (O04)
//   other_direct        Anaesthesia complications (O74, O29) ·
//                        Obstetric Embolism (O88) · Malnutrition (O25) ·
//                        Death from sequel (O97) · everything else
const CAUSE_PALETTE: Record<string, string> = {
  haemorrhage:       '#F96000',  // UNFPA orange (primary)
  eclampsia:         '#C44E00',  // UNFPA deep
  sepsis:            '#FB904D',  // UNFPA bright
  obstructed_labour: '#FDCFB3',  // UNFPA pale
  abortion_related:  '#8B3700',  // UNFPA darker
  other_direct:      'var(--muted-3)',
}

// Map any free-text cause string to one of the 6 buckets. Matches are
// case-insensitive substrings so both ICD code labels and verbose
// English / Bangla cause strings classify cleanly.
function bucketForCause(raw: string): string {
  const c = (raw ?? '').toLowerCase().trim()
  if (!c) return 'other_direct'
  if (c.includes('pph') || c.includes('aph') || c.includes('haemorr') ||
      c.includes('placenta previa') || c.includes('abruptio') ||
      c.includes('rupture')) return 'haemorrhage'
  if (c.includes('eclampsia') || c.includes('hypertens')) return 'eclampsia'
  if (c.includes('sepsis')) return 'sepsis'
  if (c.includes('obstructed') || c.includes('labour') || c.includes('labor'))
    return 'obstructed_labour'
  if (c.includes('abortion') || c.includes('ectopic'))
    return 'abortion_related'
  return 'other_direct'
}

// District groupings per Sayeed (delivered 1 Jun 2026):
//   GAC  — 5 focused intervention districts
//   SIDA — 6 focused intervention districts
//   CP   — the broader Country Programme footprint = all MPDSR districts
//
// Note: Sunamganj sits in BOTH GAC and SIDA (intentional regional overlap
// Sayeed flagged). Multi-set membership is handled naturally — a Sunamganj
// case counts in both tabs.
//
// Matching uses a normalised form (lowercase, alphanumeric only) so
// "Cox's Bazar" / "Coxsbazar" / "Cox Bazar" all collapse to the same key.
const DISTRICT_MAPPING: Record<DistrictGroup, string[] | null> = {
  cumulative: null,    // null = no filter (all districts)
  // Provided by CIPRB (Near Miss tool, June 2026) — these 18 districts are
  // the canonical CIPRB working footprint. GAC and SIDA splits below sit
  // inside this 18-district set.
  gac:  ['Sunamganj', 'Bhola', 'Sherpur', 'Kurigram', 'Khagrachari'],
  sida: ['Noakhali', 'Chandpur', 'Bandarban', 'Patuakhali', 'Barguna'],
  cp:   [
    'Sunamganj', 'Sherpur', 'Bhola', 'Kurigram', 'Gaibandha',
    'Khagrachari', 'Noakhali', 'Patuakhali', 'Sirajganj', 'Barguna',
    'Jamalpur', 'Bagerhat', 'Habiganj', 'Moulavibazar', 'Sylhet',
    'Bandarban', 'Chandpur', 'Rangpur',
  ],
}

function normaliseDistrict(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** A single cause-of-death donut. Used twice side-by-side by
 *  CauseBreakdown — left = Community deaths (MPDSR Form 1),
 *  right = Facility deaths (MPDSR Form 4). */
function CauseDonut({
  cases, title, sub,
}: {
  cases: MPDSRCase[]
  title: string
  sub: string
}) {
  const { t } = useTranslation()
  const counts: Record<string, number> = {}
  for (const c of cases) {
    const k = bucketForCause(c.cause_of_death ?? '')
    counts[k] = (counts[k] ?? 0) + 1
  }
  const total = Object.values(counts).reduce((s, v) => s + v, 0)
  // GoB ICD-10 ordering — most-common first, "other direct" last.
  const causeKeys = ['haemorrhage', 'eclampsia', 'sepsis', 'obstructed_labour', 'abortion_related', 'other_direct']
  const causeLabels: Record<string, string> = {
    haemorrhage:       'Haemorrhage (PPH/APH)',
    eclampsia:         'Eclampsia',
    sepsis:            'Sepsis',
    obstructed_labour: 'Obstructed Labour',
    abortion_related:  'Abortion-related',
    other_direct:      'Other Direct',
  }
  const pieData = causeKeys.map(k => ({
    name: causeLabels[k],
    value: counts[k] ?? 0,
    color: CAUSE_PALETTE[k],
  }))

  return (
    <div className="card" style={{
      padding: 22, flex: '1 1 360px', minWidth: 320,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ marginBottom: 14 }}>
        <h4 style={{
          margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--ink)',
        }}>{title}</h4>
        <div className="mono" style={{
          fontSize: 10.5, color: 'var(--muted)', letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>{sub}</div>
      </div>

      {total > 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          gap: 24, flexWrap: 'wrap', flex: 1,
        }}>
          <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none"
                  startAngle={90} endAngle={-270} animationDuration={800}>
                  {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                </Pie>
                {/* Tooltip lifted above the centre total via wrapperStyle
                    zIndex — the earlier bleed-through was a pure z-order bug,
                    not a dead tooltip. Opaque card so nothing shows through. */}
                <Tooltip
                  wrapperStyle={{ zIndex: 50, outline: 'none' }}
                  contentStyle={{
                    background: 'var(--surface)', border: '1px solid var(--hair)',
                    borderRadius: 8, fontSize: 12, color: 'var(--ink)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                  }}
                  itemStyle={{ color: 'var(--ink)' }}
                  labelStyle={{ color: 'var(--ink)' }}
                  formatter={(value: number, name: string) =>
                    [`${value} (${total ? Math.round((value / total) * 100) : 0}%)`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <span style={{
                fontSize: 28, fontWeight: 800, lineHeight: 1, color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              }}>{total.toLocaleString()}</span>
              <span className="mono" style={{
                fontSize: 9, color: 'var(--muted)', letterSpacing: '0.08em', marginTop: 4,
              }}>{t('mpdsrViz.mdCases')}</span>
            </div>
          </div>
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            fontSize: 12.5, minWidth: 200, flex: 1,
          }}>
            {pieData.map(d => (
              <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--ink-2)' }}>{d.name}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value.toLocaleString()}</b>
                <span className="mute" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>
                  {total ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
          {t('mpdsrViz.causeEmpty')}
        </div>
      )}
    </div>
  )
}

/** Two cause-of-death donuts side-by-side, split by death location:
 *  Community (MPDSR Form 1) vs Facility (MPDSR Form 4). The shared
 *  district-group tabs (Cumulative / SIDA / GAC / CP) filter BOTH.
 *  Per CIPRB correction: "two pie charts are needed — Causes of
 *  Maternal Deaths and Distribution of Causes of Maternal Deaths,
 *  Source: Form 1 & Form 4". */
function CauseBreakdown({ cases }: { cases: MPDSRCase[] }) {
  const { t } = useTranslation()
  const [group, setGroup] = useState<DistrictGroup>('cumulative')

  const filtered = useMemo(() => {
    const allow = DISTRICT_MAPPING[group]
    let pool = cases
    if (allow !== null) {
      if (allow.length === 0) pool = []
      else {
        const set = new Set(allow.map(normaliseDistrict))
        pool = cases.filter(c => set.has(normaliseDistrict(c.district ?? '')))
      }
    }
    // MD-only — cause analysis is maternal-death-specific.
    return pool.filter(c => c.death_type === 'maternal')
  }, [cases, group])

  // Split by SOURCE FORM, not death location: Form 01 (f1) = community
  // review, Form 04 (f4) = facility review (CIPRB spec "Source: Form 1 &
  // Form 4"). Splitting by place_of_death misclassified in-transit
  // community deaths and any facility-form home death.
  const community = filtered.filter(c => c.sub_form_type === 'f1')
  const facility  = filtered.filter(c => c.sub_form_type === 'f4')

  const noCasesInGroup = group !== 'cumulative' && filtered.length === 0

  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.causeKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.causeTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.causeSub')}
          </p>
        </div>
        <SourceChip>CIPRB 2 + CIPRB 4</SourceChip>
      </div>

      {/* Group tabs — filter both donuts at once. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: 5,
        background: 'var(--surface-2)',
        borderRadius: 12,
        border: '1px solid var(--hair)',
        width: 'fit-content',
        marginBottom: 16,
      }} role="tablist">
        {GROUP_TAB_KEYS.map(key => {
          const isActive = group === key
          return (
            <button
              key={key}
              onClick={() => setGroup(key)}
              role="tab"
              aria-selected={isActive}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px',
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#fff' : 'var(--ink-2)',
                background: isActive ? CIPRB_BLUE : 'transparent',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                transitionProperty: 'background-color, color',
                transitionDuration: '180ms',
              }}
            >
              {t(GROUP_LABEL_KEY[key])}
            </button>
          )
        })}
      </div>

      {noCasesInGroup ? (
        <div className="card" style={{ padding: 24 }}>
          <div style={{
            padding: '40px 16px', textAlign: 'center',
            color: 'var(--ink-3)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <Info size={20} style={{ color: CIPRB_BLUE }} />
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink-2)' }}>
              {t('mpdsrViz.groupEmpty')}
            </div>
            <div style={{ fontSize: 12, maxWidth: 480, color: 'var(--muted)', lineHeight: 1.55 }}
              dangerouslySetInnerHTML={{ __html: t('mpdsrViz.groupEmptySub', { group: group.toUpperCase() }) }}
            />
          </div>
        </div>
      ) : (
        // Two donuts, one row. Wraps to stacked on narrow screens.
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <CauseDonut
            cases={community}
            title={t('mpdsrViz.causeCommunityTitle')}
            sub={t('mpdsrViz.causeCommunitySub')}
          />
          <CauseDonut
            cases={facility}
            title={t('mpdsrViz.causeFacilityTitle')}
            sub={t('mpdsrViz.causeFacilitySub')}
          />
        </div>
      )}
    </div>
  )
}

function pascal(k: string): string {
  return k.split('_').map(p => p[0].toUpperCase() + p.slice(1)).join('')
}

// ─── 3. Response Plan Implementation Tracker ─────────────────────────────────

function ResponsePlanTracker({ summaries }: { summaries: ActionPlanSummary[] }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<number | null>(null)
  // Action Plan Progress ingestion is live — rows show per-district
  // planned-vs-executed counts with completion %. Bar colour reflects
  // completion health: green ≥ 75%, amber 40-74%, red < 40%.
  const colorFor = (pct: number) => {
    if (pct >= 75) return '#58968A'  // status-on
    if (pct >= 40) return '#AE4300'  // status-mid
    return '#F10F45'                 // status-off
  }
  // Per-action deadline-based status (Animesh's spec): implemented = green;
  // past deadline & not implemented = red; otherwise (still within timeline)
  // = amber/pending.
  const today = new Date().toISOString().slice(0, 10)
  const actionStatus = (a: ActionItem): { label: string; color: string } => {
    const st = (a.status || '').toLowerCase()
    if (st === 'implemented') return { label: 'Implemented', color: '#1A7A5A' }
    const overdue = a.timeline && a.timeline < today
    if (overdue) return { label: 'Overdue', color: '#F10F45' }
    return { label: st === 'in_progress' ? 'In progress' : 'Pending', color: '#AE4300' }
  }

  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.responseKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.responseTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.responseSub')}
          </p>
        </div>
        <SourceChip>CIPRB 10 — Response Plan</SourceChip>
      </div>

      {/* Interim-data caveat — shown ONLY while seed/Excel placeholder rows are
          present (executed ≈ planned/2). Real Kobo submissions carry true
          implemented counts (source 'kobo_response_plan'), so this auto-hides
          once the tracker is driven entirely by live field data. */}
      {summaries.some(s => s.source && s.source !== 'kobo_response_plan') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          margin: '0 0 14px', padding: '8px 12px',
          background: 'rgba(249,96,0,0.08)', border: '1px solid rgba(249,96,0,0.22)',
          borderRadius: 8, fontSize: 11.5, color: 'var(--ink-3)',
        }}>
          <Info size={13} style={{ color: CIPRB_BLUE, flexShrink: 0 }} />
          {t('mpdsrViz.responseDataNote', {
            defaultValue: 'Interim data — implemented counts are placeholders until the Kobo executed-activity form ships; treat as indicative, not confirmed.',
          })}
        </div>
      )}

      {/* OVERALL IMPLEMENTATION summary tile — Animesh's accountability ask
          (2026-06-02 spec): if 10 actions planned and 6 implemented, show
          60%. Aggregates across every row in the table below. */}
      {summaries.length > 0 && (() => {
        const totalPlanned = summaries.reduce((s, x) => s + (x.activities_planned ?? 0), 0)
        const totalImpl = summaries.reduce((s, x) => s + (x.activities_implemented ?? 0), 0)
        const overallPct = totalPlanned > 0 ? Math.round((totalImpl / totalPlanned) * 100) : 0
        const overallColor = colorFor(overallPct)
        return (
          <div
            className="card"
            style={{
              padding: '16px 22px',
              marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 18,
              borderLeft: `4px solid ${overallColor}`,
            }}
          >
            <div style={{
              flex: 1,
            }}>
              <div className="mono" style={{
                fontSize: 10, color: 'var(--muted)',
                letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4,
              }}>
                OVERALL IMPLEMENTATION
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
                <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {totalImpl}
                </b>
                {' of '}
                <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {totalPlanned}
                </b>
                {' actions implemented across all districts'}
              </div>
            </div>
            <div style={{
              fontSize: 34, fontWeight: 800, color: overallColor,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              lineHeight: 1,
            }}>
              {overallPct}%
            </div>
          </div>
        )
      })()}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>{t('mpdsrViz.thDistrict')}</th>
              <th>{t('mpdsrViz.thLevel')}</th>
              <th>{t('mpdsrViz.thPlace')}</th>
              <th style={{ textAlign: 'right' }}>{t('mpdsrViz.thPlanned')}</th>
              <th style={{ textAlign: 'right' }}>{t('mpdsrViz.thExecuted')}</th>
              <th style={{ textAlign: 'right', minWidth: 160 }}>{t('mpdsrViz.thCompletion')}</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 ? (
              <tr>
                <td colSpan={6} style={{
                  textAlign: 'center', padding: '48px 16px',
                  color: 'var(--ink-3)',
                }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}>
                    <Info size={20} style={{ color: CIPRB_BLUE }} />
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink-2)' }}>
                      {t('mpdsrViz.responseEmpty')}
                    </div>
                  </div>
                </td>
              </tr>
            ) : summaries.map((s, i) => {
              const hasActions = (s.actions?.length ?? 0) > 0
              const isOpen = expanded === i
              return (
              <React.Fragment key={`${s.district}-${s.level}-${i}`}>
              <tr
                onClick={() => hasActions && setExpanded(isOpen ? null : i)}
                style={{ cursor: hasActions ? 'pointer' : 'default' }}
              >
                <td style={{ fontWeight: 500, color: 'var(--ink)' }}>
                  {hasActions && (
                    <span style={{ display: 'inline-block', width: 14, color: 'var(--muted)', transition: 'transform 150ms', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▸</span>
                  )}
                  {s.district}
                </td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(249,96,0,0.08)', color: CIPRB_BLUE,
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                  }}>
                    {s.level === 'DM' ? t('mpdsrViz.levelDistrict') : t('mpdsrViz.levelUpazila')}
                  </span>
                </td>
                <td style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
                  {s.place_of_meeting || '—'}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>
                  {s.activities_planned.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>
                  {s.activities_implemented.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <div style={{
                      width: 80, height: 6, borderRadius: 999,
                      background: 'var(--surface-3)', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${Math.min(100, s.completion_pct)}%`, height: '100%',
                        background: colorFor(s.completion_pct), borderRadius: 999,
                      }} />
                    </div>
                    <span style={{
                      minWidth: 40, fontVariantNumeric: 'tabular-nums',
                      fontWeight: 600, fontSize: 12.5, color: colorFor(s.completion_pct),
                    }}>
                      {s.completion_pct > 100 ? '100%+' : `${s.completion_pct.toFixed(0)}%`}
                    </span>
                  </div>
                </td>
              </tr>
              {isOpen && hasActions && (
                <tr>
                  <td colSpan={6} style={{ padding: 0, background: 'var(--surface-2)' }}>
                    <div style={{ padding: '12px 18px' }}>
                      <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 8 }}>
                        ACTION ITEMS · {s.meeting_date || 'meeting date n/a'}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                            <th style={{ padding: '4px 8px', fontWeight: 600 }}>Action</th>
                            <th style={{ padding: '4px 8px', fontWeight: 600 }}>Responsible</th>
                            <th style={{ padding: '4px 8px', fontWeight: 600 }}>Timeline</th>
                            <th style={{ padding: '4px 8px', fontWeight: 600 }}>Indicator</th>
                            <th style={{ padding: '4px 8px', fontWeight: 600 }}>Milestone</th>
                            <th style={{ padding: '4px 8px', fontWeight: 600 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.actions!.map((a, ai) => {
                            const st = actionStatus(a)
                            return (
                              <tr key={ai} style={{ borderTop: '1px solid var(--hair)' }}>
                                <td style={{ padding: '6px 8px', color: 'var(--ink)' }}>{a.action || '—'}</td>
                                <td style={{ padding: '6px 8px', color: 'var(--ink-3)' }}>{a.responsible || '—'}</td>
                                <td style={{ padding: '6px 8px', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{a.timeline || '—'}</td>
                                <td style={{ padding: '6px 8px', color: 'var(--ink-3)' }}>{a.indicator || '—'}</td>
                                <td style={{ padding: '6px 8px', color: 'var(--ink-3)' }}>{a.milestone || '—'}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                    color: st.color, background: `${st.color}1A`,
                                    border: `1px solid ${st.color}40`,
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: 999, background: st.color }} />
                                    {st.label}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

// ─── Per-district Reporting Rate bar chart ───────────────────────────────────
//
// Animesh's spec: reporting rates calculated against Sayeed's 'Estimated
// Maternal Deaths' denominator per district. Bhola example — estimated=75,
// reported=35 → ~47% reporting rate. Shown as a horizontal bar chart so
// districts are scannable by name.

function ReportingRatePerDistrict({
  cases, denominators,
}: { cases: MPDSRCase[]; denominators: DistrictDenominator[] }) {
  const { t } = useTranslation()
  // Normalise district name like the cause-breakdown filter does.
  const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const reportedByDistrict: Record<string, number> = {}
  for (const c of cases) {
    if (c.death_type !== 'maternal') continue
    const k = norm(c.district ?? '')
    reportedByDistrict[k] = (reportedByDistrict[k] ?? 0) + 1
  }

  const rows = denominators
    .filter(d => (d.project_deaths_md ?? 0) > 0)
    .map(d => {
      // Sayeed's Project-Deaths denominators arrive as estimates with
      // fractional precision (10.336, 68.19312). Round for display — you
      // can't have 0.336 of a maternal death — while keeping the precise
      // value for the rate math underneath.
      const estimatedRaw = d.project_deaths_md ?? 0
      const estimatedDisplay = Math.round(estimatedRaw)
      const reported = reportedByDistrict[norm(d.district)] ?? 0
      const rate = estimatedRaw > 0 ? (reported / estimatedRaw) * 100 : 0
      return { district: d.district, estimated: estimatedDisplay, reported, rate }
    })
    .sort((a, b) => b.rate - a.rate)

  const colorFor = (pct: number) => {
    if (pct >= 75) return '#58968A'
    if (pct >= 40) return '#AE4300'
    return '#F10F45'
  }

  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.perDistrictKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.perDistrictTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.perDistrictSub')}
          </p>
        </div>
        <SourceChip>CIPRB 2 + CIPRB 3</SourceChip>
      </div>
      <div className="card" style={{ padding: 20 }}>
        {rows.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {t('mpdsrViz.perDistrictEmpty')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map(r => (
              <div key={r.district} style={{
                display: 'grid',
                gridTemplateColumns: '130px 1fr 110px',
                alignItems: 'center', gap: 12,
              }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
                  {r.district}
                </div>
                <div style={{
                  height: 10, borderRadius: 999,
                  background: 'var(--surface-3)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, r.rate)}%`, height: '100%',
                    background: colorFor(r.rate), borderRadius: 999,
                    transition: 'width 400ms ease',
                  }} />
                </div>
                <div style={{
                  textAlign: 'right', fontSize: 12.5,
                  fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)',
                }}>
                  <b style={{ color: colorFor(r.rate) }}>
                    {r.rate > 100 ? '100%+' : `${r.rate.toFixed(0)}%`}
                  </b>
                  <span className="mute" style={{ marginLeft: 6, fontSize: 11 }}>
                    {r.reported}/{r.estimated}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export interface ReportingPeriod {
  from: string
  to: string
}

export function MPDSRVisualizations({
  cases,
  period,
  districts,
}: {
  cases: MPDSRCase[]
  period?: ReportingPeriod
  districts?: readonly string[] | null
}) {
  // Threading reporting-period AND the donor district filter through to the
  // aggregate endpoint so the MPDSR visualisations follow the CIPRB
  // Dashboard's Contract / Annual toggle and the GAC / SIDA / All pill.
  // NotifyVsReview and ReportingRatePerDistrict re-derive from `cases`
  // (already period- + donor-filtered by the parent) and the scoped
  // aggregates returned here.
  const agg = useAggregates(period, districts)
  // Response Plan tracker is re-enabled for Animesh's Wednesday review.
  // Data source is still Sayeed's MPDSR Action Plan Excel — 7 of 8 rows
  // carry placeholder executed = planned/2 values because no Kobo form
  // exists yet for executed-activity counts. The tracker now shows a
  // "DATA NOTE" caption banner explaining the state. Once the Kobo
  // field-form lands, the placeholders will be replaced automatically.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <div>
        <NotifyVsReview
          cases={cases}
          totals={agg?.facility_totals ?? null}
          denominators={agg?.denominators ?? []}
          reviewCounts={agg?.review_counts ?? null}
          notificationByLevel={agg?.notification_by_level ?? null}
        />
      </div>
      <div>
        <ReportingRatePerDistrict cases={cases} denominators={agg?.denominators ?? []} />
      </div>
      <div>
        <CauseBreakdown cases={cases} />
      </div>
      {agg?.facility && agg.facility.total > 0 && (
        <div>
          <FacilityDeepDive facility={agg.facility} />
        </div>
      )}
      {/* Phase 2 gap charts — neonatal deaths, death notifications, social
          autopsy. Always render (they carry their own empty/zero state) so
          the dashboard exposes the full set of MPDSR forms feeding the DB. */}
      <div>
        <NeonatalDeaths neonatal={agg?.neonatal ?? null} />
      </div>
      <div>
        <DeathNotifications notifications={agg?.notifications ?? null} />
      </div>
      <div>
        <SocialAutopsy socialAutopsy={agg?.social_autopsy ?? null} />
      </div>
      <div>
        <MPDSRIndicators indicators={agg?.indicators ?? null} />
      </div>
      <div id="response-plan">
        <ResponsePlanTracker summaries={agg?.action_plan_summaries ?? []} />
      </div>
    </div>
  )
}

// ─── Facility (Form 04) deep-dive ────────────────────────────────────────────
// The facility maternal-death form carries richer review data than the
// community form. Two breakdowns the community form can't provide:
//   • Admission→death interval — how long after admission the woman died
//     (a care-timeliness signal). Ordered histogram.
//   • Facility review committee progress — where each death sits in the
//     review pipeline, plus what share has a documented action plan.
const REVIEW_STATUS_LABELS: Record<string, string> = {
  reported: 'Reported',
  under_review: 'Under review',
  committee_review: 'Committee review',
  action_plan_drafted: 'Action plan drafted',
  closed: 'Closed',
}

function FacilityDeepDive({ facility }: {
  facility: {
    total: number
    admission_to_death: Record<string, number>
    review_status: Record<string, number>
    action_plan_coverage: { with_plan: number; without_plan: number }
  }
}) {
  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            FACILITY DEATHS · MPDSR FORM 4
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            Facility review deep-dive
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            The extra detail Form 4 captures beyond cause of death — how quickly
            deaths followed admission, and how far each has moved through the
            facility review committee. Based on {facility.total.toLocaleString()} facility maternal {facility.total === 1 ? 'death' : 'deaths'}.
          </p>
        </div>
        <SourceChip>CIPRB 4</SourceChip>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Histogram
          title="Admission → death interval"
          kicker="Care timeliness"
          data={facility.admission_to_death}
        />
        <DonutBreakdown
          title="Review committee progress"
          kicker="Review pipeline"
          data={facility.review_status}
          labels={REVIEW_STATUS_LABELS}
        />
        <StatTile
          title="Action plan documented"
          kicker="Committee follow-through"
          data={{
            with_plan: facility.action_plan_coverage.with_plan,
            without_plan: facility.action_plan_coverage.without_plan,
          }}
          highlight="with_plan"
          labels={{ with_plan: 'With action plan', without_plan: 'No action plan yet' }}
        />
      </div>
    </div>
  )
}

// ─── Phase 2 gap charts: Neonatal · Notifications · Social Autopsy ───────────
//
// Three CIPRB Kobo forms feed the DB but had no dedicated chart. Each chart
// is fed by an aggregate key already computed server-side and degrades to an
// empty state when no data has landed.

// Neonatal cause-of-death labels — the `cod_neonatal` choice list (CIPRB 3 +
// CIPRB 5). Bangla reused verbatim from build_ciprb_forms.py choices.
const NEO_CAUSE_LABELS: Record<string, string> = {
  preterm_lbw: 'Preterm / low birth weight',
  asphyxia: 'Birth asphyxia',
  sepsis: 'Neonatal sepsis',
  pneumonia: 'Pneumonia / respiratory infection',
  congenital: 'Congenital anomaly',
  diarrhoea: 'Diarrhoea',
  other: 'Other',
  unknown: 'Unknown',
}

const NEO_LEVEL_LABELS: Record<string, string> = {
  community: 'Community (CIPRB 3)',
  facility: 'Facility (CIPRB 5)',
}

const NOTIF_KIND_LABELS: Record<string, string> = {
  maternal: 'Maternal death',
  neonatal: 'Neonatal death',
  stillbirth: 'Stillbirth',
}

const NOTIF_LEVEL_LABELS: Record<string, string> = {
  community: 'Community / home',
  facility: 'Health facility',
}

const SA_PLACE_LABELS: Record<string, string> = {
  facility: 'Health facility',
  home: 'Home',
  in_transit: 'In transit',
}

/** Neonatal death surveillance — CIPRB 3 (community) + CIPRB 5 (facility).
 *  Cause-of-death breakdown + community-vs-facility split. */
function NeonatalDeaths({ neonatal }: {
  neonatal: { total: number; cause_of_death: Record<string, number>; by_level: { community: number; facility: number } } | null
}) {
  const { t } = useTranslation()
  const data = neonatal ?? { total: 0, cause_of_death: {}, by_level: { community: 0, facility: 0 } }
  const z = {} as Record<string, number>
  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.neoKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.neoTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.neoSub', { count: data.total })}
          </p>
        </div>
        <SourceChip>CIPRB 3 + CIPRB 5</SourceChip>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <DonutBreakdown
          title={t('mpdsrViz.neoCauseTitle')}
          kicker={t('mpdsrViz.neoCauseKicker')}
          data={data.cause_of_death ?? z}
          labels={NEO_CAUSE_LABELS}
        />
        <DonutBreakdown
          title={t('mpdsrViz.neoLevelTitle')}
          kicker={t('mpdsrViz.neoLevelKicker')}
          data={data.by_level ?? z}
          labels={NEO_LEVEL_LABELS}
        />
      </div>
    </div>
  )
}

/** Death notification slips — CIPRB 7 (Slip 01) + CIPRB 8 (Slip 02).
 *  By death type, by level, by district. */
function DeathNotifications({ notifications }: {
  notifications: {
    total: number
    by_kind: Record<string, number>
    by_level: { community: number; facility: number }
    by_district: Record<string, number>
  } | null
}) {
  const { t } = useTranslation()
  const data = notifications ?? { total: 0, by_kind: {}, by_level: { community: 0, facility: 0 }, by_district: {} }
  const z = {} as Record<string, number>
  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.notifSlipKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.notifSlipTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.notifSlipSub', { count: data.total })}
          </p>
        </div>
        <SourceChip>CIPRB 7 + CIPRB 8</SourceChip>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <DonutBreakdown
          title={t('mpdsrViz.notifKindTitle')}
          kicker={t('mpdsrViz.notifKindKicker')}
          data={data.by_kind ?? z}
          labels={NOTIF_KIND_LABELS}
        />
        <DonutBreakdown
          title={t('mpdsrViz.notifLevelTitle')}
          kicker={t('mpdsrViz.notifLevelKicker')}
          data={data.by_level ?? z}
          labels={NOTIF_LEVEL_LABELS}
        />
        <BarBreakdown
          title={t('mpdsrViz.notifDistrictTitle')}
          kicker={t('mpdsrViz.notifDistrictKicker')}
          data={data.by_district ?? z}
        />
      </div>
    </div>
  )
}

/** Social Autopsy — CIPRB 6 (sa_md). Maternal-death re-review. Count +
 *  place-of-death breakdown. Data is thin and cause is free-text, so this is
 *  a stat-tile-style count alongside a small place-of-death donut. */
function SocialAutopsy({ socialAutopsy }: {
  socialAutopsy: { total: number; place_of_death: Record<string, number> } | null
}) {
  const { t } = useTranslation()
  const data = socialAutopsy ?? { total: 0, place_of_death: {} }
  const z = {} as Record<string, number>
  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('mpdsrViz.saKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('mpdsrViz.saTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('mpdsrViz.saSub')}
          </p>
        </div>
        <SourceChip>CIPRB 6 — Social Autopsy</SourceChip>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {/* Count stat — sa_md cases reviewed. */}
        <div className="card" style={{ padding: 22, flex: '1 1 240px', minWidth: 220 }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 6 }}>
            {t('mpdsrViz.saCountKicker')}
          </div>
          <div style={{
            fontSize: 44, fontWeight: 800, color: CIPRB_BLUE, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>
            {data.total.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
            {data.total === 0 ? t('mpdsrViz.saEmpty') : t('mpdsrViz.saCountSub')}
          </div>
        </div>
        <DonutBreakdown
          title={t('mpdsrViz.saPlaceTitle')}
          kicker={t('mpdsrViz.saPlaceKicker')}
          data={data.place_of_death ?? z}
          labels={SA_PLACE_LABELS}
        />
      </div>
    </div>
  )
}

// ─── MPDSR 11 major indicators (CIPRB corrections doc) ───────────────────────
const MPDSR_LABELS = {
  place_of_death: { home: 'Home', facility: 'Health facility', in_transit: 'In transit', other: 'Other' },
  time_of_death: { antepartum: 'Antepartum', intrapartum: 'Intrapartum', postpartum_42d: 'Postpartum (≤42d)', unknown: 'Unknown' },
  anc: { none: 'None', '1': '1 visit', '2': '2 visits', '3': '3 visits', '4_plus': '4+ visits', unknown: 'Unknown' },
  pnc: { yes: 'Received', no: 'Not received', unknown: 'Unknown' },
  mode: { nvd: 'NVD', csection: 'C-section', assisted_vaginal: 'Assisted vaginal', undelivered: 'Undelivered' },
  outcome: { livebirth: 'Live birth', stillbirth: 'Stillbirth', na: 'N/A (undelivered)' },
  place_delivery: { home: 'Home', gov_facility: 'Govt facility', private_facility: 'Private facility', in_transit: 'In transit', na: 'N/A' },
  person: { doctor: 'Doctor', nurse: 'Nurse', midwife: 'Midwife', tba: 'TBA', relatives: 'Relatives', self: 'Self', none: 'No-one' },
} as const

function MPDSRIndicators({ indicators }: { indicators: Record<string, Record<string, number>> | null }) {
  const ind = indicators ?? {}
  const z = {} as Record<string, number>
  return (
    <div>
      <div style={{
        marginBottom: 14,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 8, flexWrap: 'wrap',
      }}>
        <div>
          <div className="kicker"><span className="dot" style={{ background: CIPRB_BLUE }} />MPDSR · 11 MAJOR INDICATORS</div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            Maternal death indicator breakdown
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            The 11 dashboard indicators CIPRB specified, from MPDSR Form 01 (Community Maternal) + Form 04 (Facility Maternal).
          </p>
        </div>
        <SourceChip>CIPRB 2 + CIPRB 4</SourceChip>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <DonutBreakdown title="1. Place of death"          data={ind.place_of_death ?? z} labels={MPDSR_LABELS.place_of_death} />
        <DonutBreakdown title="2. Time of death"           data={ind.time_of_death ?? z} labels={MPDSR_LABELS.time_of_death} />
        <Histogram      title="3. Gestational week at death" data={ind.gestational_weeks ?? z} />
        <BarBreakdown   title="4. Antenatal care visits"   data={ind.anc_visits_count ?? z} labels={MPDSR_LABELS.anc} ordered />
        <StatTile       title="5. Postnatal care"          data={ind.pnc_received ?? z} highlight="yes" labels={MPDSR_LABELS.pnc} />
        <DonutBreakdown title="6. Mode of delivery"        data={ind.mode_of_delivery ?? z} labels={MPDSR_LABELS.mode} />
        <StatTile       title="7. Delivery outcome"        data={ind.delivery_outcome ?? z} highlight="livebirth" labels={MPDSR_LABELS.outcome} />
        <DonutBreakdown title="8. Place of delivery"       data={ind.place_of_delivery ?? z} labels={MPDSR_LABELS.place_delivery} />
        <BarBreakdown   title="9. Person assisted delivery" data={ind.person_assisted_delivery ?? z} labels={MPDSR_LABELS.person} />
        <Histogram      title="10. Maternal age distribution" data={ind.maternal_age ?? z} />
        <Histogram      title="11. Time of death after birth" data={ind.time_death_after_birth_hours ?? z} />
      </div>
    </div>
  )
}
