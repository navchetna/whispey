// src/app/api/auth/signout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/postgres'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('whispey_session')?.value

    // Delete session from database if it exists
    if (sessionToken) {
      await query(
        `DELETE FROM pype_voice_user_sessions WHERE session_token = $1`,
        [sessionToken]
      )
    }

    // Create response
    const response = NextResponse.json({
      message: 'Signed out successfully'
    }, { status: 200 })

    // Clear the session cookie
    response.cookies.delete('whispey_session')

    return response
  } catch (error) {
    console.error('Signout error:', error)
    
    // Even if there's an error, still clear the cookie
    const response = NextResponse.json({
      message: 'Signed out successfully'
    }, { status: 200 })
    response.cookies.delete('whispey_session')
    
    return response
  }
}
