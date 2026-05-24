import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Download, FileImage, Newspaper, Presentation,
  RefreshCw, Sparkles, Calendar, ChevronDown, FlaskConical,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { usePolling } from '@/hooks/usePolling'
import { AlertCard } from '@/components/ui/AlertCard'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Report, Alert } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────
type PeriodType = 'biweekly' | 'monthly' | 'quarterly'

interface GenerateCard {
  id: string
  reportType: 'one_pager' | 'newsletter' | 'monthly_summary'
  format: 'pdf' | 'pdf' | 'pptx'
  icon: React.ReactNode
  label: string
  labelBn: string
  description: string
  accentClass: string
}

interface DemoCard {
  id: string
  type: 'infographic' | 'newsletter' | 'presentation'
  ext: 'pdf' | 'pptx'
  icon: React.ReactNode
  label: string
  labelBn: string
  description: string
  accentClass: string
}

const GENERATE_CARDS: GenerateCard[] = [
  {
    id: 'infographic',
    reportType: 'one_pager',
    format: 'pdf',
    icon: <FileImage className="h-6 w-6" />,
    label: 'Infographic PDF',
    labelBn: 'ইনফোগ্রাফিক পিডিএফ',
    description: 'Beautiful one-page visual summary with KPI tiles, activity chart, and AI highlights.',
    accentClass: 'bg-unfpa-blue/10 text-unfpa-blue border-unfpa-blue/20',
  },
  {
    id: 'newsletter',
    reportType: 'newsletter',
    format: 'pdf',
    icon: <Newspaper className="h-6 w-6" />,
    label: 'Newsletter PDF',
    labelBn: 'নিউজলেটার পিডিএফ',
    description: 'Formal bulletin for government officials and donors — AI narrative, stat boxes, and data table.',
    accentClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  },
  {
    id: 'presentation',
    reportType: 'monthly_summary',
    format: 'pptx',
    icon: <Presentation className="h-6 w-6" />,
    label: 'Presentation PPT',
    labelBn: 'প্রেজেন্টেশন পিপিটি',
    description: '6-slide UNFPA-branded PowerPoint with chart, data table, AI narrative, and forward look.',
    accentClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  },
]

const DEMO_CARDS: DemoCard[] = [
  {
    id: 'demo-infographic',
    type: 'infographic',
    ext: 'pdf',
    icon: <FileImage className="h-5 w-5" />,
    label: 'Demo Infographic',
    labelBn: 'ডেমো ইনফোগ্রাফিক',
    description:
      'One-page visual summary using CPE 2022–2026 evaluation data — PHD + Bandhu combined, full year 2024. Same layout as the live infographic.',
    accentClass:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
  },
  {
    id: 'demo-newsletter',
    type: 'newsletter',
    ext: 'pdf',
    icon: <Newspaper className="h-5 w-5" />,
    label: 'Demo Newsletter',
    labelBn: 'ডেমো নিউজলেটার',
    description:
      'Formal programme bulletin using CPE evaluation data — stat boxes, activity table, and a CPE-grounded narrative. Same layout as the live newsletter.',
    accentClass:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800',
  },
  {
    id: 'demo-presentation',
    type: 'presentation',
    ext: 'pptx',
    icon: <Presentation className="h-5 w-5" />,
    label: 'Demo Presentation',
    labelBn: 'ডেমো প্রেজেন্টেশন',
    description:
      'UNFPA-branded PowerPoint using CPE evaluation data — charts, data table, and narrative slides. Same template as the live presentation.',
    accentClass:
      'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-400 dark:border-teal-800',
  },
]

const PERIOD_TABS: { value: PeriodType; label: string; labelBn: string }[] = [
  { value: 'biweekly',  label: 'Bi-Weekly',  labelBn: 'দ্বি-সাপ্তাহিক' },
  { value: 'monthly',   label: 'Monthly',    labelBn: 'মাসিক' },
  { value: 'quarterly', label: 'Quarterly',  labelBn: 'ত্রৈমাসিক' },
]

const FORMAT_ICON: Record<string, string> = {
  pdf: '📄', docx: '📝', pptx: '📊',
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  one_pager:       'Infographic',
  newsletter:      'Newsletter',
  monthly_summary: 'Presentation',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const NOW = new Date()

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function ReportingHub() {
  const { user } = useAuth()
  const canSeeAll = ['super_admin', 'developer'].includes(user?.role ?? '')

  // Period state
  const [periodType, setPeriodType]   = useState<PeriodType>('monthly')
  const [year,       setYear]         = useState(NOW.getFullYear())
  const [month,      setMonth]        = useState(NOW.getMonth() + 1)
  const [biStart,    setBiStart]      = useState(isoDate(new Date(NOW.getTime() - 14*86400*1000)))
  const [biEnd,      setBiEnd]        = useState(isoDate(NOW))
  const [partner,    setPartner]      = useState(canSeeAll ? '' : (user?.organisation ?? ''))

  // Per-card generating state (live reports)
  const [generating, setGenerating] = useState<Record<string, boolean>>({})
  const [cardError,  setCardError]  = useState<Record<string, string>>({})
  const [cardOk,     setCardOk]     = useState<Record<string, string>>({})

  // Per-card state (demo reports)
  const [demoLoading, setDemoLoading] = useState<Record<string, boolean>>({})
  const [demoError,   setDemoError]   = useState<Record<string, string>>({})

  const { data: reports, loading, refetch } = usePolling<Report[]>({
    fetcher: () =>
      api.get('/reports/').then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const { data: alerts } = usePolling<Alert[]>({
    fetcher: () =>
      api.get('/dashboard/alerts/?acknowledged=false')
         .then((r) => (Array.isArray(r.data) ? r.data : r.data?.results ?? [])),
    interval: 60_000,
  })

  const buildPayload = (card: GenerateCard) => {
    const base = {
      report_type:       card.reportType,
      format:            card.format,
      partner:           partner,
      period_type:       periodType,
      include_narrative: true,
    }
    if (periodType === 'biweekly') {
      return { ...base, period_start: biStart, period_end: biEnd }
    }
    return { ...base, year, month }
  }

  const handleGenerate = async (card: GenerateCard) => {
    setGenerating((p) => ({ ...p, [card.id]: true }))
    setCardError((p)  => ({ ...p, [card.id]: '' }))
    setCardOk((p)     => ({ ...p, [card.id]: '' }))
    try {
      await api.post('/reports/generate/', buildPayload(card))
      setCardOk((p) => ({ ...p, [card.id]: `${card.label} generated — see below.` }))
      setTimeout(refetch, 3000)
    } catch (err) {
      setCardError((p) => ({ ...p, [card.id]: apiErrorMessage(err) }))
    } finally {
      setGenerating((p) => ({ ...p, [card.id]: false }))
    }
  }

  const handleDownload = (report: Report) => {
    if (report.file) { window.open(report.file, '_blank') }
  }

  const handleDemoDownload = async (card: DemoCard) => {
    setDemoLoading((p) => ({ ...p, [card.id]: true }))
    setDemoError((p)   => ({ ...p, [card.id]: '' }))
    try {
      const resp = await api.get(`/reports/demo/?type=${card.type}`, {
        responseType: 'blob',
      })
      const mime =
        card.ext === 'pptx'
          ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          : 'application/pdf'
      const blobUrl = URL.createObjectURL(new Blob([resp.data as BlobPart], { type: mime }))
      const anchor  = document.createElement('a')
      anchor.href     = blobUrl
      anchor.download = `demo_${card.type}_cpe2024.${card.ext}`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(blobUrl)
    } catch (err) {
      setDemoError((p) => ({
        ...p,
        [card.id]: err instanceof Error ? err.message : 'Download failed.',
      }))
    } finally {
      setDemoLoading((p) => ({ ...p, [card.id]: false }))
    }
  }

  const anomalyAlerts = (alerts ?? []).filter((a) => a.alert_type === 'anomaly' && !a.acknowledged)

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reporting Hub</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          প্রতিবেদন কেন্দ্র · Automated Report Generation
        </p>
      </div>

      {/* ── Period & Partner ─────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-unfpa-blue" />
          Reporting Period
        </h2>

        {/* Period type tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-700 p-1 w-fit">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setPeriodType(tab.value)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-all',
                periodType === tab.value
                  ? 'bg-white dark:bg-gray-900 text-unfpa-blue shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              )}
            >
              {tab.label}
              <span className="ml-1 font-bangla text-[10px] opacity-60">{tab.labelBn}</span>
            </button>
          ))}
        </div>

        {/* Period inputs */}
        <AnimatePresence mode="wait">
          {periodType === 'biweekly' ? (
            <motion.div key="biweekly"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-wrap items-end gap-4"
            >
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Start date</label>
                <input type="date" value={biStart} onChange={(e) => setBiStart(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">End date</label>
                <input type="date" value={biEnd} onChange={(e) => setBiEnd(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none" />
              </div>
            </motion.div>
          ) : (
            <motion.div key="month-year"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-wrap items-end gap-4"
            >
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                  {periodType === 'quarterly' ? 'End month' : 'Month'}
                </label>
                <div className="relative">
                  <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
                    className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 pr-8 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none">
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Year</label>
                <input type="number" value={year} min={2024} max={2030}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none" />
              </div>
              {periodType === 'quarterly' && (
                <p className="text-xs text-gray-400 dark:text-gray-500 self-center">
                  ← covers 3 months ending this month
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Partner selector (admins only) */}
        {canSeeAll && (
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Organisation</label>
            <div className="relative w-fit">
              <select value={partner} onChange={(e) => setPartner(e.target.value)}
                className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 pr-8 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none">
                <option value="">All Partners</option>
                <option value="PHD">PHD</option>
                <option value="Bandhu">Bandhu</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
            </div>
          </div>
        )}
      </div>

      {/* ── Generate cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GENERATE_CARDS.map((card) => (
          <div key={card.id}
            className="flex flex-col rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5"
          >
            {/* Icon + label */}
            <div className={cn('mb-3 inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium', card.accentClass)}>
              {card.icon}
              {card.label}
            </div>
            <p className="font-bangla mb-0.5 text-[10px] text-gray-400 dark:text-gray-500">
              {card.labelBn}
            </p>
            <p className="mb-4 flex-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {card.description}
            </p>

            {/* Feedback */}
            {cardError[card.id] && (
              <p className="mb-2 text-xs text-red-500 dark:text-red-400">{cardError[card.id]}</p>
            )}
            {cardOk[card.id] && (
              <p className="mb-2 text-xs text-green-600 dark:text-green-400">{cardOk[card.id]}</p>
            )}

            <button
              onClick={() => handleGenerate(card)}
              disabled={generating[card.id]}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-unfpa-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark disabled:opacity-60 transition-colors"
            >
              {generating[card.id]
                ? <LoadingSpinner size="sm" className="text-white" />
                : <RefreshCw className="h-4 w-4" />
              }
              {generating[card.id] ? 'Generating…' : 'Generate'}
            </button>
          </div>
        ))}
      </div>

      {/* ── Demo report cards ────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FlaskConical className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Demo Reports
          </h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            CPE 2022–2026 data
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            · Same pipeline as live reports — previews the exact output format
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DEMO_CARDS.map((card) => (
            <div
              key={card.id}
              className="flex flex-col rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5"
            >
              {/* Icon + label */}
              <div
                className={cn(
                  'mb-3 inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium',
                  card.accentClass,
                )}
              >
                {card.icon}
                {card.label}
              </div>
              <p className="font-bangla mb-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                {card.labelBn}
              </p>
              <p className="mb-4 flex-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {card.description}
              </p>

              {/* Error */}
              {demoError[card.id] && (
                <p className="mb-2 text-xs text-red-500 dark:text-red-400">
                  {demoError[card.id]}
                </p>
              )}

              <button
                onClick={() => handleDemoDownload(card)}
                disabled={demoLoading[card.id]}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-60 transition-colors"
              >
                {demoLoading[card.id]
                  ? <LoadingSpinner size="sm" />
                  : <Download className="h-4 w-4" />
                }
                {demoLoading[card.id] ? 'Building…' : 'Download Demo'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Anomaly alerts ───────────────────────────────────────────────────── */}
      {anomalyAlerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Anomaly Alerts</h2>
          </div>
          {anomalyAlerts.map((a) => <AlertCard key={a.id} alert={a} />)}
        </div>
      )}

      {/* ── Generated reports list ───────────────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Generated Reports</h2>

        {loading && !reports ? (
          <PageLoader />
        ) : (reports ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
            <Newspaper className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-400 dark:text-gray-500 text-sm">No reports generated yet.</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Use the cards above to generate your first report.</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          >
            {(reports ?? []).map((report) => (
              <motion.div
                key={report.id}
                variants={{
                  hidden:  { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="flex flex-col rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-4"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">
                      {FORMAT_ICON[report.format] ?? '📄'}
                    </span>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-xs leading-tight">
                        {REPORT_TYPE_LABEL[report.report_type] ?? report.report_type_display}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                        {report.format?.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  {/* Period badge */}
                  <span className="shrink-0 rounded-full bg-unfpa-blue/10 dark:bg-unfpa-blue/20 px-2 py-0.5 text-[10px] font-medium text-unfpa-blue capitalize">
                    {(report as any).period_type_display ?? 'Monthly'}
                  </span>
                </div>

                {/* Period range */}
                {((report as any).period_start || (report as any).period_end) && (
                  <p className="mb-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {(report as any).period_start} → {(report as any).period_end}
                  </p>
                )}

                {/* Partner */}
                <p className="mb-2 text-[10px] text-gray-400 dark:text-gray-500">
                  {report.partner || 'All Partners'}
                </p>

                {/* Narrative snippet */}
                {report.narrative && (
                  <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 flex-1 leading-relaxed">
                    {report.narrative}
                  </p>
                )}

                {/* Footer */}
                <div className="mt-auto pt-3 border-t border-gray-50 dark:border-gray-700 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-gray-400">{formatDateTime(report.created_at)}</span>
                  <button
                    onClick={() => handleDownload(report)}
                    disabled={!report.file}
                    className="flex items-center gap-1.5 rounded-lg bg-unfpa-blue/10 px-3 py-1.5 text-xs font-medium text-unfpa-blue hover:bg-unfpa-blue/20 disabled:opacity-40 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
