// app/api/evaluations/test/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { processEvaluationJobById } from '@/lib/evaluation/processor'

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
    const { jobId } = body

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    console.log(`[Test Evaluation] Starting test evaluation for job ${jobId}`)

    try {
      // Process the job with enhanced logging
      const result = await processEvaluationJobById(jobId)
      
      return NextResponse.json({
        success: true,
        message: 'Test evaluation completed',
        result: result
      })
    } catch (processingError) {
      console.error(`[Test Evaluation] Processing error:`, processingError)
      
      return NextResponse.json({
        success: false,
        error: 'Processing failed',
        details: processingError instanceof Error ? processingError.message : 'Unknown processing error',
        stack: processingError instanceof Error ? processingError.stack : undefined
      }, { status: 500 })
    }

  } catch (error) {
    console.error('[Test Evaluation] Endpoint error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}