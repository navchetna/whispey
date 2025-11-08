// app/api/evaluations/prompts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth, currentUser } from '@/lib/auth-server'
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
      name, 
      description, 
      evaluation_type, 
      prompt_template,
      llm_provider,
      model,
      api_url,
      api_key,
      scoring_output_type,
      success_criteria,
      temperature,
      max_tokens,
      expected_output_format,
      scoring_criteria
    } = body

    // Validate required fields
    if (!project_id || !name || !prompt_template || !llm_provider || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, name, prompt_template, llm_provider, model' },
        { status: 400 }
      )
    }

    // Create the evaluation prompt record
    const insertResult = await query(
      `INSERT INTO pype_voice_evaluation_prompts 
        (project_id, name, description, evaluation_type, prompt_template, llm_provider, model,
         api_url, api_key, scoring_output_type, success_criteria, temperature, max_tokens,
         expected_output_format, scoring_criteria, is_active, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING *`,
      [
        project_id,
        name.trim(),
        description?.trim() || '',
        evaluation_type || 'custom',
        prompt_template,
        llm_provider,
        model,
        api_url || '',
        api_key || '', // Note: In production, encrypt this
        scoring_output_type || 'float',
        success_criteria || 'higher_is_better',
        temperature || 0.0,
        max_tokens || 1000,
        JSON.stringify(expected_output_format || {}),
        JSON.stringify(scoring_criteria || {}),
        true,
        userId,
        new Date().toISOString()
      ]
    )

    if (insertResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create evaluation prompt' },
        { status: 500 }
      )
    }

    const data = insertResult.rows[0]

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
      `SELECT * FROM pype_voice_evaluation_prompts 
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