/**
 * Programme Overview — homepage (Step 3 Part B redesign).
 *
 * Spec changes from the previous editorial homepage:
 *  - Removed the live activity feed entirely (individual records must not
 *    surface here per the validation spec — only aggregated views).
 *  - Replaced the data-density hero with a project brief (placeholder
 *    until the supervisor confirms wording post-workshop).
 *  - Map switched to PartnerOverlapMap — partner-coverage view with a
 *    legend and click-through to org pages.
 *  - One aggregated stat card per partner sourced from
 *    /api/indicators/progress/, showing total achievement vs total
 *    target as a single summary number. "Not Set" if all targets are null.
 *  - Three large nav tiles: CIPRB | Bandhu | PHD, colour-matched to the
 *    partner palette.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, useReducedMotion } from 'motion/react'

import { api } from '@/api/client'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { ExecutiveBento } from '@/components/home/ExecutiveBento'
import { FundedPartners } from '@/components/home/FundedPartners'
import { AnomalyCards } from '@/components/anomalies/AnomalyCards'
import {
  PARTNER_NAMES,
  type PartnerCode,
} from '@/data/partnerDistricts'
import type { IndicatorProgress } from '@/types'

const PARTNERS: PartnerCode[] = ['CIPRB', 'Bandhu', 'PHD']

interface PartnerRollup {
  partner: PartnerCode
  totalAchievement: number
  totalTarget: number | null    // null = every row's target is null
  percentage: number | null
  totalRows: number
  unlinkedRows: number
}

function rollupPartner(partner: PartnerCode, rows: IndicatorProgress[]): PartnerRollup {
  const partnerRows = rows.filter((r) => r.organisation === partner)
  const withTarget = partnerRows.filter((r) => r.target_value !== null)

  if (withTarget.length === 0) {
    return {
      partner,
      totalAchievement: 0,
      totalTarget: null,
      percentage: null,
      totalRows: partnerRows.length,
      unlinkedRows: partnerRows.filter((r) => r.unlinked).length,
    }
  }

  const totalAchievement = withTarget.reduce((s, r) => s + (r.achievement || 0), 0)
  const totalTarget = withTarget.reduce((s, r) => s + (r.target_value || 0), 0)
  const percentage = totalTarget > 0
    ? Math.round((totalAchievement / totalTarget) * 1000) / 10
    : 0

  return {
    partner,
    totalAchievement,
    totalTarget,
    percentage,
    totalRows: partnerRows.length,
    unlinkedRows: partnerRows.filter((r) => r.unlinked).length,
  }
}

export default function Home() {
  const reduce = useReducedMotion()
  const { t } = useTranslation()
  const [progress, setProgress] = useState<IndicatorProgress[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    api
      .get<IndicatorProgress[]>(
        '/indicators/progress/?period_start=2026-05-21&period_end=2026-11-20',
      )
      .then((r) => setProgress(r.data))
      .catch(() => setLoadError(true))
  }, [])

  const rollups = useMemo(() => {
    if (!progress) return null
    return PARTNERS.map((p) => rollupPartner(p, progress))
  }, [progress])

  if (progress === null && !loadError) return <PageLoader />

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════
           HERO — project brief + coverage map side-by-side.
           Previous layout left a large blank column to the right of the
           project brief; the coverage map (formerly a separate section)
           now fills it on >1100px viewports and stacks beneath the text
           below that.
           ═══════════════════════════════════════════════════════════════ */}
      <section className="hero" style={{ paddingBottom: 28 }}>
        {/* Hero eyebrow removed — the three-segment line (CIPRB · UNFPA
            BANGLADESH / INTEGRATED DIGITAL M&E SYSTEM / 2026–2027) read
            as redundant chrome. The SPONDON headline now leads cleanly,
            and the breadcrumb in the Topbar (SPONDON / Programme
            Overview) already provides the same orientation. */}

        <div style={{ marginTop: 6, maxWidth: 820 }}>
          <h1
            className="hero-headline anim-rise d1"
            style={{
              marginBottom: 18,
              fontSize: 'clamp(40px, 7vw, 96px)',
              letterSpacing: '-0.035em',
            }}
          >
            <span className="figure">{t('home.headline')}</span>
          </h1>

          <div
            className="anim-rise d2"
            style={{
              fontSize: 'clamp(15px, 1.3vw, 18px)',
              lineHeight: 1.6,
              color: 'var(--ink-2)',
              textWrap: 'pretty',
            } as React.CSSProperties}
          >
            <p style={{ margin: 0 }}>{t('home.briefP1')}</p>
            <p style={{ marginTop: 14 }}>
              <span
                className="tag amber"
                style={{ fontSize: 10, marginRight: 8, verticalAlign: 'middle' }}
              >
                {t('home.briefPlaceholderBadge')}
              </span>
              {t('home.briefP2')}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           WHO UNFPA FUNDS — three implementing partners + coverage map.
           The funder's-eye view: who is funded, what they do, where they
           work. Replaces the cramped hero-corner map and the redundant
           partner nav tiles (each partner card here links to its dashboard).
           ═══════════════════════════════════════════════════════════════ */}
      <FundedPartners />

      {/* ═══════════════════════════════════════════════════════════════
           EXECUTIVE SUMMARY (BENTO GRID)
           — sits between hero and partner rollup
           — answers "what's happening across the whole programme right now"
           ═══════════════════════════════════════════════════════════════ */}
      <ExecutiveBento progress={progress} />

      {/* ═══════════════════════════════════════════════════════════════
           ANOMALY DETECTION
           — programme-wide; backend filters by user permission.
           — silent unless something genuinely needs attention.
           ═══════════════════════════════════════════════════════════════ */}
      <AnomalyCards />

      {/* ═══════════════════════════════════════════════════════════════
           PARTNER ROLL-UP CARDS
           ═══════════════════════════════════════════════════════════════ */}
      <section className="section" style={{ marginTop: 56 }}>
        <div className="section-head">
          <div>
            <div className="kicker" style={{ marginBottom: 8 }}>
              <span className="dot" />{t('home.rollupKicker')}
            </div>
            <h2 className="section-title">{t('home.rollupTitle')}</h2>
            <p className="section-sub">{t('home.rollupSubtitle')}</p>
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 18,
          }}
        >
          {(rollups ?? PARTNERS.map((p) => ({
            partner: p, totalAchievement: 0, totalTarget: null,
            percentage: null, totalRows: 0, unlinkedRows: 0,
          } as PartnerRollup))).map((r, i) => (
            <RollupCard key={r.partner} rollup={r} reduce={reduce} delay={i * 0.08} />
          ))}
        </div>
        {loadError && (
          <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--coral)' }}>
            {t('home.rollupLoadError')}
          </p>
        )}
      </section>

      <div style={{ marginBottom: 96 }} />
    </>
  )
}

// ─── RollupCard ───────────────────────────────────────────────────────────────

function RollupCard({
  rollup, reduce, delay,
}: { rollup: PartnerRollup; reduce: boolean | null; delay: number }) {
  const { t } = useTranslation()
  const { partner, totalAchievement, totalTarget, percentage,
    totalRows, unlinkedRows } = rollup
  const nameEn = PARTNER_NAMES[partner].en
  const isNotSet = totalTarget === null

  // Band colour per Step 3 spec — kept on the progress bar + percentage
  // number because that IS data viz (status semantics), per the UNFPA
  // kit's data-viz palette. The CARD chrome is now monochrome.
  const bandColor =
    isNotSet ? 'var(--muted)'
    : (percentage ?? 0) >= 75 ? '#58968A'   // UNFPA pastel green (data-viz)
    : (percentage ?? 0) >= 40 ? '#FB904D'   // UNFPA pastel orange
    : '#F10F45'                              // UNFPA red

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4, delay: reduce ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="card"
      style={{
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div
            className="kicker"
            style={{ marginBottom: 4, color: 'var(--ink-3)', fontWeight: 600 }}
          >
            <span className="dot" style={{ background: 'var(--unfpa)' }} />
            {partner.toUpperCase()}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{nameEn}</div>
        </div>
        {!isNotSet && (
          <div
            style={{
              fontSize: 22, fontWeight: 700, color: bandColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {percentage?.toFixed(1)}%
          </div>
        )}
        {isNotSet && (
          <span
            className="tag amber"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {t('targetConfig.notSetPill')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span
          style={{
            fontSize: 32, fontWeight: 700, color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
          }}
        >
          {isNotSet ? '—' : totalAchievement.toLocaleString()}
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {isNotSet
            ? t('home.rollupCardNoTargets')
            : t('home.rollupCardCumulative', { target: totalTarget!.toLocaleString() })}
        </span>
      </div>

      {!isNotSet && (
        <div
          style={{
            height: 6, background: 'var(--surface-3)',
            borderRadius: 999, overflow: 'hidden',
          }}
        >
          <motion.div
            style={{ height: '100%', background: bandColor, borderRadius: 999 }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percentage ?? 0, 100)}%` }}
            transition={{ duration: 0.9, delay: reduce ? 0 : delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}

      <div
        style={{
          display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)',
          paddingTop: 6, borderTop: '1px solid var(--hair)',
        }}
      >
        <span>{t('home.rollupCardIndicators', { count: totalRows })}</span>
        {unlinkedRows > 0 && (
          <span title={t('indicator.modulePendingTooltip')}>
            {t('home.rollupCardModulePending', { count: unlinkedRows })}
          </span>
        )}
      </div>
    </motion.div>
  )
}

