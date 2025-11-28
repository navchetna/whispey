// app/api/evaluations/jobs/[id]/debug/route.ts
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

    // Get prompts for this job
    const promptsResult = await query(
      'SELECT * FROM pype_voice_evaluation_prompts WHERE id = ANY($1::uuid[])',
      [job.prompt_ids]
    )
    const prompts = promptsResult.rows

    // Check for call logs that match the job criteria
    const allLogsResult = await query(
      `SELECT cl.id, cl.call_id, cl.agent_id, cl.call_ended_reason, cl.transcript_json, 
              cl.duration_seconds, cl.created_at, a.project_id
       FROM pype_voice_call_logs cl
       INNER JOIN pype_voice_agents a ON cl.agent_id = a.id
       WHERE cl.agent_id = $1 AND a.project_id = $2`,
      [job.agent_id, job.project_id]
    )
    const allCallLogs = allLogsResult.rows

    // Check filtered logs (with completion and transcript filters)
    const filteredLogsResult = await query(
      `SELECT cl.id, cl.call_id, cl.agent_id, cl.call_ended_reason, cl.transcript_json, 
              cl.duration_seconds, cl.created_at, a.project_id
       FROM pype_voice_call_logs cl
       INNER JOIN pype_voice_agents a ON cl.agent_id = a.id
       WHERE cl.agent_id = $1 AND a.project_id = $2 
         AND cl.call_ended_reason = 'completed' 
         AND cl.transcript_json IS NOT NULL`,
      [job.agent_id, job.project_id]
    )
    const filteredCallLogs = filteredLogsResult.rows

    // Get evaluation results for this job
    const resultsResult = await query(
      'SELECT * FROM pype_voice_evaluation_results WHERE job_id = $1',
      [jobId]
    )
    const results = resultsResult.rows

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