import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Build dynamic WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Support common filters
    if (searchParams.get('id')) {
      conditions.push(`id = $${paramIndex}`)
      params.push(searchParams.get('id'))
      paramIndex++
    }

    if (searchParams.get('call_id')) {
      conditions.push(`call_id = $${paramIndex}`)
      params.push(searchParams.get('call_id'))
      paramIndex++
    }

    if (searchParams.get('agent_id') || searchParams.get('agentId')) {
      conditions.push(`agent_id = $${paramIndex}`)
      params.push(searchParams.get('agent_id') || searchParams.get('agentId'))
      paramIndex++
    }

    if (searchParams.get('project_id')) {
      conditions.push(`project_id = $${paramIndex}`)
      params.push(searchParams.get('project_id'))
      paramIndex++
    }

    // Support filtering by audio_file_id in metadata
    if (searchParams.get('audio_file_id')) {
      conditions.push(`metadata->>'audio_file_id' = $${paramIndex}`)
      params.push(searchParams.get('audio_file_id'))
      paramIndex++
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Handle ordering
    const orderBy = searchParams.get('orderBy') || 'created_at'
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC'

    // Handle pagination
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''

    // Execute query with all fields
    const result = await query(
      `SELECT * FROM pype_voice_call_logs 
       ${whereClause} 
       ORDER BY ${orderBy} ${order} 
       ${limitClause} ${offsetClause}`,
      params
    )

    return NextResponse.json({ 
      data: result.rows,
      count: result.rows.length 
    })
  } catch (error) {
    console.error('Error fetching call logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch call logs' },
      { status: 500 }
    )
  }
}

// DELETE endpoint to delete a call log and associated data
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const callLogId = searchParams.get('id')
    const agentId = searchParams.get('agent_id')

    if (!callLogId) {
      return NextResponse.json(
        { error: 'Call log ID is required' },
        { status: 400 }
      )
    }

    // Get the call log record to find associated data
    const callLogResult = await query(
      'SELECT * FROM pype_voice_call_logs WHERE id = $1',
      [callLogId]
    )

    if (callLogResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Call log not found' },
        { status: 404 }
      )
    }

    const callLog = callLogResult.rows[0]

    // Verify agent ownership if provided
    if (agentId && callLog.agent_id !== agentId) {
      return NextResponse.json(
        { error: 'Call log does not belong to this agent' },
        { status: 403 }
      )
    }

    // Check if this is an uploaded audio file call
    const isUploadedAudio = callLog.call_id?.startsWith('uploaded-')
    let audioFileId: string | null = null

    if (isUploadedAudio) {
      // Extract audio file ID from call_id (format: uploaded-{uuid})
      audioFileId = callLog.call_id.replace('uploaded-', '')
    }

    // Delete associated metrics logs
    await query(
      'DELETE FROM pype_voice_metrics_logs WHERE session_id = $1',
      [callLogId]
    )

    // Delete associated evaluation results
    await query(
      'DELETE FROM pype_voice_evaluation_results WHERE call_id = $1',
      [callLog.call_id]
    )

    // Delete the call log record
    await query(
      'DELETE FROM pype_voice_call_logs WHERE id = $1',
      [callLogId]
    )

    // If this was an uploaded audio, also delete the audio file record
    if (audioFileId) {
      // Get the audio file path before deleting
      const audioFileResult = await query(
        'SELECT file_path FROM pype_voice_audio_files WHERE id = $1',
        [audioFileId]
      )

      // Delete the audio file record
      await query(
        'DELETE FROM pype_voice_audio_files WHERE id = $1',
        [audioFileId]
      )

      // Delete the actual file from disk if it exists
      if (audioFileResult.rows.length > 0 && audioFileResult.rows[0].file_path) {
        const fs = await import('fs')
        const filePath = audioFileResult.rows[0].file_path
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath)
            console.log(`Deleted audio file from disk: ${filePath}`)
          } catch (fileError) {
            console.error(`Failed to delete audio file from disk: ${filePath}`, fileError)
          }
        }
      }
    }

    console.log(`Deleted call log: ${callLog.call_id} (ID: ${callLogId})`)

    return NextResponse.json({
      success: true,
      message: `Successfully deleted call log`,
      deleted_id: callLogId,
      deleted_audio_file: audioFileId
    }, { status: 200 })

  } catch (error) {
    console.error('Error deleting call log:', error)
    return NextResponse.json(
      { 
        error: 'Failed to delete call log',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}