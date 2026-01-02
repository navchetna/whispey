// app/api/agent-personas/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

// GET - Fetch agent personas
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
    const agentId = searchParams.get('agent_id')

    let sql = `SELECT * FROM pype_voice_agent_personas`
    const params: string[] = []
    
    if (agentId) {
      sql += ` WHERE agent_id = $1`
      params.push(agentId)
    }
    sql += ` ORDER BY created_at DESC`

    const result = await query(sql, params)

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error fetching agent personas:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent personas', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST - Create a new agent persona
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
      agent_id,
      project_id,
      template_id,
      name,
      description,
      persona_name,
      persona_role,
      persona_background,
      tone,
      communication_style,
      behavioral_guidelines,
      do_list,
      dont_list,
      empathy_level,
      patience_level,
      system_prompt,
      is_active
    } = body

    const result = await query(
      `INSERT INTO pype_voice_agent_personas (
        agent_id,
        project_id,
        template_id,
        name,
        description,
        persona_name,
        persona_role,
        persona_background,
        tone,
        communication_style,
        behavioral_guidelines,
        do_list,
        dont_list,
        empathy_level,
        patience_level,
        system_prompt,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        agent_id,
        project_id,
        template_id,
        name,
        description,
        persona_name,
        persona_role,
        persona_background,
        tone,
        communication_style,
        behavioral_guidelines,
        do_list ? JSON.stringify(do_list) : null,
        dont_list ? JSON.stringify(dont_list) : null,
        empathy_level,
        patience_level,
        system_prompt,
        is_active !== false
      ]
    )

    return NextResponse.json({
      data: result.rows[0],
      message: 'Agent persona created successfully'
    })
  } catch (error) {
    console.error('Error creating agent persona:', error)
    return NextResponse.json(
      { error: 'Failed to create agent persona', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH - Update an agent persona
export async function PATCH(request: NextRequest) {
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
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Persona ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      template_id,
      name,
      description,
      persona_name,
      persona_role,
      persona_background,
      tone,
      communication_style,
      behavioral_guidelines,
      do_list,
      dont_list,
      empathy_level,
      patience_level,
      system_prompt,
      is_active
    } = body

    const result = await query(
      `UPDATE pype_voice_agent_personas SET
        template_id = $1,
        name = $2,
        description = $3,
        persona_name = $4,
        persona_role = $5,
        persona_background = $6,
        tone = $7,
        communication_style = $8,
        behavioral_guidelines = $9,
        do_list = $10,
        dont_list = $11,
        empathy_level = $12,
        patience_level = $13,
        system_prompt = $14,
        is_active = $15,
        updated_at = NOW()
      WHERE id = $16
      RETURNING *`,
      [
        template_id,
        name,
        description,
        persona_name,
        persona_role,
        persona_background,
        tone,
        communication_style,
        behavioral_guidelines,
        do_list ? JSON.stringify(do_list) : null,
        dont_list ? JSON.stringify(dont_list) : null,
        empathy_level,
        patience_level,
        system_prompt,
        is_active,
        id
      ]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: result.rows[0],
      message: 'Agent persona updated successfully'
    })
  } catch (error) {
    console.error('Error updating agent persona:', error)
    return NextResponse.json(
      { error: 'Failed to update agent persona', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete an agent persona
export async function DELETE(request: NextRequest) {
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
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Persona ID is required' },
        { status: 400 }
      )
    }

    const result = await query(
      `DELETE FROM pype_voice_agent_personas WHERE id = $1 RETURNING id`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      message: 'Agent persona deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting agent persona:', error)
    return NextResponse.json(
      { error: 'Failed to delete agent persona', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
