// app/api/evaluations/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
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
    const jobCheckResult = await query(
      'SELECT id, name, status FROM pype_voice_evaluation_jobs WHERE id = $1',
      [jobId]
    )

    if (jobCheckResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    const existingJob = jobCheckResult.rows[0]

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
    await query(
      'DELETE FROM pype_voice_evaluation_results WHERE job_id = $1',
      [jobId]
    )

    // Delete the job
    await query(
      'DELETE FROM pype_voice_evaluation_jobs WHERE id = $1',
      [jobId]
    )

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