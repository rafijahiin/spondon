import { useState } from 'react'
import { AlertTriangle, MapPin } from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { BaselineSurvey } from '@/types'
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

type SurveyFilter = 'all' | 'baseline' | 'endline'
type PartnerFilter = 'all' | 'PHD' | 'Bondhu'

export default function BaselineEndline() {
  const [surveyFilter, setSurveyFilter] = useState<SurveyFilter>('all')
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all')
  const [dupeOnly, setDupeOnly] = useState(false)

  const { data: surveys, loading } = usePolling<BaselineSurvey[]>({
    fetcher: () =>
      api
        .get('/baseline/surveys/', {
          params: {
            ...(surveyFilter !== 'all' ? { survey_type: surveyFilter } : {}),
            ...(partnerFilter !== 'all' ? { partner: partnerFilter } : {}),
            ...(dupeOnly ? { is_duplicate: true } : {}),
          },
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const dupeCount = (surveys ?? []).filter((s) => s.is_duplicate).length

  // Build district chart data
  const districtMap: Record<string, { baseline: number; endline: number }> = {}
  for (const s of surveys ?? []) {
    if (!districtMap[s.district]) districtMap[s.district] = { baseline: 0, endline: 0 }
    districtMap[s.district][s.survey_type]++
  }
  const chartData = Object.entries(districtMap)
    .map(([district, counts]) => ({ district, ...counts }))
    .sort((a, b) => (b.baseline + b.endline) - (a.baseline + a.endline))
    .slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Baseline &amp; Endline</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          বেসলাইন ও এন্ডলাইন জরিপ · Survey Analysis
        </p>
      </div>

      {/* Duplicate warning */}
      {dupeCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {dupeCount} duplicate submission{dupeCount !== 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
              Same location + device in the same period. Review and confirm before analysis.
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-6">
          <h2 className="mb-4 font-semibold text-gray-900 dark:text-white">Surveys by District (Top 10)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="district" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="baseline" fill="#00658C" name="Baseline" radius={[3, 3, 0, 0]} />
              <Bar dataKey="endline" fill="#10b981" name="Endline" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'baseline', 'endline'] as SurveyFilter[]).map((t) => (
          <button
            key={t}
            onClick={() => setSurveyFilter(t)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors capitalize',
              surveyFilter === t
                ? 'bg-unfpa-blue text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            )}
          >
            {t === 'all' ? 'All Types' : t}
          </button>
        ))}
        <div className="w-px bg-gray-200 dark:bg-gray-700 self-stretch" />
        {(['all', 'PHD', 'Bondhu'] as PartnerFilter[]).map((p) => (
          <button
            key={p}
            onClick={() => setPartnerFilter(p)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              partnerFilter === p
                ? 'bg-unfpa-blue text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            )}
          >
            {p === 'all' ? 'All Partners' : p}
          </button>
        ))}
        <button
          onClick={() => setDupeOnly((o) => !o)}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            dupeOnly
              ? 'bg-status-behind text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
          )}
        >
          Duplicates only
        </button>
      </div>

      {/* Table */}
      {loading && !surveys ? (
        <PageLoader />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                <tr>
                  {['Participant', 'Partner', 'District', 'Type', 'Date', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(surveys ?? []).map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'hover:bg-gray-50 dark:hover:bg-gray-700/30',
                      s.is_duplicate && 'bg-amber-50/50 dark:bg-amber-900/10'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {s.participant_code}
                      {s.is_duplicate && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          <span className="text-[10px]">Dup</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-unfpa-blue">{s.partner}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {s.district}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.survey_type} overrideLabel={s.survey_type_display} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDateTime(s.date_conducted)}</td>
                    <td className="px-4 py-3">
                      {s.is_duplicate
                        ? <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Duplicate</span>
                        : <span className="text-xs text-green-600 dark:text-green-400">OK</span>
                      }
                    </td>
                  </tr>
                ))}
                {!(surveys ?? []).length && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-gray-400">No surveys found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
