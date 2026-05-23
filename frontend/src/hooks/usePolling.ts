import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>
  interval?: number
  enabled?: boolean
}

interface UsePollingResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function usePolling<T>({
  fetcher,
  interval = 30_000,
  enabled = true,
}: UsePollingOptions<T>): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const fetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    fetch()
    timerRef.current = setInterval(fetch, interval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [enabled, fetch, interval])

  return { data, loading, error, refetch: fetch }
}
