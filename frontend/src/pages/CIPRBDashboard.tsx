/**
 * CIPRB Dashboard — unified partner page for CIPRB, mirroring the
 * structure of /phd and /bondhu but composing CIPRB-owned surveillance
 * surfaces:
 *
 *   1. Fistula KPI band     (Suspected / Identified / Referred / Surgery Done)
 *   2. Fistula registers    (Corner + Campaign tabs)
 *   3. MPDSR surveillance   (cause panels, place pills, overdue, cases table)
 *
 * Baseline Assessment lives at /baseline so it isn't repeated here.
 *
 * Per Animesh: "MPDSR and Fistula will be in one page. It will be named
 * CIPRB Dashboard, like the other two orgs."
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import {
  ClipboardList, Megaphone, Search, Stethoscope, Send, Scissors,
  Clock, MapPin, X, AlertTriangle,
} from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate, formatDateTime } from '@/utils/format'
import { FistulaCornerPanel, FistulaCampaignPanel } from '@/components/fistula/FistulaPanels'
import { FistulaVisualizations } from '@/components/ciprb/FistulaVisualizations'
import { MPDSRVisualizations } from '@/components/ciprb/MPDSRVisualizations'
import { MPDSRDistrictMap } from '@/components/ciprb/MPDSRDistrictMap'
import type { MPDSRCase, AuditEntry } from '@/types/index'

const CIPRB_BLUE = '#0072BC'

const CAUSE_KEYS = ['pph', 'eclampsia', 'sepsis', 'obstructed_labour', 'other'] as const
const PLACE_KEYS = ['facility', 'home', 'in_transit'] as const

type FistulaTabKey = 'corner' | 'campaign'

interface FistulaTabDef {
  key: FistulaTabKey
  labelKey: string
  icon: React.ReactNode
}

const FISTULA_TABS: FistulaTabDef[] = [
  { key: 'corner',   labelKey: 'ciprb.tabCorner',   icon: <ClipboardList size={16} /> },
  { key: 'campaign', labelKey: 'ciprb.tabCampaign', icon: <Megaphone size={16} /> },
]

// ─── Fistula KPI helpers ─────────────────────────────────────────────────────

interface KPIs {
  suspected: number
  identified: number
  referred: number
  surgeryDone: number
}

interface CornerCaseRow {
  identification_date?: string | null
  diagnosis_date?: string | null
  referral_date?: string | null
  referral_outcome?: string
  surgery_performed?: 'yes' | 'no' | 'pending' | ''
}

interface CampaignVisitRow {
  id: string
}

function useFistulaKPIs(): { kpis: KPIs; loading: boolean } {
  const [kpis, setKpis] = useState<KPIs>({ suspected: 0, identified: 0, referred: 0, surgeryDone: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<{ results?: CampaignVisitRow[] } | CampaignVisitRow[]>('/fistula/campaign-visits/'),
      api.get<{ results?: CornerCaseRow[]    } | CornerCaseRow[]>('/fistula/corner-cases/'),
    ]).then(([campaignRes, cornerRes]) => {
      if (cancelled) return

      const campaignRows: CampaignVisitRow[] =
        campaignRes.status === 'fulfilled'
          ? (Array.isArray(campaignRes.value.data)
              ? campaignRes.value.data
              : campaignRes.value.data.results ?? [])
          : []

      const cornerRows: CornerCaseRow[] =
        cornerRes.status === 'fulfilled'
          ? (Array.isArray(cornerRes.value.data)
              ? cornerRes.value.data
              : cornerRes.value.data.results ?? [])
          : []

      setKpis({
        suspected:   campaignRows.length,
        identified:  cornerRows.filter(c => c.identification_date || c.diagnosis_date).length,
        referred:    cornerRows.filter(c => c.referral_date || (c.referral_outcome ?? '').trim() !== '').length,
        surgeryDone: cornerRows.filter(c => c.surgery_performed === 'yes').length,
      })
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { kpis, loading }
}

function KPITile({
  icon, label, sub, value,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  value: number
}) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 6,
          background: `${CIPRB_BLUE}1A`, color: CIPRB_BLUE,
        }}>
          {icon}
        </span>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 800, color: 'var(--ink)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</div>
    </div>
  )
}

// ─── MPDSR audit drawer ──────────────────────────────────────────────────────

function pascal(k: string): string {
  return k.split('_').map(p => p[0].toUpperCase() + p.slice(1)).join('')
}

function MPDSRAuditDrawer({ kase, onClose }: { kase: MPDSRCase; onClose: () => void }) {
  const { t } = useTranslation()
  const placeLabel = (k: string) => t(`mpdsr.place${pascal(k)}`, { defaultValue: k })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          height: '100%', width: '100%', maxWidth: 440,
          overflowY: 'auto',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--hair)',
          boxShadow: 'var(--sh-3)',
        }}
      >
        <div style={{
          position: 'sticky', top: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--hair)',
          zIndex: 1,
        }}>
          <div>
            <h2 style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 15, margin: 0 }}>
              {t('mpdsr.drawerAuditTrail')}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {t('mpdsr.drawerCase')} {kase.case_hash.slice(0, 8)}…
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 999,
              background: 'var(--surface-2)',
              border: '1px solid var(--hair)',
              color: 'var(--ink-3)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 16, background: 'var(--surface-2)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <SummaryRow label={t('mpdsr.drawerForm')} value={kase.sub_form_label || kase.sub_form_type} span={2} />
              <SummaryRow label={t('mpdsr.drawerType')} value={kase.death_type_display} />
              <SummaryRow label={t('mpdsr.drawerPlace')} value={placeLabel(kase.place_of_death)} />
              <SummaryRow label={t('mpdsr.drawerDistrict')} value={kase.district} />
              {kase.upazila && <SummaryRow label={t('mpdsr.drawerUpazila')} value={kase.upazila} />}
              {kase.facility_name && <SummaryRow label={t('mpdsr.drawerFacility')} value={kase.facility_name} span={2} />}
              <SummaryRow label={t('mpdsr.drawerDateOfDeath')} value={formatDate(kase.date_of_death) || '—'} />
              {kase.age_years != null && (
                <SummaryRow label={t('mpdsr.drawerAge')} value={t('mpdsr.drawerAgeYears', { years: kase.age_years })} />
              )}
              {kase.cause_of_death && (
                <SummaryRow label={t('mpdsr.drawerCause')} value={kase.cause_of_death.replace(/ /g, ', ')} span={2} />
              )}
            </div>
          </div>

          <div>
            <div className="kicker" style={{ marginBottom: 12 }}>
              <span className="dot" />{t('mpdsr.drawerTimeline')}
            </div>
            {(kase.audit_trail ?? []).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t('mpdsr.drawerNoAudit')}</p>
            )}
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <span aria-hidden style={{
                position: 'absolute', left: 15, top: 6, bottom: 6,
                width: 1, background: 'var(--hair-2)',
              }} />
              {(kase.audit_trail ?? []).map((entry: AuditEntry, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 14, paddingLeft: 36, position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 10, top: 6,
                    height: 11, width: 11, borderRadius: 999,
                    background: CIPRB_BLUE,
                    boxShadow: '0 0 0 2px var(--surface)',
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
                        {entry.action}
                      </p>
                      <span style={{
                        flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, color: 'var(--muted)',
                      }}>
                        <Clock size={11} />
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{entry.user}</p>
                    {entry.notes && (
                      <p style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
                        {entry.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, span = 1 }: { label: string; value: string; span?: 1 | 2 }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : undefined }}>
      <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>{label}</p>
      <p style={{
        fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginTop: 2,
        wordBreak: 'break-word',
      }}>{value}</p>
    </div>
  )
}

// ─── MPDSR section ───────────────────────────────────────────────────────────

type CauseFilter = 'all' | string

function MPDSRSection() {
  const { t } = useTranslation()
  const [causeFilter, setCauseFilter] = useState<CauseFilter>('all')
  const [selectedCase, setSelectedCase] = useState<MPDSRCase | null>(null)

  const { data: cases, loading } = usePolling<MPDSRCase[]>({
    fetcher: () =>
      api
        .get('/mpdsr/cases/', {
          params: { ...(causeFilter !== 'all' ? { cause_of_death: causeFilter } : {}) },
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
  })

  const causeCounts: Record<string, number> = {}
  const placeCounts: Record<string, number> = {}
  for (const c of cases ?? []) {
    causeCounts[c.cause_of_death] = (causeCounts[c.cause_of_death] ?? 0) + 1
    placeCounts[c.place_of_death] = (placeCounts[c.place_of_death] ?? 0) + 1
  }
  const overdueCount = (cases ?? []).filter(c => c.is_overdue_committee).length

  const causeLabel = (k: string) => t(`mpdsr.cause${pascal(k)}`, { defaultValue: k })
  const placeLabel = (k: string) => t(`mpdsr.place${pascal(k)}`, { defaultValue: k })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Section header */}
      <div>
        <div className="kicker" style={{ marginBottom: 6 }}>
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          {t('mpdsr.eyebrow', { defaultValue: 'TRACKER · MPDSR' })}
        </div>
        <h2 className="section-title" style={{ margin: '0 0 4px' }}>
          {t('mpdsr.title', { defaultValue: 'MPDSR Tracker' })}
        </h2>
        <p className="section-sub">
          {t('mpdsr.subtitle', { defaultValue: 'Maternal & Perinatal Death Surveillance' })}
        </p>

        {overdueCount > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(204,106,0,0.10)',
              border: '1px solid rgba(204,106,0,0.32)',
              color: '#CC6A00',
              fontSize: 12.5, fontWeight: 500,
            }}>
              <AlertTriangle size={13} />
              {t('mpdsr.overdueBadge', {
                count: overdueCount,
                defaultValue: `${overdueCount} overdue committee review${overdueCount === 1 ? '' : 's'}`,
              })}
            </span>
          </div>
        )}
      </div>

      {/* ─── Geographic coverage map (SIDA / GAC / CP highlight) ─── */}
      <MPDSRDistrictMap />

      {/* ─── Visualizations: Notify vs Review · Cause breakdown · Response Plan ─── */}
      <MPDSRVisualizations cases={cases ?? []} />

      {/* Cause panels (filter shortcuts above the cases table) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
      }}>
        {CAUSE_KEYS.map((key) => {
          const active = causeFilter === key
          return (
            <button
              key={key}
              onClick={() => setCauseFilter(active ? 'all' : key)}
              className="card"
              style={{
                padding: 16,
                textAlign: 'left',
                cursor: 'pointer',
                background: active ? 'rgba(0,114,188,0.08)' : 'var(--surface)',
                borderColor: active ? CIPRB_BLUE : 'var(--hair)',
                transition: 'border-color var(--dur-q), background var(--dur-q)',
              }}
            >
              <div style={{
                fontSize: 26, fontWeight: 700, color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {causeCounts[key] ?? 0}
              </div>
              <div style={{
                fontSize: 11.5, color: 'var(--muted)', marginTop: 4,
                letterSpacing: '0.02em',
              }}>
                {causeLabel(key)}
              </div>
            </button>
          )
        })}
      </div>

      {/* Place pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {PLACE_KEYS.map((key) => (
          <div key={key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13,
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 999,
              background: 'rgba(0,114,188,0.10)',
              color: CIPRB_BLUE,
              fontSize: 11, fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {placeCounts[key] ?? 0}
            </span>
            <span style={{ color: 'var(--ink-3)' }}>{placeLabel(key)}</span>
          </div>
        ))}
      </div>

      {/* Cases table */}
      {loading && !cases ? (
        <PageLoader />
      ) : (
        <div className="card flush" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  {[
                    t('mpdsr.thCaseId'),
                    t('mpdsr.thForm'),
                    t('mpdsr.thDistrict'),
                    t('mpdsr.thDate'),
                    t('mpdsr.thType'),
                    t('mpdsr.thStatus'),
                    t('mpdsr.thAudit'),
                  ].map((h) => (<th key={h}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {(cases ?? []).map((c) => (
                  <tr
                    key={c.id}
                    style={c.is_overdue_committee
                      ? { background: 'rgba(204,106,0,0.08)' }
                      : undefined}
                  >
                    <td>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {c.case_hash.slice(0, 12)}…
                      </span>
                    </td>
                    <td style={{
                      maxWidth: 160, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--ink-3)', fontSize: 12.5,
                    }} title={c.sub_form_label}>
                      {c.sub_form_label || c.sub_form_type || '—'}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        color: 'var(--ink-3)',
                      }}>
                        <MapPin size={12} style={{ color: 'var(--muted)' }} />
                        {c.district}{c.upazila ? `, ${c.upazila}` : ''}
                      </span>
                    </td>
                    <td style={{ color: 'var(--ink-3)' }}>{formatDate(c.date_of_death)}</td>
                    <td style={{ color: 'var(--ink-3)' }}>{c.death_type_display}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      <button
                        onClick={() => setSelectedCase(c)}
                        style={{
                          fontSize: 12, fontWeight: 500,
                          color: CIPRB_BLUE,
                          background: 'transparent', border: 'none',
                          padding: 0, cursor: 'pointer',
                          textDecoration: 'underline', textUnderlineOffset: 2,
                        }}
                      >
                        {t('mpdsr.view')} ({(c.audit_trail ?? []).length})
                      </button>
                    </td>
                  </tr>
                ))}
                {(cases ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} style={{
                      textAlign: 'center',
                      padding: '48px 16px',
                      fontSize: 13, color: 'var(--muted)',
                    }}>
                      {t('mpdsr.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCase && (
        <MPDSRAuditDrawer kase={selectedCase} onClose={() => setSelectedCase(null)} />
      )}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CIPRBDashboard() {
  const { t } = useTranslation()
  const [active, setActive] = useState<FistulaTabKey>('corner')
  const reduce = useReducedMotion()
  const activeTab = FISTULA_TABS.find((tab) => tab.key === active)!
  const { kpis } = useFistulaKPIs()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* ───────────────── Hero ───────────────── */}
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>{t('ciprb.heroEyebrow', { defaultValue: 'CIPRB · IMPLEMENTING PARTNER' })}</span>
        </div>
        <h1
          className="hero-headline anim-rise d1"
          style={{
            marginBottom: 6,
            fontSize: 'clamp(56px, 9vw, 132px)',
            letterSpacing: '-0.035em',
            fontStyle: 'normal',
            fontWeight: 800,
            color: CIPRB_BLUE,
          }}
        >
          CIPRB
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--ink-3)', marginTop: 4, marginBottom: 14,
          letterSpacing: '0.01em', fontWeight: 500,
        }} className="anim-rise d1">
          Centre for Injury Prevention and Research, Bangladesh
        </p>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 720 }}>
          {t('ciprb.heroLede')}
        </p>

        {/* Jump-link strip — Animesh's two named surveillance programmes
            need to be discoverable without scrolling past three Fistula
            visualisations to find MPDSR. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          marginTop: 18,
        }}>
          <a href="#fistula-section" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(0,114,188,0.10)',
            color: CIPRB_BLUE,
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            border: '1px solid rgba(0,114,188,0.20)',
          }}>
            Jump to Fistula
          </a>
          <a href="#mpdsr-section" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(0,114,188,0.10)',
            color: CIPRB_BLUE,
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            border: '1px solid rgba(0,114,188,0.20)',
          }}>
            Jump to MPDSR
          </a>
          <a href="#response-plan" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(204,106,0,0.10)',
            color: '#CC6A00',
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            border: '1px solid rgba(204,106,0,0.22)',
          }}>
            Jump to Response Plan Tracker
          </a>
        </div>
      </section>

      {/* ───────────────── Fistula KPI band ───────────────── */}
      <section className="section" id="fistula-section" style={{ marginTop: 0, scrollMarginTop: 80 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          FISTULA · AT A GLANCE
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          <KPITile icon={<Search size={14} />}     label={t('ciprb.kpiSuspected')}    sub={t('ciprb.kpiSuspectedSub')}    value={kpis.suspected}   />
          <KPITile icon={<Stethoscope size={14} />} label={t('ciprb.kpiIdentified')}  sub={t('ciprb.kpiIdentifiedSub')}   value={kpis.identified}  />
          <KPITile icon={<Send size={14} />}        label={t('ciprb.kpiReferred')}    sub={t('ciprb.kpiReferredSub')}     value={kpis.referred}    />
          <KPITile icon={<Scissors size={14} />}    label={t('ciprb.kpiSurgeryDone')} sub={t('ciprb.kpiSurgeryDoneSub')}  value={kpis.surgeryDone} />
        </div>
      </section>

      {/* ───────────────── Fistula visualizations (campaign / funnel / pie) ───────────────── */}
      <section className="section" style={{ marginTop: 8 }}>
        <FistulaVisualizations />
      </section>

      {/* ───────────────── Fistula registers (tabs) ───────────────── */}
      <section className="section" style={{ marginTop: 8 }}>
        <div
          role="tablist"
          aria-label="CIPRB Fistula registers"
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
            padding: 6,
            background: 'var(--surface-2)',
            borderRadius: 14,
            border: '1px solid var(--hair)',
            width: 'fit-content',
            marginBottom: 20,
          }}
        >
          {FISTULA_TABS.map((tab) => {
            const isActive = active === tab.key
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(tab.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px',
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#fff' : 'var(--ink-2)',
                  background: isActive ? CIPRB_BLUE : 'transparent',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transitionProperty: 'background-color, color',
                  transitionDuration: '180ms',
                }}
              >
                {tab.icon}
                <span>{t(tab.labelKey)}</span>
              </button>
            )
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab.key}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: reduce ? 0 : -6, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
          >
            {activeTab.key === 'corner' ? <FistulaCornerPanel /> : <FistulaCampaignPanel />}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* ───────────────── Divider ───────────────── */}
      <div style={{ height: 1, background: 'var(--hair)', margin: '24px 0' }} />

      {/* ───────────────── MPDSR ───────────────── */}
      <section className="section" id="mpdsr-section" style={{ marginBottom: 80, scrollMarginTop: 80 }}>
        <MPDSRSection />
      </section>
    </div>
  )
}
