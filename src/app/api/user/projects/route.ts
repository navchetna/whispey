// app/api/user/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth, currentUser } from '@/lib/auth-server'

function mapProject(
  project: any,
  role: string,
  permissions: any,
  joined_at: string,
  access_type: string
) {
  return {
    ...project,
    user_role: role,
    user_permissions: permissions,
    joined_at,
    access_type
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // For on-premise deployment, return all active projects with admin role
    const projectsResult = await query(
      `SELECT 
        id, name, description, environment, created_at, is_active, 
        token_hash, owner_user_id
       FROM pype_voice_projects
       WHERE is_active = true
       ORDER BY created_at DESC`,
      []
    )

    const projects = projectsResult.rows.map((project: any) => ({
      project,
      user_role: 'admin',
      user_permissions: {
        read: true,
        write: true,
        delete: true,
        admin: true
      },
      joined_at: project.created_at,
      access_type: 'on-premise',
      is_active: true
    }))

    // Sort by newest project created_at first
    projects.sort(
      (a: any, b: any) => new Date(b.project.created_at).getTime() - new Date(a.project.created_at).getTime()
    )

    return NextResponse.json(projects, { status: 200 })
  } catch (error) {
    console.error('Unexpected error fetching user projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
