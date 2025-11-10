// src/app/layout.tsx
import { type Metadata } from 'next'
import { ThemeProviderWrapper } from '@/components/ThemeProviderWrapper'
import { FeatureAccessProvider } from './providers/FeatureAccessProvider'
import { QueryProvider } from './providers/QueryProvider'
import './globals.css'
import SidebarWrapper from '@/components/shared/SidebarWrapper'

// Force dynamic rendering for all routes to prevent build errors
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

// Use system fonts instead of Google Fonts to avoid network issues during build
const fontVariables = '--font-geist-sans --font-geist-mono'

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
        className="antialiased bg-background text-foreground font-sans"
        suppressHydrationWarning
        style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
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