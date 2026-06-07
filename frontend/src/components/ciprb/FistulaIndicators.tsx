/**
 * Fistula — the 17 "Major indicators (at Dashboard)" from the CIPRB
 * corrections doc, sourced from the CIPRB Fistula Question Bank
 * (GET /api/fistula/aggregates/ → fistula.views.fistula_aggregates).
 *
 * This is the indicator-grid counterpart to FistulaVisualizations
 * (which keeps the campaign reach + pipeline funnel). Reads the NEW
 * CIPRBFistulaCase data, not the legacy FistulaCornerCase.
 */
import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { DataSource } from '@/components/ui/DataSource'
import { useTranslation } from 'react-i18next'
import { BarBreakdown, DonutBreakdown, Histogram } from './IndicatorCharts'

const CIPRB_ORANGE = '#F96000'

type Dist = Record<string, number>
interface FistulaAgg {
  total: number
  age: Dist; education: Dist; marital_status: Dist
  age_at_marriage: Dist; age_at_first_delivery: Dist; number_of_children: Dist
  mode_of_last_delivery: Dist; place_of_last_delivery: Dist; conducted_last_delivery: Dist
  reasons_no_institutional_delivery: Dist
  time_duration_fistula_occurrence: Dist; duration_suffering: Dist
  delivery_outcome: Dist; fistula_type_v2: Dist; iatrogenic_cause: Dist
  genital_fistula_type: Dist; surgery_outcome_v2: Dist
}

const L = {
  education: { no_education: 'No education', primary_incomplete: 'Primary (incomplete)', primary: 'Primary', secondary: 'Secondary', higher_secondary: 'Higher secondary', graduate: 'Graduate / Masters' },
  marital: { married: 'Married', separated: 'Separated', divorced: 'Divorced', widowed: 'Widowed', other: 'Other' },
  mode: { nvd: 'NVD', csection: 'C-section', assisted_vaginal: 'Assisted vaginal' },
  place: { gov_facility: 'Govt facility', private_facility: 'Private facility', home: 'Home' },
  conductor: { relatives: 'Relatives', tba: 'TBA', nurse: 'Nurse', midwife: 'Midwife', doctor: 'Doctor' },
  reasons: { traditional: 'Traditional belief', transport: 'Transport', financial: 'Financial', no_idea: 'No idea of hospital', no_faith: 'No faith in service', other: 'Other' },
  outcome: { livebirth: 'Livebirth', stillbirth: 'Stillbirth' },
  ftype: { obstetric: 'Obstetric', iatrogenic: 'Iatrogenic', congenital: 'Congenital', traumatic: 'Traumatic' },
  iatro: { hysterectomy: 'Hysterectomy', csection: 'C-section', laparoscopy: 'Laparoscopy' },
  genital: { vvf: 'VVF', rvf: 'RVF', ureterovaginal: 'Uretero-vaginal', urethrovaginal: 'Urethro-vaginal', vesicouterine: 'Vesico-uterine', vesicocervical: 'Vesico-cervical' },
  surgery: { success_dry: 'Repaired & dry', success_not_dry: 'Repaired, not dry', failed: 'Failed' },
} as const

export function FistulaIndicators({ districts }: { districts?: readonly string[] | null }) {
  const { t } = useTranslation()
  const [data, setData] = useState<FistulaAgg | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const q = districts && districts.length ? `?districts=${districts.map(encodeURIComponent).join(',')}` : ''
    api.get<FistulaAgg>(`/fistula/aggregates/${q}`)
      .then(r => { if (!cancelled) { setData(r.data); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [districts])

  if (loading) return <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>Loading fistula indicators…</div>
  if (!data) return null

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div className="kicker"><span className="dot" style={{ background: CIPRB_ORANGE }} />FISTULA · 17 MAJOR INDICATORS</div>
        <h3 style={{ margin: '6px 0 2px', fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>Fistula indicator breakdown</h3>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: 0 }}>
          The 17 dashboard indicators CIPRB specified, each sourced from the Fistula Question Bank. {data.total} registered case{data.total === 1 ? '' : 's'}.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Histogram      title="1. Age of patient"            data={data.age} />
        <BarBreakdown   title="2. Education"                 data={data.education} labels={L.education} />
        <BarBreakdown   title="3. Marital status"           data={data.marital_status} labels={L.marital} />
        <Histogram      title="4. Age at marriage"          data={data.age_at_marriage} />
        <Histogram      title="5. Age at first delivery"    data={data.age_at_first_delivery} />
        <Histogram      title="6. Number of children"       data={data.number_of_children} />
        <BarBreakdown   title="7. Mode of last delivery"    data={data.mode_of_last_delivery} labels={L.mode} />
        <BarBreakdown   title="8. Place of last delivery"   data={data.place_of_last_delivery} labels={L.place} />
        <BarBreakdown   title="9. Delivery conducted by"    data={data.conducted_last_delivery} labels={L.conductor} />
        <BarBreakdown   title="10. Reasons for no institutional delivery" data={data.reasons_no_institutional_delivery} labels={L.reasons} />
        <Histogram      title="11. Time fistula occurred after delivery" data={data.time_duration_fistula_occurrence} />
        <Histogram      title="12. Duration of suffering"   data={data.duration_suffering} />
        <BarBreakdown   title="13. Outcome of last delivery" data={data.delivery_outcome} labels={L.outcome} />
        <DonutBreakdown title="14. Cause of fistula (type)" data={data.fistula_type_v2} labels={L.ftype} />
        <BarBreakdown   title="15. Cause of iatrogenic fistula" data={data.iatrogenic_cause} labels={L.iatro} />
        <BarBreakdown   title="16. Type of genital fistula" data={data.genital_fistula_type} labels={L.genital} />
        <BarBreakdown   title="17. Outcome of surgery"      data={data.surgery_outcome_v2} labels={L.surgery} />
      </div>
      <DataSource>CIPRB Fistula Question Bank · 17 major indicators · {t('fistulaViz.providedBy', { defaultValue: 'Provided by CIPRB' })}</DataSource>
    </div>
  )
}
