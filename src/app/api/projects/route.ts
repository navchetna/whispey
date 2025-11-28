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
      token_hash: hashedToken
    }

    // Start a transaction-like approach
    // For on-premise deployment, owner_user_id can be NULL or we auto-generate it
    const projectResult = await query(
      `INSERT INTO pype_voice_projects 
        (name, description, environment, is_active, retry_configuration, token_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        projectData.name,
        projectData.description,
        projectData.environment,
        projectData.is_active,
        JSON.stringify(projectData.retry_configuration),
        projectData.token_hash
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

    console.log(`Successfully created project "${project.name}" with ID ${project.id}`)

    // Store in new table as well (dual storage)
    try {
      const result = await createProjectApiKey(project.id, userId, apiToken)
      if (result.success) {
        console.log(`✅ API key also stored in new table with ID: ${result.id}`)
      } else {
        console.error('⚠️ Failed to store in new table:', result.error)
        // Don't fail the whole operation, just log the warning
      }
    } catch (error) {
      console.error('⚠️ Error storing API key in new table:', error)
      // Continue - the old system still works
    }

    // For on-premise deployment, we don't use email_project_mapping
    // All users have admin access to all projects
    console.log(`Project ${project.id} created successfully - on-premise mode`)

    // Return project data with the unhashed token
    const response = {
      ...project,
      api_token: apiToken // Include the unhashed token for display
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

    // For on-premise deployment, we don't use email-project mapping
    // Just return all active projects

    // If specific project ID requested
    if (projectId) {
      const result = await query(
        `SELECT id, name, description, environment, is_active, owner_user_id, created_at
         FROM pype_voice_projects
         WHERE id = $1 AND is_active = true`,
        [projectId]
      )
      
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      
      return NextResponse.json({ data: result.rows }, { status: 200 })
    }

    // Fetch all active projects
    const limitClause = limit ? `LIMIT ${limit}` : ''
    const offsetClause = offset > 0 ? `OFFSET ${offset}` : ''
    
    const projectsResult = await query(
      `SELECT id, name, description, environment, is_active, owner_user_id, created_at
       FROM pype_voice_projects
       WHERE is_active = true
       ORDER BY created_at DESC
       ${limitClause} ${offsetClause}`,
      []
    )

    // Return all active projects with admin role for on-premise
    const activeProjects = projectsResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      environment: row.environment,
      is_active: row.is_active,
      owner_user_id: row.owner_user_id,
      created_at: row.created_at,
      user_role: 'admin' // For on-premise, all users are admin
    }))

    return NextResponse.json({ data: activeProjects, count: activeProjects.length }, { status: 200 })

  } catch (error) {
    console.error('Unexpected error fetching projects:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}