import { useState } from 'react'
import { Download, Users } from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { TrainingSession, TrainingAttendance } from '@/types'

const TOPIC_LABELS: Record<string, string> = {
  'dashboard_navigation': 'Dashboard Navigation',
  'kobo_entry': 'KoboToolbox Data Entry',
  'report_review': 'Report Review',
}

function AttendanceTable({ session }: { session: TrainingSession }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {/* Session row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {TOPIC_LABELS[session.topic] ?? session.topic}
            </span>
            <span className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              'bg-unfpa-blue/10 text-unfpa-blue dark:bg-unfpa-blue/20'
            )}>
              {session.partner}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>{formatDate(session.date)}</span>
            <span>·</span>
            <span>{session.region}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {session.actual_participants} / {session.expected_participants} attended
            </span>
            {session.attendance_rate !== null && (
              <>
                <span>·</span>
                <span className={cn(
                  'font-medium',
                  (session.attendance_rate ?? 0) >= 80 ? 'text-status-on_track' : 'text-status-critical'
                )}>
                  {session.attendance_rate?.toFixed(0)}% rate
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Competency indicator */}
          <div className="text-right">
            <p className="text-xs text-gray-400">Avg score</p>
            <p className="font-bold text-gray-900 dark:text-white">
              {(session.attendances ?? []).length > 0
                ? (
                    (session.attendances ?? []).reduce((sum, _a) => sum + 0, 0) / (session.attendances ?? []).length
                  ).toFixed(0)
                : '—'}
            </p>
          </div>
          <svg
            className={cn('h-4 w-4 text-gray-400 transition-transform', open && 'rotate-180')}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Attendance table */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          {(session.attendances ?? []).length === 0 ? (
            <p className="px-5 py-4 text-sm text-gray-400">No attendance records.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/40">
                <tr>
                  {['Name', 'Role', 'Attended', 'Result'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(session.attendances ?? []).map((a: TrainingAttendance) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{a.participant_name}</td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{a.role_display}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs font-medium', a.attended ? 'text-status-on_track' : 'text-gray-400')}>
                        {a.attended ? '✓ Yes' : '✗ No'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {a.attended ? <StatusBadge status="pass" /> : <span className="text-xs text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

type PartnerFilter = 'all' | 'PHD' | 'Bondhu'

export default function TrainingLog() {
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all')

  const { data: sessions, loading } = usePolling<TrainingSession[]>({
    fetcher: () =>
      api
        .get('/training/sessions/', {
          params: partnerFilter !== 'all' ? { partner: partnerFilter } : undefined,
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 120_000,
  })

  const totalAttended = (sessions ?? []).reduce((s, sess) => s + sess.actual_participants, 0)
  const totalExpected = (sessions ?? []).reduce((s, sess) => s + sess.expected_participants, 0)

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get('/training/summary-pdf/', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'training-summary.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — user will see nothing downloaded
    }
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Training Log</h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            প্রশিক্ষণ লগ · Session Records &amp; Attendance
          </p>
        </div>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 rounded-xl bg-unfpa-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark transition-colors"
        >
          <Download className="h-4 w-4" />
          Download PDF
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Sessions', value: (sessions ?? []).length },
          { label: 'Total Attended', value: totalAttended },
          { label: 'Expected', value: totalExpected },
          {
            label: 'Avg Rate',
            value: totalExpected > 0 ? `${((totalAttended / totalExpected) * 100).toFixed(0)}%` : '—',
          },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Partner filter */}
      <div className="flex gap-2">
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
      </div>

      {/* Sessions list */}
      {loading && !sessions ? (
        <PageLoader />
      ) : (sessions ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 py-16 text-center">
          <p className="text-gray-400 dark:text-gray-500">No training sessions recorded.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(sessions ?? []).map((session) => (
            <AttendanceTable key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}
