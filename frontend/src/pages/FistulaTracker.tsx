/**
 * CIPRB Hub — Step 7 placeholder shell.
 *
 * The CIPRB owned-area lives at /fistula (per Step 3 Part B nav). The
 * three tabs below — Fistula Corner, Fistula Campaign, Baseline Assessment
 * — render placeholder copy until the supervisor confirms the register
 * variables at the 3-4 June 2026 validation workshop. No forms, no data
 * entry, no live records are surfaced here.
 *
 * Once the supervisor signs off the variables we'll replace each tab's
 * body with its real entry surface — but the route, breadcrumb and
 * tab labels stay stable so muscle memory survives.
 */
import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ClipboardList, Megaphone, BookOpen, Lock } from 'lucide-react'

type TabKey = 'corner' | 'campaign' | 'baseline'

interface TabDef {
  key: TabKey
  label: string
  labelBn: string
  icon: React.ReactNode
  summary: string
}

const TABS: TabDef[] = [
  {
    key: 'corner',
    label: 'Fistula Corner',
    labelBn: 'ফিস্টুলা কর্নার',
    icon: <ClipboardList size={16} />,
    summary:
      'District Hospital register of women diagnosed with obstetric fistula. ' +
      'Tab will be activated after validation workshop.',
  },
  {
    key: 'campaign',
    label: 'Fistula Campaign',
    labelBn: 'ফিস্টুলা ক্যাম্পেইন',
    icon: <Megaphone size={16} />,
    summary:
      'House-to-house screening campaign register and referral chain. ' +
      'Tab will be activated after validation workshop.',
  },
  {
    key: 'baseline',
    label: 'Baseline Assessment',
    labelBn: 'বেসলাইন সমীক্ষা',
    icon: <BookOpen size={16} />,
    summary:
      'CIPRB-managed baseline survey instrument and respondent registry. ' +
      'Tab will be activated after validation workshop.',
  },
]

export default function FistulaTracker() {
  const [active, setActive] = useState<TabKey>('corner')
  const reduce = useReducedMotion()
  const activeTab = TABS.find((t) => t.key === active)!

  return (
    <>
      {/* ───────────────── Hero ───────────────── */}
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>CIPRB · IMPLEMENTING PARTNER</span>
          <span className="sep">/</span>
          <span>RCH PROGRAMME REGISTERS</span>
        </div>
        <h1
          className="hero-headline anim-rise d1"
          style={{
            marginBottom: 14,
            fontSize: 'clamp(48px, 7vw, 96px)',
            letterSpacing: '-0.035em',
          }}
        >
          <span className="figure" style={{ color: 'var(--unfpa)' }}>CIPRB</span>
        </h1>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 720 }}>
          The three registers below are the CIPRB-owned surveillance
          surfaces under the IDMS programme. Each tab is held in a
          placeholder state until the supervisor signs off the
          register variables at the 3–4 June validation workshop.
        </p>
      </section>

      {/* ───────────────── Tabs ───────────────── */}
      <section className="section" style={{ marginTop: 8 }}>
        <div
          role="tablist"
          aria-label="CIPRB registers"
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
            padding: 6,
            background: 'var(--surface-2)',
            borderRadius: 14,
            border: '1px solid var(--hair)',
            width: 'fit-content',
            marginBottom: 24,
          }}
        >
          {TABS.map((t) => {
            const isActive = active === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 14px',
                  fontSize: 13.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#fff' : 'var(--ink-2)',
                  background: isActive ? 'var(--unfpa)' : 'transparent',
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  transitionProperty: 'background-color, color',
                  transitionDuration: '180ms',
                }}
              >
                {t.icon}
                <span>{t.label}</span>
                <small
                  className="bn"
                  style={{
                    fontSize: 10,
                    color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--muted)',
                  }}
                >
                  {t.labelBn}
                </small>
              </button>
            )
          })}
        </div>

        {/* ───────────── Tab body (placeholder) ───────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab.key}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -6 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <PlaceholderPanel tab={activeTab} />
          </motion.div>
        </AnimatePresence>
      </section>

      <div style={{ height: 80 }} />
    </>
  )
}

// ─── Placeholder panel ─────────────────────────────────────────────────────

function PlaceholderPanel({ tab }: { tab: TabDef }) {
  return (
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

      <div>
        <h2
          style={{
            fontSize: 'clamp(28px, 3vw, 38px)',
            fontWeight: 600,
            lineHeight: 1.15,
            color: 'var(--ink)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          {tab.label}
        </h2>
        <div
          className="bn"
          style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}
        >
          {tab.labelBn}
        </div>
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
        {tab.summary}
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
        no API calls. This tab will activate after the 3–4 June 2026
        validation workshop confirms the register variable list with
        the CIPRB Reproductive and Child Health team.
      </div>
    </div>
  )
}
