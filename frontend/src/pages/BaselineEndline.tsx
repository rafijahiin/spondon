/**
 * Baseline studies — CIPRB fieldwork monitoring (D5).
 *
 * Three surfaces on one page:
 *   1. FIELDWORK — pace, per-site/enumerator throughput, duration, quality flags,
 *      over EVERY collected interview. Source: /baseline/responses/monitoring/.
 *   2. SRHR — the major indicators, per questionnaire module.
 *   3. INSIGHTS — the population profile as it builds (age, district, education,
 *      marital, religion, income + NID/mobile KPIs), split by key population.
 *
 * There is no verification queue: baseline is a CIPRB-run research survey, so
 * submissions auto-approve at ingest and there is nothing for a manager to sign
 * off. The /baseline/verification/ endpoints still exist but are unused here.
 *
 * Endpoints (CIPRB-scoped):
 *   GET  /baseline/responses/monitoring/    fieldwork + data quality
 *   GET  /baseline/responses/srhr/          SRHR indicators by module
 *   GET  /baseline/responses/insights/      chart aggregation
 *   GET  /baseline/responses/export/        CSV of every response
 */
import { useMemo, useState } from 'react'
import {
  ShieldCheck, Download, MapPin, CreditCard, Smartphone, CalendarDays,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { BarBreakdown, DonutBreakdown, ColumnBreakdown, StackedBar } from '@/components/ciprb/IndicatorCharts'
import { FieldworkMonitor, type Monitoring } from '@/components/baseline/FieldworkMonitor'
import { FswAnomalyConsole } from '@/components/baseline/FswAnomalyConsole'
import { SrhrIndicators, type Srhr } from '@/components/baseline/SrhrIndicators'

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

const POP_LABEL: Record<string, string> = {
  hijra: 'Hijra / Gender-diverse',
  fsw: 'Female Sex Worker',
}

/** Collapse whitespace and spaces around a slash so near-identical category
 *  labels ("SSC/Dakhil" vs "SSC / Dakhil") merge into one bar instead of two. */
function normName(name: string): string {
  return (name || '').replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim()
}

// The raw education codes sprawl into ~13 near-duplicate rows ("Class 5–7" vs
// "Grades 5–7", "Bachelor's" vs "Master's"). Fold them into clean ordinal bands
// so the chart reads as an attainment distribution, not a messy code list.
const EDU_BANDS: { match: RegExp; label: string }[] = [
  { match: /no formal|no education|never|illiterate/i, label: 'No formal education' },
  { match: /(^|[^0-9])1\s*[–-]\s*4/i, label: 'Class 1–4' },
  { match: /5\s*[–-]\s*7/i, label: 'Class 5–7' },
  { match: /8\s*[–-]\s*9/i, label: 'Class 8–9' },
  { match: /ssc|dakhil/i, label: 'SSC / Dakhil' },
  { match: /hsc|alim|higher secondary/i, label: 'HSC / Alim' },
  { match: /bachelor|master|honours|graduate|post-?grad|degree/i, label: 'Higher (Bachelor+)' },
  { match: /vocation|technical|trade|diploma/i, label: 'Vocational / technical' },
  { match: /madrasa|qawmi|ebtedayee/i, label: 'Madrasa / other' },
]
const EDU_ORDER = ['No formal education', 'Class 1–4', 'Class 5–7', 'Class 8–9',
  'SSC / Dakhil', 'HSC / Alim', 'Vocational / technical', 'Higher (Bachelor+)', 'Madrasa / other']
function bandEducation(rec: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const [k, v] of Object.entries(rec)) {
    const band = EDU_BANDS.find((b) => b.match.test(k))?.label || 'Other'
    merged[band] = (merged[band] || 0) + v
  }
  const out: Record<string, number> = {}
  for (const b of EDU_ORDER) if (merged[b]) out[b] = merged[b]
  if (merged['Other']) out['Other'] = merged['Other']
  return out
}

/** array[{name,value}] -> Record<name, value>; 'all' merges both pops by name. */
function toRecord(dim: PopDim | undefined, lens: Lens): Record<string, number> {
  if (!dim) return {}
  const src = lens === 'all' ? [...dim.hijra, ...dim.fsw] : dim[lens] || []
  const out: Record<string, number> = {}
  for (const b of src) {
    const k = normName(b.name)
    out[k] = (out[k] || 0) + b.value
  }
  return out
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
  const { data: insights } = usePolling<Insights>({
    fetcher: () => api.get('/baseline/responses/insights/').then((r) => r.data),
    interval: 60_000,
  })
  const { data: monitoring } = usePolling<Monitoring>({
    fetcher: () => api.get('/baseline/responses/monitoring/').then((r) => r.data),
    interval: 30_000,
  })
  const { data: srhr } = usePolling<Srhr>({
    fetcher: () => api.get('/baseline/responses/srhr/').then((r) => r.data),
    interval: 60_000,
  })
  const [lens, setLens] = useState<Lens>('all')
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)

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
          <span className="figure" style={{ color: 'var(--unfpa)' }}>Baseline</span> Monitoring Dashboard.
        </h1>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 720, marginTop: 14 }}>
          Live monitoring of the Hijra and Female Sex Worker baseline collection: how many interviews come
          in each day, from which sites and enumerators, at what quality — then the population profile as it
          builds, module by module.
        </p>
      </section>

      {/* ── Fieldwork Command Center — the collection monitor ─────────────── */}
      <section className="section" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div className="kicker"><span className="dot" /> Fieldwork command center · every collected interview</div>
          <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={exportCsv} disabled={exporting}>
            {exporting ? <LoadingSpinner size="sm" /> : <Download size={14} />} Export CSV
          </button>
        </div>
        {monitoring
          ? <FieldworkMonitor m={monitoring} />
          : <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>Loading collection monitor…</div>}
      </section>

      {err && (
        <section className="section" style={{ marginTop: 12 }}>
          <div className="card" style={{ background: 'rgba(233,69,96,0.06)', borderColor: 'rgba(233,69,96,0.2)', color: 'var(--rose)', padding: '10px 14px', fontSize: 13 }}>{err}</div>
        </section>
      )}

      {/* ── FSW anomaly console — deterministic data-quality rule engine ──── */}
      <section className="section" style={{ marginTop: 30 }}>
        <div className="kicker" style={{ marginBottom: 12 }}><span className="dot" /> FSW data-quality console · anomaly detection &amp; review</div>
        <FswAnomalyConsole />
      </section>

      {/* ── Major SRHR indicators, by questionnaire module ────────────────── */}
      {srhr && <SrhrIndicators data={srhr} />}

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

            {/* Chart grid — a deliberate mix of four distinct shapes so no two
                neighbouring cards read as the same visual: vertical columns for
                ordered bands, ranked horizontal bars for the many-category
                dimensions, solid pies for the few-category splits, and a 100%
                stacked bar. Every card carries counts + percentages. */}
            {/* Feature row: age + income stacked in a narrow left column so the
                marital pie (long, many-category legend) gets a wide slot to
                breathe beside them. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 300px', minWidth: 280 }}>
                <div><ColumnBreakdown title="Age distribution" kicker="Completed age (years)" data={toRecord(insights?.age_band, lens)} /></div>
                <div><ColumnBreakdown title="Monthly income" kicker="Taka per month (banded)" data={toRecord(insights?.income_band, lens)} /></div>
              </div>
              <div style={{ flex: '1.6 1 360px', minWidth: 320, display: 'flex' }}>
                <DonutBreakdown title="Marital / partnership status" kicker="Current status" data={toRecord(insights?.marital, lens)} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
              <BarBreakdown title="Highest education" kicker="Educational attainment" data={bandEducation(toRecord(insights?.education, lens))} ordered />
              <StackedBar title="Religion" kicker="Reported religion" data={toRecord(insights?.religion, lens)} />
              {lens === 'all' && (
                <DonutBreakdown title="Population reached" kicker="Key population split"
                  data={Object.fromEntries((insights?.population ?? []).map((p) => [normName(p.name), p.value]))} />
              )}
            </div>
          </>
        )}
      </section>

      <div style={{ marginBottom: 80 }} />
    </>
  )
}

/** Full interview answers, grouped by questionnaire section, in plain language. */
