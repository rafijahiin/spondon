/**
 * Major SRHR indicators — module-based analytical summary of the baseline.
 *
 * Renders CIPRB's indicator list (Dashbroad spec) per key population, grouped by
 * questionnaire module. Every tile: headline value + question reference + the
 * answered-N it was computed over. Source: GET /baseline/responses/srhr/.
 */
import { useState } from 'react'
import {
  Briefcase, Scale, BookOpenCheck, HeartHandshake, Stethoscope, Brain, ShieldAlert,
} from 'lucide-react'

type Pop = 'hijra' | 'fsw'
interface Indicator { label: string; ref: string; value: number | null; n: number; unit?: string }
interface Module { module: string; indicators: Indicator[] }
export interface Srhr { hijra: { n: number; modules: Module[] }; fsw: { n: number; modules: Module[] } }

const POP_LABEL: Record<Pop, string> = { hijra: 'Hijra / Gender-diverse', fsw: 'Female Sex Workers' }

/** Per-module accent + icon — keeps nine modules scannable at a glance. */
const MODULE_STYLE: { match: RegExp; tone: string; icon: React.ReactNode }[] = [
  { match: /livelihood/i, tone: '#B8860B', icon: <Briefcase size={15} /> },
  { match: /discrimination/i, tone: '#7C6CF0', icon: <Scale size={15} /> },
  { match: /knowledge/i, tone: '#0E8F8F', icon: <BookOpenCheck size={15} /> },
  { match: /behaviour|prevention/i, tone: '#F96000', icon: <HeartHandshake size={15} /> },
  { match: /health status|testing/i, tone: '#2E7D32', icon: <Stethoscope size={15} /> },
  { match: /mental/i, tone: '#C2185B', icon: <Brain size={15} /> },
  { match: /violence/i, tone: '#E5484D', icon: <ShieldAlert size={15} /> },
]
const styleFor = (name: string) =>
  MODULE_STYLE.find((m) => m.match.test(name)) ?? { tone: '#F96000', icon: <HeartHandshake size={15} /> }

function Tile({ ind, tone }: { ind: Indicator; tone: string }) {
  const isPct = !ind.unit
  const isScore = ind.unit === 'score'
  const display =
    ind.value == null ? '—'
    : ind.unit === '৳' ? `৳${ind.value.toLocaleString()}`
    : `${ind.value}${isPct || isScore ? '%' : ''}`
  const barPct = ind.value != null && (isPct || isScore) ? Math.min(100, ind.value) : null
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--hair)', borderRadius: 12,
      padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{
          fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 27, lineHeight: 1,
          color: ind.value == null ? 'var(--muted)' : tone, fontVariantNumeric: 'tabular-nums',
        }}>{display}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{ind.ref}</span>
      </div>
      {barPct != null && (
        <span style={{ display: 'block', height: 4, borderRadius: 2, background: 'var(--hair)', overflow: 'hidden' }}>
          <span style={{ display: 'block', height: '100%', width: `${barPct}%`, background: tone, transition: 'width .7s cubic-bezier(.22,1,.36,1)' }} />
        </span>
      )}
      <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.35, textWrap: 'pretty' as any }}>{ind.label}</div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>n = {ind.n}</div>
    </div>
  )
}

export function SrhrIndicators({ data }: { data: Srhr }) {
  const [pop, setPop] = useState<Pop>('hijra')
  const d = data[pop]
  if (!d) return null
  return (
    <section className="section" style={{ marginTop: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div className="kicker"><span className="dot" /> Major SRHR indicators · verified interviews</div>
          <h2 style={{ margin: '6px 0 0', fontFamily: 'var(--display)', fontStyle: 'italic', fontSize: 30, color: 'var(--ink)' }}>
            The baseline picture, module by module
          </h2>
        </div>
        <div className="pills">
          {(['hijra', 'fsw'] as Pop[]).map((p) => (
            <button key={p} className={`pill ${pop === p ? 'on' : ''}`} onClick={() => setPop(p)}>
              {POP_LABEL[p]} · {data[p]?.n ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {d.modules.map((m) => {
          const st = styleFor(m.module)
          return (
            <div key={m.module} className="card" style={{ padding: 18, borderLeft: `3px solid ${st.tone}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8, background: `${st.tone}1a`, color: st.tone }}>{st.icon}</span>
                <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--ink)' }}>{m.module}</h3>
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{m.indicators.length} indicators</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 11 }}>
                {m.indicators.map((ind) => <Tile key={ind.label} ind={ind} tone={st.tone} />)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
