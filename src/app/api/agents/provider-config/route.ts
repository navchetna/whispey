import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'

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
    const { agentId, agentName, provider, configuration, timestamp } = body

    // Validate required fields
    if (!agentId || !provider || !configuration) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, provider, or configuration' },
        { status: 400 }
      )
    }

    // Check if agent exists and get current configuration
    const existingAgentResult = await query(
      'SELECT * FROM pype_voice_agents WHERE id = $1 AND user_id = $2',
      [agentId, userId]
    )

    if (existingAgentResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found or you do not have permission to modify it' },
        { status: 404 }
      )
    }

    const existingAgent = existingAgentResult.rows[0]

    // Prepare the updated configuration
    const currentConfig = existingAgent.configuration || {}
    const updatedConfig = {
      ...currentConfig,
      provider_config: {
        provider: provider,
        configuration: configuration,
        last_updated: timestamp || new Date().toISOString(),
        updated_by: userId
      }
    }

    // Update the agent configuration
    const updateResult = await query(
      'UPDATE pype_voice_agents SET configuration = $1, updated_at = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [JSON.stringify(updatedConfig), new Date().toISOString(), agentId, userId]
    )

    if (updateResult.rows.length === 0) {
      console.error('Error updating agent configuration')
      return NextResponse.json(
        { error: 'Failed to save configuration' },
        { status: 500 }
      )
    }

    const data = updateResult.rows[0]

    return NextResponse.json({
      success: true,
      message: 'Agent configuration saved successfully',
      data: {
        agentId: data.id,
        agentName: data.name,
        provider: provider,
        configuration: configuration,
        timestamp: updatedConfig.provider_config.last_updated
      }
    })

  } catch (error) {
    console.error('Error in provider-config API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')

    if (!agentId) {
      return NextResponse.json(
        { error: 'Missing agentId parameter' },
        { status: 400 }
      )
    }

    const result = await query(
      'SELECT * FROM pype_voice_agents WHERE id = $1 AND is_active = true',
      [agentId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    const data = result.rows[0]

    // Extract provider configuration from the agent's configuration
    const providerConfig = data.configuration?.provider_config || null

    if (!providerConfig) {
      return NextResponse.json(
        { error: 'No provider configuration found for this agent' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        agentId: data.id,
        agentName: data.name,
        provider: providerConfig.provider,
        configuration: providerConfig.configuration,
        lastUpdated: providerConfig.last_updated,
        updatedBy: providerConfig.updated_by
      }
    })

  } catch (error) {
    console.error('Error in provider-config GET API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}