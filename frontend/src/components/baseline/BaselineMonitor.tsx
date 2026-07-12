/**
 * Baseline Monitoring — the compact upper half of /baseline.
 *
 * One sticky filter bar drives every component here via SERVER-side filters on
 * GET /baseline/responses/monitoring/ and GET /baseline/fsw-anomalies/.
 * Sections: compact header → filters+anchors → 6 overview KPIs → collection
 * progress (one toggleable trend + Interview outcomes) → enumerator table →
 * data quality (AnomalyQueue) → collapsed "More diagnostics".
 *
 * These filters are for THIS monitoring surface only — the SRHR/insights
 * sections below keep their own verified-interview queryset untouched.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Download, RefreshCw, TrendingUp, AlertTriangle,
  CheckCircle2, Search, ChevronDown,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { api, apiErrorMessage } from '@/api/client'
import { BarBreakdown, Histogram } from '@/components/ciprb/IndicatorCharts'
import { AnomalyQueue, type AnomalyReport, type Sev } from './AnomalyQueue'

const ORANGE = '#F96000'
const TEAL = '#0E8F8F'
const AMBER = '#C08A00'
const RED = '#E5484D'

type Pop = 'hijra' | 'fsw'
interface Bucket { name: string; value: number }
interface Collector {
  code: string; n: number; avg_min: number | null
  valid_timing: number; valid_timing_pct: number; median_min: number | null
  completion_pct: number; short: number; long: number; hijra: number; fsw: number
}
export interface Monitoring {
  total: number
  progress: { population: Pop; collected: number; target: number | null; pct: number | null }[]
  outcomes: Bucket[]
  districts: Bucket[]
  sites: Bucket[]
  versions: Bucket[]
  daily: { date: string; hijra: number; fsw: number; total: number }[]
  hourly: { hour: string; hijra: number; fsw: number; total: number }[]
  duration: {
    bands: Bucket[]
    valid_timing_n: number; valid_timing_pct: number
    valid_median_min: number | null; valid_median_n: number
    valid_iqr: (number | null)[]
  }
  collectors: Collector[]
  quality: { gps_pct: number; gps_missing: number; duplicates: number }
}

export interface Filters {
  population: 'all' | Pop
  enumerator: string
  site: string
  version: string
  dateFrom: string
  dateTo: string
  severity: '' | Sev
}
const EMPTY_FILTERS: Filters = {
  population: 'all', enumerator: '', site: '', version: '',
  dateFrom: '', dateTo: '', severity: '',
}

const fmt = (n: number) => n.toLocaleString('en-US')

/* ── small building blocks ────────────────────────────────────────────────── */

const selStyle: React.CSSProperties = {
  height: 34, fontSize: 12.5, padding: '0 8px', borderRadius: 8,
  border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)',
  maxWidth: 170,
}

function Kpi({ label, value, sub, sub2, tone, title }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode
  sub2?: React.ReactNode; tone?: string; title?: string
}) {
  return (
    <div className="card snug" title={title}
      style={{ flex: '1 1 190px', minWidth: 175, borderTop: `3px solid ${tone || 'var(--hair)'}`,
               display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontStyle: 'normal', fontSize: 28, lineHeight: 1.08, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>}
      {sub2 && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub2}</div>}
    </div>
  )
}

function HBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 92, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--hair)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${max ? (100 * value) / max : 0}%`, background: color, borderRadius: 4 }} />
      </span>
      <span style={{ width: 34, textAlign: 'right', fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{fmt(value)}</span>
    </div>
  )
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8, padding: '7px 10px', fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,.12)' }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{label}</div>
      {payload.map((p: any) => <div key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value}</b></div>)}
    </div>
  )
}

/* ── the monitor ──────────────────────────────────────────────────────────── */

export function BaselineMonitor() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [m, setM] = useState<Monitoring | null>(null)
  const [anoms, setAnoms] = useState<AnomalyReport | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [err, setErr] = useState('')
  const [exporting, setExporting] = useState(false)
  const [trendMode, setTrendMode] = useState<'daily' | 'cumulative'>('daily')
  const [enumSearch, setEnumSearch] = useState('')
  const [enumSort, setEnumSort] = useState<'n' | 'flags'>('flags')

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))
  const activeFilterCount = Object.entries(filters)
    .filter(([k, v]) => v && !(k === 'population' && v === 'all')).length

  async function load() {
    setErr('')
    const rec = {
      ...(filters.population !== 'all' && { population: filters.population }),
      ...(filters.enumerator && { enumerator: filters.enumerator }),
      ...(filters.site && { site: filters.site }),
      ...(filters.version && { version: filters.version }),
      ...(filters.dateFrom && { date_from: filters.dateFrom }),
      ...(filters.dateTo && { date_to: filters.dateTo }),
    }
    try {
      const [mon, an] = await Promise.all([
        api.get<Monitoring>('/baseline/responses/monitoring/', { params: rec }),
        api.get<AnomalyReport>('/baseline/fsw-anomalies/', {
          params: { population: filters.population, ...rec,
                    ...(filters.severity && { severity: filters.severity }) },
        }),
      ])
      setM(mon.data)
      setAnoms(an.data)
      setLastSync(new Date())
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load monitoring data.'))
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [JSON.stringify(filters)])

  async function exportCsv() {
    setExporting(true)
    try {
      const r = await api.get('/baseline/responses/export/', {
        responseType: 'blob',
        params: filters.population !== 'all' ? { population: filters.population } : {},
      })
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

  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  /* derived series — adaptive resolution: 1 day -> hourly, <=31 days -> daily,
     <=120 -> weekly, longer -> monthly. Empty periods are not connected. */
  const { trend, trendUnit } = useMemo(() => {
    const daily = m?.daily ?? []
    if (daily.length === 1 && (m?.hourly?.length ?? 0) > 0) {
      return { trend: m!.hourly.map((h) => ({ date: h.hour, hijra: h.hijra, fsw: h.fsw, total: h.total })), trendUnit: 'hourly' as const }
    }
    let series = daily
    if (daily.length > 31) {
      const bucket = (d: string) => {
        if (daily.length > 120) return d.slice(0, 7)                     // month
        const dt = new Date(d + 'T00:00:00')
        dt.setDate(dt.getDate() - dt.getDay())                            // week start
        return dt.toLocaleDateString('sv-SE')
      }
      const agg: Record<string, { date: string; hijra: number; fsw: number; total: number }> = {}
      for (const d of daily) {
        const k = bucket(d.date)
        const g = (agg[k] ??= { date: k, hijra: 0, fsw: 0, total: 0 })
        g.hijra += d.hijra; g.fsw += d.fsw; g.total += d.total
      }
      series = Object.values(agg).sort((a, b) => a.date.localeCompare(b.date))
    }
    if (trendMode === 'cumulative') {
      let h = 0, f = 0
      series = series.map((d) => ({ ...d, hijra: (h += d.hijra), fsw: (f += d.fsw), total: h + f }))
    }
    return { trend: series, trendUnit: daily.length > 120 ? 'monthly' as const : daily.length > 31 ? 'weekly' as const : 'daily' as const }
  }, [m, trendMode])

  const todayIso = new Date().toLocaleDateString('sv-SE')
  const collectedToday = m?.daily.find((d) => d.date === todayIso)?.total ?? 0
  const last7 = useMemo(() => {
    const cut = new Date(); cut.setDate(cut.getDate() - 6)
    const cutIso = cut.toLocaleDateString('sv-SE')
    return (m?.daily ?? []).filter((d) => d.date >= cutIso).reduce((s, d) => s + d.total, 0)
  }, [m])

  /* per-enumerator high/critical flag counts (same filtered scope) */
  const flagsByEnum = useMemo(() => {
    const out: Record<string, { critical: number; high: number; medium: number }> = {}
    for (const a of anoms?.anomalies ?? []) {
      if (!a.enumerator) continue
      const g = (out[a.enumerator] ??= { critical: 0, high: 0, medium: 0 })
      if (a.severity === 'critical') g.critical += 1
      else if (a.severity === 'high') g.high += 1
      else if (a.severity === 'medium') g.medium += 1
    }
    return out
  }, [anoms])

  const enumerators = useMemo(() => {
    const rows = (m?.collectors ?? []).map((c) => {
      const fl = flagsByEnum[c.code] ?? { critical: 0, high: 0, medium: 0 }
      const status: 'urgent' | 'review' | 'good' =
        fl.critical >= 1 || fl.high >= 3 ? 'urgent'
          : fl.high >= 1 || fl.medium >= 1 || c.valid_timing_pct < 50 ? 'review'
            : 'good'
      return { ...c, flags: fl, status }
    })
    const q = enumSearch.trim().toLowerCase()
    const filtered = q ? rows.filter((r) => r.code.toLowerCase().includes(q)) : rows
    return filtered.sort((a, b) => enumSort === 'n'
      ? b.n - a.n
      : (b.flags.critical * 10 + b.flags.high) - (a.flags.critical * 10 + a.flags.high) || b.n - a.n)
  }, [m, flagsByEnum, enumSearch, enumSort])

  // Interviews with at least one HIGH or CRITICAL flag — not "any flag", which
  // would inflate the card (documentation warnings affect most records).
  const affectedHighCrit = useMemo(() => {
    const ids = new Set<string>()
    for (const a of anoms?.anomalies ?? []) {
      if ((a.severity === 'critical' || a.severity === 'high') && a.record_id) ids.add(a.record_id)
    }
    return ids.size
  }, [anoms])

  const target = (m?.progress ?? []).reduce((s, p) => s + (p.target || 0), 0)
  const rangeActive = !!(filters.dateFrom || filters.dateTo)
  const iqr = m?.duration.valid_iqr ?? [null, null]

  const STATUS_STYLE = {
    good: { label: 'Good', color: TEAL, icon: <CheckCircle2 size={12} /> },
    review: { label: 'Review', color: AMBER, icon: <AlertTriangle size={12} /> },
    urgent: { label: 'Urgent', color: RED, icon: <AlertTriangle size={12} /> },
  } as const

  return (
    <div>
      {/* ── 1 · compact header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', padding: '18px 0 12px' }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--unfpa)' }}>
            Baseline Evaluation · Monitoring Dashboard
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(24px, 3vw, 32px)', margin: '4px 0 2px', color: 'var(--ink)' }}>
            Baseline Monitoring Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, maxWidth: 560 }}>
            Fieldwork pace, enumerator performance and data quality for the Hijra and FSW baseline —
            verified results follow in the SRHR section below.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {lastSync && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={12} /> Synced {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="btn" onClick={exportCsv} disabled={exporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* ── sticky filter bar + anchors ────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 'var(--topbar, 56px)', zIndex: 40,
                    background: 'var(--bg, var(--surface))', padding: '8px 0', margin: '0 -2px 14px',
                    borderBottom: '1px solid var(--hair)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select aria-label="Population" style={selStyle} value={filters.population}
            onChange={(e) => set({ population: e.target.value as Filters['population'], enumerator: '', site: '' })}>
            <option value="all">All populations</option>
            <option value="hijra">Hijra / Gender-diverse</option>
            <option value="fsw">Female Sex Worker</option>
          </select>
          <select aria-label="Site" style={selStyle} value={filters.site}
            onChange={(e) => set({ site: e.target.value })}>
            <option value="">All sites</option>
            {(m?.sites ?? []).map((s) => <option key={s.name} value={s.name}>Site {s.name}</option>)}
          </select>
          <select aria-label="Enumerator" style={selStyle} value={filters.enumerator}
            onChange={(e) => set({ enumerator: e.target.value })}>
            <option value="">All enumerators</option>
            {(m?.collectors ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
          <input aria-label="From date" type="date" style={selStyle} value={filters.dateFrom}
            onChange={(e) => set({ dateFrom: e.target.value })} />
          <input aria-label="To date" type="date" style={selStyle} value={filters.dateTo}
            onChange={(e) => set({ dateTo: e.target.value })} />
          <select aria-label="Form version" style={selStyle} value={filters.version}
            onChange={(e) => set({ version: e.target.value })}>
            <option value="">All form versions</option>
            {(m?.versions ?? []).map((v) => <option key={v.name} value={v.name}>{v.name.slice(0, 12)}… ({v.value})</option>)}
          </select>
          <select aria-label="Anomaly severity" style={selStyle} value={filters.severity}
            onChange={(e) => set({ severity: e.target.value as Filters['severity'] })}>
            <option value="">Any severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          {activeFilterCount > 0 && (
            <button className="pill" onClick={() => setFilters(EMPTY_FILTERS)}
              style={{ color: 'var(--rose)', borderColor: 'var(--rose)' }}>
              Reset filters ({activeFilterCount})
            </button>
          )}
          <span style={{ flex: 1 }} />
          <nav aria-label="Sections" className="pills">
            {[['mon-overview', 'Overview'], ['mon-enum', 'Enumerators'],
              ['mon-quality', 'Data quality'], ['srhr', 'SRHR indicators']].map(([id, label]) => (
              <button key={id} className="pill" onClick={() => jump(id)}>{label}</button>
            ))}
          </nav>
        </div>
      </div>

      {err && (
        <div className="card" style={{ background: 'rgba(233,69,96,0.06)', borderColor: 'rgba(233,69,96,0.2)', color: 'var(--rose)', padding: '9px 13px', fontSize: 12.5, marginBottom: 12 }}>{err}</div>
      )}

      {!m ? (
        <div className="card" style={{ padding: 26, textAlign: 'center', color: 'var(--muted)' }}>Loading fieldwork monitor…</div>
      ) : (
        <>
          {/* ── 2 · fieldwork overview: 6 KPI cards ─────────────────────── */}
          <div id="mon-overview" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, scrollMarginTop: 110 }}>
            <Kpi label="Total interviews" tone={ORANGE}
              value={fmt(m.total)}
              sub={<><TrendingUp size={11} style={{ verticalAlign: -1 }} /> {rangeActive
                ? 'within the selected date range'
                : `+${fmt(last7)} in the last 7 days`}</>} />
            {filters.population === 'all' ? (
              <Kpi label="Population breakdown" tone={TEAL}
                value={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 4 }}>
                    {m.progress.map((p) => (
                      <HBar key={p.population} label={p.population === 'hijra' ? 'Hijra' : 'FSW'}
                        value={p.collected} max={Math.max(...m.progress.map((x) => x.collected), 1)}
                        color={p.population === 'hijra' ? ORANGE : TEAL} />
                    ))}
                  </div>
                } />
            ) : (
              /* a one-category "breakdown" is just the total again — show site
                 coverage for the selected population instead */
              <Kpi label="Sites covered" tone={TEAL}
                value={fmt(m.sites.length)}
                sub={m.sites.slice(0, 3).map((sx) => `Site ${sx.name} · ${sx.value}`).join('   ')}
                sub2={m.sites.length > 3 ? `+ ${m.sites.length - 3} more sites` : undefined} />
            )}
            {target ? (
              <Kpi label="Fieldwork completion" tone={ORANGE}
                value={`${Math.round((100 * m.total) / target)}%`}
                sub={`${fmt(m.total)} of ${fmt(target)} target`} />
            ) : (
              /* no target set -> a completion card would duplicate the total;
                 show an operational metric until CIPRB provides one */
              <Kpi label="Active enumerators" tone={ORANGE}
                value={fmt(m.collectors.length)}
                sub="collected during selected period"
                sub2="Target not set — completion % returns once a target exists" />
            )}
            <Kpi label="Valid timing coverage" tone={m.duration.valid_timing_pct >= 80 ? TEAL : AMBER}
              title="Records with a usable start AND in-form end time ÷ all filtered submitted interviews. Missing end times stay in the denominator but are never treated as zero-minute interviews."
              value={`${m.duration.valid_timing_pct}%`}
              sub={`${fmt(m.duration.valid_timing_n)} of ${fmt(m.total)} interviews`} />
            <Kpi label="Median interview" tone="#6E56CF"
              title="Calculated only from interviews with valid timing, after excluding extreme form-left-open durations."
              value={m.duration.valid_median_min != null ? `${m.duration.valid_median_min}m` : '—'}
              sub={iqr[0] != null ? `IQR ${iqr[0]}–${iqr[1]}m` : undefined}
              sub2={`${fmt(m.duration.valid_median_n)} valid interviews`} />
            <Kpi label="High & critical flags" tone={(anoms?.kpis.critical ?? 0) > 0 ? '#8E1B1B' : (anoms?.kpis.high ?? 0) > 0 ? RED : TEAL}
              value={fmt((anoms?.kpis.critical ?? 0) + (anoms?.kpis.high ?? 0))}
              sub={`${fmt(anoms?.kpis.critical ?? 0)} critical · ${fmt(anoms?.kpis.high ?? 0)} high`}
              sub2={`${fmt(affectedHighCrit)} interviews affected`} />
          </div>

          {/* ── 3 · collection progress ─────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <div className="card" style={{ flex: '2 1 460px', minWidth: 320, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Collection trend</div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>Interviews per day</div>
                </div>
                {trend.length > 1 && (
                  <div className="pills">
                    {(['daily', 'cumulative'] as const).map((mode) => (
                      <button key={mode} className={`pill ${trendMode === mode ? 'on' : ''}`}
                        onClick={() => setTrendMode(mode)}>
                        {mode === 'daily'
                          ? (trendUnit === 'hourly' ? 'Hourly' : trendUnit === 'weekly' ? 'Weekly' : trendUnit === 'monthly' ? 'Monthly' : 'Daily')
                          : 'Cumulative'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {trend.length < 2 ? (
                <div style={{ height: 190, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  Not enough data points in this range to draw a trend.
                </div>
              ) : (
              <div style={{ height: 190 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 4, right: 6, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tH" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity={0.4} /><stop offset="100%" stopColor={ORANGE} stopOpacity={0.02} /></linearGradient>
                      <linearGradient id="tF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEAL} stopOpacity={0.35} /><stop offset="100%" stopColor={TEAL} stopOpacity={0.02} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--hair)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(d) => String(d).slice(5)} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} width={34} />
                    <Tooltip content={<ChartTip />} />
                    <Area type="monotone" dataKey="hijra" name="Hijra" stackId="1" stroke={ORANGE} fill="url(#tH)" strokeWidth={2} isAnimationActive={false} />
                    <Area type="monotone" dataKey="fsw" name="FSW" stackId="1" stroke={TEAL} fill="url(#tF)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              )}
            </div>

            <div className="card" style={{ flex: '1 1 250px', minWidth: 240, padding: 16 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>Interview outcomes</div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>How interviews ended</div>
              {(() => {
                const rec: Record<string, number> = Object.fromEntries(m.outcomes.map((o) => [o.name, o.value]))
                const rows = ['Completed', 'Partial', 'Refused', 'Interrupted']
                  .map((name) => ({ name, value: rec[name] ?? 0 }))
                  .filter((o, i) => i < 3 || o.value > 0)
                const nonzero = rows.filter((o) => o.value > 0).length
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {rows.map((o) => nonzero > 1 ? (
                      <HBar key={o.name} label={o.name} value={o.value}
                        max={Math.max(...rows.map((x) => x.value), 1)}
                        color={o.name === 'Completed' ? TEAL : o.name === 'Partial' ? AMBER : 'var(--muted)'} />
                    ) : (
                      /* a single 100% bar carries no information — plain rows */
                      <div key={o.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--muted)' }}>{o.name}</span>
                        <span style={{ fontWeight: 700, color: o.value ? 'var(--ink)' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(o.value)}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--hair)', fontSize: 12.5, color: 'var(--muted)' }}>
                Today: <b style={{ color: 'var(--ink)' }}>{fmt(collectedToday)}</b> · Last 7 days: <b style={{ color: 'var(--ink)' }}>{fmt(last7)}</b>
              </div>
            </div>
          </div>

          {/* ── 4 · enumerator performance ──────────────────────────────── */}
          <div id="mon-enum" className="card" style={{ marginTop: 16, padding: 16, scrollMarginTop: 110 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>Enumerator performance</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Workload, timing completeness and priority data-quality flags — click a row to filter everything to that enumerator</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--muted)' }} />
                  <input aria-label="Search enumerator" value={enumSearch} onChange={(e) => setEnumSearch(e.target.value)}
                    placeholder="Search…" style={{ ...selStyle, paddingLeft: 26, width: 150 }} />
                </div>
                <select aria-label="Sort enumerators" style={selStyle} value={enumSort}
                  onChange={(e) => setEnumSort(e.target.value as 'n' | 'flags')}>
                  <option value="flags">Sort: flags</option>
                  <option value="n">Sort: interviews</option>
                </select>
              </div>
            </div>
            <div style={{ ...(enumerators.length > 10 ? { maxHeight: 460, overflow: 'auto' } : {}), borderTop: '1px solid var(--hair)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                    {['Enumerator', 'Interviews', 'Valid timing', 'Median', 'High / critical', 'Status'].map((h, i) => (
                      <th key={h} style={{ textAlign: i ? 'right' : 'left', padding: '8px 10px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--hair)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enumerators.map((r) => {
                    const st = STATUS_STYLE[r.status]
                    const active = filters.enumerator === r.code
                    return (
                      <tr key={r.code} tabIndex={0} role="button"
                        aria-label={`Filter by ${r.code}`}
                        onClick={() => set({ enumerator: active ? '' : r.code })}
                        onKeyDown={(e) => e.key === 'Enter' && set({ enumerator: active ? '' : r.code })}
                        style={{ cursor: 'pointer', borderBottom: '1px solid var(--hair)',
                                 background: active ? 'rgba(249,96,0,0.06)' : 'transparent' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: 'var(--ink)' }}>
                          {r.code}
                          <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 500, marginLeft: 6 }}>
                            {r.hijra ? `${r.hijra} Hijra` : ''}{r.hijra && r.fsw ? ' · ' : ''}{r.fsw ? `${r.fsw} FSW` : ''}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.n}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                     color: r.valid_timing_pct >= 80 ? TEAL : r.valid_timing_pct >= 50 ? AMBER : RED }}>
                          {r.valid_timing}/{r.n} <span style={{ fontSize: 11.5 }}>· {r.valid_timing_pct}%</span>
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.median_min != null ? `${r.median_min}m` : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                                     color: r.flags.critical + r.flags.high > 0 ? RED : 'var(--muted)', fontWeight: 700 }}>
                          {r.flags.critical + r.flags.high || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <span title={r.status === 'good'
                              ? 'Good — no high-priority flags and acceptable timing completeness'
                              : `${st.label} — ${r.flags.critical + r.flags.high || r.flags.medium} interview flag${(r.flags.critical + r.flags.high || r.flags.medium) === 1 ? '' : 's'}${r.valid_timing_pct < 50 ? ` · valid timing only ${r.valid_timing_pct}%` : ''}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: st.color }}>
                            {st.icon}{st.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!enumerators.length && <div style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>No enumerators match.</div>}
            </div>
          </div>

          {/* ── 5 · data quality & anomalies ────────────────────────────── */}
          <div id="mon-quality" style={{ marginTop: 16, scrollMarginTop: 110 }}>
            <AnomalyQueue
              report={anoms}
              severity={filters.severity}
              onSeverity={(s) => set({ severity: s })}
              onReviewSaved={load}
            />
          </div>

          {/* ── collapsed diagnostics ───────────────────────────────────── */}
          <details className="card" style={{ marginTop: 16, padding: '12px 16px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7, listStyle: 'none' }}>
              <ChevronDown size={15} style={{ color: 'var(--muted)' }} /> More diagnostics
              <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--muted)' }}>
                · duration distribution, districts, GPS {m.quality.gps_pct}%, duplicates {m.quality.duplicates}
              </span>
            </summary>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
              <Histogram kicker="Interview duration" title="Length distribution (valid timing)"
                data={Object.fromEntries(m.duration.bands.map((b) => [b.name, b.value]))} />
              <BarBreakdown kicker="Coverage" title="Interviews by district"
                data={Object.fromEntries(m.districts.map((b) => [b.name, b.value]))} />
            </div>
          </details>
        </>
      )}
    </div>
  )
}
