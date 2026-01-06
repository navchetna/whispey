// src/app/api/projects/[id]/members/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from "@/lib/auth-server"
import { checkProjectAccess } from "@/lib/project-access"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params

    const body = await request.json()
    const { email, role = 'member' } = body

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    // Check if user has admin access to this project
    const access = await checkProjectAccess(projectId, userId, ['admin'])
    if (!access.hasAccess) {
      return NextResponse.json(
        { error: 'Admin access required to add members' },
        { status: 403 }
      )
    }

    // Check if user already exists in users table
    const existingUserResult = await query(
      `SELECT id, email FROM pype_voice_users WHERE email = $1`,
      [email.trim().toLowerCase()]
    )

    const existingUser = existingUserResult.rows[0]
    const permissions = getPermissionsByRole(role)

    if (existingUser) {
      // Check if user is already a member of this project
      const existingMappingResult = await query(
        `SELECT id FROM pype_voice_project_user_mapping 
         WHERE user_id = $1 AND project_id = $2`,
        [existingUser.id, projectId]
      )

      if (existingMappingResult.rows.length > 0) {
        return NextResponse.json(
          { error: 'User is already a member of this project' },
          { status: 400 }
        )
      }

      // Add user to project
      const newMappingResult = await query(
        `INSERT INTO pype_voice_project_user_mapping 
         (user_id, project_id, role, permissions, added_by_user_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [existingUser.id, projectId, role, JSON.stringify(permissions), userId]
      )

      if (newMappingResult.rows.length === 0) {
        return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
      }

      return NextResponse.json({ 
        message: 'User added to project', 
        member: newMappingResult.rows[0] 
      }, { status: 201 })
    } else {
      // User doesn't exist - create email-based invite for when they sign up
      const existingEmailMapping = await query(
        `SELECT id FROM pype_voice_email_project_mapping 
         WHERE email = $1 AND project_id = $2`,
        [email.trim().toLowerCase(), projectId]
      )

      if (existingEmailMapping.rows.length > 0) {
        return NextResponse.json({ error: 'Email already invited to project' }, { status: 400 })
      }

      const mappingResult = await query(
        `INSERT INTO pype_voice_email_project_mapping 
         (email, project_id, role, permissions, added_by_clerk_id, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING *`,
        [email.trim().toLowerCase(), projectId, role, JSON.stringify(permissions), userId]
      )

      if (mappingResult.rows.length === 0) {
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
      }

      return NextResponse.json(
        {
          message: 'Email invited to project. User will be added when they sign up.',
          member: mappingResult.rows[0],
          type: 'email_invite'
        },
        { status: 201 }
      )
    }
  } catch (error) {
    console.error('Unexpected error adding member:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params

    // Check if user has access to this project
    const access = await checkProjectAccess(projectId, userId)
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get members from project_user_mapping
    const membersResult = await query(
      `SELECT 
        m.id, m.user_id, m.role, m.permissions, m.is_active, m.added_by_user_id,
        json_build_object(
          'id', u.id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'profile_image_url', u.profile_image_url
        ) as user
       FROM pype_voice_project_user_mapping m
       JOIN pype_voice_users u ON m.user_id = u.id
       WHERE m.project_id = $1 AND m.is_active = true`,
      [projectId]
    )

    // Also get pending email invites
    const pendingInvites = await query(
      `SELECT id, email, role, permissions, is_active
       FROM pype_voice_email_project_mapping
       WHERE project_id = $1 AND is_active = true AND clerk_id IS NULL`,
      [projectId]
    )

    return NextResponse.json({ 
      members: membersResult.rows || [],
      pendingInvites: pendingInvites.rows || []
    }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error fetching members:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getPermissionsByRole(role: string): Record<string, boolean> {
  const rolePermissions: Record<string, Record<string, boolean>> = {
    viewer: { read: true, write: false, delete: false, admin: false },
    member: { read: true, write: true, delete: false, admin: false },
    admin: { read: true, write: true, delete: true, admin: false },
    owner: { read: true, write: true, delete: true, admin: true },
  }

  return rolePermissions[role] || rolePermissions['member']
}