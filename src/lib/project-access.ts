// Helper functions for checking project access
import { query } from '@/lib/postgres'
import { currentUser } from '@/lib/auth-server'

export interface ProjectAccess {
  hasAccess: boolean
  role: string | null
  isOwner: boolean
}

/**
 * Check if a user has access to a specific project
 * @param projectId - The ID of the project to check
 * @param userId - The ID of the user to check access for
 * @param requiredRoles - Optional array of roles that are required (e.g., ['admin'])
 * @returns Object containing access information
 */
export async function checkProjectAccess(
  projectId: string,
  userId: string,
  requiredRoles?: string[]
): Promise<ProjectAccess> {
  // Check if user is admin (admins have access to all projects)
  const user = await currentUser()
  if (user?.isAdmin) {
    return { hasAccess: true, role: 'admin', isOwner: false }
  }

  // Check project ownership or explicit access
  const result = await query(
    `SELECT p.owner_user_id, m.role
     FROM pype_voice_projects p
     LEFT JOIN pype_voice_project_user_mapping m ON p.id = m.project_id AND m.user_id = $2 AND m.is_active = true
     WHERE p.id = $1 AND p.is_active = true`,
    [projectId, userId]
  )

  if (result.rows.length === 0) {
    return { hasAccess: false, role: null, isOwner: false }
  }

  const row = result.rows[0]
  const isOwner = row.owner_user_id === userId
  const explicitRole = row.role

  // User has access if they own the project or have explicit mapping
  const hasAccess = isOwner || !!explicitRole
  const effectiveRole = isOwner ? 'admin' : explicitRole

  // Check required role if specified
  if (requiredRoles && requiredRoles.length > 0 && effectiveRole) {
    const hasRequiredRole = requiredRoles.includes(effectiveRole)
    return { hasAccess: hasRequiredRole, role: effectiveRole, isOwner }
  }

  return { hasAccess, role: effectiveRole, isOwner }
}

/**
 * Get all project IDs that a user has access to
 * @param userId - The ID of the user
 * @returns Array of project IDs the user can access
 */
export async function getUserAccessibleProjectIds(userId: string): Promise<string[]> {
  // Check if user is admin
  const user = await currentUser()
  if (user?.isAdmin) {
    // Admin users can access all projects
    const result = await query(
      `SELECT id FROM pype_voice_projects WHERE is_active = true`,
      []
    )
    return result.rows.map((row: any) => row.id)
  }

  // For regular users, get projects they own or have explicit access to
  const result = await query(
    `SELECT DISTINCT p.id
     FROM pype_voice_projects p
     LEFT JOIN pype_voice_project_user_mapping m ON p.id = m.project_id AND m.user_id = $1 AND m.is_active = true
     WHERE p.is_active = true
     AND (p.owner_user_id = $1 OR m.user_id = $1)`,
    [userId]
  )

  return result.rows.map((row: any) => row.id)
}

/**
 * Check if user has access to a specific agent via project access
 * @param agentId - The ID of the agent
 * @param userId - The ID of the user
 * @param requiredRoles - Optional array of roles that are required
 * @returns Object containing access information
 */
export async function checkAgentAccess(
  agentId: string,
  userId: string,
  requiredRoles?: string[]
): Promise<ProjectAccess> {
  // Get the project ID for this agent
  const agentResult = await query(
    `SELECT project_id FROM pype_voice_agents WHERE id = $1`,
    [agentId]
  )

  if (agentResult.rows.length === 0) {
    return { hasAccess: false, role: null, isOwner: false }
  }

  const projectId = agentResult.rows[0].project_id
  return checkProjectAccess(projectId, userId, requiredRoles)
}
