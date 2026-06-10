/**
 * NilReportModal — a Bandhu manager logs a "No reporting today" entry for a
 * Wellness Centre + date + reason. It is created at the manager gate and then
 * flows to the UNFPA approval queue (two-stage, per Rafi's spec).
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/api/client'

interface Centre { code: string; name: string; organisation: string }

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

export function NilReportModal({ open, onClose, onSaved }: Props) {
  const [centres, setCentres] = useState<Centre[]>([])
  const [centreCode, setCentreCode] = useState('')
  const [date, setDate] = useState(todayISO())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(''); setDone(false)
    api.get('/programs/centers/')
      .then((r) => {
        const list: Centre[] = (Array.isArray(r.data) ? r.data : r.data?.results ?? [])
          .filter((c: Centre) => c.organisation === 'Bandhu')
        setCentres(list)
      })
      .catch(() => setCentres([]))
  }, [open])

  if (!open) return null

  const submit = async () => {
    if (!date || !reason.trim()) { setError('Date and reason are required.'); return }
    setBusy(true); setError('')
    try {
      await api.post('/programs/nil-reports/', {
        center_id: centreCode || null,
        report_date: date,
        reason: reason.trim(),
        organisation: 'Bandhu',
      })
      setDone(true)
      onSaved?.()
      setTimeout(onClose, 900)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not save the nil-report.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(20,32,43,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{
        width: 'min(460px, 100%)', padding: 22, borderRadius: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>No reporting today</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 0, marginBottom: 16 }}>
          Record a day a Wellness Centre had no submissions, with the reason. It will go to UNFPA for approval.
        </p>

        {done ? (
          <div style={{ padding: '16px 0', color: 'var(--emerald)', fontWeight: 600 }}>✓ Logged — sent to UNFPA.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Wellness Centre
              <select value={centreCode} onChange={(e) => setCentreCode(e.target.value)}
                style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)' }}>
                <option value="">All centres</option>
                {centres.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)' }} />
            </label>
            <label style={{ fontSize: 13, color: 'var(--ink-2)' }}>
              Reason
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
                placeholder="Why was there no reporting? (e.g. centre closed, holiday, staff absent)"
                style={{ width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--hair)', background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical' }} />
            </label>
            {error && <div style={{ fontSize: 12.5, color: 'var(--rose)' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn success" onClick={submit} disabled={busy || !reason.trim()}>
                {busy ? 'Saving…' : 'Log & send to UNFPA'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
