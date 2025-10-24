// Test script to verify transcript fetching logic
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://owbyyfcrjxdekcvwgkbf.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function testTranscriptFetch() {
  console.log('Testing transcript fetch logic...')
  
  const agentId = 'f80aca6d-bd3e-45d7-847b-28fe4efc684f'
  
  try {
    // Step 1: Get call logs for this agent
    const { data: callLogs, error: callLogsError } = await supabase
      .from('pype_voice_call_logs')
      .select('id, call_id, agent_id, call_ended_reason, created_at, duration_seconds')
      .eq('agent_id', agentId)
      .in('call_ended_reason', ['completed', 'ended', 'finished', 'success'])
      .order('created_at', { ascending: false })
      .limit(5)

    if (callLogsError) {
      console.error('Error fetching call logs:', callLogsError)
      return
    }

    console.log(`Found ${callLogs?.length || 0} completed call logs`)

    if (!callLogs || callLogs.length === 0) {
      console.log('No completed call logs found')
      return
    }

    // Step 2: Check transcript data for each call
    for (const callLog of callLogs) {
      console.log(`\nChecking call ${callLog.id}:`)
      
      const { data: transcriptTurns, error: transcriptError } = await supabase
        .from('pype_voice_metrics_logs')
        .select('user_transcript, agent_response, turn_id, created_at')
        .eq('session_id', callLog.id)
        .order('unix_timestamp', { ascending: true })

      if (transcriptError) {
        console.error(`  Error fetching transcript:`, transcriptError)
        continue
      }

      const hasValidTranscript = transcriptTurns && transcriptTurns.length > 0 && 
        transcriptTurns.some(turn => turn.user_transcript || turn.agent_response)

      console.log(`  Transcript turns found: ${transcriptTurns?.length || 0}`)
      console.log(`  Has valid transcript: ${hasValidTranscript}`)
      
      if (hasValidTranscript) {
        console.log(`  Sample turns:`)
        transcriptTurns.slice(0, 2).forEach(turn => {
          console.log(`    Turn ${turn.turn_id}:`)
          if (turn.user_transcript) console.log(`      User: ${turn.user_transcript.substring(0, 50)}...`)
          if (turn.agent_response) console.log(`      Agent: ${turn.agent_response.substring(0, 50)}...`)
        })
        
        // Test formatting
        const formattedTranscript = transcriptTurns
          .filter(turn => turn.user_transcript || turn.agent_response)
          .map(turn => ({
            turn_id: turn.turn_id,
            user_transcript: turn.user_transcript || '',
            agent_response: turn.agent_response || '',
            created_at: turn.created_at
          }))
        
        console.log(`  Formatted transcript ready: ${formattedTranscript.length} turns`)
        
        // Test transcript extraction (like evaluation system would do)
        const extractedText = formattedTranscript
          .flatMap(item => {
            const messages = []
            if (item.user_transcript && item.user_transcript.trim()) {
              messages.push(`USER: ${item.user_transcript}`)
            }
            if (item.agent_response && item.agent_response.trim()) {
              messages.push(`AGENT: ${item.agent_response}`)
            }
            return messages
          })
          .join('\n')
        
        console.log(`  Extracted text length: ${extractedText.length} characters`)
        if (extractedText.length > 0) {
          console.log(`  Sample extracted text: ${extractedText.substring(0, 100)}...`)
        }
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testTranscriptFetch()