'use client'

import { ThemeProvider } from 'next-themes'
import { ComponentProps } from 'react'

export function ThemeProviderWrapper({ children, ...props }: ComponentProps<typeof ThemeProvider>) {
  return (
    <ThemeProvider {...props}>
      {children}
    </ThemeProvider>
  )
}
