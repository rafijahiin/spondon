/**
 * ExecutiveBento — homepage bento-grid summary for senior decision-makers.
 *
 * Audience: UNFPA + CIPRB leadership (Dr. Animesh, Dr. Sayeed) and partner
 * org leads. They open this to answer one question: "is the programme on
 * track, and is anything on fire?" — NOT to count individual submissions.
 *
 * So the grid LEADS with programme target attainment (the decision metric),
 * then surfaces what needs attention (open alerts, awaiting review,
 * indicators on track), then the headline outcome counts (GBV, fistula,
 * MPDSR) and field activity (submissions, active workers).
 *
 * Everything is real:
 *   - Attainment + indicators on track  ← IndicatorProgress (already loaded)
 *   - Submissions / pending / workers / outcomes  ← /api/dashboard/kpis/
 *   - Open alerts  ← /api/dashboard/alerts/?acknowledged=false
 * No hardcoded placeholders, no synthetic sparkline.
 *
 * Partner-by-partner attainment lives in the Partner Roll-up section below
 * this component, so the Bento deliberately does NOT repeat per-partner %.
 *
 * Collapses to a single column under 720px.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'
import {
  FileText, Clock, Users, Heart, Activity, AlertTriangle,
  TrendingUp, TrendingDown, Target, ShieldAlert,
} from 'lucide-react'
import { api } from '@/api/client'
import { PARTNER_COLORS, type PartnerCode } from '@/data/partnerDistricts'
import type { KPIs, IndicatorProgress, Alert } from '@/types'

const PARTNERS: PartnerCode[] = ['PHD', 'Bandhu', 'CIPRB']

interface Props {
  progress: IndicatorProgress[] | null
}

// Status band colour for an attainment percentage (UNFPA data-viz palette).
function bandColor(pct: number | null): string {
  if (pct == null || pct === 0) return 'var(--muted)'   // no data / not started
  if (pct >= 75) return '#1A7A5A'
  if (pct >= 40) return '#CC6A00'
  return '#C7172E'
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
  valueColor?: string
  progressPct?: number | null    // headline progress bar (0–100)
  progressColor?: string
  footer?: React.ReactNode       // extra content (e.g. per-partner breakdown)
  delay?: number
}

function Card({
  kicker, value, sub, trend, icon, span, emphasis = 'standard',
  valueColor, progressPct, progressColor, footer, delay = 0,
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
        color: valueColor ?? 'var(--ink)',
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
      {footer}
      {progressPct != null && (
        <div style={{
          marginTop: 'auto', paddingTop: 16,
          height: 8, background: 'var(--surface-3)',
          borderRadius: 999, overflow: 'hidden',
        }}>
          <motion.div
            style={{ height: '100%', background: progressColor ?? 'var(--unfpa)', borderRadius: 999 }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progressPct, 100)}%` }}
            transition={{ duration: 0.9, delay: reduce ? 0 : delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ExecutiveBento({ progress }: Props) {
  const { t, i18n } = useTranslation()
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [openAlerts, setOpenAlerts] = useState<number | null>(null)
  const [now, setNow] = useState(new Date())

  const fmtNum = (n: number) =>
    n.toLocaleString(i18n.language?.startsWith('bn') ? 'bn-BD' : 'en-US')

  // Fetch KPIs + open-alert count, then re-poll every 30s so the cards
  // (e.g. AWAITING REVIEW) actually stay live — matching the section's
  // "refreshed every 30 seconds" promise. Previously this ran once on mount,
  // so a new pending submission never appeared until a full page reload.
  useEffect(() => {
    let cancelled = false
    const fetchAll = () => {
      api.get<KPIs>('/dashboard/kpis/')
        .then((r) => { if (!cancelled) setKpis(r.data) })
        .catch(() => { /* fallback handled by ?? 0 in render */ })
      api.get('/dashboard/alerts/?acknowledged=false')
        .then((r) => {
          if (cancelled) return
          const list = Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
          setOpenAlerts((list as Alert[]).length)
        })
        .catch(() => { if (!cancelled) setOpenAlerts(null) })
    }
    fetchAll()
    const id = setInterval(() => { fetchAll(); setNow(new Date()) }, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // ── Programme attainment + indicators on track (the decision metrics) ──
  const stats = (() => {
    if (!progress) return { onTrack: 0, total: 0, avgPct: null as number | null, overallPct: null as number | null }
    const withTarget = progress.filter((p) => p.target_value !== null && !p.unlinked)
    if (withTarget.length === 0) return { onTrack: 0, total: 0, avgPct: null, overallPct: null }
    const onTrack = withTarget.filter((p) => (p.percentage ?? 0) >= 75).length
    const avgPct = Math.round(withTarget.reduce((s, p) => s + (p.percentage ?? 0), 0) / withTarget.length)
    const totalAch = withTarget.reduce((s, p) => s + (p.achievement ?? 0), 0)
    const totalTgt = withTarget.reduce((s, p) => s + (p.target_value ?? 0), 0)
    const overallPct = totalTgt > 0 ? Math.round((totalAch / totalTgt) * 1000) / 10 : null
    return { onTrack, total: withTarget.length, avgPct, overallPct }
  })()

  // Per-partner breakdown so "whose indicators?" is answered in place.
  const perPartner = PARTNERS.map((code) => {
    const rows = (progress ?? []).filter((p) => p.organisation === code && !p.unlinked)
    const withTarget = rows.filter((p) => p.target_value !== null)
    const onTrack = withTarget.filter((p) => (p.percentage ?? 0) >= 75).length
    return {
      code,
      totalIndicators: rows.length,
      withTarget: withTarget.length,
      onTrack,
      hasTargets: withTarget.length > 0,
    }
  })

  const hasTargets = stats.overallPct != null
  const attainColor = bandColor(stats.overallPct)

  const fmtSync = (() => {
    const diff = (Date.now() - now.getTime()) / 1000
    if (diff < 60) return t('bento.syncJustNow', { defaultValue: 'just now' })
    return t('bento.syncMinutes', { count: Math.floor(diff / 60), defaultValue: `${Math.floor(diff / 60)}m ago` })
  })()

  const alertsValue = openAlerts == null ? '—' : fmtNum(openAlerts)
  const alertsCritical = (openAlerts ?? 0) > 0

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
              defaultValue: 'Is the programme on track, and does anything need attention — refreshed every 30 seconds.',
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
        {/* HEADLINE — programme target attainment (all partners combined),
            with a per-partner breakdown so "whose indicators?" is answered
            right here. */}
        <Card
          kicker={t('bento.attainment', { defaultValue: 'PROGRAMME ATTAINMENT · ALL PARTNERS' })}
          value={hasTargets ? `${stats.overallPct}%` : '—'}
          sub={hasTargets
            ? t('bento.attainmentSub', {
                defaultValue: '{{onTrack}} of {{total}} indicators ≥ 75% of target',
                onTrack: stats.onTrack, total: stats.total,
              })
            : t('bento.attainmentPending', { defaultValue: 'targets confirmed in the workshop — lights up once set' })}
          icon={<Target size={12} />}
          span={{ col: 2, row: 2 }}
          emphasis="headline"
          valueColor={hasTargets ? attainColor : 'var(--muted)'}
          progressPct={hasTargets ? stats.overallPct : null}
          progressColor={attainColor}
          footer={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
              {perPartner.map((p) => (
                <div key={p.code} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12.5, color: 'var(--ink-2)',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                    background: PARTNER_COLORS[p.code],
                  }} />
                  <span style={{ fontWeight: 600, minWidth: 54, color: 'var(--ink)' }}>{p.code}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {p.hasTargets
                      ? `${p.onTrack} / ${p.withTarget} indicators on track`
                      : `${p.totalIndicators} indicators · targets pending`}
                  </span>
                </div>
              ))}
            </div>
          }
          delay={0}
        />

        {/* What needs attention — top-right */}
        <Card
          kicker={t('bento.alerts', { defaultValue: 'OPEN ALERTS' })}
          value={alertsValue}
          sub={alertsCritical
            ? t('bento.alertsActive', { defaultValue: 'need attention' })
            : t('bento.alertsSteady', { defaultValue: 'all systems steady' })}
          icon={<AlertTriangle size={12} />}
          valueColor={alertsCritical ? '#F10F45' : undefined}
          emphasis={alertsCritical ? 'standard' : 'muted'}
          delay={0.05}
        />
        <Card
          kicker={t('bento.pending', { defaultValue: 'AWAITING REVIEW' })}
          value={fmtNum(kpis?.submissions_pending ?? 0)}
          sub={t('bento.pendingSub', { defaultValue: 'manager queue' })}
          icon={<Clock size={12} />}
          delay={0.1}
        />

        {/* Indicators on track + submissions activity */}
        <Card
          kicker={t('bento.indicators', { defaultValue: 'INDICATORS ON TRACK' })}
          value={hasTargets ? `${stats.onTrack} / ${stats.total}` : '—'}
          sub={hasTargets
            ? t('bento.indicatorsSub', { defaultValue: '≥ 75% of target' })
            : t('bento.indicatorEmpty', { defaultValue: 'no targets confirmed yet' })}
          icon={<TrendingUp size={12} />}
          delay={0.15}
        />
        <Card
          kicker={t('bento.submissionsMtd', { defaultValue: 'SUBMISSIONS · THIS MONTH' })}
          value={fmtNum(kpis?.submissions_this_month ?? 0)}
          sub={t('bento.vsLastMonth', {
            defaultValue: 'vs {{prev}} last month',
            prev: fmtNum(kpis?.previous_month_submissions ?? 0),
          })}
          trend={kpis?.mom_change_percent ?? null}
          icon={<FileText size={12} />}
          delay={0.2}
        />

        {/* Outcome counts + field activity — bottom row */}
        <Card
          kicker={t('bento.gbv', { defaultValue: 'GBV CASES · THIS MONTH' })}
          value={fmtNum(kpis?.gbv_cases_this_month ?? 0)}
          sub={t('bento.gbvSub', { defaultValue: 'referral protocol' })}
          icon={<ShieldAlert size={12} />}
          delay={0.25}
        />
        <Card
          kicker={t('bento.fistula', { defaultValue: 'FISTULA · THIS MONTH' })}
          value={fmtNum(kpis?.fistula_cases_this_month ?? 0)}
          sub={t('bento.fistulaSub', { defaultValue: 'CIPRB campaigns' })}
          icon={<Heart size={12} />}
          delay={0.3}
        />
        <Card
          kicker={t('bento.mpdsr', { defaultValue: 'MPDSR · THIS MONTH' })}
          value={fmtNum(kpis?.mpdsr_cases_this_month ?? 0)}
          sub={t('bento.mpdsrSub', { defaultValue: 'CIPRB reviews' })}
          icon={<Activity size={12} />}
          delay={0.35}
        />
        <Card
          kicker={t('bento.activeWorkers', { defaultValue: 'ACTIVE WORKERS' })}
          value={fmtNum(kpis?.active_workers ?? 0)}
          sub={t('bento.workersSub', { defaultValue: '≤ 30 days' })}
          icon={<Users size={12} />}
          delay={0.4}
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
