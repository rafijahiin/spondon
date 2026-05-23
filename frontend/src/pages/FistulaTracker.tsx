import { useState } from 'react'
import { Plus, AlertTriangle, MapPin } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { FistulaCase } from '@/types'

const STATUS_FLOW = ['identified', 'action_required', 'followup_pending', 'referral_completed'] as const

function AddCaseModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    district: '',
    partner: 'PHD',
    age: '',
    date_identified: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/fistula/cases/', { ...form, age: form.age ? parseInt(form.age) : null })
      onSuccess()
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">Add Fistula Case</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Partner</label>
              <select
                value={form.partner}
                onChange={(e) => setForm((f) => ({ ...f, partner: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
              >
                <option>PHD</option>
                <option>Bondhu</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date Identified</label>
              <input
                type="date"
                value={form.date_identified}
                onChange={(e) => setForm((f) => ({ ...f, date_identified: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">District</label>
              <input
                type="text"
                value={form.district}
                onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
                placeholder="e.g. Sylhet"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Age</label>
              <input
                type="number"
                value={form.age}
                onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))}
                min={0}
                max={120}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none"
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-unfpa-blue focus:outline-none resize-none"
              placeholder="Optional notes…"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-unfpa-blue py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark disabled:opacity-60"
            >
              {saving ? <LoadingSpinner size="sm" className="text-white" /> : 'Add Case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function FistulaTracker() {
  const [showAdd, setShowAdd] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const { data: cases, loading, refetch } = usePolling<FistulaCase[]>({
    fetcher: () =>
      api
        .get('/fistula/cases/', {
          params: {
            ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
            ...(overdueOnly ? { overdue: true } : {}),
          },
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const overdueCount = (cases ?? []).filter((c) => c.is_overdue).length

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fistula Tracker</h1>
          <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
            ফিস্টুলা কেস ট্র্যাকার · Campaign Case Management
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-xl bg-unfpa-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-unfpa-dark transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Case
        </button>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400">
            <span className="font-semibold">{overdueCount} case{overdueCount !== 1 ? 's' : ''}</span> overdue for follow-up
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setOverdueOnly((o) => !o)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            overdueOnly
              ? 'bg-status-critical text-white'
              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
          )}
        >
          Overdue only
        </button>
        {['all', ...STATUS_FLOW].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors capitalize',
              statusFilter === s
                ? 'bg-unfpa-blue text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
            )}
          >
            {s.replace(/_/g, ' ')}
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
                  {['Case ID', 'Partner', 'District', 'Date', 'Age', 'Status', 'Follow-up', 'Referral'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(cases ?? []).map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'hover:bg-gray-50 dark:hover:bg-gray-700/30',
                      c.is_overdue && 'bg-red-50/50 dark:bg-red-900/10'
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {c.case_hash.slice(0, 8)}…
                      {c.is_overdue && <AlertTriangle className="inline ml-1 h-3 w-3 text-red-500" />}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('font-medium', c.partner === 'PHD' ? 'text-unfpa-blue' : 'text-purple-600 dark:text-purple-400')}>
                        {c.partner}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <MapPin className="h-3 w-3 text-gray-400" />
                        {c.district}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(c.date_identified)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.age ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(c.follow_up_date)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{c.referral_status || '—'}</td>
                  </tr>
                ))}
                {!(cases ?? []).length && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-gray-400">No fistula cases found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && <AddCaseModal onClose={() => setShowAdd(false)} onSuccess={refetch} />}
    </div>
  )
}
