import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

/**
 * API endpoint to fetch detailed metrics for the Overview dashboard:
 * - Turn latency distribution (for histogram and percentiles) - from pype_voice_metrics_logs
 * - Call duration distribution
 * - Turns per call distribution (from transcript_json)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!agentId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Missing required parameters: agentId, dateFrom, dateTo' },
        { status: 400 }
      )
    }

    // Query 1: Get turn-level latencies from pype_voice_metrics_logs
    // This joins with call_logs to filter by agent and date
    const turnLatenciesResult = await query(
      `SELECT 
        COALESCE((m.llm_metrics->>'latency')::float, 0) as turn_latency
      FROM pype_voice_metrics_logs m
      JOIN pype_voice_call_logs c ON m.session_id = c.id
      WHERE c.agent_id = $1
        AND DATE(COALESCE(c.call_started_at, c.created_at)) >= $2
        AND DATE(COALESCE(c.call_started_at, c.created_at)) <= $3
        AND m.llm_metrics->>'latency' IS NOT NULL
      ORDER BY turn_latency ASC`,
      [agentId, dateFrom, dateTo]
    )

    // Query 2: Get call-level data for duration and turn counts
    // transcript_json can be: array directly OR object with 'turns' array
    const callDataResult = await query(
      `SELECT 
        call_id,
        avg_latency,
        duration_seconds,
        transcript_json,
        CASE 
          WHEN jsonb_typeof(transcript_json) = 'array' THEN jsonb_array_length(transcript_json)
          WHEN jsonb_typeof(transcript_json) = 'object' AND transcript_json ? 'turns' AND jsonb_typeof(transcript_json->'turns') = 'array' 
            THEN jsonb_array_length(transcript_json->'turns')
          ELSE 0
        END as turn_count
      FROM pype_voice_call_logs
      WHERE agent_id = $1
        AND DATE(COALESCE(call_started_at, created_at)) >= $2
        AND DATE(COALESCE(call_started_at, created_at)) <= $3`,
      [agentId, dateFrom, dateTo]
    )

    // Process latency data from metrics logs (turn-level)
    let latencyData = turnLatenciesResult.rows
      .map(r => parseFloat(r.turn_latency))
      .filter(v => v > 0)
      .sort((a, b) => a - b)
    
    // Fallback: if no turn-level data, use call-level avg_latency
    if (latencyData.length === 0) {
      latencyData = callDataResult.rows
        .filter(r => r.avg_latency !== null && r.avg_latency > 0)
        .map(r => parseFloat(r.avg_latency))
        .sort((a, b) => a - b)
    }

    // Calculate latency percentiles
    const calculatePercentile = (arr: number[], percentile: number) => {
      if (arr.length === 0) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      const index = Math.ceil((percentile / 100) * sorted.length) - 1
      return sorted[Math.max(0, index)]
    }

    const latencyPercentiles = {
      p50: calculatePercentile(latencyData, 50),
      p90: calculatePercentile(latencyData, 90),
      p99: calculatePercentile(latencyData, 99),
      min: latencyData.length > 0 ? Math.min(...latencyData) : 0,
      max: latencyData.length > 0 ? Math.max(...latencyData) : 0,
      avg: latencyData.length > 0 ? latencyData.reduce((a, b) => a + b, 0) / latencyData.length : 0
    }

    // Create histogram bins for latency
    const createLatencyHistogramBins = (data: number[], binCount: number = 10) => {
      if (data.length === 0) return []
      
      const min = Math.min(...data)
      const max = Math.max(...data)
      
      // Handle edge case where all values are the same
      if (min === max) {
        return [{
          range: `${min.toFixed(2)}s`,
          count: data.length,
          minVal: min,
          maxVal: max
        }]
      }
      
      const binSize = (max - min) / binCount
      const bins: { range: string; count: number; minVal: number; maxVal: number }[] = []
      
      for (let i = 0; i < binCount; i++) {
        const binMin = min + i * binSize
        const binMax = min + (i + 1) * binSize
        const count = data.filter(v => v >= binMin && (i === binCount - 1 ? v <= binMax : v < binMax)).length
        
        // Only include bins with data or if it's important for context
        if (count > 0 || i === 0 || i === binCount - 1) {
          bins.push({
            range: `${binMin.toFixed(2)}-${binMax.toFixed(2)}s`,
            count,
            minVal: binMin,
            maxVal: binMax
          })
        }
      }
      
      return bins.filter(b => b.count > 0) // Only return non-empty bins for cleaner display
    }

    const latencyHistogram = createLatencyHistogramBins(latencyData, 8)

    // Process duration data
    const durationData = callDataResult.rows
      .filter(r => r.duration_seconds !== null && r.duration_seconds > 0)
      .map(r => parseInt(r.duration_seconds))
      .sort((a, b) => a - b)
    
    // Create duration bins (in seconds, displayed in minutes)
    const createDurationBins = (data: number[]) => {
      if (data.length === 0) return []
      
      // Fixed duration ranges in seconds
      const ranges = [
        { label: '0-30s', min: 0, max: 30 },
        { label: '30s-1m', min: 30, max: 60 },
        { label: '1-2m', min: 60, max: 120 },
        { label: '2-5m', min: 120, max: 300 },
        { label: '5-10m', min: 300, max: 600 },
        { label: '10m+', min: 600, max: Infinity }
      ]
      
      return ranges.map(range => ({
        range: range.label,
        count: data.filter(v => v >= range.min && v < range.max).length
      })).filter(b => b.count > 0) // Only show ranges with data
    }

    const durationHistogram = createDurationBins(durationData)

    // Process turn counts from transcript_json array length
    const turnsData = callDataResult.rows
      .map(r => parseInt(r.turn_count) || 0)
      .filter(t => t > 0) // Only include calls with turns
      .sort((a, b) => a - b)
    
    // Create turn count bins
    const createTurnBins = (data: number[]) => {
      if (data.length === 0) return []
      
      const ranges = [
        { label: '1-5', min: 1, max: 6 },
        { label: '6-10', min: 6, max: 11 },
        { label: '11-20', min: 11, max: 21 },
        { label: '21-30', min: 21, max: 31 },
        { label: '31-50', min: 31, max: 51 },
        { label: '50+', min: 51, max: Infinity }
      ]
      
      return ranges.map(range => ({
        range: range.label,
        count: data.filter(v => v >= range.min && v < range.max).length
      })).filter(b => b.count > 0) // Only show ranges with data
    }

    const turnsHistogram = createTurnBins(turnsData)
    
    // Calculate turn statistics
    const turnStats = {
      min: turnsData.length > 0 ? Math.min(...turnsData) : 0,
      max: turnsData.length > 0 ? Math.max(...turnsData) : 0,
      avg: turnsData.length > 0 ? turnsData.reduce((a, b) => a + b, 0) / turnsData.length : 0,
      total: turnsData.reduce((a, b) => a + b, 0)
    }

    return NextResponse.json({
      latencyMetrics: {
        histogram: latencyHistogram,
        percentiles: latencyPercentiles,
        totalSamples: latencyData.length
      },
      durationMetrics: {
        histogram: durationHistogram,
        totalCalls: durationData.length,
        avgDuration: durationData.length > 0 ? durationData.reduce((a, b) => a + b, 0) / durationData.length : 0
      },
      turnMetrics: {
        histogram: turnsHistogram,
        stats: turnStats,
        totalCalls: turnsData.length
      }
    })
  } catch (error) {
    console.error('Error fetching detailed metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch detailed metrics' },
      { status: 500 }
    )
  }
}
