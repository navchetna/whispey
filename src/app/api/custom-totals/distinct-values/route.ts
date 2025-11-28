import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const columnName = searchParams.get('columnName')
    const jsonField = searchParams.get('jsonField')
    const limit = parseInt(searchParams.get('limit') || '100')

    if (!agentId || !columnName) {
      return NextResponse.json(
        { error: 'Missing required parameters: agentId, columnName' },
        { status: 400 }
      )
    }

    // Build query based on whether we're looking at a JSON field or regular column
    let sqlQuery: string
    let params: any[]

    if (jsonField) {
      // Query for JSON field values
      sqlQuery = `
        SELECT 
          CASE 
            WHEN (context_data->>$3) IS NULL THEN ''
            ELSE context_data->>$3
          END as distinct_value,
          COUNT(*) as count_occurrences
        FROM agent_sessions 
        WHERE agent_id = $1 
          AND context_data IS NOT NULL
          AND context_data ? $3
        GROUP BY context_data->>$3
        ORDER BY count_occurrences DESC, distinct_value
        LIMIT $4
      `
      params = [agentId, columnName, jsonField, limit]
    } else {
      // Query for regular column values
      sqlQuery = `
        SELECT 
          COALESCE(${columnName}::text, '') as distinct_value,
          COUNT(*) as count_occurrences
        FROM agent_sessions 
        WHERE agent_id = $1 
          AND ${columnName} IS NOT NULL
        GROUP BY ${columnName}
        ORDER BY count_occurrences DESC, distinct_value
        LIMIT $2
      `
      params = [agentId, limit]
    }

    const result = await query(sqlQuery, params)

    const data = result.rows.map((row) => ({
      value: row.distinct_value,
      count: parseInt(row.count_occurrences)
    }))

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error getting distinct values:', error)
    return NextResponse.json(
      { error: 'Failed to get distinct values' },
      { status: 500 }
    )
  }
}