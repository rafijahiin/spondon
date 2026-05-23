import { useState } from 'react'
import { Clock, MapPin } from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate, formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { MPDSRCase, AuditEntry } from '@/types'

const CAUSE_LABELS: Record<string, string> = {
  pph: 'PPH',
  eclampsia: 'Eclampsia',
  sepsis: 'Sepsis',
  obstructed_labour: 'Obstructed Labour',
  other: 'Other',
}

const PLACE_LABELS: Record<string, string> = {
  facility: 'Facility',
  home: 'Home',
  in_transit: 'In Transit',
}

function AuditDrawer({ kase, onClose }: { kase: MPDSRCase; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Audit Trail</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">Case {kase.case_hash.slice(0, 8)}…</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Case summary */}
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800 p-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-400">Cause</p>
                <p className="font-medium text-gray-900 dark:text-white">{CAUSE_LABELS[kase.cause_of_death] ?? kase.cause_of_death}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Place</p>
                <p className="font-medium text-gray-900 dark:text-white">{PLACE_LABELS[kase.place_of_death] ?? kase.place_of_death}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">District</p>
                <p className="font-medium text-gray-900 dark:text-white">{kase.district}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="font-medium text-gray-900 dark:text-white">{formatDate(kase.date_of_death)}</p>
              </div>
            </div>
          </div>

          {/* Audit timeline */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Timeline</h3>
            {(kase.audit_trail ?? []).length === 0 && (
              <p className="text-sm text-gray-400">No audit entries yet.</p>
            )}
            <div className="relative space-y-4 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-gray-200 dark:before:bg-gray-700">
              {(kase.audit_trail ?? []).map((entry: AuditEntry, i: number) => (
                <div key={i} className="flex gap-4 pl-10 relative">
                  <span className="absolute left-2.5 top-1.5 h-3 w-3 rounded-full bg-unfpa-blue ring-2 ring-white dark:ring-gray-900" />
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{entry.action}</p>
                      <span className="flex-shrink-0 flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{entry.user}</p>
                    {entry.notes && <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 italic">{entry.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type PartnerFilter = 'all' | 'PHD' | 'Bondhu'
type CauseFilter = 'all' | string

export default function MPDSRTracker() {
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all')
  const [causeFilter, setCauseFilter] = useState<CauseFilter>('all')
  const [selectedCase, setSelectedCase] = useState<MPDSRCase | null>(null)

  const { data: cases, loading } = usePolling<MPDSRCase[]>({
    fetcher: () =>
      api
        .get('/mpdsr/cases/', {
          params: {
            ...(partnerFilter !== 'all' ? { partner: partnerFilter } : {}),
            ...(causeFilter !== 'all' ? { cause_of_death: causeFilter } : {}),
          },
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  // Disaggregation summary
  const causeCounts: Record<string, number> = {}
  const placeCounts: Record<string, number> = {}
  for (const c of cases ?? []) {
    causeCounts[c.cause_of_death] = (causeCounts[c.cause_of_death] ?? 0) + 1
    placeCounts[c.place_of_death] = (placeCounts[c.place_of_death] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MPDSR Tracker</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          মাতৃমৃত্যু পর্যালোচনা · Maternal & Perinatal Death Surveillance
        </p>
      </div>

      {/* Disaggregation cards */}
      {(cases ?? []).length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(CAUSE_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setCauseFilter(causeFilter === key ? 'all' : key)}
              className={cn(
                'rounded-xl border p-4 text-left transition-all',
                causeFilter === key
                  ? 'border-unfpa-blue bg-unfpa-blue/10 dark:bg-unfpa-blue/20'
                  : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-unfpa-blue/50'
              )}
            >
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{causeCounts[key] ?? 0}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
            </button>
          ))}
        </div>
      )}

      {/* Place of death summary */}
      {(cases ?? []).length > 0 && (
        <div className="flex flex-wrap gap-4">
          {Object.entries(PLACE_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-2 text-sm">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-unfpa-blue/15 text-[10px] font-bold text-unfpa-blue">
                {placeCounts[key] ?? 0}
              </span>
              <span className="text-gray-600 dark:text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      )}

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

      {/* Table */}
      {loading && !cases ? (
        <PageLoader />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                <tr>
                  {['Case ID', 'Partner', 'District', 'Date', 'Cause', 'Place', 'Status', 'Audit'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(cases ?? []).map((c) => (
                  <tr key={c.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-700/30', c.is_overdue_committee && 'bg-amber-50/50 dark:bg-amber-900/10')}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {c.case_hash.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 font-medium text-unfpa-blue">{c.partner}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {c.district}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(c.date_of_death)}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{CAUSE_LABELS[c.cause_of_death] ?? c.cause_of_death}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{PLACE_LABELS[c.place_of_death] ?? c.place_of_death}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedCase(c)}
                        className="text-xs font-medium text-unfpa-blue hover:text-unfpa-dark underline"
                      >
                        View ({(c.audit_trail ?? []).length})
                      </button>
                    </td>
                  </tr>
                ))}
                {!(cases ?? []).length && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-gray-400">No MPDSR cases found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCase && (
        <AuditDrawer kase={selectedCase} onClose={() => setSelectedCase(null)} />
      )}
    </div>
  )
}
