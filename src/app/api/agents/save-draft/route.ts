import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Create Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
    
    // Update the agent configuration in Supabase
    const { data, error } = await supabase
      .from('pype_voice_agents')
      .update({
        configuration: serviceProviderConfig,
        updated_at: new Date().toISOString()
      })
      .eq('id', agentId)
      .select()
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw new Error(`Failed to save to database: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      throw new Error('Agent not found or no changes made')
    }
    
    console.log('✅ Service provider configuration saved successfully to Supabase:', data[0]?.id)
    
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