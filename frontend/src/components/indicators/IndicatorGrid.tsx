"use client"
import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { RefreshCw } from 'lucide-react'
import { api } from '@/api/client'
import { IndicatorCard } from './IndicatorCard'
import type { IndicatorProgress } from '@/types'

interface Props {
  org: 'PHD' | 'Bandhu' | 'CIPRB'
  periodStart?: string
  periodEnd?: string
}

const OBJECTIVE_LABELS: Record<number, string> = {
  0: 'Overall',
  1: 'Objective 1 — Service Delivery',
  2: 'Objective 2 — Capacity Building',
  3: 'Objective 3 — Community Awareness',
  4: 'Objective 4 — SBCC / IEC',
}

function groupByObjective(indicators: IndicatorProgress[]): Map<number, IndicatorProgress[]> {
  const groups = new Map<number, IndicatorProgress[]>()
  for (const ind of indicators) {
    const key = ind.objective_number
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(ind)
  }
  // Numeric sort that naturally renders PHD 0 → 1 → 2 and Bandhu 1 → 2 → 4
  // (no auto-renumbering of the missing Bandhu Obj 3).
  return new Map([...groups.entries()].sort((a, b) => a[0] - b[0]))
}

export function IndicatorGrid({ org, periodStart = '2026-05-21', periodEnd = '2026-11-20' }: Props) {
  const reduce = useReducedMotion()
  const [indicators, setIndicators] = useState<IndicatorProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  async function fetchIndicators() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<IndicatorProgress[]>(
        `/indicators/progress/?org=${org}&period_start=${periodStart}&period_end=${periodEnd}`
      )
      setIndicators(res.data)
      setLastRefresh(new Date())
    } catch {
      setError('Could not load indicator data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIndicators()
    // Refresh every 15 minutes
    const timer = setInterval(fetchIndicators, 15 * 60 * 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org, periodStart, periodEnd])

  const grouped = groupByObjective(indicators)

  // Aggregate stats — Step 3 colour bands.
  const withTargets = indicators.filter(i => i.target_value !== null)
  const onTrackCount = withTargets.filter(i => (i.percentage ?? 0) >= 75).length
  const behindCount = withTargets.filter(i => (i.percentage ?? 0) < 40).length
  const totalWithTargets = withTargets.length
  const avgPct =
    totalWithTargets > 0
      ? Math.round(
          withTargets.reduce((sum, i) => sum + (i.percentage ?? 0), 0) / totalWithTargets
        )
      : null

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            M&amp;E Indicator Progress
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Programme period: {periodStart} → {periodEnd}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Summary pills */}
          {!loading && totalWithTargets > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              {avgPct !== null && (
                <span className="rounded-full bg-unfpa-blue/10 px-3 py-1 text-xs font-semibold text-unfpa-blue dark:bg-unfpa-blue/20 dark:text-blue-300 tabular-nums">
                  Avg {avgPct}%
                </span>
              )}
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold tabular-nums"
                style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}
              >
                {onTrackCount} on track
              </span>
              {behindCount > 0 && (
                <span
                  className="rounded-full px-3 py-1 text-xs font-semibold tabular-nums"
                  style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
                >
                  {behindCount} behind
                </span>
              )}
            </div>
          )}
          <button
            onClick={fetchIndicators}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-unfpa-blue hover:border-unfpa-blue/50 transition-colors disabled:opacity-40"
            title="Refresh indicators"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-500 dark:text-red-400"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Skeleton */}
      {loading && indicators.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
            />
          ))}
        </div>
      )}

      {/* Grouped by objective_number — natural sort preserves Bandhu's
          1 → 2 → 4 ordering without auto-filling a placeholder Obj 3. */}
      {!loading && indicators.length > 0 && [...grouped.entries()].map(([objNum, rows]) => (
        <div key={objNum} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {OBJECTIVE_LABELS[objNum] ?? `Objective ${objNum}`}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((ind, idx) => (
              <IndicatorCard
                key={ind.activity_code}
                indicator={ind}
                delay={reduce ? 0 : idx * 0.05}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Last refresh */}
      {lastRefresh && (
        <p className="text-[10px] text-gray-400 dark:text-gray-600">
          Last refreshed {lastRefresh.toLocaleTimeString('en-GB')} · Cached 1h
        </p>
      )}
    </div>
  )
}
