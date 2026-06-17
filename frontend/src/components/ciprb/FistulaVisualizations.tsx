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
import { Building2, MapPin, Users, Search, Stethoscope, Send, ArrowRight, Scissors, HeartHandshake } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '@/api/client'
import { SourceChip } from '@/components/ui/SourceChip'

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

interface AggregateData {
  // Total registered CIPRB fistula cases — drives the empty state.
  total: number
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
  total: 0,
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
      // Fistula Corner cases — still the source for the surgical-outcome tiles
      // and the diagnosis pie (no pipeline/campaign_reach equivalent exists).
      api.get<{ results?: CornerCase[] } | CornerCase[]>('/fistula/corner-cases/', { params }),
      // The monotonic pipeline from CIPRBFistulaCase.current_stage — the
      // single source of truth for the 5 funnel stages AND the campaign-reach
      // tiles (replaces the demo-seeded FistulaCampaign / FistulaCornerCase
      // fallback that showed fake numbers).
      api.get<{
        total?: number
        pipeline?: Record<string, number>
        campaign_reach?: { districts: number; upazilas: number; patients: number }
      }>('/fistula/aggregates/', { params }),
    ]).then(([cornerRes, aggRes]) => {
      if (cancelled) return
      const agg = aggRes.status === 'fulfilled' ? aggRes.value.data : null
      const pipeline = (agg && agg.pipeline) || null
      const reach = (agg && agg.campaign_reach) || null

      const corner: CornerCase[] =
        cornerRes.status === 'fulfilled'
          ? (Array.isArray(cornerRes.value.data)
              ? cornerRes.value.data
              : cornerRes.value.data.results ?? [])
          : []

      // Client-side donor filter — until ?districts= is honoured by all
      // endpoints, restrict aggregates to the selected donor's districts.
      const inFilter = (d?: string) =>
        !districtSet || (d != null && districtSet.has(d.toLowerCase()))
      // Only the surgical-outcome tiles and the diagnosis pie still read the
      // Fistula Corner cases (those metrics have no pipeline/campaign_reach
      // equivalent). The funnel and campaign-reach now come straight from the
      // real CIPRBFistulaCase aggregates — no demo-seeded roll-up fallback.
      const cornerFil = corner.filter(c => inFilter(c.district))

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
        total: agg && typeof agg.total === 'number' ? agg.total : 0,
        // Campaign reach — sourced from the real CIPRBFistulaCase registry
        // (campaign_reach block) instead of the demo-seeded FistulaCampaign
        // roll-ups. `campaigns` is retired as a reach metric (it counted
        // seed roll-up rows); patients registered is the honest substitute.
        campaigns: reach ? reach.patients : 0,
        districts: reach ? reach.districts : 0,
        upazilas: reach ? reach.upazilas : 0,
        // Households + population have no real source in CIPRBFistulaCase, so
        // they stay 0 — the dashboard renders an empty state for those tiles
        // rather than showing seed numbers.
        households: 0,
        population: 0,
        campaignSuspected: pipeline ? pipeline.suspected : 0,
        campaignDiagnosed: pipeline ? pipeline.diagnosed : 0,
        // Funnel stages — always the monotonic CIPRBFistulaCase pipeline
        // (guarantees suspected ≥ diagnosed ≥ referred ≥ repaired ≥
        // rehabilitated). No legacy/demo fallback: when the registry is empty
        // every stage is 0 and the cards show an empty state.
        suspected:     pipeline ? pipeline.suspected     : 0,
        identified:    pipeline ? pipeline.diagnosed     : 0,
        referred:      pipeline ? pipeline.referred      : 0,
        repaired:      pipeline ? pipeline.repaired      : 0,
        rehabilitated: pipeline ? pipeline.rehabilitated : 0,
        outcomeDry, outcomeNotDry, outcomeFailed,
        pieObstetric, pieIatrogenic, pieCongenital, pieTraumatic, piePending,
      })
    })
    return () => { cancelled = true }
  }, [periodFrom, periodTo, districtsKey])

  return data
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="card" style={{
      padding: '32px 28px', textAlign: 'center',
      color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5,
    }}>
      {message}
    </div>
  )
}

// ─── Campaign Metrics tiles ──────────────────────────────────────────────────

function MetricTile({ icon, label, value, sub, pct, pctLabel }: {
  icon: React.ReactNode; label: string; value: number; sub: string;
  // When set, a "<pct>% <pctLabel>" line renders under the value — used on
  // the funnel-stage tiles so each stage is read as a share of suspected,
  // not just a raw count.
  pct?: number | null; pctLabel?: string;
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 32, fontWeight: 800, color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em',
        }}>{value.toLocaleString()}</span>
        {pct != null && (
          <span style={{
            fontSize: 14, fontWeight: 700, color: CIPRB_BLUE,
            fontVariantNumeric: 'tabular-nums',
          }}>{Math.round(pct)}%</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
        {pct != null && pctLabel ? `${pctLabel} · ${sub}` : sub}
      </div>
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

  // Share of suspected for the funnel-stage tiles. Null when there is no
  // suspected base yet (avoids divide-by-zero / nonsense percentages).
  const pctOfSuspected = (v: number): number | null =>
    agg.suspected > 0 ? (v / agg.suspected) * 100 : null

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
          <div style={{ marginTop: 6 }}>
            <SourceChip>CIPRB 1 — Fistula Question Bank</SourceChip>
          </div>
        </div>
        {agg.total === 0 ? (
          <EmptyState message={t('fistulaViz.emptyReach')} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}>
            {/* Reach + funnel all read from the SAME real CIPRBFistulaCase
                registry (campaign_reach + monotonic pipeline) so they can
                never contradict each other (the old "suspected 0 but referred
                19" bug came from mixing demo campaign counts with the case
                pipeline). Households/population tiles were dropped — the
                registry has no honest source for them. */}
            <MetricTile icon={<Users      size={13} />} label="Patients registered" value={agg.campaigns} sub="Suspected-stage registrations" />
            <MetricTile icon={<MapPin     size={13} />} label={t('fistulaViz.districts')}  value={agg.districts}  sub={t('fistulaViz.districtsSub')} />
            <MetricTile icon={<Building2  size={13} />} label={t('fistulaViz.upazilas')}   value={agg.upazilas}   sub={t('fistulaViz.upazilasSub')} />
            <MetricTile icon={<Search      size={13} />} label="Suspected" value={agg.suspected} sub="Suspected cases found" />
            <MetricTile icon={<Stethoscope size={13} />} label="Diagnosed" value={agg.identified} sub="Confirmed at Fistula Corner"
              pct={pctOfSuspected(agg.identified)} pctLabel="of suspected" />
            <MetricTile icon={<Send         size={13} />} label="Referred for Surgical Management" value={agg.referred}      sub="Sent to tertiary facility"
              pct={pctOfSuspected(agg.referred)} pctLabel="of suspected" />
            <MetricTile icon={<Scissors     size={13} />} label="Surgically Repaired"             value={agg.repaired}      sub="Surgery outcome recorded"
              pct={pctOfSuspected(agg.repaired)} pctLabel="of suspected" />
            <MetricTile icon={<HeartHandshake size={13} />} label="Rehabilitated & Reintegrated"  value={agg.rehabilitated} sub="Rehabilitation support received"
              pct={pctOfSuspected(agg.rehabilitated)} pctLabel="of suspected" />
          </div>
        )}
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
          <div style={{ marginTop: 6 }}>
            <SourceChip>CIPRB 1 — Fistula Question Bank</SourceChip>
          </div>
        </div>
        {agg.total === 0 ? (
          <EmptyState message={t('fistulaViz.emptyFunnel')} />
        ) : (
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
        )}
        {agg.total > 0 && (
          <p style={{
            fontSize: 11.5, color: 'var(--muted)', margin: '8px 4px 0',
            fontStyle: 'italic',
          }}>
            Each percentage uses the previous stage as the denominator — e.g. the share of suspected cases that go on to be diagnosed, referred, and repaired.
          </p>
        )}
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
            <div style={{ marginTop: 6 }}>
              <SourceChip>CIPRB 1 — Fistula Question Bank</SourceChip>
            </div>
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
          <div style={{ marginTop: 6 }}>
            <SourceChip>CIPRB 1 — Fistula Question Bank</SourceChip>
          </div>
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
                    {/* Tooltip lifted above the centre EXAMINED total with a
                        zIndex wrapper + opaque card — the earlier collision
                        was z-order only. Legend (right) still lists all types. */}
                    <Tooltip
                      wrapperStyle={{ zIndex: 50, outline: 'none' }}
                      contentStyle={{
                        background: 'var(--surface)', border: '1px solid var(--hair)',
                        borderRadius: 8, fontSize: 12, color: 'var(--ink)',
                        boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                      }}
                      itemStyle={{ color: 'var(--ink)' }}
                      labelStyle={{ color: 'var(--ink)' }}
                      formatter={(value: number, name: string) =>
                        [`${value} (${pieTotal ? Math.round((value / pieTotal) * 100) : 0}%)`, name]}
                    />
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
      </div>

    </div>
  )
}
