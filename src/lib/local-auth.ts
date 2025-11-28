import { useState, useEffect } from 'react'

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

// Client-side auth helpers
export function getLocalUser(): User | null {
  if (typeof window === 'undefined') return null
  
  const user = localStorage.getItem('whispey_user')
  return user ? JSON.parse(user) : null
}

export function setLocalUser(user: User): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('whispey_user', JSON.stringify(user))
}

export function clearLocalUser(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('whispey_user')
}

// API-based authentication (secure)
export async function signIn(email: string, password: string): Promise<{ success: boolean; user?: User; error?: string; userNotFound?: boolean }> {
  try {
    const response = await fetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()

    if (response.ok && data.user) {
      setLocalUser(data.user)
      return { success: true, user: data.user }
    }

    // Check if user not found (404 or specific error message)
    const isUserNotFound = response.status === 404 || 
                          (data.error && data.error.toLowerCase().includes('user not found'))

    return { 
      success: false, 
      error: data.error || 'Authentication failed',
      userNotFound: isUserNotFound
    }
  } catch (error) {
    return { success: false, error: 'Network error' }
  }
}

export async function signUp(email: string, password: string, firstName?: string, lastName?: string): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName })
    })

    const data = await response.json()

    if (response.ok && data.user) {
      setLocalUser(data.user)
      return { success: true, user: data.user }
    }

    return { success: false, error: data.error || 'Signup failed' }
  } catch (error) {
    return { success: false, error: 'Network error' }
  }
}

export async function signOut(): Promise<void> {
  // Clear localStorage immediately for fast UI response
  clearLocalUser()
  
  // Make API call in background (best effort, don't wait)
  try {
    fetch('/api/auth/signout', {
      method: 'POST'
    }).catch(() => {
      // Silently ignore API errors - user is already logged out locally
    })
  } catch (error) {
    console.error('Signout error:', error)
  }
}

// Custom hook to replace useUser from Clerk
export function useLocalUser() {
  const [mounted, setMounted] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  
  useEffect(() => {
    setMounted(true)
    setUser(getLocalUser())
  }, [])
  
  if (!mounted) {
    return { user: null, isSignedIn: false, isLoaded: false }
  }
  
  return {
    user,
    isSignedIn: !!user,
    isLoaded: true
  }
}

export type LocalUser = User
