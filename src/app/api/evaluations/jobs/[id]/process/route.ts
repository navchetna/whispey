// app/api/evaluations/jobs/[id]/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { processEvaluationJobById } from '@/lib/evaluation/processor'

export async function POST(
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

    // Start processing the job
    // In production, this should be handled by a job queue
    try {
      // Process in background
      processEvaluationJobById(jobId).catch(error => {
        console.error('Job processing failed:', error)
      })

      return NextResponse.json({
        success: true,
        message: 'Job processing started'
      })
    } catch (error) {
      console.error('Failed to start job processing:', error)
      return NextResponse.json(
        { error: 'Failed to start job processing' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}