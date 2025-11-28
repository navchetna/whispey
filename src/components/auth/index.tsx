'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getUserBySession } from '@/lib/auth'

interface AuthWrapperProps {
  children: React.ReactNode
}

export default function AuthWrapper({ children }: AuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const checkAuthentication = async () => {
      // Skip auth check for public routes
      if (pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up')) {
        setIsAuthenticated(true)
        return
      }

      // Get session token from cookie
      const sessionToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('session_token='))
        ?.split('=')[1]

      if (!sessionToken) {
        setIsAuthenticated(false)
        router.replace('/sign-in')
        return
      }

      try {
        const user = await getUserBySession(sessionToken)
        if (user) {
          setIsAuthenticated(true)
        } else {
          setIsAuthenticated(false)
          // Clear invalid session token
          document.cookie = 'session_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
          router.replace('/sign-in')
        }
      } catch (error) {
        console.error('Authentication check failed:', error)
        setIsAuthenticated(false)
        router.replace('/sign-in')
      }
    }

    checkAuthentication()
  }, [pathname, router])

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  // Render children if authenticated or on public routes
  if (isAuthenticated) {
    return <>{children}</>
  }

  // Return null for unauthenticated users (they'll be redirected)
  return null
}