// app/api/evaluations/traces/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'

// Helper function to extract formatted transcript from transcript_json
function formatTranscriptFromJson(transcriptJson: any): string {
  if (!transcriptJson) return 'No transcript available'
  
  if (Array.isArray(transcriptJson)) {
    return transcriptJson
      .flatMap((item: any) => {
        const messages: string[] = []
        
        // Handle role-based format (role + content)
        if (item.role && item.content) {
          const role = item.role === 'assistant' ? 'AGENT' : 'USER'
          const text = Array.isArray(item.content) ? item.content.join(' ') : item.content
          messages.push(`${role}: ${text}`)
        }
        
        // Handle turn-based format (user_transcript + agent_response)
        if (item.user_transcript && item.user_transcript.trim()) {
          messages.push(`USER: ${item.user_transcript}`)
        }
        if (item.agent_response && item.agent_response.trim()) {
          messages.push(`AGENT: ${item.agent_response}`)
        }
        
        return messages
      })
      .join('\n')
  }
  
  // Handle object format
  if (typeof transcriptJson === 'object') {
    return JSON.stringify(transcriptJson, null, 2)
  }
  
  return String(transcriptJson)
}

// Create Supabase client for server-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const agentId = searchParams.get('agent_id')
    const limit = searchParams.get('limit') || '100'
    const offset = searchParams.get('offset') || '0'

    if (!projectId) {
      return NextResponse.json(
        { error: 'project_id parameter is required' },
        { status: 400 }
      )
    }

    // Build query based on available parameters
    let query = supabase
      .from('pype_voice_call_logs')
      .select(`
        id,
        call_id,
        created_at,
        agent_id,
        transcript_json,
        duration_seconds,
        call_ended_reason,
        metadata,
        pype_voice_agents!inner(project_id)
      `)
      .eq('pype_voice_agents.project_id', projectId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Filter by agent_id if provided
    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    // Only get completed calls with transcripts for evaluation
    query = query
      .eq('call_ended_reason', 'completed')
      .not('transcript_json', 'is', null)

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch traces' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    const { count, error: countError } = await supabase
      .from('pype_voice_call_logs')
      .select('*, pype_voice_agents!inner(project_id)', { count: 'exact', head: true })
      .eq('pype_voice_agents.project_id', projectId)
      .eq('call_ended_reason', 'completed')
      .not('transcript_json', 'is', null)

    if (countError) {
      console.error('Count error:', countError)
    }

    // Transform data for frontend consumption
    const traces = data.map(trace => ({
      id: trace.id,
      call_id: trace.call_id,
      agent_id: trace.agent_id,
      timestamp: trace.created_at,
      transcript: formatTranscriptFromJson(trace.transcript_json),
      duration: trace.duration_seconds,
      status: trace.call_ended_reason,
      analysis: null, // This field doesn't exist in the schema, setting to null
      metadata: trace.metadata
    }))

    return NextResponse.json({
      success: true,
      data: traces,
      pagination: {
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < (count || 0)
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}