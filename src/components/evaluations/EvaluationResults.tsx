'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { 
  ArrowLeft, 
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
  Search,
  Eye,
  FileText,
  Users,
  Zap
} from 'lucide-react'
import { useSupabaseQuery } from '@/hooks/useSupabase'

// Helper function to get scoring output type information
const getScoringOutputTypeInfo = (type: string) => {
  switch (type) {
    case 'bool':
      return {
        label: 'Boolean (True/False)',
        description: 'Simple pass/fail evaluation (true or false)',
        example: 'true, false',
        range: 'true or false',
        format: (value: any) => value ? '✅ True' : '❌ False'
      }
    case 'int':
      return {
        label: 'Integer (Whole Numbers)',
        description: 'Discrete scoring with whole numbers',
        example: '1, 2, 3, 4, 5',
        range: 'Any whole number',
        format: (value: any) => `${Math.round(Number(value) || 0)}`
      }
    case 'percentage':
      return {
        label: 'Percentage (0-100%)',
        description: 'Percentage-based scoring from 0 to 100',
        example: '85%, 92%, 67%',
        range: '0% to 100%',
        format: (value: any) => `${Math.round(Number(value) || 0)}%`
      }
    case 'float':
      return {
        label: 'Float (Decimal Numbers)',
        description: 'Precise scoring with decimal values',
        example: '8.5, 9.2, 7.8',
        range: 'Any decimal number',
        format: (value: any) => `${Number(value || 0).toFixed(1)}`
      }
    default:
      return {
        label: 'Raw Value',
        description: 'Display raw value as-is',
        example: 'Various formats',
        range: 'Any value',
        format: (value: any) => String(value || 'N/A')
      }
  }
}

interface EvaluationResultsProps {
  params: { projectid: string; agentid: string; jobid: string }
}

interface EvaluationResult {
  id: string
  trace_id: string
  call_id: string
  evaluation_score: {
    overall_score?: number
    parsed_scores?: any
    evaluation_type?: string
  }
  evaluation_reasoning: string
  raw_llm_response: string
  status: string
  created_at: string
  execution_time_ms?: number
  llm_cost_usd?: number
  error_message?: string
  // Join data from call logs
  call_data?: {
    duration_seconds?: number
    customer_number?: string
    transcript_json?: any
  }
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

interface EvaluationJob {
  id: string
  name: string
  description: string
  status: string
  total_traces: number
  completed_traces: number
  failed_traces: number
  started_at: string
  completed_at: string
  created_at: string
}

export default function EvaluationResults({ params }: EvaluationResultsProps) {
  const router = useRouter()
  const [selectedType, setSelectedType] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'score' | 'date' | 'duration'>('score')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedTranscript, setSelectedTranscript] = useState<{callId: string, transcript: string} | null>(null)
  const [selectedRawResponse, setSelectedRawResponse] = useState<{callId: string, response: string} | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>('')

  // Debug selectedTranscript state changes
  useEffect(() => {
    console.log('🖥️ [STATE DEBUG] selectedTranscript state changed:', selectedTranscript)
    console.log('🖥️ [STATE DEBUG] Dialog should be open:', !!selectedTranscript)
  }, [selectedTranscript])

  // Fetch job details
  const { data: jobData, loading: jobLoading } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: [{ column: 'id', operator: 'eq', value: params.jobid }],
    limit: 1
  })

  // Fetch evaluation summaries
  const { data: summaries, loading: summariesLoading } = useSupabaseQuery('pype_voice_evaluation_summaries', {
    select: '*',
    filters: [{ column: 'job_id', operator: 'eq', value: params.jobid }]
  })

  // Fetch prompt details for this job
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

  // Fetch detailed results - start with basic data first
  const { data: results, loading: resultsLoading } = useSupabaseQuery('pype_voice_evaluation_results', {
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
    filters: [
      { column: 'job_id', operator: 'eq', value: params.jobid },
      ...(selectedType !== 'all' ? [{ column: 'evaluation_score->>evaluation_type', operator: 'eq', value: selectedType }] : [])
    ],
    orderBy: { 
      column: sortBy === 'score' ? 'created_at' : sortBy === 'date' ? 'created_at' : 'created_at', 
      ascending: sortOrder === 'asc' 
    }
  })

  const job = jobData?.[0] as EvaluationJob
  const prompt = promptData?.[0]
  const evaluationTypes = [...new Set(results?.map((r: EvaluationResult) => r.evaluation_score?.evaluation_type).filter(Boolean) || [])]

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
        return score ? 1 : 0
      case 'percentage':
        return Number(score) || 0
      case 'int':
      case 'float':
      default:
        return Number(score) || 0
    }
  }

  const getScoreColor = (score: number, outputType: string = 'float', scale: number = 5) => {
    let percentage: number
    
    switch (outputType) {
      case 'bool':
        return score ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
      case 'percentage':
        percentage = score
        break
      case 'int':
      case 'float':
      default:
        percentage = (score / scale) * 100
        break
    }
    
    if (percentage >= 80) return 'text-green-600 bg-green-50'
    if (percentage >= 60) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
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

  const handleViewTranscript = async (callId: string) => {
    try {
      console.log('🔍 [DEBUG] Starting transcript fetch for call_id:', callId)
      
      // Validate input
      if (!callId || callId === 'undefined' || callId === 'null') {
        console.error('❌ [ERROR] Invalid call_id provided:', callId)
        setSelectedTranscript({ callId: callId || 'unknown', transcript: 'Error: Invalid call ID provided. The call ID is missing or undefined.' })
        return
      }

      console.log('📡 [DEBUG] Step 1: Fetching call log entry...')

      // Step 1: First get the call log entry to get the internal ID
      const { data: callLogData, error: callLogError } = await supabase
        .from('pype_voice_call_logs')
        .select('id, call_id')
        .eq('call_id', callId)
        .limit(1)

      console.log('📊 [DEBUG] Call log query result:', { 
        data: callLogData, 
        error: callLogError,
        dataLength: callLogData?.length || 0
      })

      if (callLogError) {
        console.error('❌ [ERROR] Database error fetching call log:', callLogError)
        setSelectedTranscript({ callId, transcript: 'Database Error: ' + callLogError.message + '\n\nThis could be due to:\n• Database connection issues\n• Permission problems\n• Table doesn\'t exist' })
        return
      }

      if (!callLogData || callLogData.length === 0) {
        console.warn('⚠️ [WARNING] No call log found for call_id:', callId)
        
        // Let's try to see what call_ids actually exist
        const { data: sampleCallLogs } = await supabase
          .from('pype_voice_call_logs')
          .select('call_id')
          .limit(5)
        
        console.log('📋 [DEBUG] Sample call_ids in database:', sampleCallLogs?.map(log => log.call_id))
        
        setSelectedTranscript({ 
          callId, 
          transcript: `No call log found for call_id: "${callId}"\n\nPossible reasons:\n• This call_id doesn't exist in the database\n• The call log was not saved properly\n• There's a mismatch between evaluation results and call logs\n\nSample call_ids in database: ${sampleCallLogs?.map(log => log.call_id).join(', ') || 'None found'}` 
        })
        return
      }

      const callLogId = callLogData[0].id
      console.log('✅ [SUCCESS] Found call log - Internal ID:', callLogId, 'External call_id:', callId)

      console.log('📡 [DEBUG] Step 2: Fetching transcript data from metrics logs...')

      // Step 2: Get transcript data from metrics logs using the call log ID as session_id
      const { data: transcriptTurns, error: transcriptError } = await supabase
        .from('pype_voice_metrics_logs')
        .select('user_transcript, agent_response, turn_id, created_at, unix_timestamp')
        .eq('session_id', callLogId)
        .order('unix_timestamp', { ascending: true })

      console.log('📊 [DEBUG] Transcript query result:', { 
        data: transcriptTurns, 
        error: transcriptError,
        dataLength: transcriptTurns?.length || 0,
        session_id: callLogId
      })

      if (transcriptError) {
        console.error('❌ [ERROR] Database error fetching transcript:', transcriptError)
        setSelectedTranscript({ callId, transcript: 'Transcript Database Error: ' + transcriptError.message })
        return
      }

      console.log('📝 [DEBUG] Processing transcript turns...')

      if (transcriptTurns && transcriptTurns.length > 0) {
        console.log('🔍 [DEBUG] Raw transcript turns:', transcriptTurns.map((turn, index) => ({
          index,
          user_transcript: turn.user_transcript ? turn.user_transcript.substring(0, 50) + '...' : null,
          agent_response: turn.agent_response ? turn.agent_response.substring(0, 50) + '...' : null,
          has_user: !!turn.user_transcript,
          has_agent: !!turn.agent_response
        })))

        // Format the transcript data using the same logic as the processor
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

        console.log('📄 [DEBUG] Formatted transcript length:', formattedTranscript.length)
        console.log('📄 [DEBUG] Formatted transcript preview:', formattedTranscript.substring(0, 200) + '...')

        if (formattedTranscript.trim()) {
          console.log('✅ [SUCCESS] Transcript formatted successfully, opening dialog')
          console.log('🖥️ [UI DEBUG] Setting selectedTranscript state with:', { callId, transcriptLength: formattedTranscript.length })
          setSelectedTranscript({ callId, transcript: formattedTranscript })
          // Force a small delay to ensure state update
          setTimeout(() => {
            console.log('🖥️ [UI DEBUG] Dialog should be open now, selectedTranscript set')
          }, 100)
        } else {
          console.warn('⚠️ [WARNING] Transcript turns exist but no meaningful content found')
          setSelectedTranscript({ callId, transcript: 'Empty Transcript: Found transcript entries but they contain no meaningful content.\n\nThis might be because:\n• Transcript fields are empty or contain only whitespace\n• Audio processing failed\n• No actual conversation took place' })
        }
      } else {
        console.warn('⚠️ [WARNING] No transcript turns found for session_id:', callLogId)
        
        // Let's check if there's any data in metrics logs at all
        const { data: sampleMetrics } = await supabase
          .from('pype_voice_metrics_logs')
          .select('session_id')
          .limit(5)
        
        console.log('📋 [DEBUG] Sample session_ids in metrics logs:', sampleMetrics?.map(m => m.session_id))
        
        setSelectedTranscript({ 
          callId, 
          transcript: `No transcript data found for this call.\n\nDetails:\n• Call log ID: ${callLogId}\n• Call ID: ${callId}\n\nPossible reasons:\n• The conversation was not recorded\n• Transcript processing failed\n• No meaningful exchange occurred\n• Wrong session_id relationship\n\nSample session_ids in metrics: ${sampleMetrics?.map(m => m.session_id).join(', ') || 'None found'}` 
        })
      }
    } catch (error) {
      console.error('💥 [FATAL ERROR] Unexpected error in handleViewTranscript:', error)
      setSelectedTranscript({ callId, transcript: 'Unexpected Error: ' + (error as Error).message + '\n\nStack trace logged to console.' })
    }
  }

  const handleViewRawResponse = (result: EvaluationResult) => {
    const rawResponse = result.raw_llm_response || 'No raw response available'
    setSelectedRawResponse({ 
      callId: result.call_id, 
      response: rawResponse 
    })
  }

  const handleExportResult = (result: EvaluationResult) => {
    try {
      const exportData = {
        call_id: result.call_id,
        evaluation_type: result.evaluation_score?.evaluation_type || 'unknown',
        overall_score: result.evaluation_score?.overall_score || 0,
        detailed_scores: result.evaluation_score?.parsed_scores || {},
        reasoning: result.evaluation_reasoning || '',
        raw_llm_response: result.raw_llm_response || '',
        status: result.status,
        created_at: result.created_at,
        execution_time_ms: result.execution_time_ms || 0,
        cost_usd: result.llm_cost_usd || 0
      }

      const dataStr = JSON.stringify(exportData, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `evaluation_result_${result.call_id}_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      console.log('Exported evaluation result for call_id:', result.call_id)
    } catch (error) {
      console.error('Error exporting result:', error)
      alert('Failed to export result: ' + (error as Error).message)
    }
  }

  const runDiagnostics = async () => {
    try {
      console.log('🔍 [DIAGNOSTICS] Running database diagnostics...')
      let diagnostic = '🔍 Database Diagnostics Results\n\n'

      // Check call logs table
      const { data: callLogs, error: callLogsError } = await supabase
        .from('pype_voice_call_logs')
        .select('id, call_id, agent_id, created_at')
        .limit(5)

      if (callLogsError) {
        diagnostic += `❌ Call Logs Error: ${callLogsError.message}\n\n`
      } else {
        diagnostic += `✅ Call Logs Found: ${callLogs?.length || 0} entries\n`
        if (callLogs && callLogs.length > 0) {
          diagnostic += `Sample call_ids: ${callLogs.map(log => log.call_id).join(', ')}\n\n`
        }
      }

      // Check metrics logs table  
      const { data: metricsLogs, error: metricsError } = await supabase
        .from('pype_voice_metrics_logs')
        .select('session_id, user_transcript, agent_response')
        .limit(5)

      if (metricsError) {
        diagnostic += `❌ Metrics Logs Error: ${metricsError.message}\n\n`
      } else {
        diagnostic += `✅ Metrics Logs Found: ${metricsLogs?.length || 0} entries\n`
        if (metricsLogs && metricsLogs.length > 0) {
          diagnostic += `Sample session_ids: ${metricsLogs.map(log => log.session_id).join(', ')}\n`
          diagnostic += `Has transcript data: ${metricsLogs.some(log => log.user_transcript || log.agent_response)}\n\n`
        }
      }

      // Check current evaluation results
      if (results && results.length > 0) {
        diagnostic += `✅ Current Evaluation Results: ${results.length} entries\n`
        diagnostic += `Sample call_ids from results: ${results.slice(0, 3).map((r: any) => r.call_id).join(', ')}\n\n`
      } else {
        diagnostic += `❌ No evaluation results available\n\n`
      }

      // Try to find a relationship
      if (callLogs && metricsLogs && callLogs.length > 0 && metricsLogs.length > 0) {
        const callLogIds = callLogs.map(log => log.id)
        const sessionIds = metricsLogs.map(log => log.session_id)
        const matches = callLogIds.filter(id => sessionIds.includes(id))
        diagnostic += `🔗 Found ${matches.length} matching relationships between call_logs.id and metrics_logs.session_id\n`
        if (matches.length > 0) {
          diagnostic += `Matching IDs: ${matches.join(', ')}\n\n`
        }
      }

      diagnostic += `\n💡 Recommendations:\n`
      if (callLogsError || metricsError) {
        diagnostic += `• Check database permissions and connection\n`
      }
      if (!callLogs || callLogs.length === 0) {
        diagnostic += `• No call logs found - check if calls are being saved properly\n`
      }
      if (!metricsLogs || metricsLogs.length === 0) {
        diagnostic += `• No transcript data found - check if conversations are being recorded\n`
      }
      if (results && results.length > 0 && callLogs && callLogs.length > 0) {
        const resultCallIds = results.map((r: any) => r.call_id)
        const logCallIds = callLogs.map(log => log.call_id)
        const overlap = resultCallIds.filter(id => logCallIds.includes(id))
        diagnostic += `• ${overlap.length}/${results.length} evaluation call_ids have matching call logs\n`
      }

      setDebugInfo(diagnostic)
      console.log('📊 [DIAGNOSTICS] Results:', diagnostic)
    } catch (error) {
      const errorMsg = `💥 Diagnostics failed: ${(error as Error).message}`
      setDebugInfo(errorMsg)
      console.error('💥 [DIAGNOSTICS ERROR]:', error)
    }
  }

  if (jobLoading || summariesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-blue-600" />
                {job?.name || 'Evaluation Results'}
              </h1>
              <p className="text-gray-600 mt-1">
                {job?.description || 'LLM evaluation results and analytics'}
              </p>
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
          
          <div className="flex gap-3">
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button 
              variant="outline" 
              onClick={runDiagnostics}
              className="flex items-center gap-2 bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
            >
              <AlertTriangle className="w-4 h-4" />
              Debug Transcript
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                console.log('🧪 [TEST] Manually opening transcript dialog')
                setSelectedTranscript({ callId: 'test-123', transcript: 'TEST TRANSCRIPT:\n\nUSER: Hello, this is a test\nAGENT: This is a test response\nUSER: Great, the dialog is working!\nAGENT: Yes, it appears to be functioning correctly.' })
              }}
              className="flex items-center gap-2 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
            >
              <Eye className="w-4 h-4" />
              Test Dialog
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </Button>
          </div>
        </div>

        {/* Job Status Card */}
        {job && (
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-full ${
                    job.status === 'completed' ? 'bg-green-100' :
                    job.status === 'running' ? 'bg-blue-100' :
                    job.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                  }`}>
                    {job.status === 'completed' ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : job.status === 'running' ? (
                      <Clock className="w-6 h-6 text-blue-600 animate-spin" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">{job.name}</h3>
                      <Badge className={`${
                        job.status === 'completed' ? 'bg-green-50 text-green-700' :
                        job.status === 'running' ? 'bg-blue-50 text-blue-700' :
                        job.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'
                      }`}>
                        {job.status}
                      </Badge>
                    </div>
                    <p className="text-gray-600 mt-1">{job.description}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="grid grid-cols-3 gap-6 text-sm">
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{job.total_traces}</div>
                      <div className="text-gray-500">Total Traces</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{job.completed_traces}</div>
                      <div className="text-gray-500">Completed</div>
                    </div>
                    {job.failed_traces > 0 && (
                      <div>
                        <div className="text-2xl font-bold text-red-600">{job.failed_traces}</div>
                        <div className="text-gray-500">Failed</div>
                      </div>
                    )}
                  </div>
                  
                  {job.status === 'running' && (
                    <div className="mt-4 w-64">
                      <Progress 
                        value={(job.completed_traces / job.total_traces) * 100} 
                        className="h-2"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        {Math.round((job.completed_traces / job.total_traces) * 100)}% complete
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Cards */}
        {summaries && summaries.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {summaries.map((summary: EvaluationSummary) => (
              <Card key={summary.evaluation_type} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                      {summary.evaluation_type}
                    </CardTitle>
                    <Star className="w-4 h-4 text-yellow-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="text-2xl font-bold flex items-center gap-2">
                        {formatScore(summary.avg_score, prompt?.scoring_output_type)}
                        {getScoreIcon(getScoreValue(summary.avg_score, prompt?.scoring_output_type), prompt?.scoring_output_type)}
                      </div>
                      <div className="text-sm text-gray-500">Average Score ({getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').label})</div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-medium">{formatScore(summary.min_score, prompt?.scoring_output_type)}</div>
                        <div className="text-gray-500">Min</div>
                      </div>
                      <div>
                        <div className="font-medium">{formatScore(summary.max_score, prompt?.scoring_output_type)}</div>
                        <div className="text-gray-500">Max</div>
                      </div>
                    </div>
                    
                    {summary.pass_rate !== null && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Pass Rate</span>
                          <span>{(summary.pass_rate * 100).toFixed(1)}%</span>
                        </div>
                        <Progress value={summary.pass_rate * 100} className="h-2" />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="results">Individual Results</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Score Distribution Charts */}
            <div className="grid gap-6 md:grid-cols-2">
              {summaries?.map((summary: EvaluationSummary) => (
                <Card key={summary.evaluation_type}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      {summary.evaluation_type} Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {summary.score_distribution && (
                      <div className="space-y-3">
                        {Object.entries(summary.score_distribution).map(([score, count]: [string, any]) => (
                          <div key={score} className="flex items-center gap-3">
                            <div className="w-16 text-sm font-medium">Score {score}</div>
                            <div className="flex-1">
                              <Progress 
                                value={(count / summary.total_evaluations) * 100} 
                                className="h-4"
                              />
                            </div>
                            <div className="w-12 text-sm text-gray-500">{count}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="results" className="space-y-6">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Types</option>
                {evaluationTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="score">Sort by Score</option>
                <option value="date">Sort by Date</option>
              </select>
              
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </div>

            {/* Results Table */}
            <div className="space-y-4">
              {resultsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : results?.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
                    <p className="text-gray-600">Try adjusting your filters or check back later.</p>
                  </CardContent>
                </Card>
              ) : (
                results?.map((result: EvaluationResult) => (
                  <Card key={result.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-4">
                            <Badge className={getEvaluationTypeColor(result.evaluation_score?.evaluation_type || 'unknown')}>
                              {result.evaluation_score?.evaluation_type || 'Unknown'}
                            </Badge>
                            <div className={`px-4 py-2 rounded-lg text-base font-semibold border-2 ${getScoreColor(getScoreValue(result.evaluation_score?.overall_score, prompt?.scoring_output_type), prompt?.scoring_output_type)} border-current`}>
                              <div className="flex items-center gap-2">
                                {getScoreIcon(getScoreValue(result.evaluation_score?.overall_score, prompt?.scoring_output_type), prompt?.scoring_output_type)}
                                <span>Final Score: {formatScore(result.evaluation_score?.overall_score, prompt?.scoring_output_type)}</span>
                              </div>
                            </div>
                            {/* Execution Info */}
                            {result.execution_time_ms && (
                              <Badge variant="outline" className="text-gray-600">
                                <Clock className="w-3 h-3 mr-1" />
                                {result.execution_time_ms}ms
                              </Badge>
                            )}
                            {result.llm_cost_usd && (
                              <Badge variant="outline" className="text-green-700 bg-green-50">
                                ${result.llm_cost_usd.toFixed(4)}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                              <div className="text-sm text-gray-500">Call ID</div>
                              <div className="font-medium">{result.call_id || result.trace_id || 'N/A'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Status</div>
                              <div className="font-medium">
                                <Badge variant={result.status === 'completed' ? 'default' : result.status === 'failed' ? 'destructive' : 'secondary'}>
                                  {result.status}
                                </Badge>
                                {result.status === 'failed' && result.error_message && (
                                  <div className="text-xs text-red-600 mt-1" title={result.error_message}>
                                    Error: {result.error_message.length > 50 ? result.error_message.substring(0, 50) + '...' : result.error_message}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Date</div>
                              <div className="font-medium">
                                {new Date(result.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          {/* Error State Display for Failed Evaluations */}
                          {result.status === 'failed' && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                <div className="text-sm font-medium text-red-800">Evaluation Failed</div>
                              </div>
                              <div className="text-sm text-red-700">
                                {result.error_message || 'Unknown error occurred during evaluation'}
                              </div>
                              {result.raw_llm_response && (
                                <details className="mt-2">
                                  <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                                    View Raw LLM Response
                                  </summary>
                                  <pre className="text-xs bg-red-100 p-2 rounded mt-1 overflow-x-auto">
                                    {result.raw_llm_response}
                                  </pre>
                                </details>
                              )}
                            </div>
                          )}

                          {/* Success State - Show Scores and Reasoning */}
                          {result.status === 'completed' && (
                            <>
                              {/* Detailed Scores - if available */}
                              {result.evaluation_score?.parsed_scores && Object.keys(result.evaluation_score.parsed_scores).length > 0 && (
                                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                                  <div className="text-sm text-blue-800 font-medium mb-3 flex items-center gap-2">
                                    <Star className="w-4 h-4" />
                                    Detailed Scores ({getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').label})
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {Object.entries(result.evaluation_score.parsed_scores).map(([key, value]) => (
                                      <div key={key} className="bg-white rounded p-3 border border-blue-200">
                                        <div className="text-xs text-blue-600 uppercase tracking-wide mb-1">{key.replace(/_/g, ' ')}</div>
                                        <div className={`text-sm font-medium ${getScoreColor(getScoreValue(value, prompt?.scoring_output_type), prompt?.scoring_output_type)}`}>
                                          {formatScore(value, prompt?.scoring_output_type)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <FileText className="w-4 h-4 text-gray-600" />
                                  <div className="text-sm font-medium text-gray-700">AI Evaluation Reasoning</div>
                                </div>
                                {result.evaluation_reasoning ? (
                                  <div className="prose prose-sm max-w-none">
                                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                                      {result.evaluation_reasoning}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">
                                    No reasoning provided by the AI model
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        
                        <div className="ml-4 flex flex-col gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex items-center gap-2"
                            onClick={() => {
                              console.log('🖱️ [UI DEBUG] View Transcript button clicked for call_id:', result.call_id)
                              handleViewTranscript(result.call_id)
                            }}
                          >
                            <Eye className="w-4 h-4" />
                            View Transcript
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewRawResponse(result)}>
                                <FileText className="w-4 h-4 mr-2" />
                                View Raw Response
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleExportResult(result)}>
                                <Download className="w-4 h-4 mr-2" />
                                Export Result
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {summaries?.map((summary: EvaluationSummary) => (
                <Card key={summary.evaluation_type}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      {summary.evaluation_type} Issues
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {summary.top_issues?.map((issue, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{issue.issue}</div>
                            <div className="text-xs text-gray-500">Frequency: {issue.count} times</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {summaries?.map((summary: EvaluationSummary) => (
                <Card key={summary.evaluation_type}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-blue-500" />
                      {summary.evaluation_type} Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {summary.recommendations?.map((rec, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs font-bold flex-shrink-0">
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{rec.title}</div>
                            <div className="text-xs text-gray-600 mt-1">{rec.description}</div>
                            {rec.priority && (
                              <Badge className={`mt-2 text-xs ${
                                rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                                rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {rec.priority} priority
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>

    {/* Transcript Dialog */}
    <Dialog 
      open={!!selectedTranscript} 
      onOpenChange={(open) => {
        console.log('🖥️ [UI DEBUG] Dialog onOpenChange called with:', open)
        console.log('🖥️ [UI DEBUG] Current selectedTranscript state:', selectedTranscript)
        if (!open) setSelectedTranscript(null)
      }}
    >
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Call Transcript - {selectedTranscript?.callId}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 overflow-y-auto max-h-[60vh]">
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
              {selectedTranscript?.transcript}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Raw Response Dialog */}
    <Dialog open={!!selectedRawResponse} onOpenChange={() => setSelectedRawResponse(null)}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            Raw LLM Response - {selectedRawResponse?.callId}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 overflow-y-auto max-h-[60vh]">
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
              {selectedRawResponse?.response}
            </pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Debug Information Dialog */}
    <Dialog open={!!debugInfo} onOpenChange={() => setDebugInfo('')}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Transcript Debug Information
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 overflow-y-auto max-h-[60vh]">
          <div className="bg-gray-50 rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed">
              {debugInfo}
            </pre>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <strong>Instructions:</strong>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Check the console for detailed logs when clicking "View Transcript"</li>
              <li>Look for error messages or missing data indicators</li>
              <li>Verify that call_ids from evaluation results match call logs</li>
              <li>Ensure transcript data exists in the metrics logs table</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

function getEvaluationTypeColor(type: string) {
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