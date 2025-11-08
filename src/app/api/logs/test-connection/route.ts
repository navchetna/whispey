import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/postgres';

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    // Test PostgreSQL connection
    const result = await query('SELECT COUNT(*) FROM pype_voice_projects LIMIT 1')

    if (!result || result.rows.length === 0) {
      console.error('PostgreSQL connection error: No response')
      return NextResponse.json(
        { success: false, error: 'Failed to connect to PostgreSQL: No response' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: 'Connection successful',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'development'
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Test connection error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}