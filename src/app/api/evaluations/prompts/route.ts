// app/api/evaluations/prompts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth, currentUser } from '@clerk/nextjs/server'

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

    // Create the evaluation prompt record
    const { data, error } = await supabase
      .from('pype_voice_evaluation_prompts')
      .insert({
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
        success_criteria: success_criteria || 'higher_is_better',
        temperature: temperature || 0.0,
        max_tokens: max_tokens || 1000,
        expected_output_format: expected_output_format || {},
        scoring_criteria: scoring_criteria || {},
        is_active: true,
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
        { error: 'Failed to create evaluation prompt', details: error.message },
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

    if (!projectId) {
      return NextResponse.json(
        { error: 'project_id parameter is required' },
        { status: 400 }
      )
    }

    // Fetch evaluation prompts for the project
    const { data, error } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

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
        { error: 'Failed to fetch evaluation prompts', details: error.message },
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