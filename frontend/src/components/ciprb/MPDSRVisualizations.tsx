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
import { DataSource } from '@/components/ui/DataSource'
import type { MPDSRCase } from '@/types/index'

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
}

interface DistrictDenominator {
  district: string
  project_deaths_md: number | null
  project_deaths_nd: number | null
  project_deaths_sb: number | null
}

interface ReviewCounts {
  /** Community Verbal Autopsy (Animesh's "Community MD Review / CDN") */
  va_md?: number
  /** Social Autopsy (Animesh's "Social Autopsy") */
  sa_md?: number
  /** F4 Facility Maternal Death Review (Animesh's "Facility MD Review / FDR") */
  f4?: number
  /** F1 + F2 notification rows summed — denominator for review rates */
  notified_md?: number
  /** Per-sub-form raw counts also returned for transparency */
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
}

function useAggregates(period?: { from: string; to: string }): AggregatesPayload | null {
  const [data, setData] = useState<AggregatesPayload | null>(null)
  const periodFrom = period?.from
  const periodTo = period?.to
  useEffect(() => {
    let cancelled = false
    const params: Record<string, string> = {}
    if (periodFrom) params.from = periodFrom
    if (periodTo) params.to = periodTo
    api.get<AggregatesPayload>('/mpdsr/aggregates/', { params })
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { /* leave null; visualisations fall back to live-only */ })
    return () => { cancelled = true }
  }, [periodFrom, periodTo])
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
      <div style={{ marginBottom: 14 }}>
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

      <div className="card" style={{ padding: 24 }}>
        {/* Reporting-rate tiles — MD / ND / SB (notified ÷ estimated).
            Denominators from Sayeed's Project Deaths 2026. */}
        {(() => {
          const FORMULA = (
            'MD = (Live Birth × 136) / 100,000\n' +
            'ND = (Live Birth × 20) / 1,000\n' +
            'SB = (Live Birth × 21) / 1,000\n\n' +
            "Source: Sayed's MPDSR M&E Framework (email 2 Jun 2026).\n" +
            'Decimals come from per-upazila Live Birth counts × ratio; rounded for display.'
          )
          const rateTile = (label: string, rate: number | null, reported: number, estimated: number) => (
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#AE4300', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {rate !== null ? `${rate.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {reported} reported of {Math.round(estimated)} estimated
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
              {rateTile('MD REPORTING RATE', reportingRateMD, d.notifiedMD, estimatedMD)}
              {rateTile('ND REPORTING RATE', reportingRateND, d.notifiedND, estimatedND)}
              {rateTile('SB REPORTING RATE', reportingRateSB, d.notifiedSB, estimatedSB)}
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
              NOTIFICATIONS BY LEVEL · COMMUNITY (CDN) vs FACILITY (FDN)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
              {([['Maternal (MD)', notificationByLevel.md], ['Neonatal (ND)', notificationByLevel.nd], ['Stillbirth (SB)', notificationByLevel.sb]] as const).map(([lbl, lv]) => (
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

        {/* MD Review subdivision — Animesh's 2026-06-02 spec splits the
            single MD Review Rate into three tiles:
              CDN = Community MD Review (verbal autopsy / va_md)
              FDR = Facility MD Review (f4)
              SA  = Social Autopsy (sa_md)
            All three use MD notified (f1 + f2) as the denominator. */}
        {(() => {
          const notifiedMD_kobo = reviewCounts?.notified_md ?? 0
          const baseMD = notifiedMD_kobo > 0 ? notifiedMD_kobo : d.notifiedMD
          const cdn = reviewCounts?.va_md ?? 0
          const fdr = reviewCounts?.f4 ?? d.reviewedMD
          const sa  = reviewCounts?.sa_md ?? 0
          const cdnPct = baseMD > 0 ? (cdn / baseMD) * 100 : null
          const fdrPct = baseMD > 0 ? (fdr / baseMD) * 100 : null
          const saPct  = baseMD > 0 ? (sa / baseMD) * 100  : null
          const tile = (label: string, value: number, pct: number | null, color: string) => (
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
                {label}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 800, color,
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {pct !== null ? `${pct.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {value} of {baseMD} notified
              </div>
            </div>
          )
          return (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18,
              marginBottom: 24,
            }}>
              {tile('COMMUNITY MD REVIEW (CDN)', cdn, cdnPct, CIPRB_BLUE)}
              {tile('FACILITY MD REVIEW (FDR)',  fdr, fdrPct, '#C44E00')}
              {tile('SOCIAL AUTOPSY (SA)',       sa,  saPct,  CIPRB_BLUE_LIGHT)}
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
  gac:  ['Sunamganj', 'Bhola', 'Sherpur', 'Kurigram', 'Khagrachari'],
  sida: ['Noakhali', 'Chandpur', 'Bandarban', 'Dhaka', 'Sunamganj', "Cox's Bazar"],
  cp:   [
    // Full Country Programme footprint — 16 MPDSR districts. CP includes
    // GAC and SIDA plus the broader regional coverage.
    'Sunamganj', 'Sylhet', 'Hobiganj', 'Bhola', 'Bagerhat', 'Patuakhali',
    'Barguna', 'Bandarban', 'Khagrachari', 'Noakhali', 'Chandpur', 'Sherpur',
    'Sirajganj', 'Jamalpur', 'Gaibandha', 'Kurigram', "Cox's Bazar", 'Dhaka',
  ],
}

function normaliseDistrict(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function CauseBreakdown({ cases }: { cases: MPDSRCase[] }) {
  const { t } = useTranslation()
  const [group, setGroup] = useState<DistrictGroup>('cumulative')

  const filtered = useMemo(() => {
    const allow = DISTRICT_MAPPING[group]
    if (allow === null) return cases
    if (allow.length === 0) return []
    const set = new Set(allow.map(normaliseDistrict))
    return cases.filter(c => set.has(normaliseDistrict(c.district ?? '')))
  }, [cases, group])

  const counts: Record<string, number> = {}
  for (const c of filtered) {
    if (c.death_type !== 'maternal') continue   // cause analysis is MD-specific
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

  // Sayeed has delivered GAC/SIDA/CP mappings — no more pending placeholder.
  // The empty state only triggers when the filter genuinely yields zero
  // cases (no maternal-death data recorded for that district group yet).
  const noCasesInGroup = group !== 'cumulative' && filtered.length === 0

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
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

      {/* Group tabs */}
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

      <div className="card" style={{ padding: 24 }}>
        {noCasesInGroup ? (
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
        ) : total > 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 40, flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', width: 220, height: 220, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={70} outerRadius={104} paddingAngle={2} stroke="none"
                    startAngle={90} endAngle={-270} animationDuration={800}>
                    {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--hair)',
                      borderRadius: 8, fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
              }}>
                <span style={{
                  fontSize: 36, fontWeight: 800, lineHeight: 1, color: 'var(--ink)',
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                }}>{total.toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginTop: 4 }}>
                  {t('mpdsrViz.mdCases')}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, minWidth: 220, flex: 1 }}>
              {pieData.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: 'var(--ink-2)' }}>{d.name}</span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value.toLocaleString()}</b>
                  <span className="mute" style={{ fontSize: 11.5, width: 44, textAlign: 'right' }}>
                    {total ? Math.round((d.value / total) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            {t('mpdsrViz.causeEmpty')}
          </div>
        )}
      </div>
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
      <div style={{ marginBottom: 14 }}>
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
                      {s.completion_pct.toFixed(0)}%
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
      <div style={{ marginBottom: 14 }}>
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
                  <b style={{ color: colorFor(r.rate) }}>{r.rate.toFixed(0)}%</b>
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
}: {
  cases: MPDSRCase[]
  period?: ReportingPeriod
}) {
  // Threading reporting-period through to the aggregate endpoint so the
  // MPDSR visualisations follow the CIPRB Dashboard's Contract / Annual
  // toggle. NotifyVsReview and ReportingRatePerDistrict re-derive from
  // `cases` (already period-filtered by the parent) and the period-scoped
  // aggregates returned here.
  const agg = useAggregates(period)
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
        <DataSource>
          spondon_mpdsr_combined_v1 (F1 community + F2 facility notifications, F4 facility review, va_md community verbal autopsy, sa_md social autopsy) · Denominator: CIPRB Project Deaths 2026
        </DataSource>
      </div>
      <div>
        <ReportingRatePerDistrict cases={cases} denominators={agg?.denominators ?? []} />
        <DataSource>spondon_mpdsr_combined_v1 (F1+F2 notifications grouped by district) · Denominator: CIPRB Project Deaths 2026 (Live Birth × 136/100k)</DataSource>
      </div>
      <div>
        <CauseBreakdown cases={cases} />
        <DataSource>spondon_mpdsr_combined_v1 · F4 cause_of_death field (ICD-10 codes per Sayed's MPDSR Form 01)</DataSource>
      </div>
      <div id="response-plan">
        <ResponsePlanTracker summaries={agg?.action_plan_summaries ?? []} />
        <DataSource>KF-MPDSR_Response_Plan.xlsx (3 sections × 5 actions × 7 fields per Sayed's MPDSR Response Plan_2026 docx)</DataSource>
      </div>
    </div>
  )
}
