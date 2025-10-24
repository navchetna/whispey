// app/api/evaluations/jobs/[id]/route.ts
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
    const { data: job, error } = await supabase
      .from('pype_voice_evaluation_jobs')
      .select('*')
      .eq('id', jobId)
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch job details' },
        { status: 500 }
      )
    }

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: job
    })

  } catch (error) {
    console.error('Unexpected error:', error)
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

    const { id: jobId } = await params

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    // Check if job exists and get its status
    const { data: existingJob, error: fetchError } = await supabase
      .from('pype_voice_evaluation_jobs')
      .select('id, name, status')
      .eq('id', jobId)
      .single()

    if (fetchError || !existingJob) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    // Prevent deletion of running jobs
    if (existingJob.status === 'running') {
      return NextResponse.json(
        { 
          error: 'Cannot delete running job',
          details: 'Please cancel the job before deleting it'
        },
        { status: 409 }
      )
    }

    // Delete associated evaluation results first (cascade delete)
    const { error: resultsDeleteError } = await supabase
      .from('pype_voice_evaluation_results')
      .delete()
      .eq('job_id', jobId)

    if (resultsDeleteError) {
      console.error('Error deleting evaluation results:', resultsDeleteError)
      // Continue with job deletion even if results deletion fails
    }

    // Delete the job
    const { error: deleteError } = await supabase
      .from('pype_voice_evaluation_jobs')
      .delete()
      .eq('id', jobId)

    if (deleteError) {
      console.error('Database error:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete job' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Job "${existingJob.name}" deleted successfully`
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}