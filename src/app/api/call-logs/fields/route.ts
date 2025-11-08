import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    // Build query with date filters
    const conditions: string[] = ['agent_id = $1', 'metadata IS NOT NULL']
    const params: any[] = [agentId]
    let paramIndex = 2

    if (dateFrom) {
      conditions.push(`created_at >= $${paramIndex}::timestamp`)
      params.push(`${dateFrom}T00:00:00`)
      paramIndex++
    }

    if (dateTo) {
      conditions.push(`created_at <= $${paramIndex}::timestamp`)
      params.push(`${dateTo}T23:59:59`)
      paramIndex++
    }

    const whereClause = conditions.join(' AND ')

    // Get sample records to extract metadata field names
    const result = await query(
      `SELECT metadata FROM pype_voice_call_logs 
       WHERE ${whereClause} 
       LIMIT 20`,
      params
    )

    // Extract unique metadata field names
    const metadataKeys = new Set<string>()
    result.rows.forEach((record: any) => {
      if (record.metadata && typeof record.metadata === 'object') {
        Object.keys(record.metadata).forEach(key => {
          if (key && record.metadata[key] != null) {
            metadataKeys.add(key)
          }
        })
      }
    })

    return NextResponse.json({
      metadata_fields: Array.from(metadataKeys)
    })
  } catch (error) {
    console.error('Error fetching metadata fields:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metadata fields' },
      { status: 500 }
    )
  }
}
