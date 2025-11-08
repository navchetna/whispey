// src/app/api/agents/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, agent_type, configuration, project_id, environment } = body

    // Validation
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Agent name is required' },
        { status: 400 }
      )
    }

    if (!agent_type) {
      return NextResponse.json(
        { error: 'Agent type is required' },
        { status: 400 }
      )
    }

    if (!project_id) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Verify project exists
    const projectResult = await query(
      'SELECT id FROM pype_voice_projects WHERE id = $1',
      [project_id]
    )

    if (projectResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid project ID' },
        { status: 400 }
      )
    }

    // Check if agent with same name already exists in this project  
    const existingAgentResult = await query(
      'SELECT id, name FROM pype_voice_agents WHERE project_id = $1 AND name = $2',
      [project_id, name.trim()]
    )

    if (existingAgentResult.rows.length > 0) {
      return NextResponse.json(
        { error: `Agent with name "${name.trim()}" already exists in this project. Please choose a different name.` },
        { status: 409 }
      )
    }

    // Create agent data with proper typing
    const agentData: any = {
      name: name.trim(),
      agent_type,
      configuration: configuration || {},
      project_id,
      environment: environment || 'dev',
      is_active: true
    }

    console.log('💾 Inserting agent data:', agentData)

    // Insert agent into pype_voice_agents
    const insertResult = await query(
      `INSERT INTO pype_voice_agents 
        (name, agent_type, configuration, project_id, environment, is_active, 
         created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        agentData.name,
        agentData.agent_type,
        JSON.stringify(agentData.configuration),
        agentData.project_id,
        agentData.environment,
        agentData.is_active
      ]
    )

    if (insertResult.rows.length === 0) {
      console.error('❌ Error creating agent')
      return NextResponse.json(
        { error: 'Failed to create agent' },
        { status: 500 }
      )
    }

    const agent = insertResult.rows[0]

    console.log(`✅ Successfully created agent "${agent.name}" with ID: ${agent.id}`)
    
    return NextResponse.json(agent, { status: 201 })

  } catch (error) {
    console.error('💥 Unexpected error creating agent:', error)
    return NextResponse.json(
      { error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const agentId = searchParams.get('id')
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    const orderBy = searchParams.get('orderBy') || 'created_at'
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'

    // Build WHERE conditions
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    if (projectId) {
      conditions.push(`project_id = $${paramIndex}`)
      params.push(projectId)
      paramIndex++
    }

    if (agentId) {
      conditions.push(`id = $${paramIndex}`)
      params.push(agentId)
      paramIndex++
    }

    // Always filter active agents unless specified
    if (!searchParams.has('include_inactive')) {
      conditions.push(`is_active = true`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limitClause = limit ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''

    const result = await query(
      `SELECT * FROM pype_voice_agents 
       ${whereClause} 
       ORDER BY ${orderBy} ${order} 
       ${limitClause} ${offsetClause}`,
      params
    )

    return NextResponse.json({ data: result.rows, count: result.rows.length })

  } catch (error) {
    console.error('Unexpected error fetching agents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}