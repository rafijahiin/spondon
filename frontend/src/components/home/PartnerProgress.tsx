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
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'

import {
  PARTNER_COLORS, PARTNER_NAMES, PARTNER_ROUTES, PARTNER_DISTRICTS,
  type PartnerCode,
} from '@/data/partnerDistricts'
import type { IndicatorProgress } from '@/types'

const PARTNERS: PartnerCode[] = ['CIPRB', 'Bandhu', 'PHD']

const PARTNER_FULL_NAME: Record<PartnerCode, string> = {
  CIPRB:  'Centre for Injury Prevention & Research, Bangladesh',
  Bandhu: 'Bandhu Social Welfare Society',
  PHD:    'Partners in Health and Development',
}

const PARTNER_FOCUS: Record<PartnerCode, string> = {
  CIPRB:  'Maternal & child health · fistula and MPDSR surveillance',
  Bandhu: 'Key-population HIV / STI outreach & counselling',
  PHD:    'Sex-worker & maternal health service delivery',
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
  }
  if (!rows) return empty
  const all = rows.filter((r) => r.organisation === partner && !r.unlinked)
  const totalIndicators = all.length
  const withTarget = all.filter((r) => r.target_value !== null)
  if (withTarget.length === 0) return { ...empty, totalIndicators }
  const achievement = withTarget.reduce((s, r) => s + (r.achievement ?? 0), 0)
  const target = withTarget.reduce((s, r) => s + (r.target_value ?? 0), 0)
  const percentage = target > 0 ? Math.round((achievement / target) * 1000) / 10 : 0
  const onTrack = withTarget.filter((r) => (r.percentage ?? 0) >= 75).length
  return { hasTargets: true, percentage, achievement, target, onTrack, total: withTarget.length, totalIndicators }
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
          <h2 className="section-title">Three partners at a glance</h2>
          <p className="section-sub">
            Each partner's progress against its own targets — "on track" means an
            indicator has reached ≥ 75% of target.
          </p>
        </div>
      </div>

      <div
        className="partner-progress-grid"
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
        }}
      >
        {PARTNERS.map((p, i) => (
          <PartnerCard
            key={p}
            partner={p}
            data={rollup(p, progress)}
            loading={progress === null}
            delay={i * 0.08}
            reduce={reduce}
            onClick={() => navigate(PARTNER_ROUTES[p])}
          />
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

// ─── PartnerCard ────────────────────────────────────────────────────────────

function PartnerCard({
  partner, data, loading, onClick, reduce, delay,
}: {
  partner: PartnerCode
  data: Rollup
  loading: boolean
  onClick: () => void
  reduce: boolean | null
  delay: number
}) {
  const color = PARTNER_COLORS[partner]
  const names = PARTNER_NAMES[partner]
  const focus = PARTNER_FOCUS[partner]
  const districts = PARTNER_DISTRICTS[partner].length
  const pctColor = bandColor(data.percentage)

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
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {/* Acronym + attainment */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)', lineHeight: 1 }}>
              {partner}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.3, marginTop: 5, maxWidth: 200, textWrap: 'pretty' } as React.CSSProperties}>
              {PARTNER_FULL_NAME[partner]}
            </div>
            <div className="bn" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {names.bn}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {loading ? (
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>…</span>
            ) : data.hasTargets ? (
              <>
                <div style={{
                  fontSize: 30, fontWeight: 700, color: pctColor,
                  lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                }}>
                  {data.percentage}%
                </div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.08em', marginTop: 3 }}>
                  TO TARGET
                </div>
              </>
            ) : (
              <span className="tag amber" style={{ fontSize: 10, fontWeight: 600 }}>
                Targets pending
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {data.hasTargets && (
          <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: pctColor, borderRadius: 999 }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(data.percentage ?? 0, 100)}%` }}
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

        {/* Focus */}
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45, marginTop: 'auto', paddingTop: 4 }}>
          {focus}
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
