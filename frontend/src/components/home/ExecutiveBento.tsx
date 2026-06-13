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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
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
  if (pct >= 75) return '#58968A'
  if (pct >= 40) return '#AE4300'
  return '#F10F45'
}

// ─── Bento card primitive ─────────────────────────────────────────────────────

interface CardProps {
  kicker: React.ReactNode
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
  // Animesh's MoM comparison toggle — flip the SUBMISSIONS · THIS MONTH
  // card between absolute counts (default) and percentage-change view.
  const [momMode, setMomMode] = useState<'abs' | 'pct'>('abs')

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
  // Status bands feed the headline pie chart per Animesh's preference for
  // graphical breakdowns over a single raw percentage.
  const stats = (() => {
    const empty = {
      onTrack: 0, behind: 0, critical: 0, notStarted: 0, pending: 0,
      total: 0, totalIndicators: 0,
      avgPct: null as number | null, overallPct: null as number | null,
    }
    if (!progress) return empty
    const all = progress.filter((p) => !p.unlinked)
    const withTarget = all.filter((p) => p.target_value !== null)
    const pending = all.length - withTarget.length
    if (withTarget.length === 0) return { ...empty, pending, totalIndicators: all.length }

    let onTrack = 0, behind = 0, critical = 0, notStarted = 0
    for (const p of withTarget) {
      const pct = p.percentage ?? 0
      if (pct === 0) notStarted++
      else if (pct >= 75) onTrack++
      else if (pct >= 40) behind++
      else critical++
    }
    const avgPct = Math.round(withTarget.reduce((s, p) => s + (p.percentage ?? 0), 0) / withTarget.length)
    const totalAch = withTarget.reduce((s, p) => s + (p.achievement ?? 0), 0)
    const totalTgt = withTarget.reduce((s, p) => s + (p.target_value ?? 0), 0)
    const overallPct = totalTgt > 0 ? Math.round((totalAch / totalTgt) * 1000) / 10 : null
    return {
      onTrack, behind, critical, notStarted, pending,
      total: withTarget.length, totalIndicators: all.length,
      avgPct, overallPct,
    }
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

  // Render a PHD/Bandhu major-indicator card from the loaded progress array:
  // cumulative achievement vs the programme target, with a status-banded bar.
  const indCard = (org: PartnerCode, code: string, label: string, note: string, delay: number) => {
    const p = (progress ?? []).find(r => r.organisation === org && r.activity_code === code)
    const ach = typeof p?.achievement === 'number' ? p.achievement : 0
    const tgt = p?.target_value ?? null
    const pct = p?.percentage ?? null
    return (
      <Card
        key={`${org}-${code}`}
        kicker={label.toUpperCase()}
        value={fmtNum(ach)}
        sub={tgt != null ? `of ${fmtNum(tgt)} · ${note}` : note}
        progressPct={pct}
        progressColor={bandColor(pct)}
        delay={delay}
      />
    )
  }

  return (
    <section className="section bento-section" style={{ marginTop: 36 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            {t('bento.kicker', { defaultValue: 'EXECUTIVE SUMMARY' })}
          </div>
          <h2 className="section-title">
            {t('bento.title', { defaultValue: 'Executive summary' })}
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
        {/* ProgrammeAttainmentPie removed — Animesh: "heavily confusing".
            Programme totals + dual cumulative/monthly progress on each
            indicator card carry the equivalent information without the
            5-slice pie. ProgrammeAttainmentPie component definition is
            still in this file (unused) — safe to delete in a later sweep. */}

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
          kicker={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {t('bento.submissionsMtd', { defaultValue: 'SUBMISSIONS · THIS MONTH' })}
              {/* Animesh's MoM toggle. Click to flip the value between
                  absolute MTD count and % change vs previous month. */}
              <button
                onClick={(e) => {
                  e.preventDefault()
                  setMomMode(m => m === 'abs' ? 'pct' : 'abs')
                }}
                style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 999,
                  background: momMode === 'pct' ? 'var(--unfpa)' : 'var(--surface-2)',
                  color: momMode === 'pct' ? '#fff' : 'var(--ink-3)',
                  border: '1px solid var(--hair)', cursor: 'pointer',
                  fontWeight: 700, letterSpacing: '0.06em',
                }}
                title={t('bento.momToggleTooltip', { defaultValue: 'Toggle absolute / percentage' })}
              >
                {momMode === 'abs' ? '%' : '#'}
              </button>
            </span>
          }
          value={momMode === 'abs'
            ? fmtNum(kpis?.submissions_this_month ?? 0)
            : (kpis?.mom_change_percent != null
                ? `${kpis.mom_change_percent > 0 ? '+' : ''}${kpis.mom_change_percent.toFixed(0)}%`
                : '—')
          }
          sub={momMode === 'abs'
            ? t('bento.vsLastMonth', {
                defaultValue: 'vs {{prev}} last month',
                prev: fmtNum(kpis?.previous_month_submissions ?? 0),
              })
            : t('bento.momPctSub', {
                defaultValue: '{{cur}} this month vs {{prev}} last month',
                cur: fmtNum(kpis?.submissions_this_month ?? 0),
                prev: fmtNum(kpis?.previous_month_submissions ?? 0),
              })
          }
          trend={momMode === 'abs' ? (kpis?.mom_change_percent ?? null) : null}
          icon={<FileText size={12} />}
          delay={0.2}
        />

      </div>

      {/* ── MAJOR INDICATORS · ALL PARTNERS · TILL DATE ──────────────────
          Merged into the executive summary so the headline status (above) and
          the programme's signature numbers read as one block. Two reach metrics
          each for PHD & Bandhu (cumulative vs target, with a bar); four CIPRB
          surveillance outputs (counts — CIPRB targets are not set). */}
      <div className="kicker" style={{ margin: '30px 0 12px' }}>
        <span className="dot" style={{ background: 'var(--unfpa)' }} />
        {t('bento.majorKicker', { defaultValue: 'MAJOR INDICATORS · ALL PARTNERS · TILL DATE' })}
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
        {/* PHD — reach + GBV */}
        {indCard('PHD', 'SL1', 'PHD · FSWs reached', 'HIV/STI screening & FP', 0.05)}
        {indCard('PHD', 'SL2', 'PHD · GBV survivors', 'supported & referred', 0.1)}
        {/* Bandhu — reach + GBV */}
        {indCard('Bandhu', '1.1', 'Bandhu · KP reached', 'HIV prevention services', 0.15)}
        {indCard('Bandhu', '1.2', 'Bandhu · GBV survivors', 'supported & referred', 0.2)}
        {/* CIPRB — fistula outcomes + maternal surveillance (counts) */}
        <Card
          kicker="CIPRB · FISTULA REPAIRED"
          value={fmtNum(kpis?.fistula_repaired ?? 0)}
          sub={t('bento.fistulaRepairedSub', { defaultValue: 'surgically repaired (dry + not-dry)' })}
          icon={<Heart size={12} />}
          delay={0.25}
        />
        <Card
          kicker="CIPRB · REHABILITATED"
          value={fmtNum(kpis?.fistula_reintegrated ?? 0)}
          sub={t('bento.fistulaReintegratedSub', { defaultValue: '& reintegrated' })}
          icon={<Users size={12} />}
          delay={0.3}
        />
        <Card
          kicker="CIPRB · NEAR-MISS CASES"
          value={fmtNum(kpis?.near_miss_total ?? 0)}
          sub={t('bento.nearMissSub', { defaultValue: 'maternal near-miss (WHO MNM)' })}
          icon={<Activity size={12} />}
          delay={0.35}
        />
        <Card
          kicker="CIPRB · MATERNAL DEATHS REVIEWED"
          value={fmtNum(kpis?.total_md_reviewed ?? 0)}
          sub={t('bento.mdReviewedSub', {
            defaultValue: 'of {{n}} notified',
            n: fmtNum(kpis?.total_md_notified ?? 0),
          })}
          icon={<ShieldAlert size={12} />}
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


// ─── Programme Attainment pie chart (replaces the big-percent headline) ──────

interface AttainStats {
  onTrack: number
  behind: number
  critical: number
  notStarted: number
  pending: number
  total: number
  totalIndicators: number
  overallPct: number | null
}

interface PartnerRow {
  code: PartnerCode
  totalIndicators: number
  withTarget: number
  onTrack: number
  hasTargets: boolean
}

const STATUS_COLORS = {
  onTrack:    '#58968A',  // deep green
  behind:     '#AE4300',  // deep amber
  critical:   '#F10F45',  // deep red
  notStarted: '#9CA3AF',  // neutral grey
  pending:    'var(--muted-3)', // very faint — no target yet
}

function ProgrammeAttainmentPie({
  stats, perPartner, t,
}: {
  stats: AttainStats
  perPartner: PartnerRow[]
  t: (key: string, opts?: any) => string
}) {
  const reduce = useReducedMotion()
  const total = stats.onTrack + stats.behind + stats.critical + stats.notStarted + stats.pending
  const slices = [
    { name: 'On track (≥ 75%)',      value: stats.onTrack,    color: STATUS_COLORS.onTrack },
    { name: 'Behind (40–74%)',       value: stats.behind,     color: STATUS_COLORS.behind },
    { name: 'Critical (< 40%)',      value: stats.critical,   color: STATUS_COLORS.critical },
    { name: 'Not yet started (0%)',  value: stats.notStarted, color: STATUS_COLORS.notStarted },
    { name: 'Targets pending',       value: stats.pending,    color: STATUS_COLORS.pending },
  ].filter(s => s.value > 0)

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="card"
      style={{
        gridColumn: 'span 2 / span 2',
        gridRow: 'span 2 / span 2',
        padding: '24px 26px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        background: 'var(--surface)',
        borderTop: '3px solid var(--unfpa)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        color: 'var(--muted)', fontSize: 10.5, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <Target size={12} />
        <span>{t('bento.attainment', { defaultValue: 'PROGRAMME ATTAINMENT · ALL PARTNERS' })}</span>
      </div>

      {/* Pie + legend */}
      {total > 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
        }}>
          {/* Donut */}
          <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={56} outerRadius={86}
                  paddingAngle={2} stroke="none"
                  startAngle={90} endAngle={-270}
                  animationDuration={reduce ? 0 : 800}
                >
                  {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
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
                fontSize: 30, fontWeight: 800, lineHeight: 1, color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em',
              }}>
                {stats.totalIndicators}
              </span>
              <span className="mono" style={{
                fontSize: 9, color: 'var(--muted)',
                letterSpacing: '0.08em', marginTop: 4,
              }}>
                INDICATORS
              </span>
            </div>
          </div>

          {/* Legend */}
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slices.map(s => (
              <div key={s.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 12.5,
              }}>
                <span style={{
                  width: 11, height: 11, borderRadius: 3,
                  background: s.color, flexShrink: 0,
                }} />
                <span style={{ flex: 1, color: 'var(--ink-2)' }}>{s.name}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
                  {s.value}
                </b>
                <span className="mute" style={{
                  fontSize: 11, width: 40, textAlign: 'right',
                  color: 'var(--muted)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {total ? Math.round((s.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted)', fontSize: 13,
        }}>
          Targets confirmed in the workshop — pie chart lights up once set.
        </div>
      )}

      {/* Per-partner footer */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 7,
        paddingTop: 14, borderTop: '1px solid var(--hair)', marginTop: 'auto',
      }}>
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
    </motion.div>
  )
}
