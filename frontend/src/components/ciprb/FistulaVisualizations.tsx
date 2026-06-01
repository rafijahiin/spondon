/**
 * Fistula visualizations — three graphical surfaces per Animesh's spec:
 *
 *   1. CampaignMetrics — cumulative reach tiles (districts, upazilas,
 *      households visited) sourced from FistulaCampaignVisit.
 *   2. PatientFunnel — visual flow Suspected → Identified → Referred.
 *   3. DiagnosisPie — VVF (obstetric) vs other fistula types vs
 *      no fistula confirmed, from FistulaCornerCase.fistula_type.
 *
 * Replaces "raw numbers" with "immediate programmatic insight at a glance"
 * — the leadership-demo bar.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, MapPin, Home, Users, Search, Stethoscope, Send, ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '@/api/client'

// UNFPA branding — orange across the board.
const CIPRB_BLUE = '#F96000'
const CIPRB_BLUE_SOFT = 'rgba(249,96,0,0.10)'

interface CornerCase {
  identification_date?: string | null
  diagnosis_date?: string | null
  referral_date?: string | null
  referral_outcome?: string
  surgery_performed?: 'yes' | 'no' | 'pending' | ''
  fistula_type?: string  // 'VVF' | 'RVF' | 'BOTH' | 'OTHER' | ''
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
  districts: number
  upazilas: number
  households: number
  population: number
  // Funnel
  suspected: number
  identified: number
  referred: number
  // Diagnosis pie (corner cases) — Animesh's 3 categories
  pieObstetric: number   // VVF
  pieOtherType: number   // RVF / BOTH / OTHER
  pieNoFistula: number   // diagnosis_date set but fistula_type empty
  piePending: number     // no diagnosis_date — kept out of pie, shown beside it
}

const EMPTY: AggregateData = {
  districts: 0, upazilas: 0, households: 0, population: 0,
  suspected: 0, identified: 0, referred: 0,
  pieObstetric: 0, pieOtherType: 0, pieNoFistula: 0, piePending: 0,
}

function useFistulaAggregates(): AggregateData {
  const [data, setData] = useState<AggregateData>(EMPTY)

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.get<{ results?: CampaignVisit[] } | CampaignVisit[]>('/fistula/campaign-visits/'),
      api.get<{ results?: CornerCase[]    } | CornerCase[]>('/fistula/corner-cases/'),
      api.get<{ results?: CampaignRollup[] } | CampaignRollup[]>('/fistula/campaigns/'),
    ]).then(([campaignRes, cornerRes, rollupRes]) => {
      if (cancelled) return

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

      const rollups: CampaignRollup[] =
        rollupRes.status === 'fulfilled'
          ? (Array.isArray(rollupRes.value.data)
              ? rollupRes.value.data
              : rollupRes.value.data.results ?? [])
          : []

      // Districts/upazilas drawn from BOTH sources — daily roll-ups give
      // wider coverage; individual visits add specifics. Households +
      // population come from the daily roll-up totals (authoritative per
      // Animesh's spec and the xlsx column headings).
      const allDistricts = new Set<string>()
      const allUpazilas = new Set<string>()
      for (const r of [...campaign, ...rollups]) {
        const d = (r.district ?? '').trim()
        if (d) allDistricts.add(d)
        const u = (r.upazila ?? '').trim()
        if (d && u) allUpazilas.add(`${d}|${u}`)
      }
      const households = rollups.reduce((s, r) => s + (r.households_visited ?? 0), 0)
      const population = rollups.reduce((s, r) => s + (r.population_covered ?? 0), 0)

      // Patient Funnel sources — fixed after audit:
      //   Suspected — from daily campaign roll-ups (CHWs noting suspected
      //     patients during outreach), NOT individual visit register.
      //     Sayeed's Mass Campaign Excel writes this sum directly.
      //   Identified — Fistula Corner cases that have a diagnosis date.
      //   Referred — Fistula Corner cases sent on for surgery. Most Excel-
      //     imported rows don't carry a referral_date yet; once a Kobo
      //     referral form lands this will populate.
      const suspected = rollups.reduce((s, r) => s + (r.suspected_fistula_cases ?? 0), 0)
      const identified = corner.filter(c => c.identification_date || c.diagnosis_date).length
      const referred   = corner.filter(c => c.referral_date || (c.referral_outcome ?? '').trim() !== '').length

      // Diagnosis pie — only count corner cases that have been seen at the clinic
      // (i.e., have a diagnosis_date). Else they're "pending".
      let pieObstetric = 0, pieOtherType = 0, pieNoFistula = 0, piePending = 0
      for (const c of corner) {
        if (!c.diagnosis_date) { piePending++; continue }
        const t = (c.fistula_type ?? '').toUpperCase().trim()
        if (t === 'VVF') pieObstetric++
        else if (t === 'RVF' || t === 'BOTH' || t === 'OTHER') pieOtherType++
        else pieNoFistula++
      }

      setData({
        districts: allDistricts.size,
        upazilas: allUpazilas.size,
        households,
        population,
        suspected,
        identified,
        referred,
        pieObstetric, pieOtherType, pieNoFistula, piePending,
      })
    })
    return () => { cancelled = true }
  }, [])

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

function FunnelArrow() {
  // Decorative-only divider between funnel stages. Conversion % between
  // Suspected (community outreach) and Identified (clinic walk-ins) was
  // removed after audit — those are parallel cohorts, not a sequential
  // funnel, so dividing them was misleading. Patients may walk straight
  // into a Fistula Corner without ever being noted during outreach.
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, padding: '0 16px',
    }}>
      <ArrowRight size={22} color={CIPRB_BLUE} aria-hidden />
    </div>
  )
}

// ─── Diagnosis Pie ───────────────────────────────────────────────────────────

// Diagnosis pie — UNFPA orange tonal scale. Primary case (obstetric)
// gets the brand orange; other-type a lighter shade; non-fistula stays
// neutral grey because it's a diagnostic negative, not a partner colour.
const PIE_COLORS = {
  obstetric: '#F96000',     // UNFPA orange
  otherType: '#FB904D',     // UNFPA bright
  noFistula: 'var(--muted-3)',
  pending: 'var(--surface-3)',
}

function DiagnosisLegend({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, minWidth: 220, flex: 1 }}>
      {data.map(d => (
        <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: d.color, flexShrink: 0 }} />
          <span style={{ flex: 1, color: 'var(--ink-2)' }}>{d.name}</span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value.toLocaleString()}</b>
          <span className="mute" style={{ fontSize: 11.5, width: 44, textAlign: 'right' }}>
            {total ? Math.round((d.value / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function FistulaVisualizations() {
  const { t } = useTranslation()
  const agg = useFistulaAggregates()

  // Conversion arrows removed after audit — Suspected (campaign outreach)
  // and Identified (clinic walk-ins) are PARALLEL intake cohorts, not a
  // sequential funnel. Quoting % between them was misleading. Tiles now
  // stand alone; the arrow is decorative only.

  // Pie shows Animesh's three categories ONLY — Obstetric / Other / Not Fistula.
  // 'Awaiting diagnosis' is reported beside the donut so the % totals stay
  // honest (denominator = patients who have actually been examined).
  const pieData = [
    { name: t('fistulaViz.pieObstetric'), value: agg.pieObstetric, color: PIE_COLORS.obstetric },
    { name: t('fistulaViz.pieOther'),     value: agg.pieOtherType, color: PIE_COLORS.otherType },
    { name: t('fistulaViz.pieNone'),      value: agg.pieNoFistula, color: PIE_COLORS.noFistula },
  ]
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
          <MetricTile icon={<MapPin     size={13} />} label={t('fistulaViz.districts')}  value={agg.districts}  sub={t('fistulaViz.districtsSub')} />
          <MetricTile icon={<Building2  size={13} />} label={t('fistulaViz.upazilas')}   value={agg.upazilas}   sub={t('fistulaViz.upazilasSub')} />
          <MetricTile icon={<Home       size={13} />} label={t('fistulaViz.households')} value={agg.households} sub={t('fistulaViz.householdsSub')} />
          <MetricTile icon={<Users      size={13} />} label={t('fistulaViz.population')} value={agg.population} sub={t('fistulaViz.populationSub')} />
        </div>
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
          <FunnelArrow />
          <FunnelStage icon={<Stethoscope size={14} />} label={t('fistulaViz.identified')} value={agg.identified} sub={t('fistulaViz.identifiedSub')} />
          <FunnelArrow />
          <FunnelStage icon={<Send size={14} />}        label={t('fistulaViz.referred')}   value={agg.referred}   sub={t('fistulaViz.referredSub')} />
        </div>
      </div>

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
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--hair)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
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
      </div>

    </div>
  )
}
