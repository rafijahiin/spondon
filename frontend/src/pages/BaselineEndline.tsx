/**
 * Baseline studies — CIPRB verification + collection monitoring (D5).
 *
 * The two key-population baseline instruments (Hijra / FSW) are CIPRB-conducted.
 * Each interview lands PENDING and a CIPRB supervisor verifies it here before it
 * counts: review the responses + duplicate flag, then Approve (materialises the
 * record) or Reject. The page also shows headline collection monitoring.
 *
 * Endpoints (CIPRB-scoped, CanVerifyBaseline):
 *   GET  /baseline/verification/            pending queue
 *   POST /baseline/verification/<id>/approve|reject/
 *   GET  /baseline/responses/stats/         headline counts
 *   GET  /baseline/responses/export/        verified CSV
 */
import { useMemo, useState } from 'react'
import {
  ShieldCheck, AlertTriangle, MapPinOff, Download, Check, X,
  ChevronDown, ChevronUp, Inbox,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface PendingItem {
  submission_id: string
  population: 'hijra' | 'fsw' | ''
  serial: string
  district: string
  site_code: string
  age: string | number
  interviewer: string
  submitted_at: string
  gps_missing: boolean
  duplicate_preview: boolean
  raw_data: Record<string, unknown>
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
// Kobo meta + routing fields hidden from the response review.
const HIDE_KEYS = /^(_|formhub|meta|organisation$|population$|survey_round$|start_time$|end$|today$|deviceid$|__version__$)/

function Stat({ label, value, sub, accent }: { label: string; value: number; sub?: string; accent?: string }) {
  return (
    <div className="card snug" style={{ minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 38, lineHeight: 1, color: accent || 'var(--ink)', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function BaselineEndline() {
  const { data: stats, refetch: refetchStats } = usePolling<Stats>({
    fetcher: () => api.get('/baseline/responses/stats/').then((r) => r.data),
    interval: 30_000,
  })
  const { data: pending, loading, refetch: refetchPending } = usePolling<PendingItem[]>({
    fetcher: () => api.get('/baseline/verification/').then((r) =>
      Array.isArray(r.data) ? r.data : (r.data?.results ?? [])),
    interval: 30_000,
  })

  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [popFilter, setPopFilter] = useState<'' | 'hijra' | 'fsw'>('')
  const [exporting, setExporting] = useState(false)

  const items = useMemo(
    () => (pending ?? []).filter((p) => !popFilter || p.population === popFilter),
    [pending, popFilter],
  )

  async function review(id: string, action: 'approve' | 'reject', note = '') {
    setBusy(id); setErr('')
    try {
      await api.post(`/baseline/verification/${id}/${action}/`,
        action === 'reject' ? { reason: note } : { note })
      setRejecting(null); setReason('')
      await Promise.all([refetchPending(), refetchStats()])
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

  return (
    <>
      <section className="hero" style={{ paddingBottom: 18 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>BASELINE STUDIES</span>
          <span className="sep">/</span>
          <span>CIPRB VERIFICATION</span>
        </div>
        <h1 className="hero-headline anim-rise d1" style={{ fontSize: 'clamp(40px, 6vw, 76px)', marginBottom: 8 }}>
          <span className="figure" style={{ color: 'var(--unfpa)' }}>Verify</span> &amp; monitor.
        </h1>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 720, marginTop: 14 }}>
          Each baseline interview (Hijra and Female Sex Worker) arrives here for CIPRB sign-off.
          Review the responses and the duplicate check, then approve to count it — or reject. Nothing
          counts toward the dashboard until you verify it.
        </p>
      </section>

      {/* Headline counts */}
      <section className="section" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Stat label="Pending" value={stats?.pending ?? 0} sub="awaiting your review" accent="var(--coral)" />
          <Stat label="Verified · Hijra" value={stats?.verified_hijra ?? 0} sub="Bandhu population" />
          <Stat label="Verified · FSW" value={stats?.verified_fsw ?? 0} sub="PHD population" />
          <Stat label="Verified total" value={stats?.verified_total ?? 0} accent="var(--unfpa)" />
          <Stat label="Duplicates" value={stats?.duplicates ?? 0} sub="flagged" accent="var(--amber)" />
        </div>
      </section>

      {err && (
        <section className="section" style={{ marginTop: 12 }}>
          <div className="card" style={{ background: 'rgba(233,69,96,0.06)', borderColor: 'rgba(233,69,96,0.2)', color: 'var(--rose)', padding: '10px 14px', fontSize: 13 }}>{err}</div>
        </section>
      )}

      {/* Pending verification queue */}
      <section className="section" style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="kicker"><span className="dot" /> Pending verification</div>
          <div className="pills">
            {([['', 'All'], ['hijra', 'Hijra'], ['fsw', 'FSW']] as const).map(([v, label]) => (
              <button key={v} className={`pill ${popFilter === v ? 'on' : ''}`} onClick={() => setPopFilter(v as '' | 'hijra' | 'fsw')}>{label}</button>
            ))}
            <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={exportCsv} disabled={exporting}>
              {exporting ? <LoadingSpinner size="sm" /> : <Download size={14} />} Export verified
            </button>
          </div>
        </div>

        {loading && !pending ? (
          <div className="card" style={{ padding: 28, textAlign: 'center' }}><LoadingSpinner /></div>
        ) : items.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
            <Inbox size={26} style={{ opacity: 0.5 }} />
            <p style={{ marginTop: 10, fontSize: 14 }}>No interviews waiting for verification.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map((p) => {
              const answers = Object.entries(p.raw_data || {})
                .filter(([k, v]) => !HIDE_KEYS.test(k) && v !== '' && v != null)
              const isOpen = expanded === p.submission_id
              return (
                <div key={p.submission_id} className="card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <span className={`tag ${p.population === 'hijra' ? 'violet' : 'blue'}`}>{POP_LABEL[p.population] || p.population || '—'}</span>
                        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{p.serial || '(no serial)'}</span>
                        {p.duplicate_preview && <span className="tag amber" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={11} /> Possible duplicate</span>}
                        {p.gps_missing && <span className="tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPinOff size={11} /> No GPS</span>}
                      </div>
                      <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
                        {p.district || '—'}{p.site_code ? ` · site ${p.site_code}` : ''}
                        {p.age ? ` · age ${p.age}` : ''} · by {p.interviewer || 'unknown'}
                      </div>
                      <div className="mono mute" style={{ fontSize: 11, marginTop: 4 }}>{new Date(p.submitted_at).toLocaleString()}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button className="btn brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        disabled={busy === p.submission_id} onClick={() => review(p.submission_id, 'approve')}>
                        {busy === p.submission_id ? <LoadingSpinner size="sm" /> : <Check size={14} />} Approve
                      </button>
                      <button className="btn ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        disabled={busy === p.submission_id} onClick={() => setRejecting(rejecting === p.submission_id ? null : p.submission_id)}>
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </div>

                  {rejecting === p.submission_id && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejecting…"
                        style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--hair)', background: 'var(--surface-2)', fontSize: 13 }} />
                      <button className="btn" style={{ color: 'var(--rose)' }} disabled={busy === p.submission_id}
                        onClick={() => review(p.submission_id, 'reject', reason)}>Confirm reject</button>
                    </div>
                  )}

                  <button className="btn ghost" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                    onClick={() => setExpanded(isOpen ? null : p.submission_id)}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {isOpen ? 'Hide' : 'Review'} responses ({answers.length})
                  </button>

                  {isOpen && (
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px 18px', borderTop: '1px solid var(--hair)', paddingTop: 12 }}>
                      {answers.map(([k, v]) => (
                        <div key={k} style={{ fontSize: 12.5, minWidth: 0 }}>
                          <span className="mono mute" style={{ fontSize: 10.5 }}>{k}</span>
                          <div style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{String(v)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="section" style={{ marginTop: 24, marginBottom: 80 }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 12.5 }}>
          <ShieldCheck size={16} style={{ color: 'var(--emerald)' }} />
          CIPRB-only. Verified interviews feed the baseline analysis; the full response set is preserved for the D5 report.
        </div>
      </section>
    </>
  )
}
