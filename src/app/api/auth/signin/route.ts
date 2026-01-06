// src/app/api/auth/signin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// Generate a secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Find user
    const result = await query(
      `SELECT id, email, password_hash, first_name, last_name, is_active, is_admin
       FROM pype_voice_users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const user = result.rows[0]

    // Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact support.' },
        { status: 403 }
      )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Create a new session
    const sessionToken = generateSessionToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // Session expires in 7 days

    // Clean up old expired sessions for this user
    await query(
      `DELETE FROM pype_voice_user_sessions WHERE user_id = $1 AND expires_at < NOW()`,
      [user.id]
    )

    // Insert new session
    await query(
      `INSERT INTO pype_voice_user_sessions (user_id, session_token, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, sessionToken, expiresAt.toISOString()]
    )

    // Create response with user data
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin
      }
    }, { status: 200 })

    // Set session cookie (HTTP-only for security)
    response.cookies.set('whispey_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt
    })

    return response

  } catch (error) {
    console.error('Signin error:', error)
    console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
