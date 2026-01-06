// app/api/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth, currentUser } from '@/lib/auth-server'
import crypto from 'crypto'
import { createProjectApiKey } from '@/lib/api-key-management'

// Generate a secure API token
function generateApiToken(): string {
  // Generate a random token with prefix for easy identification
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return `pype_${randomBytes}`
}

// Hash a token using SHA-256
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get current user details
    const user = await currentUser()
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, description } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Project name is required' },
        { status: 400 }
      )
    }

    // Generate API token
    const apiToken = generateApiToken()
    const hashedToken = hashToken(apiToken)

    const projectData = {
      name: name.trim(),
      description: description?.trim() || null,
      environment: 'dev', // Default environment
      is_active: true,
      retry_configuration: {},
      token_hash: hashedToken,
      owner_user_id: userId // Set the owner to the creating user
    }

    // Create the project with owner_user_id
    const projectResult = await query(
      `INSERT INTO pype_voice_projects 
        (name, description, environment, is_active, retry_configuration, token_hash, owner_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        projectData.name,
        projectData.description,
        projectData.environment,
        projectData.is_active,
        JSON.stringify(projectData.retry_configuration),
        projectData.token_hash,
        projectData.owner_user_id
      ]
    )

    if (projectResult.rows.length === 0) {
      console.error('Error creating project')
      return NextResponse.json(
        { error: 'Failed to create project' },
        { status: 500 }
      )
    }

    const project = projectResult.rows[0]

    console.log(`Successfully created project "${project.name}" with ID ${project.id} for user ${userId}`)

    // Create project-user mapping with admin role for the creator
    try {
      await query(
        `INSERT INTO pype_voice_project_user_mapping 
          (user_id, project_id, role, added_by_user_id, is_active)
         VALUES ($1, $2, 'admin', $1, true)
         ON CONFLICT (user_id, project_id) DO UPDATE SET role = 'admin', is_active = true`,
        [userId, project.id]
      )
      console.log(`✅ Created project-user mapping for user ${userId} on project ${project.id}`)
    } catch (mappingError) {
      console.error('⚠️ Error creating project-user mapping:', mappingError)
      // Don't fail the whole operation, the owner_user_id serves as a fallback
    }

    // Store API key
    try {
      const result = await createProjectApiKey(project.id, userId, apiToken)
      if (result.success) {
        console.log(`✅ API key stored with ID: ${result.id}`)
      } else {
        console.error('⚠️ Failed to store API key:', result.error)
      }
    } catch (error) {
      console.error('⚠️ Error storing API key:', error)
    }

    // Return project data with the unhashed token
    const response = {
      ...project,
      api_token: apiToken, // Include the unhashed token for display
      user_role: 'admin'
    }

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('Unexpected error creating project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('id')
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin (admins can see all projects)
    const user = await currentUser()
    const isAdmin = user?.isAdmin || false

    // If specific project ID requested
    if (projectId) {
      // Check if user has access to this project
      const accessCheck = isAdmin ? 
        await query(
          `SELECT p.id, p.name, p.description, p.environment, p.is_active, p.owner_user_id, p.created_at,
                  COALESCE(m.role, CASE WHEN p.owner_user_id = $2 THEN 'admin' ELSE NULL END) as user_role
           FROM pype_voice_projects p
           LEFT JOIN pype_voice_project_user_mapping m ON p.id = m.project_id AND m.user_id = $2 AND m.is_active = true
           WHERE p.id = $1 AND p.is_active = true`,
          [projectId, userId]
        ) :
        await query(
          `SELECT p.id, p.name, p.description, p.environment, p.is_active, p.owner_user_id, p.created_at,
                  COALESCE(m.role, 'admin') as user_role
           FROM pype_voice_projects p
           LEFT JOIN pype_voice_project_user_mapping m ON p.id = m.project_id AND m.user_id = $2 AND m.is_active = true
           WHERE p.id = $1 AND p.is_active = true
           AND (p.owner_user_id = $2 OR m.user_id = $2)`,
          [projectId, userId]
        )
      
      if (accessCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 })
      }
      
      return NextResponse.json({ data: accessCheck.rows }, { status: 200 })
    }

    // Build query to fetch projects the user has access to
    const limitClause = limit ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''
    
    let projectsResult
    
    if (isAdmin) {
      // Admin users can see all projects
      projectsResult = await query(
        `SELECT DISTINCT p.id, p.name, p.description, p.environment, p.is_active, p.owner_user_id, p.created_at,
                COALESCE(m.role, CASE WHEN p.owner_user_id = $1 THEN 'admin' ELSE 'viewer' END) as user_role
         FROM pype_voice_projects p
         LEFT JOIN pype_voice_project_user_mapping m ON p.id = m.project_id AND m.user_id = $1 AND m.is_active = true
         WHERE p.is_active = true
         ORDER BY p.created_at DESC
         ${limitClause} ${offsetClause}`,
        [userId]
      )
    } else {
      // Regular users can only see projects they own or have been given access to
      projectsResult = await query(
        `SELECT DISTINCT p.id, p.name, p.description, p.environment, p.is_active, p.owner_user_id, p.created_at,
                COALESCE(m.role, 'admin') as user_role
         FROM pype_voice_projects p
         LEFT JOIN pype_voice_project_user_mapping m ON p.id = m.project_id AND m.user_id = $1 AND m.is_active = true
         WHERE p.is_active = true
         AND (p.owner_user_id = $1 OR m.user_id = $1)
         ORDER BY p.created_at DESC
         ${limitClause} ${offsetClause}`,
        [userId]
      )
    }

    const activeProjects = projectsResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      environment: row.environment,
      is_active: row.is_active,
      owner_user_id: row.owner_user_id,
      created_at: row.created_at,
      user_role: row.user_role
    }))

    return NextResponse.json({ data: activeProjects, count: activeProjects.length }, { status: 200 })

  } catch (error) {
    console.error('Unexpected error fetching projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}