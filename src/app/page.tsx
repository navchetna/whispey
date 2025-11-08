// src/app/page.tsx
'use client'

import { useLocalUser } from '../lib/local-auth'
import ProjectSelection from '../components/projects/ProjectSelection'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import LocalAuth from '../components/LocalAuth'

export default function Home() {
  const { isSignedIn, isLoaded } = useLocalUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Don't redirect, just show login form
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (!isSignedIn) {
    return <LocalAuth />
  }

  return <ProjectSelection isAuthLoaded={isLoaded} />
}