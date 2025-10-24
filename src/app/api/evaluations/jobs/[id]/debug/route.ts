// app/api/evaluations/jobs/[id]/debug/route.ts
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

    // Get prompts for this job
    const { data: prompts, error: promptsError } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('*')
      .in('id', job.prompt_ids)

    // Check for call logs that match the job criteria
    let query = supabase
      .from('pype_voice_call_logs')
      .select(`
        id,
        call_id,
        agent_id,
        call_ended_reason,
        transcript_json,
        duration_seconds,
        created_at,
        pype_voice_agents!inner(project_id)
      `)
      .eq('agent_id', job.agent_id)
      .eq('pype_voice_agents.project_id', job.project_id)

    const { data: allCallLogs, error: allLogsError } = await query

    // Check filtered logs (with completion and transcript filters)
    const { data: filteredCallLogs, error: filteredLogsError } = await query
      .eq('call_ended_reason', 'completed')
      .not('transcript_json', 'is', null)

    // Get evaluation results for this job
    const { data: results, error: resultsError } = await supabase
      .from('pype_voice_evaluation_results')
      .select('*')
      .eq('job_id', jobId)

    const debugInfo = {
      job: {
        id: job.id,
        name: job.name,
        status: job.status,
        agent_id: job.agent_id,
        project_id: job.project_id,
        prompt_ids: job.prompt_ids,
        total_traces: job.total_traces,
        completed_traces: job.completed_traces,
        failed_traces: job.failed_traces,
        error_message: job.error_message,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      },
      prompts: {
        count: prompts?.length || 0,
        error: promptsError?.message,
        details: prompts?.map(p => ({
          id: p.id,
          name: p.name,
          llm_provider: p.llm_provider,
          model: p.model,
          has_api_key: !!p.api_key
        }))
      },
      callLogs: {
        total_for_agent: allCallLogs?.length || 0,
        filtered_available: filteredCallLogs?.length || 0,
        all_logs_error: allLogsError?.message,
        filtered_logs_error: filteredLogsError?.message,
        sample_logs: filteredCallLogs?.slice(0, 3).map(log => ({
          id: log.id,
          call_id: log.call_id,
          has_transcript: !!log.transcript_json,
          transcript_type: Array.isArray(log.transcript_json) ? 'array' : typeof log.transcript_json,
          duration_seconds: log.duration_seconds,
          created_at: log.created_at
        }))
      },
      evaluationResults: {
        count: results?.length || 0,
        error: resultsError?.message,
        sample_results: results?.slice(0, 3).map(r => ({
          id: r.id,
          prompt_id: r.prompt_id,
          trace_id: r.trace_id,
          call_id: r.call_id,
          status: r.status,
          overall_score: r.evaluation_score?.overall_score,
          evaluation_score: r.evaluation_score,
          evaluation_reasoning: r.evaluation_reasoning,
          error_message: r.error_message
        }))
      },
      environment: {
        has_openai_key: !!process.env.OPENAI_API_KEY,
        node_version: process.version
      }
    }

    return NextResponse.json({
      success: true,
      debug: debugInfo
    })

  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}