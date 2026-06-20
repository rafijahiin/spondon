/**
 * Reusable indicator chart primitives for the CIPRB dashboard.
 *
 * Every CIPRB "major indicator" is a distribution: a labelled set of
 * counts. These three primitives render that consistently —
 *   BarBreakdown   — ranked horizontal bars (most categoricals)
 *   DonutBreakdown — donut + legend (place/mode/cause distributions)
 *   Histogram      — ordered bands (age / weeks / durations)
 *   StatTile       — a single highlighted ratio (PNC, delivery outcome)
 *
 * All accept a `data: Record<string, number>` and an optional `labels`
 * map (slug -> human label). Empty / all-zero data renders a quiet
 * empty-state instead of a broken chart.
 */
import { useState } from 'react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts'

const CIPRB_ORANGE = '#F96000'
const PALETTE = [
  '#F96000', '#FB904D', '#FDB37D', '#C44E00', '#E8881C',
  '#7A2E00', '#FFD9B8', '#9A4500', '#FFC59E', '#5C2200',
]

function totalOf(data: Record<string, number>): number {
  return Object.values(data || {}).reduce((s, v) => s + (v || 0), 0)
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{
      padding: '24px 12px', textAlign: 'center', fontSize: 12,
      color: 'var(--muted)',
    }}>
      No data yet — {label} fills as submissions arrive.
    </div>
  )
}

function Frame({
  kicker, title, children,
}: {
  kicker?: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="card" style={{ padding: 18, flex: '1 1 320px', minWidth: 280, display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 10 }}>
        {kicker && (
          <div className="kicker"><span className="dot" style={{ background: CIPRB_ORANGE }} />{kicker}</div>
        )}
        <h4 style={{ margin: '4px 0 0', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</h4>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

/** Ranked horizontal bars. Use `ordered` to keep the data's own key order
 *  (for histogram-like categoricals) instead of sorting by value. */
export function BarBreakdown({
  title, kicker, data, labels = {}, ordered = false,
}: {
  title: string
  kicker?: string
  data: Record<string, number>
  labels?: Record<string, string>
  ordered?: boolean
}) {
  const total = totalOf(data)
  let entries = Object.entries(data || {}).map(([k, v]) => ({
    k, label: labels[k] || k, value: v || 0,
  }))
  if (!ordered) entries = entries.sort((a, b) => b.value - a.value)
  const max = Math.max(1, ...entries.map(e => e.value))
  return (
    <Frame kicker={kicker} title={title}>
      {total === 0 ? <Empty label={title} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
          {entries.map(e => (
            <div key={e.k} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--ink-2)' }}>{e.label}</span>
                <span>
                  <b style={{ fontVariantNumeric: 'tabular-nums' }}>{e.value}</b>
                  <span className="mute" style={{ marginLeft: 6, fontSize: 11 }}>
                    {total > 0 ? `${Math.round((e.value / total) * 100)}%` : '—'}
                  </span>
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{
                  width: `${(e.value / max) * 100}%`, height: '100%',
                  background: CIPRB_ORANGE, borderRadius: 3,
                  transition: 'width 400ms ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Frame>
  )
}

/** Ordered bands (age / gestational week / duration). Same renderer as
 *  BarBreakdown but always keeps key order. */
export function Histogram(props: {
  title: string; kicker?: string
  data: Record<string, number>; labels?: Record<string, string>
}) {
  return <BarBreakdown {...props} ordered />
}

/** Donut + legend. Good for a small number of mutually-exclusive slices
 *  (place of death, mode of delivery, cause). */
export function DonutBreakdown({
  title, kicker, data, labels = {},
}: {
  title: string
  kicker?: string
  data: Record<string, number>
  labels?: Record<string, string>
}) {
  const total = totalOf(data)
  const pie = Object.entries(data || {})
    .map(([k, v], i) => ({ name: labels[k] || k, value: v || 0, color: PALETTE[i % PALETTE.length] }))
    .filter(d => d.value > 0)
  // Two independent, both-reliable hover affordances:
  //  (a) Recharts <Tooltip> on the Pie — fires on slice hover. The ORIGINAL
  //      bug was purely z-order: the absolutely-positioned centre total
  //      rendered ABOVE the tooltip, so the digit bled through its text.
  //      Fixed with wrapperStyle zIndex + an opaque card.
  //  (b) legend-row hover (real React onMouseEnter on a div) — dims the
  //      other slices and swaps the centre readout to that slice.
  const [active, setActive] = useState<number | null>(null)
  const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0
  return (
    <Frame kicker={kicker} title={title}>
      {total === 0 ? <Empty label={title} /> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  innerRadius={0} outerRadius={72} paddingAngle={1}
                  stroke="#fff" strokeWidth={1}
                  startAngle={90} endAngle={-270}
                  isAnimationActive={false}
                  // Hover handlers belong on the Pie (Recharts gives the slice
                  // index); per-Cell onMouseEnter does not fire reliably.
                  onMouseEnter={(_, idx: number) => setActive(idx)}
                  onMouseMove={(_, idx: number) => setActive(idx)}
                  onMouseLeave={() => setActive(null)}>
                  {pie.map((d, idx) => (
                    <Cell key={d.name} fill={d.color}
                      opacity={active === null || active === idx ? 1 : 0.35}
                      style={{ cursor: 'pointer', transition: 'opacity 150ms' }} />
                  ))}
                </Pie>
                <Tooltip
                  // zIndex lifts the tooltip above the centre-total overlay so
                  // the digit no longer bleeds through the label text.
                  wrapperStyle={{ zIndex: 50, outline: 'none' }}
                  // itemStyle/labelStyle force readable text in BOTH themes —
                  // without them Recharts paints the value in the (often pale)
                  // slice colour and the label in its default dark, both of
                  // which are unreadable on the dark-mode surface.
                  contentStyle={{
                    background: 'var(--surface)', border: '1px solid var(--hair)',
                    borderRadius: 8, fontSize: 12, color: 'var(--ink)',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
                  }}
                  itemStyle={{ color: 'var(--ink)' }}
                  labelStyle={{ color: 'var(--ink)' }}
                  formatter={(value: number, name: string) =>
                    [`${value} (${pct(value)}%)`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>
              <b style={{ fontSize: 16, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{total}</b> total
            </div>
            {pie.map((d, idx) => (
              <div key={d.name}
                onMouseEnter={() => setActive(idx)} onMouseLeave={() => setActive(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                  opacity: active === null || active === idx ? 1 : 0.45,
                  transition: 'opacity 150ms',
                }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: 'var(--ink-2)' }}>{d.name}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{d.value}</b>
                <span className="mute" style={{ fontSize: 11, width: 36, textAlign: 'right' }}>
                  {pct(d.value)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Frame>
  )
}

/** A single ratio highlighted as a big stat (e.g. PNC received yes/total,
 *  livebirth/total). Picks the `highlight` key as numerator. */
export function StatTile({
  title, kicker, data, highlight, labels = {},
}: {
  title: string
  kicker?: string
  data: Record<string, number>
  highlight: string
  labels?: Record<string, string>
}) {
  const total = totalOf(data)
  const num = data?.[highlight] || 0
  const pct = total > 0 ? Math.round((num / total) * 100) : null
  return (
    <Frame kicker={kicker} title={title}>
      {total === 0 ? <Empty label={title} /> : (
        <div>
          <div style={{
            fontSize: 40, fontWeight: 800, color: CIPRB_ORANGE, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}>
            {pct !== null ? `${pct}%` : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>
            {labels[highlight] || highlight}: {num} of {total}
          </div>
          {/* secondary breakdown */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {Object.entries(data).map(([k, v]) => (
              <span key={k} className="tag" style={{ fontSize: 11 }}>
                {labels[k] || k} <b style={{ marginLeft: 4 }}>{v}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </Frame>
  )
}
