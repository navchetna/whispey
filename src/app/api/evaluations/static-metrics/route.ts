// app/api/evaluations/static-metrics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { query } from "@/lib/postgres"
import { auth } from '@/lib/auth-server'
import 'server-only'

interface StaticMetricConfig {
  id: string
  name: string
  description: string
  enabled: boolean
  threshold: number
  unit: string
}

// GET - Fetch static metrics configuration for an agent
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    if (!agentId) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    }

    // First check if agent has custom config
    const result = await query(
      `SELECT static_metrics_config FROM pype_voice_agents WHERE id = $1`,
      [agentId]
    )

    console.log('[STATIC METRICS GET] Agent ID:', agentId)
    console.log('[STATIC METRICS GET] Query result:', result.rows)

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    let config = result.rows[0].static_metrics_config
    console.log('[STATIC METRICS GET] Raw config from DB:', config)
    console.log('[STATIC METRICS GET] Config type:', typeof config)

    // Handle case where config might be a string (depending on PG driver)
    if (typeof config === 'string') {
      try {
        config = JSON.parse(config)
        console.log('[STATIC METRICS GET] Parsed config from string:', config)
      } catch (e) {
        console.error('[STATIC METRICS GET] Failed to parse config string:', e)
        config = null
      }
    }

    // Return default config if none exists or is invalid
    if (!config || !Array.isArray(config) || config.length === 0) {
      console.log('[STATIC METRICS GET] No valid config found, returning default')
      const defaultConfig: StaticMetricConfig[] = [
        {
          id: 'turn_latency',
          name: 'Turn Latency',
          description: 'All individual turn latencies must be less than the threshold',
          enabled: true,
          threshold: 5,
          unit: 'seconds'
        }
      ]
      return NextResponse.json({ data: defaultConfig })
    }

    console.log('[STATIC METRICS GET] Returning config:', config)
    return NextResponse.json({ data: config }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      }
    })
  } catch (error) {
    console.error('Error fetching static metrics config:', error)
    return NextResponse.json(
      { error: 'Failed to fetch static metrics configuration' },
      { status: 500 }
    )
  }
}

// PUT - Update static metrics configuration for an agent
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { agent_id, static_metrics } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
    }

    if (!static_metrics || !Array.isArray(static_metrics)) {
      return NextResponse.json({ error: 'static_metrics array is required' }, { status: 400 })
    }

    console.log('[STATIC METRICS] Saving config for agent:', agent_id)
    console.log('[STATIC METRICS] Config to save:', JSON.stringify(static_metrics, null, 2))

    // Update the agent's static metrics config
    // Note: jsonb column accepts JSON objects directly, no need to stringify
    const result = await query(
      `UPDATE pype_voice_agents 
       SET static_metrics_config = $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING id, static_metrics_config`,
      [JSON.stringify(static_metrics), agent_id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    console.log('[STATIC METRICS] Saved successfully:', result.rows[0].static_metrics_config)

    return NextResponse.json({ 
      success: true, 
      data: result.rows[0].static_metrics_config 
    })
  } catch (error) {
    console.error('Error updating static metrics config:', error)
    return NextResponse.json(
      { error: 'Failed to update static metrics configuration' },
      { status: 500 }
    )
  }
}
