/**
 * ProgrammeBreakdown — two compact, editorial charts for the homepage:
 *
 *   1. Activity by category — a donut (Clinical / Community / Operations)
 *      from /dashboard/activity-breakdown/.
 *   2. Partner attainment — horizontal bars of each partner's % to target,
 *      computed from the IndicatorProgress already loaded on the page.
 *
 * Light, brand-tinted, recharts (already a dependency). Both degrade to a
 * calm empty/pending state before real data exists.
 */
import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useTranslation } from 'react-i18next'
import { api } from '@/api/client'
import { type PartnerCode } from '@/data/partnerDistricts'
import type { IndicatorProgress } from '@/types'

const PARTNERS: PartnerCode[] = ['PHD', 'Bandhu', 'CIPRB']

// Three distinct hues from the warm UNFPA palette already used across the home
// page — orange (primary), coral (Community accent), gold (a true amber, kept
// clearly lighter/yellower than the orange so the donut slices never read as
// the same colour). No blue, no collision with the green/red status bands.
// Vivid warm triad — this is the reference palette for the whole home page.
const CATEGORY_COLORS: Record<string, string> = {
  Clinical: '#F96000',   // vivid UNFPA orange
  Community: '#ED5B7E',  // coral (pink)
  Operations: '#F2B544', // warm gold — distinct from the orange above
}

// ── Partner attainment (from already-loaded progress) ─────────────────────────

function partnerPct(partner: PartnerCode, rows: IndicatorProgress[] | null): number | null {
  if (!rows) return null
  const wt = rows.filter((r) => r.organisation === partner && r.target_value !== null && !r.unlinked)
  if (!wt.length) return null
  const ach = wt.reduce((s, r) => s + (r.achievement ?? 0), 0)
  const tgt = wt.reduce((s, r) => s + (r.target_value ?? 0), 0)
  return tgt > 0 ? Math.round((ach / tgt) * 1000) / 10 : 0
}

function bandColor(pct: number): string {
  if (pct >= 75) return '#58968A'
  if (pct >= 40) return '#FB904D'
  return '#F10F45'
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

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

export function ProgrammeBreakdown({ progress }: { progress: IndicatorProgress[] | null }) {
  const { t } = useTranslation()
  const [cats, setCats] = useState<Record<string, number> | null>(null)

  useEffect(() => {
    api.get('/dashboard/activity-breakdown/')
      .then((r) => setCats(r.data?.categories ?? {}))
      .catch(() => setCats({}))
  }, [])

  const donutData = ['Clinical', 'Community', 'Operations'].map((name) => ({
    name, value: cats?.[name] ?? 0, color: CATEGORY_COLORS[name],
  }))
  const donutTotal = donutData.reduce((s, d) => s + d.value, 0)

  const barData = PARTNERS.map((p) => {
    const pct = partnerPct(p, progress)
    return { partner: p, pct: pct ?? 0, pending: pct === null, color: pct === null ? 'var(--muted)' : bandColor(pct) }
  })

  return (
    <section className="section programme-breakdown" style={{ marginTop: 44 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            {t('home.breakdownKicker', { defaultValue: 'PROGRAMME BREAKDOWN' })}
          </div>
          <h2 className="section-title">{t('home.breakdownTitle', { defaultValue: 'Where activity sits, and how partners track' })}</h2>
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

        {/* ── Partner attainment — horizontal bars ─────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <div className="kicker" style={{ marginBottom: 4 }}>PARTNER ATTAINMENT</div>
          <p className="section-sub" style={{ margin: '0 0 8px', fontSize: 12.5 }}>
            Each partner's overall progress to target (full bar = 100%).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
            {barData.map((d) => (
              <div key={d.partner} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 58, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', textAlign: 'right', flexShrink: 0 }}>
                  {d.partner}
                </span>
                <div style={{ flex: 1, height: 22, borderRadius: 6, background: 'var(--surface-3, #EEF1F4)', overflow: 'hidden', position: 'relative' }}>
                  <div style={{
                    height: '100%',
                    width: `${d.pending ? 0 : Math.max(d.pct, 0)}%`,
                    background: d.color,
                    borderRadius: 6,
                    transition: 'width 800ms cubic-bezier(0.22,1,0.36,1)',
                  }} />
                </div>
                <span style={{
                  width: 90, fontSize: 11.5, textAlign: 'right', flexShrink: 0,
                  color: d.pending ? 'var(--muted)' : 'var(--ink-3)',
                  fontStyle: d.pending ? 'italic' : 'normal',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {d.pending ? 'targets pending' : `${d.pct}%`}
                </span>
              </div>
            ))}
          </div>
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
