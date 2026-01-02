// app/api/persona-templates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

// GET - Fetch all persona templates
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
    const activeOnly = searchParams.get('active') === 'true'

    let sql = `SELECT * FROM pype_voice_agent_persona_templates`
    if (activeOnly) {
      sql += ` WHERE is_active = true`
    }
    sql += ` ORDER BY is_default DESC, created_at DESC`

    const result = await query(sql)

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error fetching persona templates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch persona templates', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST - Create a new persona template (admin only)
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

    // For local admin user (auth-server returns 'local-admin'), allow access
    // Only query database for real UUID user IDs
    let isAdmin = userId === 'local-admin'
    
    if (!isAdmin && userId) {
      try {
        const userResult = await query(
          `SELECT is_admin FROM pype_voice_users WHERE id = $1`,
          [userId]
        )
        isAdmin = userResult.rows[0]?.is_admin === true
      } catch {
        // If userId is not a valid UUID, this will fail - that's ok for local-admin
        isAdmin = false
      }
    }

    // Check admin permission
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      name,
      description,
      category,
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
      system_prompt_template,
      is_default,
      is_active,
      tags
    } = body

    const result = await query(
      `INSERT INTO pype_voice_agent_persona_templates (
        name,
        description,
        category,
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
        system_prompt_template,
        is_default,
        is_active,
        tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        name,
        description,
        category || 'general',
        persona_name,
        persona_role,
        persona_background,
        tone || 'professional',
        communication_style,
        behavioral_guidelines,
        JSON.stringify(do_list || []),
        JSON.stringify(dont_list || []),
        empathy_level || 'medium',
        patience_level || 'high',
        system_prompt_template,
        is_default || false,
        is_active !== false,
        JSON.stringify(tags || [])
      ]
    )

    return NextResponse.json({
      data: result.rows[0],
      message: 'Persona template created successfully'
    })
  } catch (error) {
    console.error('Error creating persona template:', error)
    return NextResponse.json(
      { error: 'Failed to create persona template', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PATCH - Update a persona template (admin only)
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

    // For local admin user (auth-server returns 'local-admin'), allow access
    let isAdmin = userId === 'local-admin'
    
    if (!isAdmin && userId) {
      try {
        const userResult = await query(
          `SELECT is_admin FROM pype_voice_users WHERE id = $1`,
          [userId]
        )
        isAdmin = userResult.rows[0]?.is_admin === true
      } catch {
        isAdmin = false
      }
    }

    // Check admin permission
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      name,
      description,
      category,
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
      system_prompt_template,
      is_default,
      is_active,
      tags
    } = body

    const result = await query(
      `UPDATE pype_voice_agent_persona_templates SET
        name = $1,
        description = $2,
        category = $3,
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
        system_prompt_template = $14,
        is_default = $15,
        is_active = $16,
        tags = $17,
        updated_at = NOW()
      WHERE id = $18
      RETURNING *`,
      [
        name,
        description,
        category,
        persona_name,
        persona_role,
        persona_background,
        tone,
        communication_style,
        behavioral_guidelines,
        JSON.stringify(do_list || []),
        JSON.stringify(dont_list || []),
        empathy_level,
        patience_level,
        system_prompt_template,
        is_default,
        is_active,
        JSON.stringify(tags || []),
        id
      ]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: result.rows[0],
      message: 'Persona template updated successfully'
    })
  } catch (error) {
    console.error('Error updating persona template:', error)
    return NextResponse.json(
      { error: 'Failed to update persona template', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a persona template (admin only)
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

    // For local admin user (auth-server returns 'local-admin'), allow access
    let isAdmin = userId === 'local-admin'
    
    if (!isAdmin && userId) {
      try {
        const userResult = await query(
          `SELECT is_admin FROM pype_voice_users WHERE id = $1`,
          [userId]
        )
        isAdmin = userResult.rows[0]?.is_admin === true
      } catch {
        isAdmin = false
      }
    }

    // Check admin permission
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      )
    }

    const result = await query(
      `DELETE FROM pype_voice_agent_persona_templates WHERE id = $1 RETURNING id`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      message: 'Persona template deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting persona template:', error)
    return NextResponse.json(
      { error: 'Failed to delete persona template', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
