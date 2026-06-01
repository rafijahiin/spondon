/**
 * PartnerProgress — Implementing Partners at a Glance.
 *
 * Layout matches SIMPLE Homepage.html (3 cards in one row, This Month
 * and Overall stacked as panels INSIDE each card, uniform orange accent,
 * districts footer + View dashboard button). UNFPA Atkinson stays as
 * the font; light/dark mode both work via theme tokens.
 *
 * Progress is sourced from the IndicatorProgress array loaded on home
 * (/api/indicators/progress/). Geography from partnerDistricts.
 */
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'

import {
  PARTNER_ROUTES, PARTNER_DISTRICTS, type PartnerCode,
} from '@/data/partnerDistricts'
import type { IndicatorProgress } from '@/types'

const PARTNERS: PartnerCode[] = ['CIPRB', 'Bandhu', 'PHD']

const PARTNER_FOCUS: Record<PartnerCode, string> = {
  CIPRB:  'Maternal & child health · Fistula and MPDSR',
  Bandhu: 'Gender Diverse Population',
  PHD:    'Female Sex Workers (FSW)',
}

interface Props { progress: IndicatorProgress[] | null }

interface Rollup {
  hasTargets: boolean
  percentage: number | null
  onTrack: number
  total: number
  totalIndicators: number
  monthlyHasTargets: boolean
  monthlyPercentage: number | null
  monthlyOnTrack: number
}

function rollup(partner: PartnerCode, rows: IndicatorProgress[] | null): Rollup {
  const empty: Rollup = {
    hasTargets: false, percentage: null,
    onTrack: 0, total: 0, totalIndicators: 0,
    monthlyHasTargets: false, monthlyPercentage: null, monthlyOnTrack: 0,
  }
  if (!rows) return empty
  const all = rows.filter(r => r.organisation === partner && !r.unlinked)
  const totalIndicators = all.length
  const withTarget = all.filter(r => r.target_value !== null)
  if (withTarget.length === 0) return { ...empty, totalIndicators }
  const achievement = withTarget.reduce((s, r) => s + (r.achievement ?? 0), 0)
  const target = withTarget.reduce((s, r) => s + (r.target_value ?? 0), 0)
  const percentage = target > 0 ? Math.round((achievement / target) * 1000) / 10 : 0
  const onTrack = withTarget.filter(r => (r.percentage ?? 0) >= 75).length

  const withMonth = all.filter(r => (r.month_target ?? null) !== null)
  let monthlyHasTargets = false
  let monthlyPercentage: number | null = null
  let monthlyOnTrack = 0
  if (withMonth.length > 0) {
    const monthAch = withMonth.reduce((s, r) => s + (r.month_achievement ?? 0), 0)
    const monthTgt = withMonth.reduce((s, r) => s + (r.month_target ?? 0), 0)
    if (monthTgt > 0) {
      monthlyHasTargets = true
      monthlyPercentage = Math.round((monthAch / monthTgt) * 1000) / 10
      monthlyOnTrack = withMonth.filter(r => (r.month_percentage ?? 0) >= 75).length
    }
  }
  return {
    hasTargets: true, percentage,
    onTrack, total: withTarget.length, totalIndicators,
    monthlyHasTargets, monthlyPercentage, monthlyOnTrack,
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

      {/* SIMPLE Homepage.html design — 3 cards in one row, uniform orange
          accent, This Month + Overall stacked as panels inside, districts
          footer + View dashboard button. */}
      <div className="partner-grid">
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
    </section>
  )
}

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
  const focus = PARTNER_FOCUS[partner]
  const districtList = PARTNER_DISTRICTS[partner]
  const districts = districtList.length
  const MAX_NAMES = 6
  const districtNames = districts <= MAX_NAMES
    ? districtList.join(', ')
    : (
      <>
        {districtList.slice(0, MAX_NAMES).join(', ')}{' '}
        <b>+{districts - MAX_NAMES} more</b>
      </>
    )

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className="pcard"
    >
      {/* Top header band — orange wash, partner name + focus + districts chip */}
      <div className="pcard-top">
        <div>
          <div className="pcard-name"><i />{partner}</div>
          <div className="pcard-focus">{focus}</div>
        </div>
        <span className="pcard-dcount">{districts} districts</span>
      </div>

      {/* This Month panel */}
      <ThisMonthPanel data={data} loading={loading} />

      {/* Overall panel */}
      <OverallPanel data={data} loading={loading} />

      {/* Footer — districts + View dashboard button */}
      <div className="pcard-foot">
        <div className="foot-lbl">Districts</div>
        <div className="foot-districts">{districtNames}</div>
        <a
          className="view-link"
          href="#"
          onClick={(e) => { e.preventDefault(); onClick() }}
        >
          View dashboard <ArrowRight size={13} />
        </a>
      </div>
    </motion.div>
  )
}

function ThisMonthPanel({ data, loading }: { data: Rollup; loading: boolean }) {
  return (
    <div className="tf">
      <div className="tf-head">
        <span className="tf-lbl">This month</span>
        {!loading && !data.monthlyHasTargets && (
          <span className="b-notset">Not set</span>
        )}
      </div>
      <div className="tf-desc">Achievement vs this month's target</div>
      {loading ? (
        <div className="tf-row"><span className="tf-stat pending">Loading…</span></div>
      ) : data.monthlyHasTargets ? (
        <>
          <div className="tf-row">
            <span className="tf-stat">
              {data.monthlyOnTrack}/{data.total}{' '}
              <span className="words">indicators on track</span>
            </span>
            <span className="tf-pct">{data.monthlyPercentage}%</span>
          </div>
          <div className="bar">
            <b style={{ width: `${Math.min(data.monthlyPercentage ?? 0, 100)}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="tf-row">
            <span className="tf-stat pending">
              {data.totalIndicators} indicators · targets pending
            </span>
          </div>
          <div className="bar striped" />
        </>
      )}
    </div>
  )
}

function OverallPanel({ data, loading }: { data: Rollup; loading: boolean }) {
  return (
    <div className="tf">
      <div className="tf-head">
        <span className="tf-lbl">Overall</span>
        {!loading && !data.hasTargets && (
          <span className="b-pending">Targets pending</span>
        )}
      </div>
      <div className="tf-desc">Cumulative achievement vs full programme target</div>
      {loading ? (
        <div className="tf-row"><span className="tf-stat pending">Loading…</span></div>
      ) : data.hasTargets ? (
        <>
          <div className="tf-row">
            <span className="tf-stat">
              {data.onTrack}/{data.total}{' '}
              <span className="words">indicators on track</span>
            </span>
            <span className="tf-pct">{data.percentage}%</span>
          </div>
          <div className="bar">
            <b style={{ width: `${Math.min(data.percentage ?? 0, 100)}%` }} />
          </div>
        </>
      ) : (
        <>
          <div className="tf-row">
            <span className="tf-stat pending">
              {data.totalIndicators} indicators · targets pending
            </span>
          </div>
          <div className="bar striped" />
        </>
      )}
    </div>
  )
}
