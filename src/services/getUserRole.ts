import 'server-only'

// src/services/getUserRole.ts
import { DatabaseService } from "@/lib/database"
import { query } from "@/lib/postgres"
import { canViewApiKeys, canManageApiKeys } from "@/lib/permissions"

// Re-export for backward compatibility
export { canViewApiKeys, canManageApiKeys }

export async function getUserProjectRole(email: string, projectId: string) {
  // For on-premise deployment, all users are admins
  return { 
    role: 'admin',
    permissions: {
      read: true,
      write: true,
      delete: true,
      admin: true
    }
  }
}
