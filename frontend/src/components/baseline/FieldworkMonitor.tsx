/**
 * Baseline Fieldwork Command Center.
 *
 * The operational face of the /baseline monitor: pace against sample target,
 * per-enumerator and per-district throughput, interview duration & outcome, and
 * the data-quality flags — computed over EVERY collected interview (pending +
 * verified), so the team can catch collection problems while they're still
 * fixable. Source: GET /baseline/responses/monitoring/.
 */
import { useState } from 'react'
import {
  Users, Clock, MapPin, CheckCircle2, Gauge, Copy, Timer, TrendingUp,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { BarBreakdown, DonutBreakdown, Histogram } from '@/components/ciprb/IndicatorCharts'

const ORANGE = '#F96000'
const TEAL = '#0E8F8F'

type Pop = 'hijra' | 'fsw'
interface Progress { population: Pop; collected: number; target: number | null; pct: number | null }
interface DayStat {
  date: string; hijra: number; fsw: number; total: number
  completed: number; partial: number; refused: number; interrupted: number
  rushed: number; gps_missing: number
}
interface Bucket { name: string; value: number }
interface Collector {
  code: string; n: number; avg_min: number | null; completion_pct: number
  short: number; hijra: number; fsw: number
}
export interface Monitoring {
  total: number
  by_status: Record<string, number>
  progress: Progress[]
  targets: Record<Pop, number>
  outcomes: Bucket[]
  districts: Bucket[]
  sites: Bucket[]
  daily: { date: string; hijra: number; fsw: number; total: number }[]
  days: DayStat[]
  duration: { bands: Bucket[]; avg_min: number | null; median_min: number | null; measured: number }
  collectors: Collector[]
  quality: {
    gps_ok: number; gps_missing: number; gps_pct: number
    duplicates: number; duplicate_ids: string[]
    short_interviews: number
    short_rows: { collector: string; district: string; minutes: number; population: string }[]
  }
}

const rec = (b: Bucket[] | undefined): Record<string, number> =>
  Object.fromEntries((b || []).map((x) => [x.name, x.value]))

const POP = { hijra: 'Hijra / Gender-diverse', fsw: 'Female Sex Worker' } as const

/* ── section divider ───────────────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 2px 14px' }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3, var(--muted))' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--hair), transparent)' }} />
    </div>
  )
}

/* ── population split rows: count + share of total (no target scaffolding —
 *    targets are unknown and there's no place to set them) ─────────────────── */
function PopRow({ p, total }: { p: Progress; total: number }) {
  const colour = p.population === 'hijra' ? ORANGE : TEAL
  const share = total > 0 ? Math.round((100 * p.collected) / total) : 0
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: colour, flexShrink: 0 }} />{POP[p.population]}
        </span>
        <span style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: colour, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{p.collected}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 6 }}>
        <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--hair)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${share}%`, background: colour, borderRadius: 4, transition: 'width .6s ease' }} />
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', width: 30, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{share}%</span>
      </div>
    </div>
  )
}

/* ── the field-pulse hero: headline count + daily sparkline + progress rings */
function FieldPulse({ m, verified, pending }: { m: Monitoring; verified: number; pending: number }) {
  const spark = m.daily
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
      <div style={{ height: 4, background: 'linear-gradient(90deg, #F96000, #FF9D4D 45%, #0E8F8F)' }} />
      <div style={{ padding: '20px 22px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 190px', minWidth: 180 }}>
          <div className="kicker"><span className="live-dot" /> Field pulse · live</div>
          <div style={{ fontFamily: 'var(--display)', fontStyle: 'normal', fontSize: 62, lineHeight: 1, color: 'var(--unfpa)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em', marginTop: 6 }}>{m.total}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
            interviews collected · <b style={{ color: 'var(--emerald)' }}>{verified}</b> verified · {pending} pending
          </div>
        </div>
        {spark.length > 1 && (
          <div style={{ flex: '2 1 260px', minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
              <TrendingUp size={13} style={{ color: ORANGE }} /> Daily collection pace · {m.daily.length} days
            </div>
            <div style={{ height: 66 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spark} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pulseG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ORANGE} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={ORANGE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <Tooltip content={<TimelineTip />} cursor={{ stroke: 'var(--hair)' }} />
                  <Area type="monotone" dataKey="total" name="Interviews" stroke={ORANGE} strokeWidth={2.4} fill="url(#pulseG)" isAnimationActive={false} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <div style={{ flex: '2 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>By key population</div>
          {m.progress.map((p) => <PopRow key={p.population} p={p} total={m.total} />)}
        </div>
      </div>
    </div>
  )
}

/* ── KPI band (one card, hairline-separated metrics) ────────────────────── */
function KpiCell({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 168px', minWidth: 158, padding: '4px 6px' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: `${tone}18`, color: tone, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--display)', fontStyle: 'normal', fontSize: 26, lineHeight: 1, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}
function KpiBand({ m, completedPct }: { m: Monitoring; completedPct: number }) {
  const cells = [
    { icon: <Users size={18} />, value: String(m.total), label: 'Total interviews', tone: ORANGE },
    { icon: <CheckCircle2 size={18} />, value: `${completedPct}%`, label: 'Completed outcome', tone: TEAL },
    { icon: <Clock size={18} />, value: m.duration.avg_min != null ? `${m.duration.avg_min}m` : '—', label: 'Avg interview', tone: '#6E56CF' },
    { icon: <MapPin size={18} />, value: `${m.quality.gps_pct}%`, label: 'GPS captured', tone: m.quality.gps_pct >= 90 ? 'var(--emerald)' : 'var(--amber)' },
    { icon: <Copy size={18} />, value: String(m.quality.duplicates), label: 'Duplicates', tone: m.quality.duplicates ? 'var(--coral)' : 'var(--emerald)' },
    { icon: <Timer size={18} />, value: String(m.quality.short_interviews), label: 'Rushed (<10m)', tone: m.quality.short_interviews ? 'var(--coral)' : 'var(--emerald)' },
  ]
  return (
    <div className="card" style={{ padding: '14px 12px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'stretch' }}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ display: 'flex', flex: '1 1 168px', minWidth: 158 }}>
          {i > 0 && <span style={{ width: 1, background: 'var(--hair)', margin: '4px 8px 4px 0', flexShrink: 0 }} />}
          <KpiCell {...c} />
        </div>
      ))}
    </div>
  )
}

function Card({ kicker, title, right, children, grow = '1 1 320px' }: { kicker: string; title: string; right?: React.ReactNode; children: React.ReactNode; grow?: string }) {
  return (
    <div className="card" style={{ padding: 18, flex: grow, minWidth: 280, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <div>
          <div className="kicker"><span className="dot" style={{ background: ORANGE }} />{kicker}</div>
          <h4 style={{ margin: '4px 0 0', fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{title}</h4>
        </div>
        {right}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

/* ── enumerator roster — avatar rows, ranked by throughput ──────────────── */
const AV_COLORS = ['#F96000', '#0E8F8F', '#6E56CF', '#C44E00', '#2F9E7E', '#B3541E', '#3E63DD', '#9A4500']
function parseCollector(code: string) {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(code || '')
  return m ? { name: m[1].trim(), code: m[2].trim() } : { name: code || 'Unknown', code: '' }
}
function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  const two = (parts[0]?.[0] || '') + (parts[1]?.[0] || '')
  return (two || name.slice(0, 2) || '—').toUpperCase()
}
function colorFor(s: string) {
  const n = [...(s || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
  return AV_COLORS[n % AV_COLORS.length]
}
function CollectorList({ rows }: { rows: Collector[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  if (!rows.length) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 12.5, textAlign: 'center' }}>No enumerator activity yet.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => {
        const { name, code } = parseCollector(r.code)
        const av = colorFor(r.code)
        const compTone = r.completion_pct >= 85 ? 'var(--emerald)' : r.completion_pct >= 70 ? 'var(--amber)' : 'var(--coral)'
        return (
          <div key={r.code} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px', padding: '11px 4px', borderTop: i ? '1px solid var(--hair)' : 'none' }}>
            {/* identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '3 1 200px', minWidth: 180 }}>
              <span style={{ width: 20, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 11, background: `${av}1c`, color: av, fontSize: 13, fontWeight: 800, flexShrink: 0, letterSpacing: '.02em' }}>{initialsOf(name)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                  {code && <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', border: '1px solid var(--hair)', borderRadius: 4, padding: '1px 5px' }}>{code}</span>}
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.hijra} Hijra · {r.fsw} FSW</span>
                </div>
              </div>
            </div>
            {/* metrics — stays together, wraps under identity on narrow widths */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '4 1 300px', minWidth: 288, justifyContent: 'flex-end' }}>
              <div style={{ flex: '1 1 90px', minWidth: 74, display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 15, color: 'var(--ink)', minWidth: 22, textAlign: 'right' }}>{r.n}</span>
                <span style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--hair)', overflow: 'hidden', minWidth: 40 }}>
                  <span style={{ display: 'block', height: '100%', width: `${(r.n / max) * 100}%`, background: av, borderRadius: 4, transition: 'width .5s ease' }} />
                </span>
              </div>
              <div style={{ width: 50, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{r.avg_min != null ? `${r.avg_min}m` : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>avg</div>
              </div>
              <div style={{ width: 54, textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: compTone, fontVariantNumeric: 'tabular-nums' }}>{r.completion_pct}%</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>complete</div>
              </div>
              <div style={{ width: 78, textAlign: 'right', flexShrink: 0 }}>
                {r.short > 0
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--coral)', fontWeight: 700 }}><Timer size={13} />{r.short} rushed</span>
                  : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--emerald)' }}><CheckCircle2 size={13} />clean</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── quality flag card ──────────────────────────────────────────────────── */
function Flag({ icon, n, label, tone, note }: { icon: React.ReactNode; n: number | string; label: string; tone: string; note?: string }) {
  return (
    <div className="card snug" style={{ flex: '1 1 180px', minWidth: 170, borderLeft: `3px solid ${tone}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: tone }}>{icon}<span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span></div>
      <div style={{ fontFamily: 'var(--display)', fontStyle: 'normal', fontSize: 32, lineHeight: 1.1, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{n}</div>
      {note && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{note}</div>}
    </div>
  )
}

function TimelineTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--hair)', borderRadius: 8, padding: '8px 10px', fontSize: 12, boxShadow: '0 6px 20px rgba(0,0,0,.12)' }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value}</b></div>
      ))}
    </div>
  )
}

/* ── daily update — the "previous day" digest NK asked for, in-dashboard ── */
function DStat({ value, label, accent, big }: { value: number; label: string; accent?: string; big?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--display)', fontStyle: 'normal', fontSize: big ? 40 : 26, lineHeight: 1, color: accent || 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const isoLocal = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

function DailyCalendar({ days }: { days: DayStat[] }) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const sortedDates = [...days.map((d) => d.date)].sort()
  const [sel, setSel] = useState(sortedDates.length ? sortedDates[sortedDates.length - 1] : '')
  if (!days.length) return null

  const first = new Date(sortedDates[0] + 'T00:00:00')
  const last = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00')
  const gridStart = new Date(first); gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const gridEnd = new Date(last); gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()))
  const cells: Date[] = []
  for (const c = new Date(gridStart); c <= gridEnd; c.setDate(c.getDate() + 1)) cells.push(new Date(c))
  const weeks: Date[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  const max = Math.max(1, ...days.map((d) => d.total))

  const d = byDate.get(sel)
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999 } as const
  const nice = d ? (() => { try { return new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) } catch { return d.date } })() : ''

  return (
    <div className="card" style={{ padding: 18, borderLeft: `3px solid ${ORANGE}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="kicker"><span className="dot" style={{ background: ORANGE }} />Collection calendar</div>
          <h3 style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Pick a day to see its update</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted)' }}>
          <span>fewer</span>
          {[0.18, 0.4, 0.62, 0.85, 1].map((o) => <span key={o} style={{ width: 13, height: 13, borderRadius: 3, background: `rgba(249,96,0,${o})` }} />)}
          <span>more</span>
          <span style={{ width: 13, height: 13, borderRadius: 3, background: 'transparent', border: '1.5px solid #E5484D', marginLeft: 6 }} /><span>flagged</span>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* calendar grid — compact fixed cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 30px)', gap: 4 }}>
          {WEEKDAYS.map((w) => <div key={w} style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', textTransform: 'uppercase' }}>{w[0]}</div>)}
          {weeks.flat().map((dt) => {
            const key = isoLocal(dt)
            const stat = byDate.get(key)
            const n = stat?.total ?? 0
            const inRange = dt >= first && dt <= last
            const flagged = stat ? (stat.rushed + stat.gps_missing) > 0 : false
            const isSel = key === sel
            const bg = n > 0 ? `rgba(249,96,0,${0.18 + 0.82 * (n / max)})` : (inRange ? 'var(--hair)' : 'transparent')
            const textCol = n / max > 0.55 ? '#fff' : 'var(--ink)'
            return (
              <button
                key={key}
                onClick={() => stat && setSel(key)}
                title={`${key} · ${n} interview${n === 1 ? '' : 's'}${flagged ? ` · ${(stat!.rushed + stat!.gps_missing)} flag(s)` : ''}`}
                disabled={!stat}
                style={{
                  width: 30, height: 30, borderRadius: 6, background: bg,
                  border: isSel ? `2px solid ${ORANGE}` : flagged ? '1.5px solid #E5484D' : '1px solid var(--hair)',
                  cursor: stat ? 'pointer' : 'default', color: inRange ? textCol : 'var(--muted)',
                  opacity: inRange ? 1 : 0.3, display: 'grid', placeItems: 'center', padding: 0,
                  fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}
              >
                {dt.getDate()}
              </button>
            )
          })}
        </div>

      {/* selected-day detail — beside the calendar */}
      {d && (
        <div style={{ flex: '1 1 230px', minWidth: 210 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{nice}</h4>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <DStat big value={d.total} label="interviews" accent={ORANGE} />
            <DStat value={d.hijra} label="Hijra" />
            <DStat value={d.fsw} label="FSW" />
            <div style={{ borderLeft: '1px solid var(--hair)', paddingLeft: 22, display: 'flex', gap: 22 }}>
              <DStat value={d.completed} label="completed" accent="var(--emerald)" />
              <DStat value={d.partial} label="partial" />
              <DStat value={d.refused} label="refused" />
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Quality flags</span>
            {(d.rushed + d.gps_missing) === 0
              ? <span style={{ ...chip, color: 'var(--emerald)', background: 'rgba(14,143,80,.10)' }}><CheckCircle2 size={14} />No flags this day</span>
              : <>
                  {d.rushed > 0 && <span style={{ ...chip, color: '#E5484D', background: 'rgba(229,72,77,.10)' }}><Timer size={13} />{d.rushed} rushed (&lt;10m)</span>}
                  {d.gps_missing > 0 && <span style={{ ...chip, color: '#E5484D', background: 'rgba(229,72,77,.10)' }}><MapPin size={13} />{d.gps_missing} missing GPS</span>}
                </>}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export function FieldworkMonitor({ m }: { m: Monitoring }) {
  const verified = m.by_status?.approved ?? m.by_status?.APPROVED ?? 0
  const pending = m.by_status?.pending ?? m.by_status?.PENDING ?? 0
  const completedPct = (() => {
    const c = m.outcomes.find((o) => o.name === 'Completed')?.value ?? 0
    const t = m.outcomes.reduce((s, o) => s + o.value, 0)
    return t ? Math.round((100 * c) / t) : 0
  })()

  return (
    <section style={{ marginTop: 8 }}>
      <FieldPulse m={m} verified={verified} pending={pending} />

      <div style={{ marginTop: 14 }}><KpiBand m={m} completedPct={completedPct} /></div>

      <SectionLabel>Collection pace &amp; outcomes</SectionLabel>
      <DailyCalendar days={m.days} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
        <Card kicker="Collection pace" title="Interviews per day" grow="2 1 460px" right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.daily.length} days</span>}>
          <div style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m.daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gH" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ORANGE} stopOpacity={0.5} /><stop offset="100%" stopColor={ORANGE} stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="gF" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEAL} stopOpacity={0.45} /><stop offset="100%" stopColor={TEAL} stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hair)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickFormatter={(d) => String(d).slice(5)} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} width={30} />
                <Tooltip content={<TimelineTip />} />
                <Area type="monotone" dataKey="hijra" name="Hijra" stackId="1" stroke={ORANGE} fill="url(#gH)" strokeWidth={2} isAnimationActive={false} />
                <Area type="monotone" dataKey="fsw" name="FSW" stackId="1" stroke={TEAL} fill="url(#gF)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <DonutBreakdown kicker="Interview outcome" title="How interviews ended" data={rec(m.outcomes)} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14 }}>
        <Histogram kicker="Interview duration" title={`Length distribution · median ${m.duration.median_min ?? '—'}m`} data={rec(m.duration.bands)} />
        <BarBreakdown kicker="Coverage" title="Interviews by district" data={rec(m.districts)} />
      </div>

      <SectionLabel>Field team</SectionLabel>
      <Card kicker="Enumerators" title="Throughput &amp; quality, ranked" grow="1 1 100%"
        right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{m.collectors.length} active</span>}>
        <CollectorList rows={m.collectors} />
      </Card>

      <SectionLabel>Data quality</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Flag icon={<MapPin size={15} />} n={`${m.quality.gps_pct}%`} label="GPS captured" tone="#0E8F8F" note={`${m.quality.gps_missing} missing location`} />
        <Flag icon={<Copy size={15} />} n={m.quality.duplicates} label="Duplicate ids" tone={m.quality.duplicates ? '#E5484D' : '#0E8F8F'} note={m.quality.duplicates ? 'needs review' : 'none detected'} />
        <Flag icon={<Timer size={15} />} n={m.quality.short_interviews} label="Rushed interviews" tone={m.quality.short_interviews ? '#E5484D' : '#0E8F8F'} note="under 10 minutes" />
        <Flag icon={<Gauge size={15} />} n={`${m.duration.avg_min ?? '—'}m`} label="Median / avg length" tone="#F96000" note={`${m.duration.measured} timed`} />
      </div>
    </section>
  )
}
