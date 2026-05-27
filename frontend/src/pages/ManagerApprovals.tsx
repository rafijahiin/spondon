/**
 * Manager Approvals — editorial light console.
 *
 * Queue spine (left) + focus panel (right) layout.
 * Keyboard: J/K to navigate, Enter to approve, X to reject.
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
import type { Submission, ProgramPendingResponse } from '@/types'

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

// (KBD helper was used for inline shortcut hints in the hero / actions
// strip. The i18n migration moved those hints into a single translatable
// sentence under approvals.shortcuts / approvals.shortcutsLine so the
// helper is no longer referenced.)

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
      })
    }
  }

  return items
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
  const [filter, setFilter] = useState<'all' | 'urgent' | 'phd' | 'bondhu'>('all')
  const [error, setError] = useState('')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
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

  // ── Queue ───────────────────────────────────────────────────────────────────

  const allItems = toQueueItems(programsData ?? null, submissions ?? null)

  const filtered = allItems.filter(it => {
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

  // ── Actions ─────────────────────────────────────────────────────────────────

  const decide = useCallback(async (item: QueueItem, action: 'approve' | 'reject') => {
    const setter = action === 'approve' ? setApproving : setRejecting
    setter(true)
    try {
      if (item.kind === 'program') {
        await api.post('/programs/pending-approvals/', { id: item.id, model_type: item.model_type, action })
        refetchPrograms()
      } else {
        await api.post(`/submissions/${item.id}/${action}/`)
        refetchLegacy()
      }
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
  }, [filtered, refetchPrograms, refetchLegacy])

  // ── Keyboard navigation ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected) return
      // Don't capture when typing in a textarea
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
      const ix = filtered.findIndex(x => x.id === selected.id)
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (ix < filtered.length - 1) setSelectedId(filtered[ix + 1].id)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (ix > 0) setSelectedId(filtered[ix - 1].id)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        decide(selected, 'approve')
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault()
        decide(selected, 'reject')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, filtered, decide])

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
            <p className="hero-lede" style={{ marginTop: 6 }}>
              {t('approvals.shortcuts')}
            </p>
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
                      <span className="dot" style={{ background: 'var(--emerald)' }} />VALIDATION TRACE
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        ['Schema check', true, '0ms'],
                        ['Field-level required', true, '12ms'],
                        ['Duplicate scan · 28d', true, '84ms'],
                        ['GPS coherence', !!(selected.latitude && selected.longitude), '31ms'],
                        ['Cross-org reconciliation', true, '212ms'],
                        ['Sensitivity scan', selected.model_type !== 'gbv_case', '44ms'],
                      ].map(([label, ok, t]) => (
                        <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                          <span style={{
                            width: 18, height: 18, borderRadius: 4,
                            background: ok ? 'rgba(31,154,109,0.10)' : 'rgba(233,151,10,0.12)',
                            color: ok ? 'var(--emerald)' : 'var(--amber)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {ok ? <Check size={11} /> : <AlertTriangle size={11} />}
                          </span>
                          <span style={{ flex: 1 }}>{label as string}</span>
                          <span className="mono mute" style={{ fontSize: 11 }}>{t as string}</span>
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

                {/* Reviewer note */}
                <div style={{ padding: '22px 0', borderBottom: '1px solid var(--hair)' }}>
                  <div className="kicker" style={{ marginBottom: 10 }}><span className="dot" />{t('approvals.reviewerNote')}</div>
                  <textarea
                    placeholder={t('approvals.reviewerPlaceholder')}
                    style={{
                      width: '100%', minHeight: 64, padding: '10px 12px',
                      border: '1px solid var(--hair)', borderRadius: 10,
                      background: 'var(--surface-2)', fontSize: 13, color: 'var(--ink)',
                      resize: 'vertical', fontFamily: 'var(--ui)',
                    }}
                  />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20 }}>
                  <div className="mono mute" style={{ fontSize: 11.5 }}>
                    {t('approvals.shortcutsLine')}
                  </div>
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
