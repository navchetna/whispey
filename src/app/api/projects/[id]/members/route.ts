// src/app/api/projects/[id]/members/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth, currentUser } from "@/lib/auth-server"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth()
    const user = await currentUser()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId } = await params // UUID, no parseInt()

    console.log("projectId", projectId)

    const body = await request.json()
    const { email, role = 'member' } = body

    if (!email || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const userEmail = user?.emailAddresses?.[0]?.emailAddress

    console.log("userEmail", userEmail)
    
    // Check current user access to project - handle case where no rows exist
    const userProjectResult = await query(
      `SELECT role FROM pype_voice_email_project_mapping 
       WHERE email = $1 AND project_id = $2`,
      [userEmail, projectId]
    )

    let hasAdminAccess = false

    console.log("userProject", userProjectResult.rows[0])

    if (userProjectResult.rows.length > 0 && 
        ['admin', 'owner'].includes(userProjectResult.rows[0].role)) {
      hasAdminAccess = true
    } 

    if (!hasAdminAccess) {
      return NextResponse.json(
        { error: 'Admin access required to add members' },
        { status: 403 }
      )
    }

    // Check if already added by email
    const existingMappingResult = await query(
      `SELECT id FROM pype_voice_email_project_mapping 
       WHERE email = $1 AND project_id = $2`,
      [email.trim(), projectId]
    )

    if (existingMappingResult.rows.length > 0) {
      return NextResponse.json({ error: 'Email already added to project' }, { status: 400 })
    }

    // Check if user already exists in users table
    const existingUserResult = await query(
      `SELECT clerk_id FROM pype_voice_users WHERE email = $1`,
      [email.trim()]
    )

    const existingUser = existingUserResult.rows[0]
    const permissions = getPermissionsByRole(role)

    if (existingUser?.clerk_id) {
      // If the user exists, check if they're already mapped
      const existingUserProjectResult = await query(
        `SELECT id FROM pype_voice_email_project_mapping 
         WHERE clerk_id = $1 AND project_id = $2`,
        [existingUser.clerk_id, projectId]
      )

      if (existingUserProjectResult.rows.length > 0) {
        return NextResponse.json(
          { error: 'User is already a member of this project' },
          { status: 400 }
        )
      }

      // Insert mapping using clerk_id
      const newMappingResult = await query(
        `INSERT INTO pype_voice_email_project_mapping 
         (clerk_id, email, project_id, role, permissions, added_by_clerk_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [existingUser.clerk_id, email.trim(), projectId, role, JSON.stringify(permissions), userId, true]
      )

      if (newMappingResult.rows.length === 0) {
        console.error('Error inserting new mapping: No rows returned')
        return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
      }

      return NextResponse.json({ 
        message: 'User added to project', 
        member: newMappingResult.rows[0] 
      }, { status: 201 })
    } else {
      // Create pending email-based invite
      const mappingResult = await query(
        `INSERT INTO pype_voice_email_project_mapping 
         (email, project_id, role, permissions, added_by_clerk_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [email.trim(), projectId, role, JSON.stringify(permissions), userId, true]
      )

      if (mappingResult.rows.length === 0) {
        console.error('Insert error: No rows returned')
        return NextResponse.json({ error: 'Member must be logged in.' }, { status: 500 })
      }

      return NextResponse.json(
        {
          message: 'Email added to project successfully. User will be added when they sign up.',
          member: mappingResult.rows[0],
          type: 'email_mapping'
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

    const { id: projectId } = await params // Properly await params

    // Use maybeSingle() instead of single() to handle case where user has no access
    const accessCheckResult = await query(
      `SELECT id FROM pype_voice_email_project_mapping 
       WHERE clerk_id = $1 AND project_id = $2 AND is_active = true`,
      [userId, projectId]
    )

    if (accessCheckResult.rows.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const membersResult = await query(
      `SELECT 
        m.id, m.clerk_id, m.email, m.role, m.permissions, 
        m.is_active, m.added_by_clerk_id,
        json_build_object(
          'clerk_id', u.clerk_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'profile_image_url', u.profile_image_url
        ) as user
       FROM pype_voice_email_project_mapping m
       LEFT JOIN pype_voice_users u ON m.clerk_id = u.clerk_id
       WHERE m.project_id = $1 AND m.is_active = true`,
      [projectId]
    )

    console.log("members", membersResult.rows)

    return NextResponse.json({ members: membersResult.rows || [] }, { status: 200 })
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