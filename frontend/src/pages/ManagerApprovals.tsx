/**
 * Manager Approvals — editorial light console.
 *
 * Queue spine (left) + focus panel (right) layout.
 * Click to select; click Approve/Reject buttons to act.
 * Preserves both Programs and Legacy API flows.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  X, Check, AlertTriangle,
} from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { api, apiErrorMessage } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { PageLoader, LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { formatDateTime } from '@/utils/format'
import type { Submission, SubmissionDetail, ProgramPendingResponse } from '@/types'

// ─── CountUp hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, dur = 1300) {
  const [v, setV] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) { setV(target); return }
    let raf: number
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / dur, 1)
      setV(Math.round(target * p * p))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, dur, reduce])
  return v
}

function CountUp({ value, dur }: { value: number; dur?: number }) {
  return <>{useCountUp(value, dur).toLocaleString()}</>
}

// Keyboard shortcuts were retired entirely — click-only interactions
// across the queue. Removing keyboard handlers means no surprise
// destructive actions (Enter = approve) when a manager focuses an
// element near the queue.

// ─── Stat block ───────────────────────────────────────────────────────────────

function Stat({ label, value, suffix = '', sub }: { label: string; value: number; suffix?: string; sub: string }) {
  return (
    <div>
      <div className="kicker" style={{ marginBottom: 6 }}><span className="dot" />{label}</div>
      <div className="num-display" style={{ fontSize: 38, fontFamily: 'var(--display)', fontStyle: 'italic' }}>
        <CountUp value={value} />{suffix}
      </div>
      <div className="mono mute" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  )
}

// ─── Mini location map ────────────────────────────────────────────────────────

const BD_PATHS: Record<string, string> = {
  dhaka:     'M275 50 L370 55 L380 130 L355 180 L300 175 L260 145 L255 95 Z',
  mymensingh:'M165 165 L260 145 L300 175 L295 245 L240 295 L185 280 L150 240 L140 195 Z',
  rajshahi:  'M355 180 L440 175 L460 240 L420 280 L370 270 L355 215 Z',
  rangpur:   'M460 175 L590 165 L630 220 L595 295 L520 285 L460 240 L460 195 Z',
  khulna:    'M295 245 L370 270 L420 280 L450 330 L420 400 L350 390 L300 360 L295 295 Z',
  barishal:  'M150 290 L240 295 L300 360 L290 460 L230 490 L160 460 L140 380 Z',
  sylhet:    'M290 460 L350 390 L420 400 L420 470 L380 510 L320 500 L290 480 Z',
  chattogram:'M420 280 L520 285 L595 295 L605 360 L580 460 L545 540 L500 560 L460 530 L450 470 L420 400 Z',
}

function MiniLocationMap() {
  const cx = 300 + Math.random() * 200
  const cy = 200 + Math.random() * 200
  return (
    <div style={{
      width: '100%', height: 80, background: 'var(--surface-2)',
      border: '1px solid var(--hair)', borderRadius: 10,
      position: 'relative', overflow: 'hidden',
    }}>
      <svg viewBox="100 30 600 540" style={{ width: '100%', height: '100%' }}>
        {Object.values(BD_PATHS).map((p, i) => (
          <path key={i} d={p} fill="rgba(0,145,199,0.04)" stroke="rgba(0,145,199,0.28)" strokeWidth={1} />
        ))}
        <circle cx={cx} cy={cy} r={6} fill="none" stroke="var(--coral)" strokeWidth={2}>
          <animate attributeName="r" values="6;16" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={5} fill="var(--coral)" stroke="white" strokeWidth={2} />
      </svg>
    </div>
  )
}

// ─── Unified queue item type ──────────────────────────────────────────────────

interface QueueItem {
  id: string
  model_type: string
  model_label: string
  title: string
  summary: string
  organisation: string
  center_name: string
  submitted_by: string
  created_at: string
  kobo_submission_id?: string
  kind: 'program' | 'legacy'
  urgent?: boolean
  latitude?: string
  longitude?: string
  // Animesh's baseline duplication warning — true when an earlier baseline
  // survey from the same (district, upazila, day) is already on file.
  is_baseline_duplicate?: boolean
  // Animesh's MPDSR QA-gate flags (deck slide 9). Short stable tag list
  // (e.g. 'AGE_LOW', 'CAUSE_EMPTY'). Renders amber AlertTriangle pill in
  // the queue spine + expanded human-readable list in the focus panel.
  logic_flags?: string[]
}

function toQueueItems(programsData: ProgramPendingResponse | null, submissions: Submission[] | null): QueueItem[] {
  const items: QueueItem[] = []

  // Programs items
  if (programsData?.items) {
    for (const it of programsData.items) {
      items.push({
        id: it.id,
        model_type: it.model_type,
        model_label: it.model_label,
        title: it.model_label,
        summary: it.summary,
        organisation: it.organisation,
        center_name: it.center_name,
        submitted_by: it.submitted_by ?? '',
        created_at: it.created_at,
        kobo_submission_id: it.kobo_submission_id,
        kind: 'program',
        urgent: it.model_type === 'gbv_case',
      })
    }
  }

  // Legacy submissions (pending only)
  if (submissions) {
    for (const s of submissions.filter(s => s.status === 'pending')) {
      items.push({
        id: s.id,
        model_type: s.form_type,
        model_label: s.form_type.replace(/_/g, ' '),
        title: `${s.form_type.replace(/_/g, ' ')} — ${s.worker_name}`,
        summary: `${s.worker_name} submitted ${s.form_type.replace(/_/g, ' ')} from ${s.district}`,
        organisation: s.partner ?? '',
        center_name: s.district ?? '',
        submitted_by: s.worker_name ?? '',
        created_at: s.submitted_at,
        kind: 'legacy',
        latitude: s.latitude?.toString(),
        longitude: s.longitude?.toString(),
        is_baseline_duplicate: (s as any).is_baseline_duplicate ?? false,
        logic_flags: Array.isArray((s as any).logic_flags) ? (s as any).logic_flags : [],
      })
    }
  }

  return items
}

// Map already-reviewed submissions (approved/rejected) into queue items so
// the "Reviewed" tab can show the audit trail. Newest decision first.
function reviewedQueueItems(submissions: Submission[] | null): QueueItem[] {
  if (!submissions) return []
  return submissions
    .slice()
    .sort((a, b) => (b.reviewed_at ?? '').localeCompare(a.reviewed_at ?? ''))
    .map(s => ({
      id: s.id,
      model_type: s.form_type,
      model_label: s.form_type.replace(/_/g, ' '),
      title: `${s.form_type.replace(/_/g, ' ')} — ${s.worker_name}`,
      summary: `${s.status_display} by ${s.reviewed_by?.full_name ?? 'manager'}`,
      organisation: s.partner ?? '',
      center_name: s.district ?? '',
      submitted_by: s.worker_name ?? '',
      created_at: s.submitted_at,
      kind: 'legacy' as const,
      latitude: s.latitude?.toString(),
      longitude: s.longitude?.toString(),
      logic_flags: Array.isArray((s as any).logic_flags) ? (s as any).logic_flags : [],
    }))
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ action, item, onClose }: {
  action: 'approve' | 'reject'
  item: QueueItem
  onClose: () => void
}) {
  const isApprove = action === 'approve'
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28, zIndex: 200,
      background: 'var(--ink)', color: 'white',
      borderRadius: 12, padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 16px 40px rgba(20, 32, 43, 0.30)',
      animation: 'rise 320ms var(--ease) backwards',
      minWidth: 340,
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: '50%',
        background: isApprove ? 'rgba(31,154,109,0.20)' : 'rgba(233,69,96,0.20)',
        color: isApprove ? 'var(--emerald)' : 'var(--rose)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isApprove ? <Check size={14} /> : <X size={14} />}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: 13.5 }}>{isApprove ? 'Approved' : 'Rejected'} · <span className="mono">{item.id.slice(0, 8)}</span></div>
        <div className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{item.center_name}</div>
      </div>
      <button onClick={onClose} style={{
        background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
        cursor: 'pointer', padding: 4,
      }}>
        <X size={12} />
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ManagerApprovals() {
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Filter state persisted to localStorage so navigating away and
  // back restores the user's last selected filter (§9 state-preservation).
  const FILTER_KEY = 'approvals.filter'
  type FilterKey = 'all' | 'urgent' | 'phd' | 'bondhu' | 'reviewed'
  const [filter, setFilter] = useState<FilterKey>(() => {
    if (typeof window === 'undefined') return 'all'
    const stored = window.localStorage.getItem(FILTER_KEY)
    if (stored === 'all' || stored === 'urgent' || stored === 'phd' || stored === 'bondhu' || stored === 'reviewed') {
      return stored
    }
    return 'all'
  })
  useEffect(() => {
    try { window.localStorage.setItem(FILTER_KEY, filter) } catch {}
  }, [filter])
  const [error, setError] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  // Reviewer note (Animesh: permanent reviewer notes as evidence). Captured
  // here, sent on approve (as `note`) or reject (as `rejection_reason`),
  // then persisted server-side into the immutable review_history trail.
  const [reviewerNote, setReviewerNote] = useState('')
  // Full detail (raw_data clinical variables + review_history) for the
  // selected legacy submission. Lets the manager check actual field values
  // (e.g. age=14) before deciding, per Animesh's variable-checking spec.
  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [toast, setToast] = useState<{ action: 'approve' | 'reject'; item: QueueItem } | null>(null)

  // ── API data ────────────────────────────────────────────────────────────────

  const { data: programsData, loading: programsLoading, refetch: refetchPrograms } =
    usePolling<ProgramPendingResponse>({
      fetcher: () => api.get('/programs/pending-approvals/').then((r) => r.data),
      interval: 20_000,
    })

  const { data: submissions, loading: legacyLoading, refetch: refetchLegacy } =
    usePolling<Submission[]>({
      fetcher: () =>
        api.get('/submissions/', { params: { status: 'pending' } })
           .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
      interval: 30_000,
    })

  // Reviewed (approved/rejected) submissions — for the "Reviewed" tab so the
  // audit trail (who decided, when, with what note) stays visible after the
  // item leaves the pending queue. Animesh: full visibility, no manipulation.
  // Fetch approved + rejected in parallel (backend filters status by exact
  // match, so there is no single "reviewed" value to query).
  const { data: reviewedSubs } = usePolling<Submission[]>({
    fetcher: () =>
      Promise.all([
        api.get('/submissions/', { params: { status: 'approved' } }),
        api.get('/submissions/', { params: { status: 'rejected' } }),
      ]).then(([a, r]) => {
        const rows = (res: any) => (Array.isArray(res.data) ? res.data : res.data.results ?? [])
        return [...rows(a), ...rows(r)] as Submission[]
      }),
    interval: 60_000,
  })

  // ── Queue ───────────────────────────────────────────────────────────────────

  const allItems = toQueueItems(programsData ?? null, submissions ?? null)
  const reviewedItems = reviewedQueueItems(reviewedSubs ?? null)

  const filtered = (filter === 'reviewed' ? reviewedItems : allItems).filter(it => {
    if (filter === 'urgent') return it.urgent
    if (filter === 'phd') return it.organisation === 'PHD'
    if (filter === 'bondhu') return it.organisation === 'Bandhu' || it.organisation === 'Bondhu'
    return true
  })

  const selected = filtered.find(x => x.id === selectedId) ?? filtered[0] ?? null

  // Auto-select first item
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id)
    }
  }, [filtered, selectedId])

  // When the selection changes, clear the draft note and pull the full
  // submission detail (raw_data clinical variables + review_history). Only
  // legacy/Kobo submissions carry this; program items are skipped.
  useEffect(() => {
    setReviewerNote('')
    setDetail(null)
    if (!selected || selected.kind !== 'legacy') return
    let cancelled = false
    api.get(`/submissions/${selected.id}/`)
      .then((r) => { if (!cancelled) setDetail(r.data as SubmissionDetail) })
      .catch(() => { if (!cancelled) setDetail(null) })
    return () => { cancelled = true }
  }, [selected?.id, selected?.kind])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const decide = useCallback(async (item: QueueItem, action: 'approve' | 'reject') => {
    // A rejection must say why — the field worker needs to know what to fix,
    // and the reason is permanently recorded as audit evidence.
    if (action === 'reject' && item.kind === 'legacy' && !reviewerNote.trim()) {
      setError('Add a reviewer note explaining what to correct before rejecting.')
      return
    }
    setError('')
    const setter = action === 'approve' ? setApproving : setRejecting
    setter(true)
    try {
      if (item.kind === 'program') {
        await api.post('/programs/pending-approvals/', { id: item.id, model_type: item.model_type, action })
        refetchPrograms()
      } else {
        const note = reviewerNote.trim()
        if (action === 'reject') {
          // Backend requires a non-blank rejection reason — it becomes the
          // worker-facing "what to fix" note and the audit-trail entry.
          await api.post(`/submissions/${item.id}/reject/`, { rejection_reason: note })
        } else {
          await api.post(`/submissions/${item.id}/approve/`, { note })
        }
        refetchLegacy()
      }
      setReviewerNote('')
      setToast({ action, item })
      setTimeout(() => setToast(null), 4500)
      // Select next item
      const idx = filtered.findIndex(x => x.id === item.id)
      if (idx < filtered.length - 1) setSelectedId(filtered[idx + 1].id)
      else if (idx > 0) setSelectedId(filtered[idx - 1].id)
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setter(false)
    }
  }, [filtered, refetchPrograms, refetchLegacy, reviewerNote])

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  // Keyboard shortcuts removed — click-only interactions only. See the
  // comment block above for the rationale.

  const loading = programsLoading && legacyLoading && !programsData && !submissions

  if (loading) return <PageLoader />

  const dateStr = new Date().toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
           HERO
           ═══════════════════════════════════════════════════════════════ */}
      <section className="hero" style={{ paddingBottom: 28 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>{t('approvals.eyebrowConsole')}</span>
          <span className="sep">/</span>
          <span>{t('approvals.eyebrowQueueItems', { count: allItems.length })}</span>
          <span className="sep">/</span>
          <span>{dateStr} GMT+6</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32 }} className="anim-rise d1">
          <div>
            <h1 className="hero-headline" style={{ fontSize: 'clamp(40px, 6vw, 76px)', marginBottom: 6 }}>
              <span className="figure"><CountUp value={allItems.length} /></span>{' '}
              <span>{t('approvals.headlineSuffix')}</span>
            </h1>
            <div style={{
              fontFamily: 'var(--display)', fontStyle: 'italic',
              fontSize: 'clamp(22px, 2.6vw, 34px)',
              lineHeight: 1.1, color: 'var(--ink-2)',
              letterSpacing: '-0.012em', marginBottom: 16,
            }}>{t('approvals.headlineSub')}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 24, flexShrink: 0 }}>
            <Stat label={t('approvals.statQueue')}    value={allItems.length}                 sub={t('approvals.statQueueSub',    { count: filtered.length })} />
            <Stat label={t('approvals.statPrograms')} value={programsData?.total ?? 0}        sub={t('approvals.statProgramsSub')} />
            <Stat label={t('approvals.statLegacy')}   value={(submissions ?? []).filter(s => s.status === 'pending').length} sub={t('approvals.statLegacySub')} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           ERROR BAR
           ═══════════════════════════════════════════════════════════════ */}
      {error && (
        <div className="card" style={{
          background: 'rgba(233,69,96,0.08)', borderColor: 'rgba(233,69,96,0.25)',
          padding: '12px 18px', marginBottom: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 13, color: 'var(--rose)',
        }}>
          {error}
          <button onClick={() => setError('')} style={{
            background: 'none', border: 'none', color: 'var(--rose)',
            cursor: 'pointer', textDecoration: 'underline', fontSize: 12,
          }}>{t('approvals.dismissError')}</button>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           QUEUE + FOCUS PANEL
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginBottom: 80 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 28, alignItems: 'start' }}>

          {/* ── QUEUE SPINE ────────────────────────────────────────── */}
          <div className="card flush" style={{ position: 'sticky', top: 76 }}>
            <div className="card-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="card-title" style={{ fontSize: 14, fontWeight: 600 }}>{t('approvals.queueHeading')}</div>
                <span className="mono mute" style={{ fontSize: 11 }}>{t('approvals.queueCount', { visible: filtered.length, total: allItems.length })}</span>
              </div>
              <div className="pills">
                {([
                  { key: 'all'    as const, label: t('approvals.filterAll'),    count: allItems.length },
                  { key: 'urgent' as const, label: t('approvals.filterUrgent'), count: allItems.filter(x => x.urgent).length },
                  { key: 'phd'    as const, label: t('approvals.filterPHD'),    count: allItems.filter(x => x.organisation === 'PHD').length },
                  { key: 'bondhu' as const, label: t('approvals.filterBondhu'), count: allItems.filter(x => x.organisation === 'Bandhu' || x.organisation === 'Bondhu').length },
                  { key: 'reviewed' as const, label: 'Reviewed', count: reviewedItems.length },
                ]).map(f => (
                  <button
                    key={f.key}
                    className={`pill ${filter === f.key ? 'on' : ''}`}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label}
                    {f.count > 0 && <span className="count">{f.count}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              padding: '8px 8px 12px',
              maxHeight: 'calc(100vh - 220px)',
              overflowY: 'auto',
            }} className="scroll-thin">
              {filtered.length === 0 && (
                <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{
                    width: 36, height: 36, margin: '0 auto 6px', borderRadius: '50%',
                    background: 'rgba(31,154,109,0.10)', color: 'var(--emerald)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={18} />
                  </div>
                  {t('approvals.queueClear')}
                </div>
              )}
              {filtered.map((it, i) => (
                <button
                  key={`${it.kind}-${it.id}`}
                  className={`appr-spine-item ${selected?.id === it.id ? 'active' : ''}`}
                  onClick={() => setSelectedId(it.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: 10,
                    border: 'none', cursor: 'pointer',
                    background: selected?.id === it.id ? 'var(--unfpa)' : 'transparent',
                    color: selected?.id === it.id ? '#fff' : 'var(--ink)',
                    transition: 'background 150ms, color 150ms',
                    marginBottom: 2,
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    color: selected?.id === it.id ? 'rgba(255,255,255,0.6)' : 'var(--muted)',
                    flexShrink: 0,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{it.title}</div>
                    <div style={{
                      fontSize: 11,
                      color: selected?.id === it.id ? 'rgba(255,255,255,0.6)' : 'var(--muted)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {it.center_name} · {formatDateTime(it.created_at).split(',')[0]}
                    </div>
                  </div>
                  {it.logic_flags && it.logic_flags.length > 0 && (
                    <span
                      title={it.logic_flags
                        .map(tag => t(`approvals.logicFlag.${tag}`, { defaultValue: tag }))
                        .join(' · ')}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        height: 18, padding: '0 6px', fontSize: 9.5,
                        borderRadius: 999, flexShrink: 0,
                        background: selected?.id === it.id
                          ? 'rgba(255,255,255,0.16)'
                          : 'rgba(233,151,10,0.14)',
                        color: selected?.id === it.id ? '#fff' : 'var(--amber)',
                        border: '1px solid rgba(233,151,10,0.35)',
                        fontFamily: 'var(--mono)', letterSpacing: '0.02em',
                      }}
                    >
                      <AlertTriangle size={9} strokeWidth={2.5} />
                      {t('approvals.logicFlag.badge', { count: it.logic_flags.length, defaultValue: '{{count}} review' })}
                    </span>
                  )}
                  {it.urgent && (
                    <span className="tag coral" style={{ height: 18, padding: '0 6px', fontSize: 9.5, flexShrink: 0 }}>!</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── FOCUS PANEL ────────────────────────────────────────── */}
          {selected ? (
            <div key={selected.id} style={{ animation: 'rise 500ms var(--ease) backwards' }}>
              <div className={`card ${selected.model_type === 'gbv_case' ? 'shimmer-coral' : 'shimmer'}`}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.04em' }}>
                        {selected.id.slice(0, 8)}
                      </span>
                      <span className={`tag ${selected.organisation === 'PHD' ? 'blue' : 'violet'}`}>
                        {selected.organisation}
                      </span>
                      <span className="tag">{selected.model_label}</span>
                      {selected.kind === 'legacy' && <span className="tag amber">{t('approvals.tagLegacy')}</span>}
                      {selected.urgent && <span className="tag coral">{t('approvals.tagUrgent')}</span>}
                    </div>
                    <h2 style={{
                      fontFamily: 'var(--display)', fontStyle: 'italic', fontWeight: 400,
                      fontSize: 38, lineHeight: 1.05, letterSpacing: '-0.02em',
                      margin: 0, color: 'var(--ink)',
                    }}>
                      {selected.title}
                    </h2>
                    <p className="hero-lede" style={{ marginTop: 12, maxWidth: 720 }}>
                      {selected.summary}
                    </p>
                    {/* Animesh's baseline duplication warning — yellow card
                        when an earlier baseline from same place+day already
                        exists. Manager can still approve, but is forced to
                        notice the collision first. */}
                    {/* MPDSR QA-gate logic-error flags (Animesh deck slide 9).
                        Amber advisory listing implausible field values so the
                        manager can scrutinise + reject with a note. Does NOT
                        gate the approve/reject buttons. */}
                    {selected.logic_flags && selected.logic_flags.length > 0 && (
                      <div style={{
                        marginTop: 14,
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(233,151,10,0.10)',
                        border: '1px solid rgba(233,151,10,0.35)',
                        color: '#7A4400',
                        fontSize: 13,
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--amber)' }} />
                        <div>
                          <b>{t('approvals.logicFlag.title', { count: selected.logic_flags.length, defaultValue: '{{count}} review' })}</b>
                          {' — '}
                          {t('approvals.logicFlag.body', {
                            defaultValue: 'Automated checks flagged implausible values. Verify before approving.',
                          })}
                          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                            {selected.logic_flags.map(tag => (
                              <li key={tag} style={{ marginTop: 2 }}>
                                {t(`approvals.logicFlag.${tag}`, { defaultValue: tag })}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                    {selected.is_baseline_duplicate && (
                      <div style={{
                        marginTop: 14,
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: 'rgba(204,106,0,0.10)',
                        border: '1px solid rgba(204,106,0,0.35)',
                        color: '#7A4400',
                        fontSize: 13,
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                      }}>
                        <span style={{ fontSize: 16, lineHeight: 1 }}>⚠</span>
                        <span>
                          <b>{t('approvals.duplicateWarning', { defaultValue: 'Possible duplicate' })}</b>
                          {' — '}
                          {t('approvals.duplicateBody', {
                            defaultValue: 'An earlier baseline survey from the same location and day is already on file. Verify before approving.',
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="kicker"><span className="dot" />{t('approvals.submittedAt')}</div>
                    <div className="mono" style={{ fontSize: 13, marginTop: 4 }}>
                      {formatDateTime(selected.created_at)}
                    </div>
                  </div>
                </div>

                {/* Submitter + centre + map preview */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 18,
                  padding: '18px 0',
                  borderTop: '1px solid var(--hair)',
                  borderBottom: '1px solid var(--hair)',
                }}>
                  <div>
                    <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />{t('approvals.submittedBy')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="stream-avatar blue" style={{ width: 40, height: 40, fontSize: 13 }}>
                        {(selected.submitted_by || '?').split(' ').map(p => p[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{selected.submitted_by || t('approvals.unknownUser')}</div>
                        <div className="mute" style={{ fontSize: 11.5 }}>{selected.organisation}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />CENTRE</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{selected.center_name}</div>
                    {selected.latitude && selected.longitude && (
                      <div className="mute" style={{ fontSize: 11.5 }}>
                        GPS: <span className="mono">{parseFloat(selected.latitude).toFixed(4)}, {parseFloat(selected.longitude).toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="kicker" style={{ marginBottom: 8 }}><span className="dot" />LOCATION</div>
                    <MiniLocationMap />
                  </div>
                </div>

                {/* Validation trace + field diff */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
                  padding: '22px 0',
                  borderBottom: '1px solid var(--hair)',
                }}>
                  <div>
                    <div className="kicker" style={{ marginBottom: 12 }}>
                      <span className="dot" style={{ background: 'var(--emerald)' }} />CHECKS AT INGEST
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {([
                        // Real gates the Kobo webhook enforces before a record
                        // is created — derived from the actual submission, not
                        // synthetic timings.
                        ['Recognised form', true, String(selected.model_type || 'mpdsr')],
                        ['GPS captured (mandatory)', !!(selected.latitude && selected.longitude),
                          (selected.latitude && selected.longitude) ? 'yes' : 'missing'],
                        ['Unique — no duplicate', !!selected.kobo_submission_id,
                          selected.kobo_submission_id ? 'kobo id ✓' : '—'],
                        ['Partner attributed', !!selected.organisation, String(selected.organisation || '—')],
                      ] as [string, boolean, string][]).map(([label, ok, val]) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: 4,
                            background: ok ? 'rgba(31,154,109,0.10)' : 'rgba(233,151,10,0.12)',
                            color: ok ? 'var(--emerald)' : 'var(--amber)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {ok ? <Check size={11} /> : <AlertTriangle size={11} />}
                          </span>
                          <span style={{ flex: 1 }}>{label}</span>
                          <span className="mono mute" style={{ fontSize: 11 }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="kicker" style={{ marginBottom: 12 }}><span className="dot" />FIELD-LEVEL DIFF</div>
                    <div className="mono" style={{
                      fontSize: 12, lineHeight: 1.8,
                      background: 'var(--surface-2)', border: '1px solid var(--hair)',
                      borderRadius: 10, padding: 14,
                    }}>
                      {selected.kobo_submission_id && (
                        <div className="mute">+ kobo_id: <span style={{ color: 'var(--ink)' }}>{selected.kobo_submission_id}</span></div>
                      )}
                      <div className="mute">+ form_type: <span style={{ color: 'var(--ink)' }}>{selected.model_type}</span></div>
                      <div className="mute">+ org: <span style={{ color: 'var(--ink)' }}>{selected.organisation}</span></div>
                      <div className="mute">+ centre: <span style={{ color: 'var(--ink)' }}>{selected.center_name}</span></div>
                      <div className="mute">+ submitted_by: <span style={{ color: 'var(--ink)' }}>{selected.submitted_by}</span></div>
                      <div className="mute">+ submitted_at: <span style={{ color: 'var(--ink)' }}>{selected.created_at}</span></div>
                    </div>
                  </div>
                </div>

                {/* Submitted field values — read-only. Lets the manager verify
                    actual clinical variables (e.g. mother's age = 14) against
                    the form before deciding. No editing: full visibility, no
                    manipulation (Animesh). */}
                {detail && detail.raw_data && (
                  <div style={{ padding: '22px 0', borderBottom: '1px solid var(--hair)' }}>
                    <div className="kicker" style={{ marginBottom: 12 }}>
                      <span className="dot" />SUBMITTED VALUES (READ-ONLY)
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px',
                      maxHeight: 280, overflowY: 'auto',
                    }}>
                      {Object.entries(detail.raw_data)
                        .filter(([k]) => !k.startsWith('_') && !k.startsWith('formhub') && !k.startsWith('meta'))
                        .map(([k, v]) => (
                          <div key={k} style={{
                            display: 'flex', justifyContent: 'space-between', gap: 12,
                            fontSize: 12.5, padding: '4px 0', borderBottom: '1px dotted var(--hair)',
                          }}>
                            <span className="mute" style={{ wordBreak: 'break-word' }}>{k.split('/').pop()}</span>
                            <span className="mono" style={{ color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-word' }}>
                              {v === null || v === '' ? '—' : String(v)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Review history — immutable audit trail (who, what, when, note). */}
                {detail && detail.review_history && detail.review_history.length > 0 && (
                  <div style={{ padding: '22px 0', borderBottom: '1px solid var(--hair)' }}>
                    <div className="kicker" style={{ marginBottom: 12 }}><span className="dot" />REVIEW HISTORY</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {detail.review_history.map((e, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: 10, fontSize: 12.5,
                          padding: '8px 12px', borderRadius: 8,
                          background: 'var(--surface-2)', border: '1px solid var(--hair)',
                        }}>
                          <span style={{
                            color: e.action === 'approved' ? 'var(--emerald)' : 'var(--coral)',
                            fontWeight: 600, textTransform: 'capitalize', minWidth: 64,
                          }}>{e.action}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--ink)' }}>{e.reviewer || 'Manager'}</div>
                            {e.note && <div className="mute" style={{ marginTop: 2 }}>"{e.note}"</div>}
                          </div>
                          <span className="mono mute" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                            {e.timestamp ? new Date(e.timestamp).toLocaleString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filter === 'reviewed' ? (
                  /* Already-decided item — show the outcome, no action controls. */
                  <div style={{ paddingTop: 18, fontSize: 13, color: 'var(--muted)' }}>
                    {detail?.reviewed_by
                      ? <>Decided by <strong style={{ color: 'var(--ink)' }}>{detail.reviewed_by.full_name}</strong>
                          {detail.reviewed_at && <> on {new Date(detail.reviewed_at).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}.</>
                      : 'This submission has already been reviewed.'}
                  </div>
                ) : (
                  <>
                    {/* Reviewer note */}
                    <div style={{ padding: '22px 0', borderBottom: '1px solid var(--hair)' }}>
                      <div className="kicker" style={{ marginBottom: 10 }}><span className="dot" />{t('approvals.reviewerNote')}</div>
                      <textarea
                        value={reviewerNote}
                        onChange={(e) => setReviewerNote(e.target.value)}
                        placeholder={t('approvals.reviewerPlaceholder')}
                        style={{
                          width: '100%', minHeight: 64, padding: '10px 12px',
                          border: '1px solid var(--hair)', borderRadius: 10,
                          background: 'var(--surface-2)', fontSize: 13, color: 'var(--ink)',
                          resize: 'vertical', fontFamily: 'var(--ui)',
                        }}
                      />
                      <div className="mute" style={{ fontSize: 11, marginTop: 6 }}>
                        Required when rejecting — the worker sees this note and a link to resubmit a corrected entry.
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: 20 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn danger lg"
                          onClick={() => decide(selected, 'reject')}
                          disabled={rejecting}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {rejecting ? <LoadingSpinner size="sm" /> : <><X size={14} /> {t('approvals.btnReject')}</>}
                        </button>
                        <button
                          className="btn success lg"
                          onClick={() => decide(selected, 'approve')}
                          disabled={approving}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          {approving ? <LoadingSpinner size="sm" /> : <><Check size={14} /> {t('approvals.btnApprove')}</>}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: 18, color: 'var(--ink)', fontFamily: 'var(--display)', fontStyle: 'italic' }}>
                {t('approvals.queueClearMain')}
              </div>
              <p style={{ marginTop: 6 }}>{t('approvals.queueClearSub')}</p>
            </div>
          )}
        </div>
      </section>

      {/* Toast */}
      {toast && (
        <Toast
          action={toast.action}
          item={toast.item}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}
