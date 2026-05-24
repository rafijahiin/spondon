import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, Circle,
  Clock, Settings, X, Save, RefreshCw,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { usePolling } from '@/hooks/usePolling'
import { LoadingSpinner, PageLoader } from '@/components/ui/LoadingSpinner'
import { cn } from '@/utils/cn'

// ── Types ──────────────────────────────────────────────────────────────────────
type TrafficLight = 'on_track' | 'behind' | 'critical' | 'no_target'

interface ProgressRow {
  form_type:          string
  form_label:         string
  form_label_bn:      string
  category:           string
  partner:            string
  target:             number | null
  actual:             number
  attainment_percent: number | null
  status:             TrafficLight
  has_gap:            boolean
  last_submission:    string | null
}

interface ProgressData {
  year:    number
  month:   number
  partner: string
  results: ProgressRow[]
  summary: { on_track: number; behind: number; critical: number; no_target: number; with_gap: number }
}

interface Alert {
  id:                 string
  partner:            string
  alert_type:         string
  alert_type_display: string
  severity:           string
  severity_display:   string
  title:              string
  message:            string
  acknowledged:       boolean
  created_at:         string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const TRAFFIC_CONFIG: Record<TrafficLight, { label: string; cls: string; icon: React.ReactNode }> = {
  on_track: {
    label: 'On Track',
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  behind: {
    label: 'Behind',
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  critical: {
    label: 'Critical',
    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  no_target: {
    label: 'No Target',
    cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    icon: <Circle className="h-3.5 w-3.5" />,
  },
}

const CATEGORY_ORDER = ['Clinical', 'Community', 'Operations', 'Legacy']

const NOW = new Date()

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeAgo(isoStr: string | null): string {
  if (!isoStr) return '—'
  const diff = Date.now() - new Date(isoStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function ProgressBar({ pct, status }: { pct: number | null; status: TrafficLight }) {
  const fill = pct ?? 0
  const colorClass =
    status === 'on_track' ? 'bg-emerald-500' :
    status === 'behind'   ? 'bg-amber-400'   :
    status === 'critical' ? 'bg-red-500'     :
    'bg-gray-300 dark:bg-gray-600'

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-1.5 flex-1 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', colorClass)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(fill, 100)}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="w-8 text-right text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
        {pct !== null ? `${pct}%` : '—'}
      </span>
    </div>
  )
}

// ── Configure Targets Modal ────────────────────────────────────────────────────
function ConfigureModal({
  rows, year, month, onClose, onSaved,
}: {
  rows: ProgressRow[]
  year: number
  month: number
  onClose: () => void
  onSaved: () => void
}) {
  // Deduplicate: one row per (partner, form_type)
  const unique = useMemo(() => {
    const seen = new Set<string>()
    return rows.filter((r) => {
      const k = `${r.partner}::${r.form_type}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }, [rows])

  const [targets, setTargets] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const r of unique) {
      init[`${r.partner}::${r.form_type}`] = r.target !== null ? String(r.target) : ''
    }
    return init
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const ops = unique.map((r) => {
        const key = `${r.partner}::${r.form_type}`
        const val = parseInt(targets[key] || '0', 10)
        return api.post('/tracker/targets/', {
          partner:   r.partner,
          form_type: r.form_type,
          year,
          month,
          target:    isNaN(val) ? 0 : val,
        }).catch(() =>
          api.patch(`/tracker/targets/${r.form_type}_${r.partner}/`, {
            target: isNaN(val) ? 0 : val,
          })
        )
      })
      await Promise.allSettled(ops)
      onSaved()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const grouped = useMemo(() => {
    const g: Record<string, ProgressRow[]> = {}
    for (const r of unique) {
      if (!g[r.category]) g[r.category] = []
      g[r.category].push(r)
    }
    return g
  }, [unique])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5 py-4">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">Configure Monthly Targets</p>
            <p className="text-xs text-gray-400">{MONTHS[month - 1]} {year}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {CATEGORY_ORDER.filter((c) => grouped[c]).map((cat) => (
            <div key={cat}>
              <div className="sticky top-0 bg-gray-50 dark:bg-gray-800/60 px-5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{cat}</p>
              </div>
              <div className="px-5 divide-y divide-gray-50 dark:divide-gray-800">
                {grouped[cat].map((r) => {
                  const key = `${r.partner}::${r.form_type}`
                  return (
                    <div key={key} className="flex items-center gap-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{r.form_label}</p>
                        <p className="font-bangla text-[10px] text-gray-400">{r.form_label_bn}</p>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                        r.partner === 'PHD'
                          ? 'bg-unfpa-blue/10 text-unfpa-blue'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                      )}>
                        {r.partner}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        value={targets[key] ?? ''}
                        onChange={(e) => setTargets((p) => ({ ...p, [key]: e.target.value }))}
                        placeholder="—"
                        className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-right text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none tabular-nums"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="px-5 py-2 text-sm text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-unfpa-blue px-5 py-2 text-sm font-semibold text-white hover:bg-unfpa-dark disabled:opacity-60 transition-colors"
          >
            {saving ? <LoadingSpinner size="sm" className="text-white" /> : <Save className="h-4 w-4" />}
            Save Targets
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ── Row component ──────────────────────────────────────────────────────────────
function ComplianceRow({ row }: { row: ProgressRow }) {
  const cfg = TRAFFIC_CONFIG[row.status]
  return (
    <div className="grid grid-cols-[1fr_60px_80px_140px_110px_72px] items-center gap-3 py-2.5 px-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      {/* Form name */}
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-800 dark:text-gray-200">{row.form_label}</p>
        <p className="font-bangla truncate text-[10px] text-gray-400">{row.form_label_bn}</p>
      </div>

      {/* Partner chip */}
      <span className={cn(
        'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
        row.partner === 'PHD'
          ? 'bg-unfpa-blue/10 text-unfpa-blue'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
      )}>
        {row.partner}
      </span>

      {/* Count */}
      <span className="tabular-nums text-right text-sm text-gray-700 dark:text-gray-300">
        {row.actual}
        {row.target !== null && (
          <span className="text-[10px] text-gray-400"> / {row.target}</span>
        )}
      </span>

      {/* Progress bar */}
      <ProgressBar pct={row.attainment_percent} status={row.status} />

      {/* Traffic light badge */}
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium', cfg.cls)}>
        {cfg.icon}
        {cfg.label}
      </span>

      {/* Last submission / gap */}
      <div className="text-right">
        {row.has_gap && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <Clock className="h-2.5 w-2.5" /> 48h gap
          </span>
        )}
        {!row.has_gap && (
          <span className="text-[10px] text-gray-400">{timeAgo(row.last_submission)}</span>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ProgressTracker() {
  const { user } = useAuth()
  const isSuperAdmin = ['super_admin', 'developer'].includes(user?.role ?? '')
  const canSeeAll    = isSuperAdmin

  const [year,           setYear]           = useState(NOW.getFullYear())
  const [month,          setMonth]          = useState(NOW.getMonth() + 1)
  const [partner,        setPartner]        = useState(canSeeAll ? '' : (user?.organisation ?? ''))
  const [showConfig,     setShowConfig]     = useState(false)
  const [refetchSignal,  setRefetchSignal]  = useState(0)

  const { data: progress, loading, refetch: refetchProgress } = usePolling<ProgressData>({
    fetcher: () =>
      api.get(`/tracker/progress/?year=${year}&month=${month}&partner=${partner}`)
         .then((r) => r.data),
    interval: 60_000,
  })

  const { data: alerts, refetch: refetchAlerts } = usePolling<Alert[]>({
    fetcher: () =>
      api.get('/tracker/alerts/?acknowledged=false')
         .then((r) => (Array.isArray(r.data) ? r.data : r.data?.results ?? [])),
    interval: 30_000,
  })

  // Re-fetch when filters or refetchSignal change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refetchProgress() }, [year, month, partner, refetchSignal])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refetchAlerts() }, [refetchSignal])

  const handleAcknowledge = async (alertId: string) => {
    await api.post(`/tracker/alerts/${alertId}/acknowledge/`)
    setRefetchSignal((n) => n + 1)
  }

  const grouped = useMemo(() => {
    if (!progress?.results) return {}
    const g: Record<string, ProgressRow[]> = {}
    for (const row of progress.results) {
      if (!g[row.category]) g[row.category] = []
      g[row.category].push(row)
    }
    return g
  }, [progress])

  const unackedAlerts = (alerts ?? []).filter((a) => !a.acknowledged).slice(0, 5)
  const summary = progress?.summary

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reporting Progress Tracker</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          প্রতিবেদন অগ্রগতি ট্র্যাকার · Submission compliance by form type
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Month */}
        <div className="relative">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 pr-8 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
        </div>
        {/* Year */}
        <input type="number" value={year} min={2024} max={2030}
          onChange={(e) => setYear(Number(e.target.value))}
          className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none tabular-nums" />
        {/* Partner */}
        {canSeeAll && (
          <div className="relative">
            <select value={partner} onChange={(e) => setPartner(e.target.value)}
              className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 pr-8 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none">
              <option value="">All Partners</option>
              <option value="PHD">PHD</option>
              <option value="Bandhu">Bandhu</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
          </div>
        )}
        <div className="flex-1" />
        {isSuperAdmin && (
          <button onClick={() => setShowConfig(true)}
            className="flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Settings className="h-4 w-4" />
            Configure Targets
          </button>
        )}
      </div>

      {/* Summary chips */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'on_track',  label: 'On Track',  cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
            { key: 'behind',    label: 'Behind',    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
            { key: 'critical',  label: 'Critical',  cls: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
            { key: 'no_target', label: 'No Target', cls: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
            { key: 'with_gap',  label: '48h Gap',   cls: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
          ].map(({ key, label, cls }) => (
            <span key={key} className={cn('rounded-full px-3 py-1 text-xs font-semibold tabular-nums', cls)}>
              {(summary as any)[key]} {label}
            </span>
          ))}
        </div>
      )}

      {/* Unacknowledged alerts */}
      <AnimatePresence>
        {unackedAlerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 space-y-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {unackedAlerts.length} Unacknowledged Alert{unackedAlerts.length > 1 ? 's' : ''}
            </p>
            {unackedAlerts.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{a.message}</p>
                </div>
                <button
                  onClick={() => handleAcknowledge(a.id)}
                  className="shrink-0 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compliance grid */}
      {loading && !progress ? (
        <PageLoader />
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
            <motion.div
              key={cat}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden"
            >
              {/* Category header */}
              <div className="bg-gray-50 dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700 px-4 py-2.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{cat}</p>
                <p className="text-[10px] text-gray-400">{grouped[cat].length} form types</p>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_60px_80px_140px_110px_72px] items-center gap-3 px-4 py-1.5 border-b border-gray-50 dark:border-gray-700/50">
                {['Form Type', 'Org', 'Count', 'Progress', 'Status', 'Last Sub'].map((h) => (
                  <p key={h} className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{h}</p>
                ))}
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {grouped[cat].map((row) => (
                  <ComplianceRow key={`${row.partner}-${row.form_type}`} row={row} />
                ))}
              </div>
            </motion.div>
          ))}

          {!progress?.results?.length && (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
              <RefreshCw className="mx-auto mb-3 h-10 w-10 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-400 dark:text-gray-500 text-sm">No data for this period.</p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Use Configure Targets to set monthly targets, then run <code>seed_targets</code>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Configure modal */}
      <AnimatePresence>
        {showConfig && progress?.results && (
          <ConfigureModal
            rows={progress.results}
            year={year}
            month={month}
            onClose={() => setShowConfig(false)}
            onSaved={() => setRefetchSignal((n) => n + 1)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
