import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Create Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
    const { data: existingAgent, error: fetchError } = await supabase
      .from('pype_voice_agents')
      .select('*')
      .eq('id', agentId)
      .eq('user_id', userId) // Ensure user owns this agent
      .single()

    if (fetchError || !existingAgent) {
      return NextResponse.json(
        { error: 'Agent not found or you do not have permission to modify it' },
        { status: 404 }
      )
    }

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
    const { data, error } = await supabase
      .from('pype_voice_agents')
      .update({
        configuration: updatedConfig,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      console.error('Error updating agent configuration:', error)
      return NextResponse.json(
        { error: 'Failed to save configuration' },
        { status: 500 }
      )
    }

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

    const { data, error } = await supabase
      .from('pype_voice_agents')
      .select('*')
      .eq('id', agentId)
      .eq('is_active', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') { // No rows found
        return NextResponse.json(
          { error: 'Agent not found' },
          { status: 404 }
        )
      }
      console.error('Error fetching agent:', error)
      return NextResponse.json(
        { error: 'Failed to fetch agent configuration' },
        { status: 500 }
      )
    }

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