import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/postgres';
import { verifyToken } from '../../../../lib/auth';
import { FailureReportRequest } from '../../../../types/logs';

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-pype-token',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body: FailureReportRequest = await request.json();
    const {
      token,
      call_id,
      error_message,
      error_type,
      stack_trace,
      environment = 'development'
    } = body;

    if (!token || !call_id || !error_message) {
      return NextResponse.json(
        { success: false, error: 'Token, call_id, and error_message are required' },
        { status: 400 }
      );
    }

    // Verify token
    const tokenVerification = await verifyToken(token, environment);
    if (!tokenVerification.valid) {
      return NextResponse.json(
        { success: false, error: tokenVerification.error || 'Token verification failed' },
        { status: 401 }
      );
    }

    // Create failure report log
    const failureData = {
      call_id,
      call_ended_reason: 'failure',
      transcript_type: 'error',
      transcript_json: {
        error_message,
        error_type,
        stack_trace,
        timestamp: new Date().toISOString()
      },
      metadata: {
        type: 'failure_report',
        reported_at: new Date().toISOString()
      },
      environment,
      created_at: new Date().toISOString()
    };

    const insertResult = await query(
      `INSERT INTO pype_voice_call_logs 
       (call_id, call_ended_reason, transcript_type, transcript_json, metadata, environment, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING *`,
      [
        failureData.call_id,
        failureData.call_ended_reason,
        failureData.transcript_type,
        JSON.stringify(failureData.transcript_json),
        JSON.stringify(failureData.metadata),
        failureData.environment,
        failureData.created_at
      ]
    )

    if (insertResult.rows.length === 0) {
      console.error('Database insert error: No rows returned');
      return NextResponse.json(
        { success: false, error: 'Failed to save failure report' },
        { status: 500 }
      );
    }

    const insertedLog = insertResult.rows[0]

    return NextResponse.json({
      success: true,
      data: {
        message: 'Failure report saved successfully',
        log_id: insertedLog.id
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Send failure report error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}