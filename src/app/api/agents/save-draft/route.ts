import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const { agentId } = body.metadata || {}
    
    if (!agentId) {
      console.error('❌ Missing agent ID in request metadata')
      return NextResponse.json(
        { message: 'Agent ID is required in metadata', error: 'Missing agentId' },
        { status: 400 }
      )
    }
    
    console.log('💾 Saving service provider configuration for agent ID:', agentId)
    
    // Save only the service provider configuration to Supabase
    const serviceProviderConfig = {
      azureConfig: body.azureConfig,
      sarvamConfig: body.sarvamConfig,
      basicConfiguration: body.basicConfiguration,
      last_saved: new Date().toISOString(),
      type: 'service_provider_config'
    }
    
    // Update the agent configuration in database
    const updateResult = await query(
      'UPDATE pype_voice_agents SET configuration = $1, updated_at = $2 WHERE id = $3 RETURNING *',
      [JSON.stringify(serviceProviderConfig), new Date().toISOString(), agentId]
    )
    
    if (updateResult.rows.length === 0) {
      throw new Error('Agent not found or no changes made')
    }
    
    const data = updateResult.rows[0]
    
    console.log('✅ Service provider configuration saved successfully to database:', data.id)
    
    return NextResponse.json({
      success: true,
      message: 'Service provider configuration saved successfully',
      agent_id: agentId,
      config_type: 'service_provider_config',
      updated_at: serviceProviderConfig.last_saved
    })
    
  } catch (error: any) {
    console.error('❌ Save service provider config error:', error)
    return NextResponse.json(
      { message: 'Failed to save service provider configuration', error: error.message },
      { status: 500 }
    )
  }
}