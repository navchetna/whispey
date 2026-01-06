// Authentication helper for API routes - Session-based authentication
import { cookies } from 'next/headers'
import { query } from '@/lib/postgres'

interface AuthResult {
  userId: string | null
  user: {
    id: string
    email: string
    firstName?: string
    lastName?: string
    isAdmin?: boolean
  } | null
}

// Validate session and return user info
async function validateSession(): Promise<AuthResult> {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('whispey_session')?.value

    if (!sessionToken) {
      return { userId: null, user: null }
    }

    // Validate session token against database
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin
       FROM pype_voice_user_sessions s
       JOIN pype_voice_users u ON s.user_id = u.id
       WHERE s.session_token = $1 
       AND s.expires_at > NOW()
       AND u.is_active = true`,
      [sessionToken]
    )

    if (result.rows.length === 0) {
      return { userId: null, user: null }
    }

    const user = result.rows[0]
    return {
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin
      }
    }
  } catch (error) {
    console.error('Session validation error:', error)
    return { userId: null, user: null }
  }
}

// Main auth function - validates session and returns auth info
export async function auth(): Promise<AuthResult> {
  return await validateSession()
}

// Get current user details
export async function currentUser() {
  const authResult = await validateSession()
  
  if (!authResult.user) {
    return null
  }

  return {
    id: authResult.user.id,
    email: authResult.user.email,
    firstName: authResult.user.firstName,
    lastName: authResult.user.lastName,
    isAdmin: authResult.user.isAdmin
  }
}

// Helper to get user ID from auth
export async function getUserId(): Promise<string | null> {
  const authResult = await auth()
  return authResult.userId
}

// Helper to get user email from auth
export async function getUserEmail(): Promise<string | null> {
  const authResult = await auth()
  return authResult.user?.email || null
}