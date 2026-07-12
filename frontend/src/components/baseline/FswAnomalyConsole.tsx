/**
 * FSW anomaly console.
 *
 * Renders the deterministic rule-engine report (GET /baseline/fsw-anomalies/):
 * severity KPI cards, filters, an evidence-bearing table, and a review drawer
 * where each flag can be Confirmed / Corrected / marked a False positive. Review
 * decisions POST to /fsw-anomalies/review/ and are stored in a separate audit
 * table — raw Kobo data is never touched. Mirrors frontend_contract.md.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  AlertOctagon, AlertTriangle, Info, ShieldCheck, Clock, RefreshCw,
  X, Check, PencilLine, Ban, Search,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'

type Sev = 'critical' | 'high' | 'medium' | 'low'
type ReviewStatus = 'new' | 'confirmed' | 'corrected' | 'false_positive'

interface Anomaly {
  rule_id: string
  severity: Sev
  category: string
  message: string
  record_id: string | null
  enumerator: string | null
  row_number: number | null
  fields: string[]
  observed: unknown
  expected: unknown
  action: string | null
  review_status: ReviewStatus
  review_note: string
  reviewed_by: string | null
  reviewed_at: string | null
}
interface Report {
  records_scanned: number
  anomaly_count: number
  risk_score: number
  current_version: string | null
  summary: { by_severity: Record<Sev, number>; by_category: Record<string, number>; top_rules: Record<string, number> }
  enumerators: Record<string, Record<Sev, number>>
  anomalies: Anomaly[]
  kpis: {
    critical: number; high: number; medium: number; low: number
    records_requiring_review: number; records_cleared: number
    timing_completeness_pct: number; current_form_adoption_pct: number
  }
}

const SEV_TONE: Record<Sev, string> = {
  critical: '#E5484D', high: '#F5820B', medium: '#C08A00', low: '#0E8F8F',
}
const SEV_ICON: Record<Sev, React.ReactNode> = {
  critical: <AlertOctagon size={14} />, high: <AlertTriangle size={14} />,
  medium: <Info size={14} />, low: <Info size={14} />,
}
const STATUS_LABEL: Record<ReviewStatus, string> = {
  new: 'New', confirmed: 'Confirmed', corrected: 'Corrected', false_positive: 'False positive',
}
const STATUS_TONE: Record<ReviewStatus, string> = {
  new: 'var(--muted)', confirmed: '#E5484D', corrected: '#0E8F8F', false_positive: '#7A7F87',
}

const humanRule = (id: string) =>
  id.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const fmtVal = (v: unknown) =>
  v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/* KPI card */
function Kpi({ icon, value, label, tone, suffix }: { icon: React.ReactNode; value: number | string; label: string; tone: string; suffix?: string }) {
  return (
    <div className="card snug" style={{ flex: '1 1 150px', minWidth: 142, borderTop: `3px solid ${tone}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: tone }}>
        {icon}<span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontFamily: 'var(--display)', fontStyle: 'normal', fontSize: 30, lineHeight: 1.05, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>
        {value}{suffix && <span style={{ fontSize: 15, color: 'var(--muted)' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function Pill({ on, tone, onClick, children }: { on: boolean; tone?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="pill" style={{
      borderColor: on ? (tone || 'var(--unfpa)') : 'var(--hair)',
      background: on ? (tone || 'var(--unfpa)') : 'transparent',
      color: on ? '#fff' : 'var(--muted)', fontWeight: on ? 700 : 500,
    }}>{children}</button>
  )
}

export function FswAnomalyConsole() {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [sev, setSev] = useState<Sev | 'all'>('all')
  const [status, setStatus] = useState<ReviewStatus | 'all'>('all')
  const [enumerator, setEnumerator] = useState('')
  const [rule, setRule] = useState('')
  const [q, setQ] = useState('')
  const [active, setActive] = useState<Anomaly | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const r = await api.get<Report>('/baseline/fsw-anomalies/')
      setReport(r.data)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not load the anomaly report.'))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const anomalies = report?.anomalies ?? []
  const enumerators = useMemo(
    () => Array.from(new Set(anomalies.map((a) => a.enumerator).filter(Boolean))).sort() as string[],
    [anomalies])
  const rules = useMemo(
    () => Array.from(new Set(anomalies.map((a) => a.rule_id))).sort(), [anomalies])

  const filtered = useMemo(() => anomalies.filter((a) =>
    (sev === 'all' || a.severity === sev) &&
    (status === 'all' || a.review_status === status) &&
    (!enumerator || a.enumerator === enumerator) &&
    (!rule || a.rule_id === rule) &&
    (!q || (a.message + a.rule_id + (a.record_id || '') + (a.enumerator || '')).toLowerCase().includes(q.toLowerCase()))
  ), [anomalies, sev, status, enumerator, rule, q])

  async function review(a: Anomaly, newStatus: ReviewStatus) {
    setSaving(true); setErr('')
    try {
      await api.post('/baseline/fsw-anomalies/review/', {
        submission_id: a.record_id, rule_id: a.rule_id, status: newStatus, note,
      })
      await load()
      setActive((prev) => prev ? { ...prev, review_status: newStatus, review_note: note } : prev)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not save the review.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>Scanning FSW submissions…</div>
  if (!report) return <div className="card" style={{ padding: 20, color: 'var(--rose)' }}>{err || 'No report.'}</div>

  const k = report.kpis
  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Kpi icon={<AlertOctagon size={14} />} value={k.critical} label="Critical" tone={SEV_TONE.critical} />
        <Kpi icon={<AlertTriangle size={14} />} value={k.high} label="High" tone={SEV_TONE.high} />
        <Kpi icon={<Info size={14} />} value={k.medium} label="Medium" tone={SEV_TONE.medium} />
        <Kpi icon={<PencilLine size={14} />} value={k.records_requiring_review} label="Need review" tone="#6E56CF" />
        <Kpi icon={<ShieldCheck size={14} />} value={k.records_cleared} label="Cleared" tone="#0E8F8F" />
        <Kpi icon={<Clock size={14} />} value={k.timing_completeness_pct} suffix="%" label="Timing complete" tone={k.timing_completeness_pct >= 80 ? '#0E8F8F' : '#F5820B'} />
        <Kpi icon={<RefreshCw size={14} />} value={k.current_form_adoption_pct} suffix="%" label="Current form" tone={k.current_form_adoption_pct >= 80 ? '#0E8F8F' : '#F5820B'} />
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--muted)', margin: '10px 2px 0' }}>
        {report.records_scanned} FSW interviews scanned · {report.anomaly_count} flags · risk {report.risk_score}/100
        {report.current_version && <> · current form <span className="mono">{report.current_version}</span></>}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '14px 0' }}>
        <div className="pills">
          <Pill on={sev === 'all'} onClick={() => setSev('all')}>All</Pill>
          {(['critical', 'high', 'medium', 'low'] as Sev[]).map((s) => (
            <Pill key={s} on={sev === s} tone={SEV_TONE[s]} onClick={() => setSev(s)}>
              {s[0].toUpperCase() + s.slice(1)} · {report.summary.by_severity[s]}
            </Pill>
          ))}
        </div>
        <span style={{ width: 1, height: 20, background: 'var(--hair)' }} />
        <div className="pills">
          <Pill on={status === 'all'} onClick={() => setStatus('all')}>Any status</Pill>
          {(['new', 'confirmed', 'corrected', 'false_positive'] as ReviewStatus[]).map((s) => (
            <Pill key={s} on={status === s} tone={STATUS_TONE[s]} onClick={() => setStatus(s)}>{STATUS_LABEL[s]}</Pill>
          ))}
        </div>
        <select value={enumerator} onChange={(e) => setEnumerator(e.target.value)} className="input" style={{ height: 30, fontSize: 12, minWidth: 150 }}>
          <option value="">All enumerators</option>
          {enumerators.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={rule} onChange={(e) => setRule(e.target.value)} className="input" style={{ height: 30, fontSize: 12, minWidth: 170 }}>
          <option value="">All rules</option>
          {rules.map((r) => <option key={r} value={r}>{humanRule(r)}</option>)}
        </select>
        <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 150 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: 9, color: 'var(--muted)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input" style={{ height: 30, fontSize: 12, paddingLeft: 28, width: '100%' }} />
        </div>
      </div>

      {err && <div className="card" style={{ background: 'rgba(233,69,96,0.06)', borderColor: 'rgba(233,69,96,0.2)', color: 'var(--rose)', padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>{err}</div>}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {['Severity', 'Rule', 'Enumerator', 'Observed', 'Action', 'Review', ''].map((h) => (
                  <th key={h} style={{ padding: '9px 12px', borderBottom: '1px solid var(--hair)', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((a, i) => (
                <tr key={`${a.record_id}-${a.rule_id}-${i}`} onClick={() => { setActive(a); setNote(a.review_note || '') }}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--hair)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover, rgba(0,0,0,0.02))')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: SEV_TONE[a.severity], fontWeight: 700, fontSize: 11.5 }}>{SEV_ICON[a.severity]}{a.severity}</span>
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--ink)', fontWeight: 600 }}>{humanRule(a.rule_id)}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>{a.enumerator || '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtVal(a.observed)}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_TONE[a.review_status] }}>{STATUS_LABEL[a.review_status]}</span>
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--muted)' }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No anomalies match these filters.</div>}
        {filtered.length > 400 && <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--hair)' }}>Showing first 400 of {filtered.length}. Narrow the filters to see the rest.</div>}
      </div>

      {/* Detail drawer */}
      {active && (
        <div onClick={() => setActive(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', height: '100%', background: 'var(--surface, #fff)', boxShadow: '-8px 0 30px rgba(0,0,0,0.18)', overflowY: 'auto', padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: SEV_TONE[active.severity], fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>{SEV_ICON[active.severity]}{active.severity} · {active.category}</span>
              <button onClick={() => setActive(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: '8px 0 4px' }}>{humanRule(active.rule_id)}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 14px' }}>{active.message}</p>

            {[
              ['Record', active.record_id],
              ['Enumerator', active.enumerator],
              ['Fields checked', active.fields?.join(', ')],
              ['Observed', fmtVal(active.observed)],
              ['Expected', fmtVal(active.expected)],
              ['Recommended action', active.action],
            ].map(([label, val]) => val ? (
              <div key={label as string} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: '1px solid var(--hair)', fontSize: 12.5 }}>
                <span style={{ width: 130, flexShrink: 0, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
                <span style={{ color: 'var(--ink)', wordBreak: 'break-word' }}>{val}</span>
              </div>
            ) : null)}

            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>
                Review · currently <span style={{ color: STATUS_TONE[active.review_status] }}>{STATUS_LABEL[active.review_status]}</span>
                {active.reviewed_by && <span style={{ fontWeight: 500 }}> by {active.reviewed_by}</span>}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional): what you checked, what you found…"
                className="input" style={{ width: '100%', minHeight: 64, fontSize: 12.5, padding: 9, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button disabled={saving} onClick={() => review(active, 'confirmed')} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E5484D', color: '#fff', borderColor: '#E5484D' }}><Check size={14} />Confirm</button>
                <button disabled={saving} onClick={() => review(active, 'corrected')} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PencilLine size={14} />Corrected</button>
                <button disabled={saving} onClick={() => review(active, 'false_positive')} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ban size={14} />False positive</button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                Corrections are made in KoboToolbox. This only records your verdict — the raw survey data is never edited here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
