// src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth, currentUser } from "@/lib/auth-server"
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const body = await request.json()
    const { action, name, description } = body

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Handle project name/description update
    if (action === 'update_project') {
      if (!name || !name.trim()) {
        return NextResponse.json(
          { error: 'Project name is required' },
          { status: 400 }
        )
      }

      // Update the project with new name and description
      const result = await query(
        `UPDATE pype_voice_projects 
         SET name = $1, description = $2, updated_at = $3 
         WHERE id = $4 
         RETURNING *`,
        [name.trim(), description?.trim() || null, new Date().toISOString(), projectId]
      )

      if (result.rows.length === 0) {
        console.error('Error updating project: No rows returned')
        return NextResponse.json(
          { error: 'Failed to update project' },
          { status: 500 }
        )
      }

      const data = result.rows[0]
      console.log(`Successfully updated project "${data.name}"`)
      return NextResponse.json(data, { status: 200 })
    }

    if (action === 'regenerate_token') {
      // Generate new API token
      const newApiToken = generateApiToken()
      const newHashedToken = hashToken(newApiToken)

      // Update the project with the new hashed token
      const result = await query(
        `UPDATE pype_voice_projects 
         SET token_hash = $1 
         WHERE id = $2 
         RETURNING *`,
        [newHashedToken, projectId]
      )

      if (result.rows.length === 0) {
        console.error('Error regenerating project token: No rows returned')
        return NextResponse.json(
          { error: 'Failed to regenerate token' },
          { status: 500 }
        )
      }

      const data = result.rows[0]

      // Also store/update in new table (dual storage for regeneration)
      try {
        // Get the user who is regenerating
        const { userId } = await auth()
        
        if (userId) {
          const result = await createProjectApiKey(projectId, userId, newApiToken)
          if (result.success) {
            console.log(`✅ Regenerated key also stored in new table with ID: ${result.id}`)
          } else {
            console.error('⚠️ Failed to store regenerated key in new table:', result.error)
          }
        } else {
          console.warn('⚠️ No user ID available for regenerated key storage in new table')
        }
      } catch (error) {
        console.error('⚠️ Error storing regenerated key in new table:', error)
        // Continue - the old system still works
      }

      // Return project data with the new unhashed token
      const response = {
        ...data,
        api_token: newApiToken // Include the unhashed token for display
      }

      console.log(`Successfully regenerated token for project "${data.name}"`)
      return NextResponse.json(response, { status: 200 })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    const body = await request.json()
    const { retry_configuration } = body

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Validate retry_configuration if provided
    if (retry_configuration) {
      const validCodes = ['408', '480', '486', '504', '600']
      for (const [code, minutes] of Object.entries(retry_configuration)) {
        if (!validCodes.includes(code)) {
          return NextResponse.json(
            { error: `Invalid SIP code: ${code}` },
            { status: 400 }
          )
        }
        if (typeof minutes !== 'number' || minutes < 1 || minutes > 1440) {
          return NextResponse.json(
            { error: `Invalid retry minutes for ${code}: must be between 1 and 1440` },
            { status: 400 }
          )
        }
      }
    }

    // Update the project with retry configuration
    const result = await query(
      `UPDATE pype_voice_projects 
       SET retry_configuration = $1 
       WHERE id = $2 
       RETURNING *`,
      [JSON.stringify(retry_configuration), projectId]
    )

    if (result.rows.length === 0) {
      console.error('Error updating project: No rows returned')
      return NextResponse.json(
        { error: 'Failed to update project' },
        { status: 500 }
      )
    }

    const data = result.rows[0]
    console.log(`Successfully updated retry configuration for project "${data.name}"`)
    return NextResponse.json(data, { status: 200 })

  } catch (error) {
    console.error('Unexpected error updating project:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Start cascade deletion process
    console.log(`Starting cascade delete for project: ${projectId}`)

    // 1. Get all agents for this project first
    const agentsResult = await query(
      'SELECT id FROM pype_voice_agents WHERE project_id = $1',
      [projectId]
    )

    const agentIds = agentsResult.rows.map((agent: { id: string }) => agent.id)
    console.log(`Found ${agentIds.length} agents to clean up`)

    // 2. Delete call logs for all agents in this project
    if (agentIds.length > 0) {
      const callLogsResult = await query(
        'DELETE FROM pype_voice_call_logs WHERE agent_id = ANY($1::uuid[])',
        [agentIds]
      )
      console.log('Successfully deleted call logs')

      // 3. Delete metrics logs (adjust based on your schema relationships)
      try {
        await query(
          'DELETE FROM pype_voice_metrics_logs WHERE session_id = ANY($1::uuid[])',
          [agentIds]
        )
        console.log('Successfully deleted metrics logs')
      } catch (metricsError) {
        console.warn('Warning: Could not delete metrics logs:', metricsError)
      }
    }

    console.log('Successfully deleted auth tokens')

    // 5. Delete all agents for this project
    await query(
      'DELETE FROM pype_voice_agents WHERE project_id = $1',
      [projectId]
    )
    console.log('Successfully deleted agents')

    // 6. Finally, delete the project itself (CASCADE will handle pype_voice_api_keys)
    const projectResult = await query(
      'DELETE FROM pype_voice_projects WHERE id = $1',
      [projectId]
    )
    
    console.log(`Successfully deleted project: ${projectId}`)

    return NextResponse.json(
      { 
        message: 'Project and all related data deleted successfully'
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Unexpected error during project deletion:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}