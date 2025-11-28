// app/api/evaluations/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { 
      project_id,
      agent_id,
      name, 
      description,
      prompt_ids,
      selected_traces,
      filter_criteria
    } = body

    // Validate required fields
    if (!project_id || !agent_id || !name || !prompt_ids || prompt_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, agent_id, name, prompt_ids' },
        { status: 400 }
      )
    }

    // If no specific traces selected, we'll process based on filter criteria
    let total_traces = 0
    
    if (selected_traces && selected_traces.length > 0) {
      total_traces = selected_traces.length
    } else {
      // Count traces based on filter criteria
      let countQueryText = `
        SELECT COUNT(*) as count
        FROM pype_voice_call_logs cl
        INNER JOIN pype_voice_agents a ON cl.agent_id = a.id
        WHERE a.project_id = $1 AND cl.agent_id = $2
      `
      const queryParams: any[] = [project_id, agent_id]
      let paramIndex = 3

      // Apply date filtering if provided
      if (filter_criteria?.date_range && filter_criteria.date_range !== 'all') {
        const now = new Date()
        let filterDate: Date

        switch (filter_criteria.date_range) {
          case 'last_7_days':
            filterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            countQueryText += ` AND cl.created_at >= $${paramIndex}`
            queryParams.push(filterDate.toISOString())
            paramIndex++
            break
          case 'last_30_days':
            filterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            countQueryText += ` AND cl.created_at >= $${paramIndex}`
            queryParams.push(filterDate.toISOString())
            paramIndex++
            break
          case 'last_90_days':
            filterDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            countQueryText += ` AND cl.created_at >= $${paramIndex}`
            queryParams.push(filterDate.toISOString())
            paramIndex++
            break
          case 'custom':
            if (filter_criteria.start_date) {
              countQueryText += ` AND cl.created_at >= $${paramIndex}`
              queryParams.push(new Date(filter_criteria.start_date).toISOString())
              paramIndex++
            }
            if (filter_criteria.end_date) {
              const endDateTime = new Date(filter_criteria.end_date)
              endDateTime.setDate(endDateTime.getDate() + 1)
              countQueryText += ` AND cl.created_at < $${paramIndex}`
              queryParams.push(endDateTime.toISOString())
              paramIndex++
            }
            break
        }
      }

      // Apply minimum duration filter
      if (filter_criteria?.min_duration && !isNaN(parseInt(filter_criteria.min_duration))) {
        countQueryText += ` AND cl.duration_seconds >= $${paramIndex}`
        queryParams.push(parseInt(filter_criteria.min_duration))
        paramIndex++
      }

      // Apply call status filter
      if (filter_criteria?.call_status && filter_criteria.call_status !== 'all') {
        countQueryText += ` AND cl.call_ended_reason = $${paramIndex}`
        queryParams.push(filter_criteria.call_status)
        paramIndex++
      } else {
        countQueryText += ` AND cl.call_ended_reason = $${paramIndex} AND cl.transcript_json IS NOT NULL`
        queryParams.push('completed')
        paramIndex++
      }

      const countResult = await query(countQueryText, queryParams)

      if (countResult.rows.length > 0) {
        total_traces = parseInt(countResult.rows[0].count) || 0
      } else {
        total_traces = 0
      }
    }

    // Create the evaluation job record
    const insertResult = await query(
      `INSERT INTO pype_voice_evaluation_jobs 
        (project_id, agent_id, name, description, prompt_ids, selected_traces, filter_criteria, 
         status, total_traces, completed_traces, failed_traces, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        project_id,
        agent_id,
        name.trim(),
        description?.trim() || '',
        prompt_ids,
        selected_traces || null,
        JSON.stringify(filter_criteria || {}),
        'pending',
        total_traces,
        0,
        0,
        userId,
        new Date().toISOString()
      ]
    )

    if (insertResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create evaluation job' },
        { status: 500 }
      )
    }

    const data = insertResult.rows[0]

    // TODO: Here you would typically queue the job for processing
    // For now, we'll process the job immediately in the background
    
    // Import the processor and start the job
    try {
      // Start processing the job in the background (don't await to avoid blocking the response)
      // In production, this should be handled by a job queue
      import('@/lib/evaluation/processor').then(({ processEvaluationJobById }) => {
        processEvaluationJobById(data.id).catch(error => {
          console.error('Background job processing failed:', error)
        })
      })
    } catch (error) {
      console.error('Failed to start background job processing:', error)
      // Don't fail the API call if background processing fails to start
    }

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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

    if (searchParams.get('project_id')) {
      conditions.push(`project_id = $${paramIndex}`)
      params.push(searchParams.get('project_id'))
      paramIndex++
    }

    if (searchParams.get('agent_id')) {
      conditions.push(`agent_id = $${paramIndex}`)
      params.push(searchParams.get('agent_id'))
      paramIndex++
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Handle ordering
    const orderBy = searchParams.get('orderBy') || 'created_at'
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'

    // Handle pagination
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    const limitClause = limit ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''

    // Execute query
    const result = await query(
      `SELECT * FROM pype_voice_evaluation_jobs 
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
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}