// app/api/webhooks/clerk/route.ts
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { query } from "@/lib/postgres"
import { NextRequest, NextResponse } from 'next/server'

interface ClerkWebhookEvent {
  data: {
    id: string
    email_addresses: Array<{
      email_address: string
      id: string
    }>
    first_name: string | null
    last_name: string | null
    image_url: string | null
    username: string | null
  }
  type: string
}


export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log('🎯 Webhook received')
  
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('❌ Missing CLERK_WEBHOOK_SIGNING_SECRET')
    return new NextResponse('Missing webhook secret', { status: 500 })
  }
  
  // Get the headers
  const headerPayload = await headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('❌ Missing svix headers')
    return new NextResponse('Error occurred -- no svix headers', {
      status: 400,
    })
  }

  // Get the body
  const payload = await req.json()
  const body = JSON.stringify(payload)

  console.log('📝 Webhook payload type:', payload.type)

  // Create a new Svix instance with your secret
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt: ClerkWebhookEvent

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as ClerkWebhookEvent
  } catch (err) {
    console.error('❌ Error verifying webhook:', err)
    return new NextResponse('Error occurred during verification', {
      status: 400,
    })
  }

  const { id } = evt.data
  const eventType = evt.type

  console.log(`🔄 Processing ${eventType} for user ${id}`)

  try {
    if (eventType === 'user.created') {
      const { email_addresses, first_name, last_name, image_url } = evt.data

      console.log('✅ Creating new user in database')

      const result = await query(
        `INSERT INTO pype_voice_users (clerk_id, email, first_name, last_name, profile_image_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, email_addresses[0]?.email_address || '', first_name, last_name, image_url]
      )

      if (result.rows.length === 0) {
        console.error('❌ Error creating user in database: No rows returned')
        return new NextResponse('Error creating user', { status: 500 })
      }

      console.log('🎉 User created successfully:', result.rows[0])
    }

    if (eventType === 'user.updated') {
      const { email_addresses, first_name, last_name, image_url } = evt.data

      console.log('📝 Updating user in database')

      const result = await query(
        `UPDATE pype_voice_users 
         SET email = $1, first_name = $2, last_name = $3, 
             profile_image_url = $4, updated_at = $5
         WHERE clerk_id = $6
         RETURNING *`,
        [
          email_addresses[0]?.email_address || '',
          first_name,
          last_name,
          image_url,
          new Date().toISOString(),
          id
        ]
      )

      if (result.rows.length === 0) {
        console.error('❌ Error updating user in database: No rows returned')
        return new NextResponse('Error updating user', { status: 500 })
      }

      console.log('📝 User updated successfully:', result.rows[0])
    }

    if (eventType === 'user.deleted') {
      console.log('🗑️ Deleting user from database')

      await query(
        'DELETE FROM pype_voice_users WHERE clerk_id = $1',
        [id]
      )

      console.log('🗑️ User deleted successfully')
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }

  console.log('✅ Webhook processed successfully')
  return new NextResponse('Webhook processed successfully', { status: 200 })
}