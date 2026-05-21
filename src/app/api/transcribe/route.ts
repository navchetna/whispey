import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { existsSync } from 'fs'

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const log = {
  error: (msg: string, data?: any) => {
    console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`, data || '')
  },
  success: (msg: string, data?: any) => {
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`, data || '')
  },
  warning: (msg: string, data?: any) => {
    console.warn(`${colors.yellow}[WARNING]${colors.reset} ${msg}`, data || '')
  },
  info: (msg: string, data?: any) => {
    console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`, data || '')
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let audio_file_id: string | null = null

  try {
    log.info('[TRANSCRIBE] Received transcription request')

    const form = await request.formData()
    const file = form.get("audio_file") as File | null
    audio_file_id = form.get("audio_file_id") as string | null

    log.info('[TRANSCRIBE] Request details:', {
      has_file: !!file,
      file_name: file?.name,
      file_size: file?.size,
      audio_file_id
    })

    if (!file) {
      log.error('[TRANSCRIBE] No audio file uploaded')
      return NextResponse.json({ error: "No audio file uploaded" }, { status: 400 })
    }

    log.info(`[TRANSCRIBE] Starting transcription for audio_file_id: ${audio_file_id}`)

    // Get the audio file record
    log.info(`[TRANSCRIBE] Looking up audio file in database: ${audio_file_id}`)
    const audioFileResult = await query(
      'SELECT * FROM pype_voice_audio_files WHERE id = $1',
      [audio_file_id]
    )

    if (audioFileResult.rows.length === 0) {
      log.error(`[TRANSCRIBE] Audio file not found in database: ${audio_file_id}`)
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      )
    }

    const audioFile = audioFileResult.rows[0]
    const filePath = audioFile.file_path

    log.success('[TRANSCRIBE] Audio file found in DB:', {
      id: audioFile.id,
      file_name: audioFile.file_name,
      file_path: filePath,
      status: audioFile.status
    })

    // Verify file exists
    if (!existsSync(filePath)) {
      log.error(`[TRANSCRIBE] Audio file not found on disk: ${filePath}`)
      return NextResponse.json(
        { error: 'Audio file not found on disk' },
        { status: 404 }
      )
    }

    log.info('[TRANSCRIBE] Audio file verified on disk, calling Python backend...')

    // Call Python backend for transcription
    try {
      const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:5006'
      log.info(`[TRANSCRIBE] Calling Python backend at: ${pythonBackendUrl}`)

      const transcriptResult = await callPythonBackend(file, pythonBackendUrl)

      log.info('[TRANSCRIBE] Received response from Python backend:', {
        success: transcriptResult.success,
        has_transcript: !!transcriptResult.transcript,
        error: transcriptResult.error || null,
        audio_file_id
      })

      if (transcriptResult.success && transcriptResult.transcript) {
        const transcriptData = transcriptResult.transcript

        // Extract duration from transcript metadata
        const totalDuration = transcriptData?.metadata?.total_duration ||
          (transcriptData?.turns?.length > 0
            ? Math.max(...transcriptData.turns.map((t: any) => t.end_time || 0))
            : null)

        // Backend validated the transcript - mark as processed
        const audioFileStatus = 'processed'
        const callEndedReason = 'completed'
        const errorMessage = null

        log.info('[TRANSCRIBE] Updating database:', {
          audio_file_id,
          status: audioFileStatus,
          call_ended_reason: callEndedReason,
          duration: totalDuration
        })

        // Update audio file with transcript
        const audioUpdateResult = await query(
          'UPDATE pype_voice_audio_files SET transcript = $1, status = $2, error_message = $3, processed_at = NOW(), updated_at = NOW() WHERE id = $4 RETURNING id, status',
          [JSON.stringify(transcriptResult.transcript), audioFileStatus, errorMessage, audio_file_id]
        )

        log.success('[TRANSCRIBE] Audio file updated:', audioUpdateResult.rows[0])

        // Update call log with transcript, status and duration
        const callLogUpdateResult = await query(
          `UPDATE pype_voice_call_logs
           SET transcript_json = $1,
               transcript_type = 'diarized',
               call_ended_reason = $2,
               duration_seconds = COALESCE($3, duration_seconds)
           WHERE metadata->>'audio_file_id' = $4
           RETURNING id, call_ended_reason`,
          [JSON.stringify(transcriptResult.transcript), callEndedReason, totalDuration ? Math.round(totalDuration) : null, audio_file_id]
        )

        log.success('[TRANSCRIBE] Call log updated:', callLogUpdateResult.rows[0] || 'No call log found')

        const elapsed = Date.now() - startTime
        log.success(`[TRANSCRIBE] Transcription completed successfully for audio_file_id: ${audio_file_id} (${elapsed}ms)`)

        return NextResponse.json({
          success: true,
          message: 'Transcript generated successfully',
          transcript: transcriptResult.transcript
        })
      } else {
        const error = transcriptResult.error || 'Transcription failed'
        log.error('[TRANSCRIBE] Backend returned failure:', {
          error,
          audio_file_id
        })
        throw new Error(error)
      }

    } catch (error) {
      log.error('[TRANSCRIBE] Error during transcription:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        audio_file_id
      })

      // Update audio file status to failed
      const audioUpdateResult = await query(
        'UPDATE pype_voice_audio_files SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3 RETURNING id, status',
        ['failed', error instanceof Error ? error.message : 'Unknown error', audio_file_id]
      )

      log.warning('[TRANSCRIBE] Audio file marked as failed:', audioUpdateResult.rows[0])

      // Update call log status to failed
      const callLogUpdateResult = await query(
        `UPDATE pype_voice_call_logs
         SET call_ended_reason = 'failed'
         WHERE metadata->>'audio_file_id' = $1
         RETURNING id, call_ended_reason`,
        [audio_file_id]
      )

      log.warning('[TRANSCRIBE] Call log marked as failed:', callLogUpdateResult.rows[0] || 'No call log found')

      throw error
    }


  } catch (error) {
    const elapsed = Date.now() - startTime
    log.error(`[TRANSCRIBE] Fatal error generating transcript (${elapsed}ms):`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      audio_file_id
    })

    return NextResponse.json(
      {
        error: 'Failed to generate transcript',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

async function callPythonBackend(file: File | Blob, backendUrl: string, maxRetries: number = 5) {
  const baseDelay = 30000 // 30 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log.info(`[BACKEND] Attempt ${attempt}/${maxRetries}: Calling Python backend`, {
        url: `${backendUrl}/transcribe`,
        file_size: file.size
      })

      // Build multipart form-data
      const formData = new FormData();
      formData.append('file', file);  // name must match Python endpoint parameter

      const response = await fetch(`${backendUrl}/transcribe`, {
        method: 'POST',
        body: formData, // browser/Node 18+ fetch handles content-type automatically
      });

      log.info(`[BACKEND] Response received: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorData = await response.json()
        const errorMessage = errorData?.detail || errorData?.error || ''
        
        // Check if it's a rate limit error (429 status or error message contains rate limit)
        const isRateLimitError = 
          response.status === 429 || 
          errorMessage.toLowerCase().includes('rate_limit') ||
          errorMessage.toLowerCase().includes('rate limit')

        if (isRateLimitError && attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff
          log.warning(`[BACKEND] Rate limit hit. Retrying in ${delay / 1000}s... (attempt ${attempt}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        log.error('[BACKEND] Backend error:', {
          status: response.status,
          error: errorMessage
        })
        throw new Error(errorMessage || `Backend returned ${response.status}`)
      }

      const result = await response.json()
      log.success('[BACKEND] Python backend completed transcription successfully', {
        success: result.success,
        has_transcript: !!result.transcript
      })

      return result

    } catch (error) {
      log.error(`[BACKEND] Error on attempt ${attempt}/${maxRetries}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        is_network_error: error instanceof TypeError
      })

      // If it's a network error and we have retries left, retry
      if (attempt < maxRetries && error instanceof TypeError) {
        const delay = baseDelay * Math.pow(2, attempt - 1)
        log.warning(`[BACKEND] Network error. Retrying in ${delay / 1000}s... (attempt ${attempt}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      log.error('[BACKEND] Final error calling Python backend:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error calling Python backend'
      }
    }
  }

  log.error(`[BACKEND] Max retries (${maxRetries}) exceeded for transcription`)
  return {
    success: false,
    error: 'Max retries exceeded for transcription'
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
