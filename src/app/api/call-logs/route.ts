import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Build dynamic WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Support common filters
    if (searchParams.get('id')) {
      conditions.push(`id = $${paramIndex}`)
      params.push(searchParams.get('id'))
      paramIndex++
    }

    if (searchParams.get('call_id')) {
      conditions.push(`call_id = $${paramIndex}`)
      params.push(searchParams.get('call_id'))
      paramIndex++
    }

    if (searchParams.get('agent_id') || searchParams.get('agentId')) {
      conditions.push(`agent_id = $${paramIndex}`)
      params.push(searchParams.get('agent_id') || searchParams.get('agentId'))
      paramIndex++
    }

    if (searchParams.get('project_id')) {
      conditions.push(`project_id = $${paramIndex}`)
      params.push(searchParams.get('project_id'))
      paramIndex++
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Handle ordering
    const orderBy = searchParams.get('orderBy') || 'created_at'
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'

    // Handle pagination
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''

    // Execute query with all fields
    const result = await query(
      `SELECT * FROM pype_voice_call_logs 
       ${whereClause} 
       ORDER BY ${orderBy} ${order} 
       ${limitClause} ${offsetClause}`,
      params
    )

    return NextResponse.json({ 
      data: result.rows,
      count: result.rows.length 
    })
  } catch (error) {
    console.error('Error fetching call logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch call logs' },
      { status: 500 }
    )
  }
}