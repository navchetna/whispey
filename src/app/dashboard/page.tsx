'use client'

import { useLocalUser } from '@/lib/local-auth'
import ProjectSelection from "@/components/projects/ProjectSelection"
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Dashboard() {
    const { isSignedIn, isLoaded } = useLocalUser()
    const router = useRouter()

    useEffect(() => {
        if (isLoaded && !isSignedIn) {
            router.push('/')
        }
    }, [isLoaded, isSignedIn, router])

    if (!isLoaded) {
        return <div className="min-h-screen flex items-center justify-center">Loading...</div>
    }

    if (!isSignedIn) {
        return null // Will redirect via useEffect
    }

    return <ProjectSelection isAuthLoaded={isLoaded} />
}