import { Activity, FileText, Heart, Users, MapPin } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { KPICard } from '@/components/ui/KPICard'
import { BangladeshMap } from '@/components/maps/BangladeshMap'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { AlertCard } from '@/components/ui/AlertCard'
import { formatDateTime } from '@/utils/format'
import type { KPIs, ActivityItem, Alert, ServiceCenter } from '@/types'

function useKPIs() {
  return usePolling<KPIs>({ fetcher: () => api.get('/dashboard/kpis/').then((r) => r.data), interval: 30_000 })
}

function useActivityFeed() {
  return usePolling<ActivityItem[]>({
    fetcher: () =>
      api.get('/dashboard/activity-feed/').then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 20_000,
  })
}

function useAlerts() {
  return usePolling<Alert[]>({
    fetcher: () =>
      api.get('/dashboard/alerts/?acknowledged=false').then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results ?? []))),
    interval: 60_000,
  })
}

function useServiceCenters() {
  return usePolling<ServiceCenter[]>({
    fetcher: () =>
      api.get('/programs/centers/').then((r) => {
        const data = r.data
        return Array.isArray(data) ? data : (data?.results ?? [])
      }),
    interval: 5 * 60_000,
  })
}

const FORM_ICONS: Record<string, React.ReactNode> = {
  // Legacy forms
  fistula:  <Heart    className="h-3.5 w-3.5" />,
  mpdsr:    <Activity className="h-3.5 w-3.5" />,
  activity: <Users    className="h-3.5 w-3.5" />,
  baseline: <FileText className="h-3.5 w-3.5" />,
  // Programs forms — same icon clusters
  clinic_visit:           <Activity className="h-3.5 w-3.5" />,
  hiv_sti_test:           <Activity className="h-3.5 w-3.5" />,
  antenatal_card:         <Heart    className="h-3.5 w-3.5" />,
  htc_counselling:        <Users    className="h-3.5 w-3.5" />,
  individual_counsel:     <Users    className="h-3.5 w-3.5" />,
  mh_screening:           <FileText className="h-3.5 w-3.5" />,
  gbv_case:               <Activity className="h-3.5 w-3.5" />,
  outreach_session:       <Users    className="h-3.5 w-3.5" />,
  group_education:        <Users    className="h-3.5 w-3.5" />,
  referral:               <FileText className="h-3.5 w-3.5" />,
  hygiene_kit:            <FileText className="h-3.5 w-3.5" />,
  adr_record:             <Activity className="h-3.5 w-3.5" />,
  autoclave_log:          <Activity className="h-3.5 w-3.5" />,
  training_event:         <Users    className="h-3.5 w-3.5" />,
  coord_meeting:          <Users    className="h-3.5 w-3.5" />,
  mobile_camp:            <MapPin   className="h-3.5 w-3.5" />,
}

export default function Home() {
  const reduce = useReducedMotion()
  const { data: kpis, loading: kpisLoading } = useKPIs()
  const { data: feed, loading: feedLoading } = useActivityFeed()
  const { data: alerts } = useAlerts()
  const { data: centers } = useServiceCenters()

  const activityFeed = feed ?? []
  const visibleAlerts = (alerts ?? []).filter((a) => !a.acknowledged)

  if (kpisLoading && !kpis) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Programme Overview</h1>
        <p className="font-bangla mt-1 text-sm text-gray-500 dark:text-gray-400">
          সামগ্রিক কর্মসূচি পর্যবেক্ষণ · Real-time M&amp;E Dashboard
        </p>
      </motion.div>

      {/* AI Anomaly Alerts */}
      {visibleAlerts.length > 0 && (
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0, y: reduce ? 0 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Active Alerts
          </h2>
          {visibleAlerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </motion.div>
      )}

      {/* KPI Cards */}
      {kpis && (
        <motion.div
          className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <KPICard
            label="Submissions This Month"
            labelBn="এ মাসের জমা"
            value={kpis.submissions_this_month}
            trend={kpis.mom_change_percent}
            icon={<FileText className="h-5 w-5" />}
            highlight
          />
          <KPICard
            label="Pending Review"
            labelBn="পর্যালোচনা বাকি"
            value={kpis.submissions_pending}
            icon={<Activity className="h-5 w-5" />}
          />
          <KPICard
            label="Active Workers"
            labelBn="সক্রিয় কর্মী"
            value={kpis.active_workers}
            icon={<Users className="h-5 w-5" />}
          />
          <KPICard
            label="Fistula Cases"
            labelBn="ফিস্টুলা কেস"
            value={kpis.fistula_cases_this_month}
            icon={<Heart className="h-5 w-5" />}
          />
        </motion.div>
      )}

      {/* Service Center count chips */}
      {(centers ?? []).length > 0 && (
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {[
            { type: 'DIC', label: 'DICs', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
            { type: 'BROTHEL', label: 'Brothels', color: 'bg-blue-100 text-unfpa-blue dark:bg-blue-900/30 dark:text-blue-300' },
            { type: 'SUB_DIC', label: 'Sub-DICs', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
          ].map(({ type, label, color }) => {
            const count = (centers ?? []).filter((c) => c.center_type === type).length
            if (count === 0) return null
            return (
              <span key={type} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tabular-nums ${color}`}>
                <MapPin className="h-3 w-3" />
                {count} {label}
              </span>
            )
          })}
        </motion.div>
      )}

      {/* Map + Activity Feed */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Bangladesh Choropleth Map */}
        <motion.div
          className="lg:col-span-3"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Service Centre Map</h2>
                <p className="font-bangla text-xs text-gray-400 dark:text-gray-500">সেবাকেন্দ্র ও জমা</p>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {(centers ?? []).length} centres · {activityFeed.length} submissions
              </span>
            </div>
            <BangladeshMap activityFeed={activityFeed} centers={centers ?? []} />
          </div>
        </motion.div>

        {/* Live Activity Feed */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm p-5 flex flex-col h-full">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Live Activity</h2>
                <p className="font-bangla text-xs text-gray-400 dark:text-gray-500">সরাসরি কার্যক্রম</p>
              </div>
              <span className="flex h-2 w-2 items-center">
                <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            </div>

            {feedLoading && !feed ? (
              <div className="flex flex-1 items-center justify-center">
                <span className="text-sm text-gray-400">Loading feed…</span>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-72 pr-1">
                {activityFeed.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No recent submissions.</p>
                )}
                {activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 p-3 text-sm"
                  >
                    <span className="mt-0.5 text-unfpa-blue">{FORM_ICONS[item.form_type] ?? <Activity className="h-3.5 w-3.5" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-gray-700 dark:text-gray-200 leading-snug" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                        <span className="font-medium">{item.partner}</span> field worker submitted
                        from <span className="font-medium">{item.district}</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={item.form_type} overrideLabel={item.form_type_display} />
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{item.time_ago}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Footer note */}
      {kpis && (
        <p className="text-right text-xs text-gray-400 dark:text-gray-600">
          Data as of {formatDateTime(kpis.as_of)} · Updates every 30s
        </p>
      )}
    </div>
  )
}
