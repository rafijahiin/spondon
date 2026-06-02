/**
 * MonthOfFive — programme pacing ring.
 *
 * Per Animesh's "Health Intelligence Command Center" deck slide 4
 * ("Executive At-A-Glance: Target Tracking"), the homepage carries a
 * visible pacing indicator showing where we are inside the 5-month
 * sprint (June → October).
 *
 * Layout:
 *   - 5-segment circular ring (one wedge per month)
 *   - Filled segments = months completed (UNFPA orange)
 *   - Current segment = accent (--status-on)
 *   - Future segments = faint (--hair)
 *   - Centre text: "Month N" big + "/ 5" small
 *   - Caption: "5-month sprint · June → October"
 *
 * The current month is derived from `new Date()` (client clock) against
 * the fixed programme window June 2026 → October 2026. Outside that
 * window we degrade gracefully ("Programme starts in N days" / "complete").
 */
import { useTranslation } from 'react-i18next'
import { Calendar } from 'lucide-react'

/** Programme window — June (0) through October (4). 5 months total. */
const PROGRAMME_MONTHS = 5
/** Calendar month index (0-based) of the first programme month — June. */
const PROGRAMME_START_MONTH = 5 // June
/** Year the programme runs in. */
const PROGRAMME_YEAR = 2026

interface RingState {
  /** 1-based current month index, or null if outside window. */
  monthIndex: number | null
  /** True if today is before the programme starts. */
  beforeStart: boolean
  /** Days until programme start (only meaningful when beforeStart). */
  daysUntilStart: number
  /** True if programme has fully completed. */
  completed: boolean
}

function computeRingState(now: Date): RingState {
  const startDate = new Date(PROGRAMME_YEAR, PROGRAMME_START_MONTH, 1)
  const endDate = new Date(
    PROGRAMME_YEAR,
    PROGRAMME_START_MONTH + PROGRAMME_MONTHS,
    1,
  ) // exclusive — first day of month AFTER October

  if (now < startDate) {
    const msPerDay = 1000 * 60 * 60 * 24
    const daysUntilStart = Math.ceil(
      (startDate.getTime() - now.getTime()) / msPerDay,
    )
    return {
      monthIndex: null,
      beforeStart: true,
      daysUntilStart,
      completed: false,
    }
  }

  if (now >= endDate) {
    return {
      monthIndex: PROGRAMME_MONTHS,
      beforeStart: false,
      daysUntilStart: 0,
      completed: true,
    }
  }

  // Within window. Compute month delta inclusive of current.
  const yearDelta = now.getFullYear() - PROGRAMME_YEAR
  const monthDelta = now.getMonth() - PROGRAMME_START_MONTH + yearDelta * 12
  const monthIndex = monthDelta + 1 // 1-based
  return {
    monthIndex,
    beforeStart: false,
    daysUntilStart: 0,
    completed: false,
  }
}

/** SVG ring geometry. */
const RING_SIZE = 110
const RING_STROKE = 11
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRC = 2 * Math.PI * RING_RADIUS
const SEG_GAP = 4 // px gap between wedges
const SEG_LEN = RING_CIRC / PROGRAMME_MONTHS - SEG_GAP

function segmentColor(
  idx: number,
  monthIndex: number | null,
  completed: boolean,
): string {
  if (completed) return 'var(--unfpa)'
  if (monthIndex == null) return 'var(--hair)' // pre-start: all faint
  if (idx < monthIndex - 1) return 'var(--unfpa)' // done
  if (idx === monthIndex - 1) return 'var(--status-on)' // current
  return 'var(--hair)' // future
}

export function MonthOfFive() {
  const { t } = useTranslation()
  const state = computeRingState(new Date())

  const centreBig = state.beforeStart
    ? t('home.monthRing.preStartBig', { defaultValue: 'Soon' })
    : state.completed
      ? t('home.monthRing.completeBig', { defaultValue: 'Done' })
      : t('home.monthRing.monthBig', {
          defaultValue: 'Month {{n}}',
          n: state.monthIndex,
        })

  const centreSmall = state.beforeStart
    ? t('home.monthRing.preStartSmall', {
        defaultValue: '{{n}} days to start',
        n: state.daysUntilStart,
      })
    : t('home.monthRing.ofFive', { defaultValue: '/ 5' })

  return (
    <div
      className="card"
      style={{
        width: 180,
        height: 160,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 4,
      }}
      role="group"
      aria-label={t('home.monthRing.aria', {
        defaultValue: 'Programme pacing — 5-month sprint',
      })}
    >
      <div
        className="kicker"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 14,
          alignSelf: 'flex-start',
        }}
      >
        <Calendar size={14} aria-hidden />
        {t('home.monthRing.kicker', { defaultValue: 'PACING' })}
      </div>

      <div style={{ position: 'relative', width: RING_SIZE, height: RING_SIZE }}>
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden
        >
          {Array.from({ length: PROGRAMME_MONTHS }).map((_, i) => {
            const offset = -i * (SEG_LEN + SEG_GAP)
            return (
              <circle
                key={i}
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                fill="none"
                stroke={segmentColor(i, state.monthIndex, state.completed)}
                strokeWidth={RING_STROKE}
                strokeDasharray={`${SEG_LEN} ${RING_CIRC - SEG_LEN}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            )
          })}
        </svg>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1.05,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ink-1)',
              letterSpacing: '-0.01em',
            }}
          >
            {centreBig}
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--ink-2)',
              marginTop: 2,
            }}
          >
            {centreSmall}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 14,
          color: 'var(--ink-2)',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {t('home.monthRing.caption', {
          defaultValue: '5-month sprint · June → October',
        })}
      </div>
    </div>
  )
}
