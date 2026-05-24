import { useState } from 'react'
import { AlertTriangle, MapPin } from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { BaselineSurvey } from '@/types/index'
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
type PartnerFilter = 'all' | 'PHD' | 'Bandhu'

const YES_VALUES = new Set(['yes', 'true', '1', 'Yes', 'YES', 'True'])
const isYes = (v: string | undefined | null) => !!v && YES_VALUES.has(v)

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function IndicatorBar({ label, value, total }: { label: string; value: number; total: number }) {
  const p = pct(value, total)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600 dark:text-gray-400">{label}</span>
        <span className="font-semibold text-gray-900 dark:text-white">{p}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
        <div className="h-1.5 rounded-full bg-unfpa-blue" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}

function IndicatorRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null
  const positive = isYes(value)
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
      <span className={cn('text-xs font-medium', positive ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')}>
        {value}
      </span>
    </div>
  )
}

function SurveyDrawer({ survey, onClose }: { survey: BaselineSurvey; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Survey Respondent</h2>
            <p className="text-xs text-gray-400">{survey.participant_code}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Profile */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Profile</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Partner', survey.partner],
                ['Type', survey.survey_type_display],
                ['District', survey.district],
                ['Upazila', survey.upazila],
                ['Union', survey.union],
                ['Facility', survey.facility_name],
                ['Date', formatDate(survey.survey_date)],
                ['Age', survey.respondent_age != null ? `${survey.respondent_age} yrs` : undefined],
                ['Sex', survey.sex],
                ['Education', survey.education],
                ['SES', survey.ses],
              ].map(([label, val]) => val ? (
                <div key={label}>
                  <p className="text-[10px] text-gray-400">{label}</p>
                  <p className="font-medium text-gray-900 dark:text-white">{val}</p>
                </div>
              ) : null)}
            </div>
          </div>

          {/* Reproductive Health */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Reproductive Health</p>
            <div>
              <IndicatorRow label="Family Planning Use" value={survey.fp_use} />
              <IndicatorRow label="FP Method" value={survey.fp_method} />
              <IndicatorRow label="Currently Pregnant" value={survey.currently_pregnant} />
              <IndicatorRow label="ANC 4+ Visits" value={survey.anc_4visits} />
              <IndicatorRow label="Skilled Birth Attendant" value={survey.skilled_birth_attendant} />
            </div>
          </div>

          {/* Knowledge & Awareness */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Knowledge &amp; Awareness</p>
            <div>
              <IndicatorRow label="Danger Signs Knowledge" value={survey.danger_signs_knowledge} />
              <IndicatorRow label="Fistula Awareness" value={survey.fistula_awareness} />
              <IndicatorRow label="MPDSR Awareness" value={survey.mpdsr_awareness} />
              <IndicatorRow label="GBV Awareness" value={survey.gbv_awareness} />
              <IndicatorRow label="Child Marriage Knowledge" value={survey.child_marriage_knowledge} />
            </div>
          </div>

          {/* Access & Satisfaction */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Access &amp; Satisfaction</p>
            <div>
              <IndicatorRow label="Health Facility Distance" value={survey.health_facility_distance} />
              <IndicatorRow label="SRH Service Satisfaction" value={survey.srh_service_satisfaction} />
            </div>
          </div>

          {survey.is_duplicate && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">Flagged as duplicate submission</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BaselineEndline() {
  const [surveyFilter, setSurveyFilter] = useState<SurveyFilter>('all')
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all')
  const [dupeOnly, setDupeOnly] = useState(false)
  const [selected, setSelected] = useState<BaselineSurvey | null>(null)

  const { data: surveys, loading } = usePolling<BaselineSurvey[]>({
    fetcher: () =>
      api
        .get('/baseline/surveys/', {
          params: {
            ...(surveyFilter !== 'all' ? { survey_type: surveyFilter } : {}),
            ...(partnerFilter !== 'all' ? { partner: partnerFilter } : {}),
            ...(dupeOnly ? { duplicates_only: true } : {}),
          },
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const list = surveys ?? []
  const dupeCount = list.filter((s) => s.is_duplicate).length

  // Indicator KPIs
  const total = list.length
  const kpis = [
    { label: 'Fistula Awareness', value: list.filter((s) => isYes(s.fistula_awareness)).length },
    { label: 'ANC 4+ Visits', value: list.filter((s) => isYes(s.anc_4visits)).length },
    { label: 'Family Planning Use', value: list.filter((s) => isYes(s.fp_use)).length },
    { label: 'Danger Signs Knowledge', value: list.filter((s) => isYes(s.danger_signs_knowledge)).length },
  ]

  // District chart
  const districtMap: Record<string, { baseline: number; endline: number }> = {}
  for (const s of list) {
    if (!districtMap[s.district]) districtMap[s.district] = { baseline: 0, endline: 0 }
    districtMap[s.district][s.survey_type]++
  }
  const chartData = Object.entries(districtMap)
    .map(([district, counts]) => ({ district, ...counts }))
    .sort((a, b) => (b.baseline + b.endline) - (a.baseline + a.endline))
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Baseline &amp; Endline</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          বেসলাইন ও এন্ডলাইন জরিপ · Community Survey Analysis
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
              Same location + device in the same period. Review before analysis.
            </p>
          </div>
        </div>
      )}

      {/* Indicator KPIs */}
      {total > 0 && (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
            Key Indicators
            <span className="ml-2 text-xs font-normal text-gray-400">{total} respondents</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {kpis.map((k) => (
              <IndicatorBar key={k.label} label={k.label} value={k.value} total={total} />
            ))}
          </div>
        </div>
      )}

      {/* District chart */}
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
        {(['all', 'PHD', 'Bandhu'] as PartnerFilter[]).map((p) => (
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
              ? 'bg-amber-500 text-white'
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
                  {['Participant', 'Partner', 'District', 'Type', 'Age / Sex', 'Date', 'Indicators'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {list.map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      'hover:bg-gray-50 dark:hover:bg-gray-700/30',
                      s.is_duplicate && 'bg-amber-50/50 dark:bg-amber-900/10'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {s.participant_code || '—'}
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
                        <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        {s.district}{s.upazila ? `, ${s.upazila}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        s.survey_type === 'baseline'
                          ? 'bg-unfpa-blue/10 text-unfpa-blue'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      )}>
                        {s.survey_type_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                      {s.respondent_age != null ? `${s.respondent_age}y` : '—'}
                      {s.sex ? ` / ${s.sex}` : ''}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(s.survey_date)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(s)}
                        className="text-xs font-medium text-unfpa-blue hover:text-unfpa-dark underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {!list.length && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-gray-400">No surveys found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <SurveyDrawer survey={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
