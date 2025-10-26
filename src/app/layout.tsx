// src/app/layout.tsx
import { type Metadata } from 'next'
import {
  ClerkProvider,
  SignedIn,
  SignedOut,
} from '@clerk/nextjs'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import Script from 'next/script'
import { PostHogProvider } from './providers'
import { FeatureAccessProvider } from './providers/FeatureAccessProvider'
import { QueryProvider } from './providers/QueryProvider'
import './globals.css'
import SidebarWrapper from '@/components/shared/SidebarWrapper'
import SignOutHandler from '@/components/auth'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Voice Evals Observability - Professional Voice Agent Analytics',
  description: 'A comprehensive observability platform for voice agent evaluation and analytics.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const sonicLinkerOrgId = process.env.NEXT_PUBLIC_SONIC_LINKER_ORG_ID

  return (
    <ClerkProvider
      signInUrl='/sign-in'
      appearance={{
        variables: {
          colorPrimary: "oklch(0.5 0.15 210)", // Custom blue to match our theme
          colorTextSecondary: "oklch(0.5 0.02 240)",
        }
      }}
    >
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          {/* Sonic Linker AI Traffic Monitoring - Only loads if org ID is provided */}
          {sonicLinkerOrgId && (
            <Script
              src={`https://anlt.soniclinker.com/collect.js?org_id=${sonicLinkerOrgId}`}
              strategy="afterInteractive"
              async
            />
          )}

          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <PostHogProvider>
                <FeatureAccessProvider>
                  <main>
                    <SignedOut>
                      <div className="min-h-screen">
                        {children}
                      </div>
                    </SignedOut>n
                    <SignedIn>
                      <SignOutHandler>
                        <SidebarWrapper>
                          {children}
                        </SidebarWrapper>
                      </SignOutHandler>
                    </SignedIn>
                  </main>
                </FeatureAccessProvider>
              </PostHogProvider>
            </QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  ) 
}