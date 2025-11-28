import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const agentId = searchParams.get('agentId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const source = searchParams.get('source') // 'table' | 'metadata' | 'transcription_metrics'
    const field = searchParams.get('field')
    const filterValue = searchParams.get('filterValue') // optional

    if (!agentId || !dateFrom || !dateTo || !source || !field) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    let sqlQuery: string
    const params: any[] = [agentId, `${dateFrom}T00:00:00`, `${dateTo}T23:59:59`]
    let paramIndex = 4

    if (filterValue) {
      // Single line query - filter for specific value
      if (source === 'table') {
        params.push(filterValue)
        sqlQuery = `
          SELECT created_at 
          FROM pype_voice_call_logs
          WHERE agent_id = $1
            AND created_at >= $2::timestamp
            AND created_at <= $3::timestamp
            AND ${field} = $${paramIndex}
          ORDER BY created_at
        `
      } else if (source === 'metadata') {
        params.push(filterValue)
        sqlQuery = `
          SELECT created_at 
          FROM pype_voice_call_logs
          WHERE agent_id = $1
            AND created_at >= $2::timestamp
            AND created_at <= $3::timestamp
            AND metadata->>'${field}' = $${paramIndex}
          ORDER BY created_at
        `
      } else if (source === 'transcription_metrics') {
        params.push(filterValue)
        sqlQuery = `
          SELECT created_at 
          FROM pype_voice_call_logs
          WHERE agent_id = $1
            AND created_at >= $2::timestamp
            AND created_at <= $3::timestamp
            AND transcription_metrics->>'${field}' = $${paramIndex}
          ORDER BY created_at
        `
      } else {
        return NextResponse.json(
          { error: 'Invalid source type' },
          { status: 400 }
        )
      }
    } else {
      // Multi-line query - get all values
      if (source === 'table') {
        sqlQuery = `
          SELECT created_at, ${field}
          FROM pype_voice_call_logs
          WHERE agent_id = $1
            AND created_at >= $2::timestamp
            AND created_at <= $3::timestamp
          ORDER BY created_at
        `
      } else if (source === 'metadata') {
        sqlQuery = `
          SELECT created_at, metadata
          FROM pype_voice_call_logs
          WHERE agent_id = $1
            AND created_at >= $2::timestamp
            AND created_at <= $3::timestamp
            AND metadata->'${field}' IS NOT NULL
          ORDER BY created_at
        `
      } else if (source === 'transcription_metrics') {
        sqlQuery = `
          SELECT created_at, transcription_metrics
          FROM pype_voice_call_logs
          WHERE agent_id = $1
            AND created_at >= $2::timestamp
            AND created_at <= $3::timestamp
            AND transcription_metrics->'${field}' IS NOT NULL
          ORDER BY created_at
        `
      } else {
        return NextResponse.json(
          { error: 'Invalid source type' },
          { status: 400 }
        )
      }
    }

    const result = await query(sqlQuery, params)

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error fetching chart data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chart data' },
      { status: 500 }
    )
  }
}
