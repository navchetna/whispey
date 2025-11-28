// src/app/api/auth/signout/route.ts
import { NextResponse } from 'next/server'

export async function POST() {
  // For client-side local storage authentication,
  // the actual signout happens on the client
  // This endpoint exists for consistency and future session management
  
  return NextResponse.json({
    message: 'Signed out successfully'
  }, { status: 200 })
}
