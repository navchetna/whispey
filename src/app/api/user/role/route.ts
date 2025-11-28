import { NextRequest, NextResponse } from 'next/server'
import { getUserProjectRole } from '@/services/getUserRole'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const projectId = searchParams.get('projectId')

    if (!email || !projectId) {
      return NextResponse.json(
        { error: 'Email and projectId are required' },
        { status: 400 }
      )
    }

    const result = await getUserProjectRole(email, projectId)
    
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('Error fetching user role:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
