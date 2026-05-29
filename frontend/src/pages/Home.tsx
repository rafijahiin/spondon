/**
 * Programme Overview — homepage.
 *
 * Audience: UNFPA + CIPRB leadership. The page answers, top to bottom:
 *   1. What is Spondon (hero brief).
 *   2. How is each implementing partner progressing, and where do they work
 *      (PartnerProgress — the at-a-glance partner view UNFPA monitors).
 *   3. Programme-wide health at a glance (ExecutiveBento).
 *   4. Anything that needs attention (AnomalyCards).
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/api/client'
import { PageLoader } from '@/components/ui/LoadingSpinner'
import { ExecutiveBento } from '@/components/home/ExecutiveBento'
import { PartnerProgress } from '@/components/home/PartnerProgress'
import { ProgrammeBreakdown } from '@/components/home/ProgrammeBreakdown'
import { PartnerOverlapMap } from '@/components/maps/PartnerOverlapMap'
import { AnomalyCards } from '@/components/anomalies/AnomalyCards'
import type { IndicatorProgress } from '@/types'

export default function Home() {
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

  if (progress === null && !loadError) return <PageLoader />

  return (
    <>
      {/* ── HERO — project brief (left) + coverage map (right) ───────────── */}
      <section className="hero" style={{ paddingBottom: 28 }}>
        <div
          className="home-hero-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
            gap: 40,
            alignItems: 'center',
            marginTop: 6,
          }}
        >
          {/* Left: headline + brief */}
          <div>
            <h1
              className="hero-headline anim-rise d1"
              style={{
                marginBottom: 18,
                fontSize: 'clamp(40px, 6vw, 88px)',
                letterSpacing: '-0.035em',
              }}
            >
              <span className="figure">{t('home.headline')}</span>
            </h1>

            <div
              className="anim-rise d2"
              style={{
                fontSize: 'clamp(15px, 1.2vw, 17px)',
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

          {/* Right: where partners work — fills the space beside the headline */}
          <div className="anim-rise d3">
            <div className="kicker" style={{ marginBottom: 8 }}>
              <span className="dot" />{t('home.coverageKicker', { defaultValue: 'WHERE PARTNERS WORK' })}
            </div>
            <div className="card shimmer" style={{ padding: 10 }}>
              <PartnerOverlapMap height={340} />
            </div>
          </div>
        </div>
      </section>

      {/* Stack hero to one column on narrower viewports so the map sits below
          the brief instead of squeezing it. */}
      <style>{`
        @media (max-width: 980px) {
          .home-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── PARTNER PROGRESS — per-org progress vs target + geography.
           The at-a-glance view UNFPA opens the homepage to see. ─────────── */}
      <PartnerProgress progress={progress} />
      {loadError && (
        <p style={{ marginTop: 12, fontSize: 12.5, color: 'var(--coral)' }}>
          {t('home.rollupLoadError')}
        </p>
      )}

      {/* ── PROGRAMME BREAKDOWN — activity-by-category donut + partner
           attainment bars ────────────────────────────────────────────── */}
      <ProgrammeBreakdown progress={progress} />

      {/* ── PROGRAMME-WIDE HEALTH (bento) ────────────────────────────────── */}
      <ExecutiveBento progress={progress} />

      {/* ── ANOMALY DETECTION — silent unless something needs attention ──── */}
      <AnomalyCards />

      <div style={{ marginBottom: 96 }} />
    </>
  )
}
