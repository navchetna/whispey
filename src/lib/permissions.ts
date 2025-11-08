// src/lib/permissions.ts
// Client-safe permission utilities (no database access)

export function canViewApiKeys(role: string): boolean {
  const allowedRoles = ['owner', 'admin']
  return allowedRoles.includes(role)
}

export function canManageApiKeys(role: string): boolean {
  const allowedRoles = ['owner', 'admin']
  return allowedRoles.includes(role)
}
