/**
 * ProgrammeHealthFlags — per-partner activity-compliance + anomaly surface.
 *
 * Animesh's spec:
 *   - Three cards, one per implementing partner (PHD, Bandhu, CIPRB).
 *   - Alert if a partner hasn't uploaded anything in the past 74 hours.
 *   - Field users must submit daily — even a '0' on zero-patient days.
 *   - REPLACES the old Activity Feed entirely.
 *   - UNFPA-only surface: only supervisors (and developers, for support)
 *     see this block.
 *
 * Renders nothing for non-UNFPA roles, so partner managers don't see
 * the cross-partner compliance picture.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { PARTNER_COLORS, type PartnerCode } from '@/data/partnerDistricts'

interface PartnerFlag {
  partner: string
  total_centres: number
  submitted_today: number
  silent_count: number
  submissions_today: number
  recent_submissions: number
  last_submission_at: string | null
  partner_silent_hours: number | null
  is_silent: boolean
  silent_centres: { name: string; district: string; hours_silent: number | null }[]
}

interface HealthFlagPayload {
  as_of: string
  alert_threshold_hours: number
  partners: PartnerFlag[]
}

function useHealthFlags() {
  const [data, setData] = useState<HealthFlagPayload | null>(null)
  useEffect(() => {
    let cancelled = false
    api.get<HealthFlagPayload>('/dashboard/health-flags/')
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { /* silently fail — block hides */ })
    return () => { cancelled = true }
  }, [])
  return data
}

function PartnerFlagTile({ flag, thresholdHours }: { flag: PartnerFlag; thresholdHours: number }) {
  const { t } = useTranslation()
  const partner = flag.partner as PartnerCode
  const color = PARTNER_COLORS[partner] ?? '#999'
  const isCompliant = !flag.is_silent

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
            {flag.total_centres > 0
              ? t('health.centresActive', { count: flag.total_centres })
              : t('health.registryPending')}
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
            <CheckCircle2 size={12} /> {t('health.active')}
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999,
            background: 'rgba(204,106,0,0.10)',
            color: '#CC6A00',
            fontSize: 11, fontWeight: 600,
          }}>
            <AlertTriangle size={12} /> {t('health.silent')}
          </span>
        )}
      </div>

      {/* Big number: recent submissions in 74h window */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 36, fontWeight: 800, color,
          fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', lineHeight: 1,
        }}>
          {flag.recent_submissions.toLocaleString()}
        </span>
        <span style={{
          fontSize: 13, color: 'var(--ink-3)',
        }}>
          {t('health.submissionsInWindow', { hours: thresholdHours })}
        </span>
      </div>

      {/* Today + last touched */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <div style={{ color: 'var(--ink-3)' }}>
          <b style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
            {flag.submissions_today.toLocaleString()}
          </b>
          {' '}{t('health.today')}
          {flag.total_centres > 0 && (
            <>
              {' · '}
              <b style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {flag.submitted_today}/{flag.total_centres}
              </b>
              {' '}{t('health.centresLabel')}
            </>
          )}
        </div>
        {flag.partner_silent_hours !== null ? (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: flag.partner_silent_hours > thresholdHours ? '#C7172E'
                 : flag.partner_silent_hours > 24 ? '#CC6A00'
                 : 'var(--muted)',
            fontSize: 11.5,
          }}>
            <Clock size={11} />
            {flag.partner_silent_hours.toFixed(1)}{t('health.hoursSinceLastTouch')}
          </div>
        ) : (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {t('health.noSubmissionsYet')}
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
            {t('health.silentCentresHeading')}
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
                {t('health.moreCount', { count: flag.silent_centres.length - 4 })}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}

export function ProgrammeHealthFlags() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const data = useHealthFlags()

  // UNFPA-only block. Hidden from focal, manager, field_staff, org_lead,
  // ciprb_baseline. Developers retained for support visibility.
  if (!user || !['supervisor', 'developer'].includes(user.role)) {
    return null
  }

  if (!data || data.partners.length === 0) {
    return null
  }

  const allCompliant = data.partners.every(p => !p.is_silent)
  const thresholdHours = data.alert_threshold_hours

  return (
    <section className="section programme-health-flags" style={{ marginTop: 44 }}>
      <div className="section-head" style={{ marginBottom: 20 }}>
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{
              background: allCompliant ? 'var(--unfpa)' : '#CC6A00',
            }} />
            {t('health.kicker', { hours: thresholdHours })}
          </div>
          <h2 className="section-title">
            {allCompliant ? t('health.titleAllSteady') : t('health.titleSilent')}
          </h2>
          <p className="section-sub">
            {t('health.sub', { hours: thresholdHours })}
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
          <PartnerFlagTile key={p.partner} flag={p} thresholdHours={thresholdHours} />
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
