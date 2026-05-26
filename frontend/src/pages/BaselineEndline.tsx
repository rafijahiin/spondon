/**
 * Baseline & Endline — Step 7 placeholder.
 *
 * Holds the same "Awaiting register variables from supervisor" state as
 * the CIPRB hub tabs. The standalone /baseline route lands here; the
 * tab inside /fistula renders the same placeholder content.
 *
 * No forms, no data entry, no API calls — every interactive surface
 * will be re-introduced after the 3–4 June 2026 validation workshop.
 */
import { Lock, BookOpen } from 'lucide-react'

export default function BaselineEndline() {
  return (
    <>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>CIPRB · BASELINE / ENDLINE</span>
          <span className="sep">/</span>
          <span>SURVEY INSTRUMENT</span>
        </div>
        <h1
          className="hero-headline anim-rise d1"
          style={{
            marginBottom: 14,
            fontSize: 'clamp(48px, 7vw, 88px)',
            letterSpacing: '-0.035em',
          }}
        >
          <span className="figure" style={{ color: 'var(--unfpa)' }}>
            Baseline
          </span>
        </h1>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 680 }}>
          CIPRB-managed baseline and endline survey instrument.
          Placeholder until the supervisor confirms the variable list
          at the validation workshop.
        </p>
      </section>

      <section className="section" style={{ marginTop: 12 }}>
        <div
          className="card shimmer"
          style={{
            padding: '40px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            alignItems: 'flex-start',
            background:
              'linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)',
            border: '1px dashed var(--hair-2)',
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#9A3412',
              background: '#FED7AA',
              borderRadius: 999,
            }}
          >
            <Lock size={12} />
            Awaiting register variables from supervisor
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <BookOpen size={32} style={{ color: 'var(--unfpa)' }} />
            <h2
              style={{
                fontSize: 'clamp(26px, 2.8vw, 36px)',
                fontWeight: 600,
                lineHeight: 1.15,
                color: 'var(--ink)',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Baseline Assessment
            </h2>
          </div>

          <p
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--ink-2)',
              maxWidth: 620,
              textWrap: 'pretty',
            } as React.CSSProperties}
          >
            CIPRB-managed baseline survey instrument and respondent
            registry. Tab will be activated after validation workshop.
          </p>

          <div
            style={{
              fontSize: 12.5,
              color: 'var(--muted)',
              paddingTop: 18,
              marginTop: 6,
              borderTop: '1px solid var(--hair)',
              maxWidth: 620,
            }}
          >
            <b>Status:</b> placeholder. No data entry, no live records,
            no API calls. This page will activate after the 3–4 June 2026
            validation workshop confirms the survey variable list with
            the CIPRB Reproductive and Child Health team.
          </div>
        </div>
      </section>

      <div style={{ height: 80 }} />
    </>
  )
}
