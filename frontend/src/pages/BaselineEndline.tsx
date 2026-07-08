/**
 * Baseline studies — CIPRB verification + data-driven monitoring (D5).
 *
 * Two surfaces on one page:
 *   1. INSIGHTS — charts built from every VERIFIED interview's full answer set
 *      (age, district, education, marital, religion, income + NID/mobile KPIs),
 *      split by key population (Hijra / FSW). Source: /baseline/responses/insights/.
 *   2. VERIFICATION — the CIPRB sign-off queue. Each pending interview shows a
 *      readable headline + the full grouped Q/A (labels resolved server-side),
 *      then Approve (materialises the record) or Reject.
 *
 * Endpoints (CIPRB-scoped):
 *   GET  /baseline/responses/insights/      chart aggregation
 *   GET  /baseline/responses/stats/         headline counts
 *   GET  /baseline/verification/            pending queue (+ headline + answers)
 *   POST /baseline/verification/<id>/approve|reject/
 *   GET  /baseline/responses/export/        verified CSV
 */
import { useMemo, useState } from 'react'
import {
  ShieldCheck, AlertTriangle, MapPinOff, Download, Check, X,
  ChevronDown, ChevronUp, Inbox, MapPin, CreditCard, Smartphone, CalendarDays,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { BarBreakdown, Histogram, DonutBreakdown } from '@/components/ciprb/IndicatorCharts'
import { FieldworkMonitor, type Monitoring } from '@/components/baseline/FieldworkMonitor'

type Pop = 'hijra' | 'fsw'
type Lens = 'all' | Pop

interface Bucket { name: string; value: number }
interface PopDim { hijra: Bucket[]; fsw: Bucket[] }
interface Insights {
  total: number
  population: { name: string; key: Pop; value: number }[]
  round: Bucket[]
  kpis: Record<Pop, { n: number; avg_age: number | null; nid_pct: number | null; mobile_pct: number | null }>
  districts_count: number
  age_band: PopDim
  district: PopDim
  education: PopDim
  marital: PopDim
  religion: PopDim
  income_band: PopDim
}
interface HeadlineItem { label: string; value: string }
interface AnswerRow { section: string; field: string; question: string; value: string; answer: string }
interface PendingItem {
  submission_id: string
  population: Pop | ''
  serial: string
  district: string
  site_code: string
  age: string | number
  interviewer: string
  submitted_at: string
  gps_missing: boolean
  answer_count: number
  duplicate_preview: boolean
  headline: HeadlineItem[]
  answers: AnswerRow[]
}
interface Stats {
  verified_total: number
  verified_hijra: number
  verified_fsw: number
  duplicates: number
  pending: number
}

const POP_LABEL: Record<string, string> = {
  hijra: 'Hijra / Gender-diverse',
  fsw: 'Female Sex Worker',
}

/** array[{name,value}] -> Record<name, value>; 'all' merges both pops by name. */
function toRecord(dim: PopDim | undefined, lens: Lens): Record<string, number> {
  if (!dim) return {}
  const src = lens === 'all' ? [...dim.hijra, ...dim.fsw] : dim[lens] || []
  const out: Record<string, number> = {}
  for (const b of src) out[b.name] = (out[b.name] || 0) + b.value
  return out
}

function Stat({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className="card snug" style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 38, lineHeight: 1, color: accent || 'var(--ink)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

/** Small KPI chip with an icon — used inside the insights strip. */
function KpiChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card snug" style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 168, flex: '1 1 168px' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(249,96,0,0.10)', color: 'var(--unfpa)', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
      </div>
    </div>
  )
}

export default function BaselineEndline() {
  const { data: stats, refetch: refetchStats } = usePolling<Stats>({
    fetcher: () => api.get('/baseline/responses/stats/').then((r) => r.data),
    interval: 30_000,
  })
  const { data: insights, refetch: refetchInsights } = usePolling<Insights>({
    fetcher: () => api.get('/baseline/responses/insights/').then((r) => r.data),
    interval: 60_000,
  })
  const { data: monitoring } = usePolling<Monitoring>({
    fetcher: () => api.get('/baseline/responses/monitoring/').then((r) => r.data),
    interval: 30_000,
  })
  const { data: pending, loading, refetch: refetchPending } = usePolling<PendingItem[]>({
    fetcher: () => api.get('/baseline/verification/').then((r) =>
      Array.isArray(r.data) ? r.data : (r.data?.results ?? [])),
    interval: 30_000,
  })

  const [lens, setLens] = useState<Lens>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [popFilter, setPopFilter] = useState<'' | Pop>('')
  const [exporting, setExporting] = useState(false)

  const items = useMemo(
    () => (pending ?? []).filter((p) => !popFilter || p.population === popFilter),
    [pending, popFilter],
  )

  // KPI figures for the selected lens.
  const lensKpi = useMemo(() => {
    if (!insights) return { n: 0, avg_age: null as number | null, nid_pct: null as number | null, mobile_pct: null as number | null }
    if (lens === 'all') {
      const h = insights.kpis.hijra, f = insights.kpis.fsw
      const n = h.n + f.n
      const wavg = (a: number | null, an: number, b: number | null, bn: number) =>
        (a == null && b == null) ? null : Math.round(((a || 0) * an + (b || 0) * bn) / Math.max(1, (a != null ? an : 0) + (b != null ? bn : 0)))
      return {
        n,
        avg_age: wavg(h.avg_age, h.n, f.avg_age, f.n),
        nid_pct: wavg(h.nid_pct, h.n, f.nid_pct, f.n),
        mobile_pct: wavg(h.mobile_pct, h.n, f.mobile_pct, f.n),
      }
    }
    return insights.kpis[lens]
  }, [insights, lens])

  async function review(id: string, action: 'approve' | 'reject', note = '') {
    setBusy(id); setErr('')
    try {
      await api.post(`/baseline/verification/${id}/${action}/`,
        action === 'reject' ? { reason: note } : { note })
      setRejecting(null); setReason('')
      await Promise.all([refetchPending(), refetchStats(), refetchInsights()])
    } catch (e) {
      setErr(apiErrorMessage(e, 'Action failed.'))
    } finally {
      setBusy(null)
    }
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const r = await api.get('/baseline/responses/export/', { responseType: 'blob' })
      const url = URL.createObjectURL(r.data as Blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'baseline_responses.csv'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Export failed.'))
    } finally {
      setExporting(false)
    }
  }

  const hasInsights = (insights?.total ?? 0) > 0

  return (
    <>
      <section className="hero" style={{ paddingBottom: 18 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>BASELINE STUDIES</span>
          <span className="sep">/</span>
          <span>CIPRB FIELDWORK MONITORING</span>
        </div>
        <h1 className="hero-headline anim-rise d1" style={{ fontSize: 'clamp(40px, 6vw, 76px)', marginBottom: 8 }}>
          <span className="figure" style={{ color: 'var(--unfpa)' }}>Monitor</span> &amp; understand.
        </h1>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 720, marginTop: 14 }}>
          Live monitoring of the Hijra and Female Sex Worker baseline collection: how many interviews come
          in each day, from which sites and enumerators, at what quality — then the population profile as it
          builds, module by module.
        </p>
      </section>

      {/* ── Fieldwork Command Center — the collection monitor ─────────────── */}
      <section className="section" style={{ marginTop: 16 }}>
        <div className="kicker" style={{ marginBottom: 12 }}><span className="dot" /> Fieldwork command center · every collected interview</div>
        {monitoring
          ? <FieldworkMonitor m={monitoring} />
          : <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>Loading collection monitor…</div>}
      </section>

      {err && (
        <section className="section" style={{ marginTop: 12 }}>
          <div className="card" style={{ background: 'rgba(233,69,96,0.06)', borderColor: 'rgba(233,69,96,0.2)', color: 'var(--rose)', padding: '10px 14px', fontSize: 13 }}>{err}</div>
        </section>
      )}

      {/* ── Insights ─────────────────────────────────────────────────────── */}
      <section className="section" style={{ marginTop: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="kicker"><span className="dot" /> Baseline profile · by questionnaire module</div>
          <div className="pills">
            {([['all', 'Both'], ['hijra', 'Hijra'], ['fsw', 'FSW']] as const).map(([v, label]) => (
              <button key={v} className={`pill ${lens === v ? 'on' : ''}`} onClick={() => setLens(v as Lens)}>{label}</button>
            ))}
          </div>
        </div>

        {!hasInsights ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <ShieldCheck size={26} style={{ opacity: 0.5 }} />
            <p style={{ marginTop: 10, fontSize: 14 }}>No interviews yet. The population profile builds here automatically as interviews arrive.</p>
          </div>
        ) : (
          <>
            {/* KPI strip for the selected lens */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <KpiChip icon={<ShieldCheck size={17} />} label={lens === 'all' ? 'verified interviews' : `${POP_LABEL[lens]}`} value={String(lensKpi.n)} />
              <KpiChip icon={<MapPin size={17} />} label="districts covered" value={String(insights?.districts_count ?? 0)} />
              <KpiChip icon={<CalendarDays size={17} />} label="average age (years)" value={lensKpi.avg_age != null ? String(lensKpi.avg_age) : '—'} />
              <KpiChip icon={<CreditCard size={17} />} label="have a National ID" value={lensKpi.nid_pct != null ? `${lensKpi.nid_pct}%` : '—'} />
              <KpiChip icon={<Smartphone size={17} />} label="own a mobile phone" value={lensKpi.mobile_pct != null ? `${lensKpi.mobile_pct}%` : '—'} />
            </div>

            {/* Chart grid — reuses the CIPRB indicator primitives (solid pies, no donuts) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              <Histogram title="Age distribution" kicker="Completed age (years)" data={toRecord(insights?.age_band, lens)} />
              <BarBreakdown title="District coverage" kicker="Where interviews came from" data={toRecord(insights?.district, lens)} />
              <BarBreakdown title="Highest education" kicker="Educational attainment" data={toRecord(insights?.education, lens)} />
              <DonutBreakdown title="Marital / partnership status" kicker="Current status" data={toRecord(insights?.marital, lens)} />
              <Histogram title="Monthly income" kicker="Taka per month (banded)" data={toRecord(insights?.income_band, lens)} />
              <DonutBreakdown title="Religion" kicker="Reported religion" data={toRecord(insights?.religion, lens)} />
              {lens === 'all' && (
                <DonutBreakdown title="Population reached" kicker="Key population split"
                  data={Object.fromEntries((insights?.population ?? []).map((p) => [p.name, p.value]))} />
              )}
            </div>
          </>
        )}
      </section>

      <section className="section" style={{ marginTop: 24, marginBottom: 80 }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 12.5 }}>
          <ShieldCheck size={16} style={{ color: 'var(--emerald)' }} />
          CIPRB-conducted baseline. Every interview is monitored above as it arrives; the full response set is preserved for the D5 report.
        </div>
      </section>
    </>
  )
}

/** Full interview answers, grouped by questionnaire section, in plain language. */
function FullAnswers({ answers }: { answers: AnswerRow[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, AnswerRow[]>()
    for (const a of answers || []) {
      if (!m.has(a.section)) m.set(a.section, [])
      m.get(a.section)!.push(a)
    }
    return Array.from(m.entries())
  }, [answers])

  if (!answers || answers.length === 0) {
    return <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>No answers recorded.</div>
  }
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--hair)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {groups.map(([section, rows]) => (
        <div key={section}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--unfpa)', marginBottom: 8 }}>{section}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px 20px' }}>
            {rows.map((r) => (
              <div key={r.field} style={{ fontSize: 12.5, minWidth: 0 }}>
                <div style={{ color: 'var(--muted)', lineHeight: 1.3 }}>{r.question}</div>
                <div style={{ color: 'var(--ink)', fontWeight: 600, overflowWrap: 'anywhere', marginTop: 1 }}>{r.answer || r.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
