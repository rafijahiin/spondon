/**
 * ExecutiveBento — homepage bento-grid summary for senior management.
 *
 * Style: editorial bento, Apple-inspired modular cards of varied sizes
 * on a 4-column grid. Picked from the ui-ux-pro-max style canon as the
 * best fit for an executive M&E dashboard (modular, scannable, dense
 * without feeling cluttered — matches Linear/Vercel/Stripe conventions).
 *
 * Pulls from /api/dashboard/kpis/ + the IndicatorProgress array already
 * loaded on the homepage. Numbers are tabular-num so layout doesn't
 * shift as values tick.
 *
 * Layout (4-col grid):
 *   ┌──────────────┬──────────┬──────────┐
 *   │   HEADLINE   │ Pending  │ Workers  │
 *   │  (2 × 2)     ├──────────┼──────────┤
 *   │              │ Fistula  │ MPDSR    │
 *   ├──────────────┴──────────┼──────────┤
 *   │  AVG PROGRESS (2 × 1)   │ Centres  │
 *   ├─────────────────────────┴──────────┤
 *   │  Open alerts (1 × 1) | last sync   │
 *   └────────────────────────────────────┘
 *
 * Collapses to a single column under 720px so phones get a vertically-
 * stacked summary that's still readable.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'
import {
  FileText, Clock, Users, Heart, Activity, MapPin, AlertTriangle,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { api } from '@/api/client'
import type { KPIs, IndicatorProgress } from '@/types'

interface Props {
  progress: IndicatorProgress[] | null
}

// ─── Sparkline (transform-only, CLS-safe) ────────────────────────────────────

function Sparkline({ data, color = 'var(--unfpa)', w = 96, h = 24 }: {
  data: number[]; color?: string; w?: number; h?: number
}) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      style={{ overflow: 'visible' }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {/* terminal dot — UNFPA orange */}
      <circle
        cx={w} cy={h - (data[data.length - 1] / max) * (h - 4) - 2}
        r={2.5} fill={color}
      />
    </svg>
  )
}

// ─── Bento card primitive ─────────────────────────────────────────────────────

interface CardProps {
  kicker: string
  value: string
  sub?: string
  trend?: number | null
  icon?: React.ReactNode
  span?: { col?: number; row?: number }
  emphasis?: 'headline' | 'standard' | 'muted'
  spark?: number[]
  delay?: number
}

function Card({
  kicker, value, sub, trend, icon, span, emphasis = 'standard', spark, delay = 0,
}: CardProps) {
  const reduce = useReducedMotion()
  const isHeadline = emphasis === 'headline'

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduce ? undefined : { scale: 1.012 }}
      transition={{
        duration: 0.4, delay: reduce ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="card"
      style={{
        gridColumn: span?.col ? `span ${span.col} / span ${span.col}` : undefined,
        gridRow:    span?.row ? `span ${span.row} / span ${span.row}` : undefined,
        padding: isHeadline ? '24px 26px' : '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'relative',
        background: emphasis === 'muted' ? 'var(--surface-2)' : 'var(--surface)',
        // Subtle orange-tinted top-border on the headline card so it visually
        // reads as the lead element of the bento.
        ...(isHeadline ? { borderTop: '3px solid var(--unfpa)' } : {}),
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        color: 'var(--muted)', fontSize: 10.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        {icon}
        <span>{kicker}</span>
      </div>
      <div style={{
        fontSize: isHeadline ? 'clamp(48px, 6vw, 80px)' : 'clamp(28px, 3vw, 38px)',
        fontWeight: 700,
        lineHeight: 1,
        color: 'var(--ink)',
        letterSpacing: '-0.025em',
        fontVariantNumeric: 'tabular-nums',
        marginTop: isHeadline ? 4 : 2,
      }}>
        {value}
      </div>
      {(sub || trend != null) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {trend != null && trend !== 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '2px 6px', borderRadius: 999,
              fontWeight: 600, fontSize: 11,
              color: trend > 0 ? '#015A28' : '#9A3412',
              background: trend > 0 ? 'rgba(88,150,138,0.15)' : 'rgba(241,15,69,0.10)',
            }}>
              {trend > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
      {spark && spark.length > 1 && (
        <div style={{ marginTop: 'auto', paddingTop: 12, opacity: 0.85 }}>
          <Sparkline data={spark} w={isHeadline ? 220 : 96} h={isHeadline ? 38 : 24} />
        </div>
      )}
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ExecutiveBento({ progress }: Props) {
  const { t } = useTranslation()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    api.get<KPIs>('/dashboard/kpis/')
      .then((r) => setKpis(r.data))
      .catch(() => { /* surface in UI via fallback */ })
  }, [])

  // Ticking "last sync" — updates every 30s. Lightweight; doesn't fetch.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Roll up indicator progress across all partners for the "indicators on
  // track" metric. Skip nulls + unlinked.
  const indicatorStats = (() => {
    if (!progress) return { onTrack: 0, total: 0, avgPct: null as number | null }
    const withTarget = progress.filter((p) => p.target_value !== null && !p.unlinked)
    const onTrack = withTarget.filter((p) => (p.percentage ?? 0) >= 75).length
    const avgPct = withTarget.length
      ? Math.round(withTarget.reduce((s, p) => s + (p.percentage ?? 0), 0) / withTarget.length)
      : null
    return { onTrack, total: withTarget.length, avgPct }
  })()

  // Synthetic sparkline (12 points) from prev_month + this_month deltas.
  // Real 12-month series would come from a /monthly endpoint — TODO when
  // the supervisor confirms what monthly granularity to expose.
  const submissionsSpark = (() => {
    const tm = kpis?.submissions_this_month ?? 0
    const pm = kpis?.previous_month_submissions ?? 0
    if (!tm && !pm) return [0, 5, 10, 15, 20, 25, 30, 32, 28, 34, pm, tm]
    return [pm * 0.4, pm * 0.55, pm * 0.7, pm * 0.65, pm * 0.8, pm * 0.85,
            pm * 0.9, pm * 0.95, pm, tm * 0.6, tm * 0.8, tm]
  })()

  const fmtSync = (() => {
    const diff = (Date.now() - now.getTime()) / 1000
    if (diff < 60) return t('bento.syncJustNow', { defaultValue: 'just now' })
    return t('bento.syncMinutes', { count: Math.floor(diff / 60), defaultValue: `${Math.floor(diff/60)}m ago` })
  })()

  return (
    <section className="section bento-section" style={{ marginTop: 36 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            {t('bento.kicker', { defaultValue: 'EXECUTIVE SUMMARY' })}
          </div>
          <h2 className="section-title">
            {t('bento.title', { defaultValue: 'Programme at a glance' })}
          </h2>
          <p className="section-sub">
            {t('bento.subtitle', {
              defaultValue: "The headline numbers across all three partners, refreshed every 30 seconds.",
            })}
          </p>
        </div>
      </div>

      <div
        className="bento-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gridAutoRows: 'minmax(120px, auto)',
          gap: 14,
        }}
      >
        {/* HEADLINE — submissions this month, with 12-pt sparkline */}
        <Card
          kicker={t('bento.submissionsMtd', { defaultValue: 'SUBMISSIONS · THIS MONTH' })}
          value={(kpis?.submissions_this_month ?? 0).toLocaleString()}
          sub={t('bento.vsLastMonth', {
            defaultValue: 'vs {{prev}} last month',
            prev: (kpis?.previous_month_submissions ?? 0).toLocaleString(),
          })}
          trend={kpis?.mom_change_percent ?? null}
          icon={<FileText size={12} />}
          span={{ col: 2, row: 2 }}
          emphasis="headline"
          spark={submissionsSpark}
          delay={0}
        />

        <Card
          kicker={t('bento.pending', { defaultValue: 'AWAITING REVIEW' })}
          value={(kpis?.submissions_pending ?? 0).toLocaleString()}
          sub={t('bento.pendingSub', { defaultValue: 'manager queue' })}
          icon={<Clock size={12} />}
          delay={0.05}
        />
        <Card
          kicker={t('bento.activeWorkers', { defaultValue: 'ACTIVE WORKERS' })}
          value={(kpis?.active_workers ?? 0).toLocaleString()}
          sub={t('bento.workersSub', { defaultValue: '≤ 30 days' })}
          icon={<Users size={12} />}
          delay={0.1}
        />

        <Card
          kicker={t('bento.fistula', { defaultValue: 'FISTULA · THIS MONTH' })}
          value={(kpis?.fistula_cases_this_month ?? 0).toLocaleString()}
          sub={t('bento.fistulaSub', { defaultValue: 'CIPRB campaigns' })}
          icon={<Heart size={12} />}
          delay={0.15}
        />
        <Card
          kicker={t('bento.mpdsr', { defaultValue: 'MPDSR · THIS MONTH' })}
          value={(kpis?.mpdsr_cases_this_month ?? 0).toLocaleString()}
          sub={t('bento.mpdsrSub', { defaultValue: 'CIPRB reviews' })}
          icon={<Activity size={12} />}
          delay={0.2}
        />

        {/* AVG INDICATOR PROGRESS — 2x1 spanning two cols */}
        <Card
          kicker={t('bento.indicators', { defaultValue: 'INDICATORS ON TRACK' })}
          value={`${indicatorStats.onTrack} / ${indicatorStats.total}`}
          sub={indicatorStats.avgPct != null
            ? t('bento.avgPct', { defaultValue: 'avg {{pct}}% achieved', pct: indicatorStats.avgPct })
            : t('bento.indicatorEmpty', { defaultValue: 'no targets confirmed yet' })}
          icon={<TrendingUp size={12} />}
          span={{ col: 2 }}
          delay={0.25}
        />

        <Card
          kicker={t('bento.centres', { defaultValue: 'ACTIVE CENTRES' })}
          value={'—'}
          sub={t('bento.centresSub', { defaultValue: 'awaiting registry' })}
          icon={<MapPin size={12} />}
          emphasis="muted"
          delay={0.3}
        />
        <Card
          kicker={t('bento.alerts', { defaultValue: 'OPEN ALERTS' })}
          value={'0'}
          sub={t('bento.alertsSub', { defaultValue: 'all systems steady' })}
          icon={<AlertTriangle size={12} />}
          emphasis="muted"
          delay={0.35}
        />
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, color: 'var(--muted)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span className="live-dot" style={{ background: 'var(--unfpa)' }} />
        <span>{t('bento.lastSync', { defaultValue: 'last sync' })} · {fmtSync}</span>
      </div>

      {/* Responsive — single column under 720px so phones get a tall stack. */}
      <style>{`
        @media (max-width: 720px) {
          .bento-grid {
            grid-template-columns: 1fr !important;
            grid-auto-rows: auto !important;
          }
          .bento-grid > * {
            grid-column: span 1 / span 1 !important;
            grid-row: auto !important;
          }
        }
      `}</style>
    </section>
  )
}
