'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseQuery } from '../../hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SlidePanel, SlidePanelSection } from '@/components/ui/slide-panel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Clock, 
  Star, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  MoreHorizontal,
  Download,
  Filter,
  Eye,
  FileText,
  Users,
  Zap,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  FileSpreadsheet,
  Loader2,
  PieChart,
  Languages,
  Activity,
  Target,
  ChevronLeft,
  Timer
} from 'lucide-react'
import { query } from "../../lib/postgres"
import { DatabaseService } from "@/lib/database"
import * as XLSX from 'xlsx'
import { usePeriodFilterWithURL, PeriodFilterControlled } from '@/components/shared/PeriodFilter'

// Helper function to parse boolean from various formats
const parseBooleanScore = (value: any): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim()
    return lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1' || lowerValue === 'pass'
  }
  if (typeof value === 'number') return value !== 0
  return Boolean(value)
}

// Helper function to parse numeric score from various formats
const parseNumericScore = (value: any): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    // Remove percentage sign if present
    const cleaned = value.replace(/%/g, '').trim()
    const parsed = parseFloat(cleaned)
    return isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return 0
}

// Helper function to clean and parse reasoning text from LLM response
const parseReasoning = (reasoning: string | any): string => {
  if (!reasoning) return ''
  
  // If it's already a clean string, return it
  if (typeof reasoning === 'string') {
    let cleaned = reasoning.trim()
    
    // Try to parse as JSON if it looks like JSON
    if (cleaned.startsWith('{') || cleaned.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleaned)
        // Extract reasoning from parsed JSON
        if (parsed.reasoning) return parsed.reasoning.replace(/^[:\s]+/, '').trim()
        if (parsed.explanation) return parsed.explanation.replace(/^[:\s]+/, '').trim()
        if (parsed.analysis) return parsed.analysis.replace(/^[:\s]+/, '').trim()
        // If it's an object, stringify it nicely
        if (typeof parsed === 'object') {
          return JSON.stringify(parsed, null, 2)
        }
      } catch (e) {
        // Not valid JSON, continue with string cleaning
      }
    }
    
    // Remove common JSON artifacts
    cleaned = cleaned
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/\\n/g, '\n') // Convert escaped newlines
      .replace(/\\"/g, '"') // Convert escaped quotes
      .replace(/^\s*"reasoning"\s*:\s*"?|"?\s*$/g, '') // Remove "reasoning": prefix/suffix
      .replace(/^\s*"explanation"\s*:\s*"?|"?\s*$/g, '') // Remove "explanation": prefix/suffix
      .replace(/""\s*:\s*""/g, '') // Remove empty key-value pairs like "": ""
      .replace(/,\s*""\s*:\s*""\s*/g, '') // Remove ", "": """ patterns
      .replace(/\s*""\s*:\s*""\s*,?/g, '') // Remove "":" " patterns with optional comma
      .replace(/^\s*{\s*|\s*}\s*$/g, '') // Remove surrounding braces if present
      .replace(/^[:\s]+/, '') // Remove leading colons and whitespace
      .trim()
    
    return cleaned
  }
  
  // If it's an object, try to extract the reasoning field
  if (typeof reasoning === 'object') {
    if (reasoning.reasoning) return String(reasoning.reasoning).replace(/^[:\s]+/, '').trim()
    if (reasoning.explanation) return String(reasoning.explanation).replace(/^[:\s]+/, '').trim()
    if (reasoning.analysis) return String(reasoning.analysis).replace(/^[:\s]+/, '').trim()
    // Convert object to readable string
    return JSON.stringify(reasoning, null, 2)
  }
  
  return String(reasoning)
}


// Helper function to get scoring output type information
const getScoringOutputTypeInfo = (type: string) => {
  switch (type) {
    case 'bool':
      return {
        label: 'Boolean (True/False)',
        description: 'Simple pass/fail evaluation (true or false)',
        example: 'true, false',
        range: 'true or false',
        format: (value: any) => {
          const boolValue = parseBooleanScore(value)
          return boolValue ? '✅ True' : '❌ False'
        }
      }
    case 'int':
      return {
        label: 'Integer (Whole Numbers)',
        description: 'Discrete scoring with whole numbers',
        example: '1, 2, 3, 4, 5',
        range: 'Any whole number',
        format: (value: any) => `${Math.round(parseNumericScore(value))}`
      }
    case 'percentage':
      return {
        label: 'Percentage (0-100%)',
        description: 'Percentage-based scoring from 0 to 100',
        example: '85%, 92%, 67%',
        range: '0% to 100%',
        format: (value: any) => `${Math.round(parseNumericScore(value))}%`
      }
    case 'float':
      return {
        label: 'Float (Decimal Numbers)',
        description: 'Precise scoring with decimal values',
        example: '8.5, 9.2, 7.8',
        range: 'Any decimal number',
        format: (value: any) => `${parseNumericScore(value).toFixed(1)}`
      }
    default:
      return {
        label: 'Raw Value',
        description: 'Display raw value as-is',
        example: 'Various formats',
        range: 'Any value',
        format: (value: any) => String(value ?? 'N/A')
      }
  }
}

interface EvaluationJob {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_traces: number
  completed_traces: number
  failed_traces: number
  started_at: string
  completed_at: string
  created_at: string
  prompt_id: string
}

interface EvaluationResult {
  id: string
  trace_id: string
  call_id: string
  prompt_id: string
  evaluation_score: {
    overall_score?: number
    parsed_scores?: any
    evaluation_type?: string
    turn_latency?: {
      passed: boolean
      threshold: number
      maxLatency: number | null
      avgLatency?: number | null
      exceedingTurns?: number
      totalAssistantTurns: number
      violatingTurns: { turnIndex: number; role: string; latency: number }[]
    }
  }
  evaluation_reasoning: string
  raw_llm_response: string
  status: string
  created_at: string
  execution_time_ms?: number
  llm_cost_usd?: number
  error_message?: string
}

interface EvaluationSummary {
  evaluation_type: string
  avg_score: number
  min_score: number
  max_score: number
  total_evaluations: number
  pass_rate: number
  score_distribution: any
  top_issues: any[]
  recommendations: any[]
}

interface EvalsResultsProps {
  params: { projectid: string; agentid: string }
}

export default function EvalsResults({ params }: EvalsResultsProps) {
  const router = useRouter()
  const [selectedJobId, setSelectedJobId] = useState<string>('')
  const [selectedTranscript, setSelectedTranscript] = useState<{callId: string, transcript: string, translatedTranscript?: string} | null>(null)
  const [selectedRawResponse, setSelectedRawResponse] = useState<{callId: string, response: string} | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<{callId: string, result: EvaluationResult} | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [showTranslated, setShowTranslated] = useState<boolean>(false)
  
  // Period filter state (URL-based for consistency across pages)
  const {
    quickFilter,
    dateRange,
    isCustomRange,
    apiDateRange,
    handleQuickFilter,
    handleDateRangeSelect
  } = usePeriodFilterWithURL('7d')
  
  // Filter states
  const [filterType, setFilterType] = useState<string>('all')
  const [filterCallId, setFilterCallId] = useState<string>('')
  const [filterPassFail, setFilterPassFail] = useState<string>('all')
  const [filterMetricName, setFilterMetricName] = useState<string>('all')

  // Fetch project and agent info for header
  const { data: projectData, loading: projectLoading } = useSupabaseQuery('projects', {
    select: 'id, name',
    filters: [{ column: 'id', operator: 'eq', value: params.projectid }],
    limit: 1
  })

  const { data: agentData, loading: agentLoading } = useSupabaseQuery('pype_voice_agents', {
    select: 'id, name',
    filters: [{ column: 'id', operator: 'eq', value: params.agentid }],
    limit: 1
  })

  const projectName = projectData?.[0]?.name || 'Unknown Project'
  const agentName = agentData?.[0]?.name || 'Unknown Agent'

  // Fetch jobs
  const { data: jobs, loading: jobsLoading, refetch: refetchJobs } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: [
      { column: 'agent_id', operator: 'eq', value: params.agentid }
    ],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Fetch job details for selected job
  const { data: jobData, loading: jobLoading } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: selectedJobId 
      ? [{ column: 'id', operator: 'eq', value: selectedJobId }] 
      : [{ column: 'id', operator: 'eq', value: 'none' }], // Prevent fetching all jobs
    limit: 1
  })

  // Fetch evaluation summaries for selected job
  const { data: summaries, loading: summariesLoading } = useSupabaseQuery('pype_voice_evaluation_summaries', {
    select: '*',
    filters: selectedJobId 
      ? [{ column: 'job_id', operator: 'eq', value: selectedJobId }] 
      : [{ column: 'job_id', operator: 'eq', value: 'none' }] // Prevent fetching all summaries
  })

  // Fetch prompt details for selected job
  const { data: promptData, loading: promptLoading } = useSupabaseQuery('pype_voice_evaluation_prompts', {
    select: `
      id,
      name,
      description,
      evaluation_type,
      scoring_output_type,
      expected_output_format,
      scoring_criteria
    `,
    filters: jobData?.[0]?.prompt_id ? [{ column: 'id', operator: 'eq', value: jobData[0].prompt_id }] : [],
    limit: 1
  })

  // Fetch all prompts for the project to display prompt names in results
  const { data: allPrompts, loading: allPromptsLoading } = useSupabaseQuery('pype_voice_evaluation_prompts', {
    select: `
      id,
      name,
      evaluation_type,
      scoring_output_type
    `,
    filters: [
      { column: 'project_id', operator: 'eq', value: params.projectid }
    ]
  })

  // Create a lookup map for prompt details by ID
  const promptsMap = React.useMemo(() => {
    const map = new Map<string, { name: string; evaluation_type: string; scoring_output_type: string }>()
    if (allPrompts) {
      allPrompts.forEach((p: any) => {
        map.set(p.id, { name: p.name, evaluation_type: p.evaluation_type, scoring_output_type: p.scoring_output_type })
      })
    }
    return map
  }, [allPrompts])

  // Fetch detailed results for selected job
  // Only fetch when we have a valid selectedJobId to avoid fetching all results
  const { data: allResults, loading: resultsLoading } = useSupabaseQuery('pype_voice_evaluation_results', {
    select: `
      id,
      job_id,
      prompt_id,
      trace_id,
      call_id,
      agent_id,
      evaluation_score,
      evaluation_reasoning,
      raw_llm_response,
      execution_time_ms,
      llm_cost_usd,
      status,
      error_message,
      created_at
    `,
    filters: selectedJobId 
      ? [
          { column: 'job_id', operator: 'eq', value: selectedJobId },
          { column: 'agent_id', operator: 'eq', value: params.agentid }
        ] 
      : [
          // Fallback filter to prevent fetching ALL results when no job is selected
          { column: 'agent_id', operator: 'eq', value: params.agentid },
          { column: 'id', operator: 'eq', value: 'none' } // This ensures no results are returned
        ],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Helper function to determine if a result passes based on scoring type
  const isResultPassing = (result: EvaluationResult, scoringType: string = 'float') => {
    const score = result.evaluation_score?.overall_score
    if (scoringType === 'bool') {
      return score === 1 || String(score) === 'true' || String(score) === '1'
    }
    const numScore = Number(score) || 0
    return scoringType === 'percentage' ? numScore >= 70 : numScore >= 0.7
  }

  // Get metric names from configured prompts (Evals-Metrics)
  const availableMetrics = React.useMemo(() => {
    const metrics: string[] = []
    allPrompts?.forEach((prompt: any) => {
      if (prompt.name) {
        metrics.push(prompt.name)
      }
    })
    return metrics
  }, [allPrompts])

  // Apply filters to results
  // Note: Date range filtering is NOT applied when viewing results for a specific job
  // since the job_id already scopes the results appropriately
  const results = allResults?.filter((result: EvaluationResult) => {
    // Filter by evaluation type
    if (filterType !== 'all' && result.evaluation_score?.evaluation_type !== filterType) {
      return false
    }
    
    // Filter by call ID (if specified)
    if (filterCallId) {
      const callId = result.call_id || result.trace_id || ''
      if (!callId.toLowerCase().includes(filterCallId.toLowerCase())) {
        return false
      }
    }

    // Filter by pass/fail status
    if (filterPassFail !== 'all') {
      // Get the scoring type from the prompt associated with this result
      const resultPromptId = result.prompt_id
      const resultPromptInfo = promptsMap.get(resultPromptId)
      const scoringType = resultPromptInfo?.scoring_output_type || 'float'
      const isPassing = isResultPassing(result, scoringType)
      if (filterPassFail === 'pass' && !isPassing) return false
      if (filterPassFail === 'fail' && isPassing) return false
    }

    // Filter by specific metric name (prompt name)
    if (filterMetricName !== 'all') {
      // Find the prompt with this name and check if the result belongs to it
      const matchingPrompt = allPrompts?.find((p: any) => p.name === filterMetricName)
      if (!matchingPrompt || result.prompt_id !== matchingPrompt.id) {
        return false
      }
    }
    
    return true
  }) || []

  const selectedJob = jobData?.[0] as EvaluationJob
  const prompt = promptData?.[0]

  // Auto-select first job if none selected and jobs are available
  useEffect(() => {
    if (!selectedJobId && jobs && jobs.length > 0) {
      setSelectedJobId(jobs[0].id)
    }
  }, [jobs, selectedJobId])

  // Helper function to format score based on output type
  const formatScore = (score: any, outputType: string = 'float') => {
    if (score === null || score === undefined) return 'N/A'
    const formatter = getScoringOutputTypeInfo(outputType)
    return formatter.format(score)
  }

  // Helper function to get score value for calculations
  const getScoreValue = (score: any, outputType: string = 'float') => {
    if (score === null || score === undefined) return 0
    
    switch (outputType) {
      case 'bool':
        return parseBooleanScore(score) ? 1 : 0
      case 'percentage':
        return parseNumericScore(score)
      case 'int':
      case 'float':
      default:
        return parseNumericScore(score)
    }
  }

  const getScoreColor = (score: number, outputType: string = 'float', scale: number = 5) => {
    let percentage: number
    
    switch (outputType) {
      case 'bool':
        return score ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'
      case 'percentage':
        percentage = score
        break
      case 'int':
      case 'float':
      default:
        percentage = (score / scale) * 100
        break
    }
    
    if (percentage >= 80) return 'text-green-600 bg-green-50 border-green-200'
    if (percentage >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getScoreIcon = (score: number, outputType: string = 'float', scale: number = 5) => {
    let percentage: number
    
    switch (outputType) {
      case 'bool':
        return score ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />
      case 'percentage':
        percentage = score
        break
      case 'int':
      case 'float':
      default:
        percentage = (score / scale) * 100
        break
    }
    
    if (percentage >= 80) return <CheckCircle className="w-4 h-4 text-green-600" />
    if (percentage >= 60) return <AlertTriangle className="w-4 h-4 text-yellow-600" />
    return <XCircle className="w-4 h-4 text-red-600" />
  }

  const getEvaluationTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'quality':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'sentiment':
        return 'bg-pink-50 text-pink-700 border-pink-200'
      case 'accuracy':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'compliance':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const handleViewTranscript = async (callId: string, traceId?: string) => {
    try {
      console.log('🔍 [DEBUG] Starting transcript fetch for call_id:', callId, 'trace_id:', traceId)
      
      // Validate input
      if (!callId || callId === 'undefined' || callId === 'null') {
        console.error('❌ [ERROR] Invalid call_id provided:', callId)
        setSelectedTranscript({ callId: callId || 'unknown', transcript: 'Error: Invalid call ID provided. The call ID is missing or undefined.' })
        return
      }

      // For uploaded audio files, the trace_id is actually the call log ID (UUID)
      // and call_id starts with 'uploaded-'
      const isUploadedAudio = callId.startsWith('uploaded-')
      
      let callLogData: any[] = []
      
      if (isUploadedAudio && traceId) {
        // For uploaded audio, use the trace_id (which is the call log id) to fetch
        console.log('🔍 [DEBUG] Uploaded audio detected, fetching by id:', traceId)
        const callLogResponse = await fetch(`/api/call-logs?id=${traceId}&limit=1`)
        
        if (callLogResponse.ok) {
          const result = await callLogResponse.json()
          callLogData = result.data || []
        }
      }
      
      // Fallback: try fetching by call_id
      if (callLogData.length === 0) {
        console.log('🔍 [DEBUG] Fetching by call_id:', callId)
        const callLogResponse = await fetch(`/api/call-logs?call_id=${encodeURIComponent(callId)}&limit=1`)
        
        if (callLogResponse.ok) {
          const result = await callLogResponse.json()
          callLogData = result.data || []
        }
      }

      if (!callLogData || callLogData.length === 0) {
        // Last attempt: try using the callId as the actual id
        console.log('🔍 [DEBUG] Last attempt: fetching by id:', callId)
        const callLogResponse = await fetch(`/api/call-logs?id=${callId}&limit=1`)
        
        if (callLogResponse.ok) {
          const result = await callLogResponse.json()
          callLogData = result.data || []
        }
      }

      if (!callLogData || callLogData.length === 0) {
        setSelectedTranscript({ 
          callId, 
          transcript: `No call log found for call_id: "${callId}"\n\nThe call may not exist in the database or may not have been recorded properly.` 
        })
        return
      }

      const callLog = callLogData[0]
      const callLogId = callLog.id

      // For uploaded audio files, check transcript_json first
      if (callLog.transcript_json) {
        console.log('🔍 [DEBUG] Found transcript_json in call log')
        const transcriptData = typeof callLog.transcript_json === 'string' 
          ? JSON.parse(callLog.transcript_json) 
          : callLog.transcript_json
        
        let formattedTranscript = ''
        let formattedTranslatedTranscript = ''
        
        // Handle turns array format (from Python diarization backend)
        if (transcriptData?.turns && Array.isArray(transcriptData.turns)) {
          // Original transcript
          formattedTranscript = transcriptData.turns
            .map((turn: any) => {
              const role = (turn.role === 'agent' || turn.role === 'assistant') ? 'AGENT' : 'USER'
              const content = turn.content || turn.text || ''
              return `${role}: ${content}`
            })
            .join('\n\n')
          
          // Translated transcript - use translated_text if available for BOTH user and agent
          formattedTranslatedTranscript = transcriptData.turns
            .map((turn: any) => {
              const role = (turn.role === 'agent' || turn.role === 'assistant') ? 'AGENT' : 'USER'
              // Use translated_text for both user AND agent turns if available
              const content = turn.translated_text || turn.translation || turn.content || turn.text || ''
              return `${role}: ${content}`
            })
            .join('\n\n')
        } 
        // Handle array format directly
        else if (Array.isArray(transcriptData)) {
          formattedTranscript = transcriptData
            .map((item: any) => {
              if (item.role && item.content) {
                const role = (item.role === 'agent' || item.role === 'assistant') ? 'AGENT' : 'USER'
                return `${role}: ${item.content}`
              }
              // Order: AGENT first, then USER (assistant-user pattern as per call logs)
              const messages: string[] = []
              if (item.agent_response) messages.push(`AGENT: ${item.agent_response}`)
              if (item.user_transcript) messages.push(`USER: ${item.user_transcript}`)
              return messages.join('\n')
            })
            .filter(Boolean)
            .join('\n\n')
          
          // Translated version for array format - use translated_text for BOTH user and agent
          // Order: AGENT first, then USER (assistant-user pattern as per call logs)
          formattedTranslatedTranscript = transcriptData
            .map((item: any) => {
              if (item.role && item.content) {
                const role = (item.role === 'agent' || item.role === 'assistant') ? 'AGENT' : 'USER'
                // Use translated_text for both user AND agent turns if available
                const content = item.translated_text || item.translation || item.content
                return `${role}: ${content}`
              }
              // Order: AGENT first, then USER (assistant-user pattern as per call logs)
              const messages: string[] = []
              if (item.agent_response) {
                // Agent response translation - check for agent_translated_text or fall back
                const agentText = item.agent_translated_text || item.translated_agent_response || item.agent_response
                messages.push(`AGENT: ${agentText}`)
              }
              if (item.user_transcript) {
                const userText = item.translated_text || item.translation || item.user_transcript
                messages.push(`USER: ${userText}`)
              }
              return messages.join('\n')
            })
            .filter(Boolean)
            .join('\n\n')
        }
        
        if (formattedTranscript.trim()) {
          setSelectedTranscript({ 
            callId, 
            transcript: formattedTranscript,
            translatedTranscript: formattedTranslatedTranscript !== formattedTranscript ? formattedTranslatedTranscript : undefined
          })
          return
        }
      }

      // Step 2: Get transcript data from metrics logs using the call log ID as session_id
      const metricsResponse = await fetch(`/api/metrics-logs?session_id=${callLogId}&orderBy=unix_timestamp&order=asc`)
      
      if (!metricsResponse.ok) {
        console.error('❌ [ERROR] API error fetching transcript')
        setSelectedTranscript({ callId, transcript: 'Transcript API Error: Failed to fetch metrics logs' })
        return
      }

      const { data: transcriptTurns } = await metricsResponse.json()

      if (transcriptTurns && transcriptTurns.length > 0) {
        // Format the transcript data
        const formattedTranscript = transcriptTurns
          .filter((turn: any) => turn.user_transcript || turn.agent_response)
          .map((turn: any) => {
            const messages: string[] = []
            
            // Order: AGENT first, then USER (assistant-user pattern as per call logs)
            if (turn.agent_response && turn.agent_response.trim()) {
              messages.push(`AGENT: ${turn.agent_response}`)
            }
            if (turn.user_transcript && turn.user_transcript.trim()) {
              messages.push(`USER: ${turn.user_transcript}`)
            }
            
            return messages.join('\n')
          })
          .join('\n\n')

        // Format the translated transcript data
        // Order: AGENT first, then USER (assistant-user pattern as per call logs)
        const formattedTranslatedTranscript = transcriptTurns
          .filter((turn: any) => turn.translated_text || turn.user_transcript || turn.agent_response)
          .map((turn: any) => {
            const messages: string[] = []
            
            // Order: AGENT first, then USER (assistant-user pattern as per call logs)
            if (turn.agent_response && turn.agent_response.trim()) {
              // Agent responses typically don't need translation (they're already in the target language)
              messages.push(`AGENT: ${turn.agent_response}`)
            }
            // Use translated_text if available, otherwise fall back to original
            if (turn.user_transcript && turn.user_transcript.trim()) {
              const translatedUser = turn.translated_text && turn.user_transcript ? turn.translated_text : turn.user_transcript
              messages.push(`USER: ${translatedUser}`)
            }
            
            return messages.join('\n')
          })
          .join('\n\n')

        if (formattedTranscript.trim()) {
          setSelectedTranscript({ 
            callId, 
            transcript: formattedTranscript,
            translatedTranscript: formattedTranslatedTranscript !== formattedTranscript ? formattedTranslatedTranscript : undefined
          })
        } else {
          setSelectedTranscript({ callId, transcript: 'Empty Transcript: No meaningful conversation content found.' })
        }
      } else {
        setSelectedTranscript({ 
          callId, 
          transcript: `No transcript data found for this call.\n\nThe conversation may not have been recorded or processed properly.` 
        })
      }
    } catch (error) {
      console.error('💥 [FATAL ERROR] Unexpected error in handleViewTranscript:', error)
      setSelectedTranscript({ callId, transcript: 'Unexpected Error: ' + (error as Error).message })
    }
  }

  const handleViewRawResponse = (result: EvaluationResult) => {
    const rawResponse = result.raw_llm_response || 'No raw response available'
    setSelectedRawResponse({ 
      callId: result.call_id, 
      response: rawResponse 
    })
  }

  const handleDeleteJob = async () => {
    if (!selectedJobId) return
    
    setIsDeleting(true)
    try {
      // Delete evaluation results for this job
      const resultsResponse = await fetch(`/api/evaluations/jobs/${selectedJobId}`, {
        method: 'DELETE'
      })
      
      if (!resultsResponse.ok) {
        const result = await resultsResponse.json()
        throw new Error(result.error || 'Failed to delete evaluation job')
      }
      
      console.log('Evaluation job deleted successfully:', selectedJobId)
      
      // Reset state and refetch jobs
      setSelectedJobId('')
      setShowDeleteConfirm(false)
      refetchJobs()
    } catch (error: any) {
      console.error('Failed to delete evaluation job:', error)
      alert(`Failed to delete evaluation job: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Export single evaluation result to Excel
  const handleExportSingleResult = async (result: EvaluationResult) => {
    setIsExporting(true)
    
    try {
      const callId = result.call_id || result.trace_id || ''
      const traceId = result.trace_id || ''
      const promptDetails = promptsMap.get(result.prompt_id)
      const scoringOutputType = promptDetails?.scoring_output_type || prompt?.scoring_output_type || 'float'
      const metricName = promptDetails?.name || prompt?.name || 'Evaluation'
      
      // Get score value
      let scoreValue: any = result.evaluation_score?.overall_score
      if (scoreValue === undefined && result.evaluation_score?.parsed_scores) {
        const parsedScores = result.evaluation_score.parsed_scores
        if (typeof parsedScores === 'object' && parsedScores.score !== undefined) {
          scoreValue = parsedScores.score
        }
      }
      
      // Get raw LLM evaluation output (True/False, number, percentage, etc.)
      let llmEvaluationRaw = 'N/A'
      if (scoreValue !== null && scoreValue !== undefined) {
        if (scoringOutputType === 'bool') {
          llmEvaluationRaw = parseBooleanScore(scoreValue) ? 'True' : 'False'
        } else if (scoringOutputType === 'percentage') {
          llmEvaluationRaw = `${Math.round(parseNumericScore(scoreValue))}%`
        } else if (scoringOutputType === 'int') {
          llmEvaluationRaw = `${Math.round(parseNumericScore(scoreValue))}`
        } else {
          llmEvaluationRaw = `${parseNumericScore(scoreValue).toFixed(2)}`
        }
      }
      
      // Determine evaluation result (Pass/Fail)
      let evaluationResult = 'N/A'
      if (result.status === 'failed') {
        evaluationResult = 'Error'
      } else if (scoringOutputType === 'bool') {
        evaluationResult = parseBooleanScore(scoreValue) ? 'Pass' : 'Fail'
      } else if (scoringOutputType === 'percentage') {
        evaluationResult = parseNumericScore(scoreValue) >= 70 ? 'Pass' : 'Fail'
      } else {
        const numScore = parseNumericScore(scoreValue)
        evaluationResult = numScore >= 3 ? 'Pass' : 'Fail'
      }
      
      // Fetch transcript and audio metadata
      let transcript = ''
      let audioMetadata: any = {}
      let audioUrl = ''
      let audioName = ''
      let audioDuration = ''
      
      try {
        const isUploadedAudio = callId.startsWith('uploaded-')
        let callLogData: any = null
        
        if (isUploadedAudio && traceId) {
          const response = await fetch(`/api/call-logs?id=${traceId}&limit=1`)
          if (response.ok) {
            const data = await response.json()
            callLogData = data.data?.[0]
          }
        } else {
          const response = await fetch(`/api/call-logs?call_id=${encodeURIComponent(callId)}&limit=1`)
          if (response.ok) {
            const data = await response.json()
            callLogData = data.data?.[0]
          }
        }
        
        if (callLogData) {
          const transcriptData = callLogData.transcript_json || callLogData.transcript
          if (transcriptData) {
            if (typeof transcriptData === 'string') {
              transcript = transcriptData
            } else if (transcriptData.turns && Array.isArray(transcriptData.turns)) {
              transcript = transcriptData.turns
                .map((turn: any) => {
                  const role = (turn.role === 'agent' || turn.role === 'assistant') ? 'AGENT' : 'USER'
                  return `${role}: ${turn.content || turn.text || ''}`
                })
                .join('\n\n')
            } else if (Array.isArray(transcriptData)) {
              transcript = transcriptData
                .map((item: any) => {
                  if (item.role && item.content) {
                    const role = (item.role === 'agent' || item.role === 'assistant') ? 'AGENT' : 'USER'
                    return `${role}: ${item.content}`
                  }
                  const parts = []
                  if (item.user_transcript) parts.push(`USER: ${item.user_transcript}`)
                  if (item.agent_response) parts.push(`AGENT: ${item.agent_response}`)
                  return parts.join('\n')
                })
                .join('\n\n')
            }
          }
          
          audioName = callLogData.audio_file_name || callLogData.file_name || ''
          audioUrl = callLogData.audio_url || callLogData.s3_audio_url || ''
          audioDuration = callLogData.duration ? `${Math.round(callLogData.duration)}s` : ''
          audioMetadata = {
            sampleRate: callLogData.sample_rate,
            channels: callLogData.channels,
            format: callLogData.audio_format || callLogData.format,
            fileSize: callLogData.file_size,
            createdAt: callLogData.created_at
          }
        }
      } catch (error) {
        console.error('Error fetching transcript/audio data:', error)
      }
      
      const exportData = [{
        'Call ID': callId,
        'Trace ID': traceId,
        'Status': result.status,
        'Evaluation Result': evaluationResult,
        'LLM Evaluation': llmEvaluationRaw,
        'Metric Name': metricName,
        'Metric Type': promptDetails?.evaluation_type || prompt?.evaluation_type || 'N/A',
        'Scoring Type': getScoringOutputTypeInfo(scoringOutputType).label,
        'AI Reasoning': parseReasoning(result.evaluation_reasoning),
        'Transcript': transcript || 'No transcript available',
        'Audio File Name': audioName || 'N/A',
        'Audio URL': audioUrl || 'N/A',
        'Audio Duration': audioDuration || 'N/A',
        'Audio Format': audioMetadata.format || 'N/A',
        'Sample Rate': audioMetadata.sampleRate || 'N/A',
        'Execution Time (ms)': result.execution_time_ms || 'N/A',
        'LLM Cost (USD)': result.llm_cost_usd ? `$${Number(result.llm_cost_usd).toFixed(6)}` : 'N/A',
        'Error Message': result.error_message || '',
        'Evaluated At': new Date(result.created_at).toLocaleString()
      }]
      
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      
      worksheet['!cols'] = [
        { wch: 40 }, { wch: 40 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
        { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 60 }, { wch: 80 },
        { wch: 30 }, { wch: 50 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
        { wch: 18 }, { wch: 15 }, { wch: 40 }, { wch: 22 }
      ]
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Evaluation Result')
      
      const shortCallId = callId.substring(0, 8)
      const timestamp = new Date().toISOString().split('T')[0]
      XLSX.writeFile(workbook, `eval_${shortCallId}_${timestamp}.xlsx`)
      
    } catch (error: any) {
      console.error('Failed to export result:', error)
      alert(`Failed to export: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  // Export evaluation results to Excel
  const handleExportToExcel = async () => {
    if (!results || results.length === 0) {
      alert('No evaluation results to export')
      return
    }

    setIsExporting(true)
    
    try {
      // Group results by trace_id (audio file)
      const resultsByTraceId = new Map<string, EvaluationResult[]>()
      results.forEach((result: EvaluationResult) => {
        const traceId = result.trace_id || result.call_id || ''
        if (!resultsByTraceId.has(traceId)) {
          resultsByTraceId.set(traceId, [])
        }
        resultsByTraceId.get(traceId)!.push(result)
      })

      // Get all unique metric names for dynamic columns
      const allMetricNames = new Set<string>()
      results.forEach((result: EvaluationResult) => {
        const promptDetails = promptsMap.get(result.prompt_id)
        const metricName = promptDetails?.name || prompt?.name || 'Evaluation'
        allMetricNames.add(metricName)
      })
      const metricNamesArray = Array.from(allMetricNames).sort()

      // Build export data with one row per audio file
      const exportData: any[] = []
      
      for (const [traceId, traceResults] of resultsByTraceId) {
        const firstResult = traceResults[0]
        const callId = firstResult.call_id || traceId || ''
        
        // Fetch transcript and audio metadata once per audio file
        // Using same logic as handleViewTranscript
        let transcript = ''
        let audioFileId = ''
        let audioName = ''
        let audioDuration = ''
        
        try {
          const isUploadedAudio = callId.startsWith('uploaded-')
          let callLogData: any = null
          
          // Step 1: For uploaded audio, use the trace_id (which is the call log id) to fetch
          if (isUploadedAudio && traceId) {
            const response = await fetch(`/api/call-logs?id=${traceId}&limit=1`)
            if (response.ok) {
              const data = await response.json()
              callLogData = data.data?.[0]
            }
          }
          
          // Step 2: Fallback - try fetching by call_id
          if (!callLogData && callId) {
            const response = await fetch(`/api/call-logs?call_id=${encodeURIComponent(callId)}&limit=1`)
            if (response.ok) {
              const data = await response.json()
              callLogData = data.data?.[0]
            }
          }
          
          // Step 3: Last attempt - try using the callId/traceId as the actual id
          if (!callLogData && traceId) {
            const response = await fetch(`/api/call-logs?id=${callId}&limit=1`)
            if (response.ok) {
              const data = await response.json()
              callLogData = data.data?.[0]
            }
          }
          
          if (callLogData) {
            // Extract audio_file_id from metadata
            audioFileId = callLogData.metadata?.audio_file_id || callLogData.id || traceId
            
            // Extract transcript from transcript_json (same logic as handleViewTranscript)
            const transcriptData = callLogData.transcript_json
            if (transcriptData) {
              const parsedTranscript = typeof transcriptData === 'string' 
                ? JSON.parse(transcriptData) 
                : transcriptData
              
              // Handle turns array format (from Python diarization backend)
              if (parsedTranscript?.turns && Array.isArray(parsedTranscript.turns)) {
                transcript = parsedTranscript.turns
                  .map((turn: any) => {
                    const role = (turn.role === 'agent' || turn.role === 'assistant') ? 'AGENT' : 'USER'
                    const content = turn.content || turn.text || ''
                    return `${role}: ${content}`
                  })
                  .join('\n\n')
              } 
              // Handle array format directly
              else if (Array.isArray(parsedTranscript)) {
                transcript = parsedTranscript
                  .map((item: any) => {
                    if (item.role && item.content) {
                      const role = (item.role === 'agent' || item.role === 'assistant') ? 'AGENT' : 'USER'
                      return `${role}: ${item.content}`
                    }
                    const messages: string[] = []
                    if (item.user_transcript) messages.push(`USER: ${item.user_transcript}`)
                    if (item.agent_response) messages.push(`AGENT: ${item.agent_response}`)
                    return messages.join('\n')
                  })
                  .filter(Boolean)
                  .join('\n\n')
              }
            }
            
            // If still no transcript, try metrics-logs as fallback (same as handleViewTranscript)
            if (!transcript && callLogData.id) {
              const metricsResponse = await fetch(`/api/metrics-logs?session_id=${callLogData.id}&orderBy=unix_timestamp&order=asc`)
              if (metricsResponse.ok) {
                const { data: transcriptTurns } = await metricsResponse.json()
                if (transcriptTurns && transcriptTurns.length > 0) {
                  transcript = transcriptTurns
                    .filter((turn: any) => turn.user_transcript || turn.agent_response)
                    .map((turn: any) => {
                      const messages: string[] = []
                      if (turn.user_transcript && turn.user_transcript.trim()) {
                        messages.push(`USER: ${turn.user_transcript}`)
                      }
                      if (turn.agent_response && turn.agent_response.trim()) {
                        messages.push(`AGENT: ${turn.agent_response}`)
                      }
                      return messages.join('\n')
                    })
                    .join('\n\n')
                }
              }
            }
            
            // Extract audio metadata
            audioName = callLogData.metadata?.file_name ||
                       callLogData.recording_url?.split('/').pop() || 
                       callLogData.voice_recording_url?.split('/').pop() || 
                       ''
            audioDuration = callLogData.duration_seconds ? `${Math.round(callLogData.duration_seconds)}s` : ''
          }
        } catch (error) {
          console.error('Error fetching transcript/audio data for export:', error)
        }
        
        // Build row with common fields
        const row: any = {
          'Audio File ID': audioFileId || traceId,
          'Trace ID': traceId,
          'Audio File Name': audioName || 'N/A',
          'Audio Duration': audioDuration || 'N/A',
          'Transcript': transcript || 'No transcript available',
        }
        
        // Add metric columns dynamically
        let totalExecutionTime = 0
        let totalLlmCost = 0
        
        for (const metricName of metricNamesArray) {
          const metricResult = traceResults.find((r: EvaluationResult) => {
            const promptDetails = promptsMap.get(r.prompt_id)
            const name = promptDetails?.name || prompt?.name || 'Evaluation'
            return name === metricName
          })
          
          if (metricResult) {
            const promptDetails = promptsMap.get(metricResult.prompt_id)
            const scoringOutputType = promptDetails?.scoring_output_type || prompt?.scoring_output_type || 'float'
            
            // Get score value
            let scoreValue: any = metricResult.evaluation_score?.overall_score
            if (scoreValue === undefined && metricResult.evaluation_score?.parsed_scores) {
              const parsedScores = metricResult.evaluation_score.parsed_scores
              if (typeof parsedScores === 'object' && parsedScores.score !== undefined) {
                scoreValue = parsedScores.score
              }
            }
            
            // Format score based on type
            let formattedScore = 'N/A'
            if (scoreValue !== null && scoreValue !== undefined) {
              if (scoringOutputType === 'bool') {
                formattedScore = parseBooleanScore(scoreValue) ? 'True' : 'False'
              } else if (scoringOutputType === 'percentage') {
                formattedScore = `${Math.round(parseNumericScore(scoreValue))}%`
              } else if (scoringOutputType === 'int') {
                formattedScore = `${Math.round(parseNumericScore(scoreValue))}`
              } else {
                formattedScore = `${parseNumericScore(scoreValue).toFixed(2)}`
              }
            }
            
            // Add metric score column
            row[`${metricName} (Score)`] = formattedScore
            row[`${metricName} (Reasoning)`] = parseReasoning(metricResult.evaluation_reasoning)
            row[`${metricName} (Status)`] = metricResult.status
            
            // Accumulate costs
            if (metricResult.execution_time_ms) totalExecutionTime += metricResult.execution_time_ms
            if (metricResult.llm_cost_usd) totalLlmCost += Number(metricResult.llm_cost_usd)
          } else {
            row[`${metricName} (Score)`] = 'N/A'
            row[`${metricName} (Reasoning)`] = 'N/A'
            row[`${metricName} (Status)`] = 'N/A'
          }
        }
        
        // Add totals
        row['Total Execution Time (ms)'] = totalExecutionTime || 'N/A'
        row['Total LLM Cost (USD)'] = totalLlmCost > 0 ? `$${totalLlmCost.toFixed(6)}` : 'N/A'
        row['Evaluated At'] = new Date(firstResult.created_at).toLocaleString()
        
        exportData.push(row)
      }
      
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      
      // Build dynamic column widths based on actual columns
      const baseColumns = [
        { key: 'Audio File ID', wch: 40 },
        { key: 'Trace ID', wch: 40 },
        { key: 'Audio File Name', wch: 30 },
        { key: 'Audio Duration', wch: 15 },
        { key: 'Transcript', wch: 80 },
      ]
      
      // Add metric columns
      const metricColumns: { key: string, wch: number }[] = []
      metricNamesArray.forEach(metricName => {
        metricColumns.push({ key: `${metricName} (Score)`, wch: 20 })
        metricColumns.push({ key: `${metricName} (Reasoning)`, wch: 60 })
        metricColumns.push({ key: `${metricName} (Status)`, wch: 15 })
      })
      
      const endColumns = [
        { key: 'Total Execution Time (ms)', wch: 22 },
        { key: 'Total LLM Cost (USD)', wch: 18 },
        { key: 'Evaluated At', wch: 22 },
      ]
      
      const allColumns = [...baseColumns, ...metricColumns, ...endColumns]
      worksheet['!cols'] = allColumns.map(col => ({ wch: col.wch }))
      
      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Evaluation Results')
      
      // Add summary sheet
      const uniqueAudioFiles = resultsByTraceId.size
      const summaryData = [
        { 'Metric': 'Total Audio Files', 'Value': uniqueAudioFiles },
        { 'Metric': 'Total Evaluations', 'Value': results.length },
        { 'Metric': 'Metrics Evaluated', 'Value': metricNamesArray.join(', ') },
        { 'Metric': 'Completed', 'Value': results.filter((r: EvaluationResult) => r.status === 'completed').length },
        { 'Metric': 'Failed', 'Value': results.filter((r: EvaluationResult) => r.status === 'failed').length },
        { 'Metric': 'Job Name', 'Value': selectedJob?.name || 'N/A' },
        { 'Metric': 'Job Description', 'Value': selectedJob?.description || 'N/A' },
        { 'Metric': 'Prompt Name', 'Value': prompt?.name || 'N/A' },
        { 'Metric': 'Evaluation Type', 'Value': prompt?.evaluation_type || 'N/A' },
        { 'Metric': 'Scoring Output Type', 'Value': getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').label },
        { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() }
      ]
      const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData)
      summaryWorksheet['!cols'] = [{ wch: 25 }, { wch: 60 }]
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary')
      
      // Generate filename
      const jobName = selectedJob?.name?.replace(/[^a-zA-Z0-9]/g, '_') || 'evaluation'
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `${jobName}_results_${timestamp}.xlsx`
      
      // Download file
      XLSX.writeFile(workbook, filename)
      
      console.log(`Successfully exported ${results.length} evaluation results to ${filename}`)
    } catch (error: any) {
      console.error('Failed to export evaluation results:', error)
      alert(`Failed to export: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  if (jobsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <>
      <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Header Bar */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => router.back()}
                  className="flex items-center justify-center w-9 h-9 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-all duration-200"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                  {projectName} / {agentName}
                </h1>
              </div>
              <div className="flex items-center gap-4">
                {/* Period Filter */}
                <PeriodFilterControlled
                  quickFilter={quickFilter}
                  dateRange={dateRange}
                  isCustomRange={isCustomRange}
                  onQuickFilterChange={handleQuickFilter}
                  onDateRangeSelect={handleDateRangeSelect}
                />
                
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 border-blue-200 hover:bg-blue-50"
                  onClick={handleExportToExcel}
                  disabled={isExporting || !results || results.length === 0}
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  {isExporting ? 'Exporting...' : 'Export Excel'}
                </Button>
                <Button variant="outline" className="flex items-center gap-2 border-blue-200 hover:bg-blue-50">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
                {selectedJobId && (
                  <Button 
                    variant="outline" 
                    className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Run
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Evaluation Run Selector Bar */}
        {jobs && jobs.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-8 py-2">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Evaluation Run:</label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger className="w-72 border-blue-200 bg-white dark:bg-gray-800">
                  <SelectValue placeholder="Select an evaluation run" />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((job: EvaluationJob) => (
                    <SelectItem key={job.id} value={job.id}>
                      <div className="flex items-center gap-2">
                        <span>{job.name}</span>
                        <Badge className={`text-xs ${
                          job.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                          job.status === 'running' ? 'bg-blue-50 text-blue-700' :
                          job.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'
                        }`}>
                          {job.status}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto p-6">

          {/* No Jobs State */}
          {!jobs || jobs.length === 0 ? (
            <Card className="text-center py-12 bg-white border-blue-100">
              <CardContent>
                <Play className="w-12 h-12 text-blue-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-800 mb-2">No evaluation results yet</h3>
                <p className="text-slate-600 mb-4">Run your first evaluation to analyze conversation quality and performance.</p>
                <Button onClick={() => router.push(`/${params.projectid}/agents/${params.agentid}/evals-metrics`)} className="bg-blue-600 hover:bg-blue-700">
                  <Play className="w-4 h-4 mr-2" />
                  Create Evaluation
                </Button>
              </CardContent>
            </Card>
          ) : !selectedJobId ? (
            <Card className="text-center py-12 bg-white border-blue-100">
              <CardContent>
                <BarChart3 className="w-12 h-12 text-blue-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-800 mb-2">Select an evaluation run</h3>
                <p className="text-slate-600">Choose an evaluation run from the dropdown above to view results.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Job Summary Section */}
              {selectedJob && (
                <Card className="mb-8 bg-white border-blue-100 shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${
                          selectedJob.status === 'completed' ? 'bg-emerald-100' :
                          selectedJob.status === 'running' ? 'bg-blue-100' :
                          selectedJob.status === 'failed' ? 'bg-red-100' : 'bg-slate-100'
                        }`}>
                          {selectedJob.status === 'completed' ? (
                            <CheckCircle className="w-6 h-6 text-emerald-600" />
                          ) : selectedJob.status === 'running' ? (
                            <Clock className="w-6 h-6 text-blue-600 animate-spin" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-slate-800">{selectedJob.name}</h3>
                            <Badge className={`${
                              selectedJob.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                              selectedJob.status === 'running' ? 'bg-blue-50 text-blue-700' :
                              selectedJob.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'
                            }`}>
                              {selectedJob.status}
                            </Badge>
                          </div>
                          <p className="text-gray-600 mt-1">{selectedJob.description}</p>
                          {prompt && (
                            <div className="mt-3 flex flex-wrap items-center gap-4">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-gray-700">Prompt:</span>
                                <Badge variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
                                  {prompt.name}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-gray-700">Output Type:</span>
                                <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">
                                  {getScoringOutputTypeInfo(prompt.scoring_output_type || 'float').label}
                                </Badge>
                              </div>
                              {prompt.evaluation_type && (
                                <div className="flex items-center gap-2">
                                  <Star className="w-4 h-4 text-purple-600" />
                                  <span className="text-sm font-medium text-gray-700">Type:</span>
                                  <Badge variant="outline" className="text-purple-700 border-purple-200 bg-purple-50">
                                    {prompt.evaluation_type}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="grid grid-cols-3 gap-6 text-sm">
                          <div>
                            <div className="text-2xl font-bold text-gray-900">{selectedJob.total_traces}</div>
                            <div className="text-gray-500">Total Traces</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-600">{selectedJob.completed_traces}</div>
                            <div className="text-gray-500">Completed</div>
                          </div>
                          {selectedJob.failed_traces > 0 && (
                            <div>
                              <div className="text-2xl font-bold text-red-600">{selectedJob.failed_traces}</div>
                              <div className="text-gray-500">Failed</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Enhanced Summary Cards with Comprehensive Metrics - Compact Blue Theme */}
              {results && results.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-slate-800 mb-4">Evaluation Overview</h2>
                  <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {/* Overall Statistics */}
                      <div className="bg-gradient-to-br from-blue-50 to-white p-3 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Activity className="w-4 h-4 text-blue-500" />
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Performance</span>
                        </div>
                        <div className="text-xl font-bold text-blue-600">
                          {results.filter(r => r.status === 'completed').length}/{results.length}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {Math.round((results.filter(r => r.status === 'completed').length / results.length) * 100)}% success
                        </div>
                      </div>

                      {/* Average Score */}
                      <div className="bg-gradient-to-br from-indigo-50 to-white p-3 rounded-lg border border-indigo-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-4 h-4 text-indigo-500" />
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg Score</span>
                        </div>
                        {(() => {
                          const completedResults = results.filter(r => r.status === 'completed' && r.evaluation_score?.overall_score != null)
                          const avgScore = completedResults.length > 0 
                            ? completedResults.reduce((sum, r) => sum + (Number(r.evaluation_score?.overall_score) || 0), 0) / completedResults.length
                            : 0
                          return (
                            <>
                              <div className="text-xl font-bold text-indigo-600 flex items-center gap-1">
                                {formatScore(avgScore, prompt?.scoring_output_type)}
                                {getScoreIcon(getScoreValue(avgScore, prompt?.scoring_output_type), prompt?.scoring_output_type)}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                from {completedResults.length} evaluations
                              </div>
                            </>
                          )
                        })()}
                      </div>

                      {/* Performance Range */}
                      <div className="bg-gradient-to-br from-slate-50 to-white p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2 mb-1">
                          <BarChart3 className="w-4 h-4 text-slate-500" />
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Score Range</span>
                        </div>
                        {(() => {
                          const completedResults = results.filter(r => r.status === 'completed' && r.evaluation_score?.overall_score != null)
                          if (completedResults.length === 0) return <div className="text-sm text-slate-500">No data</div>
                          
                          const scores = completedResults.map(r => Number(r.evaluation_score?.overall_score) || 0)
                          const minScore = Math.min(...scores)
                          const maxScore = Math.max(...scores)
                          
                          return (
                            <>
                              <div className="text-xl font-bold text-slate-700">
                                {formatScore(minScore, prompt?.scoring_output_type)} - {formatScore(maxScore, prompt?.scoring_output_type)}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">min to max</div>
                            </>
                          )
                        })()}
                      </div>

                      {/* Execution Stats */}
                      <div className="bg-gradient-to-br from-emerald-50 to-white p-3 rounded-lg border border-emerald-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="w-4 h-4 text-emerald-500" />
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Execution</span>
                        </div>
                        {(() => {
                          const completedResults = results.filter(r => r.status === 'completed' && r.execution_time_ms)
                          const avgTime = completedResults.length > 0 
                            ? completedResults.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0) / completedResults.length
                            : 0
                          const totalCost = results.reduce((sum, r) => sum + (Number(r.llm_cost_usd) || 0), 0)
                          
                          return (
                            <>
                              <div className="text-xl font-bold text-emerald-600">{Math.round(avgTime)}ms</div>
                              <div className="text-xs text-slate-500 mt-1">${(totalCost || 0).toFixed(4)} total</div>
                            </>
                          )
                        })()}
                      </div>

                      {/* Turn Latency Stats */}
                      <div className="bg-gradient-to-br from-orange-50 to-white p-3 rounded-lg border border-orange-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Timer className="w-4 h-4 text-orange-500" />
                          <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Turn Latency</span>
                        </div>
                        {(() => {
                          // Group by call_id to get unique calls with turn latency
                          const callLatencyMap = new Map<string, any>()
                          results.filter(r => r.status === 'completed' && r.evaluation_score?.turn_latency && r.evaluation_score.turn_latency.totalAssistantTurns > 0)
                            .forEach(r => {
                              const callId = r.call_id || r.trace_id
                              if (!callLatencyMap.has(callId)) {
                                callLatencyMap.set(callId, r.evaluation_score?.turn_latency)
                              }
                            })
                          
                          const uniqueLatencies = Array.from(callLatencyMap.values())
                          if (uniqueLatencies.length === 0) return <div className="text-sm text-slate-500">No data</div>
                          
                          // Count passed/failed turn latency by unique calls
                          const passedLatency = uniqueLatencies.filter(tl => tl?.passed === true).length
                          const failedLatency = uniqueLatencies.length - passedLatency
                          const passRate = uniqueLatencies.length > 0 
                            ? Math.round((passedLatency / uniqueLatencies.length) * 100) 
                            : 0
                          
                          return (
                            <>
                              <div className={`text-xl font-bold ${passRate >= 70 ? 'text-orange-600' : 'text-red-600'}`}>
                                {passRate}%
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                {passedLatency}/{uniqueLatencies.length} calls pass
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                  {/* Filters */}
                  <Card className="mt-6 bg-white border-blue-100">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium flex items-center gap-2 text-slate-800">
                        <Filter className="w-5 h-5 text-blue-600" />
                        Filter Results
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Evaluation Type Filter */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Evaluation Type
                          </label>
                          <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="border-blue-200 bg-white">
                              <SelectValue placeholder="All types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Types</SelectItem>
                              {[...new Set(allResults?.map((r: EvaluationResult) => r.evaluation_score?.evaluation_type).filter(Boolean) || [])].map((type: any) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Date Filter - Now handled by Period Filter in header */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Date Range
                          </label>
                          <div className="px-3 py-2 border border-blue-100 rounded-md text-sm bg-blue-50/50 text-slate-600">
                            {apiDateRange.from} to {apiDateRange.to}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">Use Period filter above to change</p>
                        </div>

                        {/* Call ID Filter */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Call ID / Trace ID
                          </label>
                          <input
                            type="text"
                            value={filterCallId}
                            onChange={(e) => setFilterCallId(e.target.value)}
                            placeholder="Search by ID..."
                            className="w-full px-3 py-2 border border-blue-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          />
                        </div>

                        {/* Pass/Fail Filter */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Result Status
                          </label>
                          <Select value={filterPassFail} onValueChange={setFilterPassFail}>
                            <SelectTrigger className="border-blue-200 bg-white">
                              <SelectValue placeholder="All results" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Results</SelectItem>
                              <SelectItem value="pass">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                                  Pass (True)
                                </div>
                              </SelectItem>
                              <SelectItem value="fail">
                                <div className="flex items-center gap-2">
                                  <XCircle className="w-4 h-4 text-red-600" />
                                  Fail (False)
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Metric Name Filter */}
                        {availableMetrics.length > 0 && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Filter by Metric
                            </label>
                            <Select value={filterMetricName} onValueChange={setFilterMetricName}>
                              <SelectTrigger>
                                <SelectValue placeholder="All metrics" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Metrics</SelectItem>
                                {availableMetrics.map((metric: string) => (
                                  <SelectItem key={metric} value={metric}>
                                    {metric.replace(/_/g, ' ')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      
                      {(filterType !== 'all' || filterCallId || filterPassFail !== 'all' || filterMetricName !== 'all') && (
                        <div className="mt-4 flex items-center justify-between">
                          <div className="text-sm text-slate-600">
                            Showing {results.length} of {allResults?.length || 0} results
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-blue-200 hover:bg-blue-50"
                            onClick={() => {
                              setFilterType('all')
                              setFilterCallId('')
                              setFilterPassFail('all')
                              setFilterMetricName('all')
                            }}
                          >
                            Clear Filters
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Individual Trace Results - Tabular View */}
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Evaluation Results ({results?.length || 0})
                </h2>
                
                {resultsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : results?.length === 0 ? (
                  <Card className="text-center py-12 bg-white border-blue-100">
                    <CardContent>
                      <FileText className="w-12 h-12 text-blue-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-slate-800 mb-2">No results found</h3>
                      <p className="text-slate-600">This evaluation run has no individual trace results yet.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="bg-white border-blue-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Call ID</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Metric</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Score</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Details</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">View Transcript</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(() => {
                            // Group results by call_id and create rows for both LLM metrics and Turn Latency
                            const rows: React.ReactNode[] = []
                            const processedCalls = new Set<string>()
                            
                            results?.forEach((result: EvaluationResult) => {
                              const callId = result.call_id || result.trace_id
                              const resultPrompt = promptsMap.get(result.prompt_id) || { 
                                name: result.evaluation_score?.evaluation_type || 'Unknown', 
                                evaluation_type: result.evaluation_score?.evaluation_type || 'unknown',
                                scoring_output_type: prompt?.scoring_output_type || 'float'
                              }
                              
                              // Add Turn Latency row for this call (only once per call)
                              if (!processedCalls.has(callId) && result.evaluation_score?.turn_latency && result.evaluation_score.turn_latency.totalAssistantTurns > 0) {
                                processedCalls.add(callId)
                                const turnLatency = result.evaluation_score.turn_latency
                                rows.push(
                                  <tr key={`${result.id}-turn-latency`} className="hover:bg-orange-50/50 transition-colors bg-orange-50/20">
                                    <td className="px-4 py-3">
                                      <span className="font-mono text-xs text-slate-700">
                                        {(callId || 'N/A').slice(0, 20)}...
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                                        Turn Latency (static)
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm font-medium ${
                                        turnLatency.passed 
                                          ? 'bg-green-100 text-green-700' 
                                          : 'bg-red-100 text-red-700'
                                      }`}>
                                        {turnLatency.passed ? (
                                          <CheckCircle className="w-3.5 h-3.5" />
                                        ) : (
                                          <XCircle className="w-3.5 h-3.5" />
                                        )}
                                        {turnLatency.passed ? 'Pass' : 'Fail'}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <Badge variant="default" className="text-xs bg-slate-100 text-slate-700">
                                        completed
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 max-w-xs">
                                      <div className="text-xs text-slate-600">
                                        {turnLatency.passed ? (
                                          <span>All {turnLatency.totalAssistantTurns} assistant turns under {turnLatency.threshold}s threshold. Max: {turnLatency.maxLatency?.toFixed(2)}s</span>
                                        ) : (
                                          <div>
                                            <div className="text-red-600 font-medium mb-1">
                                              {turnLatency.violatingTurns?.length || 0} turn(s) exceeded {turnLatency.threshold}s threshold:
                                            </div>
                                            {turnLatency.violatingTurns?.slice(0, 3).map((turn, idx) => (
                                              <div key={idx} className="text-red-600">
                                                Turn #{turn.turnIndex + 1}: {turn.latency.toFixed(2)}s
                                              </div>
                                            ))}
                                            {(turnLatency.violatingTurns?.length || 0) > 3 && (
                                              <div className="text-red-500">+{(turnLatency.violatingTurns?.length || 0) - 3} more</div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="text-xs text-slate-500">
                                        {new Date(result.created_at).toLocaleDateString()}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => handleViewTranscript(result.call_id, result.trace_id)}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </Button>
                                    </td>
                                  </tr>
                                )
                              }
                              
                              // Add LLM metric row
                              rows.push(
                                <tr key={result.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <span className="font-mono text-xs text-slate-700">
                                      {(result.call_id || result.trace_id || 'N/A').slice(0, 20)}...
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                      {resultPrompt.name}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm font-medium ${getScoreColor(getScoreValue(result.evaluation_score?.overall_score, resultPrompt.scoring_output_type), resultPrompt.scoring_output_type)}`}>
                                      {getScoreIcon(getScoreValue(result.evaluation_score?.overall_score, resultPrompt.scoring_output_type), resultPrompt.scoring_output_type)}
                                      {formatScore(result.evaluation_score?.overall_score, resultPrompt.scoring_output_type)}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant={result.status === 'completed' ? 'default' : result.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                                      {result.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 max-w-xs">
                                    <span className="text-xs text-slate-600 line-clamp-2">
                                      {result.evaluation_reasoning ? parseReasoning(result.evaluation_reasoning).slice(0, 100) + '...' : '-'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-xs text-slate-500">
                                      {new Date(result.created_at).toLocaleDateString()}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1">
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => handleViewTranscript(result.call_id, result.trace_id)}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                      </Button>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                            <MoreHorizontal className="w-3.5 h-3.5" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem onClick={() => setSelectedDetails({ callId: result.call_id, result })}>
                                            <Eye className="w-4 h-4 mr-2" />
                                            More Details
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleViewRawResponse(result)}>
                                            <FileText className="w-4 h-4 mr-2" />
                                            Raw Response
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onClick={() => handleExportSingleResult(result)}>
                                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                                            Export to Excel
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })
                            
                            return rows
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>

      {/* Transcript Slide Panel */}
      <SlidePanel
        open={!!selectedTranscript}
        onClose={() => {
          setSelectedTranscript(null)
          setShowTranslated(false)
        }}
        title="Call Transcript"
        subtitle={selectedTranscript?.callId}
        width="xl"
      >
        <div className="p-6">
          {selectedTranscript?.translatedTranscript ? (
            <Tabs defaultValue="original" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4 bg-blue-50">
                <TabsTrigger value="original" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700">
                  <FileText className="w-4 h-4" />
                  Original
                </TabsTrigger>
                <TabsTrigger value="translated" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700">
                  <Languages className="w-4 h-4" />
                  Translated
                </TabsTrigger>
              </TabsList>
              <TabsContent value="original">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <pre className="whitespace-pre-wrap text-sm text-slate-800 font-mono leading-relaxed">
                    {selectedTranscript?.transcript}
                  </pre>
                </div>
              </TabsContent>
              <TabsContent value="translated">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <pre className="whitespace-pre-wrap text-sm text-slate-800 font-mono leading-relaxed">
                    {selectedTranscript?.translatedTranscript}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <pre className="whitespace-pre-wrap text-sm text-slate-800 font-mono leading-relaxed">
                {selectedTranscript?.transcript}
              </pre>
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  <Languages className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 italic">No translated version available for this transcript.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </SlidePanel>

      {/* Raw Response Slide Panel */}
      <SlidePanel
        open={!!selectedRawResponse}
        onClose={() => setSelectedRawResponse(null)}
        title="Raw LLM Response"
        subtitle={selectedRawResponse?.callId}
        width="xl"
      >
        <div className="p-6">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <pre className="whitespace-pre-wrap text-sm text-slate-800 font-mono leading-relaxed">
              {selectedRawResponse?.response}
            </pre>
          </div>
        </div>
      </SlidePanel>

      {/* More Details Slide Panel */}
      <SlidePanel
        open={!!selectedDetails}
        onClose={() => setSelectedDetails(null)}
        title="Evaluation Details"
        subtitle={selectedDetails?.callId}
        width="xl"
      >
        <div className="p-6 space-y-6">
          {selectedDetails?.result && (
            <>
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="text-sm text-blue-600 mb-1">Call ID / Trace ID</div>
                  <div className="font-medium text-slate-800">{selectedDetails.result.call_id || selectedDetails.result.trace_id || 'N/A'}</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="text-sm text-blue-600 mb-1">Evaluation Date</div>
                  <div className="font-medium text-slate-800">{new Date(selectedDetails.result.created_at).toLocaleString()}</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="text-sm text-blue-600 mb-1">Status</div>
                  <Badge variant={selectedDetails.result.status === 'completed' ? 'default' : selectedDetails.result.status === 'failed' ? 'destructive' : 'secondary'}>
                    {selectedDetails.result.status}
                  </Badge>
                </div>
              </div>

              {/* Performance Metrics */}
              <div className="bg-gradient-to-r from-blue-50 to-slate-50 p-4 rounded-lg border border-blue-100">
                <h3 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Performance Metrics
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Execution Time:</span>
                    <span className="font-medium text-slate-800">{selectedDetails.result.execution_time_ms ? `${selectedDetails.result.execution_time_ms}ms` : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">LLM Cost:</span>
                    <span className="font-medium text-slate-800">{selectedDetails.result.llm_cost_usd != null ? `$${Number(selectedDetails.result.llm_cost_usd).toFixed(4)}` : 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Detailed Scores (if available) */}
              {selectedDetails.result.evaluation_score?.parsed_scores && Object.keys(selectedDetails.result.evaluation_score.parsed_scores).length > 0 && (
                <div className="bg-gradient-to-r from-emerald-50 to-blue-50 p-4 rounded-lg border border-emerald-100">
                  <h3 className="font-medium text-emerald-800 mb-3 flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Detailed Scores ({getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').label})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(selectedDetails.result.evaluation_score.parsed_scores).map(([key, value]) => (
                      <div key={key} className="bg-white rounded p-3 border border-emerald-200 shadow-sm">
                        <div className="text-xs text-emerald-600 uppercase tracking-wide mb-1">{key.replace(/_/g, ' ')}</div>
                        <div className={`text-sm font-medium ${getScoreColor(getScoreValue(value, prompt?.scoring_output_type), prompt?.scoring_output_type)}`}>
                          {formatScore(value, prompt?.scoring_output_type)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Reasoning */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-medium text-slate-800 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  Full AI Reasoning
                </h3>
                {selectedDetails.result.evaluation_reasoning ? (
                  <div className="prose prose-sm max-w-none">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {parseReasoning(selectedDetails.result.evaluation_reasoning)}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 italic">
                    No reasoning provided by the AI model
                  </div>
                )}
              </div>

              {/* Error Details (if failed) */}
              {selectedDetails.result.status === 'failed' && selectedDetails.result.error_message && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                  <h3 className="font-medium text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Error Details
                  </h3>
                  <div className="text-sm text-red-700">
                    {selectedDetails.result.error_message}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SlidePanel>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Delete Evaluation Run
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete this evaluation run? This action cannot be undone.
            </p>
            <p className="text-sm text-gray-500">
              This will permanently delete:
            </p>
            <ul className="text-sm text-gray-500 list-disc list-inside mt-2">
              <li>All evaluation results for this run</li>
              <li>All summaries and metrics</li>
              <li>The evaluation job record</li>
            </ul>
          </div>
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteJob}
              disabled={isDeleting}
              className="flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete Run
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}