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
  Clock, MapPin, X, AlertTriangle, HeartHandshake,
} from 'lucide-react'
import { api } from '@/api/client'
import { usePolling } from '@/hooks/usePolling'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { formatDate, formatDateTime } from '@/utils/format'
import { FistulaCornerPanel, FistulaCampaignPanel } from '@/components/fistula/FistulaPanels'
import { PartnerOverlapMap } from '@/components/maps/PartnerOverlapMap'
import { DataSource } from '@/components/ui/DataSource'
import { FistulaVisualizations } from '@/components/ciprb/FistulaVisualizations'
import { MPDSRVisualizations } from '@/components/ciprb/MPDSRVisualizations'
import { MPDSRDistrictMap } from '@/components/ciprb/MPDSRDistrictMap'
import type { MPDSRCase, AuditEntry } from '@/types/index'

// UNFPA branding — every CIPRB page uses UNFPA orange. Partner identity
// comes from the page header / route, not from colour.
const CIPRB_BLUE = '#F96000'

const CAUSE_KEYS = ['pph', 'eclampsia', 'sepsis', 'obstructed_labour', 'other'] as const
const PLACE_KEYS = ['facility', 'home', 'in_transit'] as const

type FistulaTabKey = 'corner' | 'campaign'

// Reporting period presets — default is the contract window per Animesh.
// Annual cycle is for September annual-reporting needs on MPDSR + Fistula.
// TODO: wire to backend query params (date_from / date_to) in a follow-up.
type ReportingPeriodKey = 'contract' | 'annual'

interface ReportingPeriodDef {
  key: ReportingPeriodKey
  // TODO BN: add Bangla translations via i18n keys when copy is finalised
  shortLabel: string  // pill label
  rangeLabel: string  // human-readable range
  from: string        // ISO date
  to: string          // ISO date
}

const REPORTING_PERIODS: ReportingPeriodDef[] = [
  {
    key: 'contract',
    shortLabel: 'Contract',
    rangeLabel: '21 May 2026 → 20 Nov 2026',
    from: '2026-05-21',
    to: '2026-11-20',
  },
]

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
  rehabilitated: number
  rehabPct: number | null
}

interface CornerCaseRow {
  identification_date?: string | null
  diagnosis_date?: string | null
  referral_date?: string | null
  referral_outcome?: string
  surgery_performed?: 'yes' | 'no' | 'pending' | ''
  received_rehab_support?: boolean
  district?: string
}

interface CampaignVisitRow {
  id: string
}

function useFistulaKPIs(
  period: ReportingPeriodDef,
  districtFilter: readonly string[] | null,
): { kpis: KPIs; loading: boolean } {
  const [kpis, setKpis] = useState<KPIs>({ suspected: 0, identified: 0, referred: 0, surgeryDone: 0, rehabilitated: 0, rehabPct: null })
  const [loading, setLoading] = useState(true)
  const periodFrom = period.from
  const periodTo = period.to
  const districtsKey = districtFilter ? districtFilter.join(',') : ''

  useEffect(() => {
    let cancelled = false
    const params: Record<string, string> = { from: periodFrom, to: periodTo }
    if (districtsKey) params.districts = districtsKey
    Promise.allSettled([
      api.get<{ results?: CampaignVisitRow[] } | CampaignVisitRow[]>('/fistula/campaign-visits/', { params }),
      api.get<{ results?: CornerCaseRow[]    } | CornerCaseRow[]>('/fistula/corner-cases/', { params }),
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

      // Client-side district filter as a safety net — backend should also
      // honour ?districts= but until that ships, this keeps the KPIs honest.
      const districtSet = districtFilter ? new Set(districtFilter.map(d => d.toLowerCase())) : null
      const inFilter = (d?: string) => !districtSet || (d && districtSet.has(d.toLowerCase()))

      const campaignFiltered = campaignRows.filter(c => inFilter(c.district))
      const cornerFiltered = cornerRows.filter(c => inFilter(c.district))

      const surgeryDone   = cornerFiltered.filter(c => c.surgery_performed === 'yes').length
      const rehabilitated = cornerFiltered.filter(c => c.received_rehab_support === true).length
      // Animesh's funnel rule: each stage % uses the previous stage as
      // denominator. Rehab is the stage after surgery, so denominator =
      // surgeryDone. Null when surgeryDone == 0 (avoid /0 nonsense).
      const rehabPct = surgeryDone > 0 ? (rehabilitated / surgeryDone) * 100 : null

      setKpis({
        suspected:   campaignFiltered.length,
        identified:  cornerFiltered.filter(c => c.identification_date || c.diagnosis_date).length,
        referred:    cornerFiltered.filter(c => c.referral_date || (c.referral_outcome ?? '').trim() !== '').length,
        surgeryDone,
        rehabilitated,
        rehabPct,
      })
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [periodFrom, periodTo, districtsKey])

  return { kpis, loading }
}

function KPITile({
  icon, label, sub, value,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  value: number | string
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
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</div>
    </div>
  )
}

// Placeholder variant of KPITile — value is rendered as an em-dash and the
// whole tile uses muted colour + softer surface so it visually reads as
// "metric is on the roadmap, definition pending" rather than "we have data".
function PendingKPITile({
  icon, label, sub,
}: {
  icon: React.ReactNode
  label: string
  sub: string
}) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'var(--surface-2)',
        borderStyle: 'dashed',
      }}
      aria-label={`${label} — definition pending`}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 6,
          background: 'var(--surface-3)', color: 'var(--muted)',
        }}>
          {icon}
        </span>
        {label}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 800, color: 'var(--muted)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        —
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{sub}</div>
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

function MPDSRSection({
  period,
  districts,
}: {
  period: ReportingPeriodDef
  districts: readonly string[] | null
}) {
  const { t } = useTranslation()
  const [causeFilter, setCauseFilter] = useState<CauseFilter>('all')
  const [selectedCase, setSelectedCase] = useState<MPDSRCase | null>(null)
  const districtsKey = districts ? districts.join(',') : ''

  const { data: cases, loading } = usePolling<MPDSRCase[]>({
    fetcher: () =>
      api
        .get('/mpdsr/cases/', {
          params: {
            ...(causeFilter !== 'all' ? { cause_of_death: causeFilter } : {}),
            ...(districtsKey ? { districts: districtsKey } : {}),
            from: period.from,
            to: period.to,
          },
        })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data.results ?? [])),
    interval: 60_000,
    // Re-fetch when the reporting period or donor filter changes so the
    // cases table and counts re-derive against the selected window.
    deps: [causeFilter, period.from, period.to, districtsKey],
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

        {/* Period indicator — makes the active reporting window obvious
            above the MPDSR visualisations. TODO BN: translate label. */}
        <p style={{
          marginTop: 10, marginBottom: 0,
          fontSize: 13, color: 'var(--ink-3)', fontWeight: 500,
        }}>
          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Period: </span>
          <span style={{ color: CIPRB_BLUE, fontWeight: 600 }}>{period.rangeLabel}</span>
        </p>

        {overdueCount > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(204,106,0,0.10)',
              border: '1px solid rgba(204,106,0,0.32)',
              color: '#AE4300',
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
      <div>
        <MPDSRDistrictMap />
        <DataSource>CIPRB M&E Framework · GAC (5) + SIDA (6) confirmed by Rafi 2026-06-02 · CP-10 from 10th UNFPA Bangladesh CPE Report (para 491)</DataSource>
      </div>

      {/* ─── Visualizations: Notify vs Review · Cause breakdown · Response Plan ─── */}
      <MPDSRVisualizations cases={cases ?? []} period={{ from: period.from, to: period.to }} />

      {/* Cause panels REMOVED per Rafi 2026-06-02 — Maternal Causes pie
          inside MPDSRVisualizations already shows the same breakdown with
          ICD-10 buckets; these duplicate cards were redundant. */}
      {false && (
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
                background: active ? 'rgba(249,96,0,0.08)' : 'var(--surface)',
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

      )}
      {/* Place pills REMOVED — Animesh's 2026-06-02 spec keeps the page
          focused on the MPDSR funnel + Response Plan. Place-of-death is
          a drill-down field on the case audit drawer, not a dashboard tile. */}

      {/* Cases table — collapsed by default so the page isn't too long to scroll */}
      {loading && !cases ? (
        <PageLoader />
      ) : (
        <details style={{
          border: '1px solid var(--hair)', borderRadius: 12,
          background: 'var(--surface)',
        }}>
          <summary style={{
            padding: '14px 18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontWeight: 600, fontSize: 14, color: 'var(--ink)',
            listStyle: 'none',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <ClipboardList size={16} color={CIPRB_BLUE} />
              {t('ciprbExtras.rawMpdsr')}
              <span style={{
                marginLeft: 6,
                fontSize: 11, color: 'var(--muted)', fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}>
                ({t('ciprbExtras.casesCount', { count: (cases ?? []).length })})
              </span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em' }}>
              {t('ciprbExtras.clickToExpand')}
            </span>
          </summary>
          <div style={{ overflowX: 'auto', borderTop: '1px solid var(--hair)' }}>
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
        </details>
      )}

      {selectedCase && (
        <MPDSRAuditDrawer kase={selectedCase} onClose={() => setSelectedCase(null)} />
      )}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

// Donor filter — Animesh asked for one-click GAC and SIDA pills.
// Districts confirmed by Rafi 2026-06-02 (override Sayed's earlier
// 3-district mention in meeting minutes).
const DONOR_FILTERS = {
  all:  { label: 'All',  districts: null as string[] | null },
  GAC:  {
    label: 'GAC',
    districts: ['Sunamganj', 'Bhola', 'Sherpur', 'Kurigram', 'Khagrachari'],
  },
  SIDA: {
    label: 'SIDA',
    districts: ['Noakhali', 'Chandpur', 'Bandarban', 'Dhaka', 'Sunamganj', "Cox's Bazar"],
  },
} as const
type DonorKey = keyof typeof DONOR_FILTERS

export default function CIPRBDashboard() {
  const { t } = useTranslation()
  const [active, setActive] = useState<FistulaTabKey>('corner')
  const [periodKey, setPeriodKey] = useState<ReportingPeriodKey>('contract')
  const [donorKey, setDonorKey] = useState<DonorKey>('all')
  const reduce = useReducedMotion()
  const activeTab = FISTULA_TABS.find((tab) => tab.key === active)!
  const activePeriod = REPORTING_PERIODS.find((p) => p.key === periodKey)!
  const activeDonor = DONOR_FILTERS[donorKey]
  const { kpis } = useFistulaKPIs(activePeriod, activeDonor.districts)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* ───────────────── Hero ───────────────── */}
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>{t('ciprb.heroEyebrow', { defaultValue: 'CIPRB · IMPLEMENTING PARTNER' })}</span>
        </div>

        <div className="hero-grid">
          <div>
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
              {t('ciprbExtras.subtitle')}
            </p>
            <p className="hero-lede anim-rise d2" style={{ maxWidth: 720 }}>
              {t('ciprb.heroLede')}
            </p>
          </div>

          <div className="hero-right anim-rise d4">
            <div className="kicker" style={{ marginBottom: 8 }}>
              <span className="dot" style={{ background: CIPRB_BLUE }} />COVERAGE
            </div>
            <div className="card shimmer" style={{ padding: 10 }}>
              <PartnerOverlapMap
                height={340}
                partner="CIPRB"
                subgroups={[
                  {
                    name: 'GAC',
                    color: '#F96000',
                    districts: ['Sunamganj', 'Bhola', 'Sherpur', 'Kurigram', 'Khagrachari'],
                  },
                  {
                    name: 'SIDA',
                    color: '#2171EC',
                    districts: ['Noakhali', 'Chandpur', 'Bandarban', 'Dhaka', 'Sunamganj', "Cox's Bazar"],
                  },
                ]}
              />
            </div>
          </div>
        </div>

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
            background: 'rgba(249,96,0,0.10)',
            color: CIPRB_BLUE,
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            border: '1px solid rgba(249,96,0,0.20)',
          }}>
            {t('ciprbExtras.jumpFistula')}
          </a>
          <a href="#mpdsr-section" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(249,96,0,0.10)',
            color: CIPRB_BLUE,
            fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
            border: '1px solid rgba(249,96,0,0.20)',
          }}>
            {t('ciprbExtras.jumpMpdsr')}
          </a>
          {/* Jump-to-Response-Plan pill removed — tracker is hidden until
              a Kobo form is wired for live executed-count submissions. */}
        </div>

        {/* ─── Reporting period toggle ───
            Per Animesh Q8: default stays contract window; MPDSR + Fistula
            need to be filterable for the annual cycle ahead of September
            annual reporting. Visual toggle for Wednesday MVP — backend
            wiring is a follow-up.
            TODO BN: add Bangla copy via i18n. Latin acronyms stay Latin. */}
        <div
          role="radiogroup"
          aria-label="Reporting period"
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
            marginTop: 16,
          }}
        >
          <span style={{
            fontSize: 11, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
          }}>
            {/* TODO BN */}
            Reporting period
          </span>
          {REPORTING_PERIODS.map((p) => {
            const isActive = periodKey === p.key
            return (
              <button
                key={p.key}
                role="radio"
                aria-checked={isActive}
                onClick={() => setPeriodKey(p.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 999,
                  background: isActive ? 'rgba(249,96,0,0.10)' : 'var(--surface-2)',
                  color: isActive ? CIPRB_BLUE : 'var(--ink-3)',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  border: isActive
                    ? '1px solid rgba(249,96,0,0.32)'
                    : '1px solid var(--hair)',
                  cursor: 'pointer',
                  transitionProperty: 'background-color, color, border-color',
                  transitionDuration: '180ms',
                }}
              >
                <span>{p.shortLabel}</span>
                <span style={{
                  color: isActive ? CIPRB_BLUE : 'var(--muted)',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  · {p.rangeLabel}
                </span>
              </button>
            )
          })}
        </div>

        {/* ─── Donor filter pills (Animesh's one-click GAC/SIDA ask) ─── */}
        <div
          role="radiogroup"
          aria-label="Donor filter"
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
            marginTop: 12,
          }}
        >
          <span style={{
            fontSize: 11, color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
          }}>
            Donor
          </span>
          {(Object.keys(DONOR_FILTERS) as DonorKey[]).map((k) => {
            const cfg = DONOR_FILTERS[k]
            const isActive = donorKey === k
            return (
              <button
                key={k}
                role="radio"
                aria-checked={isActive}
                onClick={() => setDonorKey(k)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 999,
                  background: isActive ? 'rgba(249,96,0,0.10)' : 'var(--surface-2)',
                  color: isActive ? CIPRB_BLUE : 'var(--ink-3)',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  border: isActive
                    ? '1px solid rgba(249,96,0,0.32)'
                    : '1px solid var(--hair)',
                  cursor: 'pointer',
                  transitionProperty: 'background-color, color, border-color',
                  transitionDuration: '180ms',
                }}
              >
                <span>{cfg.label}</span>
                {cfg.districts && (
                  <span style={{
                    color: isActive ? CIPRB_BLUE : 'var(--muted)',
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    · {cfg.districts.length} districts
                  </span>
                )}
              </button>
            )
          })}
        </div>

      </section>

      {/* ───────────────── Fistula KPI band ───────────────── */}
      <section className="section" id="fistula-section" style={{ marginTop: 0, scrollMarginTop: 80 }}>
        <div className="kicker" style={{ marginBottom: 10 }}>
          <span className="dot" style={{ background: CIPRB_BLUE }} />
          {t('ciprbExtras.fistulaGlance')}
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
          {/* Rehabilitation % — Animesh's definition from the 2026-06-01
              meeting: rehabilitated = any of cash / training / psychosocial /
              reintegration / 5 other support types is Yes. Denominator =
              operated patients (previous funnel stage). */}
          {kpis.rehabPct != null ? (
            <KPITile
              icon={<HeartHandshake size={14} />}
              label={t('ciprb.kpiRehab')}
              sub={`${kpis.rehabilitated} of ${kpis.surgeryDone} operated`}
              value={`${Math.round(kpis.rehabPct)}%`}
            />
          ) : (
            <PendingKPITile
              icon={<HeartHandshake size={14} />}
              label={t('ciprb.kpiRehab')}
              sub={t('ciprb.kpiRehabSub')}
            />
          )}
        </div>
        <DataSource>KF-Fistula_Corner.xlsx · KF-Fistula_Campaign_Visit.xlsx</DataSource>
      </section>

      {/* ───────────────── Fistula visualizations (campaign / funnel / pie) ───────────────── */}
      <section className="section" style={{ marginTop: 8 }}>
        <FistulaVisualizations period={{ from: activePeriod.from, to: activePeriod.to }} districts={activeDonor.districts} />
      </section>

      {/* ───────────────── Fistula registers (collapsible — raw data) ───────────────── */}
      <section className="section" style={{ marginTop: 8 }}>
        <details style={{
          border: '1px solid var(--hair)', borderRadius: 12,
          background: 'var(--surface)', padding: 0,
        }}>
          <summary style={{
            padding: '14px 18px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontWeight: 600, fontSize: 14, color: 'var(--ink)',
            listStyle: 'none',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <ClipboardList size={16} color={CIPRB_BLUE} />
              {t('ciprbExtras.rawFistula')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.06em' }}>
              {t('ciprbExtras.clickToExpand')}
            </span>
          </summary>
          <div style={{ padding: 18, borderTop: '1px solid var(--hair)' }}>
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
          </div>
        </details>
      </section>

      {/* ───────────────── Divider ───────────────── */}
      <div style={{ height: 1, background: 'var(--hair)', margin: '24px 0' }} />

      {/* ───────────────── MPDSR ───────────────── */}
      <section className="section" id="mpdsr-section" style={{ marginBottom: 80, scrollMarginTop: 80 }}>
        <MPDSRSection period={activePeriod} districts={activeDonor.districts} />
      </section>
    </div>
  )
}
