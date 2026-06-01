/**
 * PartnerProgress — the at-a-glance view of how each implementing partner
 * is performing. This is what UNFPA (and CIPRB leadership) open the homepage
 * to see: for each of the three partners, progress against target, how many
 * indicators are on track, where they work, and a jump to the full dashboard.
 *
 * Progress is sourced from the IndicatorProgress array already loaded on the
 * homepage (/api/indicators/progress/). Identity + geography come from
 * partnerDistricts. Clicking a card opens that partner's dashboard.
 */
import { Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'

import {
  PARTNER_COLORS, PARTNER_ROUTES, PARTNER_DISTRICTS,
  type PartnerCode,
} from '@/data/partnerDistricts'
import type { IndicatorProgress } from '@/types'

const PARTNERS: PartnerCode[] = ['CIPRB', 'Bandhu', 'PHD']

// Full names dropped across the board for consistency (Animesh: 'if PHD
// and CIPRB has full name, Bandhu should have the same. rather remove
// everyone's full name'). The acronym + focus line carries identity.
const PARTNER_FOCUS: Record<PartnerCode, string> = {
  CIPRB:  'Maternal & child health · Fistula and MPDSR',
  Bandhu: 'Gender Diverse Population',
  PHD:    'Female Sex Workers (FSW)',
}

interface Props {
  progress: IndicatorProgress[] | null
}

interface Rollup {
  hasTargets: boolean
  percentage: number | null
  achievement: number
  target: number
  onTrack: number
  total: number            // indicators that have a target set
  totalIndicators: number  // all of this partner's indicators
  // Animesh's dual-tracking spec — show monthly % alongside overall %.
  // Monthly comes from each indicator's month_target / month_achievement
  // (UNFPA-set per indicator via Target Config).
  monthlyHasTargets: boolean
  monthlyPercentage: number | null
}

function bandColor(pct: number | null): string {
  if (pct == null || pct === 0) return 'var(--muted)'   // no data / not started
  if (pct >= 75) return '#1A7A5A'
  if (pct >= 40) return '#CC6A00'
  return '#C7172E'
}

function rollup(partner: PartnerCode, rows: IndicatorProgress[] | null): Rollup {
  const empty: Rollup = {
    hasTargets: false, percentage: null, achievement: 0, target: 0,
    onTrack: 0, total: 0, totalIndicators: 0,
    monthlyHasTargets: false, monthlyPercentage: null,
  }
  if (!rows) return empty
  const all = rows.filter((r) => r.organisation === partner && !r.unlinked)
  const totalIndicators = all.length
  const withTarget = all.filter((r) => r.target_value !== null)
  if (withTarget.length === 0) return { ...empty, totalIndicators }
  const achievement = withTarget.reduce((s, r) => s + (r.achievement ?? 0), 0)
  const target = withTarget.reduce((s, r) => s + (r.target_value ?? 0), 0)
  const percentage = target > 0 ? Math.round((achievement / target) * 1000) / 10 : 0
  // 'On track' = hitting ≥75% of THIS MONTH's target (Animesh's spec).
  // Indicators without a month_target set fall back to the overall % so
  // they're not silently dropped from the count.
  const onTrack = withTarget.filter((r) => {
    const monthPct = r.month_percentage ?? null
    const pct = monthPct ?? r.percentage ?? 0
    return pct >= 75
  }).length

  // Monthly — only indicators where UNFPA has filled in a month_target.
  const withMonth = all.filter((r) => (r.month_target ?? null) !== null)
  let monthlyHasTargets = false
  let monthlyPercentage: number | null = null
  if (withMonth.length > 0) {
    const monthAch = withMonth.reduce((s, r) => s + (r.month_achievement ?? 0), 0)
    const monthTgt = withMonth.reduce((s, r) => s + (r.month_target ?? 0), 0)
    if (monthTgt > 0) {
      monthlyHasTargets = true
      monthlyPercentage = Math.round((monthAch / monthTgt) * 1000) / 10
    }
  }

  return {
    hasTargets: true, percentage, achievement, target, onTrack,
    total: withTarget.length, totalIndicators,
    monthlyHasTargets, monthlyPercentage,
  }
}

export function PartnerProgress({ progress }: Props) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  return (
    <section className="section partner-progress" style={{ marginTop: 44 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            IMPLEMENTING PARTNERS
          </div>
          <h2 className="section-title">Implementing Partners at a Glance</h2>
          <p className="section-sub">
            Each partner's progress against its own targets — "on track" means
            an indicator has reached ≥ 75% of this month's target.
          </p>
        </div>
      </div>

      {/* 2-column × 3-row grid (Animesh's spec) — left column is THIS
          MONTH per partner, right column is OVERALL. Each card stands
          alone so the eye can compare across partners without two
          numbers fighting for attention inside one card. */}
      <div
        className="partner-progress-grid"
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
        }}
      >
        {PARTNERS.map((p, i) => (
          <Fragment key={p}>
            <PartnerMetricCard
              partner={p}
              mode="monthly"
              data={rollup(p, progress)}
              loading={progress === null}
              delay={i * 0.08}
              reduce={reduce}
              onClick={() => navigate(PARTNER_ROUTES[p])}
            />
            <PartnerMetricCard
              partner={p}
              mode="overall"
              data={rollup(p, progress)}
              loading={progress === null}
              delay={i * 0.08 + 0.04}
              reduce={reduce}
              onClick={() => navigate(PARTNER_ROUTES[p])}
            />
          </Fragment>
        ))}
      </div>

      <style>{`
        @media (max-width: 760px) {
          .partner-progress-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}

// ─── PartnerMetricCard ──────────────────────────────────────────────────────
//
// One card = one partner × one metric (overall OR this-month). Six total
// (3 partners × 2 metrics) per Animesh's 'two columns, 6 cards' spec.

function PartnerMetricCard({
  partner, mode, data, loading, onClick, reduce, delay,
}: {
  partner: PartnerCode
  mode: 'overall' | 'monthly'
  data: Rollup
  loading: boolean
  onClick: () => void
  reduce: boolean | null
  delay: number
}) {
  const color = PARTNER_COLORS[partner]
  const focus = PARTNER_FOCUS[partner]
  const districtList = PARTNER_DISTRICTS[partner]
  const districts = districtList.length
  const MAX_NAMES = 6
  const districtNames = districts <= MAX_NAMES
    ? districtList.join(', ')
    : `${districtList.slice(0, MAX_NAMES).join(', ')} +${districts - MAX_NAMES} more`

  // Pick metric for this card — overall vs monthly.
  const isMonthly = mode === 'monthly'
  const pct = isMonthly ? data.monthlyPercentage : data.percentage
  const hasMetric = isMonthly ? data.monthlyHasTargets : data.hasTargets
  const metricColor = bandColor(pct)
  const modeLabel = isMonthly ? 'THIS MONTH' : 'OVERALL'
  const modeSub   = isMonthly
    ? 'Achievement vs this month\'s target'
    : 'Cumulative achievement vs full programme target'

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: reduce ? 0 : -2 }}
      whileTap={{ scale: 0.985 }}
      className="card"
      style={{
        textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        borderTop: `3px solid ${color}`,
        transitionProperty: 'transform, box-shadow, border-color',
      }}
    >
      {/* Top section — gets the orange wash from the SIMPLE Homepage
          design (.pcard-top with color-mix orange 7% bg). Wraps the
          partner acronym + mode label + big %. */}
      <div style={{
        padding: '18px 20px',
        background: 'color-mix(in srgb, var(--unfpa) 7%, var(--surface))',
        borderBottom: '1px solid var(--hair)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{
              fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
              color: 'var(--ink)', lineHeight: 1,
              display: 'inline-flex', alignItems: 'center', gap: 9,
            }}>
              {/* Small square colour swatch with halo — design's
                  `.pcard-name i` rule. Visual identity inside the
                  orange wash. */}
              <span style={{
                width: 10, height: 10, borderRadius: 3, background: color,
                boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 16%, var(--surface))`,
              }} />
              {partner}
            </div>
            <div className="mono" style={{
              fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.10em',
              marginTop: 6,
            }}>
              {modeLabel}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {loading ? (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>…</span>
            ) : hasMetric && pct != null ? (
              <div style={{
                fontSize: 36, fontWeight: 800, color: metricColor,
                lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              }}>
                {pct}%
              </div>
            ) : (
              <span className="tag amber" style={{ fontSize: 10, fontWeight: 600 }}>
                {isMonthly ? 'Not set' : 'Targets pending'}
              </span>
            )}
          </div>
        </div>

        {/* Focus line stays in the orange-wash top section */}
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45, paddingTop: 8 }}>
          {focus}
        </div>
      </div>

      {/* Content section — neutral background, holds sub-line, progress
          bar, stats, districts. Sits under the orange wash header. */}
      <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {/* Sub-line — what this metric means */}
        <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
          {modeSub}
        </div>

        {/* Progress bar */}
        {hasMetric && pct != null && (
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: metricColor, borderRadius: 999 }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 0.9, delay: reduce ? 0 : delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: 16, fontSize: 11.5, color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {data.hasTargets ? (
            <span>
              <b style={{ color: 'var(--ink)' }}>{data.onTrack}/{data.total}</b> indicators on track
            </span>
          ) : (
            <span>
              <b style={{ color: 'var(--ink)' }}>{data.totalIndicators}</b> indicators · targets pending
            </span>
          )}
          <span><b style={{ color: 'var(--ink)' }}>{districts}</b> districts</span>
        </div>

        {/* District names */}
        <div style={{
          marginTop: 'auto', paddingTop: 8,
          borderTop: '1px dashed var(--hair)',
        }}>
          <div className="mono" style={{
            fontSize: 9, color: 'var(--muted)',
            letterSpacing: '0.08em', marginBottom: 3,
          }}>
            DISTRICTS
          </div>
          <div style={{
            fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.4,
            textWrap: 'pretty',
          } as React.CSSProperties}>
            {districtNames}
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 20px', borderTop: '1px solid var(--hair)',
        background: 'var(--surface-2)', fontSize: 12.5, fontWeight: 600, color,
      }}>
        View dashboard <ArrowRight size={14} />
      </div>
    </motion.button>
  )
}
