import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { auth } from '@/lib/auth-server'
import 'server-only'

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

    const { searchParams } = new URL(request.url)
    
    // Build dynamic WHERE clause
    const conditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Filter by agent_id (required for evaluation job creation)
    if (searchParams.get('agent_id')) {
      conditions.push(`cl.agent_id = $${paramIndex}`)
      params.push(searchParams.get('agent_id'))
      paramIndex++
    }

    // Filter by project_id (through agent)
    if (searchParams.get('project_id')) {
      conditions.push(`a.project_id = $${paramIndex}`)
      params.push(searchParams.get('project_id'))
      paramIndex++
    }

    // Filter by call_id (from evaluation results)
    if (searchParams.get('call_id')) {
      conditions.push(`cl.call_id = $${paramIndex}`)
      params.push(searchParams.get('call_id'))
      paramIndex++
    }

    // Date range filtering
    const dateRange = searchParams.get('date_range')
    if (dateRange && dateRange !== 'all') {
      const now = new Date()
      let startDate: Date | null = null
      
      switch (dateRange) {
        case 'last_24_hours':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case 'last_7_days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'last_30_days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case 'last_90_days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case 'custom':
          if (searchParams.get('start_date')) {
            startDate = new Date(searchParams.get('start_date')!)
          }
          break
      }
      
      if (startDate) {
        conditions.push(`cl.created_at >= $${paramIndex}`)
        params.push(startDate.toISOString())
        paramIndex++
      }
      
      if (dateRange === 'custom' && searchParams.get('end_date')) {
        const endDate = new Date(searchParams.get('end_date')!)
        endDate.setDate(endDate.getDate() + 1)
        conditions.push(`cl.created_at < $${paramIndex}`)
        params.push(endDate.toISOString())
        paramIndex++
      }
    }

    // Min duration filter
    if (searchParams.get('min_duration')) {
      const minDuration = parseInt(searchParams.get('min_duration')!)
      if (!isNaN(minDuration)) {
        conditions.push(`cl.duration_seconds >= $${paramIndex}`)
        params.push(minDuration)
        paramIndex++
      }
    }

    // Call status filter
    const callStatus = searchParams.get('call_status')
    if (callStatus && callStatus !== 'all') {
      conditions.push(`cl.call_ended_reason = $${paramIndex}`)
      params.push(callStatus)
      paramIndex++
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Handle pagination
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    console.log('📊 [TRACES API] Fetching traces with params:', {
      agent_id: searchParams.get('agent_id'),
      project_id: searchParams.get('project_id'),
      date_range: dateRange,
      call_status: callStatus,
      whereClause,
      params
    })

    // Query call logs directly - these are the "traces" available for evaluation
    // We fetch call logs that have transcript data (either from transcript_json or metrics_logs)
    const tracesQuery = `
      SELECT 
        cl.id,
        cl.call_id,
        cl.agent_id,
        cl.recording_url,
        cl.voice_recording_url,
        cl.duration_seconds,
        cl.call_ended_reason as status,
        cl.transcript_json,
        cl.call_started_at,
        cl.call_ended_at,
        cl.created_at as timestamp,
        cl.metadata,
        a.name as agent_name,
        a.project_id,
        af.id as audio_file_id,
        af.file_name as audio_file_name,
        af.status as audio_status,
        st.id as session_trace_id,
        st.trace_key,
        st.total_spans
      FROM pype_voice_call_logs cl
      INNER JOIN pype_voice_agents a ON cl.agent_id = a.id
      LEFT JOIN pype_voice_audio_files af ON cl.metadata->>'audio_file_id' = af.id::text
      LEFT JOIN pype_voice_session_traces st ON cl.id::text = st.session_id::text
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    const tracesResult = await query(tracesQuery, params)
    console.log(`📊 [TRACES API] Found ${tracesResult.rows.length} call logs`)

    // Enrich each trace with transcript data from metrics_logs
    const tracesWithTranscripts = await Promise.all(
      tracesResult.rows.map(async (callLog: any) => {
        // Get transcript turns from metrics_logs
        const transcriptResult = await query(
          `SELECT 
            turn_id,
            user_transcript,
            agent_response,
            created_at
           FROM pype_voice_metrics_logs 
           WHERE session_id = $1 
           ORDER BY unix_timestamp ASC`,
          [callLog.id]
        )

        // Build transcript string for preview
        let transcriptPreview = ''
        if (transcriptResult.rows.length > 0) {
          transcriptPreview = transcriptResult.rows
            .map((turn: any) => {
              const parts: string[] = []
              if (turn.user_transcript) parts.push(`User: ${turn.user_transcript}`)
              if (turn.agent_response) parts.push(`Agent: ${turn.agent_response}`)
              return parts.join(' ')
            })
            .join(' | ')
        } else if (callLog.transcript_json) {
          // Fallback to transcript_json if no metrics_logs
          try {
            const transcript = typeof callLog.transcript_json === 'string' 
              ? JSON.parse(callLog.transcript_json) 
              : callLog.transcript_json
            
            if (Array.isArray(transcript)) {
              transcriptPreview = transcript
                .map((item: any) => {
                  if (item.user_transcript || item.agent_response) {
                    const parts: string[] = []
                    if (item.user_transcript) parts.push(`User: ${item.user_transcript}`)
                    if (item.agent_response) parts.push(`Agent: ${item.agent_response}`)
                    return parts.join(' ')
                  }
                  if (item.role && item.content) {
                    return `${item.role}: ${item.content}`
                  }
                  return ''
                })
                .filter(Boolean)
                .join(' | ')
            }
          } catch (e) {
            transcriptPreview = 'Transcript available'
          }
        }

        // Check if this call log has valid transcript data
        const hasTranscript = transcriptResult.rows.length > 0 || 
          (callLog.transcript_json && 
           (Array.isArray(callLog.transcript_json) ? callLog.transcript_json.length > 0 : true))

        return {
          id: callLog.id,
          call_id: callLog.call_id,
          agent_id: callLog.agent_id,
          agent_name: callLog.agent_name,
          project_id: callLog.project_id,
          recording_url: callLog.recording_url,
          voice_recording_url: callLog.voice_recording_url,
          duration: callLog.duration_seconds,
          status: callLog.status || 'completed',
          timestamp: callLog.timestamp,
          call_started_at: callLog.call_started_at,
          call_ended_at: callLog.call_ended_at,
          transcript: transcriptPreview || 'No transcript available',
          has_transcript: hasTranscript,
          transcript_turns_count: transcriptResult.rows.length,
          audio_file: callLog.audio_file_id ? {
            id: callLog.audio_file_id,
            file_name: callLog.audio_file_name,
            status: callLog.audio_status
          } : null,
          has_session_trace: !!callLog.session_trace_id,
          total_spans: callLog.total_spans || 0
        }
      })
    )

    // Filter to only include traces with actual transcript data
    const validTraces = tracesWithTranscripts.filter(trace => trace.has_transcript)
    
    console.log(`📊 [TRACES API] Returning ${validTraces.length} traces with transcripts (filtered from ${tracesWithTranscripts.length})`)

    return NextResponse.json({
      success: true,
      data: validTraces,
      count: validTraces.length,
      total_before_filter: tracesWithTranscripts.length,
      pagination: {
        limit,
        offset,
        hasMore: tracesResult.rows.length === limit
      }
    })

  } catch (error) {
    console.error('Error fetching evaluation traces:', error)
    return NextResponse.json(
      { error: 'Failed to fetch evaluation traces', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Get traces for a specific call/evaluation result
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
    const { call_ids, job_id } = body

    if (!call_ids && !job_id) {
      return NextResponse.json(
        { error: 'Either call_ids or job_id is required' },
        { status: 400 }
      )
    }

    let callIdList: string[] = []

    if (call_ids && Array.isArray(call_ids)) {
      callIdList = call_ids
    } else if (job_id) {
      // Get all call_ids from evaluation results for this job
      const resultsQuery = await query(
        'SELECT DISTINCT call_id FROM pype_voice_evaluation_results WHERE job_id = $1',
        [job_id]
      )
      callIdList = resultsQuery.rows.map((r: any) => r.call_id)
    }

    if (callIdList.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0
      })
    }

    // Get call logs with their traces
    const callLogsResult = await query(
      `SELECT 
        cl.id,
        cl.call_id,
        cl.agent_id,
        cl.recording_url,
        cl.voice_recording_url,
        cl.duration_seconds,
        cl.call_ended_reason,
        cl.transcript_json,
        cl.metadata,
        cl.call_started_at,
        cl.call_ended_at,
        st.id as trace_id,
        st.trace_key,
        st.total_spans,
        st.performance_summary,
        st.span_summary,
        st.total_duration_ms
       FROM pype_voice_call_logs cl
       LEFT JOIN pype_voice_session_traces st ON cl.id::text = st.session_id::text
       WHERE cl.call_id = ANY($1::text[])`,
      [callIdList]
    )

    // Enrich with spans and transcript data
    const enrichedResults = await Promise.all(
      callLogsResult.rows.map(async (callLog: any) => {
        const result: any = {
          call_id: callLog.call_id,
          call_log_id: callLog.id,
          agent_id: callLog.agent_id,
          recording_url: callLog.recording_url,
          voice_recording_url: callLog.voice_recording_url,
          duration_seconds: callLog.duration_seconds,
          call_ended_reason: callLog.call_ended_reason,
          call_started_at: callLog.call_started_at,
          call_ended_at: callLog.call_ended_at,
          audio_file_id: callLog.metadata?.audio_file_id || null,
          trace: null,
          spans: [],
          transcript_turns: []
        }

        // Get trace and spans
        if (callLog.trace_key) {
          result.trace = {
            id: callLog.trace_id,
            trace_key: callLog.trace_key,
            total_spans: callLog.total_spans,
            performance_summary: callLog.performance_summary,
            span_summary: callLog.span_summary,
            total_duration_ms: callLog.total_duration_ms
          }

          const spansResult = await query(
            `SELECT * FROM pype_voice_spans 
             WHERE trace_key = $1 
             ORDER BY start_time_ns ASC`,
            [callLog.trace_key]
          )
          result.spans = spansResult.rows
        }

        // Get transcript turns
        const transcriptResult = await query(
          `SELECT 
            turn_id,
            user_transcript,
            agent_response,
            stt_metrics,
            llm_metrics,
            tts_metrics,
            eou_metrics,
            trace_id as turn_trace_id,
            unix_timestamp,
            created_at
           FROM pype_voice_metrics_logs 
           WHERE session_id = $1 
           ORDER BY unix_timestamp ASC`,
          [callLog.id]
        )
        result.transcript_turns = transcriptResult.rows

        // Get audio file info if present
        if (callLog.metadata?.audio_file_id) {
          const audioResult = await query(
            'SELECT id, file_name, file_path, status FROM pype_voice_audio_files WHERE id = $1',
            [callLog.metadata.audio_file_id]
          )
          if (audioResult.rows.length > 0) {
            result.audio_file = audioResult.rows[0]
          }
        }

        return result
      })
    )

    return NextResponse.json({
      success: true,
      data: enrichedResults,
      count: enrichedResults.length
    })

  } catch (error) {
    console.error('Error fetching traces for calls:', error)
    return NextResponse.json(
      { error: 'Failed to fetch traces', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
