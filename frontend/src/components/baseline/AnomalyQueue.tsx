/**
 * Data quality & anomalies — three components, per the redesign spec:
 *   A. compact anomaly KPI row (flag counts kept separate from unique-interview
 *      counts on purpose — one record with five problems is five flags),
 *   B. priority anomaly rules (click → filters the queue),
 *   C. fixed-height, paginated review queue with a side drawer.
 *
 * Review decisions POST to /baseline/fsw-anomalies/review/ and live in a
 * separate audit table — raw Kobo responses are never edited here.
 */
import { useMemo, useState } from 'react'
import {
  AlertOctagon, AlertTriangle, Info, PencilLine, ShieldCheck, X, Check, Ban,
  Search, ChevronLeft, ChevronRight, MapPinned,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'

export type Sev = 'critical' | 'high' | 'medium' | 'low'
type ReviewStatus = 'new' | 'confirmed' | 'corrected' | 'false_positive' | 'needs_verification'

export interface Anomaly {
  rule_id: string
  severity: Sev
  category: string
  message: string
  record_id: string | null
  enumerator: string | null
  site: string
  date: string
  population: string
  fields: string[]
  observed: unknown
  expected: unknown
  action: string | null
  review_status: ReviewStatus
  review_note: string
  reviewed_by: string | null
  reviewed_at: string | null
}
export interface AnomalyReport {
  records_scanned: number
  anomaly_count: number
  current_version: Record<string, string | null>
  summary: { by_severity: Record<Sev, number>; top_rules: Record<string, number> }
  kpis: {
    critical: number; high: number; medium: number; low: number
    interviews_affected: number; flags_reviewed: number; flags_total: number
  }
  anomalies: Anomaly[]
}

const SEV_TONE: Record<Sev, string> = {
  critical: '#8E1B1B', high: '#E5484D', medium: '#C08A00', low: '#7A7F87',
}
const SEV_ICON: Record<Sev, React.ReactNode> = {
  critical: <AlertOctagon size={13} />, high: <AlertTriangle size={13} />,
  medium: <Info size={13} />, low: <Info size={13} />,
}
const STATUS_LABEL: Record<ReviewStatus, string> = {
  new: 'New', confirmed: 'Confirmed', corrected: 'Corrected',
  false_positive: 'False positive', needs_verification: 'Needs verification',
}
const STATUS_TONE: Record<ReviewStatus, string> = {
  new: 'var(--muted)', confirmed: '#E5484D', corrected: '#0E8F8F',
  false_positive: '#7A7F87', needs_verification: '#C08A00',
}
const PAGE_SIZE = 20

const humanRule = (id: string) =>
  id.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const fmtVal = (v: unknown) =>
  v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)

function MiniKpi({ label, value, tone, onClick, active, sub }: {
  label: string; value: React.ReactNode; tone: string
  onClick?: () => void; active?: boolean; sub?: string
}) {
  return (
    <button onClick={onClick} disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      style={{
        flex: '1 1 120px', minWidth: 112, textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
        background: active ? 'rgba(249,96,0,0.05)' : 'var(--surface)',
        border: `1px solid ${active ? tone : 'var(--hair)'}`, borderRadius: 10, padding: '9px 11px',
      }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: tone }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{sub}</div>}
    </button>
  )
}

export function AnomalyQueue({ report, severity, onSeverity, onReviewSaved }: {
  report: AnomalyReport | null
  severity: '' | Sev
  onSeverity: (s: '' | Sev) => void
  onReviewSaved: () => void
}) {
  const [rule, setRule] = useState('')
  const [reviewStatus, setReviewStatus] = useState<'' | ReviewStatus>('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [active, setActive] = useState<Anomaly | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const anomalies = report?.anomalies ?? []

  /* B — priority rules, over the server-filtered set (before local queue filters) */
  const priorityRules = useMemo(() => {
    const groups: Record<string, { severity: Sev; records: Set<string>; enums: Set<string>; action: string }> = {}
    const rank: Record<Sev, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    for (const a of anomalies) {
      const g = (groups[a.rule_id] ??= { severity: a.severity, records: new Set(), enums: new Set(), action: a.action || '' })
      if (rank[a.severity] > rank[g.severity]) g.severity = a.severity
      if (a.record_id) g.records.add(a.record_id)
      if (a.enumerator) g.enums.add(a.enumerator)
    }
    return Object.entries(groups)
      .map(([id, g]) => ({ id, ...g, affected: g.records.size || 0 }))
      .sort((a, b) => rank[b.severity] - rank[a.severity] || b.affected - a.affected)
      .slice(0, 6)
  }, [anomalies])

  /* C — queue rows after local filters */
  const rows = useMemo(() => anomalies.filter((a) =>
    (!rule || a.rule_id === rule) &&
    (!reviewStatus || a.review_status === reviewStatus) &&
    (!q || (a.rule_id + ' ' + a.message + ' ' + (a.record_id || '') + ' ' + (a.enumerator || ''))
      .toLowerCase().includes(q.toLowerCase()))
  ), [anomalies, rule, reviewStatus, q])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const setLocal = (fn: () => void) => { fn(); setPage(0) }

  async function review(a: Anomaly, status: ReviewStatus) {
    setSaving(true); setErr('')
    try {
      await api.post('/baseline/fsw-anomalies/review/', {
        submission_id: a.record_id, rule_id: a.rule_id, status, note,
      })
      setActive((prev) => prev ? { ...prev, review_status: status, review_note: note } : prev)
      onReviewSaved()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not save the review.'))
    } finally {
      setSaving(false)
    }
  }

  if (!report) {
    return <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--muted)' }}>Scanning for anomalies…</div>
  }
  const k = report.kpis

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>Data quality &amp; anomalies</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          {k.flags_total.toLocaleString()} flags across {k.interviews_affected.toLocaleString()} interviews
          (of {report.records_scanned.toLocaleString()} scanned) — severity cards count flags, not interviews
        </div>
      </div>

      {/* A — compact KPI row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <MiniKpi label="Critical" value={k.critical} tone={SEV_TONE.critical}
          active={severity === 'critical'} onClick={() => onSeverity(severity === 'critical' ? '' : 'critical')} sub="flags" />
        <MiniKpi label="High" value={k.high} tone={SEV_TONE.high}
          active={severity === 'high'} onClick={() => onSeverity(severity === 'high' ? '' : 'high')} sub="flags" />
        <MiniKpi label="Medium" value={k.medium} tone={SEV_TONE.medium}
          active={severity === 'medium'} onClick={() => onSeverity(severity === 'medium' ? '' : 'medium')} sub="flags" />
        <MiniKpi label="Interviews affected" value={k.interviews_affected} tone="#6E56CF"
          sub="unique records" />
        <MiniKpi label="Flags reviewed" value={`${k.flags_reviewed}/${k.flags_total}`} tone="#0E8F8F"
          sub="decisions recorded" />
      </div>

      {/* B — priority rules */}
      {priorityRules.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>
            Priority anomaly rules · click to filter the queue
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {priorityRules.map((r) => (
              <button key={r.id} onClick={() => setLocal(() => setRule(rule === r.id ? '' : r.id))}
                title={r.action}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', textAlign: 'left',
                         background: rule === r.id ? 'rgba(249,96,0,0.06)' : 'transparent',
                         border: 'none', borderTop: '1px solid var(--hair)', cursor: 'pointer', fontSize: 12.5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: SEV_TONE[r.severity], fontWeight: 700, width: 76, fontSize: 11 }}>
                  {SEV_ICON[r.severity]}{r.severity}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--ink)', flex: '1 1 200px' }}>{humanRule(r.id)}</span>
                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', width: 110, textAlign: 'right' }}>{r.affected} interviews</span>
                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', width: 100, textAlign: 'right' }}>{r.enums.size} enumerator{r.enums.size === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* C — review queue */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '14px 0 8px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 9, color: 'var(--muted)' }} />
          <input aria-label="Search anomalies" value={q}
            onChange={(e) => setLocal(() => setQ(e.target.value))}
            placeholder="Search rule / submission / enumerator…"
            style={{ height: 30, fontSize: 12, padding: '0 8px 0 26px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', width: 230 }} />
        </div>
        <select aria-label="Filter by rule" value={rule}
          onChange={(e) => setLocal(() => setRule(e.target.value))}
          style={{ height: 30, fontSize: 12, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', maxWidth: 200 }}>
          <option value="">All rules</option>
          {Object.keys(report.summary.top_rules).map((r) => <option key={r} value={r}>{humanRule(r)}</option>)}
        </select>
        <select aria-label="Filter by review status" value={reviewStatus}
          onChange={(e) => setLocal(() => setReviewStatus(e.target.value as '' | ReviewStatus))}
          style={{ height: 30, fontSize: 12, borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)' }}>
          <option value="">Any review status</option>
          {(Object.keys(STATUS_LABEL) as ReviewStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{rows.length.toLocaleString()} flags</span>
      </div>

      {err && <div style={{ color: 'var(--rose)', fontSize: 12, marginBottom: 8 }}>{err}</div>}

      <div style={{ maxHeight: 560, overflow: 'auto', border: '1px solid var(--hair)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
              {['Severity', 'Anomaly', 'Submission', 'Enumerator', 'Site', 'Observed', 'Action', 'Review'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', borderBottom: '1px solid var(--hair)', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((a, i) => (
              <tr key={`${a.record_id}-${a.rule_id}-${i}`} tabIndex={0} role="button"
                aria-label={`Open ${humanRule(a.rule_id)}`}
                onClick={() => { setActive(a); setNote(a.review_note || '') }}
                onKeyDown={(e) => e.key === 'Enter' && (setActive(a), setNote(a.review_note || ''))}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--hair)' }}>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: SEV_TONE[a.severity], fontWeight: 700, fontSize: 11 }}>{SEV_ICON[a.severity]}{a.severity}</span>
                </td>
                <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--ink)' }}>{humanRule(a.rule_id)}</td>
                <td className="mono" style={{ padding: '7px 10px', fontSize: 10.5, color: 'var(--muted)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.record_id || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--muted)' }}>{a.enumerator || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--muted)' }}>{a.site || '—'}</td>
                <td style={{ padding: '7px 10px', color: 'var(--muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtVal(a.observed)}</td>
                <td style={{ padding: '7px 10px', color: 'var(--muted)', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action || '—'}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: STATUS_TONE[a.review_status] }}>{STATUS_LABEL[a.review_status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12.5 }}>No anomalies match these filters.</div>}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 8, fontSize: 12 }}>
          <button className="pill" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={13} /></button>
          <span style={{ color: 'var(--muted)' }}>Page {page + 1} of {pages}</span>
          <button className="pill" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={13} /></button>
        </div>
      )}

      {/* side drawer */}
      {active && (
        <div onClick={() => setActive(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 120, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Anomaly detail"
            style={{ width: 'min(460px, 100%)', height: '100%', background: 'var(--surface)', boxShadow: '-8px 0 30px rgba(0,0,0,0.18)', overflowY: 'auto', padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: SEV_TONE[active.severity], fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {SEV_ICON[active.severity]}{active.severity} · {active.category}
              </span>
              <button onClick={() => setActive(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: '8px 0 4px' }}>{humanRule(active.rule_id)}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 12px' }}>{active.message}</p>

            {[
              ['Rule ID', active.rule_id],
              ['Submission', active.record_id],
              ['Enumerator', active.enumerator],
              ['Site', active.site],
              ['Interview date', active.date],
              ['Fields checked', active.fields?.join(', ')],
              ['Observed', fmtVal(active.observed)],
              ['Expected', fmtVal(active.expected)],
              ['Recommended action', active.action],
            ].map(([label, val]) => val ? (
              <div key={label as string} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: '1px solid var(--hair)', fontSize: 12.5 }}>
                <span style={{ width: 128, flexShrink: 0, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
                <span style={{ color: 'var(--ink)', wordBreak: 'break-word' }}>{val}</span>
              </div>
            ) : null)}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>
                Review · currently <span style={{ color: STATUS_TONE[active.review_status] }}>{STATUS_LABEL[active.review_status]}</span>
                {active.reviewed_by && <span style={{ fontWeight: 500 }}> by {active.reviewed_by}</span>}
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional): what you checked, what you found…"
                style={{ width: '100%', minHeight: 60, fontSize: 12.5, padding: 9, resize: 'vertical', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button disabled={saving} onClick={() => review(active, 'confirmed')} className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#E5484D', color: '#fff', borderColor: '#E5484D' }}><Check size={14} />Confirm</button>
                <button disabled={saving} onClick={() => review(active, 'corrected')} className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><PencilLine size={14} />Corrected</button>
                <button disabled={saving} onClick={() => review(active, 'false_positive')} className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Ban size={14} />False positive</button>
                <button disabled={saving} onClick={() => review(active, 'needs_verification')} className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPinned size={14} />Needs field verification</button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5, display: 'flex', gap: 6 }}>
                <ShieldCheck size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                Corrections are made in KoboToolbox. This records your verdict only — the raw survey data is never edited here.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
