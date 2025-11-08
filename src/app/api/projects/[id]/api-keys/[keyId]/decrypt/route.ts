// src/app/api/projects/[id]/api-keys/[keyId]/decrypt/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { query } from "@/lib/postgres"
import { decryptWithWhispeyKey } from '@/lib/whispey-crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; keyId: string }> }
) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: projectId, keyId } = await params

    // Get the encrypted key
    const result = await query(
      `SELECT token_hash_master, project_id FROM pype_voice_api_keys 
       WHERE id = $1 AND project_id = $2 
       LIMIT 1`,
      [keyId, projectId]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    const apiKey = result.rows[0]

    // Decrypt and return
    const decryptedKey = decryptWithWhispeyKey(apiKey.token_hash_master)
    
    return NextResponse.json({ full_key: decryptedKey })
  } catch (error) {
    console.error('Error decrypting API key:', error)
    return NextResponse.json({ error: 'Failed to decrypt key' }, { status: 500 })
  }
}