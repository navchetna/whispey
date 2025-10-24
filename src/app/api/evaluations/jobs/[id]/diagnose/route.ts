// app/api/evaluations/jobs/[id]/diagnose/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Create Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
    const { data: job, error: jobError } = await supabase
      .from('pype_voice_evaluation_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Job not found', details: jobError?.message },
        { status: 404 }
      )
    }

    // Step 1: Check all call logs for this agent
    const { data: allCallLogs, error: allLogsError } = await supabase
      .from('pype_voice_call_logs')
      .select('id, agent_id, call_ended_reason, created_at, duration_seconds')
      .eq('agent_id', job.agent_id)

    // Step 2: Check call logs with completion filter
    const { data: completedFiltered, error: completedError } = await supabase
      .from('pype_voice_call_logs')
      .select('id, agent_id, call_ended_reason, created_at, duration_seconds')
      .eq('agent_id', job.agent_id)
      .in('call_ended_reason', ['completed', 'ended', 'finished', 'success'])

    // Step 3: For call logs with completion status, check if they have transcript data in metrics table
    let callLogsWithTranscripts: any[] = []
    let transcriptCheckDetails: any[] = []

    for (const callLog of (completedFiltered || [])) {
      try {
        // Check for transcript data in metrics logs
        const { data: transcriptTurns, error: transcriptError } = await supabase
          .from('pype_voice_metrics_logs')
          .select('user_transcript, agent_response, turn_id')
          .eq('session_id', callLog.id)

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
    const { data: agent, error: agentError } = await supabase
      .from('pype_voice_agents')
      .select('id, name, project_id')
      .eq('id', job.agent_id)
      .single()

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
      },
      errors: {
        allLogsError: allLogsError?.message,
        completedError: completedError?.message,
        agentError: agentError?.message
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