import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { auth } from '@/lib/auth-server'
import 'server-only'

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

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

    if (searchParams.get('job_id')) {
      conditions.push(`job_id = $${paramIndex}`)
      params.push(searchParams.get('job_id'))
      paramIndex++
    }

    if (searchParams.get('prompt_id')) {
      conditions.push(`prompt_id = $${paramIndex}`)
      params.push(searchParams.get('prompt_id'))
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
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''

    // Execute query
    const result = await query(
      `SELECT * FROM pype_voice_evaluation_summaries 
       ${whereClause} 
       ORDER BY ${orderBy} ${order} 
       ${limitClause} ${offsetClause}`,
      params
    )

    return NextResponse.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error fetching evaluation summaries:', error)
    return NextResponse.json(
      { error: 'Failed to fetch evaluation summaries' },
      { status: 500 }
    )
  }
}
