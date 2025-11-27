import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { SarvamAIClient } from 'sarvamai'
import path from 'path'
import { existsSync } from 'fs'

const sarvamClient = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY || ''
})

export async function POST(request: NextRequest) {
  try {
    const { audio_file_id } = await request.json()
    
    if (!audio_file_id) {
      return NextResponse.json(
        { error: 'audio_file_id is required' },
        { status: 400 }
      )
    }

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

    // Update status to processing
    await query(
      'UPDATE pype_voice_audio_files SET status = $1, updated_at = NOW() WHERE id = $2',
      ['processing', audio_file_id]
    )

    // Generate transcript using SarvamAI
    try {
      const transcriptResult = await generateTranscript(filePath)
      
      if (transcriptResult.success && transcriptResult.transcript) {
        // Update audio file with transcript
        await query(
          'UPDATE pype_voice_audio_files SET transcript = $1, status = $2, processed_at = NOW(), updated_at = NOW() WHERE id = $3',
          [JSON.stringify(transcriptResult.transcript), 'processed', audio_file_id]
        )
        
        // Update call log with transcript
        await query(
          `UPDATE pype_voice_call_logs 
           SET transcript_json = $1, transcript_type = 'diarized' 
           WHERE metadata->>'audio_file_id' = $2`,
          [JSON.stringify(transcriptResult.transcript), audio_file_id]
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

async function generateTranscript(filePath: string) {
  try {
    console.log('Starting transcription for:', filePath)
    
    // Create SarvamAI speech-to-text job
    const job = await sarvamClient.speechToTextJob.createJob({
      languageCode: 'en-IN',
      model: 'saarika:v2.5',
      withDiarization: true,
      numSpeakers: 2
    })
    
    console.log('Job created:', job.jobId)
    
    // Upload audio file
    await job.uploadFiles([filePath])
    console.log('File uploaded')
    
    // Start the job
    await job.start()
    console.log('Job started')
    
    // Wait for completion
    const finalStatus = await job.waitUntilComplete()
    console.log('Job completed:', finalStatus)
    
    // Check if job failed
    if (await job.isFailed()) {
      return {
        success: false,
        error: 'Transcription job failed',
        transcript: null
      }
    }
    
    // Download outputs
    const outputDir = path.join(process.cwd(), 'transcription_outputs', job.jobId)
    await job.downloadOutputs(outputDir)
    console.log('Outputs downloaded to:', outputDir)
    
    // Read and parse transcript
    const transcriptPath = path.join(outputDir, 'transcript.json')
    if (existsSync(transcriptPath)) {
      const fs = require('fs').promises
      const transcriptData = JSON.parse(await fs.readFile(transcriptPath, 'utf-8'))
      
      // Format transcript to match call log structure
      const formattedTranscript = formatTranscript(transcriptData)
      
      return {
        success: true,
        transcript: formattedTranscript,
        error: null
      }
    } else {
      return {
        success: false,
        error: 'Transcript file not found in output',
        transcript: null
      }
    }
    
  } catch (error) {
    console.error('Transcription error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      transcript: null
    }
  }
}

function formatTranscript(sarvamOutput: any) {
  const turns: any[] = []
  
  // Sarvam AI output typically has diarized segments
  if (sarvamOutput.segments) {
    for (const segment of sarvamOutput.segments) {
      turns.push({
        speaker: segment.speaker || 'unknown',
        start_time: segment.start || 0,
        end_time: segment.end || 0,
        text: segment.text || '',
        confidence: segment.confidence || 0
      })
    }
  } else if (sarvamOutput.turns) {
    // Already in turns format
    return sarvamOutput
  }
  
  // Calculate metadata
  const totalDuration = turns.length > 0 
    ? Math.max(...turns.map(t => t.end_time)) 
    : 0
  
  const speakers = [...new Set(turns.map(t => t.speaker).filter(Boolean))]
  
  return {
    turns,
    metadata: {
      total_turns: turns.length,
      total_duration: totalDuration,
      speakers,
      transcription_engine: 'sarvam_ai_saarika_v2.5'
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
