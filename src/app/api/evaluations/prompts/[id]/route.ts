// app/api/evaluations/prompts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Create Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function PUT(
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

    const { id: promptId } = await params
    const body = await request.json()
    const { 
      project_id,
      name, 
      description, 
      evaluation_type, 
      prompt_template,
      llm_provider,
      model,
      api_url,
      api_key,
      scoring_output_type,
      temperature,
      max_tokens,
      expected_output_format,
      scoring_criteria
    } = body

    // Validate required fields
    if (!project_id || !name || !prompt_template || !llm_provider || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: project_id, name, prompt_template, llm_provider, model' },
        { status: 400 }
      )
    }

    // First, check if the prompt exists and belongs to the user
    const { data: existingPrompt, error: fetchError } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('id, created_by')
      .eq('id', promptId)
      .single()

    if (fetchError || !existingPrompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }

    // Check if user has permission to edit this prompt
    if (existingPrompt.created_by !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: You can only edit prompts you created' },
        { status: 403 }
      )
    }

    // Update the evaluation prompt record
    const { data, error } = await supabase
      .from('pype_voice_evaluation_prompts')
      .update({
        project_id,
        name: name.trim(),
        description: description?.trim() || '',
        evaluation_type: evaluation_type || 'custom',
        prompt_template,
        llm_provider,
        model,
        api_url: api_url || '',
        api_key: api_key || '', // Note: In production, encrypt this
        scoring_output_type: scoring_output_type || 'float',
        temperature: temperature || 0.0,
        max_tokens: max_tokens || 1000,
        expected_output_format: expected_output_format || {},
        scoring_criteria: scoring_criteria || {},
        updated_at: new Date().toISOString()
      })
      .eq('id', promptId)
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
        { error: 'Failed to update evaluation prompt', details: error.message },
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

export async function DELETE(
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

    const { id: promptId } = await params

    if (!promptId) {
      return NextResponse.json(
        { error: 'Prompt ID is required' },
        { status: 400 }
      )
    }

    // Check if prompt exists and belongs to user
    const { data: existingPrompt, error: fetchError } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('id, name')
      .eq('id', promptId)
      .single()

    if (fetchError || !existingPrompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }

    // Check if prompt is being used in any active jobs
    const { data: activeJobs, error: jobsError } = await supabase
      .from('pype_voice_evaluation_jobs')
      .select('id, name, prompt_ids')
      .in('status', ['pending', 'running'])

    if (jobsError) {
      console.error('Error checking active jobs:', jobsError)
      return NextResponse.json(
        { error: 'Failed to check for active jobs' },
        { status: 500 }
      )
    }

    // Filter jobs that contain this prompt ID
    const jobsUsingPrompt = activeJobs?.filter(job => {
      try {
        const promptIds = job.prompt_ids
        return Array.isArray(promptIds) && promptIds.includes(promptId)
      } catch (error) {
        console.error('Error parsing prompt_ids for job:', job.id, error)
        return false
      }
    }) || []

    if (jobsUsingPrompt.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete prompt while it is being used in active evaluation jobs',
          details: `Prompt is used in ${jobsUsingPrompt.length} active job(s): ${jobsUsingPrompt.map(j => j.name).join(', ')}`
        },
        { status: 409 }
      )
    }

    // Delete the prompt
    const { error: deleteError } = await supabase
      .from('pype_voice_evaluation_prompts')
      .delete()
      .eq('id', promptId)

    if (deleteError) {
      console.error('Database error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete prompt' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Prompt "${existingPrompt.name}" deleted successfully`
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

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

    const { id: promptId } = await params

    if (!promptId) {
      return NextResponse.json(
        { error: 'Prompt ID is required' },
        { status: 400 }
      )
    }

    // Get prompt details
    const { data: prompt, error } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('*')
      .eq('id', promptId)
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch prompt details' },
        { status: 500 }
      )
    }

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: prompt
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}