// src/components/observability/TracesTable.tsx
"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { useSupabaseQuery } from "../../hooks/useApi"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle, XCircle, AlertTriangle, Wrench, TrendingUp, Brain, Mic, Volume2, Activity, UserCheck, Bot } from "lucide-react"
import { OTelSpan } from "@/types/openTelemetry";
import { query } from "../../lib/postgres"
import TraceDetailSheet from "./TraceDetailSheet/TraceDetailSheet"
import { cn } from "@/lib/utils"
import { useSessionSpans, useSessionTrace } from "@/hooks/useSessionTrace"
import SessionTraceView from "./SessionTraceView"
import WaterfallView from "./WaterFallView";
import { getAgentPlatform } from "@/utils/agentDetection";

// Custom Sarvam icon component
const SarvamIcon = ({ className }: { className?: string }) => (
  <img 
    src="https://img.icons8.com/?size=100&id=cSTZGiTsAgJX&format=png&color=000000"
    alt="Sarvam"
    className={className}
  />
)

interface TracesTableProps {
  agentId: string
  sessionId?: string
  agent?: any
  filters: {
    search: string
    status: string
    timeRange: string
  }
  currentAudioTime?: number // Current audio playback time in seconds
  isAudioPlaying?: boolean // Whether audio is currently playing
}

interface TraceLog {
  id: string
  session_id: string
  turn_id: string
  user_transcript: string
  agent_response: string
  trace_id?: string
  otel_spans?: OTelSpan[]
  tool_calls?: any[]
  trace_duration_ms?: number
  trace_cost_usd?: number
  call_duration?: number // Add call_duration field
  stt_metrics?: any
  llm_metrics?: any
  tts_metrics?: any
  eou_metrics?: any
  created_at: string
  unix_timestamp: number
  phone_number?: string
  lesson_day?: number
  call_success?: boolean
  lesson_completed?: boolean
  bug_report?: boolean
  // Add metadata field for bug reports
  metadata?: any
}

const TracesTable: React.FC<TracesTableProps> = ({ 
  agentId, 
  agent, 
  sessionId, 
  filters, 
  currentAudioTime = 0, 
  isAudioPlaying = false 
}) => {

  console.log('🎵 TracesTable props:', { currentAudioTime, isAudioPlaying })

  const [selectedTrace, setSelectedTrace] = useState<TraceLog | null>(null)
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("turns");

  const { data: sessionTrace, loading: traceLoading } = useSessionTrace(sessionId || null);
  const { data: sessionSpans, loading: spansLoading } = useSessionSpans(sessionTrace);


  // Get call data to access bug report metadata
  const { data: callData } = useSupabaseQuery("pype_voice_call_logs", {
    select: "*",
    filters: sessionId 
      ? [{ column: "id", operator: "eq", value: sessionId }]
      : [{ column: "agent_id", operator: "eq", value: agentId }],
    orderBy: { column: "created_at", ascending: false }
  })

  const isVapiAgent = useMemo(() => {
    if (!agent) return false
    
    const hasVapiKeys = Boolean(agent.vapi_api_key_encrypted && agent.vapi_project_key_encrypted)
    const hasVapiConfig = Boolean(agent?.configuration?.vapi?.assistantId)
    const isVapiType = agent.agent_type === 'vapi'
    
    return hasVapiKeys || hasVapiConfig || isVapiType
  }, [agent])

  // Audio sync state and refs
  const tracesContainerRef = useRef<HTMLDivElement>(null)
  const traceRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null)

  // trace data
  const {
    data: traceData,
    loading: traceDataLoading,
    error,
  } = useSupabaseQuery("pype_voice_metrics_logs", {
    select: "*",
    filters: sessionId 
      ? [{ column: "session_id", operator: "eq", value: sessionId }]
      : [{ column: "session_id::text", operator: "like", value: `${agentId}%` }],
    orderBy: { column: "unix_timestamp", ascending: true }
  })

  // Extract bug report data from call metadata
  const bugReportData = useMemo(() => {
    if (!callData?.length) return null
    
    const call = callData[0]
    if (!call?.metadata) return null

    try {
      const metadata = typeof call.metadata === "string" ? JSON.parse(call.metadata) : call.metadata
      return {
        bug_reports: metadata?.bug_reports || null,
        bug_flagged_turns: metadata?.bug_flagged_turns || null
      }
    } catch (e) {
      return null
    }
  }, [callData])

  // Check for bug report flags
  const checkBugReportFlags = useMemo(() => {
    const bugReportTurnIds = new Set()

    // Use metadata bug_flagged_turns
    if (bugReportData?.bug_flagged_turns && Array.isArray(bugReportData.bug_flagged_turns)) {
      bugReportData.bug_flagged_turns.forEach((flaggedTurn: any) => {
        if (flaggedTurn.turn_id) {
          bugReportTurnIds.add(flaggedTurn.turn_id.toString())
        }
      })
    }

    // Fallback: Check transcript logs for explicit bug_report flags
    if (traceData?.length) {
      traceData.forEach((log: TraceLog) => {
        if (log.bug_report === true) {
          bugReportTurnIds.add(log.turn_id.toString())
        }
      })
    }

    return bugReportTurnIds
  }, [traceData, bugReportData])

  // Filter and process data
  const processedTraces = useMemo(() => {
    if (!traceData?.length) return []
    
    let filtered = traceData.filter((item: TraceLog) => 
      item.user_transcript || item.agent_response || item.tool_calls?.length || item.otel_spans?.length
    )
  
    filtered.sort((a, b) => {
      const aTurnNum = parseInt(a.turn_id.replace('turn_', '')) || 0
      const bTurnNum = parseInt(b.turn_id.replace('turn_', '')) || 0
      return aTurnNum - bTurnNum
    })
  
    return filtered
  }, [traceData, filters])

  const getTraceStatus = (trace: TraceLog) => {
    // Check if this turn is flagged for bug reports
    if (checkBugReportFlags.has(trace.turn_id.toString())) {
      return "bug_report"
    }

    const spans = trace.otel_spans || []
    const toolErrors = trace.tool_calls?.some(tool => tool.status === 'error' || tool.success === false)
    const hasLLMError = trace.llm_metrics && Object.keys(trace.llm_metrics).length === 0
    const callFailed = trace.call_success === false
    
    if (spans.some((span: OTelSpan) => span.status?.code === 'ERROR' || span.status?.code === 2) || toolErrors || hasLLMError || callFailed) return "error"
    if (spans.some((span: OTelSpan) => span.status?.code === 'UNSET') || !trace.call_success) return "warning"
    return "success"
  }

  const getMainOperation = (trace: TraceLog) => {
    // Determine the main operation type based on available data
    if (trace.tool_calls?.length) return "tool"
    if (trace.llm_metrics && Object.keys(trace.llm_metrics).length > 0) return "llm"
    if (trace.stt_metrics && Object.keys(trace.stt_metrics).length > 0) return "stt"
    if (trace.tts_metrics && Object.keys(trace.tts_metrics).length > 0) return "tts"
    if (trace.eou_metrics && Object.keys(trace.eou_metrics).length > 0) return "eou"
    return "general"
  }

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "tool": return <Wrench className="w-3 h-3" />
      case "eou": return <Activity className="w-3 h-3" />
      case "llm": return <Brain className="w-3 h-3" />
      case "stt": return <Mic className="w-3 h-3" />
      case "tts": return <Volume2 className="w-3 h-3" />
      default: return <Clock className="w-3 h-3" />
    }
  }

  const getOperationColor = (operation: string) => {
    switch (operation) {
      case "tool": return "text-orange-600 dark:text-orange-400"
      case "llm": return "text-purple-600 dark:text-purple-400"
      case "stt": return "text-blue-600 dark:text-blue-400"
      case "tts": return "text-green-600 dark:text-green-400"
      case "eou": return "text-orange-600 dark:text-orange-400"
      default: return "text-gray-600 dark:text-gray-400"
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  const formatLatencyValue = (seconds: number) => {
    return (seconds).toFixed(6); // Divide by 1000 for display
  }
  const formatCost = (cost: number) => {
    if (cost < 0.000001) return "~$0"
    return `$${cost.toFixed(6)}`
  }

  const formatRelativeTime = (timestamp: string) => {
    const now = Date.now()
    const time = new Date(timestamp).getTime()
    const diff = now - time
    
    if (diff < 60 * 1000) return `${Math.floor(diff / 1000)}s`
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m`
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h`
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d`
  }

  const truncateText = (text: string, maxLength: number = 50) => {
    if (!text) return ""
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  const getToolCallsInfo = (toolCalls: any[] = []) => {
    const total = toolCalls.length
    const successful = toolCalls.filter(tool => tool.status === 'success' || tool.success !== false).length
    return { total, successful }
  }

  const getMetricsInfo = (trace: TraceLog) => {
    const metrics = []
    if (trace.stt_metrics && Object.keys(trace.stt_metrics).length > 0) {
      metrics.push({ type: 'STT', duration: trace.stt_metrics.duration })
    }
    if (trace.llm_metrics && Object.keys(trace.llm_metrics).length > 0) {
      metrics.push({ type: 'LLM', ttft: trace.llm_metrics.ttft })
    }
    if (trace.tts_metrics && Object.keys(trace.tts_metrics).length > 0) {
      metrics.push({ type: 'TTS', ttfb: trace.tts_metrics.ttfb })
    }
    if (trace.eou_metrics && Object.keys(trace.eou_metrics).length > 0) {
      metrics.push({ type: 'EOU', delay: trace.eou_metrics.end_of_utterance_delay })
    }
    return metrics
  }

  const getTotalLatency = (trace: TraceLog) => {
    let total = 0
    
    // Debug what we actually have
    console.log('🔍 Latency Debug for trace:', trace.turn_id, {
      stt_metrics: trace.stt_metrics,
      llm_metrics: trace.llm_metrics,
      tts_metrics: trace.tts_metrics,
      eou_metrics: trace.eou_metrics
    })
    
    // STT Duration - check for different possible property names
    if (trace.stt_metrics) {
      const sttDuration = trace.stt_metrics.duration || 
                         trace.stt_metrics.latency || 
                         trace.stt_metrics.processing_time || 
                         0
      if (sttDuration > 0) {
        total += sttDuration
        console.log('🎤 STT duration found:', sttDuration, 'ms')
      }
    }
  
    // LLM TTFT - check for different possible property names
    if (trace.llm_metrics) {
      const llmLatency = trace.llm_metrics.ttft || 
                        trace.llm_metrics.latency || 
                        trace.llm_metrics.response_time || 
                        0
      if (llmLatency > 0) {
        total += llmLatency
        console.log('🧠 LLM latency found:', llmLatency, 'ms')
      }
    }
  
    // TTS TTFB - check for different possible property names
    if (trace.tts_metrics) {
      const ttsLatency = trace.tts_metrics.ttfb || 
                        trace.tts_metrics.latency || 
                        trace.tts_metrics.generation_time || 
                        0
      if (ttsLatency > 0) {
        total += ttsLatency
        console.log('🗣️ TTS latency found:', ttsLatency, 'ms')
      }
    }
  
    // EOU metrics - check for different possible property names
    if (trace.eou_metrics) {
      const eouDelay = trace.eou_metrics.end_of_utterance_delay || 
                      trace.eou_metrics.delay || 
                      trace.eou_metrics.detection_time || 
                      0
      if (eouDelay > 0) {
        total += eouDelay
        console.log('⏱️ EOU delay found:', eouDelay, 'ms')
      }
    }

    console.log('📊 Total latency calculated:', total, 'for trace:', trace.turn_id)
    
    // The values seem to already be in the correct format, don't convert
    return total // Keep as-is, no unit conversion needed
  }  // Calculate cumulative timestamps for audio sync
  const calculateCumulativeTimestamps = useMemo(() => {
    if (!processedTraces?.length) return []
    
    let cumulativeTime = 0
    const timestamps = processedTraces.map((trace: TraceLog, index: number) => {
      const latency = getTotalLatency(trace)
      
      // Debug: Check what data we have
      console.log(`🎵 DEBUG Trace ${index} Raw Data:`, {
        id: trace.id,
        turn_id: trace.turn_id,
        trace_duration_ms: trace.trace_duration_ms,
        call_duration: trace.call_duration,
        stt_metrics: trace.stt_metrics,
        llm_metrics: trace.llm_metrics,
        tts_metrics: trace.tts_metrics,
        eou_metrics: trace.eou_metrics,
        // Check all available fields for potential audio duration
        allTraceFields: Object.keys(trace)
      })
      
      // Get audio duration - check multiple possible sources
      let audioDuration = 0
      
      // Try different sources for audio duration
      if (trace.trace_duration_ms) {
        audioDuration = trace.trace_duration_ms
      } else if (trace.call_duration) {
        audioDuration = trace.call_duration
      } else if (trace.tts_metrics?.audio_duration) {
        audioDuration = trace.tts_metrics.audio_duration
      } else if (trace.tts_metrics?.duration) {
        audioDuration = trace.tts_metrics.duration
      } else if (trace.tts_metrics?.length) {
        audioDuration = trace.tts_metrics.length
      }
      
      console.log(`🎧 Audio duration for ${trace.turn_id}:`, {
        raw_trace_duration_ms: trace.trace_duration_ms,
        call_duration: trace.call_duration,
        tts_metrics_audio_duration: trace.tts_metrics?.audio_duration,
        tts_metrics_duration: trace.tts_metrics?.duration,
        tts_metrics_length: trace.tts_metrics?.length,
        final_audioDuration: audioDuration,
        latency_seconds: latency,
        dataType_raw: typeof trace.trace_duration_ms,
        isNull: trace.trace_duration_ms === null,
        isUndefined: trace.trace_duration_ms === undefined,
        actualValue: trace.trace_duration_ms,
        sourceUsed: audioDuration > 0 ? 'Found audio duration' : 'No audio duration found'
      })
      
      // Calculate trace duration: latency + audio durations for both user and agent
      // Skip first turn (turn_1) as it typically doesn't have user audio
      const turnNumber = parseInt(trace.turn_id.replace('turn_', '')) || 0
      const isFirstTurn = turnNumber === 1
      
      let traceDuration = latency + audioDuration
      
      // For turns after the first, add actual audio durations from metrics
      if (!isFirstTurn) {
        // Get actual user (STT) audio duration from metrics
        const userAudioDuration = trace.stt_metrics?.audio_duration || 0
        
        // Get actual agent (TTS) audio duration from metrics  
        const agentAudioDuration = trace.tts_metrics?.audio_duration || 0
        
        // Add both actual audio durations to the trace duration
        traceDuration += userAudioDuration + agentAudioDuration
        
        console.log(`🎭 Turn ${turnNumber} actual audio durations:`, {
          userAudioDuration: userAudioDuration.toFixed(3),
          agentAudioDuration: agentAudioDuration.toFixed(3),
          totalAudioDuration: (userAudioDuration + agentAudioDuration).toFixed(3),
          stt_metrics_available: !!trace.stt_metrics,
          tts_metrics_available: !!trace.tts_metrics
        })
      }
      
      console.log(`📏 Trace duration calculation for ${trace.turn_id}:`, {
        isFirstTurn,
        latency: latency,
        systemAudioDuration: audioDuration,
        finalTraceDuration: traceDuration,
        formula: isFirstTurn ? 'latency + systemAudio' : 'latency + systemAudio + userAudio + agentAudio'
      })
      
      if (traceDuration === 0) {
        // Fallback duration calculation based on content
        const transcriptLength = (trace.user_transcript || '').length + (trace.agent_response || '').length
        const estimatedDuration = Math.max(
          2, // Minimum 2 seconds per trace
          Math.min(10, transcriptLength * 0.05) // ~0.05 seconds per character, max 10 seconds
        )
        traceDuration = estimatedDuration
        console.log(`⏰ Using fallback duration for ${trace.turn_id}: ${estimatedDuration}s (transcript length: ${transcriptLength})`)
      }
      
      const startTime = cumulativeTime
      const endTime = cumulativeTime + traceDuration
      
      console.log(`🎵 Trace ${index} (${trace.turn_id}):`, {
        id: trace.id,
        turnNumber,
        isFirstTurn,
        latency: `${latency.toFixed(3)}s`,
        systemAudioDuration: `${audioDuration.toFixed(3)}s`, 
        finalTraceDuration: `${traceDuration.toFixed(3)}s`,
        startTime: `${startTime.toFixed(3)}s`,
        endTime: `${endTime.toFixed(3)}s`,
        raw_trace_duration_ms: trace.trace_duration_ms,
        usingFallback: latency + audioDuration === 0 ? `YES (${traceDuration}s estimated)` : 'NO',
        transcriptLengths: {
          user: (trace.user_transcript || '').length,
          agent: (trace.agent_response || '').length
        },
        calculationBreakdown: {
          step1_latency: latency,
          step2_systemAudio: audioDuration,
          step3_userAudio: !isFirstTurn ? (trace.stt_metrics?.audio_duration || 0).toFixed(3) : 'N/A (first turn)',
          step4_agentAudio: !isFirstTurn ? (trace.tts_metrics?.audio_duration || 0).toFixed(3) : 'N/A (first turn)',
          step5_finalDuration: traceDuration,
          step6_timeRange: `${startTime.toFixed(3)}s to ${endTime.toFixed(3)}s`
        }
      })
      
      cumulativeTime = endTime
      
      return {
        traceId: trace.id,
        turnId: trace.turn_id,
        startTime,
        endTime,
        latency,
        audioDuration,
        traceDuration,
        index
      }
    })
    
    console.log('🎵 Audio Sync: Calculated cumulative timestamps', timestamps.map(t => ({
      turn: t.turnId,
      start: `${t.startTime.toFixed(3)}s`,
      end: `${t.endTime.toFixed(3)}s`,
      duration: `${t.traceDuration.toFixed(3)}s`
    })))
    
    return timestamps
  }, [processedTraces])

  // Create a lookup object for easy access to timestamps by trace ID
  const cumulativeTimestamps = useMemo(() => {
    const lookup: Record<string, { startTime: number; endTime: number }> = {}
    calculateCumulativeTimestamps.forEach(item => {
      lookup[item.traceId] = {
        startTime: item.startTime,
        endTime: item.endTime
      }
    })
    
    console.log('🔑 Lookup object created:', {
      totalItems: calculateCumulativeTimestamps.length,
      lookupKeys: Object.keys(lookup),
      lookupData: lookup
    })
    
    return lookup
  }, [calculateCumulativeTimestamps])

  // Find active trace based on current audio time
  const findActiveTrace = useMemo(() => {
    if (!currentAudioTime || !calculateCumulativeTimestamps.length) {
      console.log('🎵 Audio Sync: No active trace - currentAudioTime:', currentAudioTime, 'timestamps:', calculateCumulativeTimestamps.length)
      return null
    }
    
    const activeTrace = calculateCumulativeTimestamps.find((trace: any) => 
      currentAudioTime >= trace.startTime && currentAudioTime <= trace.endTime
    )
    
    // Debug: Show which traces the current time falls between
    const relevantTraces = calculateCumulativeTimestamps.map(t => ({
      turn: t.turnId,
      start: t.startTime.toFixed(3),
      end: t.endTime.toFixed(3),
      isActive: currentAudioTime >= t.startTime && currentAudioTime <= t.endTime,
      beforeStart: currentAudioTime < t.startTime,
      afterEnd: currentAudioTime > t.endTime
    }))
    
    console.log('🎵 Audio Sync: Current time', currentAudioTime.toFixed(3) + 's', 'Active trace:', activeTrace?.turnId || 'none')
    console.log('🎵 Audio Sync: All traces vs current time:', relevantTraces)
    
    return activeTrace
  }, [currentAudioTime, calculateCumulativeTimestamps])

  // Auto-scroll to active trace and manage highlighting
  useEffect(() => {
    console.log('🎵 Audio Sync: Effect triggered', { 
      isAudioPlaying, 
      findActiveTrace, 
      activeTraceId,
      currentAudioTime 
    })
    
    // Clear highlighting when audio stops
    if (!isAudioPlaying) {
      console.log('🎵 Audio Sync: Audio stopped, clearing active trace')
      setActiveTraceId(null)
      return
    }
    
    // Only highlight when audio is playing and we have an active trace
    if (!findActiveTrace) {
      console.log('🎵 Audio Sync: No active trace found for current time')
      return
    }
    
    const activeTrace = findActiveTrace
    if (activeTrace.traceId !== activeTraceId) {
      console.log('🎵 Audio Sync: Setting active trace', activeTrace.traceId)
      setActiveTraceId(activeTrace.traceId)
      
      // Scroll to the active trace
      const traceElement = traceRefs.current[activeTrace.traceId]
      console.log('🎵 Audio Sync: Trace element found', !!traceElement, !!tracesContainerRef.current)
      
      if (traceElement && tracesContainerRef.current) {
        console.log('🎵 Audio Sync: Scrolling to trace')
        traceElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }
  }, [findActiveTrace, isAudioPlaying, activeTraceId, currentAudioTime])

const handleRowClick = (trace: TraceLog) => {
  const hasBugReport = checkBugReportFlags.has(trace.turn_id.toString())
  
  const relevantBugReports = bugReportData?.bug_reports?.filter((report: any) => {
    const reportFlaggedTurns = bugReportData?.bug_flagged_turns?.filter(
      (flaggedTurn: any) => flaggedTurn.bug_report_id === report.id || 
      flaggedTurn.timestamp === report.timestamp
    ) || []
    
    return reportFlaggedTurns.some((flaggedTurn: any) => 
      flaggedTurn.turn_id.toString() === trace.turn_id.toString()
    )
  }) || []

  const enrichedTrace = {
    ...trace,
    bug_report: hasBugReport,
    bug_report_data: {
      ...bugReportData,
      bug_reports: relevantBugReports
    }
  }
  
  setSelectedTrace(enrichedTrace)
  setIsDetailSheetOpen(true)
}

  if (traceDataLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading traces...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900">
        <div className="text-center text-red-600 dark:text-red-400 text-sm">
          Error loading traces: {error?.message || 'An error occurred'}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
        {/* Tab Navigation with Audio Sync Card */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <nav className="flex space-x-4">
              <button 
                onClick={() => setActiveTab("turns")}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activeTab === "turns" 
                    ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" 
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                )}
              >
                Conversation Turns ({processedTraces.length})
              </button>
              {sessionSpans && sessionSpans.length > 0 && (
                <>
              <button 
                onClick={() => setActiveTab("trace")}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activeTab === "trace" 
                    ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" 
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                )}
              >
                Session Trace ({sessionSpans?.length || 0} spans)
              </button>
              <button 
                onClick={() => setActiveTab("waterfall")}
                className={cn(
                  "px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  activeTab === "waterfall" 
                    ? "bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800" 
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                )}
              >
                Timeline View ({sessionSpans?.length || 0} spans)
              </button>
              </>)}
            </nav>
            
            {/* Audio Sync Status Card */}
            {isAudioPlaying && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 flex items-center gap-3 text-xs">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div className="flex items-center gap-4">
                  <span className="text-gray-700 dark:text-gray-300">
                    <span className="font-medium">Audio:</span> {currentAudioTime.toFixed(1)}s
                  </span>
                  {findActiveTrace ? (
                    <>
                      <span className="text-blue-600 dark:text-blue-400">
                        <span className="font-medium">Turn:</span> {findActiveTrace.turnId.replace('turn_', '')}
                      </span>
                      <span className="text-purple-600 dark:text-purple-400">
                        <span className="font-medium">Duration:</span> {findActiveTrace.traceDuration.toFixed(1)}s
                      </span>
                    </>
                  ) : (
                    <span className="text-red-500 dark:text-red-400">
                      No matching trace
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
  
        {/* Tab Content */}
        {activeTab === "turns" && (
          <>
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-2 flex-shrink-0">
              <div className="grid grid-cols-12 gap-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                <div className="col-span-1">Turn ID</div>
                <div className="col-span-2">Trace Info</div>
                <div className="col-span-5">Conversation</div>
                <div className="col-span-1">Operations</div>
                <div className="col-span-1">Latency (s)</div>
                <div className="col-span-1">Cost</div>
                <div className="col-span-1">Status</div>
              </div>
            </div>

            {/* Table Body */}
            <div 
              ref={tracesContainerRef}
              className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900 h-full"
            >
              {processedTraces.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                    <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <div>No traces found</div>
                    {filters.search || filters.status !== "all" ? (
                      <div className="text-xs mt-1">Try adjusting your filters</div>
                    ) : (
                      <div className="text-xs mt-1">Traces will appear here when data is available</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {processedTraces.map((trace: TraceLog) => {
                    const status = getTraceStatus(trace)
                    const toolInfo = getToolCallsInfo(trace.tool_calls)
                    const mainOp = getMainOperation(trace)
                    const metrics = getMetricsInfo(trace)
                    const latency = getTotalLatency(trace)
                    const hasBugReport = checkBugReportFlags.has(trace.turn_id.toString())
                    const spansLength = trace.otel_spans?.length || 0
                    const isActiveTrace = isAudioPlaying && activeTraceId === trace.id
                    
                    return (
                      <div
                        key={trace.id}
                        ref={(el) => { traceRefs.current[trace.id] = el }}
                        onClick={() => handleRowClick(trace)}
                        className={cn(
                          "grid grid-cols-12 gap-3 px-4 py-2.5 cursor-pointer border-l-2 transition-all text-sm relative hover:shadow-sm",
                          hasBugReport
                            ? "border-l-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20"
                            : isActiveTrace
                            ? "border-l-green-500 bg-green-100 dark:bg-green-900/20 shadow-md border-r-2 border-r-green-300 dark:border-r-green-700"
                            : "border-l-transparent hover:border-l-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                        )}
                      >
                        {/* Turn ID */}
                        <div className="col-span-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {isActiveTrace && (
                              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            )}
                            <div className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Turn {trace.turn_id.replace('turn_', '')}
                            </div>
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                            {formatRelativeTime(trace.created_at)}
                          </div>
                          {/* Audio Timeline */}
                          {(() => {
                            const timestampData = cumulativeTimestamps[trace.id]
                            console.log(`🎯 JSX Debug for ${trace.turn_id}:`, {
                              traceId: trace.id,
                              hasData: !!timestampData,
                              timestampData,
                              allKeys: Object.keys(cumulativeTimestamps)
                            })
                            
                            if (timestampData) {
                              return (
                                <div className="text-[9px] text-blue-500 dark:text-blue-400 font-mono">
                                  {Math.round(timestampData.startTime)}s-{Math.round(timestampData.endTime)}s
                                </div>
                              )
                            }
                            return (
                              <div className="text-[9px] text-red-500 font-mono">
                                No data
                              </div>
                            )
                          })()}
                        </div>

                        {/* Trace Info */}
                        <div className="col-span-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className={cn("text-sm", getOperationColor(mainOp))}>
                              {getOperationIcon(mainOp)}
                            </div>
                            <div className="font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold">
                              {trace.trace_id ? `${trace.trace_id.slice(0, 8)}...` : `Turn-${trace.turn_id}`}
                            </div>
                            {hasBugReport && (
                              <div className="flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-red-600 dark:text-red-400" />
                                <Badge variant="destructive" className="text-xs px-1 py-0">
                                  Bug
                                </Badge>
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
                            <div>Session: {trace.session_id.slice(-8)}</div>
                            {trace.phone_number && (
                              <div>📞 {trace.phone_number.slice(-4)}</div>
                            )}
                          </div>
                        </div>
  
                        {/* Conversation */}
                        <div className="col-span-5 space-y-2">
                          {trace.user_transcript && (
                            <div className="text-sm">
                              <div className="flex items-center gap-2 mb-1">
                                <UserCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span className="text-blue-600 dark:text-blue-400 font-medium text-sm">Evaluator</span>
                              </div>
                              <div className={cn(
                                "ml-5 text-gray-800 dark:text-gray-200",
                                isActiveTrace && "bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-200 dark:border-blue-800 leading-relaxed"
                              )}>
                                {isActiveTrace ? trace.user_transcript : truncateText(trace.user_transcript, 120)}
                              </div>
                            </div>
                          )}
                          {trace.agent_response && (
                            <div className={cn(
                              "text-sm",
                              hasBugReport && "text-red-700 dark:text-red-300 font-medium"
                            )}>
                              <div className="flex items-center gap-2 mb-1">
                                <SarvamIcon className={cn(
                                  "w-3 h-3",
                                  hasBugReport ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                                )} />
                                <span className={cn(
                                  "font-medium text-sm",
                                  hasBugReport ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                                )}>Sarvam</span>
                                {hasBugReport && (
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                    REPORTED
                                  </Badge>
                                )}
                              </div>
                              <div className={cn(
                                "ml-5",
                                hasBugReport ? "text-red-800 dark:text-red-300" : "text-gray-600 dark:text-gray-300",
                                isActiveTrace && "bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-200 dark:border-green-800 leading-relaxed"
                              )}>
                                {isActiveTrace ? trace.agent_response : truncateText(trace.agent_response, 120)}
                              </div>
                            </div>
                          )}
                          {!trace.user_transcript && !trace.agent_response && (
                            <div className="text-sm text-gray-400 dark:text-gray-500 italic">
                              {trace.lesson_day ? `Lesson Day ${trace.lesson_day}` : 'System operation'}
                            </div>
                          )}
                        </div>
  
                        {/* Operations */}
                        <div className="col-span-1">
                          <div className="grid grid-cols-2 gap-1 text-[10px]">
                            {toolInfo.total > 0 && (
                              <div className="flex items-center gap-1 col-span-2">
                                <Wrench className="w-2 h-2 text-orange-600 dark:text-orange-400" />
                                <span className="font-medium text-orange-700 dark:text-orange-300">{toolInfo.total}</span>
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({toolInfo.successful}✓)
                                </span>
                              </div>
                            )}
                            {metrics.length > 0 && (
                              <>
                                {metrics.map((metric, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[8px] px-1 py-0 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                                    {metric.type}
                                  </Badge>
                                ))}
                              </>
                            )}
                            {spansLength > 0 && (
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 col-span-2">
                                {spansLength} spans
                              </div>
                            )}
                          </div>
                        </div>
  
                        {/* Enhanced Latency with Raw Values */}
                        <div className="col-span-1">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <span className={cn(
                                "text-xs font-semibold font-mono",
                                latency === 0 ? "text-gray-400 dark:text-gray-500" : 
                                latency > 5 ? "text-red-600 dark:text-red-400" :
                                latency > 2 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                              )}>
                                {latency > 0 ? formatLatencyValue(latency) : "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
  
                        {/* Cost */}
                        <div className="col-span-1">
                          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                            {trace.trace_cost_usd ? formatCost(parseFloat(trace.trace_cost_usd.toString())) : "N/A"}
                          </span>
                        </div>
  
                        {/* Status */}
                        <div className="col-span-1">
                          <div className="flex items-center pl-5">
                            {status === "bug_report" ? (
                              <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
                            ) : status === "error" ? (
                              <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                            ) : status === "warning" ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                            )}
                          </div>
                        </div>
  
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
        
        {activeTab === "trace" && (
          <SessionTraceView 
            trace={{...sessionTrace, spans: sessionSpans}} 
            loading={traceLoading || spansLoading} 
          />
        )}


        {activeTab === "waterfall" && (
          <WaterfallView 
            trace={{...sessionTrace, spans: sessionSpans}} 
            loading={traceLoading || spansLoading} 
          />
        )}
      </div>
  
      {/* Trace Detail Sheet */}
      <TraceDetailSheet
        isOpen={isDetailSheetOpen}
        trace={selectedTrace}
        agent={agent}
        recordingUrl={callData?.[0]?.recording_url || callData?.[0]?.voice_recording_url}
        callStartTime={callData?.[0]?.call_started_at}
        onClose={() => {
          setIsDetailSheetOpen(false)
          setSelectedTrace(null)
        }}
      />
    </>
  )
}

export default TracesTable