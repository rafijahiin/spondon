/**
 * ProgrammeBreakdown — two compact, editorial charts for the homepage, both
 * fed by a single /dashboard/activity-breakdown/ call:
 *
 *   1. Activity by category — a donut (Clinical / Community / Operations).
 *   2. Top service types — a ranked list of the most-submitted services
 *      (clinic visits, outreach sessions, trainings…), each bar coloured by
 *      its category so it ties back to the donut.
 *
 * Per-partner attainment intentionally lives only in the "Three partners at a
 * glance" cards above — it is not repeated here. No time-series (this is a
 * short, ~5-month programme).
 *
 * Vivid warm palette, recharts for the donut. Both degrade to a calm empty
 * state before real data exists.
 */
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'

// Vivid warm triad — the reference palette for the whole home page.
const CATEGORY_COLORS: Record<string, string> = {
  Clinical: '#F96000',   // vivid UNFPA orange
  Community: '#ED5B7E',  // coral (pink)
  Operations: '#F2B544', // warm gold — distinct from the orange above
}

interface ServiceRow { name: string; category: string; count: number }

// ── Donut tooltip ─────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="card" style={{ padding: '8px 12px', fontSize: 12, border: '1px solid var(--hair)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.payload.color }} />
        {p.name}: <b style={{ fontVariantNumeric: 'tabular-nums' }}>{(p.value ?? 0).toLocaleString()}</b>
      </span>
    </div>
  )
}

export function ProgrammeBreakdown() {
  const { t } = useTranslation()
  const [cats, setCats] = useState<Record<string, number> | null>(null)
  const [services, setServices] = useState<ServiceRow[] | null>(null)

  useEffect(() => {
    api.get('/dashboard/activity-breakdown/')
      .then((r) => {
        setCats(r.data?.categories ?? {})
        setServices(r.data?.services ?? [])
      })
      .catch(() => { setCats({}); setServices([]) })
  }, [])

  const donutData = ['Clinical', 'Community', 'Operations'].map((name) => ({
    name, value: cats?.[name] ?? 0, color: CATEGORY_COLORS[name],
  }))
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  const topServices = (services ?? []).slice(0, 6)
  const maxService = topServices.reduce((m, s) => Math.max(m, s.count), 0)

  return (
    <section className="section programme-breakdown" style={{ marginTop: 44 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            {t('home.breakdownKicker', { defaultValue: 'PROGRAMME BREAKDOWN' })}
          </div>
          <h2 className="section-title">{t('home.breakdownTitle', { defaultValue: 'Where activity sits, by category and service' })}</h2>
        </div>
      </div>

      <div
        className="breakdown-grid"
        style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: 18 }}
      >
        {/* ── Activity by category — donut ─────────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div className="kicker" style={{ marginBottom: 4 }}>ACTIVITY BY CATEGORY</div>
          <p className="section-sub" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            Approved &amp; pending submissions by service type.
          </p>

          {donutTotal > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                      innerRadius={58} outerRadius={84} paddingAngle={2} stroke="none"
                      startAngle={90} endAngle={-270} animationDuration={800}>
                      {donutData.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {donutTotal.toLocaleString()}
                  </span>
                  <span className="mono" style={{ fontSize: 9.5, color: 'var(--muted)', letterSpacing: '0.08em', marginTop: 2 }}>TOTAL</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 120 }}>
                {donutData.map((d) => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--ink-2)' }}>{d.name}</span>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value.toLocaleString()}</b>
                    <span className="mute" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>
                      {donutTotal ? Math.round((d.value / donutTotal) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              label={cats === null ? '' : t('home.breakdownEmpty', { defaultValue: 'No service activity recorded yet' })}
              sub={cats === null ? '' : t('home.breakdownEmptySub', { defaultValue: 'The donut fills as clinical, community and operations submissions arrive.' })}
            />
          )}
        </div>

        {/* ── Top service types — ranked list ──────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div className="kicker" style={{ marginBottom: 4 }}>TOP SERVICE TYPES</div>
          <p className="section-sub" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            Most-submitted services across the programme.
          </p>

          {services === null ? (
            <EmptyState label="" sub="" />
          ) : topServices.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {topServices.map((s) => {
                const color = CATEGORY_COLORS[s.category] ?? 'var(--muted)'
                const pct = maxService > 0 ? Math.max((s.count / maxService) * 100, 3) : 0
                return (
                  <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 132, flexShrink: 0, fontSize: 12.5, color: 'var(--ink-2)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={s.name}>
                      {s.name}
                    </span>
                    <div style={{ flex: 1, height: 18, borderRadius: 5, background: 'var(--surface-3, #EEF1F4)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`, background: color, borderRadius: 5,
                        transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)',
                      }} />
                    </div>
                    <span style={{
                      width: 28, flexShrink: 0, textAlign: 'right', fontSize: 12.5, fontWeight: 600,
                      color: 'var(--ink)', fontVariantNumeric: 'tabular-nums',
                    }}>
                      {s.count}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              label={t('home.servicesEmpty', { defaultValue: 'No service submissions yet' })}
              sub={t('home.servicesEmptySub', { defaultValue: 'Services rank here as field submissions are approved.' })}
            />
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 820px) {
          .programme-breakdown .breakdown-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{
      height: 180, display: 'flex', flexDirection: 'column', gap: 6,
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      color: 'var(--muted)', padding: '0 12px',
    }}>
      {label && <span style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>{label}</span>}
      {sub && <span style={{ fontSize: 12 }}>{sub}</span>}
    </div>
  )
}
