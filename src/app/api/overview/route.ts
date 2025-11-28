import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

// Direct query function to get call stats from pype_voice_call_logs
async function getDirectCallStats(agentId: string, dateFrom: string, dateTo: string) {
  return await query(
    `SELECT 
      DATE(COALESCE(call_started_at, created_at)) as call_date,
      COUNT(*) as calls,
      COALESCE(SUM(duration_seconds / 60.0), 0) as total_minutes,
      COALESCE(AVG(avg_latency), 0) as avg_latency,
      COUNT(DISTINCT customer_number) as unique_customers,
      COUNT(CASE WHEN call_ended_reason = 'completed' THEN 1 END) as successful_calls,
      CASE WHEN COUNT(*) > 0 
        THEN ROUND(COUNT(CASE WHEN call_ended_reason = 'completed' THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) 
        ELSE 0 
      END as success_rate,
      COALESCE(SUM(COALESCE(total_llm_cost, 0) + COALESCE(total_tts_cost, 0) + COALESCE(total_stt_cost, 0)), 0) as total_cost
    FROM pype_voice_call_logs
    WHERE agent_id = $1
      AND DATE(COALESCE(call_started_at, created_at)) >= $2
      AND DATE(COALESCE(call_started_at, created_at)) <= $3
    GROUP BY DATE(COALESCE(call_started_at, created_at))
    ORDER BY call_date ASC`,
    [agentId, dateFrom, dateTo]
  )
}

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

    let result;
    let usedDirectQuery = false;
    
    // Try to use materialized view first
    try {
      // Refresh the materialized view (if it exists and we have permission)
      try {
        await query('REFRESH MATERIALIZED VIEW CONCURRENTLY call_summary_materialized')
      } catch (refreshError) {
        // View might not exist or we don't have permission, continue without refresh
        console.log('Materialized view refresh skipped (permission or view issue)')
      }

      // Query the materialized view
      result = await query(
        `SELECT 
          call_date,
          calls,
          total_minutes,
          avg_latency,
          unique_customers,
          successful_calls,
          success_rate,
          total_cost
        FROM call_summary_materialized
        WHERE agent_id = $1
          AND call_date >= $2
          AND call_date <= $3
        ORDER BY call_date ASC`,
        [agentId, dateFrom, dateTo]
      )
      
      // If materialized view returns empty results, verify against direct query
      // This handles cases where the view exists but is stale/empty
      if (result.rows.length === 0) {
        const directResult = await getDirectCallStats(agentId, dateFrom, dateTo)
        if (directResult.rows.length > 0) {
          console.log('Materialized view returned empty, using direct query which has data')
          result = directResult
          usedDirectQuery = true
        }
      }
    } catch (viewError) {
      // Fallback: Query directly from call_logs table
      // Successful calls = 'completed' status (transcription done successfully)
      // Failed/Pending = 'pending', 'failed', or any other status
      console.log('Materialized view query failed, using direct query')
      result = await getDirectCallStats(agentId, dateFrom, dateTo)
      usedDirectQuery = true
    }

    return NextResponse.json({
      data: result.rows
    })
  } catch (error) {
    console.error('Error fetching overview data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch overview data' },
      { status: 500 }
    )
  }
}
