/**
 * ProgrammeActivityChart — homepage "activity over time" area chart.
 *
 * Editorial styling (light, partner-tinted, soft gradients) matching the
 * org-dashboard trend chart — NOT the dark/neon template look. Stacks the
 * last 6 months of submissions by partner (CIPRB / Bandhu / PHD) from the
 * real /dashboard/monthly-activity/ endpoint. Degrades to a calm empty
 * state when no activity has been recorded yet (pre-launch / pre-workshop).
 */
import { useEffect, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { PARTNER_COLORS, type PartnerCode } from '@/data/partnerDistricts'

interface MonthRow {
  month_name: string
  CIPRB?: number
  Bandhu?: number
  PHD?: number
  total: number
}

// Stack order (bottom → top) and their brand colours.
const SERIES: PartnerCode[] = ['CIPRB', 'Bandhu', 'PHD']

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{
      padding: '10px 14px', fontSize: 12, minWidth: 150,
      boxShadow: '0 8px 30px rgba(0,0,0,.12)', border: '1px solid var(--hair)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--muted)' }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, marginTop: 3 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
            {p.name}
          </span>
          <b style={{ fontVariantNumeric: 'tabular-nums' }}>{(p.value ?? 0).toLocaleString()}</b>
        </div>
      ))}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
      {label}
    </span>
  )
}

export function ProgrammeActivityChart() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<MonthRow[] | null>(null)

  useEffect(() => {
    api.get('/dashboard/monthly-activity/')
      .then((r) => setRows(r.data?.months ?? []))
      .catch(() => setRows([]))
  }, [])

  const hasData = (rows ?? []).some((r) => (r.total ?? 0) > 0)

  return (
    <section className="section" style={{ marginTop: 44 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            {t('home.activityKicker', { defaultValue: 'PROGRAMME ACTIVITY' })}
          </div>
          <h2 className="section-title">{t('home.activityTitle', { defaultValue: 'Activity over time' })}</h2>
          <p className="section-sub">
            {t('home.activitySub', { defaultValue: 'Submissions received per month, by partner (last 6 months).' })}
          </p>
        </div>
      </div>

      <div className="card shimmer" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          {SERIES.map((p) => <LegendDot key={p} color={PARTNER_COLORS[p]} label={p} />)}
        </div>

        {rows === null ? (
          <div style={{ height: 300 }} />
        ) : hasData ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                {SERIES.map((p) => (
                  <linearGradient key={p} id={`act-${p}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PARTNER_COLORS[p]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={PARTNER_COLORS[p]} stopOpacity={0.04} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="month_name"
                tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                axisLine={{ stroke: 'var(--hair)' }} tickLine={false} />
              <YAxis allowDecimals={false}
                tick={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--mono)' }}
                axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />}
                cursor={{ stroke: 'var(--hair-2)', strokeWidth: 1, strokeDasharray: '4 4' }} />
              {SERIES.map((p, i) => (
                <Area key={p} type="monotone" dataKey={p} name={p} stackId="1"
                  stroke={PARTNER_COLORS[p]} strokeWidth={2} fill={`url(#act-${p})`}
                  animationDuration={900} animationBegin={i * 180} animationEasing="ease-out" />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            height: 300, display: 'flex', flexDirection: 'column', gap: 6,
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', textAlign: 'center', padding: '0 24px',
          }}>
            <span style={{ fontSize: 14, color: 'var(--ink-3)' }}>
              {t('home.activityEmpty', { defaultValue: 'No activity recorded yet' })}
            </span>
            <span style={{ fontSize: 12.5 }}>
              {t('home.activityEmptySub', { defaultValue: 'This chart fills in as field submissions are received and approved.' })}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
