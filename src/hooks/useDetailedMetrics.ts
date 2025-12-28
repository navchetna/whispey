import { useState, useEffect } from 'react'

interface LatencyHistogramBin {
  range: string
  count: number
  minVal: number
  maxVal: number
}

interface LatencyPercentiles {
  p50: number
  p90: number
  p99: number
  min: number
  max: number
  avg: number
}

interface DurationHistogramBin {
  range: string
  count: number
}

interface TurnHistogramBin {
  range: string
  count: number
}

interface TurnStats {
  min: number
  max: number
  avg: number
  total: number
}

export interface DetailedMetricsData {
  latencyMetrics: {
    histogram: LatencyHistogramBin[]
    percentiles: LatencyPercentiles
    totalSamples: number
  }
  durationMetrics: {
    histogram: DurationHistogramBin[]
    totalCalls: number
    avgDuration: number
  }
  turnMetrics: {
    histogram: TurnHistogramBin[]
    stats: TurnStats
    totalCalls: number
  }
}

interface UseDetailedMetricsProps {
  agentId: string
  dateFrom: string
  dateTo: string
}

export const useDetailedMetrics = ({ agentId, dateFrom, dateTo }: UseDetailedMetricsProps) => {
  const [data, setData] = useState<DetailedMetricsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDetailedMetrics = async () => {
      if (!agentId || !dateFrom || !dateTo) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/overview/detailed-metrics?agentId=${agentId}&dateFrom=${dateFrom}&dateTo=${dateTo}`
        )

        if (!response.ok) {
          throw new Error('Failed to fetch detailed metrics')
        }

        const result = await response.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchDetailedMetrics()
  }, [agentId, dateFrom, dateTo])

  return { data, loading, error }
}
