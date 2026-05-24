"use client"
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/utils/cn'
import type { IndicatorProgress } from '@/types'

interface Props {
  indicator: IndicatorProgress
  delay?: number
}

function fmt(n: number, unit: string): string {
  if (unit === 'pieces' || unit === 'individuals') {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  }
  return String(n)
}

export function IndicatorCard({ indicator, delay = 0 }: Props) {
  const reduce = useReducedMotion()
  const pct = indicator.pct ?? 0
  const hasTarget = indicator.target !== null

  // Colour: green ≥ 75 · amber 40–75 · red < 40
  const ringColor =
    !hasTarget ? '#6b7280'
    : pct >= 75 ? '#16a34a'
    : pct >= 40 ? '#d97706'
    : '#dc2626'

  const size = 80
  const strokeWidth = 7
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(pct / 100, 1))

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
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-sm font-bold leading-none tabular-nums"
            style={{ color: ringColor }}
          >
            {hasTarget ? `${Math.round(pct)}%` : '–'}
          </span>
        </div>
      </div>

      {/* Label + numbers */}
      <div className="min-w-0 flex-1">
        <p
          className="text-xs font-medium text-gray-700 dark:text-gray-300 leading-snug"
          style={{ textWrap: 'pretty' } as React.CSSProperties}
        >
          {indicator.label}
        </p>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-white leading-none">
            {fmt(indicator.actual, indicator.unit)}
          </span>
          {hasTarget && (
            <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
              / {fmt(indicator.target!, indicator.unit)} {indicator.unit}
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
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 0.8, delay: reduce ? 0 : delay + 0.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}
        {indicator.activity_ref && (
          <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-600">
            {indicator.activity_ref}
          </p>
        )}
      </div>

      {/* On-track badge */}
      {indicator.on_track !== null && hasTarget && (
        <div className={cn(
          'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
          indicator.on_track
            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        )}>
          {indicator.on_track ? 'On track' : 'Behind'}
        </div>
      )}
    </motion.div>
  )
}
