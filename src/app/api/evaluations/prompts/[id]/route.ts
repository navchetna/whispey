// app/api/evaluations/prompts/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'

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
      success_criteria,
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
    const existingResult = await query(
      'SELECT id, created_by FROM pype_voice_evaluation_prompts WHERE id = $1',
      [promptId]
    )

    if (existingResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }

    const existingPrompt = existingResult.rows[0]

    // Check if user has permission to edit this prompt
    if (existingPrompt.created_by !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: You can only edit prompts you created' },
        { status: 403 }
      )
    }

    // Update the evaluation prompt record
    const updateResult = await query(
      `UPDATE pype_voice_evaluation_prompts SET
        project_id = $1, name = $2, description = $3, evaluation_type = $4,
        prompt_template = $5, llm_provider = $6, model = $7, api_url = $8,
        api_key = $9, scoring_output_type = $10, success_criteria = $11,
        temperature = $12, max_tokens = $13, expected_output_format = $14,
        scoring_criteria = $15, updated_at = $16
       WHERE id = $17
       RETURNING *`,
      [
        project_id,
        name.trim(),
        description?.trim() || '',
        evaluation_type || 'custom',
        prompt_template,
        llm_provider,
        model,
        api_url || '',
        api_key || '',
        scoring_output_type || 'float',
        success_criteria || 'higher_is_better',
        temperature || 0.0,
        max_tokens || 1000,
        JSON.stringify(expected_output_format || {}),
        JSON.stringify(scoring_criteria || {}),
        new Date().toISOString(),
        promptId
      ]
    )

    if (updateResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update evaluation prompt' },
        { status: 500 }
      )
    }

    const data = updateResult.rows[0]

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
    const promptCheckResult = await query(
      'SELECT id, name FROM pype_voice_evaluation_prompts WHERE id = $1',
      [promptId]
    )

    if (promptCheckResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }

    const existingPrompt = promptCheckResult.rows[0]

    // Check if prompt is being used in any active jobs
    const activeJobsResult = await query(
      `SELECT id, name, prompt_ids FROM pype_voice_evaluation_jobs 
       WHERE status = ANY($1::text[])`,
      [['pending', 'running']]
    )

    // Filter jobs that contain this prompt ID
    const jobsUsingPrompt = activeJobsResult.rows.filter(job => {
      try {
        const promptIds = job.prompt_ids
        return Array.isArray(promptIds) && promptIds.includes(promptId)
      } catch (error) {
        console.error('Error parsing prompt_ids for job:', job.id, error)
        return false
      }
    })

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
    await query(
      'DELETE FROM pype_voice_evaluation_prompts WHERE id = $1',
      [promptId]
    )

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
    const promptResult = await query(
      'SELECT * FROM pype_voice_evaluation_prompts WHERE id = $1',
      [promptId]
    )

    if (promptResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Prompt not found' },
        { status: 404 }
      )
    }

    const prompt = promptResult.rows[0]

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