/**
 * FundedPartners — the funder's-eye view of the programme.
 *
 * UNFPA Bangladesh funds three implementing partners. A funder landing on
 * the homepage should grasp, at a glance: WHO is funded, WHAT each partner
 * does, and WHERE they work. This section makes that the headline:
 *
 *   1. A funding-flow diagram — UNFPA at the apex branching to the three
 *      implementing partners (CIPRB, Bandhu, PHD), brand-coloured.
 *   2. Per-partner identity cards — full name, focus, and district footprint.
 *   3. The coverage map, given full width (it was cramped in the hero).
 *
 * Clicking a partner card jumps to that partner's owned page.
 */
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'

import { PartnerOverlapMap } from '@/components/maps/PartnerOverlapMap'
import {
  PARTNER_COLORS, PARTNER_NAMES, PARTNER_ROUTES, PARTNER_DISTRICTS,
  buildCoverageMap, type PartnerCode,
} from '@/data/partnerDistricts'

const PARTNERS: PartnerCode[] = ['CIPRB', 'Bandhu', 'PHD']

// What each implementing partner delivers under the UNFPA RCH grant.
// (Best-effort from the project brief / SIDA frameworks — confirmed at the
//  validation workshop, same provenance as the district lists.)
const PARTNER_FOCUS: Record<PartnerCode, string> = {
  CIPRB:  'Maternal & child health · fistula and MPDSR surveillance',
  Bandhu: 'Key-population HIV / STI outreach & counselling',
  PHD:    'Sex-worker & maternal health service delivery',
}

// Full legal names for the funder-facing cards. PARTNER_NAMES.CIPRB.en is
// just the acronym (it's reused in compact contexts like map tooltips), so
// we spell out the full names here rather than mutate the shared map.
const PARTNER_FULL_NAME: Record<PartnerCode, string> = {
  CIPRB:  'Centre for Injury Prevention & Research, Bangladesh',
  Bandhu: 'Bandhu Social Welfare Society',
  PHD:    'Partners in Health and Development',
}

export function FundedPartners() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  // Total unique districts the programme reaches across all three partners.
  const totalDistricts = buildCoverageMap().size

  return (
    <section className="section funded-partners" style={{ marginTop: 44 }}>
      <div className="section-head">
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            FUNDED BY UNFPA BANGLADESH
          </div>
          <h2 className="section-title">Three partners. One programme.</h2>
          <p className="section-sub">
            UNFPA Bangladesh funds three implementing partners delivering the
            Reproductive &amp; Child Health programme across {totalDistricts} districts.
          </p>
        </div>
      </div>

      {/* ── Funding flow: UNFPA → three implementing partners ────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Funder node */}
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            padding: '12px 26px', borderRadius: 14,
            background: 'var(--unfpa)', color: '#fff',
            boxShadow: '0 8px 24px rgba(249,96,0,0.25)',
          }}
        >
          <span style={{
            fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em',
          }}>UNFPA Bangladesh</span>
          <span className="mono" style={{
            fontSize: 10, letterSpacing: '0.14em', opacity: 0.9, marginTop: 2,
          }}>FUNDING PARTNER</span>
        </motion.div>

        {/* Connector fan — purely decorative, hidden on narrow screens */}
        <svg
          className="funded-fan"
          viewBox="0 0 100 44" preserveAspectRatio="none"
          style={{ width: '100%', maxWidth: 760, height: 44 }}
          aria-hidden="true"
        >
          <path
            d="M50 0 L50 16 M16.7 44 L16.7 24 L83.3 24 L83.3 44 M50 24 L50 44"
            fill="none" stroke="var(--hair)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"
          />
          {/* brand-coloured terminals */}
          <circle cx="16.7" cy="24" r="2" fill={PARTNER_COLORS.CIPRB} vectorEffect="non-scaling-stroke" />
          <circle cx="50"   cy="24" r="2" fill={PARTNER_COLORS.Bandhu} vectorEffect="non-scaling-stroke" />
          <circle cx="83.3" cy="24" r="2" fill={PARTNER_COLORS.PHD} vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Partner identity cards */}
        <div
          className="funded-grid"
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
            width: '100%', marginTop: 4,
          }}
        >
          {PARTNERS.map((p, i) => (
            <PartnerCard
              key={p}
              partner={p}
              delay={i * 0.08}
              reduce={reduce}
              onClick={() => navigate(PARTNER_ROUTES[p])}
            />
          ))}
        </div>
      </div>

      {/* ── Where they work — coverage map, full width ───────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div className="kicker" style={{ marginBottom: 8 }}>
          <span className="dot" />WHERE THEY WORK
        </div>
        <div className="card shimmer" style={{ padding: 12 }}>
          <PartnerOverlapMap height={420} />
        </div>
      </div>

      {/* Responsive: stack partner cards + hide the connector fan on phones */}
      <style>{`
        @media (max-width: 760px) {
          .funded-partners .funded-fan { display: none; }
          .funded-partners .funded-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  )
}

// ─── PartnerCard ────────────────────────────────────────────────────────────

function PartnerCard({
  partner, onClick, reduce, delay,
}: {
  partner: PartnerCode
  onClick: () => void
  reduce: boolean | null
  delay: number
}) {
  const color = PARTNER_COLORS[partner]
  const names = PARTNER_NAMES[partner]
  const focus = PARTNER_FOCUS[partner]
  const districts = PARTNER_DISTRICTS[partner]

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: reduce ? 0 : -2 }}
      whileTap={{ scale: 0.985 }}
      className="card"
      style={{
        textAlign: 'left', cursor: 'pointer',
        padding: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        borderTop: `3px solid ${color}`,
        transitionProperty: 'transform, box-shadow, border-color',
      }}
    >
      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {/* Acronym + district count */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)',
          }}>{partner}</span>
          <span style={{
            fontSize: 12, fontWeight: 600, color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {districts.length} districts
          </span>
        </div>

        {/* Full name + Bengali */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.3, textWrap: 'pretty' } as React.CSSProperties}>
            {PARTNER_FULL_NAME[partner]}
          </div>
          <div className="bn" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
            {names.bn}
          </div>
        </div>

        {/* Focus */}
        <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>
          {focus}
        </div>

        {/* District chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: 4 }}>
          {districts.slice(0, 8).map((d) => (
            <span key={d} style={{
              fontSize: 10.5, padding: '2px 7px', borderRadius: 999,
              background: 'var(--surface-2)', border: '1px solid var(--hair)',
              color: 'var(--ink-3)',
            }}>{d}</span>
          ))}
          {districts.length > 8 && (
            <span style={{ fontSize: 10.5, color: 'var(--muted)', alignSelf: 'center' }}>
              +{districts.length - 8} more
            </span>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 20px', borderTop: '1px solid var(--hair)',
        background: 'var(--surface-2)', fontSize: 12.5, fontWeight: 600, color,
      }}>
        View dashboard <ArrowRight size={14} />
      </div>
    </motion.button>
  )
}
