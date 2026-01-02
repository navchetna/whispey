// app/api/developer-settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

// GET - Fetch global developer settings
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
      `SELECT * FROM pype_voice_developer_settings LIMIT 1`
    )

    return NextResponse.json({
      data: result.rows,
      count: result.rows.length
    })
  } catch (error) {
    console.error('Error fetching developer settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch developer settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST - Update or create global developer settings
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
    const {
      id,
      llm_provider,
      llm_model,
      llm_temperature,
      llm_base_url,
      llm_api_key,
      stt_provider,
      stt_model,
      stt_language,
      stt_base_url,
      stt_api_key,
      stt_config,
      tts_provider,
      tts_model,
      tts_voice,
      tts_base_url,
      tts_api_key,
      tts_voice_config,
      vad_provider,
      vad_min_silence_duration,
      allow_interruptions,
      min_interruption_duration,
      enable_filler_words,
      general_fillers,
      deployment_agent_name,
      deployment_agent_description,
      deployment_language,
      preemptive_generation,
      turn_detection,
      azure_config,
      updated_by
    } = body

    // Upsert the settings (insert or update on conflict)
    const result = await query(
      `INSERT INTO pype_voice_developer_settings (
        id,
        llm_provider,
        llm_model,
        llm_temperature,
        llm_base_url,
        llm_api_key,
        stt_provider,
        stt_model,
        stt_language,
        stt_base_url,
        stt_api_key,
        stt_config,
        tts_provider,
        tts_model,
        tts_voice,
        tts_base_url,
        tts_api_key,
        tts_voice_config,
        vad_provider,
        vad_min_silence_duration,
        allow_interruptions,
        min_interruption_duration,
        enable_filler_words,
        general_fillers,
        deployment_agent_name,
        deployment_agent_description,
        deployment_language,
        preemptive_generation,
        turn_detection,
        azure_config,
        updated_by,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW())
      ON CONFLICT (id) DO UPDATE SET
        llm_provider = EXCLUDED.llm_provider,
        llm_model = EXCLUDED.llm_model,
        llm_temperature = EXCLUDED.llm_temperature,
        llm_base_url = EXCLUDED.llm_base_url,
        llm_api_key = EXCLUDED.llm_api_key,
        stt_provider = EXCLUDED.stt_provider,
        stt_model = EXCLUDED.stt_model,
        stt_language = EXCLUDED.stt_language,
        stt_base_url = EXCLUDED.stt_base_url,
        stt_api_key = EXCLUDED.stt_api_key,
        stt_config = EXCLUDED.stt_config,
        tts_provider = EXCLUDED.tts_provider,
        tts_model = EXCLUDED.tts_model,
        tts_voice = EXCLUDED.tts_voice,
        tts_base_url = EXCLUDED.tts_base_url,
        tts_api_key = EXCLUDED.tts_api_key,
        tts_voice_config = EXCLUDED.tts_voice_config,
        vad_provider = EXCLUDED.vad_provider,
        vad_min_silence_duration = EXCLUDED.vad_min_silence_duration,
        allow_interruptions = EXCLUDED.allow_interruptions,
        min_interruption_duration = EXCLUDED.min_interruption_duration,
        enable_filler_words = EXCLUDED.enable_filler_words,
        general_fillers = EXCLUDED.general_fillers,
        deployment_agent_name = EXCLUDED.deployment_agent_name,
        deployment_agent_description = EXCLUDED.deployment_agent_description,
        deployment_language = EXCLUDED.deployment_language,
        preemptive_generation = EXCLUDED.preemptive_generation,
        turn_detection = EXCLUDED.turn_detection,
        azure_config = EXCLUDED.azure_config,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
      RETURNING *`,
      [
        id || '00000000-0000-0000-0000-000000000001',
        llm_provider,
        llm_model,
        llm_temperature,
        llm_base_url,
        llm_api_key,
        stt_provider,
        stt_model,
        stt_language,
        stt_base_url,
        stt_api_key,
        JSON.stringify(stt_config || {}),
        tts_provider,
        tts_model,
        tts_voice,
        tts_base_url,
        tts_api_key,
        JSON.stringify(tts_voice_config || {}),
        vad_provider,
        vad_min_silence_duration,
        allow_interruptions,
        min_interruption_duration,
        enable_filler_words,
        general_fillers,
        deployment_agent_name,
        deployment_agent_description,
        deployment_language,
        preemptive_generation,
        turn_detection,
        JSON.stringify(azure_config || {}),
        updated_by
      ]
    )

    return NextResponse.json({
      data: result.rows[0],
      message: 'Developer settings saved successfully'
    })
  } catch (error) {
    console.error('Error saving developer settings:', error)
    return NextResponse.json(
      { error: 'Failed to save developer settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
