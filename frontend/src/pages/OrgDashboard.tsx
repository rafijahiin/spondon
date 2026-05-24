/**
 * Shared dashboard component used by both PHD and Bondhu pages.
 * Pass partner="PHD" or partner="Bondhu" as a prop.
 */
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { KPICard } from '@/components/ui/KPICard'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { Sparkline } from '@/components/ui/Sparkline'
import { AlertCard } from '@/components/ui/AlertCard'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/format'
import type { PartnerKPIs, MonthlyRow, CentresResponse, Alert } from '@/types'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

type Partner = 'PHD' | 'Bondhu'

interface OrgSummaryResponse {
  partner: Partner
  period: string
  ai_summary: string
  generated_at: string
}

interface Props {
  partner: Partner
}

export function OrgDashboard({ partner }: Props) {
  const { data: kpis, loading: kpisLoading } = usePolling<PartnerKPIs>({
    fetcher: () => api.get(`/dashboard/partner-kpis/?partner=${partner}`).then((r) => r.data),
    interval: 30_000,
  })

  const { data: monthly } = usePolling<{ year: number; months: MonthlyRow[] }>({
    fetcher: () => api.get(`/dashboard/monthly/?partner=${partner}`).then((r) => r.data),
    interval: 60_000,
  })

  const { data: centres } = usePolling<CentresResponse>({
    fetcher: () => api.get(`/dashboard/centres/?partner=${partner}`).then((r) => r.data),
    interval: 60_000,
  })

  const { data: summary } = usePolling<OrgSummaryResponse>({
    fetcher: () => api.get(`/dashboard/org-summary/?partner=${partner}`).then((r) => r.data),
    interval: 5 * 60_000,
  })

  const { data: alerts } = usePolling<Alert[]>({
    fetcher: () =>
      api
        .get(`/dashboard/alerts/?partner=${partner}&acknowledged=false`)
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 60_000,
  })

  if (kpisLoading && !kpis) return <PageLoader />

  const sparkFistula = monthly?.months.map((m) => m.fistula) ?? []
  const sparkActivity = monthly?.months.map((m) => m.activity) ?? []

  const partnerColor = partner === 'PHD' ? '#00658C' : '#7c3aed'

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{partner} Dashboard</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          {partner === 'PHD' ? 'পপুলেশন হেলথ ডিপার্টমেন্ট' : 'বন্ধু সোশ্যাল ওয়েলফেয়ার সোসাইটি'} · Monthly M&amp;E Summary
        </p>
      </div>

      {/* AI Anomaly Alerts */}
      {(alerts ?? []).filter((a) => !a.acknowledged).length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Alerts</h2>
          {(alerts ?? []).filter((a) => !a.acknowledged).map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard label="Submissions" labelBn="জমা" value={kpis.submissions_this_month} sparkData={sparkActivity} />
          <KPICard label="Pending" labelBn="বাকি" value={kpis.pending} />
          <KPICard label="Active Workers" labelBn="সক্রিয় কর্মী" value={kpis.active_workers} />
          <KPICard label="Fistula Cases" labelBn="ফিস্টুলা" value={kpis.fistula_cases} sparkData={sparkFistula} />
        </div>
      )}

      {/* Progress rings + monthly chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Progress Rings */}
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6">
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">Target Attainment</h2>
          {kpis ? (
            <div className="flex flex-wrap justify-around gap-6">
              <ProgressRing
                value={kpis.fistula_cases}
                target={20}
                label="Fistula"
                sublabel="Target: 20"
                size={110}
              />
              <ProgressRing
                value={kpis.mpdsr_cases}
                target={10}
                label="MPDSR"
                sublabel="Target: 10"
                size={110}
              />
              <ProgressRing
                value={kpis.submissions_this_month}
                target={100}
                label="Activity"
                sublabel="Target: 100"
                size={110}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No data yet.</p>
          )}
        </div>

        {/* Monthly bar chart */}
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6">
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">Monthly Breakdown</h2>
          {monthly?.months && monthly.months.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly.months} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month_name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="fistula" fill={partnerColor} name="Fistula" radius={[3, 3, 0, 0]} />
                <Bar dataKey="mpdsr" fill="#f59e0b" name="MPDSR" radius={[3, 3, 0, 0]} />
                <Bar dataKey="activity" fill="#10b981" name="Activity" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-48 items-center justify-center text-sm text-gray-400">
              No monthly data available.
            </div>
          )}
        </div>
      </div>

      {/* By-centre ranking + sparklines table */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6">
        <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">District Performance Ranking</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">Rank</th>
                <th className="py-2 text-left font-medium text-gray-500 dark:text-gray-400">District</th>
                <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400">Submissions</th>
                <th className="py-2 text-right font-medium text-gray-500 dark:text-gray-400">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {(centres?.districts ?? []).map((d) => (
                <tr key={d.district} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-2.5 pr-4">
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${d.rank <= 3 ? 'bg-unfpa-blue text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                      {d.rank}
                    </span>
                  </td>
                  <td className="py-2.5 font-medium text-gray-900 dark:text-white">{d.district}</td>
                  <td className="py-2.5 text-right text-gray-700 dark:text-gray-300">{d.count}</td>
                  <td className="py-2.5 text-right">
                    <div className="flex justify-end">
                      <Sparkline data={[d.count * 0.6, d.count * 0.8, d.count * 0.9, d.count]} width={60} height={24} />
                    </div>
                  </td>
                </tr>
              ))}
              {!centres?.districts?.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-gray-400">No district data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Weekly Summary */}
      {summary && (
        <div className="rounded-xl bg-gradient-to-r from-unfpa-dark to-unfpa-blue text-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-blue-200 uppercase tracking-wide mb-2">
                AI-Generated Weekly Summary · {summary.period}
              </p>
              <p className="text-sm leading-relaxed text-blue-50">{summary.ai_summary}</p>
            </div>
          </div>
          <p className="mt-3 text-[10px] text-blue-300">
            Generated {formatDate(summary.generated_at)} · AI-assisted narrative using Groq / LLaMA 3.3 70B
          </p>
        </div>
      )}
    </div>
  )
}
