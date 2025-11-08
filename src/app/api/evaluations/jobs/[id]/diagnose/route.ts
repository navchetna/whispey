// app/api/evaluations/jobs/[id]/diagnose/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { auth } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { id: jobId } = await params

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    // Get job details
    const jobResult = await query(
      'SELECT * FROM pype_voice_evaluation_jobs WHERE id = $1',
      [jobId]
    )

    if (jobResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    const job = jobResult.rows[0]

    // Step 1: Check all call logs for this agent
    const allLogsResult = await query(
      'SELECT id, agent_id, call_ended_reason, created_at, duration_seconds FROM pype_voice_call_logs WHERE agent_id = $1',
      [job.agent_id]
    )
    const allCallLogs = allLogsResult.rows

    // Step 2: Check call logs with completion filter
    const completedResult = await query(
      `SELECT id, agent_id, call_ended_reason, created_at, duration_seconds 
       FROM pype_voice_call_logs 
       WHERE agent_id = $1 AND call_ended_reason = ANY($2::text[])`,
      [job.agent_id, ['completed', 'ended', 'finished', 'success']]
    )
    const completedFiltered = completedResult.rows

    // Step 3: For call logs with completion status, check if they have transcript data in metrics table
    let callLogsWithTranscripts: any[] = []
    let transcriptCheckDetails: any[] = []

    for (const callLog of (completedFiltered || [])) {
      try {
        // Check for transcript data in metrics logs
        const transcriptResult = await query(
          'SELECT user_transcript, agent_response, turn_id FROM pype_voice_metrics_logs WHERE session_id = $1',
          [callLog.id]
        )
        const transcriptTurns = transcriptResult.rows

        const hasValidTranscript = transcriptTurns && transcriptTurns.length > 0 && 
          transcriptTurns.some((turn: any) => turn.user_transcript || turn.agent_response)

        transcriptCheckDetails.push({
          call_id: callLog.id,
          transcript_turns_found: transcriptTurns?.length || 0,
          has_valid_transcript: hasValidTranscript,
          sample_turns: transcriptTurns?.slice(0, 2).map((turn: any) => ({
            turn_id: turn.turn_id,
            has_user_transcript: !!turn.user_transcript,
            has_agent_response: !!turn.agent_response
          })) || []
        })

        if (hasValidTranscript) {
          callLogsWithTranscripts.push({
            ...callLog,
            transcript_data: transcriptTurns
          })
        }
      } catch (error) {
        transcriptCheckDetails.push({
          call_id: callLog.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    // Check agent details
    const agentResult = await query(
      'SELECT id, name, project_id FROM pype_voice_agents WHERE id = $1',
      [job.agent_id]
    )
    const agent = agentResult.rows.length > 0 ? agentResult.rows[0] : null

    const diagnostics = {
      job: {
        id: job.id,
        name: job.name,
        agent_id: job.agent_id,
        project_id: job.project_id,
        filter_criteria: job.filter_criteria
      },
      agent: agent || 'Not found',
      callLogCounts: {
        total_for_agent: allCallLogs?.length || 0,
        after_completion_filter: completedFiltered?.length || 0,
        with_transcript_data: callLogsWithTranscripts?.length || 0
      },
      transcriptCheckDetails,
      sampleCallLogs: {
        all: allCallLogs?.slice(0, 3).map(log => ({
          id: log.id,
          call_ended_reason: log.call_ended_reason,
          duration_seconds: log.duration_seconds,
          created_at: log.created_at
        })) || [],
        with_transcripts: callLogsWithTranscripts?.slice(0, 3).map(log => ({
          id: log.id,
          call_ended_reason: log.call_ended_reason,
          duration_seconds: log.duration_seconds,
          transcript_turns: log.transcript_data?.length || 0,
          created_at: log.created_at
        })) || []
      }
    }

    return NextResponse.json({
      success: true,
      diagnostics
    })

  } catch (error) {
    console.error('Diagnostic endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}