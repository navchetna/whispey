// TEMPORARILY DISABLED - Complex query building needs migration
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    error: 'Evaluation traces temporarily disabled during PostgreSQL migration',
    message: 'This feature will be restored after completing the database migration'
  }, { status: 503 })
}
