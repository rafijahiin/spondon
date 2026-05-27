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
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ClipboardList, Megaphone, BookOpen, Lock } from 'lucide-react'

type TabKey = 'corner' | 'campaign' | 'baseline'

interface TabDef {
  key: TabKey
  /** Tab label key under `ciprb.*` for the English title. */
  labelKey: string
  /** Tab label key under `ciprb.*` for the Bengali sub-label rendered as <small>. */
  labelBnKey: string
  icon: React.ReactNode
  /** Translation key under `ciprb.*` for the body summary. */
  summaryKey: string
}

const TABS: TabDef[] = [
  {
    key: 'corner',
    labelKey: 'ciprb.tabCorner',
    labelBnKey: 'ciprb.tabCornerBn',
    icon: <ClipboardList size={16} />,
    summaryKey: 'ciprb.summaryCorner',
  },
  {
    key: 'campaign',
    labelKey: 'ciprb.tabCampaign',
    labelBnKey: 'ciprb.tabCampaignBn',
    icon: <Megaphone size={16} />,
    summaryKey: 'ciprb.summaryCampaign',
  },
  {
    key: 'baseline',
    labelKey: 'ciprb.tabBaseline',
    labelBnKey: 'ciprb.tabBaselineBn',
    icon: <BookOpen size={16} />,
    summaryKey: 'ciprb.summaryBaseline',
  },
]

export default function FistulaTracker() {
  const { t } = useTranslation()
  const [active, setActive] = useState<TabKey>('corner')
  const reduce = useReducedMotion()
  const activeTab = TABS.find((tab) => tab.key === active)!

  return (
    <>
      {/* ───────────────── Hero ───────────────── */}
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-eyebrow anim-rise">
          <span className="live-dot" />
          <span>{t('ciprb.heroEyebrow')}</span>
          <span className="sep">/</span>
          <span>{t('ciprb.heroEyebrowSub')}</span>
        </div>
        <h1
          className="hero-headline anim-rise d1"
          style={{
            marginBottom: 14,
            fontSize: 'clamp(48px, 7vw, 96px)',
            letterSpacing: '-0.035em',
          }}
        >
          <span className="figure" style={{ color: 'var(--unfpa)' }}>{t('ciprb.heroHeadline')}</span>
        </h1>
        <p className="hero-lede anim-rise d2" style={{ maxWidth: 720 }}>
          {t('ciprb.heroLede')}
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
          {TABS.map((tab) => {
            const isActive = active === tab.key
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(tab.key)}
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
                {tab.icon}
                <span>{t(tab.labelKey)}</span>
                <small
                  className="bn"
                  style={{
                    fontSize: 10,
                    color: isActive ? 'rgba(255,255,255,0.7)' : 'var(--muted)',
                  }}
                >
                  {t(tab.labelBnKey)}
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
            animate={{
              opacity: 1, y: 0,
              transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
            }}
            // Exit ~65% of enter — feels responsive when user tab-swaps
            // rapidly (§7 exit-faster-than-enter).
            exit={{
              opacity: 0, y: reduce ? 0 : -6,
              transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
            }}
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
  const { t } = useTranslation()
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
        {t('ciprb.awaitingVariables')}
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
          {t(tab.labelKey)}
        </h2>
        <div
          className="bn"
          style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}
        >
          {t(tab.labelBnKey)}
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
        {t(tab.summaryKey)}
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
        {t('ciprb.statusPlaceholder')}
      </div>
    </div>
  )
}
