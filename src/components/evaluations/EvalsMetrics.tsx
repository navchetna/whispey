'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseQuery } from '../../hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SlidePanel } from '@/components/ui/slide-panel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { AlertCircle, Plus, Settings, MoreHorizontal, Edit2, Trash2, Copy, Eye, Brain, TrendingUp, BarChart3, Activity, CheckCircle, Clock, Users, Target, Languages, XCircle, Timer, Gauge, FileText, Download, CheckSquare, ChevronLeft } from 'lucide-react'
import { query } from "../../lib/postgres"
import { DatabaseService } from "@/lib/database"

// Utility functions
const getProviderDisplayName = (provider: string) => {
  switch (provider) {
    case 'openai':
      return 'OpenAI'
    case 'gemini':
      return 'Google Gemini'
    case 'groq':
      return 'Groq'
    default:
      return provider?.toUpperCase() || 'Unknown'
  }
}

const getScoringOutputTypeInfo = (type: string) => {
  switch (type) {
    case 'bool':
      return {
        label: 'Boolean (True/False)',
        description: 'Simple pass/fail evaluation (true or false)',
        example: 'true, false',
        range: 'true or false',
        successCriteriaOptions: ['true', 'false'],
        successCriteriaLabel: 'Success Value'
      }
    case 'int':
      return {
        label: 'Integer (Whole Numbers)',
        description: 'Discrete scoring with whole numbers',
        example: '1, 2, 3, 4, 5',
        range: 'Any whole number',
        successCriteriaOptions: ['higher_is_better', 'lower_is_better'],
        successCriteriaLabel: 'Success Direction'
      }
    case 'percentage':
      return {
        label: 'Percentage (0-100%)',
        description: 'Percentage-based scoring from 0 to 100',
        example: '85%, 92%, 67%',
        range: '0% to 100%',
        successCriteriaOptions: ['higher_is_better', 'lower_is_better'],
        successCriteriaLabel: 'Success Direction'
      }
    case 'float':
      return {
        label: 'Float (Decimal Numbers)',
        description: 'Precise scoring with decimal values',
        example: '8.5, 9.2, 7.8',
        range: 'Any decimal number',
        successCriteriaOptions: ['higher_is_better', 'lower_is_better'],
        successCriteriaLabel: 'Success Direction'
      }
    default:
      return {
        label: 'Unknown',
        description: '',
        example: '',
        range: '',
        successCriteriaOptions: [],
        successCriteriaLabel: ''
      }
  }
}

const getSuccessCriteriaDisplayText = (criteria: string) => {
  switch (criteria) {
    case 'true':
      return 'Success when True'
    case 'false':
      return 'Success when False'
    case 'higher_is_better':
      return 'Higher is Better'
    case 'lower_is_better':
      return 'Lower is Better'
    default:
      return criteria
  }
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

// Helper functions for metrics calculations
const calculateMetrics = (results: any[], summaries: any[], prompts: any[], jobs: any[]) => {
  const totalEvaluations = results?.length || 0
  const completedEvaluations = results?.filter(r => r.status === 'completed')?.length || 0
  const failedEvaluations = results?.filter(r => r.status === 'failed')?.length || 0
  const pendingEvaluations = results?.filter(r => r.status === 'pending')?.length || 0
  const successRate = totalEvaluations > 0 ? (completedEvaluations / totalEvaluations * 100).toFixed(1) : '0'
  
  // Calculate average score across all completed evaluations
  // Handle different score types: overall_score, score, and boolean values
  const completedResults = results?.filter(r => {
    if (r.status !== 'completed') return false
    const score = r.evaluation_score?.overall_score ?? r.evaluation_score?.score
    return score != null
  }) || []
  
  const averageScore = completedResults.length > 0 
    ? (completedResults.reduce((sum, r) => {
        const score = r.evaluation_score?.overall_score ?? r.evaluation_score?.score
        // Handle boolean scores
        if (typeof score === 'boolean') return sum + (score ? 1 : 0)
        return sum + (parseNumericScore(score) || 0)
      }, 0) / completedResults.length).toFixed(1)
    : '0'
  
  // Get unique prompts that have been used
  const activePrompts = prompts?.filter(p => p.is_active && results?.some(r => r.prompt_id === p.id)) || []
  const totalPrompts = prompts?.length || 0
  
  // Recent evaluations (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const recentEvaluations = results?.filter(r => new Date(r.created_at) > sevenDaysAgo)?.length || 0
  
  // Job metrics
  const totalJobs = jobs?.length || 0
  const completedJobs = jobs?.filter(j => j.status === 'completed')?.length || 0
  const runningJobs = jobs?.filter(j => j.status === 'running')?.length || 0
  
  // Calculate score range - handle different score types
  const scores = completedResults.map(r => {
    const score = r.evaluation_score?.overall_score ?? r.evaluation_score?.score
    if (typeof score === 'boolean') return score ? 1 : 0
    return parseNumericScore(score) || 0
  })
  const minScore = scores.length > 0 ? Math.min(...scores).toFixed(1) : '0'
  const maxScore = scores.length > 0 ? Math.max(...scores).toFixed(1) : '0'
  
  return {
    totalEvaluations,
    completedEvaluations,
    failedEvaluations,
    pendingEvaluations,
    successRate,
    averageScore,
    minScore,
    maxScore,
    activePrompts: activePrompts.length,
    totalPrompts,
    recentEvaluations,
    totalJobs,
    completedJobs,
    runningJobs
  }
}

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

const formatScore = (score: any, outputType: string = 'float') => {
  if (score == null) return 'N/A'
  
  switch (outputType) {
    case 'bool':
      const boolValue = parseBooleanScore(score)
      return boolValue ? '✅ Pass' : '❌ Fail'
    case 'int':
      return Math.round(parseNumericScore(score)).toString()
    case 'percentage':
      return `${Math.round(parseNumericScore(score))}%`
    case 'float':
    default:
      return parseNumericScore(score).toFixed(1)
  }
}

interface EvaluationPrompt {
  id: string
  name: string
  description: string
  evaluation_type: string
  prompt_template: string
  llm_provider: string
  model: string
  api_url: string
  api_key: string
  scoring_output_type: string
  success_criteria: string
  temperature: number
  max_tokens: number
  expected_output_format: any
  scoring_criteria: any
  is_active: boolean
  created_at: string
}

interface EvalsMetricsProps {
  params: { projectid: string; agentid: string }
}

// Static metric configuration interface
interface StaticMetricConfig {
  id: string
  name: string
  description: string
  enabled: boolean
  threshold: number
  unit: string
}

export default function EvalsMetrics({ params }: EvalsMetricsProps) {
  const router = useRouter()
  const [showCreatePrompt, setShowCreatePrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<EvaluationPrompt | null>(null)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([])
  const [selectedTranscript, setSelectedTranscript] = useState<{callId: string, transcript: string, translatedTranscript?: string} | null>(null)
  const [showTranslated, setShowTranslated] = useState<boolean>(false)

  // Static metrics state
  const [staticMetrics, setStaticMetrics] = useState<StaticMetricConfig[]>([
    {
      id: 'turn_latency',
      name: 'Turn Latency',
      description: 'All individual turn latencies must be less than the threshold',
      enabled: true,
      threshold: 5,
      unit: 'seconds'
    }
  ])
  const [editingStaticMetric, setEditingStaticMetric] = useState<StaticMetricConfig | null>(null)

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

  // Fetch prompts
  const { data: prompts, loading: promptsLoading, refetch: refetchPrompts } = useSupabaseQuery('pype_voice_evaluation_prompts', {
    select: `
      id,
      name,
      description,
      evaluation_type,
      prompt_template,
      llm_provider,
      model,
      api_url,
      api_key,
      scoring_output_type,
      temperature,
      max_tokens,
      expected_output_format,
      scoring_criteria,
      is_active,
      created_at
    `,
    filters: [
      { column: 'project_id', operator: 'eq', value: params.projectid }
    ],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Fetch evaluation jobs for this agent
  const { data: evaluationJobs, loading: jobsLoading } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: `
      id,
      name,
      description,
      status,
      total_traces,
      completed_traces,
      failed_traces,
      started_at,
      completed_at,
      created_at,
      prompt_id
    `,
    filters: [
      { column: 'project_id', operator: 'eq', value: params.projectid },
      { column: 'agent_id', operator: 'eq', value: params.agentid }
    ],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Fetch evaluation results for this agent
  const { data: evaluationResults, loading: resultsLoading } = useSupabaseQuery('pype_voice_evaluation_results', {
    select: `
      id,
      trace_id,
      call_id,
      evaluation_score,
      evaluation_reasoning,
      status,
      created_at,
      prompt_id,
      job_id
    `,
    filters: [
      { column: 'agent_id', operator: 'eq', value: params.agentid }
    ],
    orderBy: { column: 'created_at', ascending: false },
    limit: 1000
  })

  // Fetch evaluation summaries for this agent
  const { data: evaluationSummaries, loading: summariesLoading } = useSupabaseQuery('pype_voice_evaluation_summaries', {
    select: `
      id,
      prompt_id,
      total_evaluations,
      average_score,
      min_score,
      max_score,
      pass_rate,
      last_updated,
      score_distribution
    `,
    filters: [
      { column: 'project_id', operator: 'eq', value: params.projectid },
      { column: 'agent_id', operator: 'eq', value: params.agentid }
    ]
  })

  const handleEditPrompt = (prompt: EvaluationPrompt) => {
    // Navigate to the edit page instead of opening a dialog
    router.push(`/${params.projectid}/agents/${params.agentid}/evals-metrics/${prompt.id}/edit`)
  }

  const handleDuplicatePrompt = (prompt: EvaluationPrompt) => {
    const duplicatedPrompt = {
      ...prompt,
      id: '', // Clear the ID for new prompt
      name: `${prompt.name} (Copy)`,
      created_at: ''
    }
    setEditingPrompt(duplicatedPrompt)
    setShowCreatePrompt(true)
  }

  const handlePreviewPrompt = (prompt: EvaluationPrompt) => {
    // TODO: Implement preview functionality
    alert(`Preview functionality for "${prompt.name}" coming soon!`)
  }

  const handleDeletePrompt = async (prompt: EvaluationPrompt) => {
    if (confirm(`Are you sure you want to delete "${prompt.name}"?`)) {
      try {
        const response = await fetch(`/api/evaluations/prompts/${prompt.id}`, {
          method: 'DELETE'
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || 'Failed to delete prompt')
        }

        console.log('Prompt deleted successfully:', prompt.id)
        refetchPrompts()
      } catch (error: any) {
        console.error('Failed to delete prompt:', error)
        alert(`Failed to delete prompt: ${error.message}`)
      }
    }
  }

  const handleCreateJob = async (jobData: any) => {
    try {
      const response = await fetch('/api/evaluations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...jobData,
          project_id: params.projectid,
          agent_id: params.agentid,
          prompt_ids: selectedPrompts
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create evaluation job')
      }
      
      console.log('Evaluation job created successfully:', result.data)
      setShowCreateJob(false)
      setSelectedPrompts([]) // Clear selection
      
      // Optionally redirect to results page after job creation
      router.push(`/${params.projectid}/agents/${params.agentid}/evals-results`)
    } catch (error) {
      console.error('Failed to create evaluation job:', error)
      alert(`Failed to create evaluation job: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
        
        // Handle turns array format (from Python diarization backend)
        if (transcriptData?.turns && Array.isArray(transcriptData.turns)) {
          formattedTranscript = transcriptData.turns
            .map((turn: any) => {
              const role = (turn.role === 'agent' || turn.role === 'assistant') ? 'AGENT' : 'USER'
              const content = turn.content || turn.text || ''
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
              const messages: string[] = []
              if (item.user_transcript) messages.push(`USER: ${item.user_transcript}`)
              if (item.agent_response) messages.push(`AGENT: ${item.agent_response}`)
              return messages.join('\n')
            })
            .filter(Boolean)
            .join('\n\n')
        }
        
        if (formattedTranscript.trim()) {
          setSelectedTranscript({ callId, transcript: formattedTranscript })
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
            
            if (turn.user_transcript && turn.user_transcript.trim()) {
              messages.push(`USER: ${turn.user_transcript}`)
            }
            if (turn.agent_response && turn.agent_response.trim()) {
              messages.push(`AGENT: ${turn.agent_response}`)
            }
            
            return messages.join('\n')
          })
          .join('\n\n')

        // Format the translated transcript data
        const formattedTranslatedTranscript = transcriptTurns
          .filter((turn: any) => turn.translated_text || turn.user_transcript || turn.agent_response)
          .map((turn: any) => {
            const messages: string[] = []
            
            // Use translated_text if available, otherwise fall back to original
            if (turn.user_transcript && turn.user_transcript.trim()) {
              const translatedUser = turn.translated_text && turn.user_transcript ? turn.translated_text : turn.user_transcript
              messages.push(`USER: ${translatedUser}`)
            }
            if (turn.agent_response && turn.agent_response.trim()) {
              // Agent responses typically don't need translation (they're already in the target language)
              messages.push(`AGENT: ${turn.agent_response}`)
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

  return (
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
            <div className="flex gap-3">
              <Button 
                onClick={() => {
                  router.push(`/${params.projectid}/agents/${params.agentid}/evals-metrics/new/edit`)
                }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                New Metric
              </Button>
              <Button 
                onClick={() => setShowCreateJob(true)}
                variant="outline"
                className="flex items-center gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/20"
                disabled={!prompts || prompts.length === 0}
                title={!prompts || prompts.length === 0 ? "Create evaluation prompts first" : "Run evaluation on your agent's conversations"}
              >
                <Eye className="w-4 h-4" />
                Run Evaluation
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto p-6">

        {/* Content */}
        <div className="space-y-6">
          {(promptsLoading || resultsLoading || jobsLoading) ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-slate-600 mt-2">Loading evaluation data...</p>
              </div>
            </div>
          ) : prompts?.length === 0 ? (
            <Card className="text-center py-12 bg-white border-blue-100">
              <CardContent>
                <Brain className="w-12 h-12 text-blue-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-800 mb-2">No evaluation prompts yet</h3>
                <p className="text-slate-600 mb-4">Create your first evaluation prompt to start analyzing your voice agent conversations.</p>
                <Button onClick={() => router.push(`/${params.projectid}/agents/${params.agentid}/evals-metrics/new/edit`)} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Prompt
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Settings className="w-4 h-4 text-gray-600" />
                  Metrics - LLM-as-Judge
                </h2>
                <span className="text-xs text-gray-500">{prompts?.length ?? 0} prompt{(prompts?.length ?? 0) !== 1 ? 's' : ''} configured</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {prompts?.map((prompt: EvaluationPrompt) => (
                <Card key={prompt.id} className="hover:shadow-sm transition-shadow">
                  <CardHeader className="p-2 pb-1">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xs font-medium mb-1">{prompt.name}</CardTitle>
                        <Badge className={`text-[10px] px-1.5 py-0 ${getEvaluationTypeColor(prompt.evaluation_type)}`}>
                          {prompt.evaluation_type}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
                            <MoreHorizontal className="w-3 h-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditPrompt(prompt)}>
                            <Edit2 className="w-3 h-3 mr-1.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicatePrompt(prompt)}>
                            <Copy className="w-3 h-3 mr-1.5" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePreviewPrompt(prompt)}>
                            <Eye className="w-3 h-3 mr-1.5" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeletePrompt(prompt)}
                          >
                            <Trash2 className="w-3 h-3 mr-1.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 pt-0">
                    <p className="text-[10px] text-gray-600 mb-2 line-clamp-2">
                      {prompt.description}
                    </p>
                    
                    {/* Evaluation Stats for this prompt */}
                    {(() => {
                      const promptResults = evaluationResults?.filter(r => r.prompt_id === prompt.id) || []
                      const completedResults = promptResults.filter(r => r.status === 'completed')
                      const avgScore = completedResults.length > 0 
                        ? (completedResults.reduce((sum, r) => {
                            const score = r.evaluation_score?.overall_score ?? r.evaluation_score?.score
                            if (typeof score === 'boolean') return sum + (score ? 1 : 0)
                            return sum + (parseNumericScore(score) || 0)
                          }, 0) / completedResults.length)
                        : 0
                      
                      if (promptResults.length > 0) {
                        return (
                          <div className="mb-2 p-1.5 bg-blue-50 border border-blue-200 rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-medium text-blue-900">Stats</span>
                              <Users className="w-3 h-3 text-blue-600" />
                            </div>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                              <div>
                                <span className="text-blue-700">Total:</span> {promptResults.length}
                              </div>
                              <div>
                                <span className="text-blue-700">Done:</span> {completedResults.length}
                              </div>
                              <div>
                                <span className="text-blue-700">Avg:</span> {avgScore > 0 ? formatScore(avgScore, prompt.scoring_output_type) : 'N/A'}
                              </div>
                              <div>
                                <span className="text-blue-700">Pass:</span> {promptResults.length > 0 ? Math.round(completedResults.length / promptResults.length * 100) : 0}%
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>{getProviderDisplayName(prompt.llm_provider)}</span>
                        <span>{prompt.model}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>{getScoringOutputTypeInfo(prompt.scoring_output_type || 'float').label}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${prompt.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {prompt.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ))}
              </div>

              {/* Static Metrics Section */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-orange-600" />
                      Metrics - Static
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-0.5">Non-prompt based metrics with configurable thresholds</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  {staticMetrics.map((metric) => (
                    <Card key={metric.id} className={`hover:shadow-sm transition-shadow ${metric.enabled ? 'border-orange-200 bg-orange-50/30' : 'border-gray-200 bg-gray-50/30'}`}>
                      <CardContent className="p-2">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-1">
                            <Timer className="w-3 h-3 text-orange-600" />
                            <span className="text-xs font-medium text-gray-900">{metric.name}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => setEditingStaticMetric(metric)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-gray-600 mb-2 line-clamp-2">
                          {metric.description}
                        </p>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-gray-500">Threshold:</span>
                          <span className="font-medium text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded text-[10px]">
                            {metric.threshold}{metric.unit}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${metric.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {metric.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
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

        {/* Create/Edit Prompt Dialog */}
        <CreatePromptDialog 
          open={showCreatePrompt}
          onOpenChange={setShowCreatePrompt}
          projectId={params.projectid}
          agentId={params.agentid}
          onSuccess={() => {
            refetchPrompts()
            setEditingPrompt(null)
          }}
          editPrompt={editingPrompt}
          isEdit={!!(editingPrompt && editingPrompt.id)}
        />

        {/* Create Job Dialog */}
        <CreateJobDialog 
          open={showCreateJob}
          onOpenChange={setShowCreateJob}
          prompts={prompts || []}
          selectedPrompts={selectedPrompts}
          onSelectedPromptsChange={setSelectedPrompts}
          onSubmit={handleCreateJob}
          params={params}
        />

        {/* Edit Static Metric Dialog */}
        <Dialog open={!!editingStaticMetric} onOpenChange={(open) => !open && setEditingStaticMetric(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-orange-600" />
                Edit Static Metric
              </DialogTitle>
            </DialogHeader>
            {editingStaticMetric && (
              <div className="space-y-4 mt-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Metric Name</Label>
                  <p className="text-sm text-gray-900 mt-1 font-medium">{editingStaticMetric.name}</p>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700">Description</Label>
                  <p className="text-sm text-gray-600 mt-1">{editingStaticMetric.description}</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="threshold" className="text-sm font-medium text-gray-700">
                    Threshold ({editingStaticMetric.unit})
                  </Label>
                  <Input
                    id="threshold"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="60"
                    value={editingStaticMetric.threshold}
                    onChange={(e) => {
                      const newThreshold = parseFloat(e.target.value) || 5
                      setEditingStaticMetric({
                        ...editingStaticMetric,
                        threshold: newThreshold
                      })
                    }}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Success Criteria: All individual turn latencies must be less than {editingStaticMetric.threshold} {editingStaticMetric.unit}
                  </p>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                    Enable Metric
                  </Label>
                  <button
                    id="enabled"
                    onClick={() => {
                      setEditingStaticMetric({
                        ...editingStaticMetric,
                        enabled: !editingStaticMetric.enabled
                      })
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      editingStaticMetric.enabled ? 'bg-orange-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        editingStaticMetric.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setEditingStaticMetric(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      // Update the static metrics
                      setStaticMetrics(prev => 
                        prev.map(m => 
                          m.id === editingStaticMetric.id ? editingStaticMetric : m
                        )
                      )
                      setEditingStaticMetric(null)
                    }}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
    </div>
  )
}

// Create/Edit Prompt Dialog Component
function CreatePromptDialog({ open, onOpenChange, projectId, agentId, onSuccess, editPrompt = null, isEdit = false }: any) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    evaluation_type: 'quality',
    prompt_template: `Please evaluate the following customer service conversation for overall quality.

**Conversation Transcript:**
{{transcript}}

**Evaluation Criteria:**
- Overall conversation quality (1-10)
- Agent professionalism and helpfulness
- Problem resolution effectiveness
- Communication clarity

**Instructions:**
Analyze the conversation and provide your evaluation in the following JSON format:

{
  "score": <overall_score_from_1_to_10>,
  "reasoning": "<detailed_explanation_of_your_evaluation>"
}

Provide only the JSON response, nothing else.`,
    llm_provider: 'openai',
    model: 'gpt-4o-mini',
    api_url: 'https://api.openai.com/v1',
    api_key: '',
    scoring_output_type: 'float',
    success_criteria: 'higher_is_better',
    temperature: 0.0,
    max_tokens: 1000
  })

  // Initialize form data when editing a prompt
  useEffect(() => {
    if (isEdit && editPrompt && open) {
      setFormData({
        name: editPrompt.name || '',
        description: editPrompt.description || '',
        evaluation_type: editPrompt.evaluation_type || 'quality',
        prompt_template: editPrompt.prompt_template || '',
        llm_provider: editPrompt.llm_provider || 'openai',
        model: editPrompt.model || 'gpt-4o-mini',
        api_url: editPrompt.api_url || 'https://api.openai.com/v1',
        api_key: editPrompt.api_key || '',
        scoring_output_type: editPrompt.scoring_output_type || 'float',
        success_criteria: editPrompt.success_criteria || (editPrompt.scoring_output_type === 'bool' ? 'true' : 'higher_is_better'),
        temperature: editPrompt.temperature || 0.0,
        max_tokens: editPrompt.max_tokens || 1000
      })
    } else if (editPrompt && !isEdit && open) {
      // Duplicate case - populate form but treat as new prompt
      setFormData({
        name: editPrompt.name || '',
        description: editPrompt.description || '',
        evaluation_type: editPrompt.evaluation_type || 'quality',
        prompt_template: editPrompt.prompt_template || '',
        llm_provider: editPrompt.llm_provider || 'openai',
        model: editPrompt.model || 'gpt-4o-mini',
        api_url: editPrompt.api_url || 'https://api.openai.com/v1',
        api_key: editPrompt.api_key || '',
        scoring_output_type: editPrompt.scoring_output_type || 'float',
        success_criteria: editPrompt.success_criteria || (editPrompt.scoring_output_type === 'bool' ? 'true' : 'higher_is_better'),
        temperature: editPrompt.temperature || 0.0,
        max_tokens: editPrompt.max_tokens || 1000
      })
    } else if (!isEdit && open) {
      // Reset to default values for create mode
      setFormData({
        name: '',
        description: '',
        evaluation_type: 'quality',
        prompt_template: `Please evaluate the following customer service conversation for overall quality.

**Conversation Transcript:**
{{transcript}}

**Evaluation Criteria:**
- Overall conversation quality (1-10)
- Agent professionalism and helpfulness
- Problem resolution effectiveness
- Communication clarity

**Instructions:**
Analyze the conversation and provide your evaluation in the following JSON format:

{
  "score": <overall_score_from_1_to_10>,
  "reasoning": "<detailed_explanation_of_your_evaluation>"
}

Provide only the JSON response, nothing else.`,
        llm_provider: 'openai',
        model: 'gpt-4o-mini',
        api_url: 'https://api.openai.com/v1',
        api_key: '',
        scoring_output_type: 'float',
        success_criteria: 'higher_is_better',
        temperature: 0.0,
        max_tokens: 1000
      })
    }
  }, [isEdit, editPrompt, open])

  // Provider-specific model options
  const getModelOptions = (provider: string) => {
    switch (provider) {
      case 'openai':
        return [
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
          { value: 'gpt-4o', label: 'GPT-4o' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
          { value: 'gpt-4', label: 'GPT-4' }
        ]
      case 'gemini':
        return [
          // Gemini 2.5 models (latest)
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
          // Gemini 2.0 models
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
          { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
          { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' }
        ]
      case 'groq':
        return [
          // Most Popular Production Models
          { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
          { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
          { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
          { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
          { value: 'gemma2-9b-it', label: 'Gemma 2 9B' }
        ]
      default:
        return []
    }
  }

  // Get default API URL for provider
  const getDefaultApiUrl = (provider: string) => {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1'
      case 'gemini':
        return 'https://generativelanguage.googleapis.com/v1beta/'
      case 'groq':
        return 'https://api.groq.com/openai/v1'
      default:
        return ''
    }
  }

  // Handle provider change
  const handleProviderChange = (provider: string) => {
    const models = getModelOptions(provider)
    setFormData({
      ...formData,
      llm_provider: provider,
      model: models.length > 0 ? models[0].value : '',
      api_url: getDefaultApiUrl(provider)
    })
  }

  // Generate expected output format based on scoring type
  const getExpectedOutputFormat = (scoringType: string) => {
    const baseFormat = { reasoning: 'string' }
    
    switch (scoringType) {
      case 'bool':
        return {
          type: 'json',
          schema: { ...baseFormat, score: 'boolean' },
          example: { score: true, reasoning: 'The response was accurate and helpful.' }
        }
      case 'int':
        return {
          type: 'json',
          schema: { ...baseFormat, score: 'integer' },
          example: { score: 4, reasoning: 'Good quality with minor improvements needed.' }
        }
      case 'percentage':
        return {
          type: 'json',
          schema: { ...baseFormat, score: 'number', format: 'percentage' },
          example: { score: 85, reasoning: 'Performs well with 85% accuracy.' }
        }
      case 'float':
      default:
        return {
          type: 'json',
          schema: { ...baseFormat, score: 'number' },
          example: { score: 8.5, reasoning: 'High quality response with excellent accuracy.' }
        }
    }
  }

  // Generate scoring criteria based on output type
  const getScoringCriteria = (scoringType: string) => {
    switch (scoringType) {
      case 'bool':
        return { type: 'boolean', options: ['true', 'false'] }
      case 'int':
        return { type: 'integer', range: 'Any whole number', scale: '1-5 recommended' }
      case 'percentage':
        return { type: 'percentage', range: '0-100', scale: '0% to 100%' }
      case 'float':
      default:
        return { type: 'numeric', range: 'Any decimal number', scale: '1-10 recommended' }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Debug: Log the form data before submission
    console.log('Form data before submission:', formData)
    console.log('Project ID:', projectId)
    console.log('Agent ID:', agentId)
    
    // Validate required fields before sending
    if (!formData.name?.trim()) {
      alert('Please enter a prompt name')
      return
    }
    if (!formData.prompt_template?.trim()) {
      alert('Please enter a prompt template')
      return
    }
    
    // Validate that the template includes the transcript variable
    if (!formData.prompt_template.includes('{{transcript}}')) {
      alert('Your prompt template must include {{transcript}} variable to pass the conversation to the LLM. Please add {{transcript}} to your template where you want the conversation to appear.')
      return
    }
    if (!formData.llm_provider) {
      alert('Please select an LLM provider')
      return
    }
    if (!formData.model) {
      alert('Please select a model')
      return
    }
    if (!formData.api_key?.trim()) {
      alert('Please enter an API key for the selected LLM provider')
      return
    }
    
    // Validate API key format based on provider
    if (formData.llm_provider === 'openai' && !formData.api_key.startsWith('sk-')) {
      alert('OpenAI API keys should start with "sk-". Please check your API key.')
      return
    }
    if (formData.llm_provider === 'gemini' && !formData.api_key.startsWith('AIza')) {
      alert('Google Gemini API keys should start with "AIza". Please check your API key.')
      return
    }
    if (formData.llm_provider === 'groq' && !formData.api_key.startsWith('gsk_')) {
      alert('Groq API keys should start with "gsk_". Please check your API key.')
      return
    }
    if (!projectId) {
      alert('Project ID is missing. Please refresh the page and try again.')
      return
    }
    
    const payload = {
      ...formData,
      project_id: projectId,
      agent_id: agentId,
      expected_output_format: getExpectedOutputFormat(formData.scoring_output_type),
      scoring_criteria: getScoringCriteria(formData.scoring_output_type)
    }
    
    // Debug: Log the payload being sent
    console.log('API payload:', payload)
    
    try {
      const endpoint = isEdit ? `/api/evaluations/prompts/${editPrompt?.id}` : '/api/evaluations/prompts'
      const method = isEdit ? 'PUT' : 'POST'
      
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${isEdit ? 'update' : 'create'} prompt`)
      }
      
      console.log(`Evaluation prompt ${isEdit ? 'updated' : 'created'} successfully:`, result.data)
      onOpenChange(false)
      onSuccess()
      
      // Only reset form for create mode
      if (!isEdit) {
        setFormData({
          name: '',
          description: '',
          evaluation_type: 'quality',
          prompt_template: `Please evaluate the following customer service conversation for overall quality.

**Conversation Transcript:**
{{transcript}}

**Evaluation Criteria:**
- Overall conversation quality (1-10)
- Agent professionalism and helpfulness
- Problem resolution effectiveness
- Communication clarity

**Instructions:**
Analyze the conversation and provide your evaluation in the following JSON format:

{
  "score": <overall_score_from_1_to_10>,
  "reasoning": "<detailed_explanation_of_your_evaluation>"
}

Provide only the JSON response, nothing else.`,
          llm_provider: 'openai',
          model: 'gpt-4o-mini',
          api_url: 'https://api.openai.com/v1',
          api_key: '',
          scoring_output_type: 'float',
          success_criteria: 'higher_is_better',
          temperature: 0.0,
          max_tokens: 1000
        })
      }
    } catch (error: any) {
      console.error(`Failed to ${isEdit ? 'update' : 'create'} evaluation prompt:`, error)
      
      // Handle specific error types
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
      }
      
      // Show helpful message for missing tables
      if (errorMessage.includes('evaluation tables not found') || errorMessage.includes('PGRST205')) {
        alert(`Database Setup Required!\n\nThe evaluation system tables need to be created first.\n\nPlease:\n1. Open your Supabase SQL Editor\n2. Run the 'evaluation-schema.sql' script\n3. Try ${isEdit ? 'updating' : 'creating'} the prompt again\n\nError: ${errorMessage}`)
      } else {
        alert(`Failed to ${isEdit ? 'update' : 'create'} evaluation prompt: ${errorMessage}`)
      }
    }
  }

  const testConnection = async () => {
    if (!formData.llm_provider || !formData.model || !formData.api_key) {
      alert('Please fill in provider, model, and API key before testing')
      return
    }

    try {
      const response = await fetch('/api/evaluations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          llm_provider: formData.llm_provider,
          model: formData.model,
          api_key: formData.api_key,
          api_url: formData.api_url
        })
      })

      const result = await response.json()

      if (response.ok) {
        alert('✅ Connection successful! Your API key and configuration are working.')
      } else {
        alert(`❌ Connection failed: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`❌ Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Evaluation Prompt' : 'Create Evaluation Metric'}</DialogTitle>
        </DialogHeader>
        
        {isEdit ? (
          // Edit mode - show the form directly without tabs
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Prompt Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Conversation Quality Check"
                  required
                />
              </div>
            <div>
              <Label htmlFor="evaluation_type">Evaluation Type</Label>
              <Select 
                value={formData.evaluation_type} 
                onValueChange={(value) => setFormData({ ...formData, evaluation_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">Quality</SelectItem>
                  <SelectItem value="sentiment">Sentiment</SelectItem>
                  <SelectItem value="accuracy">Accuracy</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="scoring_output_type">Scoring Output Type</Label>
            <Select 
              value={formData.scoring_output_type} 
              onValueChange={(value) => {
                // Auto-update success criteria based on output type
                const defaultCriteria = value === 'bool' ? 'true' : 'higher_is_better'
                setFormData({ 
                  ...formData, 
                  scoring_output_type: value,
                  success_criteria: defaultCriteria
                })
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select output type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bool">Boolean (True/False)</SelectItem>
                <SelectItem value="int">Integer (Whole Numbers)</SelectItem>
                <SelectItem value="percentage">Percentage (0-100%)</SelectItem>
                <SelectItem value="float">Float (Decimal Numbers)</SelectItem>
              </SelectContent>
            </Select>
            {formData.scoring_output_type && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
                <p><strong>{getScoringOutputTypeInfo(formData.scoring_output_type).label}</strong></p>
                <p className="text-blue-700 mt-1">{getScoringOutputTypeInfo(formData.scoring_output_type).description}</p>
                <p className="mt-1"><span className="text-blue-600">Example:</span> {getScoringOutputTypeInfo(formData.scoring_output_type).example}</p>
                <p><span className="text-blue-600">Range:</span> {getScoringOutputTypeInfo(formData.scoring_output_type).range}</p>
              </div>
            )}
          </div>

          {/* Success Criteria Field */}
          {formData.scoring_output_type && (
            <div>
              <Label htmlFor="success_criteria">
                {getScoringOutputTypeInfo(formData.scoring_output_type).successCriteriaLabel || 'Success Criteria'}
              </Label>
              <Select 
                value={formData.success_criteria} 
                onValueChange={(value) => {
                  setFormData({ ...formData, success_criteria: value })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select success criteria" />
                </SelectTrigger>
                <SelectContent>
                  {getScoringOutputTypeInfo(formData.scoring_output_type).successCriteriaOptions?.map((option) => (
                    <SelectItem key={option} value={option}>
                      {getSuccessCriteriaDisplayText(option)}
                    </SelectItem>
                  )) || []}
                </SelectContent>
              </Select>
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded text-xs">
                <p className="text-green-700">
                  <strong>Current Setting:</strong> {getSuccessCriteriaDisplayText(formData.success_criteria)}
                </p>
                {formData.scoring_output_type === 'bool' && (
                  <p className="text-green-600 mt-1">
                    This determines which boolean value (true or false) indicates a successful evaluation.
                  </p>
                )}
                {(formData.scoring_output_type === 'int' || formData.scoring_output_type === 'percentage' || formData.scoring_output_type === 'float') && (
                  <p className="text-green-600 mt-1">
                    This determines whether higher scores or lower scores indicate better performance.
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of what this evaluation measures"
            />
          </div>

          <div>
            <Label htmlFor="prompt_template">Prompt Template</Label>
            <Textarea
              id="prompt_template"
              value={formData.prompt_template}
              onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
              placeholder={`Enter your evaluation prompt template. Use {{transcript}} to include the conversation.

Example template:
Please evaluate the following customer service conversation for quality and professionalism.

**Conversation Transcript:**
{{transcript}}

**Evaluation Criteria:**
- Politeness and professionalism (1-10)
- Problem resolution effectiveness (1-10) 
- Communication clarity (1-10)

**Instructions:**
Provide your evaluation in JSON format:
{
  "score": <overall_score_from_1_to_10>,
  "reasoning": "<detailed_explanation>",
  "politeness": <1-10>,
  "effectiveness": <1-10>,
  "clarity": <1-10>
}

**Important:** The conversation transcript will be automatically inserted where {{transcript}} appears.`}
              rows={12}
              className="font-mono text-sm"
              required
            />
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <p className="font-semibold text-amber-800 mb-1">💡 Template Variables Available:</p>
              <ul className="text-amber-700 space-y-1 text-xs">
                <li><code className="bg-amber-100 px-1 rounded">{'{{transcript}}'}</code> - The full conversation transcript (Required)</li>
                <li><code className="bg-amber-100 px-1 rounded">{'{{callId}}'}</code> - Unique call identifier</li>
                <li><code className="bg-amber-100 px-1 rounded">{'{{duration}}'}</code> - Call duration in seconds</li>
                <li><code className="bg-amber-100 px-1 rounded">{'{{customerNumber}}'}</code> - Customer phone number (if available)</li>
              </ul>
              <p className="text-amber-700 mt-2 text-xs">
                <strong>⚠️ Important:</strong> Your template must include <code className="bg-amber-100 px-1 rounded">{'{{transcript}}'}</code> 
                for the conversation to be evaluated. Without this, the LLM will only see the instructions.
              </p>
            </div>
            {formData.prompt_template && !formData.prompt_template.includes('{{transcript}}') && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm">
                <p className="text-red-800 font-semibold">⚠️ Missing Transcript Variable</p>
                <p className="text-red-700 text-xs mt-1">
                  Your template doesn't include <code className="bg-red-100 px-1 rounded">{'{{transcript}}'}</code>. 
                  The LLM won't receive the conversation content to evaluate. Add this variable to your template.
                </p>
              </div>
            )}
          </div>

          {/* LLM Provider Configuration */}
          <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">LLM Configuration</h3>
            
            {/* Provider Info Box */}
            {formData.llm_provider && (
              <div className="text-xs p-3 rounded bg-blue-50 border border-blue-200">
                {formData.llm_provider === 'openai' && (
                  <p><strong>OpenAI:</strong> Requires an API key from OpenAI. Best for general-purpose evaluations with high accuracy.</p>
                )}
                {formData.llm_provider === 'gemini' && (
                  <p><strong>Google Gemini:</strong> Requires a Google AI API key. Excellent for complex reasoning and multimodal tasks.</p>
                )}
                {formData.llm_provider === 'groq' && (
                  <p><strong>Groq:</strong> Fast inference with open-source models. Great for high-throughput evaluations.</p>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="llm_provider">Provider</Label>
                <Select 
                  value={formData.llm_provider} 
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="model">Model</Label>
                <Select 
                  value={formData.model} 
                  onValueChange={(value) => setFormData({ ...formData, model: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {getModelOptions(formData.llm_provider).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="api_url">API URL</Label>
              <Input
                id="api_url"
                value={formData.api_url}
                onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                placeholder="e.g., https://api.openai.com/v1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Base URL for the API endpoint (auto-filled based on provider)
              </p>
            </div>

            <div>
              <Label htmlFor="api_key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api_key"
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Enter your API key"
                  required
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={testConnection}
                  disabled={!formData.api_key || !formData.llm_provider || !formData.model}
                >
                  Test
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Your API key will be stored securely and encrypted
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Controls randomness (0.0 = deterministic, 2.0 = very random)
              </p>
            </div>
            <div>
              <Label htmlFor="max_tokens">Max Tokens</Label>
              <Input
                id="max_tokens"
                type="number"
                min="1"
                max="4096"
                value={formData.max_tokens}
                onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of tokens in the response
              </p>
            </div>
          </div>

          {/* Configuration Summary */}
          {formData.name && formData.llm_provider && formData.model && (
            <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Configuration Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-blue-700">Name:</span> {formData.name}</div>
                <div><span className="text-blue-700">Type:</span> {formData.evaluation_type}</div>
                <div><span className="text-blue-700">Provider:</span> {getProviderDisplayName(formData.llm_provider)}</div>
                <div><span className="text-blue-700">Model:</span> {formData.model}</div>
                <div><span className="text-blue-700">Output Type:</span> {getScoringOutputTypeInfo(formData.scoring_output_type).label}</div>
                <div><span className="text-blue-700">Temperature:</span> {formData.temperature}</div>
                <div><span className="text-blue-700">Max Tokens:</span> {formData.max_tokens}</div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {isEdit ? 'Update Prompt' : 'Create Prompt'}
            </Button>
          </div>
        </form>
        ) : (
          // Create mode - show tabs for Import from Defaults and Create New
          <CreateMetricTabs 
            projectId={projectId} 
            agentId={agentId}
            onSuccess={onSuccess}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// Tabs component for Create Metric dialog
function CreateMetricTabs({ projectId, agentId, onSuccess, onClose }: {
  projectId: string
  agentId: string
  onSuccess: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'import' | 'create'>('import')
  const [defaultMetrics, setDefaultMetrics] = useState<any[]>([])
  const [loadingDefaults, setLoadingDefaults] = useState(true)
  const [selectedDefaultMetrics, setSelectedDefaultMetrics] = useState<string[]>([])
  const [importingMetrics, setImportingMetrics] = useState(false)

  // Form state for create new
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    evaluation_type: 'quality',
    prompt_template: `Please evaluate the following customer service conversation for overall quality.

**Conversation Transcript:**
{{transcript}}

**Evaluation Criteria:**
- Overall conversation quality (1-10)
- Agent professionalism and helpfulness
- Problem resolution effectiveness
- Communication clarity

**Instructions:**
Analyze the conversation and provide your evaluation in the following JSON format:

{
  "score": <overall_score_from_1_to_10>,
  "reasoning": "<detailed_explanation_of_your_evaluation>"
}

Provide only the JSON response, nothing else.`,
    llm_provider: 'openai',
    model: 'gpt-4o-mini',
    api_url: 'https://api.openai.com/v1',
    api_key: '',
    scoring_output_type: 'float',
    success_criteria: 'higher_is_better',
    temperature: 0.0,
    max_tokens: 1000
  })

  // Fetch default metrics
  useEffect(() => {
    const fetchDefaultMetrics = async () => {
      try {
        const response = await fetch('/api/default-metrics')
        const result = await response.json()
        if (response.ok) {
          setDefaultMetrics(result.data || [])
        }
      } catch (error) {
        console.error('Failed to fetch default metrics:', error)
      } finally {
        setLoadingDefaults(false)
      }
    }
    fetchDefaultMetrics()
  }, [])

  const handleImportMetrics = async () => {
    if (selectedDefaultMetrics.length === 0) {
      alert('Please select at least one metric to import')
      return
    }

    setImportingMetrics(true)

    try {
      // Get selected metrics details
      const metricsToImport = defaultMetrics.filter(m => selectedDefaultMetrics.includes(m.id))
      
      // Create prompts for each selected metric
      for (const metric of metricsToImport) {
        const response = await fetch('/api/evaluations/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            agent_id: agentId,
            name: metric.name,
            description: metric.description || `Imported from default: ${metric.name}`,
            evaluation_type: metric.evaluation_type,
            prompt_template: metric.prompt_template,
            llm_provider: 'openai', // Default provider - user will configure later
            model: 'gpt-4o-mini', // Default model - user will configure later
            api_url: 'https://api.openai.com/v1',
            api_key: '', // Empty - user needs to configure
            scoring_output_type: metric.scoring_output_type,
            success_criteria: metric.success_criteria,
            temperature: 0.0,
            max_tokens: 1000,
            expected_output_format: {},
            scoring_criteria: {}
          })
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || `Failed to import metric: ${metric.name}`)
        }
      }

      alert(`✅ Successfully imported ${metricsToImport.length} metric(s)! Please configure the LLM settings for each imported metric.`)
      onSuccess()
      onClose()
    } catch (error) {
      alert(`Failed to import metrics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setImportingMetrics(false)
    }
  }

  const toggleMetricSelection = (metricId: string) => {
    setSelectedDefaultMetrics(prev => 
      prev.includes(metricId) 
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    )
  }

  // Provider-specific model options
  const getModelOptions = (provider: string) => {
    switch (provider) {
      case 'openai':
        return [
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
          { value: 'gpt-4o', label: 'GPT-4o' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
          { value: 'gpt-4', label: 'GPT-4' }
        ]
      case 'gemini':
        return [
          { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
        ]
      case 'groq':
        return [
          { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
          { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
          { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' }
        ]
      default:
        return []
    }
  }

  const getDefaultApiUrl = (provider: string) => {
    switch (provider) {
      case 'openai': return 'https://api.openai.com/v1'
      case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta/'
      case 'groq': return 'https://api.groq.com/openai/v1'
      default: return ''
    }
  }

  const handleProviderChange = (provider: string) => {
    const models = getModelOptions(provider)
    setFormData({
      ...formData,
      llm_provider: provider,
      model: models.length > 0 ? models[0].value : '',
      api_url: getDefaultApiUrl(provider)
    })
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name?.trim()) {
      alert('Please enter a prompt name')
      return
    }
    if (!formData.prompt_template?.trim()) {
      alert('Please enter a prompt template')
      return
    }
    if (!formData.prompt_template.includes('{{transcript}}')) {
      alert('Your prompt template must include {{transcript}} variable')
      return
    }
    if (!formData.api_key?.trim()) {
      alert('Please enter an API key')
      return
    }

    try {
      const response = await fetch('/api/evaluations/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          project_id: projectId,
          agent_id: agentId,
          expected_output_format: {},
          scoring_criteria: {}
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create prompt')
      }

      onSuccess()
      onClose()
    } catch (error) {
      alert(`Failed to create prompt: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'import' | 'create')} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-6">
        <TabsTrigger value="import" className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          Import from Defaults
        </TabsTrigger>
        <TabsTrigger value="create" className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create New
        </TabsTrigger>
      </TabsList>

      {/* Import from Defaults Tab */}
      <TabsContent value="import" className="space-y-4">
        {loadingDefaults ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading default metrics...</p>
          </div>
        ) : defaultMetrics.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No default metrics available</h3>
            <p className="text-gray-600">
              No default metrics have been configured by the administrator yet.
              Use the "Create New" tab to create your own metric.
            </p>
          </div>
        ) : (
          <>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <p><strong>💡 Tip:</strong> Select one or more default metrics to import. After importing, you'll need to configure the LLM settings (provider, model, API key) for each metric.</p>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {defaultMetrics.map((metric) => (
                <div 
                  key={metric.id}
                  onClick={() => toggleMetricSelection(metric.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    selectedDefaultMetrics.includes(metric.id)
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckSquare className={`w-5 h-5 ${
                          selectedDefaultMetrics.includes(metric.id) ? 'text-blue-600' : 'text-gray-300'
                        }`} />
                        <h4 className="font-medium text-gray-900">{metric.name}</h4>
                        <Badge className="text-xs bg-gray-100 text-gray-600">
                          {metric.evaluation_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 ml-7 line-clamp-2">
                        {metric.description || 'No description'}
                      </p>
                      <div className="flex gap-3 mt-2 ml-7 text-xs text-gray-500">
                        <span>Output: {getScoringOutputTypeInfo(metric.scoring_output_type).label}</span>
                        <span>•</span>
                        <span>Success: {getSuccessCriteriaDisplayText(metric.success_criteria)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <span className="text-sm text-gray-600">
                {selectedDefaultMetrics.length} metric(s) selected
              </span>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleImportMetrics}
                  disabled={selectedDefaultMetrics.length === 0 || importingMetrics}
                >
                  {importingMetrics ? 'Importing...' : `Import ${selectedDefaultMetrics.length} Metric(s)`}
                </Button>
              </div>
            </div>
          </>
        )}
      </TabsContent>

      {/* Create New Tab */}
      <TabsContent value="create">
        <form onSubmit={handleCreateSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="create_name">Prompt Name</Label>
              <Input
                id="create_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Conversation Quality Check"
                required
              />
            </div>
            <div>
              <Label htmlFor="create_evaluation_type">Evaluation Type</Label>
              <Select 
                value={formData.evaluation_type} 
                onValueChange={(value) => setFormData({ ...formData, evaluation_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">Quality</SelectItem>
                  <SelectItem value="sentiment">Sentiment</SelectItem>
                  <SelectItem value="accuracy">Accuracy</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="create_scoring_output_type">Scoring Output Type</Label>
              <Select 
                value={formData.scoring_output_type} 
                onValueChange={(value) => {
                  const defaultCriteria = value === 'bool' ? 'true' : 'higher_is_better'
                  setFormData({ 
                    ...formData, 
                    scoring_output_type: value,
                    success_criteria: defaultCriteria
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bool">Boolean (True/False)</SelectItem>
                  <SelectItem value="int">Integer (Whole Numbers)</SelectItem>
                  <SelectItem value="percentage">Percentage (0-100%)</SelectItem>
                  <SelectItem value="float">Float (Decimal Numbers)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="create_success_criteria">Success Criteria</Label>
              <Select 
                value={formData.success_criteria} 
                onValueChange={(value) => setFormData({ ...formData, success_criteria: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getScoringOutputTypeInfo(formData.scoring_output_type).successCriteriaOptions?.map((option) => (
                    <SelectItem key={option} value={option}>
                      {getSuccessCriteriaDisplayText(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="create_description">Description</Label>
            <Input
              id="create_description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of what this evaluation measures"
            />
          </div>

          <div>
            <Label htmlFor="create_prompt_template">Prompt Template</Label>
            <Textarea
              id="create_prompt_template"
              value={formData.prompt_template}
              onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
              rows={8}
              className="font-mono text-sm"
              required
            />
            <p className="text-xs text-amber-600 mt-1">
              ⚠️ Template must include {'{{transcript}}'} for the conversation content.
            </p>
          </div>

          {/* LLM Configuration */}
          <div className="space-y-4 border rounded-lg p-4 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">LLM Configuration</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create_llm_provider">Provider</Label>
                <Select 
                  value={formData.llm_provider} 
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="create_model">Model</Label>
                <Select 
                  value={formData.model} 
                  onValueChange={(value) => setFormData({ ...formData, model: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {getModelOptions(formData.llm_provider).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="create_api_key">API Key</Label>
              <Input
                id="create_api_key"
                type="password"
                value={formData.api_key}
                onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                placeholder="Enter your API key"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Create Metric
            </Button>
          </div>
        </form>
      </TabsContent>
    </Tabs>
  )
}

// Create Job Dialog Component
function CreateJobDialog({ open, onOpenChange, prompts, selectedPrompts, onSelectedPromptsChange, onSubmit, params }: any) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    traceSelection: 'all', // 'all', 'manual', or 'date_filtered'
    selectedTraces: [] as string[],
    filter_criteria: {
      date_range: 'last_30_days',
      min_duration: 10,
      call_status: 'completed',
      start_date: '',              // Custom date range start
      end_date: ''                 // Custom date range end
    }
  })

  const [traces, setTraces] = useState<any[]>([])
  const [tracesLoading, setTracesLoading] = useState(false)
  const [tracesError, setTracesError] = useState<string | null>(null)

  // Fetch available traces when dialog opens or trace selection changes to manual/date_filtered
  useEffect(() => {
    if (open && (formData.traceSelection === 'manual' || formData.traceSelection === 'date_filtered')) {
      fetchTraces()
    }
  }, [open, formData.traceSelection, formData.filter_criteria.date_range, formData.filter_criteria.start_date, formData.filter_criteria.end_date, params])

  const fetchTraces = async () => {
    setTracesLoading(true)
    setTracesError(null)
    
    try {
      // Build URL with filter parameters for date_filtered mode
      let url = `/api/evaluations/traces?project_id=${params.projectid}&agent_id=${params.agentid}&limit=100`
      
      if (formData.traceSelection === 'date_filtered') {
        const { date_range, start_date, end_date, min_duration, call_status } = formData.filter_criteria
        
        if (date_range) {
          url += `&date_range=${date_range}`
        }
        if (date_range === 'custom' && start_date) {
          url += `&start_date=${start_date}`
        }
        if (date_range === 'custom' && end_date) {
          url += `&end_date=${end_date}`
        }
        if (min_duration) {
          url += `&min_duration=${min_duration}`
        }
        if (call_status) {
          url += `&call_status=${call_status}`
        }
      }
      
      const response = await fetch(url)
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch traces')
      }
      
      setTraces(result.data || [])
    } catch (error) {
      console.error('Failed to fetch traces:', error)
      setTracesError(error instanceof Error ? error.message : 'Failed to fetch traces')
    } finally {
      setTracesLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const jobData = {
      ...formData,
      prompt_ids: selectedPrompts,
      selected_traces: formData.traceSelection === 'manual' ? formData.selectedTraces : null,
      // Include filter criteria for date_filtered option
      filter_criteria: formData.traceSelection === 'date_filtered' ? formData.filter_criteria : null
    }
    
    onSubmit(jobData)
  }

  const handleTraceSelectionChange = (traceId: string, checked: boolean) => {
    if (checked) {
      setFormData({
        ...formData,
        selectedTraces: [...formData.selectedTraces, traceId]
      })
    } else {
      setFormData({
        ...formData,
        selectedTraces: formData.selectedTraces.filter(id => id !== traceId)
      })
    }
  }

  const handleSelectAllTraces = () => {
    setFormData({
      ...formData,
      selectedTraces: traces.map(trace => trace.id)
    })
  }

  const handleDeselectAllTraces = () => {
    setFormData({
      ...formData,
      selectedTraces: []
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Run Evaluation Job</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="job_name">Job Name</Label>
              <Input
                id="job_name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Weekly Quality Review"
                required
              />
            </div>
            <div>
              <Label htmlFor="job_description">Description</Label>
              <Input
                id="job_description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div>
            <Label>Select Evaluation Prompts</Label>
            <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3 bg-gray-50">
              {prompts.map((prompt: any) => (
                <label key={prompt.id} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPrompts.includes(prompt.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onSelectedPromptsChange([...selectedPrompts, prompt.id])
                      } else {
                        onSelectedPromptsChange(selectedPrompts.filter((id: string) => id !== prompt.id))
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{prompt.name}</div>
                    <div className="text-sm text-gray-500">
                      {prompt.evaluation_type} • {getProviderDisplayName(prompt.llm_provider)}
                    </div>
                  </div>
                </label>
              ))}
              {prompts.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No evaluation prompts available. Create one first.
                </p>
              )}
            </div>
          </div>

          {/* Trace Selection */}
          <div>
            <Label>Trace Selection</Label>
            <div className="mt-2 space-y-4">
              <div className="flex flex-col gap-3">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="traceSelection"
                    value="all"
                    checked={formData.traceSelection === 'all'}
                    onChange={(e) => setFormData({ ...formData, traceSelection: e.target.value })}
                    className="text-blue-600"
                  />
                  <span>Evaluate all available traces</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="traceSelection"
                    value="date_filtered"
                    checked={formData.traceSelection === 'date_filtered'}
                    onChange={(e) => setFormData({ ...formData, traceSelection: e.target.value })}
                    className="text-blue-600"
                  />
                  <span>Filter traces by date range</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="traceSelection"
                    value="manual"
                    checked={formData.traceSelection === 'manual'}
                    onChange={(e) => setFormData({ ...formData, traceSelection: e.target.value })}
                    className="text-blue-600"
                  />
                  <span>Manually select specific traces</span>
                </label>
              </div>

              {/* Date Filtering Options */}
              {formData.traceSelection === 'date_filtered' && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <Label className="text-sm font-medium mb-3 block">Date Range Filter</Label>
                  
                  <div className="space-y-4">
                    {/* Predefined Date Ranges */}
                    <div>
                      <Label className="text-xs text-gray-600 mb-2 block">Quick Selection</Label>
                      <Select
                        value={formData.filter_criteria.date_range}
                        onValueChange={(value) => setFormData({
                          ...formData,
                          filter_criteria: { ...formData.filter_criteria, date_range: value, start_date: '', end_date: '' }
                        })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select date range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="last_7_days">Last 7 days</SelectItem>
                          <SelectItem value="last_30_days">Last 30 days</SelectItem>
                          <SelectItem value="last_90_days">Last 90 days</SelectItem>
                          <SelectItem value="custom">Custom date range</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Custom Date Range */}
                    {formData.filter_criteria.date_range === 'custom' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">Start Date</Label>
                          <Input
                            type="date"
                            value={formData.filter_criteria.start_date}
                            onChange={(e) => setFormData({
                              ...formData,
                              filter_criteria: { ...formData.filter_criteria, start_date: e.target.value }
                            })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-600 mb-1 block">End Date</Label>
                          <Input
                            type="date"
                            value={formData.filter_criteria.end_date}
                            onChange={(e) => setFormData({
                              ...formData,
                              filter_criteria: { ...formData.filter_criteria, end_date: e.target.value }
                            })}
                          />
                        </div>
                      </div>
                    )}

                    {/* Additional Filters */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-gray-600 mb-1 block">Min Duration (seconds)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={formData.filter_criteria.min_duration}
                          onChange={(e) => setFormData({
                            ...formData,
                            filter_criteria: { ...formData.filter_criteria, min_duration: parseInt(e.target.value) || 0 }
                          })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 mb-1 block">Call Status</Label>
                        <Select
                          value={formData.filter_criteria.call_status}
                          onValueChange={(value) => setFormData({
                            ...formData,
                            filter_criteria: { ...formData.filter_criteria, call_status: value }
                          })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                            <SelectItem value="all">All Status</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Preview of filtered traces */}
                    {!tracesLoading && !tracesError && traces.length > 0 && (
                      <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                        <span className="font-medium text-blue-800">
                          Found: {traces.length} trace(s) matching date criteria
                        </span>
                      </div>
                    )}

                    {!tracesLoading && !tracesError && traces.length === 0 && formData.traceSelection === 'date_filtered' && (
                      <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                        <span className="font-medium text-amber-800">
                          No traces found matching the selected date criteria
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {formData.traceSelection === 'manual' && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-medium">
                      Available Traces ({traces.length} total)
                    </Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllTraces}
                        disabled={tracesLoading}
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAllTraces}
                        disabled={tracesLoading}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>

                  {tracesLoading && (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-sm text-gray-500 mt-2">Loading traces...</p>
                    </div>
                  )}

                  {tracesError && (
                    <div className="text-center py-8">
                      <p className="text-sm text-red-600">{tracesError}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchTraces}
                        className="mt-2"
                      >
                        Retry
                      </Button>
                    </div>
                  )}

                  {!tracesLoading && !tracesError && (
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {traces.map((trace) => (
                        <label key={trace.id} className="flex items-start space-x-3 p-3 border rounded cursor-pointer hover:bg-white">
                          <input
                            type="checkbox"
                            checked={formData.selectedTraces.includes(trace.id)}
                            onChange={(e) => handleTraceSelectionChange(trace.id, e.target.checked)}
                            className="mt-1 rounded border-gray-300"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-sm">{trace.call_id}</div>
                              <div className="text-xs text-gray-500">
                                {new Date(trace.timestamp).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {trace.transcript?.substring(0, 100)}...
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                              <span>Duration: {trace.duration || 'N/A'}s</span>
                              <span>•</span>
                              <span>Status: {trace.status}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                      {traces.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">
                          No traces available for evaluation
                        </p>
                      )}
                    </div>
                  )}

                  {formData.traceSelection === 'manual' && formData.selectedTraces.length > 0 && (
                    <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                      <span className="font-medium text-blue-800">
                        Selected: {formData.selectedTraces.length} trace(s)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={
                selectedPrompts.length === 0 || 
                (formData.traceSelection === 'manual' && formData.selectedTraces.length === 0) ||
                (formData.traceSelection === 'date_filtered' && formData.filter_criteria.date_range === 'custom' && 
                 (!formData.filter_criteria.start_date || !formData.filter_criteria.end_date))
              }
            >
              Start Evaluation ({
                formData.traceSelection === 'all' 
                  ? 'All Traces' 
                  : formData.traceSelection === 'date_filtered'
                  ? `Date Filtered (${traces.length} traces)`
                  : `${formData.selectedTraces.length} Trace(s)`
              })
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}