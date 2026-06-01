/**
 * Training Log — session and attendance records.
 *
 * Rewritten to consume the editorial design tokens, matching the chrome
 * used on /mpdsr, /admin, /phd, /bondhu, and /fistula.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Users, ChevronDown } from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate } from '@/utils/format'
import type { TrainingSession, TrainingAttendance } from '@/types'

const TOPIC_LABELS: Record<string, string> = {
  dashboard_navigation: 'Dashboard Navigation',
  kobo_entry:           'KoboToolbox Data Entry',
  report_review:        'Report Review',
}

// UNFPA branding — orange across all partner accents.
const PARTNER_ACCENT: Record<string, string> = {
  CIPRB:  '#F96000',
  PHD:    '#F96000',
  Bandhu: '#F96000',
}

// ─── Session row + attendance accordion ──────────────────────────────────────

function SessionRow({ session }: { session: TrainingSession }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const accent = PARTNER_ACCENT[session.partner] ?? 'var(--unfpa)'
  const rate = session.attendance_rate
  const rateColor =
    rate == null            ? 'var(--muted)' :
    rate >= 80              ? '#015A28' :
    rate >= 60              ? '#9A3412' :
                              '#9A1131'

  return (
    <div className="card flush" style={{ overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 16,
          width: '100%', padding: '16px 20px', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--ink)',
          transition: 'background var(--dur-q)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
            marginBottom: 6,
          }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>
              {TOPIC_LABELS[session.topic] ?? session.topic}
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              borderRadius: 999, padding: '2px 8px',
              fontSize: 10, fontWeight: 600,
              background: `${accent}1A`, color: accent,
              letterSpacing: '0.02em',
            }}>
              {session.partner}
            </span>
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10,
            fontSize: 11.5, color: 'var(--muted)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span>{formatDate(session.date)}</span>
            <span>·</span>
            <span>{session.region}</span>
            <span>·</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Users size={11} />
              {session.actual_participants} / {session.expected_participants}{' '}
              {t('training.attended', { defaultValue: 'attended' })}
            </span>
            {rate != null && (
              <>
                <span>·</span>
                <span style={{ fontWeight: 500, color: rateColor }}>
                  {rate.toFixed(0)}% {t('training.rate', { defaultValue: 'rate' })}
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              {t('training.colAttended', { defaultValue: 'Attended' })}
            </p>
            <p style={{
              fontWeight: 700, color: 'var(--ink)', margin: 0,
              fontVariantNumeric: 'tabular-nums', fontSize: 16,
            }}>
              {session.actual_participants}
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--muted)' }}>
                /{session.expected_participants}
              </span>
            </p>
          </div>
          <ChevronDown
            size={16}
            style={{
              color: 'var(--muted)',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform var(--dur-q)',
            }}
          />
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--hair)' }}>
          {(session.attendances ?? []).length === 0 ? (
            <p style={{ padding: '14px 20px', fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              {t('training.noAttendance', { defaultValue: 'No attendance records.' })}
            </p>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  {[
                    t('training.thName',     { defaultValue: 'Name' }),
                    t('training.thRole',     { defaultValue: 'Role' }),
                    t('training.thAttended', { defaultValue: 'Attended' }),
                    t('training.thResult',   { defaultValue: 'Result' }),
                  ].map((h) => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {(session.attendances ?? []).map((a: TrainingAttendance) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      {a.participant_name}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.role_display}</td>
                    <td>
                      <span style={{
                        fontSize: 12, fontWeight: 500,
                        color: a.attended ? '#015A28' : 'var(--muted)',
                      }}>
                        {a.attended
                          ? `✓ ${t('training.yes', { defaultValue: 'Yes' })}`
                          : `✗ ${t('training.no',  { defaultValue: 'No' })}`}
                      </span>
                    </td>
                    <td>
                      {a.attended
                        ? <StatusBadge status="pass" />
                        : <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

type PartnerFilter = 'all' | 'PHD' | 'Bandhu'

export default function TrainingLog() {
  const { t, i18n } = useTranslation()
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>('all')

  const fmtNum = (n: number) =>
    n.toLocaleString(i18n.language?.startsWith('bn') ? 'bn-BD' : 'en-US')

  const { data: sessions, loading } = usePolling<TrainingSession[]>({
    fetcher: () =>
      api
        .get('/training/sessions/', {
          params: partnerFilter !== 'all' ? { partner: partnerFilter } : undefined,
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 120_000,
  })

  const totalAttended = (sessions ?? []).reduce((s, sess) => s + sess.actual_participants, 0)
  const totalExpected = (sessions ?? []).reduce((s, sess) => s + sess.expected_participants, 0)

  const handleDownloadPDF = async () => {
    try {
      const res = await api.get('/training/summary-pdf/', { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'training-summary.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — user will see nothing downloaded
    }
  }

  const stats = [
    { label: t('training.statSessions',  { defaultValue: 'Sessions' }),       value: fmtNum((sessions ?? []).length) },
    { label: t('training.statAttended',  { defaultValue: 'Total Attended' }), value: fmtNum(totalAttended) },
    { label: t('training.statExpected',  { defaultValue: 'Expected' }),       value: fmtNum(totalExpected) },
    {
      label: t('training.statAvgRate', { defaultValue: 'Avg Rate' }),
      value: totalExpected > 0 ? `${((totalAttended / totalExpected) * 100).toFixed(0)}%` : '—',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* ───── Hero ───── */}
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div className="hero-eyebrow">
              <span className="live-dot" />
              <span>{t('training.eyebrow', { defaultValue: 'CAPACITY · TRAINING' })}</span>
            </div>
            <h1
              className="hero-headline"
              style={{
                fontSize: 'clamp(40px, 5.5vw, 64px)',
                letterSpacing: '-0.03em',
                marginBottom: 10,
              }}
            >
              {t('training.title', { defaultValue: 'Training Log' })}
            </h1>
            <p className="hero-lede" style={{ maxWidth: 640 }}>
              {t('training.subtitle', {
                defaultValue: 'Session records and participant attendance across all three partners.',
              })}
            </p>
          </div>
          <button
            onClick={handleDownloadPDF}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              borderRadius: 999,
              border: '1px solid var(--hair-2)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              padding: '10px 18px',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Download size={14} />
            {t('training.downloadPdf', { defaultValue: 'Download PDF' })}
          </button>
        </div>
      </section>

      {/* ───── Stats grid ───── */}
      <section className="section" style={{ marginTop: -8 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
        }}>
          {stats.map((s) => (
            <div key={s.label} className="card" style={{ padding: 18 }}>
              <p style={{
                fontSize: 30, fontWeight: 700, color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: 0,
              }}>
                {s.value}
              </p>
              <p style={{
                fontSize: 11.5, color: 'var(--muted)', marginTop: 6,
                letterSpacing: '0.02em',
              }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ───── Partner filter ───── */}
      <section className="section" style={{ marginTop: 0 }}>
        <div
          role="tablist"
          aria-label="Partner filter"
          style={{
            display: 'inline-flex', gap: 4,
            padding: 4,
            background: 'var(--surface-2)',
            border: '1px solid var(--hair)',
            borderRadius: 999,
          }}
        >
          {(['all', 'PHD', 'Bandhu'] as PartnerFilter[]).map((p) => {
            const active = partnerFilter === p
            return (
              <button
                key={p}
                role="tab"
                aria-selected={active}
                onClick={() => setPartnerFilter(p)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 13, fontWeight: 500,
                  border: 'none', cursor: 'pointer',
                  background: active ? 'var(--unfpa)' : 'transparent',
                  color: active ? '#fff' : 'var(--ink-3)',
                  transition: 'background var(--dur-q), color var(--dur-q)',
                }}
              >
                {p === 'all' ? t('training.allPartners', { defaultValue: 'All Partners' }) : p}
              </button>
            )
          })}
        </div>
      </section>

      {/* ───── Sessions list ───── */}
      <section className="section" style={{ marginTop: 0, marginBottom: 48 }}>
        {loading && !sessions ? (
          <PageLoader />
        ) : (sessions ?? []).length === 0 ? (
          <div
            className="card"
            style={{
              padding: '48px 16px', textAlign: 'center',
              borderStyle: 'dashed', borderColor: 'var(--hair-2)',
            }}
          >
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              {t('training.empty', { defaultValue: 'No training sessions recorded.' })}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(sessions ?? []).map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
