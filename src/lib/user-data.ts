import 'server-only'

// lib/user-data.ts
import { DatabaseService } from '@/lib/database'
import { auth, currentUser } from '@/lib/auth-server'
import { query } from '@/lib/postgres'

export interface PyveVoiceUser {
  id?: number
  clerk_id: string
  email: string
  first_name: string | null
  last_name: string | null
  profile_image_url: string | null
  created_at?: string
  updated_at?: string
}

// Server-side function to get current user's data from your database
export async function getCurrentUserProfile(): Promise<{
  data: PyveVoiceUser | null
  error: string | null
}> {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return { data: null, error: 'Not authenticated' }
    }
    
    const result = await query(
      'SELECT * FROM pype_voice_users WHERE clerk_id = $1 LIMIT 1',
      [userId]
    )
      
    if (result.rows.length === 0) {
      return { data: null, error: 'User not found' }
    }
    
    return { data: result.rows[0] as PyveVoiceUser, error: null }
  } catch (error) {
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

// Server-side function to get current user from Clerk
export async function getCurrentClerkUser() {
  try {
    const user = await currentUser()
    return user
  } catch (error) {
    console.error('Error fetching current user:', error)
    return null
  }
}

// Client-side hook for React components
export function useUserData() {
  // This would be used in client components
  // Implementation depends on your specific needs
}