import { useState } from 'react'
import { Download, FileText, RefreshCw, Sparkles } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { AlertCard } from '@/components/ui/AlertCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import type { Report, Alert } from '@/types'

const FORMAT_ICONS: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  pptx: '📊',
}

const TYPE_LABELS: Record<string, string> = {
  monthly_summary: 'Monthly Summary',
  one_pager: 'One-Pager',
  newsletter: 'Newsletter',
}

export default function ReportingHub() {
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
      api.get('/dashboard/alerts/?acknowledged=false').then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 60_000,
  })

  const handleGenerate = async () => {
    setGenerating(true)
    setGenError('')
    setGenSuccess('')
    try {
      await api.post('/reports/generate/')
      setGenSuccess('Report generation triggered. It will appear below when ready.')
      setTimeout(refetch, 5000)
    } catch (err) {
      setGenError(apiErrorMessage(err))
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = (report: Report) => {
    if (report.file) {
      window.open(report.file, '_blank')
    }
  }

  const anomalyAlerts = (alerts ?? []).filter((a) => a.alert_type === 'anomaly' && !a.acknowledged)

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reporting Hub</h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            প্রতিবেদন কেন্দ্র · Automated Report Generation
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 rounded-xl bg-unfpa-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark disabled:opacity-60 transition-colors"
        >
          {generating ? (
            <LoadingSpinner size="sm" className="text-white" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Generate Report
        </button>
      </div>

      {genError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {genError}
        </div>
      )}
      {genSuccess && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-600 dark:text-green-400">
          {genSuccess}
        </div>
      )}

      {/* AI Anomaly Alert Cards */}
      {anomalyAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Anomaly Alerts</h2>
          </div>
          {anomalyAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}

      {/* Report list */}
      {loading && !reports ? (
        <PageLoader />
      ) : (reports ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="text-gray-400 dark:text-gray-500">No reports generated yet.</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">Reports are auto-generated on the 1st of each month.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(reports ?? []).map((report) => (
            <div
              key={report.id}
              className="flex flex-col rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <span className="text-2xl" aria-hidden>
                    {FORMAT_ICONS[report.format] ?? '📄'}
                  </span>
                  <p className="mt-2 font-semibold text-gray-900 dark:text-white text-sm leading-snug">
                    {report.title || `${TYPE_LABELS[report.report_type] ?? report.report_type_display} — ${report.month}/${report.year}`}
                  </p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {report.format.toUpperCase()}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <StatusBadge status={report.report_type} overrideLabel={TYPE_LABELS[report.report_type] ?? report.report_type_display} />
                <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-400">
                  {report.partner || 'All Partners'}
                </span>
              </div>

              {report.narrative && (
                <p className="mb-4 text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed flex-1">
                  {report.narrative}
                </p>
              )}

              <div className="mt-auto pt-3 border-t border-gray-50 dark:border-gray-700 flex items-center justify-between gap-3">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  {formatDateTime(report.created_at)}
                </span>
                <button
                  onClick={() => handleDownload(report)}
                  disabled={!report.file}
                  className="flex items-center gap-1.5 rounded-lg bg-unfpa-blue/10 dark:bg-unfpa-blue/20 px-3 py-1.5 text-xs font-medium text-unfpa-blue hover:bg-unfpa-blue/20 dark:hover:bg-unfpa-blue/30 disabled:opacity-40 transition-colors"
                >
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
