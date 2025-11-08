import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { andFilters = [], orString = null, limit = 2000 } = body

    // Build the base query
    let sqlQuery = `
      SELECT 
        id, agent_id, customer_number, call_id, call_ended_reason, 
        call_started_at, call_ended_at, duration_seconds, metadata, 
        transcription_metrics, avg_latency, created_at
      FROM pype_voice_call_logs
      WHERE 1=1
    `
    
    const params: any[] = []
    let paramIndex = 1

    // Add AND filters
    for (const filter of andFilters) {
      const { column, operator, value } = filter
      
      switch (operator) {
        case 'eq':
          sqlQuery += ` AND ${column} = $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'ilike':
          sqlQuery += ` AND ${column} ILIKE $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'gte':
          sqlQuery += ` AND ${column} >= $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'lte':
          sqlQuery += ` AND ${column} <= $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'gt':
          sqlQuery += ` AND ${column} > $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'lt':
          sqlQuery += ` AND ${column} < $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'not.is':
          sqlQuery += ` AND ${column} IS NOT $${paramIndex}`
          params.push(value)
          paramIndex++
          break
        case 'neq':
          sqlQuery += ` AND ${column} != $${paramIndex}`
          params.push(value)
          paramIndex++
          break
      }
    }

    // Add OR filters if provided
    if (orString) {
      sqlQuery += ` AND (${orString})`
    }

    // Add ordering and limit
    sqlQuery += ` ORDER BY created_at DESC LIMIT $${paramIndex}`
    params.push(limit)

    const result = await query(sqlQuery, params)

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error downloading call logs:', error)
    return NextResponse.json(
      { error: 'Failed to download call logs' },
      { status: 500 }
    )
  }
}
