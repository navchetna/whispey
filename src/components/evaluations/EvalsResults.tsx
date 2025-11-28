'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseQuery } from '../../hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  Trash2
} from 'lucide-react'
import { query } from "../../lib/postgres"
import { DatabaseService } from "@/lib/database"

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
  const [selectedTranscript, setSelectedTranscript] = useState<{callId: string, transcript: string} | null>(null)
  const [selectedRawResponse, setSelectedRawResponse] = useState<{callId: string, response: string} | null>(null)
  const [selectedDetails, setSelectedDetails] = useState<{callId: string, result: EvaluationResult} | null>(null)
  
  // Filter states
  const [filterType, setFilterType] = useState<string>('all')
  const [filterDate, setFilterDate] = useState<string>('')
  const [filterCallId, setFilterCallId] = useState<string>('')

  // Fetch jobs
  const { data: jobs, loading: jobsLoading } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: [
      { column: 'agent_id', operator: 'eq', value: params.agentid }
    ],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Fetch job details for selected job
  const { data: jobData, loading: jobLoading } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: selectedJobId ? [{ column: 'id', operator: 'eq', value: selectedJobId }] : [],
    limit: 1
  })

  // Fetch evaluation summaries for selected job
  const { data: summaries, loading: summariesLoading } = useSupabaseQuery('pype_voice_evaluation_summaries', {
    select: '*',
    filters: selectedJobId ? [{ column: 'job_id', operator: 'eq', value: selectedJobId }] : []
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

  // Fetch detailed results for selected job
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
    filters: selectedJobId ? [{ column: 'job_id', operator: 'eq', value: selectedJobId }] : [],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Apply filters to results
  const results = allResults?.filter((result: EvaluationResult) => {
    // Filter by evaluation type
    if (filterType !== 'all' && result.evaluation_score?.evaluation_type !== filterType) {
      return false
    }
    
    // Filter by date (if specified)
    if (filterDate) {
      const resultDate = new Date(result.created_at).toISOString().split('T')[0]
      if (resultDate !== filterDate) {
        return false
      }
    }
    
    // Filter by call ID (if specified)
    if (filterCallId) {
      const callId = result.call_id || result.trace_id || ''
      if (!callId.toLowerCase().includes(filterCallId.toLowerCase())) {
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

  const handleViewTranscript = async (callId: string) => {
    try {
      console.log('🔍 [DEBUG] Starting transcript fetch for call_id:', callId)
      
      // Validate input
      if (!callId || callId === 'undefined' || callId === 'null') {
        console.error('❌ [ERROR] Invalid call_id provided:', callId)
        setSelectedTranscript({ callId: callId || 'unknown', transcript: 'Error: Invalid call ID provided. The call ID is missing or undefined.' })
        return
      }

      // Step 1: First get the call log entry to get the internal ID
      const callLogResponse = await fetch(`/api/call-logs?call_id=${callId}&limit=1`)
      
      if (!callLogResponse.ok) {
        console.error('❌ [ERROR] API error fetching call log')
        setSelectedTranscript({ callId, transcript: 'API Error: Failed to fetch call log' })
        return
      }

      const { data: callLogData } = await callLogResponse.json()

      if (!callLogData || callLogData.length === 0) {
        setSelectedTranscript({ 
          callId, 
          transcript: `No call log found for call_id: "${callId}"\n\nThe call may not exist in the database or may not have been recorded properly.` 
        })
        return
      }

      const callLogId = callLogData[0].id

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

        if (formattedTranscript.trim()) {
          setSelectedTranscript({ callId, transcript: formattedTranscript })
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

  if (jobsLoading) {
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
          {/* Header with Job Selector */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <BarChart3 className="w-8 h-8 text-blue-600" />
                Evals Results
              </h1>
              <p className="text-gray-600 mt-2">View and analyze evaluation results for your voice agent conversations</p>
            </div>
            
            <div className="flex items-center gap-4">
              {jobs && jobs.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">Evaluation Run:</label>
                  <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Select an evaluation run" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((job: EvaluationJob) => (
                        <SelectItem key={job.id} value={job.id}>
                          <div className="flex items-center gap-2">
                            <span>{job.name}</span>
                            <Badge className={`text-xs ${
                              job.status === 'completed' ? 'bg-green-50 text-green-700' :
                              job.status === 'running' ? 'bg-blue-50 text-blue-700' :
                              job.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'
                            }`}>
                              {job.status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button variant="outline" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button variant="outline" className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
            </div>
          </div>

          {/* No Jobs State */}
          {!jobs || jobs.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Play className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No evaluation results yet</h3>
                <p className="text-gray-600 mb-4">Run your first evaluation to analyze conversation quality and performance.</p>
                <Button onClick={() => router.push(`/${params.projectid}/agents/${params.agentid}/evals-metrics`)}>
                  <Play className="w-4 h-4 mr-2" />
                  Create Evaluation
                </Button>
              </CardContent>
            </Card>
          ) : !selectedJobId ? (
            <Card className="text-center py-12">
              <CardContent>
                <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select an evaluation run</h3>
                <p className="text-gray-600">Choose an evaluation run from the dropdown above to view results.</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Job Summary Section */}
              {selectedJob && (
                <Card className="mb-8">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-full ${
                          selectedJob.status === 'completed' ? 'bg-green-100' :
                          selectedJob.status === 'running' ? 'bg-blue-100' :
                          selectedJob.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                        }`}>
                          {selectedJob.status === 'completed' ? (
                            <CheckCircle className="w-6 h-6 text-green-600" />
                          ) : selectedJob.status === 'running' ? (
                            <Clock className="w-6 h-6 text-blue-600 animate-spin" />
                          ) : (
                            <XCircle className="w-6 h-6 text-red-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold">{selectedJob.name}</h3>
                            <Badge className={`${
                              selectedJob.status === 'completed' ? 'bg-green-50 text-green-700' :
                              selectedJob.status === 'running' ? 'bg-blue-50 text-blue-700' :
                              selectedJob.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'
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

              {/* Enhanced Summary Cards with Comprehensive Metrics */}
              {results && results.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Evaluation Metrics Overview</h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-6">
                    {/* Overall Statistics */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                          Overall Performance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <div className="text-2xl font-bold text-blue-600">
                              {results.filter(r => r.status === 'completed').length}/{results.length}
                            </div>
                            <div className="text-sm text-gray-500">Completed Evaluations</div>
                          </div>
                          <div className="text-sm">
                            <div className="flex justify-between">
                              <span>Success Rate:</span>
                              <span className="font-medium">
                                {Math.round((results.filter(r => r.status === 'completed').length / results.length) * 100)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Average Score */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                          Average Score
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            {(() => {
                              const completedResults = results.filter(r => r.status === 'completed' && r.evaluation_score?.overall_score != null)
                              const avgScore = completedResults.length > 0 
                                ? completedResults.reduce((sum, r) => sum + (Number(r.evaluation_score?.overall_score) || 0), 0) / completedResults.length
                                : 0
                              return (
                                <>
                                  <div className="text-2xl font-bold flex items-center gap-2">
                                    {formatScore(avgScore, prompt?.scoring_output_type)}
                                    {getScoreIcon(getScoreValue(avgScore, prompt?.scoring_output_type), prompt?.scoring_output_type)}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Based on {completedResults.length} evaluations
                                  </div>
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Performance Range */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                          Score Range
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(() => {
                            const completedResults = results.filter(r => r.status === 'completed' && r.evaluation_score?.overall_score != null)
                            if (completedResults.length === 0) return <div className="text-sm text-gray-500">No completed evaluations</div>
                            
                            const scores = completedResults.map(r => Number(r.evaluation_score?.overall_score) || 0)
                            const minScore = Math.min(...scores)
                            const maxScore = Math.max(...scores)
                            
                            return (
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <div className="font-medium text-red-600">{formatScore(minScore, prompt?.scoring_output_type)}</div>
                                  <div className="text-gray-500">Lowest</div>
                                </div>
                                <div>
                                  <div className="font-medium text-green-600">{formatScore(maxScore, prompt?.scoring_output_type)}</div>
                                  <div className="text-gray-500">Highest</div>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Execution Performance */}
                    <Card className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600 uppercase tracking-wide">
                          Execution Stats
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {(() => {
                            const completedResults = results.filter(r => r.status === 'completed' && r.execution_time_ms)
                            const avgTime = completedResults.length > 0 
                              ? completedResults.reduce((sum, r) => sum + (r.execution_time_ms || 0), 0) / completedResults.length
                              : 0
                            const totalCost = results.reduce((sum, r) => sum + (r.llm_cost_usd || 0), 0)
                            
                            return (
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span>Avg Time:</span>
                                  <span className="font-medium">{Math.round(avgTime)}ms</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Total Cost:</span>
                                  <span className="font-medium">${totalCost.toFixed(4)}</span>
                                </div>
                              </div>
                            )
                          })()}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Filters */}
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="text-lg font-medium flex items-center gap-2">
                        <Filter className="w-5 h-5" />
                        Filter Results
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Evaluation Type Filter */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Evaluation Type
                          </label>
                          <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger>
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

                        {/* Date Filter */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Date
                          </label>
                          <input
                            type="date"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        {/* Call ID Filter */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Call ID / Trace ID
                          </label>
                          <input
                            type="text"
                            value={filterCallId}
                            onChange={(e) => setFilterCallId(e.target.value)}
                            placeholder="Search by ID..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                      
                      {(filterType !== 'all' || filterDate || filterCallId) && (
                        <div className="mt-4 flex items-center justify-between">
                          <div className="text-sm text-gray-600">
                            Showing {results.length} of {allResults?.length || 0} results
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              setFilterType('all')
                              setFilterDate('')
                              setFilterCallId('')
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

              {/* Legacy Summary Cards (keep for compatibility) */}
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
                          {/* Completed Runs Count */}
                          <div>
                            <div className="text-2xl font-bold text-blue-600">
                              {results ? results.filter(r => r.status === 'completed' && r.evaluation_score?.evaluation_type === summary.evaluation_type).length : 0}/{results ? results.filter(r => r.evaluation_score?.evaluation_type === summary.evaluation_type).length : summary.total_evaluations}
                            </div>
                            <div className="text-sm text-gray-500">Completed Runs</div>
                          </div>
                          
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
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Individual Trace Results */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Individual Trace Results
                </h2>
                
                {resultsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : results?.length === 0 ? (
                  <Card className="text-center py-12">
                    <CardContent>
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
                      <p className="text-gray-600">This evaluation run has no individual trace results yet.</p>
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
                              
                              {/* Main Score Display */}
                              <div className={`px-4 py-2 rounded-lg text-base font-semibold border-2 ${getScoreColor(getScoreValue(result.evaluation_score?.overall_score, prompt?.scoring_output_type), prompt?.scoring_output_type)} border-current`}>
                                <div className="flex items-center gap-2">
                                  {getScoreIcon(getScoreValue(result.evaluation_score?.overall_score, prompt?.scoring_output_type), prompt?.scoring_output_type)}
                                  <span>Score: {formatScore(result.evaluation_score?.overall_score, prompt?.scoring_output_type)}</span>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <Badge variant={result.status === 'completed' ? 'default' : result.status === 'failed' ? 'destructive' : 'secondary'}>
                                {result.status}
                              </Badge>
                            </div>

                            {/* Call ID (simplified) */}
                            <div className="mb-4">
                              <div className="text-sm text-gray-500">Call ID</div>
                              <div className="font-medium text-sm">{result.call_id || result.trace_id || 'N/A'}</div>
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
                              </div>
                            )}

                            {/* Success State - Show Only Reasoning (Simplified) */}
                            {result.status === 'completed' && (
                              <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                  <FileText className="w-4 h-4 text-gray-600" />
                                  <div className="text-sm font-medium text-gray-700">AI Reasoning</div>
                                </div>
                                {result.evaluation_reasoning ? (
                                  <div className="text-sm text-gray-800 leading-relaxed" style={{ 
                                    display: '-webkit-box', 
                                    WebkitLineClamp: 3, 
                                    WebkitBoxOrient: 'vertical', 
                                    overflow: 'hidden' 
                                  }}>
                                    {result.evaluation_reasoning}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-500 italic">
                                    No reasoning provided by the AI model
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="ml-4 flex flex-col gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex items-center gap-2"
                              onClick={() => handleViewTranscript(result.call_id)}
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
                                <DropdownMenuItem onClick={() => setSelectedDetails({ callId: result.call_id, result })}>
                                  <Eye className="w-4 h-4 mr-2" />
                                  More Details
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleViewRawResponse(result)}>
                                  <FileText className="w-4 h-4 mr-2" />
                                  Raw Response
                                </DropdownMenuItem>
                                <DropdownMenuItem>
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
            </>
          )}
        </div>
      </div>

      {/* Transcript Dialog */}
      <Dialog 
        open={!!selectedTranscript} 
        onOpenChange={(open) => {
          if (!open) setSelectedTranscript(null)
        }}
      >
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Call Transcript - {selectedTranscript?.callId}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedTranscript(null)}
                className="h-6 w-6 p-0 hover:bg-gray-100"
              >
                <XCircle className="h-4 w-4" />
              </Button>
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
            <DialogTitle className="flex items-center justify-between">
              <span>Raw LLM Response - {selectedRawResponse?.callId}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedRawResponse(null)}
                className="h-6 w-6 p-0 hover:bg-gray-100"
              >
                <XCircle className="h-4 w-4" />
              </Button>
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

      {/* More Details Dialog */}
      <Dialog open={!!selectedDetails} onOpenChange={() => setSelectedDetails(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Evaluation Details - {selectedDetails?.callId}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedDetails(null)}
                className="h-6 w-6 p-0 hover:bg-gray-100"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 overflow-y-auto max-h-[60vh] space-y-6">
            {selectedDetails?.result && (
              <>
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-500 mb-1">Call ID / Trace ID</div>
                    <div className="font-medium">{selectedDetails.result.call_id || selectedDetails.result.trace_id || 'N/A'}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-500 mb-1">Evaluation Date</div>
                    <div className="font-medium">{new Date(selectedDetails.result.created_at).toLocaleString()}</div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-sm text-gray-500 mb-1">Status</div>
                    <Badge variant={selectedDetails.result.status === 'completed' ? 'default' : selectedDetails.result.status === 'failed' ? 'destructive' : 'secondary'}>
                      {selectedDetails.result.status}
                    </Badge>
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Performance Metrics
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span>Execution Time:</span>
                      <span className="font-medium">{selectedDetails.result.execution_time_ms ? `${selectedDetails.result.execution_time_ms}ms` : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LLM Cost:</span>
                      <span className="font-medium">{selectedDetails.result.llm_cost_usd ? `$${selectedDetails.result.llm_cost_usd.toFixed(4)}` : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Detailed Scores (if available) */}
                {selectedDetails.result.evaluation_score?.parsed_scores && Object.keys(selectedDetails.result.evaluation_score.parsed_scores).length > 0 && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h3 className="font-medium text-green-800 mb-3 flex items-center gap-2">
                      <Star className="w-4 h-4" />
                      Detailed Scores ({getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').label})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(selectedDetails.result.evaluation_score.parsed_scores).map(([key, value]) => (
                        <div key={key} className="bg-white rounded p-3 border border-green-200">
                          <div className="text-xs text-green-600 uppercase tracking-wide mb-1">{key.replace(/_/g, ' ')}</div>
                          <div className={`text-sm font-medium ${getScoreColor(getScoreValue(value, prompt?.scoring_output_type), prompt?.scoring_output_type)}`}>
                            {formatScore(value, prompt?.scoring_output_type)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Reasoning */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Full AI Reasoning
                  </h3>
                  {selectedDetails.result.evaluation_reasoning ? (
                    <div className="prose prose-sm max-w-none">
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {selectedDetails.result.evaluation_reasoning}
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
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
        </DialogContent>
      </Dialog>
    </>
  )
}