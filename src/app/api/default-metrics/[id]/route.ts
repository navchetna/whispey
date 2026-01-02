// app/api/default-metrics/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

// GET - Fetch a single default metric by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id } = await params

    const result = await query(
      `SELECT 
        id,
        name,
        description,
        metric_type,
        evaluation_type,
        prompt_template,
        scoring_output_type,
        success_criteria,
        is_active,
        created_at,
        updated_at
       FROM pype_voice_default_metrics
       WHERE id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Default metric not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: result.rows[0] })
  } catch (error) {
    console.error('Error fetching default metric:', error)
    return NextResponse.json(
      { error: 'Failed to fetch default metric' },
      { status: 500 }
    )
  }
}

// PUT - Update a default metric (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required to update default metrics' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const {
      name, 
      description, 
      metric_type,
      evaluation_type, 
      prompt_template,
      scoring_output_type,
      success_criteria,
      is_active
    } = body

    // Validate required fields
    if (!name || !prompt_template) {
      return NextResponse.json(
        { error: 'Missing required fields: name, prompt_template' },
        { status: 400 }
      )
    }

    // Check if another metric with same name exists (excluding current one)
    const existingMetric = await query(
      `SELECT id FROM pype_voice_default_metrics WHERE name = $1 AND id != $2`,
      [name.trim(), id]
    )

    if (existingMetric.rows.length > 0) {
      return NextResponse.json(
        { error: 'Another default metric with this name already exists' },
        { status: 409 }
      )
    }

    const updateResult = await query(
      `UPDATE pype_voice_default_metrics 
       SET name = $1, description = $2, metric_type = $3, evaluation_type = $4, 
           prompt_template = $5, scoring_output_type = $6, success_criteria = $7, 
           is_active = $8, updated_at = $9
       WHERE id = $10
       RETURNING *`,
      [
        name.trim(),
        description?.trim() || '',
        metric_type || 'llm',
        evaluation_type || 'custom',
        prompt_template,
        scoring_output_type || 'float',
        success_criteria || 'higher_is_better',
        is_active !== undefined ? is_active : true,
        new Date().toISOString(),
        id
      ]
    )

    if (updateResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Default metric not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      data: updateResult.rows[0],
      message: 'Default metric updated successfully'
    })
  } catch (error) {
    console.error('Error updating default metric:', error)
    return NextResponse.json(
      { error: 'Failed to update default metric', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a default metric (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required to delete default metrics' },
        { status: 403 }
      )
    }

    const { id } = await params

    const deleteResult = await query(
      `DELETE FROM pype_voice_default_metrics WHERE id = $1 RETURNING id`,
      [id]
    )

    if (deleteResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Default metric not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      message: 'Default metric deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting default metric:', error)
    return NextResponse.json(
      { error: 'Failed to delete default metric', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
