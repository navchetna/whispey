import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { existsSync } from 'fs'

export async function POST(request: NextRequest) {
  try {
    const { audio_file_id } = await request.json()
    
    if (!audio_file_id) {
      return NextResponse.json(
        { error: 'audio_file_id is required' },
        { status: 400 }
      )
    }

    // Check if API key is configured
    if (!process.env.SARVAM_API_KEY || process.env.SARVAM_API_KEY === 'your_sarvam_api_key_here') {
      console.error('❌ SARVAM_API_KEY is not configured')
      return NextResponse.json(
        { error: 'SarvamAI API key not configured. Please set SARVAM_API_KEY in .env.local' },
        { status: 500 }
      )
    }

    console.log(`📝 Starting transcription for audio_file_id: ${audio_file_id}`)

    // Get the audio file record
    const audioFileResult = await query(
      'SELECT * FROM pype_voice_audio_files WHERE id = $1',
      [audio_file_id]
    )
    
    if (audioFileResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      )
    }
    
    const audioFile = audioFileResult.rows[0]
    const filePath = audioFile.file_path
    
    // Verify file exists
    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Audio file not found on disk' },
        { status: 404 }
      )
    }

    console.log(`🎙️ Audio file found, starting transcription...`)

    // Call Python backend for transcription
    try {
      const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5006'
      const transcriptResult = await callPythonBackend(filePath, pythonBackendUrl, process.env.SARVAM_API_KEY!)
      
      if (transcriptResult.success && transcriptResult.transcript) {
        // Update audio file with transcript
        await query(
          'UPDATE pype_voice_audio_files SET transcript = $1, status = $2, processed_at = NOW(), updated_at = NOW() WHERE id = $3',
          [JSON.stringify(transcriptResult.transcript), 'processed', audio_file_id]
        )
        
        // Extract duration from transcript metadata
        const transcriptData = transcriptResult.transcript
        const totalDuration = transcriptData?.metadata?.total_duration || 
          (transcriptData?.turns?.length > 0 
            ? Math.max(...transcriptData.turns.map((t: any) => t.end_time || 0)) 
            : null)
        
        // Update call log with transcript, status and duration
        await query(
          `UPDATE pype_voice_call_logs 
           SET transcript_json = $1, 
               transcript_type = 'diarized',
               call_ended_reason = 'completed',
               duration_seconds = COALESCE($3, duration_seconds)
           WHERE metadata->>'audio_file_id' = $2`,
          [JSON.stringify(transcriptResult.transcript), audio_file_id, totalDuration ? Math.round(totalDuration) : null]
        )
        
        return NextResponse.json({
          success: true,
          message: 'Transcript generated successfully',
          transcript: transcriptResult.transcript
        })
      } else {
        throw new Error(transcriptResult.error || 'Transcription failed')
      }
      
    } catch (error) {
      // Update status to failed
      await query(
        'UPDATE pype_voice_audio_files SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
        ['failed', error instanceof Error ? error.message : 'Unknown error', audio_file_id]
      )
      
      throw error
    }
    
  } catch (error) {
    console.error('Error generating transcript:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate transcript',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function callPythonBackend(filePath: string, backendUrl: string, apiKey: string) {
  try {
    console.log('🐍 Calling Python backend for transcription:', filePath)
    console.log('🔗 Backend URL:', backendUrl)
    
    const response = await fetch(`${backendUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_file_path: filePath,
        api_key: apiKey
      }),
      // No timeout - let Python handle the long-running operation
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `Backend returned ${response.status}`)
    }
    
    const result = await response.json()
    console.log('✅ Python backend completed transcription')
    
    return result
    
  } catch (error) {
    console.error('❌ Error calling Python backend:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calling Python backend'
    }
  }
}

// GET endpoint to check transcription status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const audioFileId = searchParams.get('audio_file_id')
    
    if (!audioFileId) {
      return NextResponse.json(
        { error: 'audio_file_id is required' },
        { status: 400 }
      )
    }

    const result = await query(
      'SELECT id, file_name, status, transcript, processed_at, error_message FROM pype_voice_audio_files WHERE id = $1',
      [audioFileId]
    )
    
    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: result.rows[0]
    })
    
  } catch (error) {
    console.error('Error checking transcript status:', error)
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    )
  }
}
