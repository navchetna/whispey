import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const columnName = searchParams.get('columnName')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!agentId || !columnName) {
      return NextResponse.json(
        { error: 'Missing required parameters: agentId, columnName' },
        { status: 400 }
      )
    }

    // Get available JSON fields from the context_data column
    const sqlQuery = `
      WITH json_keys AS (
        SELECT 
          jsonb_object_keys(context_data) as field_name,
          context_data->>jsonb_object_keys(context_data) as sample_value
        FROM agent_sessions 
        WHERE agent_id = $1 
          AND context_data IS NOT NULL
        LIMIT $2 * 10
      )
      SELECT 
        field_name,
        sample_value,
        COUNT(*) as occurrences
      FROM json_keys
      WHERE sample_value IS NOT NULL
        AND sample_value != ''
      GROUP BY field_name, sample_value
      ORDER BY occurrences DESC, field_name
      LIMIT $2
    `

    const result = await query(sqlQuery, [agentId, limit])

    const data = result.rows.map((row) => ({
      fieldName: row.field_name,
      sampleValue: row.sample_value,
      occurrences: parseInt(row.occurrences)
    }))

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error getting JSON fields:', error)
    return NextResponse.json(
      { error: 'Failed to get JSON fields' },
      { status: 500 }
    )
  }
}