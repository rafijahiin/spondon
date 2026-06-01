/**
 * OrgDashboard — editorial light console for PHD and Bondhu.
 *
 * Matches the design prototype: hero section with partner headline,
 * KPI tiles, stacked area chart, form grid, and centres table.
 *
 * Data hierarchy:
 *  1. Real programs API (/api/dashboard/programs-summary/) — used when total > 0
 *  2. Mock data from mockDashboardData.ts — used while no real submissions exist
 */
import { useState, useEffect } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import {
  AreaChart, Area,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, TrendingUp, TrendingDown,
  Stethoscope, HeartHandshake, Megaphone,
  FileText, Heart,
  Info,
} from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { BangladeshMap } from '@/components/maps/BangladeshMap'
import { IndicatorGrid } from '@/components/indicators/IndicatorGrid'
import { CumulativeAverageTile } from '@/components/indicators/CumulativeAverageTile'
import { formatDate } from '@/utils/format'
import type { PartnerKPIs, CentresResponse, Alert, ProgramsSummary } from '@/types'
import {
  MOCK_PROGRAMS, MOCK_KPIS, MOCK_CENTRES,
} from '@/data/mockDashboardData'

type Partner = 'PHD' | 'Bandhu'

interface OrgSummaryResponse {
  partner: Partner
  period: string
  ai_summary: string
  generated_at: string
}

// ─── CountUp hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, dur = 1500) {
  const [v, setV] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { setV(target); return }
    let raf: number
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setV(Math.round(target * p * p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur, reduce])
  return v
}

function CountUp({ value, dur }: { value: number; dur?: number }) {
  return <>{useCountUp(value, dur).toLocaleString()}</>
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ data, color = 'var(--unfpa)', w = 90, h = 28 }: {
  data: number[]; color?: string; w?: number; h?: number
}) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h * 0.85}`).join(' ')
  const areaD = `M0,${h} L${pts.split(' ').map(p => p).join(' L')} L${w},${h}Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace(/[^a-z0-9]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace(/[^a-z0-9]/gi, '')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

interface TileProps {
  label: string
  sub: string
  value: number
  delta?: number
  color: string
  icon: React.ReactNode
  spark?: number[]
}

function Tile({ label, sub, value, delta, color, icon, spark }: TileProps) {
  const colorVar = `var(--${color})`
  return (
    <div className="tile">
      <div className="tile-head">
        <div className="tile-ico" style={{ background: `${colorVar}1A`, color: colorVar }}>
          {icon}
        </div>
        <div>
          <div className="tile-label">{label}</div>
          <div className="tile-sub">{sub}</div>
        </div>
      </div>
      <div className="tile-num" style={{ color: colorVar }}>
        <CountUp value={value} />
      </div>
      {delta != null && delta !== 0 && (
        <div className={`tile-delta ${delta > 0 ? 'up' : 'down'}`}>
          {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
        </div>
      )}
      {spark && spark.length > 1 && (
        <div className="tile-spark">
          <Sparkline data={spark} color={colorVar} />
        </div>
      )}
    </div>
  )
}

// ─── SectionHead ──────────────────────────────────────────────────────────────

function SectionHead({ kicker, title, sub, right }: {
  kicker: string; title: string; sub?: string; right?: React.ReactNode
}) {
  return (
    <div className="section-head">
      <div>
        <div className="kicker"><span className="dot" />{kicker}</div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{
      padding: '10px 14px', fontSize: 12, minWidth: 140,
      boxShadow: '0 8px 30px rgba(0,0,0,.12)', border: '1px solid var(--hair)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted)' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, marginTop: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
            {p.name}
          </span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{(p.value ?? 0).toLocaleString()}</b>
        </div>
      ))}
    </div>
  )
}

// ─── Form box ─────────────────────────────────────────────────────────────────

function FormBox({ form }: { form: { key: string; label: string; label_bn?: string; count: number; category: string } }) {
  const catColor =
    form.category === 'Clinical' ? 'var(--unfpa-bright)' :
    form.category === 'Community' ? 'var(--coral)' :
    form.category === 'Operations' ? 'var(--amber)' : 'var(--violet)'
  const CatIcon =
    form.category === 'Clinical' ? Stethoscope :
    form.category === 'Community' ? Megaphone :
    form.category === 'Operations' ? HeartHandshake : Activity
  return (
    <div className="card snug" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{
        width: 40, height: 40, borderRadius: 11,
        background: `${catColor}1A`, color: catColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <CatIcon size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{form.label}</div>
      </div>
      <div className="num-display" style={{ fontSize: 26, color: catColor, fontFamily: 'var(--display)', fontStyle: 'italic' }}>
        {form.count}
      </div>
    </div>
  )
}

// ─── Meta block ───────────────────────────────────────────────────────────────

function Meta({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="kicker" style={{ marginBottom: 4 }}><span className="dot" />{label}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
      <div className="mono mute" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// ─── HeroMap (Leaflet) ────────────────────────────────────────────────────────
// Uses the shared BangladeshMap component with GeoJSON + OpenStreetMap tiles.

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  partner: Partner
}

export function OrgDashboard({ partner }: Props) {
  const isPHD = partner === 'PHD'
  const { t } = useTranslation()

  // ── Real API data ──────────────────────────────────────────────────────────

  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [month] = useState(now.getMonth() + 1)

  const { data: programs, loading: programsLoading } = usePolling<ProgramsSummary>({
    fetcher: () =>
      api.get(`/dashboard/programs-summary/?partner=${partner}&year=${year}&month=${month}`)
         .then((r) => r.data),
    interval: 60_000,
  })

  const { data: kpis, loading: kpisLoading } = usePolling<PartnerKPIs>({
    fetcher: () =>
      api.get(`/dashboard/partner-kpis/?partner=${partner}`).then((r) => r.data),
    interval: 30_000,
  })

  const { data: centres } = usePolling<CentresResponse>({
    fetcher: () =>
      api.get(`/dashboard/centres/?partner=${partner}`).then((r) => r.data),
    interval: 60_000,
  })

  const { data: summary } = usePolling<OrgSummaryResponse>({
    fetcher: () =>
      api.get(`/dashboard/org-summary/?partner=${partner}`).then((r) => r.data),
    interval: 5 * 60_000,
  })

  usePolling<Alert[]>({
    fetcher: () =>
      api
        .get(`/dashboard/alerts/?partner=${partner}&acknowledged=false`)
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 60_000,
  })

  // ── Mock fallback ──────────────────────────────────────────────────────────

  const usingMock = !programsLoading && (programs?.total ?? 0) === 0
  const displayPrograms: ProgramsSummary = usingMock
    ? MOCK_PROGRAMS[partner]
    : (programs ?? MOCK_PROGRAMS[partner])

  const displayKpis: PartnerKPIs = (kpis && (kpis.submissions_this_month > 0 || kpis.fistula_cases > 0))
    ? kpis
    : MOCK_KPIS[partner]

  const displayCentres: CentresResponse = (centres && centres.districts.length > 0)
    ? centres
    : MOCK_CENTRES[partner]

  const categories = displayPrograms.categories ?? {}
  const monthlyTrend = displayPrograms.monthly_trend ?? []
  const topForms = displayPrograms.top_forms ?? []

  const sparkClinical = monthlyTrend.map((m) => m.clinical)
  const sparkCommunity = monthlyTrend.map((m) => m.community)

  const totalSubmissions = displayPrograms.total
  const momChange = displayPrograms.mom_change

  if (kpisLoading && !kpis && programsLoading) return <PageLoader />

  // ── KPI tiles ─────────────────────────────────────────────────────────────

  const orgKpis: TileProps[] = isPHD ? [
    { label: t('org.kpiSubmissions'),   sub: t('org.kpiSubmissionsSub'),    value: totalSubmissions, delta: momChange, color: 'unfpa-bright', icon: <FileText size={16} />, spark: sparkClinical.length > 1 ? sparkClinical : [0, 10, 20, 30, 40, totalSubmissions] },
    { label: t('org.kpiAnc'),           sub: t('org.kpiAncSub'),            value: categories.Clinical ?? 0, delta: undefined, color: 'coral', icon: <Heart size={16} />, spark: sparkClinical },
    { label: t('org.kpiActiveWorkers'), sub: t('org.kpiActiveWorkersPhd'),  value: displayKpis.active_workers, delta: undefined, color: 'emerald', icon: <Activity size={16} />, spark: sparkCommunity },
    { label: t('org.kpiFistula'),       sub: t('org.kpiFistulaSub'),        value: displayKpis.fistula_cases, delta: undefined, color: 'amber', icon: <Heart size={16} /> },
  ] : [
    { label: t('org.kpiSubmissions'),   sub: t('org.kpiSubmissionsSub'),     value: totalSubmissions, delta: momChange, color: 'violet', icon: <FileText size={16} />, spark: sparkClinical.length > 1 ? sparkClinical : [0, 10, 20, 30, 40, totalSubmissions] },
    { label: t('org.kpiOutreach'),      sub: t('org.kpiOutreachSub'),        value: categories.Community ?? 0, delta: undefined, color: 'coral', icon: <Megaphone size={16} />, spark: sparkCommunity },
    { label: t('org.kpiActiveWorkers'), sub: t('org.kpiActiveWorkersBondhu'),value: displayKpis.active_workers, delta: undefined, color: 'emerald', icon: <Activity size={16} /> },
    { label: t('org.kpiGbv'),           sub: t('org.kpiGbvSub'),             value: displayKpis.fistula_cases, delta: undefined, color: 'rose', icon: <HeartHandshake size={16} /> },
  ]

  const dateStr = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
           HERO
           ═══════════════════════════════════════════════════════════════ */}
      <section className="hero" style={{ paddingBottom: 20 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>{t('org.eyebrowImplementingPartner')}</span>
          <span className="sep">/</span>
          <span>{isPHD ? t('org.eyebrowPhdFull') : t('org.eyebrowBondhuFull')}</span>
          <span className="sep">/</span>
          <span>{dateStr}</span>
          {usingMock && (
            <>
              <span className="sep">/</span>
              <span className="tag amber" style={{ marginLeft: 4, fontSize: 10.5 }}>
                <Info size={10} style={{ marginRight: 3 }} />{t('org.demoData')}
              </span>
            </>
          )}
        </div>

        <div className="hero-grid">
          <div>
            <h1 className="hero-headline anim-rise d1" style={{ marginBottom: 6, fontSize: 'clamp(56px, 9vw, 132px)', letterSpacing: '-0.035em' }}>
              <span
                className={isPHD ? 'figure' : 'accent'}
                style={!isPHD ? {
                  color: 'var(--violet)',
                  textShadow: '0 0 36px rgba(139,92,246,0.25), 0 0 70px rgba(139,92,246,0.10)',
                } : undefined}
              >
                {partner}
              </span>
            </h1>
            <p className="hero-tagline anim-rise d1" style={{
              fontSize: 13, color: 'var(--ink-3)', marginTop: 4, marginBottom: 14,
              letterSpacing: '0.01em', fontWeight: 500,
            }}>
              {isPHD
                ? 'Partners in Health and Development'
                : 'Gender Diverse Population'}
            </p>
            <p className="hero-lede anim-rise d2">
              {partner} delivered <b><CountUp value={totalSubmissions} /> submissions</b> this
              month &mdash; {momChange > 0 ? '+' : ''}{momChange.toFixed(1)}% compared
              to last month. Field staff submitting from{' '}
              <b>{displayCentres.districts?.length ?? 0} centres</b>, GPS-verified, validated
              through KoboToolbox before reaching M&amp;E.
            </p>

            {/* Agreement + Submission Mode meta block removed per Animesh —
                operational chrome, no programmatic insight. */}
          </div>

          <div className="hero-right anim-rise d4">
            <div className="map-frame" style={{ height: '100%', minHeight: 320, position: 'relative' }}>
              <BangladeshMap activityFeed={[]} className="leaflet-org-map" partner={partner} />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           KPI TILES
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {orgKpis.map((k, i) => (
            <Tile key={i} {...k} />
          ))}
        </div>
      </section>

      {/* "Programme delivery" stacked area removed per Animesh — categories
          were synthetic (Clinical/Community/Operations) and the chart didn't
          tell a programmatic story at our data volume. Monthly trend lives in
          the indicator-level monthly target view instead. */}

      {/* ═══════════════════════════════════════════════════════════════
           FORM GRID
           ═══════════════════════════════════════════════════════════════ */}
      {topForms.length > 0 && (
        <section className="section" style={{ marginTop: 56 }}>
          <SectionHead
            kicker={t('org.sectionFormsKicker')}
            title={t('org.sectionFormsTitle')}
            sub={t('org.sectionFormsSub')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {topForms.map((f) => (
              <FormBox key={f.key} form={f} />
            ))}
          </div>
        </section>
      )}

      {/* Anomaly Detection lives on the home page only — the partner
          dashboards already show submission counts, indicator progress
          and review backlogs through their own KPI tiles. Repeating it
          here also hit a 403 for focal-role users who don't have access
          to /api/dashboard/alerts/. */}

      {/* ═══════════════════════════════════════════════════════════════
           M&E INDICATOR PROGRESS
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56 }}>
        <SectionHead
          kicker={t('org.sectionIndicatorKicker')}
          title={t('org.sectionIndicatorTitle')}
          sub={t('org.sectionIndicatorSub')}
        />
        {/* Cumulative average tile — Animesh's "single unified progress %"
            for the whole partner. Simple mean of every indicator's %.
            Bandhu (19 indicators) gets the most value here, but PHD also
            sees its 22-indicator average at a glance. */}
        <CumulativeAverageTile
          org={partner}
          periodStart="2026-05-21"
          periodEnd="2026-11-20"
        />
        <div className="card shimmer">
          <IndicatorGrid
            org={partner}
            periodStart="2026-05-21"
            periodEnd="2026-11-20"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           CENTRES TABLE
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56, marginBottom: 80 }}>
        <SectionHead
          kicker={t('org.sectionCentresKicker')}
          title={t('org.sectionCentresTitle', { count: displayCentres.districts?.length ?? 0 })}
          sub={t('org.sectionCentresSub', { partner })}
        />
        <div className="card flush">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('org.thRank')}</th>
                <th>{t('org.thDistrict')}</th>
                <th style={{ width: 200 }}>{t('org.thTrend14d')}</th>
                <th style={{ textAlign: 'right' }}>{t('org.thThisMonth')}</th>
                <th>{t('org.thStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {(displayCentres.districts ?? []).map((d) => (
                <tr key={d.district}>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%',
                      fontSize: 11, fontWeight: 700,
                      background: d.rank <= 3 ? 'var(--unfpa)' : 'var(--surface-3)',
                      color: d.rank <= 3 ? '#fff' : 'var(--muted)',
                    }}>
                      {d.rank}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{d.district}</div>
                  </td>
                  <td>
                    <Sparkline
                      data={[
                        Math.round(d.count * 0.55),
                        Math.round(d.count * 0.7),
                        Math.round(d.count * 0.85),
                        d.count,
                      ]}
                      color={isPHD ? 'var(--unfpa)' : 'var(--violet)'}
                      w={180} h={28}
                    />
                  </td>
                  <td className="num-display" style={{ textAlign: 'right', fontSize: 22, fontFamily: 'var(--display)', fontStyle: 'italic' }}>
                    {d.count}
                  </td>
                  <td><span className="tag emerald">{t('org.tagLive')}</span></td>
                </tr>
              ))}
              {!displayCentres.districts?.length && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                    {t('org.noDistrictData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* AI Weekly Summary card removed per Animesh — placeholder narrative
          at low data volume read as filler; the indicator grid + KPI tiles
          carry the programmatic story. */}
    </>
  )
}

// ─── Legend dot helper ────────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}
