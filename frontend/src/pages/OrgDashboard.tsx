/**
 * Shared dashboard component used by both PHD and Bondhu pages.
 * Pass partner="PHD" or partner="Bondhu" as a prop.
 *
 * Data hierarchy:
 *  1. Real programs API (/api/dashboard/programs-summary/) — used when total > 0
 *  2. Mock data from mockDashboardData.ts — used while no real submissions exist
 *
 * To remove mock data: delete frontend/src/data/mockDashboardData.ts and the
 * three MOCK_* imports below.
 */
import { useEffect, useState } from 'react'
import { motion, useReducedMotion, AnimatePresence } from 'motion/react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import {
  Activity, AlertTriangle, TrendingUp, TrendingDown,
  Minus, Users, Stethoscope, HeartHandshake, Megaphone,
  Info,
} from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { KPICard } from '@/components/ui/KPICard'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { Sparkline } from '@/components/ui/Sparkline'
import { AlertCard } from '@/components/ui/AlertCard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { IndicatorGrid } from '@/components/indicators/IndicatorGrid'
import { formatDate } from '@/utils/format'
import type { PartnerKPIs, CentresResponse, Alert, ProgramsSummary } from '@/types'
import {
  MOCK_PROGRAMS, MOCK_KPIS, MOCK_CENTRES,
} from '@/data/mockDashboardData'

type Partner = 'PHD' | 'Bondhu'

interface OrgSummaryResponse {
  partner: Partner
  period: string
  ai_summary: string
  generated_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  Clinical:   '#0093D0',
  Community:  '#00875A',
  Operations: '#FF991F',
}

const CAT_ICONS: Record<string, React.ReactNode> = {
  Clinical:   <Stethoscope className="h-4 w-4" />,
  Community:  <Megaphone className="h-4 w-4" />,
  Operations: <HeartHandshake className="h-4 w-4" />,
}

function MomBadge({ value }: { value: number }) {
  if (value > 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 tabular-nums">
      <TrendingUp className="h-3 w-3" />+{value}%
    </span>
  )
  if (value < 0) return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400 tabular-nums">
      <TrendingDown className="h-3 w-3" />{value}%
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 tabular-nums">
      <Minus className="h-3 w-3" />0%
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  partner: Partner
}

export function OrgDashboard({ partner }: Props) {
  const reduce = useReducedMotion()
  const partnerColor = partner === 'PHD' ? '#00658C' : '#7c3aed'
  const partnerLight = partner === 'PHD' ? '#DDF0FA' : '#ede9fe'

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

  const { data: alerts } = usePolling<Alert[]>({
    fetcher: () =>
      api
        .get(`/dashboard/alerts/?partner=${partner}&acknowledged=false`)
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 60_000,
  })

  // ── Mock fallback ──────────────────────────────────────────────────────────
  // Switch to mock when real data has zero submissions (programme just started)

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

  // Spark trends from monthly data
  const sparkClinical = monthlyTrend.map((m) => m.clinical)
  const sparkCommunity = monthlyTrend.map((m) => m.community)

  if (kpisLoading && !kpis && programsLoading) return <PageLoader />

  return (
    <div className="space-y-6">

      {/* ── Heading ────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{partner} Dashboard</h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            {partner === 'PHD'
              ? 'পপুলেশন হেলথ ডিপার্টমেন্ট'
              : 'বন্ধু সোশ্যাল ওয়েলফেয়ার সোসাইটি'}{' '}
            · SRHR M&amp;E Dashboard
          </p>
        </div>
        {usingMock && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 shrink-0"
          >
            <Info className="h-3 w-3" />
            Demo data
          </motion.div>
        )}
      </motion.div>

      {/* ── Live alerts ────────────────────────────────────────────────────── */}
      <AnimatePresence mode="popLayout">
        {(alerts ?? []).filter((a) => !a.acknowledged).length > 0 && (
          <motion.div
            key="alerts"
            initial={{ opacity: 0, y: reduce ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Live Alerts
            </h2>
            {(alerts ?? []).filter((a) => !a.acknowledged).map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top KPI row ─────────────────────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.05 }}
      >
        {/* Total programmes this month */}
        <div
          className="relative overflow-hidden rounded-xl p-4 text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${partnerColor} 0%, #0093D0 100%)` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Total Activities
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">
                {displayPrograms.total.toLocaleString()}
              </p>
              <div className="mt-1">
                <MomBadge value={displayPrograms.mom_change} />
              </div>
            </div>
            <Activity className="h-8 w-8 text-white/30" />
          </div>
        </div>

        {/* Category tiles: Clinical, Community, Operations */}
        {(['Clinical', 'Community', 'Operations'] as const).map((cat, i) => (
          <div
            key={cat}
            className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {cat}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {(categories[cat] ?? 0).toLocaleString()}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {cat === 'Clinical' ? 'Services' : cat === 'Community' ? 'Outreach' : 'Ops'}
                </p>
              </div>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
                style={{ background: CAT_COLORS[cat] }}
              >
                {CAT_ICONS[cat]}
              </span>
            </div>
          </div>
        ))}
      </motion.div>

      {/* ── Secondary KPI row: workers, pending, fistula, MPDSR ─────────────── */}
      <motion.div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        <KPICard
          label="Submissions"
          labelBn="জমা"
          value={displayKpis.submissions_this_month}
          sparkData={sparkClinical}
        />
        <KPICard label="Pending" labelBn="বাকি" value={displayKpis.pending} />
        <KPICard
          label="Active Workers"
          labelBn="সক্রিয় কর্মী"
          value={displayKpis.active_workers}
          sparkData={sparkCommunity}
        />
        <KPICard
          label="Fistula Cases"
          labelBn="ফিস্টুলা"
          value={displayKpis.fistula_cases}
        />
      </motion.div>

      {/* ── Progress rings + monthly chart ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Progress rings */}
        <motion.div
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
            Category Attainment
          </h2>
          <div className="flex flex-wrap justify-around gap-6">
            <ProgressRing
              value={categories.Clinical ?? 0}
              target={partner === 'PHD' ? 250 : 600}
              label="Clinical"
              sublabel={`Target: ${partner === 'PHD' ? '250' : '600'}`}
              size={110}
            />
            <ProgressRing
              value={categories.Community ?? 0}
              target={partner === 'PHD' ? 200 : 650}
              label="Community"
              sublabel={`Target: ${partner === 'PHD' ? '200' : '650'}`}
              size={110}
            />
            <ProgressRing
              value={displayKpis.fistula_cases}
              target={partner === 'PHD' ? 20 : 10}
              label="Fistula"
              sublabel={`Target: ${partner === 'PHD' ? '20' : '10'}`}
              size={110}
            />
          </div>
        </motion.div>

        {/* 6-month stacked bar chart */}
        <motion.div
          className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
            6-Month Activity Trend
          </h2>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={monthlyTrend}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month_name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [value, name]}
                  contentStyle={{ fontSize: 11 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="clinical"   stackId="a" fill={CAT_COLORS.Clinical}   name="Clinical"   radius={[0,0,0,0]} />
                <Bar dataKey="community"  stackId="a" fill={CAT_COLORS.Community}  name="Community"  radius={[0,0,0,0]} />
                <Bar dataKey="operations" stackId="a" fill={CAT_COLORS.Operations} name="Operations" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-gray-400">
              No monthly data available.
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Top 8 form types table ───────────────────────────────────────────── */}
      <motion.div
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6"
        initial={{ opacity: 0, y: reduce ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
          Top Activities This Month
        </h2>
        <div className="space-y-2">
          {topForms.map((form, i) => {
            const maxCount = topForms[0]?.count ?? 1
            const pct = Math.round((form.count / maxCount) * 100)
            const color = CAT_COLORS[form.category] ?? '#9ca3af'
            return (
              <div key={form.key} className="flex items-center gap-3">
                <span className="w-4 text-right text-[10px] font-bold text-gray-400 tabular-nums shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                      {form.label}
                      <span className="font-bangla ml-1 text-[10px] text-gray-400">
                        {form.label_bn}
                      </span>
                    </span>
                    <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums shrink-0">
                      {form.count}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
                    <motion.div
                      className="h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, delay: 0.3 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: color }}
                >
                  {form.category}
                </span>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* ── District ranking ─────────────────────────────────────────────────── */}
      <motion.div
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6"
        initial={{ opacity: 0, y: reduce ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">
          District Performance Ranking
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">Rank</th>
                <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">District</th>
                <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400 tabular-nums">
                  Submissions
                </th>
                <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {(displayCentres.districts ?? []).map((d) => (
                <tr
                  key={d.district}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                        d.rank <= 3
                          ? 'bg-unfpa-blue text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {d.rank}
                    </span>
                  </td>
                  <td className="py-2.5 font-medium text-gray-900 dark:text-white">
                    {d.district}
                  </td>
                  <td className="py-2.5 text-right text-gray-700 dark:text-gray-300 tabular-nums">
                    {d.count}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end">
                      <Sparkline
                        data={[
                          Math.round(d.count * 0.55),
                          Math.round(d.count * 0.7),
                          Math.round(d.count * 0.85),
                          d.count,
                        ]}
                        width={60}
                        height={24}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!displayCentres.districts?.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-gray-400">
                    No district data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── M&E Indicator Progress ───────────────────────────────────────────── */}
      <motion.div
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6"
        initial={{ opacity: 0, y: reduce ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <IndicatorGrid
          org={partner}
          periodStart="2026-05-21"
          periodEnd="2026-11-20"
        />
      </motion.div>

      {/* ── AI Weekly Summary ────────────────────────────────────────────────── */}
      {summary && (
        <motion.div
          className="rounded-xl bg-gradient-to-r from-unfpa-dark to-unfpa-blue text-white p-6 shadow-sm"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-blue-200 uppercase tracking-wide mb-2">
                AI-Generated Weekly Summary · {summary.period}
              </p>
              <p
                className="text-sm leading-relaxed text-blue-50"
                style={{ textWrap: 'pretty' } as React.CSSProperties}
              >
                {summary.ai_summary}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-blue-300">
            Generated {formatDate(summary.generated_at)} · AI-assisted narrative using Groq / LLaMA 3.3 70B
          </p>
        </motion.div>
      )}

    </div>
  )
}
