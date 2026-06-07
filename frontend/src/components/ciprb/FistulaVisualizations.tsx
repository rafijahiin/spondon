/**
 * Fistula visualizations — three graphical surfaces per Animesh's spec:
 *
 *   1. CampaignMetrics — cumulative reach tiles (districts, upazilas,
 *      households visited) sourced from FistulaCampaignVisit.
 *   2. PatientFunnel — visual flow Suspected → Identified → Referred.
 *   3. DiagnosisPie — Animesh's exact three slices: Obstetric Fistula
 *      (VVF) / Iatrogenic Fistula (pending classification) / Other
 *      (RVF, BOTH, OTHER, unconfirmed), from FistulaCornerCase.fistula_type.
 *
 * Replaces "raw numbers" with "immediate programmatic insight at a glance"
 * — the leadership-demo bar.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, MapPin, Home, Users, Search, Stethoscope, Send, ArrowRight, Scissors, Megaphone, HeartHandshake } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { api } from '@/api/client'
import { DataSource } from '@/components/ui/DataSource'

// UNFPA branding — orange across the board.
const CIPRB_BLUE = '#F96000'
const CIPRB_BLUE_SOFT = 'rgba(249,96,0,0.10)'

interface CornerCase {
  identification_date?: string | null
  diagnosis_date?: string | null
  referral_date?: string | null
  referral_outcome?: string
  surgery_performed?: 'yes' | 'no' | 'pending' | ''
  surgery_outcome?: 'success_dry' | 'success_not_dry' | 'failed' | ''
  fistula_type?: string  // 'VVF' | 'RVF' | 'BOTH' | 'OTHER' | ''
  fistula_cause?: string // 'Surgical Injury' | 'Prolonged/Obstructed Labour' | etc.
}

interface CampaignVisit {
  id: string
  district?: string
  upazila?: string
  union?: string
  village?: string
}

// FistulaCampaign — daily roll-up (CHW day-reports). This is where the
// 'No of population covered' + 'No of Households Visited' totals live,
// per the xlsx 'Sunamganj-Daily Data Sheet' shape. The suspected/
// confirmed/referred fields here are the authoritative campaign-side
// numbers — Patient Funnel reads them from this source.
interface CampaignRollup {
  district?: string
  upazila?: string
  households_visited?: number
  population_covered?: number
  suspected_fistula_cases?: number
  confirmed_fistula_cases?: number
  cases_referred?: number
}

interface AggregateData {
  // Campaign reach
  campaigns: number
  districts: number
  upazilas: number
  households: number
  population: number
  campaignSuspected: number
  campaignDiagnosed: number
  // Funnel — CIPRB's 5-stage pipeline:
  //   Suspected → Diagnosed → Referred for Surgical Management →
  //   Surgically Repaired → Rehabilitated & Reintegrated
  suspected: number
  identified: number
  referred: number
  repaired: number
  rehabilitated: number
  // Surgical outcome — 3 categories; the two successful are reported.
  outcomeDry: number
  outcomeNotDry: number
  outcomeFailed: number
  // Diagnosis pie — 4 fistula types per CIPRB Fistula Question Bank.
  pieObstetric: number
  pieIatrogenic: number
  pieCongenital: number
  pieTraumatic: number
  piePending: number     // no diagnosis_date — kept out of pie, shown beside it
}

const EMPTY: AggregateData = {
  campaigns: 0, districts: 0, upazilas: 0, households: 0, population: 0,
  campaignSuspected: 0, campaignDiagnosed: 0,
  suspected: 0, identified: 0, referred: 0, repaired: 0, rehabilitated: 0,
  outcomeDry: 0, outcomeNotDry: 0, outcomeFailed: 0,
  pieObstetric: 0, pieIatrogenic: 0, pieCongenital: 0, pieTraumatic: 0,
  piePending: 0,
}

export interface ReportingPeriod {
  from: string
  to: string
}

function useFistulaAggregates(
  period?: ReportingPeriod,
  districts?: readonly string[] | null,
): AggregateData {
  const [data, setData] = useState<AggregateData>(EMPTY)
  const periodFrom = period?.from
  const periodTo = period?.to
  const districtsKey = districts ? districts.join(',') : ''
  const districtSet = districts ? new Set(districts.map(d => d.toLowerCase())) : null

  useEffect(() => {
    let cancelled = false
    const params: Record<string, string> = {}
    if (periodFrom) params.from = periodFrom
    if (periodTo) params.to = periodTo
    if (districtsKey) params.districts = districtsKey
    Promise.allSettled([
      api.get<{ results?: CampaignVisit[] } | CampaignVisit[]>('/fistula/campaign-visits/', { params }),
      api.get<{ results?: CornerCase[]    } | CornerCase[]>('/fistula/corner-cases/', { params }),
      api.get<{ results?: CampaignRollup[] } | CampaignRollup[]>('/fistula/cases/', { params }),
      // The monotonic pipeline from CIPRBFistulaCase.current_stage — the
      // single source of truth for the 5 funnel stages (replaces the
      // legacy dual-source split that broke monotonicity).
      api.get<{ pipeline?: Record<string, number> }>('/fistula/aggregates/', { params }),
    ]).then(([campaignRes, cornerRes, rollupRes, aggRes]) => {
      if (cancelled) return
      const pipeline = (aggRes.status === 'fulfilled' && aggRes.value.data.pipeline) || null

      const campaign: CampaignVisit[] =
        campaignRes.status === 'fulfilled'
          ? (Array.isArray(campaignRes.value.data)
              ? campaignRes.value.data
              : campaignRes.value.data.results ?? [])
          : []

      const corner: CornerCase[] =
        cornerRes.status === 'fulfilled'
          ? (Array.isArray(cornerRes.value.data)
              ? cornerRes.value.data
              : cornerRes.value.data.results ?? [])
          : []

      const rollupsAll: CampaignRollup[] =
        rollupRes.status === 'fulfilled'
          ? (Array.isArray(rollupRes.value.data)
              ? rollupRes.value.data
              : rollupRes.value.data.results ?? [])
          : []

      // Client-side donor filter — until ?districts= is honoured by all
      // endpoints, restrict aggregates to the selected donor's districts.
      const inFilter = (d?: string) =>
        !districtSet || (d != null && districtSet.has(d.toLowerCase()))
      const campaignFil = campaign.filter(c => inFilter(c.district))
      const cornerFil = corner.filter(c => inFilter(c.district))
      const rollups = rollupsAll.filter(r => inFilter(r.district))

      // Districts/upazilas drawn from BOTH sources — daily roll-ups give
      // wider coverage; individual visits add specifics. Households +
      // population come from the daily roll-up totals (authoritative per
      // Animesh's spec and the xlsx column headings).
      const allDistricts = new Set<string>()
      const allUpazilas = new Set<string>()
      for (const r of [...campaignFil, ...rollups]) {
        const d = (r.district ?? '').trim()
        if (d) allDistricts.add(d)
        const u = (r.upazila ?? '').trim()
        if (d && u) allUpazilas.add(`${d}|${u}`)
      }
      const households = rollups.reduce((s, r) => s + (r.households_visited ?? 0), 0)
      const population = rollups.reduce((s, r) => s + (r.population_covered ?? 0), 0)
      // Campaign aggregate counts (Animesh's spec: # campaigns, suspected,
      // diagnosed found during campaigns).
      const campaigns = rollups.length
      const campaignSuspected = rollups.reduce((s, r) => s + (r.suspected_fistula_cases ?? 0), 0)
      const campaignDiagnosed = rollups.reduce((s, r) => s + (r.confirmed_fistula_cases ?? 0), 0)

      // Patient Funnel sources — fixed after audit:
      //   Suspected — from daily campaign roll-ups (CHWs noting suspected
      //     patients during outreach), NOT individual visit register.
      //     Sayeed's Mass Campaign Excel writes this sum directly.
      //   Identified — Fistula Corner cases that have a diagnosis date.
      //   Referred — Fistula Corner cases sent on for surgery. Most Excel-
      //     imported rows don't carry a referral_date yet; once a Kobo
      //     referral form lands this will populate.
      const suspected = rollups.reduce((s, r) => s + (r.suspected_fistula_cases ?? 0), 0)
      const identified = cornerFil.filter(c => c.identification_date || c.diagnosis_date).length
      const referred   = cornerFil.filter(c => c.referral_date || (c.referral_outcome ?? '').trim() !== '').length
      const repaired   = cornerFil.filter(c => c.surgery_performed === 'yes').length
      // Rehabilitated & Reintegrated — the new 5th stage per CIPRB.
      // Source field (`rehabilitation_received`) will be populated by the
      // new CIPRB Fistula Question Bank form. Until that form ships,
      // count stays 0 — empty-state shows on the card.
      const rehabilitated = cornerFil.filter((c: any) =>
        c.rehabilitation_received === 'yes' || c.rehabilitation_date,
      ).length
      // Surgical outcome categories (dry / not-dry / failed)
      const outcomeDry    = cornerFil.filter(c => c.surgery_outcome === 'success_dry').length
      const outcomeNotDry = cornerFil.filter(c => c.surgery_outcome === 'success_not_dry').length
      const outcomeFailed = cornerFil.filter(c => c.surgery_outcome === 'failed').length

      // Diagnosis pie — 4 fistula-type slices per CIPRB Fistula Question
      // Bank: Obstetric, Iatrogenic, Congenital, Traumatic (the legacy
      // "Other" bucket has been retired). Classification keys off
      // `fistula_type_v2` (new field on the upcoming CIPRB form) and
      // falls back to the existing `fistula_cause` / `fistula_type`
      // fields for historical rows.
      let pieObstetric = 0
      let pieIatrogenic = 0
      let pieCongenital = 0
      let pieTraumatic = 0
      let piePending = 0
      for (const c of cornerFil) {
        if (!c.diagnosis_date) { piePending++; continue }
        const newType = ((c as any).fistula_type_v2 ?? '').toLowerCase().trim()
        if (newType) {
          if      (newType.startsWith('obs')) pieObstetric++
          else if (newType.startsWith('iat')) pieIatrogenic++
          else if (newType.startsWith('con')) pieCongenital++
          else if (newType.startsWith('tra')) pieTraumatic++
          else piePending++
          continue
        }
        // Legacy fallback — historical rows lack fistula_type_v2.
        const cause = (c.fistula_cause ?? '').toLowerCase().trim()
        if (cause) {
          if (cause.includes('surgical')) pieIatrogenic++
          else if (cause.includes('trauma') || cause.includes('accident')) pieTraumatic++
          else if (cause.includes('congenital') || cause.includes('birth defect')) pieCongenital++
          else if (
            cause.includes('labour') || cause.includes('labor') ||
            cause.includes('marriage') || cause.includes('abortion') ||
            cause.includes('violence') || cause.includes('gbv')
          ) pieObstetric++
          else piePending++
        } else {
          const t = (c.fistula_type ?? '').toUpperCase().trim()
          if (t === 'VVF') pieObstetric++
          else piePending++
        }
      }

      setData({
        campaigns,
        districts: allDistricts.size,
        upazilas: allUpazilas.size,
        households,
        population,
        campaignSuspected,
        campaignDiagnosed,
        // Funnel stages — prefer the monotonic CIPRBFistulaCase pipeline
        // when present (guarantees suspected ≥ diagnosed ≥ referred ≥
        // repaired ≥ rehabilitated). Fall back to legacy derivation only
        // when the new model has no cases yet.
        suspected:     pipeline ? pipeline.suspected     : suspected,
        identified:    pipeline ? pipeline.diagnosed     : identified,
        referred:      pipeline ? pipeline.referred      : referred,
        repaired:      pipeline ? pipeline.repaired      : repaired,
        rehabilitated: pipeline ? pipeline.rehabilitated : rehabilitated,
        outcomeDry, outcomeNotDry, outcomeFailed,
        pieObstetric, pieIatrogenic, pieCongenital, pieTraumatic, piePending,
      })
    })
    return () => { cancelled = true }
  }, [periodFrom, periodTo, districtsKey])

  return data
}

// ─── Campaign Metrics tiles ──────────────────────────────────────────────────

function MetricTile({ icon, label, value, sub }: {
  icon: React.ReactNode; label: string; value: number; sub: string;
}) {
  return (
    <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 10.5, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 6,
          background: CIPRB_BLUE_SOFT, color: CIPRB_BLUE,
        }}>{icon}</span>
        {label}
      </div>
      <div style={{
        fontSize: 32, fontWeight: 800, color: 'var(--ink)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em',
      }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{sub}</div>
    </div>
  )
}

// ─── Patient Funnel ──────────────────────────────────────────────────────────

function FunnelStage({
  icon, label, value, sub,
}: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 11, color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 6,
          background: CIPRB_BLUE_SOFT, color: CIPRB_BLUE,
        }}>{icon}</span>
        {label}
      </div>
      <div style={{
        fontSize: 36, fontWeight: 800, color: 'var(--ink)',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em',
      }}>{value.toLocaleString()}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</div>
    </div>
  )
}

function FunnelArrow({ conversionPct }: { conversionPct?: number }) {
  // Decorative divider between funnel stages, with optional conversion %
  // pill above. Animesh's spec (2026-06-02): each stage % uses the
  // previous stage as denominator (Identified ÷ Suspected, Referred ÷
  // Identified, Repaired ÷ Referred). Suspected→Identified is omitted
  // here because those are parallel cohorts (campaign vs clinic walk-in),
  // not sequential — that ratio is misleading.
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0, padding: '0 16px', gap: 8,
    }}>
      {conversionPct !== undefined && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: CIPRB_BLUE,
          background: 'rgba(249,96,0,0.10)', borderRadius: 12,
          padding: '4px 10px', minWidth: 48, textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
          border: '1px solid rgba(249,96,0,0.20)',
        }}>
          {conversionPct}%
        </div>
      )}
      <ArrowRight size={22} color={CIPRB_BLUE} aria-hidden />
    </div>
  )
}

// ─── Diagnosis Pie ───────────────────────────────────────────────────────────

// Diagnosis pie — UNFPA orange tonal scale. Primary case (obstetric)
// Four fistula-type slices per CIPRB Question Bank: Obstetric,
// Iatrogenic, Congenital, Traumatic. All four render in the legend
// even when a slice = 0 so the structure CIPRB asked for is visible.
const PIE_COLORS = {
  obstetric:  '#F96000',  // UNFPA orange (primary)
  iatrogenic: '#FB904D',  // UNFPA bright
  congenital: '#FDB37D',  // UNFPA pale
  traumatic:  '#C44E00',  // deeper accent
  pending:    'var(--surface-3)',
}

function DiagnosisLegend({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, minWidth: 220, flex: 1 }}>
      {data.map(d => {
        const isZero = d.value === 0
        return (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0, opacity: isZero ? 0.5 : 1 }} />
            <span style={{ flex: 1, color: 'var(--ink-2)' }}>{d.name}</span>
            <b style={{ fontVariantNumeric: 'tabular-nums' }}>
              {isZero ? '—' : d.value.toLocaleString()}
            </b>
            <span className="mute" style={{ fontSize: 11.5, width: 44, textAlign: 'right' }}>
              {isZero ? '—' : (total ? Math.round((d.value / total) * 100) : 0) + '%'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function FistulaVisualizations({
  period,
  districts,
}: {
  period?: ReportingPeriod
  districts?: readonly string[] | null
} = {}) {
  const { t } = useTranslation()
  // Reporting-period (Contract / Annual) from the CIPRB Dashboard toggle
  // is forwarded to the aggregate fetches as ?from=…&to=… so all three
  // Fistula surfaces (campaign reach, patient funnel, diagnosis pie)
  // follow the same window the rest of the page is showing.
  // `districts` narrows to a donor's footprint (GAC / SIDA / All).
  const agg = useFistulaAggregates(period, districts)

  // Conversion arrows removed after audit — Suspected (campaign outreach)
  // and Identified (clinic walk-ins) are PARALLEL intake cohorts, not a
  // sequential funnel. Quoting % between them was misleading. Tiles now
  // stand alone; the arrow is decorative only.

  // Pie shows the four fistula-type slices per CIPRB Question Bank:
  // Obstetric / Iatrogenic / Congenital / Traumatic. "Awaiting
  // diagnosis" is reported beside the donut so % totals stay honest
  // (denominator = patients who have actually been examined).
  const pieData = [
    { name: t('fistulaViz.pieObstetric'),  value: agg.pieObstetric,  color: PIE_COLORS.obstetric },
    { name: t('fistulaViz.pieIatrogenic'), value: agg.pieIatrogenic, color: PIE_COLORS.iatrogenic },
    { name: t('fistulaViz.pieCongenital'), value: agg.pieCongenital, color: PIE_COLORS.congenital },
    { name: t('fistulaViz.pieTraumatic'),  value: agg.pieTraumatic,  color: PIE_COLORS.traumatic },
  ]
  // Recharts will draw a zero-value slice as nothing — so when iatrogenic = 0
  // the donut still renders correctly with the two real slices. The legend
  // carries the three-slice structure Animesh asked for.
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* ─── 1. Campaign Metrics ─── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('fistulaViz.reachKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('fistulaViz.reachTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('fistulaViz.reachSub')}
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          <MetricTile icon={<Megaphone  size={13} />} label="Campaigns"  value={agg.campaigns}  sub="Screening drives conducted" />
          <MetricTile icon={<MapPin     size={13} />} label={t('fistulaViz.districts')}  value={agg.districts}  sub={t('fistulaViz.districtsSub')} />
          <MetricTile icon={<Building2  size={13} />} label={t('fistulaViz.upazilas')}   value={agg.upazilas}   sub={t('fistulaViz.upazilasSub')} />
          <MetricTile icon={<Home       size={13} />} label={t('fistulaViz.households')} value={agg.households} sub={t('fistulaViz.householdsSub')} />
          <MetricTile icon={<Users      size={13} />} label={t('fistulaViz.population')} value={agg.population} sub={t('fistulaViz.populationSub')} />
          <MetricTile icon={<Search      size={13} />} label="Suspected (campaign)" value={agg.campaignSuspected} sub="Suspected cases found" />
          <MetricTile icon={<Stethoscope size={13} />} label="Diagnosed (campaign)" value={agg.campaignDiagnosed} sub="Confirmed during campaigns" />
          {/* Pipeline-stage counts requested by CIPRB on the campaign card
              (image5 "After"): the same Referred → Repaired → Rehabilitated
              progression from Animesh's campaign report. */}
          <MetricTile icon={<Send         size={13} />} label="Referred for Surgical Management" value={agg.referred}      sub="Sent to tertiary facility" />
          <MetricTile icon={<Scissors     size={13} />} label="Surgically Repaired"             value={agg.repaired}      sub="Surgery outcome recorded" />
          <MetricTile icon={<HeartHandshake size={13} />} label="Rehabilitated & Reintegrated"  value={agg.rehabilitated} sub="Rehabilitation support received" />
        </div>
        <DataSource>Fistula Campaign · campaigns / households / population / districts / suspected / diagnosed / referred / repaired / rehabilitated · {t('fistulaViz.providedBy')}</DataSource>
      </div>

      {/* ─── 2. Patient Funnel ─── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('fistulaViz.funnelKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('fistulaViz.funnelTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('fistulaViz.funnelSub')}
          </p>
        </div>
        <div className="card" style={{
          padding: '24px 28px',
          display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap',
        }}>
          <FunnelStage icon={<Search size={14} />}      label={t('fistulaViz.suspected')}  value={agg.suspected}  sub={t('fistulaViz.suspectedSub')} />
          {/* Suspected → Diagnosed conversion (e.g. "60% of suspected are
              diagnosed"). */}
          <FunnelArrow conversionPct={
            agg.suspected > 0 ? Math.round((agg.identified / agg.suspected) * 100) : undefined
          } />
          <FunnelStage icon={<Stethoscope size={14} />} label={t('fistulaViz.identified')} value={agg.identified} sub={t('fistulaViz.identifiedSub')} />
          <FunnelArrow conversionPct={
            agg.identified > 0 ? Math.round((agg.referred / agg.identified) * 100) : undefined
          } />
          <FunnelStage icon={<Send size={14} />}        label={t('fistulaViz.referred')}   value={agg.referred}   sub={t('fistulaViz.referredSub')} />
          <FunnelArrow conversionPct={
            agg.referred > 0 ? Math.round((agg.repaired / agg.referred) * 100) : undefined
          } />
          <FunnelStage icon={<Scissors size={14} />}    label={t('fistulaViz.repaired')}    value={agg.repaired}   sub={t('fistulaViz.repairedSub')} />
          <FunnelArrow conversionPct={
            agg.repaired > 0 ? Math.round((agg.rehabilitated / agg.repaired) * 100) : undefined
          } />
          <FunnelStage icon={<HeartHandshake size={14} />} label={t('fistulaViz.rehabilitated')} value={agg.rehabilitated} sub={t('fistulaViz.rehabilitatedSub')} />
        </div>
        <p style={{
          fontSize: 11.5, color: 'var(--muted)', margin: '8px 4px 0',
          fontStyle: 'italic',
        }}>
          Each percentage uses the previous stage as the denominator — e.g. the share of suspected cases that go on to be diagnosed, referred, and repaired.
        </p>
        <DataSource>Fistula Campaign (Suspected) · Fistula Question Bank (Diagnosed / Referred for Surgical Management / Surgically Repaired / Rehabilitated & Reintegrated) · {t('fistulaViz.providedBy')}</DataSource>
      </div>

      {/* ─── 2b. Surgical Outcome (Animesh's 3 categories) ─── */}
      {(agg.outcomeDry + agg.outcomeNotDry + agg.outcomeFailed) > 0 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div className="kicker">
              <span className="dot" style={{ background: CIPRB_BLUE }} />
              SURGICAL OUTCOME · REPAIRED CASES
            </div>
            <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
              Surgical repair outcomes
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
              Of all surgically repaired patients, the clinical outcome breakdown. Project reporting focuses on the two successful categories.
            </p>
          </div>
          {(() => {
            const total = agg.outcomeDry + agg.outcomeNotDry + agg.outcomeFailed
            const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
            const card = (label: string, n: number, color: string, emphasis: boolean) => (
              <div className="card" style={{
                padding: '16px 18px', flex: '1 1 200px',
                opacity: emphasis ? 1 : 0.7,
              }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{n}</span>
                  <span style={{ fontSize: 14, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{pct(n)}%</span>
                </div>
              </div>
            )
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {card('SUCCESSFULLY REPAIRED & DRY', agg.outcomeDry, '#1A7A5A', true)}
                {card('SUCCESSFULLY REPAIRED, NOT DRY', agg.outcomeNotDry, '#F96000', true)}
                {card('FAILED', agg.outcomeFailed, 'var(--muted)', false)}
              </div>
            )
          })()}
          <DataSource>Fistula Question Bank · outcome-of-surgery field (two successful categories reported; Failed tracked but de-emphasised) · {t('fistulaViz.providedBy')}</DataSource>
        </div>
      )}

      {/* ─── 3. Diagnosis Pie ─── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            {t('fistulaViz.pieKicker')}
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {t('fistulaViz.pieTitle')}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            {t('fistulaViz.pieSub')}
          </p>
        </div>
        <div className="card" style={{ padding: 24 }}>
          {pieTotal > 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 36, flexWrap: 'wrap',
            }}>
              <div style={{ position: 'relative', width: 220, height: 220, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={70} outerRadius={104} paddingAngle={2} stroke="none"
                      startAngle={90} endAngle={-270} animationDuration={800}>
                      {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    {/* No floating <Tooltip> — it collided with the centre
                        EXAMINED total. The legend (right) lists every type
                        with its count + %. */}
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                }}>
                  <span style={{
                    fontSize: 38, fontWeight: 800, lineHeight: 1, color: 'var(--ink)',
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                  }}>{pieTotal.toLocaleString()}</span>
                  <span className="mono" style={{
                    fontSize: 9.5, color: 'var(--muted)',
                    letterSpacing: '0.08em', marginTop: 4,
                  }}>{t('fistulaViz.examined')}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 220 }}>
                <DiagnosisLegend data={pieData} />
                {agg.piePending > 0 && (
                  <div style={{
                    marginTop: 4, padding: '8px 12px', borderRadius: 8,
                    background: 'var(--surface-2)', border: '1px dashed var(--hair)',
                    fontSize: 12, color: 'var(--ink-3)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span>{t('fistulaViz.awaiting')}</span>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{agg.piePending.toLocaleString()}</b>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{
              padding: '48px 0', textAlign: 'center',
              fontSize: 13, color: 'var(--muted)',
            }}>
              {t('fistulaViz.pieEmpty')}
            </div>
          )}
        </div>
        <p style={{
          margin: '10px 2px 0', fontSize: 11.5, color: 'var(--muted)',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          {t('fistulaViz.pieCaption')}
        </p>
        <DataSource>Fistula Question Bank · fistula type (Obstetric, Iatrogenic, Congenital, Traumatic) · {t('fistulaViz.providedBy')}</DataSource>
      </div>

    </div>
  )
}
