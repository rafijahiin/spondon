"use client"
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/utils/cn'
import type { IndicatorProgress } from '@/types'

interface Props {
  indicator: IndicatorProgress
  delay?: number
}

// Step 3 spec colour bands.
//   ≥ 75       → green  #00B050
//   40 .. 74.9 → yellow #FFC000
//   <  40      → red    #FF0000
//   null target → grey "Not Set"
const COLOUR_GREEN = '#00B050'
const COLOUR_YELLOW = '#FFC000'
const COLOUR_RED = '#FF0000'
const COLOUR_GREY = '#9CA3AF'

function bandColour(percentage: number | null): string {
  if (percentage === null) return COLOUR_GREY
  if (percentage >= 75) return COLOUR_GREEN
  if (percentage >= 40) return COLOUR_YELLOW
  return COLOUR_RED
}

function fmt(n: number, unit: string): string {
  if (unit === 'pcs' || unit === 'individuals' || unit === 'materials') {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  }
  return String(n)
}

export function IndicatorCard({ indicator, delay = 0 }: Props) {
  const reduce = useReducedMotion()
  const { target_value, achievement, percentage, unlinked } = indicator
  const hasTarget = target_value !== null
  const ringColor = bandColour(percentage)
  const displayPct = percentage ?? 0

  const size = 80
  const strokeWidth = 7
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(displayPct / 100, 1))

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex items-center gap-4 rounded-xl border p-4 shadow-sm transition-colors',
        'bg-white dark:bg-gray-800',
        'border-gray-100 dark:border-gray-700',
        'hover:border-unfpa-blue/30 dark:hover:border-unfpa-blue/40',
      )}
    >
      {/* Mini progress ring */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-100 dark:text-gray-700"
          />
          {hasTarget && (
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={ringColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-sm font-bold leading-none tabular-nums"
            style={{ color: ringColor }}
          >
            {hasTarget ? `${Math.round(displayPct)}%` : '–'}
          </span>
        </div>
      </div>

      {/* Label + numbers */}
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-snug"
          style={{ textWrap: 'pretty' } as React.CSSProperties}
        >
          {indicator.indicator_label}
        </p>
        <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white leading-none">
            {fmt(achievement, indicator.unit)}
          </span>
          {hasTarget ? (
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              / {fmt(target_value!, indicator.unit)} {indicator.unit}
            </span>
          ) : (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
              style={{ backgroundColor: '#FED7AA', color: '#9A3412' }}
            >
              Not Set
            </span>
          )}
        </div>
        {/* Progress bar */}
        {hasTarget && (
          <div className="mt-2 h-1 w-full rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <motion.div
              className="h-1 rounded-full"
              style={{ backgroundColor: ringColor }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(displayPct, 100)}%` }}
              transition={{ duration: 0.8, delay: reduce ? 0 : delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
            {indicator.activity_code}
          </span>
          {unlinked && (
            <span
              className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5"
              style={{ backgroundColor: '#E5E7EB', color: '#6B7280' }}
              title="Compute function not yet wired for this activity code — module pending."
            >
              Module pending
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
