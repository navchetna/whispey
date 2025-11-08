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

    // Refresh the materialized view (if it exists)
    try {
      await query('REFRESH MATERIALIZED VIEW CONCURRENTLY call_summary_materialized')
    } catch (refreshError) {
      // View might not exist yet, continue without it
      console.log('Materialized view refresh skipped:', refreshError)
    }

    // Query the materialized view or fallback to direct query
    const result = await query(
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
