import { useState, useCallback } from 'react'
import {
  CheckCircle2, MapPin, XCircle, ChevronDown, ChevronUp,
  Activity, Stethoscope, Heart, Users, BookOpen, Truck,
  ClipboardList, TestTube2, Pill,
} from 'lucide-react'
import { Drawer } from 'vaul'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Submission, ProgramPendingItem, ProgramPendingResponse } from '@/types'

// ─── Icon map per model type ────────────────────────────────────────────────

const MODEL_ICONS: Record<string, React.ReactNode> = {
  client_reg:              <Users       className="h-4 w-4" />,
  clinic_visit:            <Stethoscope className="h-4 w-4" />,
  hiv_sti_result:          <TestTube2   className="h-4 w-4" />,
  adr_record:              <Pill        className="h-4 w-4" />,
  autoclave_log:           <Activity    className="h-4 w-4" />,
  antenatal_card:          <Heart       className="h-4 w-4" />,
  htc_counselling:         <BookOpen    className="h-4 w-4" />,
  individual_counselling:  <BookOpen    className="h-4 w-4" />,
  mh_screening:            <ClipboardList className="h-4 w-4" />,
  gbv_case:                <Heart       className="h-4 w-4" />,
  outreach_session:        <Users       className="h-4 w-4" />,
  group_education:         <Users       className="h-4 w-4" />,
  referral:                <Activity    className="h-4 w-4" />,
  safety_hygiene_kit:      <Truck       className="h-4 w-4" />,
  training_event:          <BookOpen    className="h-4 w-4" />,
  coord_meeting:           <ClipboardList className="h-4 w-4" />,
  mobile_camp:             <Heart       className="h-4 w-4" />,
}

const MODEL_COLORS: Record<string, string> = {
  client_reg:             'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  clinic_visit:           'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  hiv_sti_result:         'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  adr_record:             'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  autoclave_log:          'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  antenatal_card:         'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  htc_counselling:        'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  individual_counselling: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  mh_screening:           'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  gbv_case:               'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  outreach_session:       'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  group_education:        'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  referral:               'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  safety_hygiene_kit:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  training_event:         'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  coord_meeting:          'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  mobile_camp:            'bg-unfpa-blue/10 text-unfpa-blue dark:bg-unfpa-blue/20 dark:text-blue-300',
}

// ─── Programs approval card ──────────────────────────────────────────────────

function ProgramCard({
  item,
  onAction,
}: {
  item: ProgramPendingItem
  onAction: (id: string, modelType: string, action: 'approve' | 'reject') => Promise<void>
}) {
  const reduce = useReducedMotion()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const approve = async () => {
    setApproving(true)
    await onAction(item.id, item.model_type, 'approve')
    setApproving(false)
    setDrawerOpen(false)
  }

  const reject = async () => {
    setRejecting(true)
    await onAction(item.id, item.model_type, 'reject')
    setRejecting(false)
    setDrawerOpen(false)
  }

  const colorClass = MODEL_COLORS[item.model_type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  const icon = MODEL_ICONS[item.model_type] ?? <Activity className="h-4 w-4" />

  const headerBadge = (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold', colorClass)}>
      {icon}
      {item.model_label}
    </span>
  )

  const meta = (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-unfpa-blue/10 text-unfpa-blue dark:bg-unfpa-blue/20 dark:text-blue-300 px-2.5 py-0.5 text-xs font-medium">
        {item.organisation}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-600 dark:text-gray-300">
        <MapPin className="h-3 w-3" />
        {item.center_name}
      </span>
      {item.submitted_by && item.submitted_by !== '–' && (
        <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
          {item.submitted_by}
        </span>
      )}
    </div>
  )

  const actionButtons = (
    <div className="flex gap-3">
      <motion.button
        whileTap={reduce ? {} : { scale: 0.96 }}
        onClick={approve}
        disabled={approving || rejecting}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-60 transition-colors"
        style={{ minHeight: 44 }}
      >
        {approving
          ? <LoadingSpinner size="sm" className="text-white" />
          : <><CheckCircle2 className="h-4 w-4" />Approve</>}
      </motion.button>
      <motion.button
        whileTap={reduce ? {} : { scale: 0.96 }}
        onClick={reject}
        disabled={approving || rejecting}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 active:bg-red-800 disabled:opacity-60 transition-colors"
        style={{ minHeight: 44 }}
      >
        {rejecting
          ? <LoadingSpinner size="sm" className="text-white" />
          : <><XCircle className="h-4 w-4" />Reject</>}
      </motion.button>
    </div>
  )

  return (
    <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} shouldScaleBackground={false}>
      {/* Card */}
      <div
        onClick={() => { if (window.innerWidth < 640) setDrawerOpen(true) }}
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-4 space-y-3 cursor-pointer sm:cursor-default"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1.5 min-w-0">
            {headerBadge}
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
              className="flex items-start gap-1 text-left text-sm text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white w-full group"
            >
              <span className="flex-1 leading-snug" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                {item.summary}
              </span>
              {expanded
                ? <ChevronUp className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />
                : <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-400" />}
            </button>
          </div>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
            {formatDateTime(item.created_at)}
          </span>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              {meta}
              {item.kobo_submission_id && (
                <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-600 tabular-nums">
                  Kobo ID: {item.kobo_submission_id}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!expanded && <div className="hidden">{/* collapsed */}</div>}

        {/* Desktop actions */}
        <div className="hidden sm:block pt-1">{actionButtons}</div>
      </div>

      {/* Mobile drawer */}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[20px] bg-white dark:bg-gray-800 px-5 pb-safe-or-8 outline-none">
          <div className="mx-auto mt-3 mb-5 h-1.5 w-12 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="space-y-4 pb-4">
            <div className="space-y-2">
              {headerBadge}
              <p className="text-base font-medium text-gray-900 dark:text-white leading-snug">
                {item.summary}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                {formatDateTime(item.created_at)}
              </p>
            </div>
            {meta}
            <div className="pt-1">{actionButtons}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ─── Existing submissions card (legacy) ─────────────────────────────────────

const FORM_LABELS: Record<string, string> = {
  fistula: 'Fistula',
  mpdsr: 'MPDSR',
  activity: 'Activity',
  baseline: 'Baseline',
}

function SubmissionCard({
  submission,
  onApprove,
  onReject,
}: {
  submission: Submission
  onApprove: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
}) {
  const reduce = useReducedMotion()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const approve = async () => { setApproving(true); await onApprove(submission.id); setApproving(false); setDrawerOpen(false) }
  const reject  = async () => { setRejecting(true); await onReject(submission.id);  setRejecting(false); setDrawerOpen(false) }

  const chips = (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-unfpa-blue/10 px-2.5 py-1 text-xs font-medium text-unfpa-blue">
        {submission.partner}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300">
        <MapPin className="h-3 w-3" />
        {submission.district}{submission.region ? `, ${submission.region}` : ''}
      </span>
      {submission.latitude && submission.longitude && (
        <a
          href={`https://www.google.com/maps?q=${submission.latitude},${submission.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
        >
          <MapPin className="h-3 w-3" />
          Location captured ✓
        </a>
      )}
    </div>
  )

  const actionBtns = (
    <div className="flex gap-3">
      <motion.button whileTap={reduce ? {} : { scale: 0.96 }} onClick={approve} disabled={approving || rejecting}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors" style={{ minHeight: 44 }}>
        {approving ? <LoadingSpinner size="sm" className="text-white" /> : <><CheckCircle2 className="h-4 w-4" />Approve</>}
      </motion.button>
      <motion.button whileTap={reduce ? {} : { scale: 0.96 }} onClick={reject} disabled={approving || rejecting}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors" style={{ minHeight: 44 }}>
        {rejecting ? <LoadingSpinner size="sm" className="text-white" /> : <><XCircle className="h-4 w-4" />Reject</>}
      </motion.button>
    </div>
  )

  return (
    <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} shouldScaleBackground={false}>
      <div onClick={() => { if (window.innerWidth < 640) setDrawerOpen(true) }}
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4 cursor-pointer sm:cursor-default">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wide text-unfpa-blue">
                {FORM_LABELS[submission.form_type] ?? submission.form_type}
              </span>
              <StatusBadge status={submission.status} />
            </div>
            <p className="font-medium text-gray-900 dark:text-white">{submission.worker_name}</p>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">{formatDateTime(submission.submitted_at)}</span>
        </div>
        {chips}
        {submission.status === 'pending' && <div className="hidden sm:flex gap-3 pt-1">{actionBtns}</div>}
        {submission.status !== 'pending' && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Reviewed by {submission.reviewed_by?.email ?? 'system'} · {formatDateTime(submission.reviewed_at)}
          </p>
        )}
      </div>

      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[20px] bg-white dark:bg-gray-800 px-5 pb-8 outline-none">
          <div className="mx-auto mt-3 mb-5 h-1.5 w-12 shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wide text-unfpa-blue">{FORM_LABELS[submission.form_type] ?? submission.form_type}</span>
                <StatusBadge status={submission.status} />
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{submission.worker_name}</p>
              <p className="text-sm text-gray-400 mt-0.5 tabular-nums">{formatDateTime(submission.submitted_at)}</p>
            </div>
            {chips}
            {submission.status === 'pending'
              ? <div className="pt-2">{actionBtns}</div>
              : <p className="text-xs text-gray-400 pt-2">Reviewed by {submission.reviewed_by?.email ?? 'system'} · {formatDateTime(submission.reviewed_at)}</p>}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TabKey = 'programs' | 'legacy'
type LegacyFilter = 'pending' | 'approved' | 'rejected' | 'all'

export default function ManagerApprovals() {
  const reduce = useReducedMotion()
  const [tab, setTab] = useState<TabKey>('programs')
  const [legacyFilter, setLegacyFilter] = useState<LegacyFilter>('pending')
  const [error, setError] = useState('')

  // Programs pending
  const { data: programsData, loading: programsLoading, refetch: refetchPrograms } =
    usePolling<ProgramPendingResponse>({
      fetcher: () => api.get('/programs/pending-approvals/').then((r) => r.data),
      interval: 20_000,
    })

  // Legacy submissions
  const { data: submissions, loading: legacyLoading, refetch: refetchLegacy } =
    usePolling<Submission[]>({
      fetcher: () =>
        api
          .get('/submissions/', { params: legacyFilter !== 'all' ? { status: legacyFilter } : undefined })
          .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
      interval: 30_000,
    })

  const handleProgramAction = useCallback(
    async (id: string, modelType: string, action: 'approve' | 'reject') => {
      try {
        await api.post('/programs/pending-approvals/', { id, model_type: modelType, action })
        refetchPrograms()
      } catch (err) {
        setError(apiErrorMessage(err))
      }
    },
    [refetchPrograms]
  )

  const handleLegacyApprove = async (id: string) => {
    try { await api.post(`/submissions/${id}/approve/`); refetchLegacy() }
    catch (err) { setError(apiErrorMessage(err)) }
  }

  const handleLegacyReject = async (id: string) => {
    try { await api.post(`/submissions/${id}/reject/`); refetchLegacy() }
    catch (err) { setError(apiErrorMessage(err)) }
  }

  const programsTotal = programsData?.total ?? 0
  const legacyPending = (submissions ?? []).filter((s) => s.status === 'pending').length

  const totalPending = (tab === 'programs' ? programsTotal : legacyPending)

  const LEGACY_FILTERS: { key: LegacyFilter; label: string }[] = [
    { key: 'pending', label: `Pending${legacyPending > 0 ? ` (${legacyPending})` : ''}` },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Manager Approvals
            {totalPending > 0 && (
              <span className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white tabular-nums">
                {totalPending > 99 ? '99+' : totalPending}
              </span>
            )}
          </h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            অনুমোদন / প্রত্যাখ্যান · Field submission review
          </p>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-3 underline text-red-500">Dismiss</button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-2 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 p-1 w-fit">
        {([
          { key: 'programs' as TabKey, label: 'Programs', count: programsTotal },
          { key: 'legacy'   as TabKey, label: 'Legacy Forms', count: legacyPending },
        ] as { key: TabKey; label: string; count: number }[]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              tab === key
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            )}
          >
            {label}
            {count > 0 && (
              <span className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                tab === key
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              )}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── Programs tab ── */}
        {tab === 'programs' && (
          <motion.div
            key="programs"
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {/* Type counts summary */}
            {programsData && Object.keys(programsData.counts_by_type).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(programsData.counts_by_type).map(([type, count]) => (
                  <span
                    key={type}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums',
                      MODEL_COLORS[type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                    )}
                  >
                    {MODEL_ICONS[type]}
                    {type.replace(/_/g, ' ')} <strong>{count}</strong>
                  </span>
                ))}
              </div>
            )}

            {programsLoading && !programsData ? (
              <PageLoader />
            ) : programsTotal === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-green-400" />
                <p className="text-gray-500 dark:text-gray-400">All caught up — no pending programs submissions.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(programsData?.items ?? []).map((item, idx) => (
                  <motion.div
                    key={`${item.model_type}-${item.id}`}
                    initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: reduce ? 0 : Math.min(idx * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
                  >
                    <ProgramCard item={item} onAction={handleProgramAction} />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Legacy tab ── */}
        {tab === 'legacy' && (
          <motion.div
            key="legacy"
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -4 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4"
          >
            {/* Legacy filter tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {LEGACY_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setLegacyFilter(key)}
                  className={cn(
                    'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    legacyFilter === key
                      ? 'bg-unfpa-blue text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-unfpa-blue hover:text-unfpa-blue'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {legacyLoading && !submissions ? (
              <PageLoader />
            ) : (submissions ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
                <p className="text-gray-400 dark:text-gray-500">No submissions found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(submissions ?? []).map((s) => (
                  <SubmissionCard
                    key={s.id}
                    submission={s}
                    onApprove={handleLegacyApprove}
                    onReject={handleLegacyReject}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
