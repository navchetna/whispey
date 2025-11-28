// src/lib/api-key-management.ts
import crypto from 'crypto'
import { encryptWithWhispeyKey } from './whispey-crypto'
import { query } from './postgres'

/**
 * Generate a secure API token with pype prefix
 */
export function generateApiToken(): string {
  const randomBytes = crypto.randomBytes(32).toString('hex')
  return `pype_${randomBytes}`
}

/**
 * Hash a token using SHA-256 for authentication
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Create masked version of token for display
 */
export function maskToken(token: string): string {
  if (token.length < 16) return token
  const prefix = token.substring(0, 8)
  const suffix = token.substring(token.length - 8)
  return `${prefix}...${suffix}`
}

/**
 * Create a new API key entry in the enhanced table
 */
export async function createProjectApiKey(
  projectId: string,
  userClerkId: string,
  apiToken: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const tokenHash = hashToken(apiToken)
    const tokenHashMaster = encryptWithWhispeyKey(apiToken)
    const maskedKey = maskToken(apiToken)

    const result = await query(
      `INSERT INTO pype_voice_api_keys 
       (project_id, user_clerk_id, token_hash, token_hash_master, masked_key) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [projectId, userClerkId, tokenHash, tokenHashMaster, maskedKey]
    )

    if (result.rows.length === 0) {
      console.error('Error creating project API key: No rows returned')
      return { success: false, error: 'Failed to create API key' }
    }

    return { success: true, id: result.rows[0].id }
  } catch (error) {
    console.error('Unexpected error creating project API key:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Get API keys for a project
 */
export async function getProjectApiKeys(projectId: string) {
    try {
      console.log('Getting API keys for project:', projectId)
      
      const result = await query(
        `SELECT * FROM pype_voice_api_keys 
         WHERE project_id = $1 
         ORDER BY created_at DESC`,
        [projectId]
      )
  
      console.log('Query response:', { rowCount: result.rows.length })
  
      console.log('Returning data:', result.rows || [])
      return { success: true, data: result.rows || [] }
    } catch (error) {
      console.error('Unexpected error fetching project API keys:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

/**
 * Update last_used timestamp for an API key
 */
export async function updateKeyLastUsed(tokenHash: string): Promise<void> {
  try {
    await query(
      'UPDATE pype_voice_api_keys SET last_used = $1 WHERE token_hash = $2',
      [new Date().toISOString(), tokenHash]
    )
  } catch (error) {
    console.error('Error updating key last used:', error)
    // Don't throw - this is not critical for authentication
  }
}