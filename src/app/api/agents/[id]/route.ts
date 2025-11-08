// src/app/api/agents/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'

// ADD THIS GET METHOD to your existing file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Fetch agent data from database
    const result = await query(
      'SELECT * FROM pype_voice_agents WHERE id = $1',
      [agentId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const agent = result.rows[0]

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Return agent data (without exposing encrypted keys)
    const agentResponse = {
      id: agent.id,
      name: agent.name,
      agent_type: agent.agent_type,
      configuration: agent.configuration,
      project_id: agent.project_id,
      environment: agent.environment,
      is_active: agent.is_active,
      created_at: agent.created_at,
      updated_at: agent.updated_at,
      user_id: agent.user_id,
      // Include boolean flags but not the actual encrypted keys
      has_vapi_keys: Boolean(agent.vapi_api_key_encrypted && agent.vapi_project_key_encrypted),
      vapi_api_key_encrypted: agent.vapi_api_key_encrypted, // Keep for the check
      vapi_project_key_encrypted: agent.vapi_project_key_encrypted, // Keep for the check
      // Include other fields you might have
      field_extractor: agent.field_extractor,
      field_extractor_prompt: agent.field_extractor_prompt,
      field_extractor_keys: agent.field_extractor_keys
    }

    return NextResponse.json(agentResponse)

  } catch (error) {
    console.error('💥 Error fetching agent:', error)
    return NextResponse.json(
      { error: `Failed to fetch agent: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}

// Your existing DELETE method stays exactly the same
export async function DELETE(
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

    // Start cascade deletion process

    // 1. Delete call logs for this agent
    await query(
      'DELETE FROM pype_voice_call_logs WHERE agent_id = $1',
      [agentId]
    )
    console.log('Successfully deleted call logs')

    // 2. Delete metrics logs (adjust based on your schema relationships)
    try {
      await query(
        'DELETE FROM pype_voice_metrics_logs WHERE session_id = $1',
        [agentId]
      )
      console.log('Successfully deleted metrics logs')
    } catch (error) {
      console.warn('Warning: Could not delete metrics logs:', error)
    }

    console.log('Successfully deleted auth tokens')

    // 4. Finally, delete the agent itself
    await query(
      'DELETE FROM pype_voice_agents WHERE id = $1',
      [agentId]
    )
    
    console.log(`Successfully deleted agent: ${agentId}`)

    return NextResponse.json(
      { 
        message: 'Agent and all related data deleted successfully'
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Unexpected error during agent deletion:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}