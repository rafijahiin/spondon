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
import { Building2, MapPin, Users, Search, ClipboardList, Home } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '@/api/client'
import { DataUnavailable } from '@/components/ciprb/DataUnavailable'
import { FistulaCampaignMap } from '@/components/ciprb/FistulaCampaignMap'
import type { CampaignUpazila } from '@/components/ciprb/FistulaCampaignMap'
import { SourceChip } from '@/components/ui/SourceChip'

// UNFPA branding — orange across the board.
const CIPRB_BLUE = '#F96000'
const CIPRB_BLUE_SOFT = 'rgba(249,96,0,0.10)'

// The community campaign as its OWN measure, from the daily CHW activity form
// (ciprb_fistula_campaign_v1). Never mixed into the case funnel: a CHW day is
// not a patient, and adding the two double-counts.
export interface CampaignAgg {
  reports: number
  districts: number
  upazilas: number
  households: number
  population: number
  sessions: number
  suspected: number
  confirmed: number
  referred: number
  date_from: string | null
  date_to: string | null
  by_upazila: CampaignUpazila[]
}

interface AggregateData {
  // Total registered CIPRB fistula cases — drives the empty state.
  total: number
  // Case-registry coverage (NOT campaign activity — see `campaign`).
  campaigns: number
  districts: number
  upazilas: number
  households: number
  population: number
  campaign: CampaignAgg | null
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
  piePending: number     // repaired but type not recorded (operated pre-revision) — shown beside the pie
  // Anatomical fistula-type breakdown (genital_fistula_type): vvf / rvf /
  // ureterovaginal / … — classified at the Fistula Corner (diagnosis stage).
  genitalType: Record<string, number>
}

const EMPTY: AggregateData = {
  total: 0,
  campaigns: 0, districts: 0, upazilas: 0, households: 0, population: 0,
  campaign: null,
  campaignSuspected: 0, campaignDiagnosed: 0,
  suspected: 0, identified: 0, referred: 0, repaired: 0, rehabilitated: 0,
  outcomeDry: 0, outcomeNotDry: 0, outcomeFailed: 0,
  pieObstetric: 0, pieIatrogenic: 0, pieCongenital: 0, pieTraumatic: 0,
  piePending: 0,
  genitalType: {},
}

export interface ReportingPeriod {
  from: string
  to: string
}

function useFistulaAggregates(
  period?: ReportingPeriod,
  districts?: readonly string[] | null,
): { agg: AggregateData; aggError: boolean; retryAgg: () => void } {
  const [data, setData] = useState<AggregateData>(EMPTY)
  // A rejected fetch used to fall through to EMPTY (all zeros), so a broken
  // /fistula/aggregates/ looked identical to an empty programme. Track it.
  const [aggError, setAggError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const periodFrom = period?.from
  const periodTo = period?.to
  const districtsKey = districts ? districts.join(',') : ''

  useEffect(() => {
    let cancelled = false
    setAggError(false)
    const params: Record<string, string> = {}
    if (periodFrom) params.from = periodFrom
    if (periodTo) params.to = periodTo
    if (districtsKey) params.districts = districtsKey
    Promise.allSettled([
      // Single source of truth: the LIVE CIPRBFistulaCase aggregate.
      //   .pipeline / .campaign_reach → funnel stages + reach tiles
      //   .genital_fistula_type      → anatomical VVF/RVF bars
      //   .surgery_outcome_v2        → surgical-outcome tiles
      //   .fistula_type_v2           → diagnosis (cause) pie
      // The surgical-outcome tiles + diagnosis pie previously read the LEGACY
      // /fistula/corner-cases/ (FistulaCornerCase) while still showing a
      // "CIPRB 1 — Fistula Question Bank" chip — a provenance mismatch. They
      // now read the real CIPRB 1 model so the chip is truthful. ?districts=
      // is honoured server-side, so the client-side donor filter is gone.
      api.get<{
        total?: number
        pipeline?: Record<string, number>
        campaign_reach?: { districts: number; upazilas: number; patients: number }
        campaign?: CampaignAgg
        genital_fistula_type?: Record<string, number>
        surgery_outcome_v2?: Record<string, number>
        fistula_type_v2?: Record<string, number>
      }>('/fistula/aggregates/', { params }),
    ]).then(([aggRes]) => {
      if (cancelled) return
      if (aggRes.status !== 'fulfilled') {
        // The endpoint failed — surface it as an error, do NOT overwrite the
        // panel with a full set of zeros that reads like an empty programme.
        setAggError(true)
        return
      }
      const agg = aggRes.value.data
      const pipeline = (agg && agg.pipeline) || null
      const reach = (agg && agg.campaign_reach) || null
      // The REAL community campaign (daily CHW activity form). Kept apart
      // from the case registry on purpose: different form, different
      // denominator, its own source chip.
      const camp = (agg && agg.campaign) || null

      // Surgical outcome (dry / not-dry / failed) — CIPRBFistulaCase.surgery_outcome_v2.
      const so = (agg && agg.surgery_outcome_v2) || {}
      const outcomeDry    = so.success_dry     || 0
      const outcomeNotDry = so.success_not_dry || 0
      const outcomeFailed = so.failed          || 0

      // Diagnosis pie — 4 fistula types from CIPRBFistulaCase.fistula_type_v2
      // (Obstetric / Iatrogenic / Congenital / Traumatic).
      const ft = (agg && agg.fistula_type_v2) || {}
      const pieObstetric  = ft.obstetric  || 0
      const pieIatrogenic = ft.iatrogenic || 0
      const pieCongenital = ft.congenital || 0
      const pieTraumatic  = ft.traumatic  || 0
      // fistula_type_v2 is captured on the REPAIR-stage submission (perfect
      // overlap with surgery_outcome_v2), so the honest base is the operated
      // patients; the gap is those repaired before the revised form existed.
      const pieClassified = pieObstetric + pieIatrogenic + pieCongenital + pieTraumatic
      const piePending = Math.max(0, (pipeline ? pipeline.repaired : 0) - pieClassified)

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
        campaign: camp,
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
        // Anatomical type breakdown straight from the aggregate (#16). Stays
        // {} until cases are diagnosed and their VVF/RVF type recorded.
        genitalType: (agg && agg.genital_fistula_type) || {},
      })
    })
    return () => { cancelled = true }
  }, [periodFrom, periodTo, districtsKey, reloadKey])

  return { agg: data, aggError, retryAgg: () => setReloadKey(k => k + 1) }
}

// ─── Empty state ─────────────────────────────────────────────────────────────

const PIE_COLORS = {
  obstetric:  '#F96000',  // UNFPA orange (primary)
  iatrogenic: '#FB904D',  // UNFPA bright
  congenital: '#FDB37D',  // UNFPA pale
  traumatic:  '#C44E00',  // deeper accent
  pending:    'var(--surface-3)',
}

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
  const { agg, aggError, retryAgg } = useFistulaAggregates(period, districts)

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

  // The whole fistula section derives from the aggregate; if it failed to load,
  // show one explicit unavailable card rather than a full screen of zeros.
  if (aggError) {
    return <DataUnavailable label="Fistula surveillance" onRetry={retryAgg} />
  }

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
            <SourceChip>CIPRB — Fistula Campaign (Daily CHW Activity)</SourceChip>
          </div>
        </div>
        {/* This panel used to repeat the case funnel (suspected/diagnosed/
            referred/repaired) read from the CASE registry under a "Campaign"
            heading, so the same eight numbers appeared twice on one screen and
            57 carried two different denominators. CIPRB flagged it on
            3 Aug 2026. It now reports the ACTUAL campaign form: field activity
            and where it happened. The patient funnel lives once, below. */}
        {!agg.campaign || agg.campaign.reports === 0 ? (
          <EmptyState message={t('fistulaViz.emptyReach')} />
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}>
              <MetricTile icon={<ClipboardList size={13} />} label="Activity reports" value={agg.campaign.reports}
                sub={agg.campaign.date_from && agg.campaign.date_to
                  ? `${agg.campaign.date_from} to ${agg.campaign.date_to}`
                  : 'CHW activity days'} />
              <MetricTile icon={<MapPin size={13} />} label={t('fistulaViz.districts')} value={agg.campaign.districts} sub={t('fistulaViz.districtsSub')} />
              <MetricTile icon={<Building2 size={13} />} label={t('fistulaViz.upazilas')} value={agg.campaign.upazilas} sub={t('fistulaViz.upazilasSub')} />
              <MetricTile icon={<Home size={13} />} label="Households visited" value={agg.campaign.households} sub="Door-to-door reach" />
              <MetricTile icon={<Users size={13} />} label="Population covered" value={agg.campaign.population} sub="People in visited households" />
              <MetricTile icon={<Search size={13} />} label="Suspected found in campaign" value={agg.campaign.suspected}
                sub="Reported by CHWs in the field" />
            </div>
            <div style={{ marginTop: 16 }}>
              <FistulaCampaignMap rows={agg.campaign.by_upazila} />
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '10px 2px 0' }}>
              Campaign tallies are the field team&rsquo;s own day counts and are
              reported separately from the patient registry below, so no case is
              counted twice.
            </p>
          </>
        )}
      </div>

      {/* ─── 2. Patient funnel REMOVED 2026-08-04 (Rafi): it repeated the
          At-a-glance band's five numbers and four percentages verbatim. The
          band keeps the summary; the new diagnosed-denominator layer under it
          carries the outcome story. ─── */}

      {/* ─── 2a-bis. REMOVED 2026-08-03 (CIPRB meeting): the "Diagnosed &
          surgically repaired" pie drew Diagnosed (96) and Surgically
          Repaired (42) as two slices of one circle, implying a whole of 138.
          Repaired cases are a SUBSET of diagnosed, so a pie is not a valid
          encoding for them. The relationship is already stated correctly by
          the funnel above, where each stage's share uses the previous stage
          as its denominator. ─── */}

      {/* ─── 2b + 3: the two pies share one row — each was a full-width card
          around a 220px circle, i.e. mostly empty space and a page of scroll
          (Rafi, 4 Aug 2026). They stack again below ~900px. ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18, alignItems: 'stretch' }}>
      {(agg.outcomeDry + agg.outcomeNotDry + agg.outcomeFailed) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 14 }}>
            <div className="kicker">
              <span className="dot" style={{ background: CIPRB_BLUE }} />
              SURGICAL OUTCOME · REPAIRED CASES
            </div>
            <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
              Surgical repair outcomes
            </h3>
            {/* The caption used to claim "of all surgically repaired
                patients" while counting only those with an outcome recorded
                (27), against a funnel headline of 35 repaired. Two numbers on
                one page with nothing to reconcile them. State the coverage. */}
            {(() => {
              const recorded = agg.outcomeDry + agg.outcomeNotDry + agg.outcomeFailed
              const pending = Math.max(0, agg.repaired - recorded)
              return (
                <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
                  Clinical outcome for the {recorded.toLocaleString()} repaired
                  {' '}patients whose surgery outcome has been recorded
                  {pending > 0
                    ? `, out of ${agg.repaired.toLocaleString()} repaired in total. Outcome is not yet recorded for ${pending.toLocaleString()}.`
                    : '.'}
                  {' '}Project reporting focuses on the two successful categories.
                </p>
              )
            })()}
            <div style={{ marginTop: 6 }}>
              <SourceChip>CIPRB 1 — Fistula Question Bank</SourceChip>
            </div>
          </div>
          {(() => {
            // Solid pie (innerRadius 0 — no donuts, house rule). A pie is the
            // right encoding HERE: the three outcomes are exclusive parts of
            // one whole (the repaired patients whose outcome is recorded) —
            // unlike the removed diagnosed-vs-repaired pie, whose slices were
            // subset and superset.
            // Orange family per Rafi (hue-consistent with the rest of the
            // fistula section): deep orange = dry (best), light = not dry,
            // coral = failed.
            const soData = [
              { name: 'Successfully repaired & dry',     value: agg.outcomeDry,    color: '#C44E00' },
              { name: 'Successfully repaired, not dry',  value: agg.outcomeNotDry, color: '#FB904D' },
              { name: 'Failed',                          value: agg.outcomeFailed, color: '#ED5B7E' },
            ]
            const soTotal = soData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="card" style={{ padding: 20, flex: 1, display: 'flex', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, flexWrap: 'wrap', width: '100%' }}>
                  <div style={{ width: 170, height: 170, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={soData.filter((d) => d.value > 0)} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" innerRadius={0} outerRadius={80} paddingAngle={1}
                          stroke="#fff" strokeWidth={1}
                          startAngle={90} endAngle={-270} animationDuration={800}>
                          {soData.filter((d) => d.value > 0).map((d) => <Cell key={d.name} fill={d.color} />)}
                        </Pie>
                        <Tooltip
                          wrapperStyle={{ zIndex: 50, outline: 'none' }}
                          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8, fontSize: 12, color: 'var(--ink)', boxShadow: '0 6px 20px rgba(0,0,0,0.18)' }}
                          itemStyle={{ color: 'var(--ink)' }}
                          labelStyle={{ color: 'var(--ink)' }}
                          formatter={(value: number, name: string) =>
                            [`${value} (${soTotal ? Math.round((value / soTotal) * 100) : 0}%)`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    {/* Legend lists all three, including a zero Failed — its
                        absence from the pie should read as "0", not "missing". */}
                    <DiagnosisLegend data={soData} />
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ─── 3. Diagnosis Pie ─── */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
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
        <div className="card" style={{ padding: 20, flex: 1, display: 'flex', alignItems: 'center' }}>
          {pieTotal > 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 36, flexWrap: 'wrap',
            }}>
              <div style={{ width: 170, height: 170, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={0} outerRadius={80} paddingAngle={1}
                      stroke="#fff" strokeWidth={1}
                      startAngle={90} endAngle={-270} animationDuration={800}>
                      {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
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
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                  <b style={{ fontSize: 22, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{pieTotal.toLocaleString()}</b> {t('fistulaViz.examined')}
                </div>
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

    </div>
  )
}
