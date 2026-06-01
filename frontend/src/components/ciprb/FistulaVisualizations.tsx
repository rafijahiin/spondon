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
import { Building2, MapPin, Home, Search, Stethoscope, Send, ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { api } from '@/api/client'

const CIPRB_BLUE = '#0072BC'
const CIPRB_BLUE_SOFT = 'rgba(0,114,188,0.08)'

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

interface AggregateData {
  // Campaign reach
  districts: number
  upazilas: number
  households: number
  // Funnel
  suspected: number
  identified: number
  referred: number
  // Diagnosis pie (corner cases)
  pieObstetric: number   // VVF
  pieOtherType: number   // RVF / BOTH / OTHER
  pieNoFistula: number   // diagnosis_date set but fistula_type empty
  piePending: number     // no diagnosis_date yet
}

const EMPTY: AggregateData = {
  districts: 0, upazilas: 0, households: 0,
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
    ]).then(([campaignRes, cornerRes]) => {
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

      const districts = new Set(campaign.map(c => (c.district ?? '').trim()).filter(Boolean))
      const upazilas  = new Set(campaign.map(c => `${c.district ?? ''}|${c.upazila ?? ''}`).filter(s => s.replace('|', '').trim() !== ''))
      const households = campaign.length   // 1 visit ≈ 1 household reached

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
        districts: districts.size,
        upazilas: upazilas.size,
        households,
        suspected: campaign.length,
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

function FunnelArrow({ pct }: { pct: number }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, flexShrink: 0, padding: '0 12px',
    }}>
      <ArrowRight size={20} color={CIPRB_BLUE} />
      <span style={{
        fontSize: 10.5, color: CIPRB_BLUE, fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        background: CIPRB_BLUE_SOFT, padding: '2px 8px', borderRadius: 999,
      }}>
        {pct.toFixed(0)}% conversion
      </span>
    </div>
  )
}

// ─── Diagnosis Pie ───────────────────────────────────────────────────────────

const PIE_COLORS = {
  obstetric: '#0072BC',     // CIPRB blue — primary case of interest
  otherType: '#5BA4D1',     // softer blue
  noFistula: 'var(--muted-3)',  // grey — diagnostic negative
  pending: 'var(--surface-3)',  // very faint — not yet diagnosed
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
  const agg = useFistulaAggregates()

  const funnelConversionDiag = agg.suspected > 0 ? (agg.identified / agg.suspected) * 100 : 0
  const funnelConversionRefer = agg.identified > 0 ? (agg.referred / agg.identified) * 100 : 0

  const pieData = [
    { name: 'Obstetric fistula (VVF)',    value: agg.pieObstetric, color: PIE_COLORS.obstetric },
    { name: 'Other fistula type',         value: agg.pieOtherType, color: PIE_COLORS.otherType },
    { name: 'No fistula confirmed',       value: agg.pieNoFistula, color: PIE_COLORS.noFistula },
    { name: 'Awaiting diagnosis',         value: agg.piePending,   color: PIE_COLORS.pending },
  ]
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* ─── 1. Campaign Metrics ─── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            CAMPAIGN REACH · COMMUNITY OUTREACH
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            How far the campaigns have travelled
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            Cumulative scale of the house-to-house screening drive.
          </p>
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          <MetricTile icon={<MapPin     size={13} />} label="Districts"   value={agg.districts}  sub="Distinct districts visited" />
          <MetricTile icon={<Building2  size={13} />} label="Upazilas"    value={agg.upazilas}   sub="Upazila-level coverage" />
          <MetricTile icon={<Home       size={13} />} label="Households"  value={agg.households} sub="Doors knocked / families screened" />
        </div>
      </div>

      {/* ─── 2. Patient Funnel ─── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            PATIENT FUNNEL · COMMUNITY → CLINIC → CARE
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            Are campaigns converting into care?
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            How patients flow from community screening to diagnosis to referral.
          </p>
        </div>
        <div className="card" style={{
          padding: '24px 28px',
          display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap',
        }}>
          <FunnelStage icon={<Search size={14} />}      label="Suspected"   value={agg.suspected}  sub="Identified at community screening" />
          <FunnelArrow pct={funnelConversionDiag} />
          <FunnelStage icon={<Stethoscope size={14} />} label="Identified"  value={agg.identified} sub="Diagnosed at Fistula Corner" />
          <FunnelArrow pct={funnelConversionRefer} />
          <FunnelStage icon={<Send size={14} />}        label="Referred"    value={agg.referred}   sub="Sent for surgery / treatment" />
        </div>
      </div>

      {/* ─── 3. Diagnosis Pie ─── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <div className="kicker">
            <span className="dot" style={{ background: CIPRB_BLUE }} />
            FISTULA CORNER · CLINICAL FINDINGS
          </div>
          <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            What suspected patients actually have
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
            Of all women examined at the Fistula Corner, how the final diagnoses break down.
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
                  }}>EXAMINED</span>
                </div>
              </div>
              <DiagnosisLegend data={pieData} />
            </div>
          ) : (
            <div style={{
              padding: '48px 0', textAlign: 'center',
              fontSize: 13, color: 'var(--muted)',
            }}>
              No Fistula Corner cases recorded yet — pie chart will fill as patients are
              examined and diagnoses recorded.
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
