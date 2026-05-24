import { useState } from 'react'
import { Download, FileText, RefreshCw, Sparkles } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { usePolling } from '@/hooks/usePolling'
import { AlertCard } from '@/components/ui/AlertCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Report, Alert, ReportFormat, ReportType } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  monthly_summary: 'Monthly Summary',
  one_pager: 'One-Pager',
  newsletter: 'Newsletter',
}

const FORMAT_OPTIONS: ReportFormat[] = ['pdf', 'docx', 'pptx']
const TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'monthly_summary', label: 'Monthly Summary' },
  { value: 'one_pager', label: 'One-Pager' },
  { value: 'newsletter', label: 'Newsletter' },
]

export default function ReportingHub() {
  const { user } = useAuth()
  const now = new Date()
  const [genFormat, setGenFormat] = useState<ReportFormat>('pdf')
  const [genType, setGenType] = useState<ReportType>('monthly_summary')
  const genYear = now.getFullYear()
  const genMonth = now.getMonth() + 1
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [genSuccess, setGenSuccess] = useState('')

  const { data: reports, loading, refetch } = usePolling<Report[]>({
    fetcher: () =>
      api.get('/reports/').then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const { data: alerts } = usePolling<Alert[]>({
    fetcher: () =>
      api
        .get('/dashboard/alerts/?acknowledged=false')
        .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 60_000,
  })

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError('')
    setGenSuccess('')
    const canSeeAll = ['super_admin', 'developer'].includes(user?.role ?? '')
    try {
      await api.post('/reports/generate/', {
        report_type: genType,
        format: genFormat,
        partner: canSeeAll ? '' : (user?.organisation ?? ''),
        year: genYear,
        month: genMonth,
        include_narrative: true,
      })
      setGenSuccess(TYPE_LABELS[genType] + ' (' + genFormat.toUpperCase() + ') generated. It will appear below.')
      setTimeout(refetch, 4000)
    } catch (err) {
      setGenError(apiErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = (report: Report) => {
    if (report.file) { window.open(report.file, '_blank') }
  }

  const anomalyAlerts = (alerts ?? []).filter((a) => a.alert_type === 'anomaly' && !a.acknowledged)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reporting Hub</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          {'প্রতিবেদন কেন্দ্র · Automated Report Generation'}
        </p>
      </div>

      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Generate Report</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Type</label>
            <select value={genType} onChange={(e) => setGenType(e.target.value as ReportType)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none">
              {TYPE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Format</label>
            <div className="flex gap-1">
              {FORMAT_OPTIONS.map((f) => (
                <button key={f} onClick={() => setGenFormat(f)}
                  className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    genFormat === f ? 'bg-unfpa-blue text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-unfpa-blue')}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleGenerate} disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-unfpa-blue px-5 py-2 text-sm font-semibold text-white hover:bg-unfpa-dark disabled:opacity-60 transition-colors">
            {generating ? <LoadingSpinner size="sm" className="text-white" /> : <RefreshCw className="h-4 w-4" />}
            Generate
          </button>
        </div>
        {genError && <p className="mt-3 text-sm text-red-500 dark:text-red-400">{genError}</p>}
        {genSuccess && <p className="mt-3 text-sm text-green-600 dark:text-green-400">{genSuccess}</p>}
      </div>

      {anomalyAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Anomaly Alerts</h2>
          </div>
          {anomalyAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      )}

      {loading && !reports ? <PageLoader /> : (reports ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-400 dark:text-gray-500">No reports generated yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(reports ?? []).map((report) => (
            <div key={report.id} className="flex flex-col rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">{report.title || TYPE_LABELS[report.report_type]}</p>
                <span className="text-xs text-gray-400">{report.format.toUpperCase()}</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <StatusBadge status={report.report_type} overrideLabel={TYPE_LABELS[report.report_type] ?? report.report_type_display} />
                <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                  {report.partner || 'All Partners'}
                </span>
              </div>
              {report.narrative && (
                <p className="mb-4 text-xs text-gray-500 dark:text-gray-400 line-clamp-3 flex-1">{report.narrative}</p>
              )}
              <div className="mt-auto pt-3 border-t border-gray-50 dark:border-gray-700 flex items-center justify-between gap-3">
                <span className="text-[10px] text-gray-400">{formatDateTime(report.created_at)}</span>
                <button onClick={() => handleDownload(report)} disabled={!report.file}
                  className="flex items-center gap-1.5 rounded-lg bg-unfpa-blue/10 px-3 py-1.5 text-xs font-medium text-unfpa-blue hover:bg-unfpa-blue/20 disabled:opacity-40">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}