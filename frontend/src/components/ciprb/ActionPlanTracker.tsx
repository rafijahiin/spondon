import { useEffect, useState } from 'react'
import { AlertTriangle, ListChecks } from 'lucide-react'
import { api } from '@/api/client'
import { SourceChip } from '@/components/ui/SourceChip'

const CIPRB_ORANGE = '#F96000'

// ── Types mirror /api/mpdsr/action-aggregates/ ──────────────────────────────
interface LiveAction {
  action_id: string
  district: string
  section_label: string
  sub_category: string
  activity: string
  responsible: string
  timeline: string | null
  status: string
  status_label: string
  completion_pct: number
  completion_date: string | null
  is_overdue: boolean
}
interface Rollup { key: string; pct: number; n: number }
interface StatusRow { status: string; label: string; count: number }
interface ActionAggregates {
  overall_pct: number
  total: number
  overdue: number
  by_status: StatusRow[]
  by_district: Rollup[]
  by_section: Rollup[]
  actions: LiveAction[]
}

// Completion-health colour: green ≥75, amber 40-74, red <40 (matches the rest
// of the CIPRB dashboard).
const compColor = (pct: number) => (pct >= 75 ? '#16785F' : pct >= 40 ? '#AE4300' : '#E5103F')

// Per-status palette for the breakdown bar (solid segments, no donut).
const STATUS_COLOR: Record<string, string> = {
  implemented: '#16785F',
  in_progress: '#2563EB',
  pending: '#94A3B8',
  delayed: '#AE4300',
  dropped: '#64748B',
}

function Bars({ rows }: { rows: Rollup[] }) {
  if (!rows.length) return <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>—</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140, fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right', flexShrink: 0 }}>
            {r.key} <span style={{ color: 'var(--muted)' }}>({r.n})</span>
          </div>
          <div style={{ flex: 1, height: 16, background: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${r.pct}%`, height: '100%', background: compColor(r.pct), transition: 'width .4s ease' }} />
          </div>
          <div style={{ width: 42, fontSize: 12.5, fontWeight: 700, color: compColor(r.pct), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {r.pct}%
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusBreakdown({ rows, total }: { rows: StatusRow[]; total: number }) {
  const shown = rows.filter((r) => r.count > 0)
  if (!total) return null
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>
        STATUS MIX
      </div>
      <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', background: 'rgba(0,0,0,0.05)' }}>
        {shown.map((r) => (
          <div
            key={r.status}
            title={`${r.label}: ${r.count}`}
            style={{ width: `${(r.count / total) * 100}%`, background: STATUS_COLOR[r.status] ?? '#94A3B8' }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10 }}>
        {shown.map((r) => (
          <div key={r.status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: STATUS_COLOR[r.status] ?? '#94A3B8' }} />
            <span style={{ color: 'var(--ink-2)' }}>{r.label}</span>
            <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ActionPlanTracker({ districts }: { districts?: readonly string[] | null }) {
  const [data, setData] = useState<ActionAggregates | null>(null)
  const [loading, setLoading] = useState(true)
  const districtsKey = districts && districts.length ? districts.join(',') : ''

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params: Record<string, string> = {}
    if (districtsKey) params.districts = districtsKey
    api
      .get<ActionAggregates>('/mpdsr/action-aggregates/', { params })
      .then((res) => { if (!cancelled) { setData(res.data); setLoading(false) } })
      .catch(() => { if (!cancelled) { setData(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [districtsKey])

  const header = (
    <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <div>
        <div className="kicker">
          <span className="dot" style={{ background: CIPRB_ORANGE }} />
          MPDSR RESPONSE PLAN · IMPLEMENTATION TRACKER
        </div>
        <h2 className="section-title" style={{ margin: '6px 0 2px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ListChecks size={20} style={{ color: CIPRB_ORANGE }} />
          Are the agreed actions getting done?
        </h2>
        <p className="section-sub" style={{ margin: 0 }}>
          Every action a district committee agrees in CIPRB-10 is tracked by its own ID; completion advances as they update it.
        </p>
      </div>
      <SourceChip>CIPRB 10 — Action Plan (live)</SourceChip>
    </div>
  )

  if (loading) {
    return (
      <div>
        {header}
        <div className="card" style={{ padding: '30px 22px', textAlign: 'center', fontSize: 13.5, color: 'var(--muted)' }}>
          Loading action plan…
        </div>
      </div>
    )
  }

  if (!data || data.total === 0) {
    return (
      <div>
        {header}
        <div className="card" style={{ padding: '30px 22px', textAlign: 'center', fontSize: 13.5, color: 'var(--muted)' }}>
          No approved response-plan actions yet — each agreed action appears here with its completion % as committees
          submit and CIPRB approves them via Form 10 (CIPRB-10).
        </div>
      </div>
    )
  }

  const { overall_pct, total, overdue, by_status, by_district, by_section, actions } = data

  return (
    <div>
      {header}

      {/* Headline band — cumulative completion + counts */}
      <div className="card" style={{ padding: '18px 24px', marginBottom: 14, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 22, alignItems: 'center', borderLeft: `5px solid ${compColor(overall_pct)}` }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
            CUMULATIVE COMPLETION
          </div>
          <div style={{ fontSize: 46, fontWeight: 800, color: compColor(overall_pct), fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {overall_pct}%
          </div>
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>actions tracked</div>
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: overdue > 0 ? '#E5103F' : 'var(--ink)', fontVariantNumeric: 'tabular-nums', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {overdue > 0 && <AlertTriangle size={20} />}{overdue}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>overdue</div>
          </div>
        </div>
        <div style={{ minWidth: 220, maxWidth: 320 }}>
          <StatusBreakdown rows={by_status} total={total} />
        </div>
      </div>

      {/* By district + by section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 12 }}>BY DISTRICT</div>
          <Bars rows={by_district} />
        </div>
        <div className="card" style={{ padding: '14px 18px' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 12 }}>BY SECTION</div>
          <Bars rows={by_section} />
        </div>
      </div>

      {/* Per-action table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>ID</th>
              <th>District</th>
              <th>Action</th>
              <th style={{ width: 170 }}>Completion</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.action_id} style={a.is_overdue ? { background: 'rgba(229,16,63,0.05)' } : undefined}>
                <td style={{ fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{a.action_id}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{a.district}</td>
                <td style={{ maxWidth: 320 }}>
                  {a.activity}
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {a.section_label}{a.timeline ? ` · due ${a.timeline}` : ''}{a.responsible ? ` · ${a.responsible}` : ''}
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 10, background: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${a.completion_pct}%`, height: '100%', background: compColor(a.completion_pct) }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: compColor(a.completion_pct), fontVariantNumeric: 'tabular-nums', width: 34, textAlign: 'right' }}>
                      {a.completion_pct}%
                    </span>
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {a.is_overdue
                    ? <span style={{ color: '#E5103F', fontWeight: 700 }}>Overdue</span>
                    : <span>{a.status_label}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
