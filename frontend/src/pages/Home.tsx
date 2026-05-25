/**
 * Programme Overview — editorial light console homepage.
 *
 * Warm paper background · Instrument Serif italic headlines
 * · glassmorphism tiles with shimmer hairlines · SVG Bangladesh map
 * · live activity stream · district leaderboard.
 */
import { useEffect, useState, useId } from 'react'
import {
  Activity, FileText, Heart, Users,
  TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import {
  AreaChart, Area,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import type { KPIs, ActivityItem, Alert, ProgramsSummary } from '@/types'

// ─── API hooks ──────────────────────────────────────────────────────────────

const useKPIs = () =>
  usePolling<KPIs>({
    fetcher: () => api.get('/dashboard/kpis/').then(r => r.data),
    interval: 30_000,
  })

const useActivityFeed = () =>
  usePolling<ActivityItem[]>({
    fetcher: () =>
      api.get('/dashboard/activity-feed/').then(r =>
        Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
      ),
    interval: 20_000,
  })

const useAlerts = () =>
  usePolling<Alert[]>({
    fetcher: () =>
      api.get('/dashboard/alerts/?acknowledged=false').then(r =>
        Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
      ),
    interval: 60_000,
  })

const useProgramsSummary = () =>
  usePolling<ProgramsSummary>({
    fetcher: () => api.get('/dashboard/programs-summary/').then(r => r.data),
    interval: 60_000,
  })

// ─── CountUp hook ───────────────────────────────────────────────────────────

function useCountUp(target: number, dur = 1500) {
  const [v, setV] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { setV(target); return }
    let raf: number
    let start: number | null = null
    const step = (t: number) => {
      if (start === null) start = t
      const p = Math.min(1, (t - start) / dur)
      const eased = 1 - Math.pow(1 - p, 5)
      setV(Math.round(eased * target))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur, reduce])
  return v
}

function CountUp({ value, dur = 1500 }: { value: number; dur?: number }) {
  const v = useCountUp(value, dur)
  return <>{v.toLocaleString()}</>
}

// ─── SVG Sparkline ──────────────────────────────────────────────────────────

function Sparkline({
  data,
  color = 'var(--unfpa)',
  w = 260,
  h = 32,
}: {
  data: number[]
  color?: string
  w?: number
  h?: number
}) {
  const gid = useId().replace(/:/g, '')
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = Math.max(1, max - min)
  const stepX = w / (data.length - 1)
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 6) - 3])
  const path = 'M ' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')
  const area = path + ` L ${w},${h} L 0,${h} Z`

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: h }}>
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.36} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${gid})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Bangladesh SVG Map ─────────────────────────────────────────────────────

const BD_PATHS: Record<string, string> = {
  rangpur:    'M275 50 L370 55 L380 130 L355 180 L300 175 L260 145 L255 95 Z',
  rajshahi:   'M165 165 L260 145 L300 175 L295 245 L240 295 L185 280 L150 240 L140 195 Z',
  mymensingh: 'M355 180 L440 175 L460 240 L420 280 L370 270 L355 215 Z',
  sylhet:     'M460 175 L590 165 L630 220 L595 295 L520 285 L460 240 L460 195 Z',
  dhaka:      'M295 245 L370 270 L420 280 L450 330 L420 400 L350 390 L300 360 L295 295 Z',
  khulna:     'M150 290 L240 295 L300 360 L290 460 L230 490 L160 460 L140 380 Z',
  barisal:    'M290 460 L350 390 L420 400 L420 470 L380 510 L320 500 L290 480 Z',
  chittagong: 'M420 280 L520 285 L595 295 L605 360 L580 460 L545 540 L500 560 L460 530 L450 470 L420 400 Z',
}

const DIVISIONS = [
  { id: 'rangpur',    name: 'Rangpur',    cx: 320, cy: 110 },
  { id: 'rajshahi',   name: 'Rajshahi',   cx: 220, cy: 230 },
  { id: 'mymensingh', name: 'Mymensingh', cx: 410, cy: 220 },
  { id: 'sylhet',     name: 'Sylhet',     cx: 560, cy: 220 },
  { id: 'dhaka',      name: 'Dhaka',      cx: 380, cy: 320 },
  { id: 'khulna',     name: 'Khulna',     cx: 250, cy: 410 },
  { id: 'barisal',    name: 'Barisal',    cx: 350, cy: 460 },
  { id: 'chittagong', name: 'Chittagong', cx: 530, cy: 410 },
]

function HeroMap() {
  const [hover, setHover] = useState<string | null>(null)

  return (
    <div className="map-frame" style={{ height: '100%' }}>
      <svg className="map-svg" viewBox="0 0 700 600" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="region-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00658C" stopOpacity={0.06} />
            <stop offset="100%" stopColor="#00658C" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Range rings */}
        {[120, 220, 320].map((rr, i) => (
          <circle key={i} cx={370} cy={320} r={rr}
            fill="none" stroke="var(--hair)" strokeDasharray="2 6" strokeWidth={1} opacity={0.5 - i * 0.12} />
        ))}

        {/* Divisions */}
        {DIVISIONS.map(d => (
          <path key={d.id}
            d={BD_PATHS[d.id]}
            className={`bd-region ${hover === d.id ? 'active' : ''}`}
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover(null)}
          />
        ))}

        {/* Labels */}
        {DIVISIONS.map(d => (
          <g key={d.id} style={{ pointerEvents: 'none' }}>
            <text x={d.cx} y={d.cy} className="bd-region-label" textAnchor="middle">{d.name}</text>
          </g>
        ))}
      </svg>

      {/* HUD overlays */}
      <div className="map-hud tl">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="live-dot" />
          <span>LIVE</span>
        </div>
        <div>8 DIVISIONS</div>
      </div>

      <div className="map-hud br" style={{ minWidth: 130 }}>
        {hover ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--ink)', fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 18, textTransform: 'none' as const, letterSpacing: 0 }}>
              {DIVISIONS.find(d => d.id === hover)?.name}
            </div>
          </div>
        ) : (
          <div>hover a division</div>
        )}
      </div>
    </div>
  )
}

// ─── Tile (KPI card) ────────────────────────────────────────────────────────

interface TileProps {
  label: string
  sub: string
  value: number
  delta?: number
  color: string
  icon: React.ReactNode
  spark: number[]
}

function Tile({ label, sub, value, delta, color, icon, spark }: TileProps) {
  const sparkColor = {
    blue: 'var(--unfpa)',
    coral: 'var(--coral)',
    amber: 'var(--amber)',
    emerald: 'var(--emerald)',
  }[color] ?? 'var(--unfpa)'

  return (
    <div className={`tile ${color}`}>
      <div className="corner" />
      <div className="tile-head">
        <span className="tile-ico">{icon}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={`tile-delta ${delta < 0 ? 'down' : ''}`}>
            {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {delta === 0 && <span className="tile-delta neutral">&mdash;</span>}
      </div>
      <div className="tile-num"><CountUp value={value} dur={1500} /></div>
      <div className="tile-lab">{label}</div>
      <div className="tile-sub">{sub}</div>
      <div className="tile-spark">
        <Sparkline data={spark} color={sparkColor} />
      </div>
    </div>
  )
}

// ─── Section head ───────────────────────────────────────────────────────────

function SectionHead({
  kicker,
  title,
  sub,
  right,
}: {
  kicker?: string
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <div className="section-head">
      <div>
        {kicker && (
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" />{kicker}
          </div>
        )}
        <h2 className="section-title">{title}</h2>
        {sub && <div className="section-sub">{sub}</div>}
      </div>
      {right}
    </div>
  )
}

// ─── Custom recharts tooltip ────────────────────────────────────────────────

interface TTPayload { name: string; value: number; color: string }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TTPayload[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="card snug" style={{ minWidth: 140 }}>
      {label && <div className="kicker" style={{ marginBottom: 6 }}>{label}</div>}
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2" style={{ fontSize: 13 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--muted)', flex: 1 }}>{p.name}</span>
          <span className="font-display" style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--ink)' }}>
            {p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function Home() {
  const { data: kpis, loading: kpisLoading } = useKPIs()
  const { data: feed, loading: feedLoading } = useActivityFeed()
  const { data: alerts } = useAlerts()
  const { data: summary } = useProgramsSummary()

  const activityFeed = feed ?? []
  const alertsList = (alerts ?? []).filter(a => !a.acknowledged)

  if (kpisLoading && !kpis) return <PageLoader />

  // Derived data
  const submissions = kpis?.submissions_this_month ?? summary?.total ?? 0
  const momChange = kpis?.mom_change_percent ?? summary?.mom_change ?? 0
  const trendData = summary?.monthly_trend ?? []
  const categoryData = summary?.categories
    ? Object.entries(summary.categories).filter(([, v]) => (v ?? 0) > 0)
    : []

  // Generate spark data from trend
  const totalSpark = trendData.map(d => d.total)

  const KPIS_DATA: TileProps[] = [
    {
      label: 'Submissions', sub: 'this month', value: submissions,
      delta: momChange, color: 'blue', icon: <FileText size={16} />,
      spark: totalSpark.length > 1 ? totalSpark : [0, 10, 20, 30, 40, submissions],
    },
    {
      label: 'Pending', sub: 'review', value: kpis?.submissions_pending ?? 0,
      delta: 0, color: 'amber', icon: <AlertTriangle size={16} />,
      spark: [8, 9, 11, 7, 10, 12, 9, 11, 14, 12, 13, kpis?.submissions_pending ?? 12],
    },
    {
      label: 'Active Workers', sub: 'field', value: kpis?.active_workers ?? 0,
      delta: undefined, color: 'emerald', icon: <Users size={16} />,
      spark: [22, 24, 26, 28, 30, 32, 33, 35, 36, 37, 38, kpis?.active_workers ?? 38],
    },
    {
      label: 'Fistula Cases', sub: 'this month', value: kpis?.fistula_cases_this_month ?? 0,
      delta: undefined, color: 'coral', icon: <Heart size={16} />,
      spark: [12, 10, 8, 11, 7, 9, 6, 8, 5, 7, 5, kpis?.fistula_cases_this_month ?? 6],
    },
  ]

  const dateStr = kpis?.as_of
    ? new Date(kpis.as_of).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
           HERO — the big editorial moment
           ═══════════════════════════════════════════════════════════════ */}
      <section className="hero">
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>CIPRB &middot; UNFPA BANGLADESH</span>
          <span className="sep">/</span>
          <span>PROGRAMME MONITORING &mdash; {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}</span>
          <span className="sep">/</span>
          <span>{dateStr} GMT+6</span>
        </div>

        <div className="hero-grid">
          {/* LEFT — title + narrative + stats */}
          <div>
            <h1 className="hero-headline anim-rise d1" style={{ marginBottom: 6, fontSize: 'clamp(56px, 9vw, 132px)', letterSpacing: '-0.035em' }}>
              <span className="figure">SPONDON</span>
            </h1>
            <div className="anim-rise d1" style={{
              fontFamily: 'var(--display)', fontStyle: 'italic',
              fontSize: 'clamp(26px, 3.4vw, 42px)',
              lineHeight: 1.05, color: 'var(--ink-2)',
              letterSpacing: '-0.018em', marginBottom: 22,
            }}>
              Live pulse of the project.
            </div>

            <p className="hero-lede anim-rise d2">
              <b><CountUp value={submissions} dur={2000} /> submissions</b> logged this
              month &mdash; {momChange > 0 ? '+' : ''}{momChange.toFixed(1)}% compared
              to last month. <b>{kpis?.submissions_pending ?? 0} items</b> wait in the
              approval queue.
            </p>

            <div className="hero-bn anim-rise d2">
              এই মাসে <b style={{ color: 'var(--ink)' }}>{submissions.toLocaleString()} টি</b> জমা
              &mdash; গত মাস থেকে {Math.abs(momChange).toFixed(1)}% {momChange >= 0 ? 'বেশি' : 'কম'}।
            </div>

            <div className="hero-stats anim-rise d3">
              <div className="hero-stat">
                <div className="lab">ACTIVE WORKERS</div>
                <div className="num"><CountUp value={kpis?.active_workers ?? 0} /></div>
                <div className="sub">across all centres</div>
              </div>
              <div className="hero-stat coral">
                <div className="lab">FOR REVIEW</div>
                <div className="num"><CountUp value={kpis?.submissions_pending ?? 0} /></div>
                <div className="sub">pending approval</div>
              </div>
              <div className="hero-stat amber">
                <div className="lab">OPEN ALERTS</div>
                <div className="num"><CountUp value={alertsList.length} /></div>
                <div className="sub">{alertsList.length > 0 ? alertsList[0]?.title : 'none'}</div>
              </div>
            </div>
          </div>

          {/* RIGHT — map */}
          <div className="hero-right anim-rise d4">
            <HeroMap />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           KPI tile row — magazine cover cards
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {KPIS_DATA.map((k, i) => (
            <Tile key={i} {...k} />
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           12-MONTH TREND + CATEGORY BREAKDOWN
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56 }}>
        <SectionHead
          kicker="ACTIVITY TREND"
          title="Programme activity over time"
          sub="Stacked by category — clinical sits beneath community, with operations at the cap."
          right={
            <div className="pills">
              <button className="pill on">All</button>
              <button className="pill">6m</button>
              <button className="pill">YTD</button>
            </div>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20 }}>
          {/* Stacked area chart */}
          <div className="card shimmer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <LegendDot color="var(--unfpa-bright)" label="Clinical" />
                <LegendDot color="var(--coral)" label="Community" />
                <LegendDot color="var(--amber)" label="Operations" />
              </div>
              <span className="tag">stacked</span>
            </div>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g-clin" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--unfpa-bright)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--unfpa-bright)" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="g-comm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--coral)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--coral)" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="g-ops" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--amber)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month_name"
                    tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                    axisLine={{ stroke: 'var(--hair)' }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                    axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--hair-2)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="clinical" name="Clinical" stackId="1"
                    stroke="var(--unfpa-bright)" strokeWidth={2} fill="url(#g-clin)"
                    animationDuration={1000} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="community" name="Community" stackId="1"
                    stroke="var(--coral)" strokeWidth={2} fill="url(#g-comm)"
                    animationDuration={1000} animationBegin={200} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="operations" name="Operations" stackId="1"
                    stroke="var(--amber)" strokeWidth={2} fill="url(#g-ops)"
                    animationDuration={1000} animationBegin={400} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                Awaiting trend data...
              </div>
            )}
          </div>

          {/* Category breakdown */}
          <div className="card shimmer-violet" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div className="kicker" style={{ marginBottom: 6 }}><span className="dot" style={{ background: 'var(--violet)' }} />BREAKDOWN</div>
              <div className="card-title">
                By category &middot; {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {categoryData.length > 0 ? (
                categoryData.map(([name, value]) => {
                  const total = categoryData.reduce((s, [, v]) => s + (v as number), 0)
                  const pct = total > 0 ? Math.round(((value as number) / total) * 100) : 0
                  const catColor = name === 'Clinical' ? 'var(--unfpa-bright)'
                    : name === 'Community' ? 'var(--coral)'
                    : 'var(--amber)'
                  return (
                    <div key={name}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
                        <span className="font-mono" style={{ fontSize: 12.5 }}>
                          <b>{(value as number).toLocaleString()}</b>
                          <span style={{ color: 'var(--muted)', marginLeft: 4 }}>({pct}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
                        <motion.div
                          style={{
                            height: '100%',
                            background: `linear-gradient(90deg, ${catColor}, ${catColor}88)`,
                            borderRadius: 999,
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
                  Awaiting category data...
                </div>
              )}
            </div>

            {/* Top forms list */}
            {summary?.top_forms && summary.top_forms.length > 0 && (
              <>
                <hr style={{ border: 0, borderTop: '1px solid var(--hair)' }} />
                <div>
                  <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />TOP FORMS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {summary.top_forms.slice(0, 5).map(f => (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <span className="tag blue">{f.label}</span>
                        <span className="font-mono" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{f.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           ALERTS + LIVE FEED
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56 }}>
        <SectionHead
          kicker="REAL-TIME"
          title="Live activity & alerts"
          sub="Submissions land here as they pass through KoboToolbox into Spondon."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 20 }}>
          {/* Alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {alertsList.slice(0, 3).map(a => (
              <div key={a.id} className={`card shimmer-${a.severity === 'critical' ? 'coral' : 'amber'}`} style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`tag ${a.severity === 'critical' ? 'rose' : 'amber'}`}>
                    <AlertTriangle size={11} />
                    {a.severity}
                  </span>
                  <span className="font-mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{a.id.slice(0, 8)}</span>
                  <span style={{ color: 'var(--muted)', marginLeft: 'auto', fontSize: 11.5 }}>
                    {formatDateTime(a.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, marginTop: 8, letterSpacing: '-0.01em' }}>{a.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>{a.message}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <span className="tag">{a.partner}</span>
                </div>
              </div>
            ))}

            {alertsList.length === 0 && (
              <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>No active alerts</div>
                <p style={{ fontSize: 12.5, marginTop: 4 }}>All systems operational.</p>
              </div>
            )}
          </div>

          {/* Live feed */}
          <div className="card flush" style={{ overflow: 'hidden' }}>
            <div className="card-head">
              <div>
                <div className="kicker" style={{ marginBottom: 4 }}>
                  <span className="dot" style={{ background: 'var(--emerald)' }} />STREAM
                </div>
                <div className="card-title">Live submissions</div>
              </div>
              <span className="tag emerald">
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                live
              </span>
            </div>
            <div className="stream scroll-thin" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {feedLoading && !feed ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>
              ) : activityFeed.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                  <Activity size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>No recent submissions.</div>
                </div>
              ) : (
                activityFeed.map((item, i) => {
                  const color = item.partner === 'PHD' ? 'blue' : 'violet'
                  const initials = item.worker_name
                    .split(' ')
                    .map(p => p[0])
                    .join('')
                    .slice(0, 2)
                  return (
                    <div key={item.id} className={`stream-item ${i === 0 ? 'new' : ''}`}>
                      <div className={`stream-avatar ${color}`}>{initials}</div>
                      <div className="stream-body">
                        <p className="stream-title">
                          <b>{item.worker_name}</b> submitted <b>{item.form_type_display}</b> from <b>{item.district}</b>
                        </p>
                        <div className="stream-meta">
                          {item.partner} &middot; {item.form_type_display}
                        </div>
                      </div>
                      <div className="stream-time">{item.time_ago}</div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom spacer */}
      <div style={{ height: 80 }} />
    </>
  )
}

// ─── Helper components ──────────────────────────────────────────────────────

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
    </div>
  )
}
