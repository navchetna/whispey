import { NextResponse } from 'next/server'

export async function GET() {
  try {
    return NextResponse.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'whispey-frontend',
      environment: process.env.NODE_ENV || 'development'
    }, { status: 200 })
  } catch (error) {
    return NextResponse.json({ 
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'whispey-frontend',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 503 })
  }
}
