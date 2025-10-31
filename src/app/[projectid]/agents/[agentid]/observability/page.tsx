// Enhanced Observability Page with Audio-Synced Transcript
"use client"

import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import TracesTable from "@/components/observabilty/TracesTable"
import { useState, use, useCallback } from "react"
import { extractS3Key } from "@/utils/s3"
import AudioPlayer from "@/components/AudioPlayer"
import AudioSyncedTranscript from "@/components/AudioSyncedTranscript"
import { useSupabaseQuery } from "@/hooks/useSupabase"
import ObservabilityStats from "@/components/observabilty/ObservabilityStats"

interface ObservabilityPageProps {
  params: Promise<{ agentid: string }>
  searchParams?: Promise<{ session_id?: string }>
}

export default function ObservabilityPage({ params, searchParams }: ObservabilityPageProps) {
  const router = useRouter()
  const resolvedParams = use(params)
  const resolvedSearchParams = use(searchParams || Promise.resolve({} as { session_id?: string }))
  const sessionId = resolvedSearchParams?.session_id
  
  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    timeRange: "24h"
  })

  // Audio sync state
  const [currentAudioTime, setCurrentAudioTime] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  const [seekToTime, setSeekToTime] = useState<number | undefined>(undefined)

  // Build query filters based on whether we have sessionId or agentId
  const queryFilters = sessionId 
    ? [{ column: "id", operator: "eq", value: sessionId }]
    : [{ column: "agent_id", operator: "eq", value: resolvedParams.agentid }]

  const { data: callData, loading: callLoading, error: callError } = useSupabaseQuery("pype_voice_call_logs", {
    select: "id, call_id, agent_id, recording_url, customer_number, call_started_at, call_ended_reason, duration_seconds, metadata",
    filters: queryFilters,
    orderBy: { column: "created_at", ascending: false },
    limit: 1
  })

  const { data: agentData, loading: agentLoading, error: agentError } = useSupabaseQuery("pype_voice_agents", {
    select: "id, name, agent_type, configuration, vapi_api_key_encrypted, vapi_project_key_encrypted",
    filters: [{ column: "id", operator: "eq", value: resolvedParams.agentid }],
    limit: 1
  })

  // Get conversation turns for transcript
  const { data: conversationTurns, loading: turnsLoading } = useSupabaseQuery("pype_voice_metrics_logs", {
    select: "id, turn_id, user_transcript, agent_response, unix_timestamp, created_at",
    filters: sessionId 
      ? [{ column: "session_id", operator: "eq", value: sessionId }]
      : [{ column: "session_id::text", operator: "like", value: `${resolvedParams.agentid}%` }],
    orderBy: { column: "unix_timestamp", ascending: true }
  })

  const agent = agentData && agentData.length > 0 ? agentData[0] : null

  // Get the recording URL from the first call
  const recordingUrl = callData && callData.length > 0 ? callData[0].recording_url : null
  const callInfo = callData && callData.length > 0 ? callData[0] : null

  // Check if URL might be expired (for signed URLs)
  const isSignedUrl = recordingUrl && recordingUrl.includes('X-Amz-Signature')
  const isUrlExpired = isSignedUrl && recordingUrl.includes('X-Amz-Expires=604800') // 7 days

  // Audio event handlers
  const handleAudioTimeUpdate = useCallback((time: number) => {
    setCurrentAudioTime(time)
  }, [])

  const handleAudioPlayStateChange = useCallback((playing: boolean) => {
    setIsAudioPlaying(playing)
  }, [])

  const handleTranscriptTurnClick = useCallback((turn: any) => {
    // When a turn is clicked, seek audio to that timestamp if available
    if (turn.startTime !== undefined) {
      setSeekToTime(turn.startTime)
      // Reset seekToTime after a brief delay to allow for multiple seeks
      setTimeout(() => setSeekToTime(undefined), 100)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      
      {/* Audio Player - show if we have a recording URL */}
      {recordingUrl && !callLoading && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Call Recording</h3>
            {isAudioPlaying && (
              <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>Audio synced to table</span>
              </div>
            )}
          </div>
          <AudioPlayer
            s3Key={extractS3Key(recordingUrl)}
            url={recordingUrl}
            callId={callInfo?.id}
            onTimeUpdate={handleAudioTimeUpdate}
            onPlayStateChange={handleAudioPlayStateChange}
            seekToTime={seekToTime}
          />
        </div>
      )}

      {/* Stats Section */}
      {agentLoading ? (
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <div className="animate-pulse text-gray-600 dark:text-gray-400">Loading agent data...</div>
        </div>
      ) : (
        <ObservabilityStats
          sessionId={sessionId}
          agentId={resolvedParams.agentid}
          callData={callData}
          agent={agent}
        />
      )}

      {/* Main Content - Traces Table */}
      <div className="flex-1 min-h-0">
        <TracesTable
          agentId={resolvedParams.agentid}
          sessionId={sessionId}
          agent={agent}
          filters={filters}
          currentAudioTime={currentAudioTime}
          isAudioPlaying={isAudioPlaying}
        />
      </div>
    </div>
  )
}