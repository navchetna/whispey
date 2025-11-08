import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    if (!agentId) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    // Get field_extractor_keys from agent configuration
    const result = await query(
      `SELECT field_extractor_keys FROM pype_voice_agents WHERE id = $1`,
      [agentId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      field_extractor_keys: result.rows[0].field_extractor_keys || []
    })
  } catch (error) {
    console.error('Error fetching agent fields:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent fields' },
      { status: 500 }
    )
  }
}
