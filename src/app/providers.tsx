// app/providers.tsx
'use client'

// Removed PostHog integration for on-premise deployment
// This file is kept for compatibility but PostHog functionality is disabled

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Simply pass through children without PostHog tracking
  return <>{children}</>
}