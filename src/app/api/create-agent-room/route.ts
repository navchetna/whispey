import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      agent_name, 
      agent_description, 
      llm_provisioner,
      llm_model,
      stt_provisioner,
      stt_model,
      tts_provisioner,
      tts_model,
      tts_speaker,
      language 
    } = body

    // Validate required fields (only LLM config as per your requirement)
    if (!llm_provisioner || !llm_model) {
      return NextResponse.json(
        { error: 'LLM configuration (provider and model) is required' },
        { status: 400 }
      )
    }

    console.log('🚀 Creating agent room with data:', {
      agent_name,
      agent_description,
      language,
      config_summary: {
        llm: `${llm_provisioner}:${llm_model}`,
        tts: `${tts_provisioner}:${tts_model}`,
        stt: `${stt_provisioner}:${stt_model}`
      }
    })

    // TODO: Replace this with actual room creation logic
    // This is a mock response based on the curl structure provided
    const mockResponse = {
      success: true,
      room_id: `room_${Date.now()}`,
      agent_name,
      agent_description,
      language: language || 'english',
      status: 'created',
      agent_config: {
        llm_provider: llm_provisioner,
        llm_model: llm_model,
        tts_provider: tts_provisioner,
        tts_model: tts_model,
        tts_speaker: tts_speaker,
        stt_provider: stt_provisioner,
        stt_model: stt_model
      },
      created_at: new Date().toISOString(),
      deployment_url: `https://your-domain.com/room/${agent_name || 'default'}`,
      webhook_url: `https://your-domain.com/webhooks/room/${agent_name || 'default'}`
    }

    return NextResponse.json(mockResponse, { status: 201 })

  } catch (error) {
    console.error('❌ Error creating agent room:', error)
    return NextResponse.json(
      { error: 'Failed to create agent room' },
      { status: 500 }
    )
  }
}