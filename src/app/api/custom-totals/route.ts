// API route for custom totals operations
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const agentId = searchParams.get('agentId')

    if (!projectId || !agentId) {
      return NextResponse.json({ error: 'Missing projectId or agentId' }, { status: 400 })
    }

    const result = await query(
      `SELECT * FROM pype_voice_custom_totals_configs 
       WHERE project_id = $1 AND agent_id = $2 
       ORDER BY created_at ASC`,
      [projectId, agentId]
    )

    const customTotals = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      aggregation: row.aggregation,
      column: row.column_name,
      jsonField: row.json_field,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters || '[]') : (row.filters || []),
      filterLogic: row.filter_logic,
      icon: row.icon || 'calculator',
      color: row.color || 'blue',
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))

    return NextResponse.json({ data: customTotals })
  } catch (error) {
    console.error('Error fetching custom totals:', error)
    return NextResponse.json({ error: 'Failed to fetch custom totals' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { config, projectId, agentId } = body

    if (!config || !projectId || !agentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO pype_voice_custom_totals_configs (
        project_id, agent_id, name, description, aggregation, 
        column_name, json_field, filters, filter_logic, 
        icon, color, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        projectId,
        agentId,
        config.name,
        config.description,
        config.aggregation,
        config.column,
        config.jsonField,
        JSON.stringify(config.filters),
        config.filterLogic,
        config.icon,
        config.color,
        config.createdBy
      ]
    )

    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error: any) {
    console.error('Error saving custom total:', error)
    return NextResponse.json({ error: 'Failed to save custom total' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { configId, updates } = body

    if (!configId || !updates) {
      return NextResponse.json({ error: 'Missing configId or updates' }, { status: 400 })
    }

    await query(
      `UPDATE pype_voice_custom_totals_configs 
       SET name = $1, description = $2, aggregation = $3, column_name = $4,
           json_field = $5, filters = $6, filter_logic = $7, icon = $8,
           color = $9, updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [
        updates.name,
        updates.description,
        updates.aggregation,
        updates.column,
        updates.jsonField,
        JSON.stringify(updates.filters),
        updates.filterLogic,
        updates.icon,
        updates.color,
        configId
      ]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating custom total:', error)
    return NextResponse.json({ error: 'Failed to update custom total' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const configId = searchParams.get('configId')

    if (!configId) {
      return NextResponse.json({ error: 'Missing configId' }, { status: 400 })
    }

    await query(
      'DELETE FROM pype_voice_custom_totals_configs WHERE id = $1',
      [configId]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting custom total:', error)
    return NextResponse.json({ error: 'Failed to delete custom total' }, { status: 500 })
  }
}