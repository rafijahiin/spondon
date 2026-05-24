import { useState } from 'react'
import { MapPin, Users, Activity } from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { FistulaCampaign } from '@/types/index'

type PartnerFilter = 'all' | 'PHD' | 'Bandhu'

function StatPill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center px-3 py-2 rounded-lg text-center', accent ? 'bg-unfpa-blue/10' : 'bg-gray-50 dark:bg-gray-700/40')}>
      <span className={cn('text-lg font-bold', accent ? 'text-unfpa-blue' : 'text-gray-900 dark:text-white')}>{value}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{label}</span>
    </div>
  )
}

function SessionDrawer({ session, onClose }: { session: FistulaCampaign; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-4">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Campaign Session</h2>
            <p className="text-xs text-gray-400">{session.case_hash}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">✕</button>
        </div>
        <div className="p-5 space-y-5">
          {/* Location */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Location</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ['Partner', session.partner],
                ['District', session.district],
                ['Upazila', session.upazila],
                ['Union', session.union],
                ['Village', session.village],
                ['Facility', session.facility_name],
                ['Date', formatDate(session.campaign_date)],
              ].map(([label, val]) => val ? (
                <div key={label}>
                  <p className="text-[10px] text-gray-400">{label}</p>
                  <p className="font-medium text-gray-900 dark:text-white">{val}</p>
                </div>
              ) : null)}
            </div>
          </div>

          {/* Reach */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Campaign Reach</p>
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Women Screened" value={session.women_screened} accent />
              <StatPill label="Women Reached" value={session.women_reached_awareness} />
              <StatPill label="Men Reached" value={session.men_reached_awareness} />
              <StatPill label="Sessions" value={session.community_sessions} />
            </div>
          </div>

          {/* Cases */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Cases Identified</p>
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Suspected" value={session.suspected_fistula_cases} />
              <StatPill label="Confirmed" value={session.confirmed_fistula_cases} accent />
              <StatPill label="New" value={session.new_cases} />
              <StatPill label="Repeat" value={session.repeat_cases} />
            </div>
          </div>

          {/* Referral */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Referral</p>
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Referred" value={session.cases_referred} accent />
              <StatPill label="Accepted" value={session.cases_accepted_referral} />
              <StatPill label="Reached Facility" value={session.cases_reached_facility} />
            </div>
          </div>

          {/* Surgery */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Surgery</p>
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Completed" value={session.cases_surgery_completed} accent />
              <StatPill label="Pending" value={session.cases_surgery_pending} />
              <StatPill label="Not Eligible" value={session.cases_surgery_not_eligible} />
            </div>
          </div>

          {/* Follow-up */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Follow-up</p>
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Due" value={session.cases_followup_due} />
              <StatPill label="Completed" value={session.cases_followup_completed} accent />
              <StatPill label="Lost" value={session.cases_lost_followup} />
            </div>
          </div>

          {session.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{session.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FistulaTracker() {
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all')
  const [selected, setSelected] = useState<FistulaCampaign | null>(null)

  const { data: sessions, loading } = usePolling<FistulaCampaign[]>({
    fetcher: () =>
      api
        .get('/fistula/cases/', {
          params: partnerFilter !== 'all' ? { partner: partnerFilter } : {},
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const totals = (sessions ?? []).reduce(
    (acc, s) => ({
      screened: acc.screened + s.women_screened,
      confirmed: acc.confirmed + s.confirmed_fistula_cases,
      referred: acc.referred + s.cases_referred,
      surgery: acc.surgery + s.cases_surgery_completed,
    }),
    { screened: 0, confirmed: 0, referred: 0, surgery: 0 }
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Fistula Tracker</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          ফিস্টুলা ক্যাম্পেইন · Campaign Session Reports
        </p>
      </div>

      {/* Summary KPIs */}
      {(sessions ?? []).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Women Screened', value: totals.screened, icon: Users },
            { label: 'Confirmed Cases', value: totals.confirmed, icon: Activity },
            { label: 'Cases Referred', value: totals.referred, icon: Activity },
            { label: 'Surgeries Done', value: totals.surgery, icon: Activity },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Partner filter */}
      <div className="flex gap-2">
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
      </div>

      {/* Table */}
      {loading && !sessions ? (
        <PageLoader />
      ) : (
        <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40">
                <tr>
                  {['Session', 'Partner', 'Location', 'Date', 'Screened', 'Confirmed', 'Referred', 'Surgery', 'Details'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(sessions ?? []).map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{s.case_hash}</td>
                    <td className="px-4 py-3 font-medium text-unfpa-blue">{s.partner}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                        <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        {s.district}{s.upazila ? `, ${s.upazila}` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(s.campaign_date)}</td>
                    <td className="px-4 py-3 text-center font-semibold text-gray-900 dark:text-white">{s.women_screened}</td>
                    <td className="px-4 py-3 text-center font-semibold text-unfpa-blue">{s.confirmed_fistula_cases}</td>
                    <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{s.cases_referred}</td>
                    <td className="px-4 py-3 text-center text-green-600 dark:text-green-400 font-semibold">{s.cases_surgery_completed}</td>
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
                {!(sessions ?? []).length && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-sm text-gray-400">No campaign sessions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <SessionDrawer session={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
