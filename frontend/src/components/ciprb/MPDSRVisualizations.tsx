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
import { Info } from 'lucide-react'
import { api } from '@/api/client'
import type { MPDSRCase } from '@/types/index'

const CIPRB_BLUE = '#0072BC'
const CIPRB_BLUE_SOFT = 'rgba(0,114,188,0.08)'
const CIPRB_BLUE_LIGHT = '#7DB8DC'

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

function NotifyVsReview({ cases }: { cases: MPDSRCase[] }) {
  const d = useMemo(() => computeNotifyVsReview(cases), [cases])

  const chartData = [
    { category: 'Maternal Deaths',  notified: d.notifiedMD, reviewed: d.reviewedMD },
    { category: 'Neonatal Deaths',  notified: d.notifiedND, reviewed: d.reviewedND },
  ]

  const reviewRateMD = d.notifiedMD > 0 ? (d.reviewedMD / d.notifiedMD) * 100 : 0
  const reviewRateND = d.notifiedND > 0 ? (d.reviewedND / d.notifiedND) * 100 : 0

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div className="kicker">
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          NOTIFICATION VS REVIEW
        </div>
        <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
          Are reported deaths being reviewed?
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          For every death notification, the committee should run a review. The gap shows what's still pending.
        </p>
      </div>

      <div className="card" style={{ padding: 24 }}>
        {/* Summary rates */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18,
          marginBottom: 24,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
              MD REVIEW RATE
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: CIPRB_BLUE,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {reviewRateMD.toFixed(0)}%
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {d.reviewedMD} of {d.notifiedMD} maternal deaths reviewed
            </div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginBottom: 4 }}>
              ND REVIEW RATE
            </div>
            <div style={{
              fontSize: 28, fontWeight: 800, color: CIPRB_BLUE_LIGHT,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
            }}>
              {reviewRateND.toFixed(0)}%
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {d.reviewedND} of {d.notifiedND} neonatal deaths reviewed
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
                  cursor={{ fill: 'rgba(0,114,188,0.04)' }}
                />
                <Bar dataKey="notified" name="Notified" fill={CIPRB_BLUE_LIGHT}
                     radius={[6, 6, 0, 0]} animationDuration={700} />
                <Bar dataKey="reviewed" name="Reviewed" fill={CIPRB_BLUE}
                     radius={[6, 6, 0, 0]} animationDuration={700} animationBegin={120} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
            Bar chart fills as MPDSR cases are reported and reviewed.
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CIPRB_BLUE_LIGHT }} />
            Notified
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--ink-3)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: CIPRB_BLUE }} />
            Reviewed
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── 2. Cause of Death breakdown (with district-grouping tabs) ───────────────

type DistrictGroup = 'cumulative' | 'sida' | 'gac' | 'cp'

const GROUP_TABS: { key: DistrictGroup; label: string; sub: string }[] = [
  { key: 'cumulative', label: 'Cumulative',     sub: 'All cases' },
  { key: 'sida',       label: 'SIDA Districts', sub: '6 districts' },
  { key: 'gac',        label: 'GAC Districts',  sub: '5 districts' },
  { key: 'cp',         label: 'CP Districts',   sub: 'Country Programme' },
]

const CAUSE_PALETTE: Record<string, string> = {
  pph:               '#0072BC',  // CIPRB blue
  eclampsia:         '#5BA4D1',
  sepsis:            '#90C7E5',
  obstructed_labour: '#003F73',
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
          MATERNAL CAUSES OF DEATH
        </div>
        <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
          What's driving maternal mortality?
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          Percentage breakdown of clinical causes. Compare SIDA vs GAC vs CP districts to spot regional patterns.
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
        {GROUP_TABS.map(tab => {
          const isActive = group === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setGroup(tab.key)}
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
              {tab.label}
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
              No maternal deaths recorded in this district group yet
            </div>
            <div style={{ fontSize: 12, maxWidth: 480, color: 'var(--muted)', lineHeight: 1.55 }}>
              Pie chart fills as cases come in from {group.toUpperCase()} districts.
              Switch to <b>Cumulative</b> to see all data combined.
            </div>
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
                  MD CASES
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
            Breakdown fills as maternal death cases are recorded and the cause of death is assigned.
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

function ResponsePlanTracker() {
  // Placeholder: this populates from the MPDSR Action Plan Progress Excel
  // ingestion (Sayeed's file). Until then, render the structure with an
  // explanatory note so Animesh sees the box is here and accountable.
  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div className="kicker">
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          MPDSR RESPONSE PLAN · IMPLEMENTATION TRACKER
        </div>
        <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
          Are review action plans being executed?
        </h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          After each maternal death review, teams draft a response plan. This tracker compares planned interventions against what was genuinely carried out on the ground.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>District</th>
              <th>Intervention</th>
              <th style={{ textAlign: 'right' }}>Planned</th>
              <th style={{ textAlign: 'right' }}>Executed</th>
              <th style={{ textAlign: 'right' }}>Completion</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} style={{
                textAlign: 'center', padding: '48px 16px',
                color: 'var(--ink-3)',
              }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                }}>
                  <Info size={20} style={{ color: CIPRB_BLUE }} />
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink-2)' }}>
                    Awaiting Action Plan Progress data ingestion
                  </div>
                  <div style={{ fontSize: 12, maxWidth: 520, color: 'var(--muted)', lineHeight: 1.55 }}>
                    Sayeed sent the <b>MPDSR Action Plan Progress.xlsx</b> file (8 sheets across
                    Sunamganj, Sherpur, Bhola, Khagrachari × DM/UM). Once ingested, this tracker
                    shows per-district planned-vs-executed counts with completion %.
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function MPDSRVisualizations({ cases }: { cases: MPDSRCase[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <NotifyVsReview cases={cases} />
      <CauseBreakdown cases={cases} />
      <ResponsePlanTracker />
    </div>
  )
}
