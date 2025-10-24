// app/api/evaluations/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Create Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
      project_id,
      agent_id,
      name, 
      description,
      prompt_ids,
      selected_traces,
      filter_criteria
    } = body

    // Validate required fields
    if (!project_id || !agent_id || !name || !prompt_ids || prompt_ids.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, agent_id, name, prompt_ids' },
        { status: 400 }
      )
    }

    // If no specific traces selected, we'll process based on filter criteria
    let total_traces = 0
    
    if (selected_traces && selected_traces.length > 0) {
      total_traces = selected_traces.length
    } else {
      // Count traces based on filter criteria
      const { count, error: countError } = await supabase
        .from('pype_voice_call_logs')
        .select('*, pype_voice_agents!inner(project_id)', { count: 'exact', head: true })
        .eq('pype_voice_agents.project_id', project_id)
        .eq('agent_id', agent_id)
        .eq('call_ended_reason', 'completed')
        .not('transcript_json', 'is', null)

      if (countError) {
        console.error('Count error:', countError)
        total_traces = 0
      } else {
        total_traces = count || 0
      }
    }

    // Create the evaluation job record
    const { data, error } = await supabase
      .from('pype_voice_evaluation_jobs')
      .insert({
        project_id,
        agent_id,
        name: name.trim(),
        description: description?.trim() || '',
        prompt_ids,
        selected_traces: selected_traces || null,
        filter_criteria: filter_criteria || {},
        status: 'pending',
        total_traces,
        completed_traces: 0,
        failed_traces: 0,
        created_by: userId,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      
      // Handle specific database errors
      if (error.code === 'PGRST205') {
        return NextResponse.json(
          { 
            error: 'Evaluation tables not found. Please run the database migration first.',
            details: 'The evaluation system tables need to be created. Please run the evaluation-schema.sql script in your Supabase SQL Editor.',
            migrationFile: 'evaluation-schema.sql'
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to create evaluation job', details: error.message },
        { status: 500 }
      )
    }

    // TODO: Here you would typically queue the job for processing
    // For now, we'll process the job immediately in the background
    
    // Import the processor and start the job
    try {
      // Start processing the job in the background (don't await to avoid blocking the response)
      // In production, this should be handled by a job queue
      import('@/lib/evaluation/processor').then(({ processEvaluationJobById }) => {
        processEvaluationJobById(data.id).catch(error => {
          console.error('Background job processing failed:', error)
        })
      })
    } catch (error) {
      console.error('Failed to start background job processing:', error)
      // Don't fail the API call if background processing fails to start
    }

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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
    const projectId = searchParams.get('project_id')
    const agentId = searchParams.get('agent_id')

    if (!projectId) {
      return NextResponse.json(
        { error: 'project_id parameter is required' },
        { status: 400 }
      )
    }

    // Build query
    let query = supabase
      .from('pype_voice_evaluation_jobs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    // Filter by agent_id if provided
    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      
      // Handle specific database errors
      if (error.code === 'PGRST205') {
        return NextResponse.json(
          { 
            error: 'Evaluation tables not found. Please run the database migration first.',
            details: 'The evaluation system tables need to be created. Please run the evaluation-schema.sql script in your Supabase SQL Editor.',
            migrationFile: 'evaluation-schema.sql'
          },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: 'Failed to fetch evaluation jobs', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}