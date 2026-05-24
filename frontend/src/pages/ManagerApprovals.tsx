import { useState } from 'react'
import { CheckCircle2, MapPin, XCircle } from 'lucide-react'
import { Drawer } from 'vaul'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Submission } from '@/types'

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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const approve = async () => {
    setApproving(true)
    await onApprove(submission.id)
    setApproving(false)
    setDrawerOpen(false)
  }

  const reject = async () => {
    setRejecting(true)
    await onReject(submission.id)
    setRejecting(false)
    setDrawerOpen(false)
  }

  const handleCardClick = () => {
    if (window.innerWidth < 640) setDrawerOpen(true)
  }

  const chips = (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-unfpa-blue/10 px-2.5 py-1 text-xs font-medium text-unfpa-blue">
        {submission.partner}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-300">
        <MapPin className="h-3 w-3" />
        {submission.district}{submission.region ? `, ${submission.region}` : ''}
      </span>
      {submission.latitude && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400">
          {submission.latitude.toFixed(4)}, {submission.longitude?.toFixed(4)}
        </span>
      )}
    </div>
  )

  const approveRejectButtons = (
    <div className="flex gap-3">
      <button
        onClick={approve}
        disabled={approving || rejecting}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-status-on_track py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
      >
        {approving ? <LoadingSpinner size="sm" className="text-white" /> : <><CheckCircle2 className="h-4 w-4" />Approve</>}
      </button>
      <button
        onClick={reject}
        disabled={approving || rejecting}
        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-status-critical py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
      >
        {rejecting ? <LoadingSpinner size="sm" className="text-white" /> : <><XCircle className="h-4 w-4" />Reject</>}
      </button>
    </div>
  )

  return (
    <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} shouldScaleBackground={false}>
      {/* Card — tappable on mobile, static on desktop */}
      <div
        onClick={handleCardClick}
        className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5 space-y-4 cursor-pointer sm:cursor-default"
      >
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
          <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
            {formatDateTime(submission.submitted_at)}
          </span>
        </div>

        {chips}

        {/* Desktop-only action buttons */}
        {submission.status === 'pending' && (
          <div className="hidden sm:flex gap-3 pt-1">{approveRejectButtons}</div>
        )}

        {submission.status !== 'pending' && (
          <div className="text-xs text-gray-400 dark:text-gray-500">
            Reviewed by {submission.reviewed_by?.email ?? 'system'} · {formatDateTime(submission.reviewed_at)}
          </div>
        )}
      </div>

      {/* Mobile slide-up drawer */}
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-[20px] bg-white dark:bg-gray-800 px-5 pb-8 outline-none">
          <div className="mx-auto mt-3 mb-5 h-1.5 w-12 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-600" />

          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-wide text-unfpa-blue">
                  {FORM_LABELS[submission.form_type] ?? submission.form_type}
                </span>
                <StatusBadge status={submission.status} />
              </div>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{submission.worker_name}</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{formatDateTime(submission.submitted_at)}</p>
            </div>

            {chips}

            {submission.status === 'pending'
              ? <div className="pt-2">{approveRejectButtons}</div>
              : <div className="text-xs text-gray-400 dark:text-gray-500 pt-2">
                  Reviewed by {submission.reviewed_by?.email ?? 'system'} · {formatDateTime(submission.reviewed_at)}
                </div>
            }
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all'

export default function ManagerApprovals() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [error, setError] = useState('')

  const { data: submissions, loading, refetch } = usePolling<Submission[]>({
    fetcher: () =>
      api
        .get('/submissions/', { params: filter !== 'all' ? { status: filter } : undefined })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 30_000,
  })

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/submissions/${id}/approve/`)
      refetch()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const handleReject = async (id: string) => {
    try {
      await api.post(`/submissions/${id}/reject/`)
      refetch()
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const pendingCount = (submissions ?? []).filter((s) => s.status === 'pending').length

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'pending', label: `Pending${pendingCount > 0 && filter !== 'pending' ? ` (${pendingCount})` : ''}` },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Manager Approvals
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-status-critical h-6 w-6 text-xs font-bold text-white">
                {pendingCount}
              </span>
            )}
          </h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            অনুমোদন / প্রত্যাখ্যান · Field submission review
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              filter === key
                ? 'bg-unfpa-blue text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-unfpa-blue hover:text-unfpa-blue'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading && !submissions ? (
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
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  )
}
