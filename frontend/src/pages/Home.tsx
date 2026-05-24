/**
 * Programme Overview — dark data-visualization homepage.
 *
 * Aesthetic reference: George Railean "Energy Intensity Index" (Dribbble).
 * Dark navy canvas · glowing accent numbers · thin gradient chart lines
 * glassmorphism cards · ambient colour blobs · spring counters.
 */
import { useEffect, useState } from 'react'
import {
  Activity, FileText, Heart, Users, MapPin,
  TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react'
import {
  motion, AnimatePresence, useReducedMotion,
  useMotionValue, useSpring,
} from 'motion/react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { BangladeshMap } from '@/components/maps/BangladeshMap'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import type { KPIs, ActivityItem, Alert, ServiceCenter, ProgramsSummary } from '@/types'

// ─── Design tokens ────────────────────────────────────────────────────────────

const T = {
  bg:        '#070A12',
  card:      'rgba(255,255,255,0.04)',
  cardHover: 'rgba(255,255,255,0.07)',
  border:    'rgba(255,255,255,0.07)',
  cyan:      '#22D3EE',
  emerald:   '#34D399',
  amber:     '#FBBF24',
  rose:      '#FB7185',
  violet:    '#A78BFA',
  textPrim:  '#F1F5F9',
  textMuted: 'rgba(241,245,249,0.45)',
  textFaint: 'rgba(241,245,249,0.22)',
}

const CAT = {
  Clinical:   { color: T.cyan,    gradId: 'gClinical'   },
  Community:  { color: T.emerald, gradId: 'gCommunity'  },
  Operations: { color: T.amber,   gradId: 'gOperations' },
} as const

// ─── Shared motion variants ───────────────────────────────────────────────────

const stagger = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09 } },
}
const fadeSlide = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
}

// ─── Spring counter ───────────────────────────────────────────────────────────

function Counter({
  value,
  color,
  size = '3.5rem',
}: {
  value: number
  color: string
  size?: string
}) {
  const reduce = useReducedMotion()
  const mv     = useMotionValue(reduce ? value : 0)
  const spring = useSpring(mv, { damping: 38, stiffness: 80 })
  const [n, setN] = useState(reduce ? value : 0)

  useEffect(() => { mv.set(value) }, [value, mv])
  useEffect(() => spring.on('change', (v) => setN(Math.round(v))), [spring])

  return (
    <span
      className="tabular-nums font-bold leading-none"
      style={{
        fontSize:   size,
        color,
        textShadow: `0 0 28px ${color}55, 0 0 60px ${color}22`,
      }}
    >
      {n.toLocaleString()}
    </span>
  )
}

// ─── Dark recharts tooltip ────────────────────────────────────────────────────

interface TTPayload { name: string; value: number; color: string }
function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: TTPayload[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-xl px-4 py-3 text-sm shadow-2xl"
      style={{
        background: 'rgba(10,13,24,0.95)',
        border:     `1px solid ${T.border}`,
        backdropFilter: 'blur(16px)',
      }}
    >
      {label && <p className="mb-2 text-xs uppercase tracking-widest" style={{ color: T.textFaint }}>{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 font-semibold tabular-nums">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span style={{ color: T.textMuted }}>{p.name}</span>
          <span className="ml-auto pl-4" style={{ color: p.color }}>{p.value.toLocaleString()}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Glass card ───────────────────────────────────────────────────────────────

function GlassCard({ children, className = '', accent, style }: {
  children: React.ReactNode
  className?: string
  accent?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className}`}
      style={{
        background:    T.card,
        border:        `1px solid ${T.border}`,
        backdropFilter: 'blur(12px)',
        ...style,
      }}
    >
      {/* Accent top highlight */}
      {accent && (
        <div
          className="absolute inset-x-0 top-0 h-[1px]"
          style={{ background: `linear-gradient(90deg, transparent 0%, ${accent}60 50%, transparent 100%)` }}
        />
      )}
      {children}
    </div>
  )
}

// ─── API hooks ────────────────────────────────────────────────────────────────

const useKPIs          = () => usePolling<KPIs>({ fetcher: () => api.get('/dashboard/kpis/').then((r) => r.data), interval: 30_000 })
const useActivityFeed  = () => usePolling<ActivityItem[]>({ fetcher: () => api.get('/dashboard/activity-feed/').then((r) => Array.isArray(r.data) ? r.data : (r.data?.results ?? [])), interval: 20_000 })
const useAlerts        = () => usePolling<Alert[]>({ fetcher: () => api.get('/dashboard/alerts/?acknowledged=false').then((r) => Array.isArray(r.data) ? r.data : (r.data?.results ?? [])), interval: 60_000 })
const useServiceCenters = () => usePolling<ServiceCenter[]>({ fetcher: () => api.get('/programs/centers/').then((r) => { const d = r.data; return Array.isArray(d) ? d : (d?.results ?? []) }), interval: 300_000 })
const useProgramsSummary = () => usePolling<ProgramsSummary>({ fetcher: () => api.get('/dashboard/programs-summary/').then((r) => r.data), interval: 60_000 })

// ─── Form icons ───────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  fistula: <Heart className="h-3.5 w-3.5" />, mpdsr: <Activity className="h-3.5 w-3.5" />,
  activity: <Users className="h-3.5 w-3.5" />, baseline: <FileText className="h-3.5 w-3.5" />,
  clinic_visit: <Activity className="h-3.5 w-3.5" />, hiv_sti_test: <Activity className="h-3.5 w-3.5" />,
  antenatal_card: <Heart className="h-3.5 w-3.5" />, htc_counselling: <Users className="h-3.5 w-3.5" />,
  individual_counselling: <Users className="h-3.5 w-3.5" />, mh_screening: <FileText className="h-3.5 w-3.5" />,
  gbv_case: <AlertTriangle className="h-3.5 w-3.5" />, outreach_session: <Users className="h-3.5 w-3.5" />,
  group_education: <Users className="h-3.5 w-3.5" />, referral: <FileText className="h-3.5 w-3.5" />,
  hygiene_kit: <FileText className="h-3.5 w-3.5" />, adr_record: <Activity className="h-3.5 w-3.5" />,
  autoclave_log: <Activity className="h-3.5 w-3.5" />, training_event: <Users className="h-3.5 w-3.5" />,
  coord_meeting: <Users className="h-3.5 w-3.5" />, mobile_camp: <MapPin className="h-3.5 w-3.5" />,
  client_reg: <Users className="h-3.5 w-3.5" />,
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const reduce = useReducedMotion()
  const { data: kpis,    loading: kpisLoading } = useKPIs()
  const { data: feed,    loading: feedLoading } = useActivityFeed()
  const { data: alerts  }                       = useAlerts()
  const { data: centers }                       = useServiceCenters()
  const { data: summary }                       = useProgramsSummary()

  const activityFeed   = feed ?? []
  const criticals      = (alerts ?? []).filter((a) => !a.acknowledged && a.severity === 'critical')
  const warnings       = (alerts ?? []).filter((a) => !a.acknowledged && a.severity !== 'critical')

  if (kpisLoading && !kpis) return <PageLoader />

  // ── Derived ──────────────────────────────────────────────────────────────────
  const categoryData = summary?.categories
    ? Object.entries(summary.categories)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([name, value]) => ({ name, value: value as number, color: CAT[name as keyof typeof CAT]?.color ?? '#6b7280' }))
    : []
  const catTotal  = categoryData.reduce((s, d) => s + d.value, 0)
  const trendData = summary?.monthly_trend ?? []
  const submissions = kpis?.submissions_this_month ?? summary?.total ?? 0
  const momChange   = kpis?.mom_change_percent ?? summary?.mom_change ?? 0

  // ── KPI definitions ───────────────────────────────────────────────────────────
  const KPIS = [
    { key: 'sub',     label: 'Submissions',  sub: 'this month', value: submissions,                          color: T.cyan,    trend: momChange,   icon: <FileText className="h-4 w-4" /> },
    { key: 'pend',    label: 'Pending',      sub: 'review',     value: kpis?.submissions_pending ?? 0,       color: T.amber,   trend: undefined,   icon: <Activity className="h-4 w-4" /> },
    { key: 'workers', label: 'Workers',      sub: 'active',     value: kpis?.active_workers ?? 0,            color: T.emerald, trend: undefined,   icon: <Users    className="h-4 w-4" /> },
    { key: 'fistula', label: 'Fistula',      sub: 'cases',      value: kpis?.fistula_cases_this_month ?? 0,  color: T.rose,    trend: undefined,   icon: <Heart    className="h-4 w-4" /> },
  ]

  return (
    /* ── Break out of Shell padding to own the full canvas ── */
    <div
      className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 relative"
      style={{ background: T.bg, minHeight: 'calc(100vh - 56px)' }}
    >
      {/* ── Ambient colour blobs ──────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {!reduce && (
          <>
            <motion.div
              className="absolute rounded-full"
              style={{ top: '-15%', right: '-10%', width: '55vw', height: '55vw', background: `radial-gradient(circle, ${T.cyan}09 0%, transparent 65%)` }}
              animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{ bottom: '5%', left: '-12%', width: '45vw', height: '45vw', background: `radial-gradient(circle, ${T.violet}07 0%, transparent 65%)` }}
              animate={{ scale: [1, 1.1, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{ top: '40%', left: '35%', width: '30vw', height: '30vw', background: `radial-gradient(circle, ${T.amber}05 0%, transparent 65%)` }}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}
        {/* Subtle noise grid */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(${T.textFaint} 1px, transparent 1px), linear-gradient(90deg, ${T.textFaint} 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative px-4 py-8 sm:px-6 lg:px-10 space-y-8">

        {/* ── Critical alert strip ───────────────────────────────────────── */}
        <AnimatePresence mode="popLayout">
          {criticals.map((a) => (
            <motion.div key={a.id} layout
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
                style={{ background: `${T.rose}12`, border: `1px solid ${T.rose}30` }}>
                <motion.div animate={reduce ? {} : { scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: T.rose }} />
                </motion.div>
                <span className="font-semibold" style={{ color: T.rose }}>{a.title}</span>
                <span className="hidden sm:inline" style={{ color: `${T.rose}99` }}>· {a.message}</span>
                <span className="ml-auto text-xs" style={{ color: T.textFaint }}>{a.partner}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Hero — title + KPI strip ───────────────────────────────────── */}
        <motion.div
          variants={stagger} initial="hidden" animate="visible"
        >
          {/* Title row */}
          <motion.div variants={fadeSlide} className="flex items-start justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] px-3 py-1 rounded-full"
                  style={{ color: T.cyan, background: `${T.cyan}14`, border: `1px solid ${T.cyan}25` }}
                >
                  CIPRB · UNFPA Bangladesh
                </span>
              </div>
              <h1
                className="text-[2.1rem] font-bold leading-tight"
                style={{ color: T.textPrim, letterSpacing: '-0.02em' }}
              >
                Programme Overview
              </h1>
              <p className="mt-1.5 text-sm" style={{ color: T.textMuted, fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}>
                সামগ্রিক কর্মসূচি পর্যবেক্ষণ · Real-time M&amp;E
              </p>
            </div>

            {/* Live pill + date */}
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <motion.div
                className="flex items-center gap-2 rounded-full px-3 py-1.5"
                style={{ background: `${T.emerald}12`, border: `1px solid ${T.emerald}25` }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {!reduce && (
                    <motion.span className="absolute inset-0 rounded-full" style={{ background: T.emerald }}
                      animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }} />
                  )}
                  <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: T.emerald }} />
                </span>
                <span className="text-xs font-semibold" style={{ color: T.emerald }}>Live</span>
              </motion.div>
              {kpis && (
                <span className="text-[11px]" style={{ color: T.textFaint }}>
                  {formatDateTime(kpis.as_of)}
                </span>
              )}
            </div>
          </motion.div>

          {/* KPI 4-up strip */}
          <motion.div
            variants={stagger}
            className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          >
            {KPIS.map((k) => (
              <motion.div
                key={k.key}
                variants={fadeSlide}
                whileHover={reduce ? {} : { scale: 1.02 }}
                whileTap={reduce ? {} : { scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="relative rounded-2xl p-5 cursor-default overflow-hidden"
                style={{ background: T.card, border: `1px solid ${T.border}`, backdropFilter: 'blur(12px)' }}
              >
                {/* Corner glow */}
                <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full"
                  style={{ background: `radial-gradient(circle, ${k.color}18 0%, transparent 70%)` }} />

                {/* Icon + trend row */}
                <div className="flex items-center justify-between mb-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: `${k.color}16`, color: k.color }}>
                    {k.icon}
                  </span>
                  {k.trend !== undefined && (
                    <span
                      className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        background: k.trend >= 0 ? `${T.emerald}18` : `${T.rose}18`,
                        color:      k.trend >= 0 ? T.emerald : T.rose,
                      }}
                    >
                      {k.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(k.trend).toFixed(1)}%
                    </span>
                  )}
                </div>

                {/* Number */}
                <Counter value={k.value} color={k.color} size="2.6rem" />

                {/* Labels */}
                <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: T.textMuted }}>
                  {k.label}
                </p>
                <p className="text-[10px]" style={{ color: T.textFaint }}>{k.sub}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* ── Warning alerts ─────────────────────────────────────────────── */}
        <AnimatePresence mode="popLayout">
          {warnings.slice(0, 2).map((a) => (
            <motion.div key={a.id} layout
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm"
                style={{ background: `${T.amber}10`, border: `1px solid ${T.amber}28` }}>
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: T.amber }} />
                <span className="font-semibold" style={{ color: T.amber }}>{a.title}</span>
                <span className="hidden opacity-60 sm:inline" style={{ color: T.amber }}>· {a.message}</span>
                <span className="ml-auto text-xs" style={{ color: T.textFaint }}>{a.partner}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── Separator ──────────────────────────────────────────────────── */}
        <div style={{ height: '1px', background: T.border }} />

        {/* ── Charts row ─────────────────────────────────────────────────── */}
        <motion.div
          className="grid grid-cols-1 gap-5 lg:grid-cols-5"
          variants={stagger} initial="hidden" animate="visible"
        >

          {/* 6-month trend */}
          <motion.div variants={fadeSlide} className="lg:col-span-3">
            <GlassCard accent={T.cyan} className="p-5 h-full">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: T.textFaint }}>Activity Trend</p>
                  <h3 className="text-base font-semibold" style={{ color: T.textPrim }}>6-Month Programme Activity</h3>
                </div>
                <div className="flex items-center gap-3">
                  {Object.entries(CAT).map(([name, c]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-4 rounded-full" style={{ background: `linear-gradient(90deg, ${c.color}, ${c.color}60)` }} />
                      <span className="text-[11px]" style={{ color: T.textMuted }}>{name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                    <defs>
                      {Object.entries(CAT).map(([, c]) => (
                        <linearGradient key={c.gradId} id={c.gradId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={c.color} stopOpacity={0.28} />
                          <stop offset="100%" stopColor={c.color} stopOpacity={0}    />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis dataKey="month_name"
                      tick={{ fontSize: 11, fill: T.textFaint }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: T.textFaint }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip />} cursor={{ stroke: `${T.textFaint}`, strokeWidth: 1, strokeDasharray: '4 4' }} />
                    {/* Glow layers first (wide, faint) */}
                    {Object.entries(CAT).map(([key, c]) => (
                      <Area key={`${key}-glow`}
                        type="monotone" dataKey={key.toLowerCase()} name={key}
                        stroke={c.color} strokeWidth={7} strokeOpacity={0.1}
                        fill="none" dot={false} isAnimationActive={false} legendType="none" />
                    ))}
                    {/* Sharp lines on top */}
                    {Object.entries(CAT).map(([key, c], i) => (
                      <Area key={key}
                        type="monotone" dataKey={key.toLowerCase()} name={key}
                        stroke={c.color} strokeWidth={1.8}
                        fill={`url(#${c.gradId})`} dot={false}
                        isAnimationActive animationDuration={1000 + i * 150} animationEasing="ease-out" />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                /* Animated skeleton bars */
                <div className="flex items-end gap-2 h-[220px] px-4 pb-4">
                  {[35, 55, 42, 70, 58, 80].map((h, i) => (
                    <motion.div key={i} className="flex-1 rounded-t"
                      style={{ background: `linear-gradient(to top, ${T.cyan}50, ${T.cyan}15)`, border: `1px solid ${T.cyan}20`, borderBottom: 'none' }}
                      initial={{ scaleY: 0, originY: 1 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 0.6, delay: i * 0.09, ease: [0.22, 1, 0.36, 1] }}
                      whileStyle={{ height: `${h}%` } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Category breakdown */}
          <motion.div variants={fadeSlide} className="lg:col-span-2">
            <GlassCard accent={T.violet} className="p-5 h-full">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: T.textFaint }}>Breakdown</p>
              <h3 className="text-base font-semibold mb-5" style={{ color: T.textPrim }}>By Category</h3>

              {categoryData.length > 0 ? (
                <>
                  {/* Donut */}
                  <div className="relative flex justify-center">
                    <ResponsiveContainer width={190} height={190}>
                      <PieChart>
                        <Pie data={categoryData} cx="50%" cy="50%"
                          innerRadius={56} outerRadius={86} paddingAngle={3} dataKey="value"
                          stroke="none"
                          isAnimationActive animationBegin={300} animationDuration={1000} animationEasing="ease-out"
                        >
                          {categoryData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip content={<DarkTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Centre label */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <Counter value={catTotal} color={T.textPrim} size="1.5rem" />
                      <span className="text-[10px] mt-0.5 font-bold uppercase tracking-widest" style={{ color: T.textFaint }}>total</span>
                    </div>
                  </div>

                  {/* Progress bars */}
                  <div className="mt-4 space-y-3.5">
                    {categoryData.map(({ name, value, color }) => {
                      const pct = catTotal > 0 ? Math.round((value / catTotal) * 100) : 0
                      return (
                        <div key={name}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-xs font-medium" style={{ color: T.textMuted }}>{name}</span>
                            </div>
                            <span className="text-xs font-bold tabular-nums" style={{ color }}>
                              {value.toLocaleString()}
                              <span className="ml-1 font-normal" style={{ color: T.textFaint }}>({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <motion.div className="h-full rounded-full"
                              style={{ background: `linear-gradient(90deg, ${color}, ${color}70)`, boxShadow: `0 0 8px ${color}60` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 gap-4">
                  <motion.div className="h-28 w-28 rounded-full"
                    style={{ border: `12px solid rgba(255,255,255,0.05)`, borderTopColor: T.violet }}
                    animate={reduce ? {} : { rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="text-sm" style={{ color: T.textFaint }}>Awaiting data</p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </motion.div>

        {/* ── Map + Live feed ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

          {/* Map */}
          <motion.div className="lg:col-span-3"
            initial={{ opacity: 0, y: reduce ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard accent={T.emerald} className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: T.textFaint }}>Geography</p>
                  <h3 className="text-base font-semibold" style={{ color: T.textPrim }}>Service Centre Map</h3>
                </div>
                <div className="flex items-center gap-3">
                  {[
                    { type: 'DIC',     label: 'DICs',     dot: T.cyan    },
                    { type: 'BROTHEL', label: 'Brothels', dot: T.emerald },
                  ].map(({ type, label, dot }) => {
                    const n = (centers ?? []).filter((c) => c.center_type === type).length
                    return n > 0 ? (
                      <div key={type} className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
                        <span className="text-xs" style={{ color: T.textMuted }}>{n} {label}</span>
                      </div>
                    ) : null
                  })}
                </div>
              </div>
              {/* Dark map tiles via CSS filter */}
              <div style={{ filter: 'invert(92%) hue-rotate(180deg) brightness(0.82) contrast(0.95) saturate(0.7)', borderRadius: '12px', overflow: 'hidden' }}>
                <BangladeshMap activityFeed={activityFeed} centers={centers ?? []} />
              </div>
            </GlassCard>
          </motion.div>

          {/* Live activity feed */}
          <motion.div className="lg:col-span-2"
            initial={{ opacity: 0, y: reduce ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard accent={T.cyan} className="p-5 flex flex-col h-full">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1" style={{ color: T.textFaint }}>Real-time</p>
                  <h3 className="text-base font-semibold" style={{ color: T.textPrim }}>Live Submissions</h3>
                </div>
                <span className="relative flex h-2.5 w-2.5">
                  {!reduce && (
                    <motion.span className="absolute inset-0 rounded-full" style={{ background: T.emerald }}
                      animate={{ scale: [1, 2.4, 1], opacity: [0.8, 0, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity }} />
                  )}
                  <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: T.emerald }} />
                </span>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto pr-0.5" style={{ maxHeight: 360,
                scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent` }}>
                {feedLoading && !feed ? (
                  <div className="flex h-36 items-center justify-center">
                    <motion.div className="h-6 w-6 rounded-full border-2 border-t-transparent"
                      style={{ borderColor: `${T.cyan}40`, borderTopColor: T.cyan }}
                      animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
                  </div>
                ) : activityFeed.length === 0 ? (
                  <div className="flex h-36 flex-col items-center justify-center gap-2">
                    <Activity className="h-9 w-9" style={{ color: T.textFaint }} />
                    <p className="text-sm" style={{ color: T.textFaint }}>No recent submissions.</p>
                  </div>
                ) : (
                  <AnimatePresence mode="popLayout" initial={false}>
                    {activityFeed.map((item) => {
                      const itemColor = item.partner === 'PHD' ? T.cyan : T.violet
                      return (
                        <motion.div key={item.id} layout
                          initial={{ opacity: 0, x: reduce ? 0 : 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: reduce ? 0 : -12 }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                          whileHover={reduce ? {} : { backgroundColor: 'rgba(255,255,255,0.05)' }}
                          className="flex items-start gap-3 rounded-xl p-3 transition-colors"
                          style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.border}` }}
                        >
                          {/* Icon */}
                          <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ background: `${itemColor}18`, color: itemColor, border: `1px solid ${itemColor}25` }}>
                            {ICONS[item.form_type] ?? <Activity className="h-3.5 w-3.5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-snug" style={{ color: T.textPrim, textWrap: 'pretty' } as React.CSSProperties}>
                              <span className="font-semibold" style={{ color: itemColor }}>{item.partner}</span>
                              <span style={{ color: T.textMuted }}> · {item.district}</span>
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <StatusBadge status={item.form_type} overrideLabel={item.form_type_display} />
                              <span className="text-[10px] tabular-nums" style={{ color: T.textFaint }}>{item.time_ago}</span>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {kpis && (
          <motion.div className="flex items-center justify-between pt-2"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
          >
            <div className="h-[1px] flex-1 mr-6" style={{ background: T.border }} />
            <p className="text-[11px] flex-shrink-0" style={{ color: T.textFaint }}>
              Updated {formatDateTime(kpis.as_of)} · Refreshes every 30 s
            </p>
          </motion.div>
        )}

      </div>{/* /content */}
    </div>
  )
}
