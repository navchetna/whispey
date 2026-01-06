// src/app/api/auth/signup/route.ts
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
    const { email, password, firstName, lastName } = body

    // Validation
    if (!email || !email.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM pype_voice_users WHERE email = $1',
      [email.trim().toLowerCase()]
    )

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Create user
    const result = await query(
      `INSERT INTO pype_voice_users 
        (email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, false, NOW(), NOW())
       RETURNING id, email, first_name, last_name, is_admin`,
      [email.trim().toLowerCase(), passwordHash, firstName?.trim() || null, lastName?.trim() || null]
    )

    const user = result.rows[0]

    // Create a session for the new user (so they're immediately logged in)
    const sessionToken = generateSessionToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // Session expires in 7 days

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
    }, { status: 201 })

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
    console.error('Signup error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
