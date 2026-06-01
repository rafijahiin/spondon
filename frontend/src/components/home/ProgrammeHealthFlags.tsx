/**
 * ProgrammeHealthFlags — per-partner daily-submission compliance.
 *
 * Animesh's spec: every centre must touch the platform once per day,
 * even with a '0' entry. This block surfaces who's silent and for how
 * long, so program managers can demand accountability before the field
 * staff cite "internet was down" or "device was broken."
 *
 * Replaces the deleted Activity Feed — silence is the signal, not the
 * scroll of recent events.
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { api } from '@/api/client'
import { PARTNER_COLORS, type PartnerCode } from '@/data/partnerDistricts'

interface PartnerFlag {
  partner: string
  total_centres: number
  submitted_today: number
  silent_count: number
  submissions_today: number
  last_submission_at: string | null
  partner_silent_hours: number | null
  silent_centres: { name: string; district: string; hours_silent: number | null }[]
}

interface HealthFlagPayload {
  as_of: string
  alert_threshold_hours: number
  partners: PartnerFlag[]
}

function useHealthFlags() {
  const [data, setData] = useState<HealthFlagPayload | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.get<HealthFlagPayload>('/dashboard/health-flags/')
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [])
  return { data, error }
}

function PartnerFlagTile({ flag }: { flag: PartnerFlag }) {
  const partner = flag.partner as PartnerCode
  const color = PARTNER_COLORS[partner] ?? '#999'
  const isCompliant = flag.silent_count === 0 && flag.submissions_today > 0

  return (
    <div
      className="card"
      style={{
        padding: 20,
        display: 'flex', flexDirection: 'column', gap: 12,
        borderTop: `3px solid ${color}`,
      }}
    >
      {/* Partner header + compliance pill */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 18, fontWeight: 700, color: 'var(--ink)',
            letterSpacing: '-0.01em',
          }}>
            {flag.partner}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
            {flag.total_centres} {flag.total_centres === 1 ? 'centre' : 'centres'} active
          </div>
        </div>
        {isCompliant ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(26,122,90,0.10)',
            color: '#1A7A5A',
            fontSize: 11, fontWeight: 600,
          }}>
            <CheckCircle2 size={12} /> Active today
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(204,106,0,0.10)',
            color: '#CC6A00',
            fontSize: 11, fontWeight: 600,
          }}>
            <AlertTriangle size={12} /> Silent
          </span>
        )}
      </div>

      {/* Big number: submitted today / total */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 36, fontWeight: 800, color,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {flag.submitted_today}
        </span>
        <span style={{
          fontSize: 14, color: 'var(--ink-3)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          / {flag.total_centres} centres submitted today
        </span>
      </div>

      {/* Submission count + last touched */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <div style={{ color: 'var(--ink-3)' }}>
          <b style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
            {flag.submissions_today.toLocaleString()}
          </b>
          {' '}submissions in the last 24 hours
        </div>
        {flag.partner_silent_hours !== null && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: flag.partner_silent_hours > 24 ? '#CC6A00' : 'var(--muted)',
            fontSize: 11.5,
          }}>
            <Clock size={11} />
            {flag.partner_silent_hours.toFixed(1)}h since last touch
          </div>
        )}
        {flag.partner_silent_hours === null && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            No submissions on record yet
          </div>
        )}
      </div>

      {/* Silent centres drill-down */}
      {flag.silent_centres.length > 0 && (
        <div style={{
          marginTop: 4, paddingTop: 12,
          borderTop: '1px solid var(--hair)',
        }}>
          <div className="mono" style={{
            fontSize: 9.5, color: 'var(--muted)',
            letterSpacing: '0.1em', marginBottom: 8,
          }}>
            SILENT CENTRES
          </div>
          <ul style={{
            margin: 0, padding: 0, listStyle: 'none',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {flag.silent_centres.slice(0, 4).map((c, i) => (
              <li key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                fontSize: 12, gap: 8,
              }}>
                <span style={{ color: 'var(--ink-2)' }}>
                  {c.name}{c.district ? <span style={{ color: 'var(--muted)' }}> · {c.district}</span> : null}
                </span>
                {c.hours_silent !== null && (
                  <span className="mono" style={{
                    fontSize: 10, color: 'var(--muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {c.hours_silent.toFixed(1)}h
                  </span>
                )}
              </li>
            ))}
            {flag.silent_centres.length > 4 && (
              <li style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                + {flag.silent_centres.length - 4} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ProgrammeHealthFlags() {
  const { data, error } = useHealthFlags()

  if (error || !data) {
    return null  // Stay silent if endpoint isn't reachable — don't pollute the homepage
  }

  if (data.partners.length === 0) {
    return null
  }

  const allCompliant = data.partners.every(
    p => p.silent_count === 0 && p.submissions_today > 0
  )

  return (
    <section className="section programme-health-flags" style={{ marginTop: 44 }}>
      <div className="section-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: allCompliant ? '#1A7A5A' : '#CC6A00' }} />
            PROGRAMME HEALTH FLAGS · DAILY COMPLIANCE
          </div>
          <h2 className="section-title">
            {allCompliant
              ? 'Every partner touched the platform today'
              : 'Who hasn\'t reported today?'
            }
          </h2>
          <p className="section-sub">
            Every centre is required to submit at least once per day — even a
            '0' entry on zero-patient days. Silent partners surface here so
            managers can chase before the day closes.
          </p>
        </div>
      </div>

      <div
        className="health-flags-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {data.partners.map(p => (
          <PartnerFlagTile key={p.partner} flag={p} />
        ))}
      </div>

      <style>{`
        @media (max-width: 900px) {
          .health-flags-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}
