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

// ─── Motion variants ──────────────────────────────────────────────────────────

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const cardItem = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

// ─── Animated spring counter ──────────────────────────────────────────────────

function AnimatedCounter({ value, className }: { value: number; className?: string }) {
  const reduce   = useReducedMotion()
  const mv       = useMotionValue(reduce ? value : 0)
  const spring   = useSpring(mv, { damping: 38, stiffness: 85 })
  const [count, setCount] = useState(reduce ? value : 0)

  useEffect(() => { mv.set(value) }, [value, mv])
  useEffect(() => spring.on('change', (v) => setCount(Math.round(v))), [spring])

  return <span className={className}>{count.toLocaleString()}</span>
}

// ─── Recharts custom tooltip ──────────────────────────────────────────────────

interface TooltipPayload { name: string; value: number; color: string }
interface TooltipProps   { active?: boolean; payload?: TooltipPayload[]; label?: string }

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-gray-900/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      {label && <p className="mb-1.5 text-xs text-gray-400">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="text-sm font-semibold tabular-nums" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

// ─── API hooks ────────────────────────────────────────────────────────────────

function useKPIs() {
  return usePolling<KPIs>({
    fetcher: () => api.get('/dashboard/kpis/').then((r) => r.data),
    interval: 30_000,
  })
}
function useActivityFeed() {
  return usePolling<ActivityItem[]>({
    fetcher: () =>
      api.get('/dashboard/activity-feed/').then((r) =>
        Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
      ),
    interval: 20_000,
  })
}
function useAlerts() {
  return usePolling<Alert[]>({
    fetcher: () =>
      api.get('/dashboard/alerts/?acknowledged=false').then((r) =>
        Array.isArray(r.data) ? r.data : (r.data?.results ?? [])
      ),
    interval: 60_000,
  })
}
function useServiceCenters() {
  return usePolling<ServiceCenter[]>({
    fetcher: () =>
      api.get('/programs/centers/').then((r) => {
        const d = r.data
        return Array.isArray(d) ? d : (d?.results ?? [])
      }),
    interval: 5 * 60_000,
  })
}
function useProgramsSummary(partner = '') {
  return usePolling<ProgramsSummary>({
    fetcher: () =>
      api
        .get('/dashboard/programs-summary/', { params: partner ? { partner } : {} })
        .then((r) => r.data),
    interval: 60_000,
  })
}

// ─── Form icons map ───────────────────────────────────────────────────────────

const FORM_ICONS: Record<string, React.ReactNode> = {
  fistula:              <Heart    className="h-3.5 w-3.5" />,
  mpdsr:               <Activity className="h-3.5 w-3.5" />,
  activity:            <Users    className="h-3.5 w-3.5" />,
  baseline:            <FileText className="h-3.5 w-3.5" />,
  clinic_visit:        <Activity className="h-3.5 w-3.5" />,
  hiv_sti_test:        <Activity className="h-3.5 w-3.5" />,
  antenatal_card:      <Heart    className="h-3.5 w-3.5" />,
  htc_counselling:     <Users    className="h-3.5 w-3.5" />,
  individual_counselling: <Users className="h-3.5 w-3.5" />,
  mh_screening:        <FileText className="h-3.5 w-3.5" />,
  gbv_case:            <AlertTriangle className="h-3.5 w-3.5" />,
  outreach_session:    <Users    className="h-3.5 w-3.5" />,
  group_education:     <Users    className="h-3.5 w-3.5" />,
  referral:            <FileText className="h-3.5 w-3.5" />,
  hygiene_kit:         <FileText className="h-3.5 w-3.5" />,
  adr_record:          <Activity className="h-3.5 w-3.5" />,
  autoclave_log:       <Activity className="h-3.5 w-3.5" />,
  training_event:      <Users    className="h-3.5 w-3.5" />,
  coord_meeting:       <Users    className="h-3.5 w-3.5" />,
  mobile_camp:         <MapPin   className="h-3.5 w-3.5" />,
  client_reg:          <Users    className="h-3.5 w-3.5" />,
}

// ─── Category colour palette ──────────────────────────────────────────────────

const CAT = {
  Clinical:   { fill: '#00658C', gradient: 'clinicalGrad',   dark: '#0088BB' },
  Community:  { fill: '#16a34a', gradient: 'communityGrad',  dark: '#22c55e' },
  Operations: { fill: '#d97706', gradient: 'operationsGrad', dark: '#f59e0b' },
} as const

// ─── Home page ────────────────────────────────────────────────────────────────

export default function Home() {
  const reduce = useReducedMotion()

  const { data: kpis,    loading: kpisLoading } = useKPIs()
  const { data: feed,    loading: feedLoading } = useActivityFeed()
  const { data: alerts  }                       = useAlerts()
  const { data: centers }                       = useServiceCenters()
  const { data: summary }                       = useProgramsSummary()

  const activityFeed   = feed   ?? []
  const criticalAlerts = (alerts ?? []).filter((a) => !a.acknowledged && a.severity === 'critical')
  const warningAlerts  = (alerts ?? []).filter((a) => !a.acknowledged && a.severity !== 'critical')

  if (kpisLoading && !kpis) return <PageLoader />

  // ── Derived data ─────────────────────────────────────────────────────────────
  const categoryData = summary?.categories
    ? Object.entries(summary.categories)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([name, value]) => ({
          name,
          value:    value as number,
          fill:     CAT[name as keyof typeof CAT]?.fill  ?? '#6b7280',
          gradient: CAT[name as keyof typeof CAT]?.gradient ?? '',
        }))
    : []

  const trendData   = summary?.monthly_trend ?? []
  const catTotal    = categoryData.reduce((s, d) => s + d.value, 0)
  const momChange   = summary?.mom_change ?? kpis?.mom_change_percent ?? 0
  const submissions = kpis?.submissions_this_month ?? summary?.total ?? 0

  return (
    <div className="space-y-5">

      {/* ── Critical alert banner ──────────────────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {criticalAlerts.map((a) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3">
              <motion.div
                animate={reduce ? {} : { scale: [1, 1.25, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
              </motion.div>
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">{a.title}</span>
              <span className="hidden text-sm text-red-600 dark:text-red-300 sm:inline">· {a.message}</span>
              <span className="ml-auto text-xs text-red-400">{a.partner}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Hero banner ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #002f45 0%, #004A66 40%, #00658C 75%, #0078a8 100%)' }}
      >
        {/* Floating orbs */}
        {!reduce && (
          <>
            <motion.div
              className="pointer-events-none absolute -top-32 -right-32 h-[26rem] w-[26rem] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(0,136,187,0.35) 0%, transparent 70%)' }}
              animate={{ x: [0, 22, 0], y: [0, -14, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute -bottom-28 -left-20 h-80 w-80 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(0,74,102,0.5) 0%, transparent 70%)' }}
              animate={{ x: [0, -18, 0], y: [0, 12, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(0,120,168,0.15) 0%, transparent 70%)' }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
            />
          </>
        )}

        {/* Dot-grid texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        <div className="relative px-6 py-8 sm:px-8 sm:py-9">
          {/* Top row: badge + live pill */}
          <div className="flex items-start justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: reduce ? 0 : -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-0.5 text-xs font-medium text-blue-100 backdrop-blur-sm">
                CIPRB · UNFPA Bangladesh
              </span>
              <h1 className="mt-3 text-[2rem] font-bold leading-tight tracking-tight text-white">
                Programme Overview
              </h1>
              <p
                className="mt-1 text-sm text-blue-200/70"
                style={{ fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}
              >
                সামগ্রিক কর্মসূচি পর্যবেক্ষণ · Real-time M&amp;E
              </p>
            </motion.div>

            {/* Live indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45 }}
              className="flex flex-shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm"
            >
              <span className="relative flex h-2 w-2">
                {!reduce && (
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full bg-green-400"
                    animate={{ scale: [1, 2.2, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              <span className="text-xs font-medium text-green-300">Live</span>
            </motion.div>
          </div>

          {/* KPI stat cards */}
          <motion.div
            className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {[
              {
                label:   'Submissions This Month',
                labelBn: 'এ মাসের জমা',
                value:   submissions,
                trend:   momChange,
                icon:    <FileText className="h-5 w-5" />,
                accent:  'text-sky-300',
              },
              {
                label:   'Pending Review',
                labelBn: 'পর্যালোচনা বাকি',
                value:   kpis?.submissions_pending ?? 0,
                icon:    <Activity className="h-5 w-5" />,
                accent:  (kpis?.submissions_pending ?? 0) > 0 ? 'text-amber-300' : 'text-sky-300',
              },
              {
                label:   'Active Workers',
                labelBn: 'সক্রিয় কর্মী',
                value:   kpis?.active_workers ?? 0,
                icon:    <Users className="h-5 w-5" />,
                accent:  'text-emerald-300',
              },
              {
                label:   'Fistula Cases',
                labelBn: 'ফিস্টুলা কেস',
                value:   kpis?.fistula_cases_this_month ?? 0,
                icon:    <Heart className="h-5 w-5" />,
                accent:  'text-rose-300',
              },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                variants={cardItem}
                whileHover={reduce ? {} : { scale: 1.025 }}
                whileTap={reduce ? {} : { scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="cursor-default rounded-xl border border-white/10 p-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <span className={`opacity-80 ${stat.accent}`}>{stat.icon}</span>
                  {'trend' in stat && stat.trend !== undefined && (
                    <span
                      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                        stat.trend >= 0
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {stat.trend >= 0
                        ? <TrendingUp  className="h-3 w-3" />
                        : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(stat.trend).toFixed(1)}%
                    </span>
                  )}
                </div>
                <AnimatedCounter
                  value={stat.value}
                  className="block text-[2rem] font-bold leading-none tabular-nums text-white"
                />
                <p className="mt-2 text-xs font-medium text-blue-200/70 leading-snug">{stat.label}</p>
                <p
                  className="mt-0.5 text-[10px] text-blue-300/40"
                  style={{ fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}
                >
                  {stat.labelBn}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* ── Warning / info alerts ──────────────────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {warningAlerts.slice(0, 2).map((a) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                a.severity === 'warning'
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300'
                  : 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="font-medium">{a.title}</span>
              <span className="hidden opacity-70 sm:inline">· {a.message}</span>
              <span className="ml-auto text-xs opacity-60">{a.partner}</span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-1 gap-5 lg:grid-cols-5"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {/* 6-month area trend */}
        <motion.div variants={cardItem} className="lg:col-span-3">
          <div className="h-full rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Activity Trend</h2>
                <p
                  className="mt-0.5 text-xs text-gray-400"
                  style={{ fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}
                >
                  মাসিক কার্যক্রমের প্রবণতা
                </p>
              </div>
              <span className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-400 dark:bg-gray-700/50 dark:text-gray-500">
                6 months
              </span>
            </div>

            {trendData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      {Object.entries(CAT).map(([name, c]) => (
                        <linearGradient key={name} id={c.gradient} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={c.fill} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={c.fill} stopOpacity={0}   />
                        </linearGradient>
                      ))}
                    </defs>
                    <XAxis
                      dataKey="month_name"
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone" dataKey="clinical" name="Clinical"
                      stroke={CAT.Clinical.fill} strokeWidth={2.5}
                      fill={`url(#${CAT.Clinical.gradient})`} dot={false}
                      isAnimationActive animationDuration={900} animationEasing="ease-out"
                    />
                    <Area
                      type="monotone" dataKey="community" name="Community"
                      stroke={CAT.Community.fill} strokeWidth={2.5}
                      fill={`url(#${CAT.Community.gradient})`} dot={false}
                      isAnimationActive animationDuration={900} animationEasing="ease-out"
                    />
                    <Area
                      type="monotone" dataKey="operations" name="Operations"
                      stroke={CAT.Operations.fill} strokeWidth={2.5}
                      fill={`url(#${CAT.Operations.gradient})`} dot={false}
                      isAnimationActive animationDuration={900} animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div className="mt-4 flex flex-wrap gap-4">
                  {Object.entries(CAT).map(([name, c]) => (
                    <div key={name} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.fill }} />
                      <span className="text-xs text-gray-500 dark:text-gray-400">{name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-52 flex-col items-center justify-center gap-3">
                <div className="flex gap-1 items-end h-12">
                  {[40, 60, 35, 75, 55, 80].map((h, i) => (
                    <motion.div
                      key={i}
                      className="w-5 rounded-t bg-gray-100 dark:bg-gray-700"
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-400">Trend data will appear after first submissions</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Category donut */}
        <motion.div variants={cardItem} className="lg:col-span-2">
          <div className="h-full rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">By Category</h2>
              <p
                className="mt-0.5 text-xs text-gray-400"
                style={{ fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}
              >
                বিভাগ অনুযায়ী
              </p>
            </div>

            {categoryData.length > 0 ? (
              <>
                {/* Donut */}
                <div className="flex justify-center">
                  <div className="relative">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={54}
                          outerRadius={82}
                          paddingAngle={4}
                          dataKey="value"
                          isAnimationActive
                          animationBegin={200}
                          animationDuration={1000}
                          animationEasing="ease-out"
                          stroke="none"
                        >
                          {categoryData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Centre label */}
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <AnimatedCounter
                        value={catTotal}
                        className="text-xl font-bold tabular-nums text-gray-900 dark:text-white"
                      />
                      <span className="text-[10px] text-gray-400">total</span>
                    </div>
                  </div>
                </div>

                {/* Bar breakdown */}
                <div className="mt-3 space-y-3">
                  {categoryData.map(({ name, value, fill }) => {
                    const pct = catTotal > 0 ? Math.round((value / catTotal) * 100) : 0
                    return (
                      <div key={name}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: fill }} />
                            <span className="text-gray-600 dark:text-gray-300">{name}</span>
                          </div>
                          <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                            {value.toLocaleString()}{' '}
                            <span className="font-normal text-gray-400">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: fill }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              /* Skeleton donut */
              <div className="flex flex-col items-center justify-center gap-4 py-4">
                <motion.div
                  className="h-[110px] w-[110px] rounded-full border-[18px] border-gray-100 dark:border-gray-700"
                  animate={reduce ? {} : { rotate: 360 }}
                  transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
                  style={{ borderTopColor: '#00658C' }}
                />
                <p className="text-sm text-gray-400">No category data yet</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* ── Map + Live feed ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Map */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, y: reduce ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Service Centre Map</h2>
                <p
                  className="mt-0.5 text-xs text-gray-400 dark:text-gray-500"
                  style={{ fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}
                >
                  সেবাকেন্দ্র ও জমা
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                {[
                  { type: 'DIC',     label: 'DICs',      dot: '#00658C' },
                  { type: 'BROTHEL', label: 'Brothels',  dot: '#16a34a' },
                ].map(({ type, label, dot }) => {
                  const n = (centers ?? []).filter((c) => c.center_type === type).length
                  return n > 0 ? (
                    <span key={type} className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />
                      {n} {label}
                    </span>
                  ) : null
                })}
              </div>
            </div>
            <BangladeshMap activityFeed={activityFeed} centers={centers ?? []} />
          </div>
        </motion.div>

        {/* Live activity feed */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: reduce ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Live Activity</h2>
                <p
                  className="mt-0.5 text-xs text-gray-400 dark:text-gray-500"
                  style={{ fontFamily: 'Hind Siliguri, Noto Sans Bengali, sans-serif' }}
                >
                  সরাসরি কার্যক্রম
                </p>
              </div>
              <span className="relative flex h-2.5 w-2.5">
                {!reduce && (
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
                    animate={{ scale: [1, 2.4, 1], opacity: [0.75, 0, 0.75] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
            </div>

            {/* Feed list */}
            <div className="flex-1 space-y-2 overflow-y-auto pr-0.5" style={{ maxHeight: 340 }}>
              {feedLoading && !feed ? (
                <div className="flex h-36 items-center justify-center">
                  <motion.div
                    className="h-6 w-6 rounded-full border-2 border-unfpa-blue border-t-transparent"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                </div>
              ) : activityFeed.length === 0 ? (
                <div className="flex h-36 flex-col items-center justify-center gap-2">
                  <Activity className="h-9 w-9 text-gray-200 dark:text-gray-700" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No recent submissions.</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout" initial={false}>
                  {activityFeed.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: reduce ? 0 : 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: reduce ? 0 : -10, height: 0 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={reduce ? {} : { backgroundColor: 'rgba(0,101,140,0.04)' }}
                      className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-700/40"
                    >
                      {/* Icon badge */}
                      <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm text-unfpa-blue dark:bg-gray-600 dark:text-blue-300">
                        {FORM_ICONS[item.form_type] ?? <Activity className="h-3.5 w-3.5" />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p
                          className="text-xs leading-snug text-gray-700 dark:text-gray-200"
                          style={{ textWrap: 'pretty' } as React.CSSProperties}
                        >
                          <span className="font-semibold">{item.partner}</span>
                          <span className="text-gray-400 dark:text-gray-500"> · {item.district}</span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={item.form_type} overrideLabel={item.form_type_display} />
                          <span className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
                            {item.time_ago}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      {kpis && (
        <motion.p
          className="text-right text-xs text-gray-400 dark:text-gray-600"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          Data as of {formatDateTime(kpis.as_of)} · Updates every 30 s
        </motion.p>
      )}
    </div>
  )
}
