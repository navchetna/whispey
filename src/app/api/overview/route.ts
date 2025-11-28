import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

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
    } catch (viewError) {
      // Fallback: Query directly from call_logs table
      console.log('Materialized view query failed, using direct query')
      result = await query(
        `SELECT 
          DATE(created_at) as call_date,
          COUNT(*) as calls,
          COALESCE(SUM(duration_seconds / 60.0), 0) as total_minutes,
          COALESCE(AVG(avg_latency), 0) as avg_latency,
          COUNT(DISTINCT customer_number) as unique_customers,
          COUNT(CASE WHEN call_ended_reason = 'completed' THEN 1 END) as successful_calls,
          CASE WHEN COUNT(*) > 0 
            THEN ROUND(COUNT(CASE WHEN call_ended_reason = 'completed' THEN 1 END)::NUMERIC / COUNT(*) * 100, 2) 
            ELSE 0 
          END as success_rate,
          COALESCE(SUM(total_llm_cost + total_tts_cost + total_stt_cost), 0) as total_cost
        FROM pype_voice_call_logs
        WHERE agent_id = $1
          AND DATE(created_at) >= $2
          AND DATE(created_at) <= $3
        GROUP BY DATE(created_at)
        ORDER BY call_date ASC`,
        [agentId, dateFrom, dateTo]
      )
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
