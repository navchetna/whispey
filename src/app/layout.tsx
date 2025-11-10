// src/app/layout.tsx
import { type Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProviderWrapper } from '@/components/ThemeProviderWrapper'
import { FeatureAccessProvider } from './providers/FeatureAccessProvider'
import { QueryProvider } from './providers/QueryProvider'
import './globals.css'
import SidebarWrapper from '@/components/shared/SidebarWrapper'

// Force dynamic rendering for all routes to prevent build errors
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Whispey - Voice Agent Analytics Platform',
  description: 'A comprehensive on-premise observability platform for voice agent evaluation and analytics.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProviderWrapper
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <FeatureAccessProvider>
              <SidebarWrapper>
                {children}
              </SidebarWrapper>
            </FeatureAccessProvider>
          </QueryProvider>
        </ThemeProviderWrapper>
      </body>
    </html>
  )
}