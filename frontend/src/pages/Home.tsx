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
import { ProgrammeHealthFlags } from '@/components/home/ProgrammeHealthFlags'
import { ActivityFeed } from '@/components/home/ActivityFeed'
import { SpecificProgrammes } from '@/components/home/SpecificProgrammes'
import { PartnerOverlapMap } from '@/components/maps/PartnerOverlapMap'
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
                marginBottom: 10,
                fontSize: 'clamp(56px, 8vw, 120px)',
                letterSpacing: '-0.04em',
                fontWeight: 800,
                fontStyle: 'normal',
                lineHeight: 1,
                color: 'var(--unfpa)',
              }}
            >
              SIMPLE
            </h1>
            <p
              className="anim-rise d1"
              style={{
                marginBottom: 20,
                fontSize: 'clamp(13px, 1.1vw, 15px)',
                letterSpacing: '0.01em',
                lineHeight: 1.5,
                color: 'var(--ink-2)',
                fontWeight: 400,
              }}
            >
              <b style={{ color: 'var(--unfpa)', fontWeight: 700 }}>S</b>trengthening{' '}
              <b style={{ color: 'var(--unfpa)', fontWeight: 700 }}>I</b>ntegrated{' '}
              <b style={{ color: 'var(--unfpa)', fontWeight: 700 }}>M</b>onitoring,{' '}
              <b style={{ color: 'var(--unfpa)', fontWeight: 700 }}>P</b>rogramme{' '}
              <b style={{ color: 'var(--unfpa)', fontWeight: 700 }}>L</b>earning and{' '}
              <b style={{ color: 'var(--unfpa)', fontWeight: 700 }}>E</b>vidence for SRHR
            </p>

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

      {/* ── PROGRAMME HEALTH FLAGS — per-partner daily compliance.
           Replaces the deleted Activity Feed per Animesh: silence is the
           signal. Each tile shows submitted/total centres today + the
           silent ones with hours-since-touch. ─────────────────────────── */}
      <ProgrammeHealthFlags />

      {/* ── LIVE ACTIVITY FEED — Animesh's "system heartbeat" ask is back.
           Sits between the silence-flag picture and the executive bento so
           managers can see both who's silent AND who's actively submitting
           right now. UNFPA-only (hidden from focal/manager). ─────────────── */}
      <ActivityFeed />

      {/* ── PROGRAMME-WIDE HEALTH (bento) ────────────────────────────────── */}
      <ExecutiveBento progress={progress} />

      {/* ── SPECIFIC PROGRAMMES — Fistula · MPDSR · Baseline Assessment
           tiles (per Animesh: explicit named programmes, not the abstract
           Clinical/Community/Operations donut). Each tile jumps into its
           dedicated page. ──────────────────────────────────────────────── */}
      <SpecificProgrammes />

      {/* AnomalyCards removed per Animesh: the Programme Health Flags block
          above is the single source of programmatic alerts. Anomaly
          detection (submission drops, indicators behind pace, review
          backlogs) folds into that surface. */}

      <div style={{ marginBottom: 96 }} />
    </>
  )
}
