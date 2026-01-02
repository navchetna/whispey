// app/api/default-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

// GET - Fetch all active default metrics (accessible by all authenticated users)
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
       WHERE is_active = true
       ORDER BY created_at DESC`
    )

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error fetching default metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch default metrics', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST - Create a new default metric (admin only)
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
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required to create default metrics' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      name,
      description, 
      metric_type,
      evaluation_type, 
      prompt_template,
      scoring_output_type,
      success_criteria
    } = body

    // Validate required fields
    if (!name || !prompt_template) {
      return NextResponse.json(
        { error: 'Missing required fields: name, prompt_template' },
        { status: 400 }
      )
    }

    // Check if metric with same name already exists
    const existingMetric = await query(
      `SELECT id FROM pype_voice_default_metrics WHERE name = $1`,
      [name.trim()]
    )

    if (existingMetric.rows.length > 0) {
      return NextResponse.json(
        { error: 'A default metric with this name already exists' },
        { status: 409 }
      )
    }

    const insertResult = await query(
      `INSERT INTO pype_voice_default_metrics 
        (name, description, metric_type, evaluation_type, prompt_template, 
         scoring_output_type, success_criteria, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       RETURNING *`,
      [
        name.trim(),
        description?.trim() || '',
        metric_type || 'llm',
        evaluation_type || 'custom',
        prompt_template,
        scoring_output_type || 'float',
        success_criteria || 'higher_is_better',
        true,
        userId === 'local-admin' ? null : userId,
        new Date().toISOString()
      ]
    )

    if (insertResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to create default metric' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: insertResult.rows[0],
      message: 'Default metric created successfully'
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating default metric:', error)
    return NextResponse.json(
      { error: 'Failed to create default metric', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
