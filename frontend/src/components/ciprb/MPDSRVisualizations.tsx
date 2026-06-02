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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip,
  PieChart, Pie,
} from 'recharts'
import { Info, Database } from 'lucide-react'
import { api } from '@/api/client'
import type { MPDSRCase } from '@/types/index'

// ─── Aggregates fetched from /api/mpdsr/aggregates/ ─────────────────────────

interface FacilityTotals {
  fdn_md: number; fdn_nd: number; fdn_sb: number
  fdr_md: number; fdr_nd: number; fdr_sb: number
}

interface ActionPlanSummary {
  district: string; level: 'DM' | 'UM'
  place_of_meeting: string; meeting_date: string
  participants: number | null
  meetings_planned: number; activities_planned: number; activities_implemented: number
  completion_pct: number
}

interface DistrictDenominator {
  district: string
  project_deaths_md: number | null
  project_deaths_nd: number | null
  project_deaths_sb: number | null
}

interface AggregatesPayload {
  denominators: DistrictDenominator[]
  facility_counts: any[]
  facility_totals: FacilityTotals
  action_plan_summaries: ActionPlanSummary[]
  totals: { mpdsr_cases: number; fistula_corner_cases: number; fistula_campaign_visits: number }
}

function useAggregates(): AggregatesPayload | null {
  const [data, setData] = useState<AggregatesPayload | null>(null)
  useEffect(() => {
    let cancelled = false
    api.get<AggregatesPayload>('/mpdsr/aggregates/')
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { /* leave null; visualisations fall back to live-only */ })
    return () => { cancelled = true }
  }, [])
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
  cases, totals, denominators,
}: {
  cases: MPDSRCase[]
  totals: FacilityTotals | null
  denominators: DistrictDenominator[]
}) {
  const { t } = useTranslation()
  const live = useMemo(() => computeNotifyVsReview(cases), [cases])

  // Prefer facility-level aggregate totals from Sayeed's Excel ingest when
  // available — gives the real programme-wide numbers, not just live Kobo
  // submissions. Falls back to live-only counts if the import hasn't run.
  const d = totals ? {
    notifiedMD: totals.fdn_md, reviewedMD: totals.fdr_md,
    notifiedND: totals.fdn_nd, reviewedND: totals.fdr_nd,
  } : live

  // Estimated maternal/neonatal/stillbirth deaths across all districts —
  // the denominator Animesh asked for to compute the REPORTING RATE
  // (notified / estimated) per Sayeed's 'Project Deaths 2026' column.
  const estimatedMD = denominators.reduce((s, x) => s + (x.project_deaths_md ?? 0), 0)
  const estimatedND = denominators.reduce((s, x) => s + (x.project_deaths_nd ?? 0), 0)

  const chartData = [
    { category: t('mpdsrViz.maternalDeaths'), notified: d.notifiedMD, reviewed: d.reviewedMD },
    { category: t('mpdsrViz.neonatalDeaths'), notified: d.notifiedND, reviewed: d.reviewedND },
  ]

  const reviewRateMD = d.notifiedMD > 0 ? (d.reviewedMD / d.notifiedMD) * 100 : 0
  const reviewRateND = d.notifiedND > 0 ? (d.reviewedND / d.notifiedND) * 100 : 0
  const reportingRateMD = estimatedMD > 0 ? (d.notifiedMD / estimatedMD) * 100 : null
  const reportingRateND = estimatedND > 0 ? (d.notifiedND / estimatedND) * 100 : null

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
        {/* Reporting rate tiles — uses Sayeed's Project Deaths 2026 denominators */}
        {(reportingRateMD !== null || reportingRateND !== null) && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18,
            marginBottom: 18,
            paddingBottom: 18,
            borderBottom: '1px solid var(--hair)',
          }}>
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
                {t('mpdsrViz.mdReportingRate')}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 800, color: '#CC6A00',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {reportingRateMD !== null ? `${reportingRateMD.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {t('mpdsrViz.reportedOfEstimated', { reported: d.notifiedMD, estimated: Math.round(estimatedMD) })}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
                {t('mpdsrViz.ndReportingRate')}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 800, color: '#CC6A00',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
              }}>
                {reportingRateND !== null ? `${reportingRateND.toFixed(0)}%` : '—'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
                {t('mpdsrViz.reportedOfEstimated', { reported: d.notifiedND, estimated: Math.round(estimatedND) })}
              </div>
            </div>
          </div>
        )}

        {/* Review rate tiles */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18,
          marginBottom: 24,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
              {t('mpdsrViz.mdReviewRate')}
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: CIPRB_BLUE,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {reviewRateMD.toFixed(0)}%
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {t('mpdsrViz.mdReviewedOfNotified', { reviewed: d.reviewedMD, notified: d.notifiedMD })}
            </div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
              {t('mpdsrViz.ndReviewRate')}
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: CIPRB_BLUE_LIGHT,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {reviewRateND.toFixed(0)}%
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {t('mpdsrViz.ndReviewedOfNotified', { reviewed: d.reviewedND, notified: d.notifiedND })}
            </div>
          </div>
        </div>

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
const CAUSE_PALETTE: Record<string, string> = {
  pph:               '#F96000',  // UNFPA orange
  eclampsia:         '#FB904D',  // UNFPA bright
  sepsis:            '#FFC499',  // UNFPA pale
  obstructed_labour: '#C44E00',  // UNFPA deep
  other:             'var(--muted-3)',
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
    const k = (c.cause_of_death ?? '').toLowerCase().trim() || 'other'
    counts[k] = (counts[k] ?? 0) + 1
  }
  const total = Object.values(counts).reduce((s, v) => s + v, 0)

  const causeKeys = ['pph', 'eclampsia', 'sepsis', 'obstructed_labour', 'other']
  const pieData = causeKeys.map(k => ({
    name: t(`mpdsr.cause${pascal(k)}`, { defaultValue: k }),
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
  // Action Plan Progress ingestion is live — rows show per-district
  // planned-vs-executed counts with completion %. Bar colour reflects
  // completion health: green ≥ 75%, amber 40-74%, red < 40%.
  const colorFor = (pct: number) => {
    if (pct >= 75) return '#1A7A5A'  // status-on
    if (pct >= 40) return '#CC6A00'  // status-mid
    return '#F10F45'                 // status-off
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
            ) : summaries.map((s, i) => (
              <tr key={`${s.district}-${s.level}-${i}`}>
                <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{s.district}</td>
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
            ))}
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
    if (pct >= 75) return '#1A7A5A'
    if (pct >= 40) return '#CC6A00'
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

export function MPDSRVisualizations({ cases }: { cases: MPDSRCase[] }) {
  const agg = useAggregates()
  // Response Plan tracker is hidden — no Kobo form is wired to capture
  // executed-activity counts yet, so the only data source was Sayeed's
  // Excel which had ~50% placeholder values across the board. Re-enable
  // by re-adding <ResponsePlanTracker /> here once the field form lands.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <NotifyVsReview
        cases={cases}
        totals={agg?.facility_totals ?? null}
        denominators={agg?.denominators ?? []}
      />
      <ReportingRatePerDistrict cases={cases} denominators={agg?.denominators ?? []} />
      <CauseBreakdown cases={cases} />
    </div>
  )
}
