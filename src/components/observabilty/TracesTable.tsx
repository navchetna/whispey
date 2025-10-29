// src/components/observability/TracesTable.tsx
"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle, XCircle, AlertTriangle, Wrench, TrendingUp, Brain, Mic, Volume2, Activity, UserCheck, Bot } from "lucide-react"
import { OTelSpan } from "@/types/openTelemetry";
import { useSupabaseQuery } from "../../hooks/useSupabase"
import TraceDetailSheet from "./TraceDetailSheet/TraceDetailSheet"
import { cn } from "@/lib/utils"
import { useSessionSpans, useSessionTrace } from "@/hooks/useSessionTrace"
import SessionTraceView from "./SessionTraceView"
import WaterfallView from "./WaterFallView";
import { getAgentPlatform } from "@/utils/agentDetection";

interface TracesTableProps {
  agentId: string
  sessionId?: string
  agent?: any
  filters: {
    search: string
    status: string
    timeRange: string
  }
  // Audio sync props
  currentAudioTime?: number
  isAudioPlaying?: boolean
  callStartTime?: string
  onTurnClick?: (turnId: string, timestamp: number) => void
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
  currentAudioTime,
  isAudioPlaying,
  callStartTime,
  onTurnClick
}) => {

  const [selectedTrace, setSelectedTrace] = useState<TraceLog | null>(null)
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("turns");
  const tableContainerRef = useRef<HTMLDivElement>(null)

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

  // Enhanced audio sync functionality with comprehensive timing
  const getTraceTimestamp = (trace: TraceLog) => {
    if (!callStartTime) return 0
    
    // Use unix_timestamp if available (more accurate)
    if (trace.unix_timestamp) {
      const callStart = new Date(callStartTime).getTime() / 1000 // Convert to seconds
      return Math.max(0, trace.unix_timestamp - callStart)
    }
    
    // Fallback to created_at
    const callStart = new Date(callStartTime).getTime()
    const traceTime = new Date(trace.created_at).getTime()
    return Math.max(0, (traceTime - callStart) / 1000) // Convert to seconds
  }

  const getTraceDuration = (trace: TraceLog, nextTrace?: TraceLog) => {
    // Calculate comprehensive timing: STT + LLM + TTS TTFB + Audio Length + VAD End of Turn
    let totalDuration = 0
    
    // Speech to Text time (convert from ms to seconds)
    if (trace.stt_metrics?.duration) {
      totalDuration += trace.stt_metrics.duration / 1000
    }
    
    // LLM call time (convert from ms to seconds)
    if (trace.llm_metrics?.ttft) {
      totalDuration += trace.llm_metrics.ttft / 1000
    }
    
    // TTS Time to First Byte (convert from ms to seconds)
    if (trace.tts_metrics?.ttfb) {
      totalDuration += trace.tts_metrics.ttfb / 1000
    }
    
    // Overall audio duration (convert from ms to seconds)
    if (trace.tts_metrics?.audio_duration) {
      totalDuration += trace.tts_metrics.audio_duration / 1000
    }
    
    // VAD End of Turn delay (from next turn or current eou_metrics)
    if (nextTrace?.eou_metrics?.end_of_utterance_delay) {
      totalDuration += nextTrace.eou_metrics.end_of_utterance_delay / 1000
    } else if (trace.eou_metrics?.end_of_utterance_delay) {
      totalDuration += trace.eou_metrics.end_of_utterance_delay / 1000
    }
    
    // If no comprehensive metrics available, calculate from timestamps
    if (totalDuration === 0 && nextTrace) {
      const currentTime = getTraceTimestamp(trace)
      const nextTime = getTraceTimestamp(nextTrace)
      totalDuration = nextTime - currentTime
    }
    
    // Fallback to trace duration if available
    if (totalDuration === 0 && trace.trace_duration_ms) {
      totalDuration = trace.trace_duration_ms / 1000
    }
    
    // Minimum duration fallback (2 seconds for better sync)
    return Math.max(totalDuration, 2)
  }

  const getCurrentPlayingTrace = () => {
    if (!currentAudioTime || !callStartTime) return null
    
    for (let i = 0; i < processedTraces.length; i++) {
      const trace = processedTraces[i]
      const nextTrace = processedTraces[i + 1]
      
      const traceStartTime = getTraceTimestamp(trace)
      const traceDuration = getTraceDuration(trace, nextTrace)
      const traceEndTime = traceStartTime + traceDuration
      
      if (currentAudioTime >= traceStartTime && currentAudioTime < traceEndTime) {
        return trace
      }
    }
    
    return null
  }

  const getTraceProgress = (trace: TraceLog) => {
    if (!currentAudioTime || !callStartTime || !isAudioPlaying) return 0
    
    const traceStartTime = getTraceTimestamp(trace)
    const nextTrace = processedTraces[processedTraces.indexOf(trace) + 1]
    const traceDuration = getTraceDuration(trace, nextTrace)
    
    const elapsed = currentAudioTime - traceStartTime
    const progress = Math.max(0, Math.min(1, elapsed / traceDuration))
    
    return progress
  }

  const currentPlayingTrace = getCurrentPlayingTrace()

  // Enhanced auto-scroll with better highlighting and responsiveness
  useEffect(() => {
    if (currentPlayingTrace && isAudioPlaying && tableContainerRef.current) {
      const traceElement = document.querySelector(`[data-trace-id="${currentPlayingTrace.id}"]`) as HTMLElement
      if (traceElement && tableContainerRef.current) {
        // Calculate if element is visible in the scroll container
        const containerRect = tableContainerRef.current.getBoundingClientRect()
        const elementRect = traceElement.getBoundingClientRect()
        
        // Check if element is fully visible with some margin
        const margin = 50 // pixels
        const isVisible = (
          elementRect.top >= containerRect.top + margin &&
          elementRect.bottom <= containerRect.bottom - margin
        )
        
        // Only scroll if element is not visible or if it's the first update
        if (!isVisible) {
          // Use requestAnimationFrame for smoother scrolling
          requestAnimationFrame(() => {
            traceElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            })
          })
        }
        
        // Add visual pulse effect to the current playing trace
        traceElement.classList.add('playing-pulse')
        setTimeout(() => {
          traceElement.classList.remove('playing-pulse')
        }, 500)
      }
    }
  }, [currentPlayingTrace?.id, isAudioPlaying, currentAudioTime])

  // Enhanced debug timing information with more details
  useEffect(() => {
    if (currentPlayingTrace && currentAudioTime && isAudioPlaying) {
      const traceStartTime = getTraceTimestamp(currentPlayingTrace)
      const nextTrace = processedTraces[processedTraces.indexOf(currentPlayingTrace) + 1]
      const traceDuration = getTraceDuration(currentPlayingTrace, nextTrace)
      const progress = getTraceProgress(currentPlayingTrace)
      
      console.log(`🎵 Playing Turn ${currentPlayingTrace.turn_id}:`, {
        start: `${traceStartTime.toFixed(2)}s`,
        duration: `${traceDuration.toFixed(2)}s`,
        current: `${currentAudioTime.toFixed(2)}s`,
        progress: `${(progress * 100).toFixed(1)}%`,
        metrics: {
          stt: currentPlayingTrace.stt_metrics?.duration ? `${currentPlayingTrace.stt_metrics.duration}ms` : 'N/A',
          llm: currentPlayingTrace.llm_metrics?.ttft ? `${currentPlayingTrace.llm_metrics.ttft}ms` : 'N/A',
          tts: currentPlayingTrace.tts_metrics?.ttfb ? `${currentPlayingTrace.tts_metrics.ttfb}ms` : 'N/A',
        }
      })
    }
  }, [currentPlayingTrace?.id, Math.floor(currentAudioTime || 0)]) // Update every second

  const handleRowClick = (trace: TraceLog) => {
    // If audio sync is enabled and we have a turn click handler, use that
    if (onTurnClick && callStartTime) {
      const timestamp = getTraceTimestamp(trace)
      console.log(`Seeking to Turn ${trace.turn_id} at ${timestamp.toFixed(2)}s`)
      onTurnClick(trace.turn_id, timestamp)
    } else {
      // Handle bug report enrichment
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
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(1)}ms`
    return `${(ms / 1000).toFixed(2)}s`
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
    // Use our comprehensive timing calculation (returns in seconds, convert to ms)
    const nextTrace = processedTraces[processedTraces.indexOf(trace) + 1]
    const comprehensiveDuration = getTraceDuration(trace, nextTrace)
    return comprehensiveDuration * 1000 // Convert seconds to milliseconds for display consistency
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
          Error loading traces: {error}
        </div>
      </div>
    )
  }

  return (
    <>
      <style jsx>{`
        .playing-pulse {
          animation: playingPulse 0.5s ease-in-out;
        }
        
        @keyframes playingPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
        
        .trace-row-playing {
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
          border-left: 4px solid #3b82f6 !important;
        }
      `}</style>
      <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-2 flex-shrink-0">
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
        </div>
  
        {/* Tab Content */}
        {activeTab === "turns" && (
          <>
            {/* Header with Audio Sync Status */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-4 py-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <div className="grid grid-cols-12 gap-3 text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide flex-1">
                  <div className="col-span-1">Turn ID</div>
                  <div className="col-span-2">Trace Info</div>
                  <div className="col-span-4">Conversation</div>
                  <div className="col-span-2">Operations</div>
                  <div className="col-span-1">Latency</div>
                  <div className="col-span-1">Cost</div>
                  <div className="col-span-1">Status</div>
                </div>
                {/* Audio Sync Status */}
                {isAudioPlaying && currentPlayingTrace && (
                  <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 ml-4">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>Playing Turn {currentPlayingTrace.turn_id.replace('turn_', '')}</span>
                    <span className="text-gray-400">•</span>
                    <span>{currentAudioTime?.toFixed(1)}s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Table Body - Enhanced Auto-Scrolling */}
            <div ref={tableContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-gray-900 h-full scroll-smooth">
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
                    const isCurrentlyPlaying = currentPlayingTrace?.id === trace.id
                    const traceProgress = isCurrentlyPlaying ? getTraceProgress(trace) : 0
                    
                    return (
                      <div
                        key={trace.id}
                        data-trace-id={trace.id}
                        onClick={() => handleRowClick(trace)}
                        className={cn(
                          "grid grid-cols-12 gap-3 px-4 py-2.5 cursor-pointer border-l-2 transition-all text-sm relative hover:shadow-sm",
                          isCurrentlyPlaying 
                            ? "bg-blue-100 dark:bg-blue-900/20 border-l-blue-500 trace-row-playing"
                            : hasBugReport
                            ? "border-l-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20"
                            : "border-l-transparent hover:border-l-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10"
                        )}
                      >
                        {/* Progress bar for currently playing trace */}
                        {isCurrentlyPlaying && traceProgress > 0 && (
                          <div 
                            className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 rounded-r"
                            style={{ width: `${traceProgress * 100}%` }}
                          />
                        )}
                        {/* Turn ID with Timestamp */}
                        <div className="col-span-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {isCurrentlyPlaying && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            )}
                            <div className={cn(
                              "font-mono text-xs font-semibold",
                              isCurrentlyPlaying 
                                ? "text-blue-700 dark:text-blue-300"
                                : "text-gray-700 dark:text-gray-300"
                            )}>
                              Turn {trace.turn_id.replace('turn_', '')}
                            </div>
                          </div>
                          {/* Timestamp display */}
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                            {getTraceTimestamp(trace).toFixed(1)}s
                          </div>
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
                        <div className="col-span-4 space-y-2">
                          {trace.user_transcript && (
                            <div className="text-xs">
                              <div className="flex items-center gap-2 mb-1">
                                <UserCheck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span className="text-blue-600 dark:text-blue-400 font-medium text-xs">Evaluator</span>
                              </div>
                              <span className="ml-5 text-gray-800 dark:text-gray-200">{truncateText(trace.user_transcript, 60)}</span>
                            </div>
                          )}
                          {trace.agent_response && (
                            <div className={cn(
                              "text-xs",
                              hasBugReport && "text-red-700 dark:text-red-300 font-medium"
                            )}>
                              <div className="flex items-center gap-2 mb-1">
                                <Bot className={cn(
                                  "w-3 h-3",
                                  hasBugReport ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
                                )} />
                                <span className={cn(
                                  "font-medium text-xs",
                                  hasBugReport ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
                                )}>SUT</span>
                                {hasBugReport && (
                                  <Badge variant="destructive" className="text-[10px] px-1 py-0">
                                    REPORTED
                                  </Badge>
                                )}
                              </div>
                              <span className={cn(
                                "ml-5",
                                hasBugReport ? "text-red-800 dark:text-red-300" : "text-gray-600 dark:text-gray-300"
                              )}>{truncateText(trace.agent_response, 60)}</span>
                            </div>
                          )}
                          {!trace.user_transcript && !trace.agent_response && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                              {trace.lesson_day ? `Lesson Day ${trace.lesson_day}` : 'System operation'}
                            </div>
                          )}
                        </div>
  
                        {/* Operations */}
                        <div className="col-span-2 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {toolInfo.total > 0 && (
                              <div className="flex items-center gap-1 text-xs">
                                <Wrench className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                                <span className="font-medium text-orange-700 dark:text-orange-300">{toolInfo.total}</span>
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({toolInfo.successful}✓)
                                </span>
                              </div>
                            )}
                            {metrics.length > 0 && (
                              <div className="flex gap-1">
                                {metrics.map((metric, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[10px] px-1 py-0 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">
                                    {metric.type}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {spansLength > 0 ? `${spansLength} spans` : ""}
                          </div>
                        </div>
  
                        {/* Enhanced Latency with Timing Breakdown */}
                        <div className="col-span-1">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <span className={cn(
                                "text-xs font-semibold",
                                latency === 0 ? "text-gray-400 dark:text-gray-500" : 
                                latency > 5000 ? "text-red-600 dark:text-red-400" :
                                latency > 2000 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                              )}>
                                {latency > 0 ? formatDuration(latency) : "N/A"}
                              </span>
                              {isCurrentlyPlaying && (
                                <div className="w-1 h-1 bg-blue-500 rounded-full animate-ping"></div>
                              )}
                            </div>
                            
                            {/* Comprehensive timing breakdown for currently playing trace */}
                            {isCurrentlyPlaying && (
                              <div className="text-[10px] text-blue-600 dark:text-blue-300 space-y-0.5 border-l-2 border-blue-300 pl-2">
                                {trace.stt_metrics?.duration && (
                                  <div className="flex justify-between">
                                    <span>STT:</span>
                                    <span>{formatDuration(trace.stt_metrics.duration)}</span>
                                  </div>
                                )}
                                {trace.llm_metrics?.ttft && (
                                  <div className="flex justify-between">
                                    <span>LLM:</span>
                                    <span>{formatDuration(trace.llm_metrics.ttft)}</span>
                                  </div>
                                )}
                                {trace.tts_metrics?.ttfb && (
                                  <div className="flex justify-between">
                                    <span>TTS:</span>
                                    <span>{formatDuration(trace.tts_metrics.ttfb)}</span>
                                  </div>
                                )}
                                {trace.tts_metrics?.audio_duration && (
                                  <div className="flex justify-between">
                                    <span>Audio:</span>
                                    <span>{formatDuration(trace.tts_metrics.audio_duration)}</span>
                                  </div>
                                )}
                                {(trace.eou_metrics?.end_of_utterance_delay || processedTraces[processedTraces.indexOf(trace) + 1]?.eou_metrics?.end_of_utterance_delay) && (
                                  <div className="flex justify-between">
                                    <span>VAD:</span>
                                    <span>{formatDuration((trace.eou_metrics?.end_of_utterance_delay || processedTraces[processedTraces.indexOf(trace) + 1]?.eou_metrics?.end_of_utterance_delay || 0))}</span>
                                  </div>
                                )}
                                {/* Progress indicator */}
                                <div className="mt-1 pt-1 border-t border-blue-200">
                                  <div className="flex justify-between text-[9px]">
                                    <span>Progress:</span>
                                    <span>{(traceProgress * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="w-full bg-blue-100 rounded-full h-1 mt-0.5">
                                    <div 
                                      className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                                      style={{ width: `${traceProgress * 100}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
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