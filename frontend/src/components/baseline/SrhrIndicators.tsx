/**
 * Major SRHR indicators — module-based analytical summary of the baseline.
 *
 * Renders CIPRB's indicator list (Dashbroad spec) per key population, grouped by
 * questionnaire module. Each tile carries a DIRECTION (good / concern / neutral)
 * so a reviewer reads the picture at a glance — green = positive outcome, red =
 * concern. Value + a magnitude bar + the source question + the answered-n it was
 * computed over. Source: GET /baseline/responses/srhr/.
 */
import { useState } from 'react'
import {
  Briefcase, Scale, BookOpenCheck, HeartHandshake, Stethoscope, Brain, ShieldAlert,
} from 'lucide-react'

type Pop = 'hijra' | 'fsw'
type Dir = 'good' | 'bad' | 'neutral'
interface Indicator { label: string; ref: string; dir?: Dir; value: number | null; n: number; unit?: string }
interface Module { module: string; indicators: Indicator[] }
export interface Srhr { hijra: { n: number; modules: Module[] }; fsw: { n: number; modules: Module[] } }

const POP_LABEL: Record<Pop, string> = { hijra: 'Hijra / Gender-diverse', fsw: 'Female Sex Workers' }

const GOOD = '#12916B'   // positive outcome
const CONCERN = '#E5484D' // higher = worse
const NEUTRAL = '#8A7CF0' // descriptive, no value judgement
const dirColor = (d?: Dir) => (d === 'bad' ? CONCERN : d === 'neutral' ? NEUTRAL : GOOD)

const MODULE_META: { match: RegExp; icon: React.ReactNode }[] = [
  { match: /livelihood/i, icon: <Briefcase size={15} /> },
  { match: /discrimination/i, icon: <Scale size={15} /> },
  { match: /knowledge/i, icon: <BookOpenCheck size={15} /> },
  { match: /behaviour|prevention/i, icon: <HeartHandshake size={15} /> },
  { match: /health status|testing/i, icon: <Stethoscope size={15} /> },
  { match: /mental/i, icon: <Brain size={15} /> },
  { match: /violence/i, icon: <ShieldAlert size={15} /> },
]
const iconFor = (name: string) => MODULE_META.find((m) => m.match.test(name))?.icon ?? <HeartHandshake size={15} />

function Tile({ ind }: { ind: Indicator }) {
  const col = ind.value == null ? 'var(--muted)' : dirColor(ind.dir)
  const isPctLike = !ind.unit || ind.unit === 'score'
  const display =
    ind.value == null ? '—'
    : ind.unit === '৳' ? `৳${ind.value.toLocaleString()}`
    : `${ind.value}${isPctLike ? '%' : ''}`
  const barPct = ind.value != null && isPctLike ? Math.min(100, ind.value) : null
  return (
    <div style={{
      background: 'var(--surface-2, var(--surface))', border: '1px solid var(--hair)',
      borderRadius: 13, padding: '13px 14px 11px', minWidth: 0, minHeight: 128,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 30, lineHeight: 1,
          color: col, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
        }}>{display}</span>
        <span className="mono" style={{
          fontSize: 9.5, color: 'var(--muted)', padding: '2px 6px', borderRadius: 5,
          border: '1px solid var(--hair)', whiteSpace: 'nowrap', flexShrink: 0,
        }}>{ind.ref}</span>
      </div>
      {barPct != null && (
        <div style={{ height: 5, borderRadius: 3, background: 'var(--hair)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${barPct}%`, background: col, borderRadius: 3, transition: 'width .8s cubic-bezier(.22,1,.36,1)' }} />
        </div>
      )}
      <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.35, fontWeight: 500, textWrap: 'pretty' as any }}>{ind.label}</div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 'auto', paddingTop: 2 }}>n&nbsp;=&nbsp;{ind.n}</div>
    </div>
  )
}

function LegendDot({ c, label }: { c: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />{label}
    </span>
  )
}

export function SrhrIndicators({ data }: { data: Srhr }) {
  const [pop, setPop] = useState<Pop>('hijra')
  const d = data[pop]
  if (!d) return null
  return (
    <section className="section" style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div className="kicker"><span className="dot" /> Major SRHR indicators · verified interviews</div>
          <h2 style={{ margin: '6px 0 0', fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 30, lineHeight: 1.05, color: 'var(--ink)' }}>
            The baseline picture, module by module
          </h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            <LegendDot c={GOOD} label="positive outcome" />
            <LegendDot c={CONCERN} label="concern / higher is worse" />
            <LegendDot c={NEUTRAL} label="descriptive" />
          </div>
        </div>
        <div className="pills">
          {(['hijra', 'fsw'] as Pop[]).map((p) => (
            <button key={p} className={`pill ${pop === p ? 'on' : ''}`} onClick={() => setPop(p)}>
              {POP_LABEL[p]} · {data[p]?.n ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
        {d.modules.map((m) => (
          <div key={m.module} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 9, background: 'var(--surface-2, var(--surface))', border: '1px solid var(--hair)', color: 'var(--unfpa)' }}>{iconFor(m.module)}</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{m.module}</h3>
              <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{m.indicators.length} indicators</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(196px, 1fr))', gap: 11 }}>
              {m.indicators.map((ind) => <Tile key={ind.label} ind={ind} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
