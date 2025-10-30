'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { AlertCircle, Plus, Settings, MoreHorizontal, Edit2, Trash2, Copy, Eye, Brain, TrendingUp, BarChart3, Activity, CheckCircle, Clock, Users, Target } from 'lucide-react'
import { useSupabaseQuery } from '@/hooks/useSupabase'
import { supabase } from '@/lib/supabase'

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
        range: 'true or false'
      }
    case 'int':
      return {
        label: 'Integer (Whole Numbers)',
        description: 'Discrete scoring with whole numbers',
        example: '1, 2, 3, 4, 5',
        range: 'Any whole number'
      }
    case 'percentage':
      return {
        label: 'Percentage (0-100%)',
        description: 'Percentage-based scoring from 0 to 100',
        example: '85%, 92%, 67%',
        range: '0% to 100%'
      }
    case 'float':
      return {
        label: 'Float (Decimal Numbers)',
        description: 'Precise scoring with decimal values',
        example: '8.5, 9.2, 7.8',
        range: 'Any decimal number'
      }
    default:
      return {
        label: 'Unknown',
        description: '',
        example: '',
        range: ''
      }
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
  const completedResults = results?.filter(r => r.status === 'completed' && r.evaluation_score?.score != null) || []
  const averageScore = completedResults.length > 0 
    ? (completedResults.reduce((sum, r) => sum + (Number(r.evaluation_score?.score) || 0), 0) / completedResults.length).toFixed(1)
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
  
  // Calculate score range
  const scores = completedResults.map(r => Number(r.evaluation_score?.score) || 0)
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

const formatScore = (score: any, outputType: string = 'float') => {
  if (score == null) return 'N/A'
  
  switch (outputType) {
    case 'bool':
      return score ? '✅ Pass' : '❌ Fail'
    case 'int':
      return Math.round(Number(score)).toString()
    case 'percentage':
      return `${Math.round(Number(score))}%`
    case 'float':
    default:
      return Number(score).toFixed(1)
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

export default function EvalsMetrics({ params }: EvalsMetricsProps) {
  const router = useRouter()
  const [showCreatePrompt, setShowCreatePrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<EvaluationPrompt | null>(null)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([])
  const [selectedTranscript, setSelectedTranscript] = useState<{callId: string, transcript: string} | null>(null)

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
    setEditingPrompt(prompt)
    setShowCreatePrompt(true)
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

      if (callLogError) {
        console.error('❌ [ERROR] Database error fetching call log:', callLogError)
        setSelectedTranscript({ callId, transcript: 'Database Error: ' + callLogError.message })
        return
      }

      if (!callLogData || callLogData.length === 0) {
        setSelectedTranscript({ 
          callId, 
          transcript: `No call log found for call_id: "${callId}"\n\nThe call may not exist in the database or may not have been recorded properly.` 
        })
        return
      }

      const callLogId = callLogData[0].id

      // Step 2: Get transcript data from metrics logs using the call log ID as session_id
      const { data: transcriptTurns, error: transcriptError } = await supabase
        .from('pype_voice_metrics_logs')
        .select('user_transcript, agent_response, turn_id, created_at, unix_timestamp')
        .eq('session_id', callLogId)
        .order('unix_timestamp', { ascending: true })

      if (transcriptError) {
        console.error('❌ [ERROR] Database error fetching transcript:', transcriptError)
        setSelectedTranscript({ callId, transcript: 'Transcript Database Error: ' + transcriptError.message })
        return
      }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-blue-600" />
              Evals Metrics
            </h1>
            <p className="text-gray-600 mt-2">Configure and manage evaluation prompts for analyzing conversation quality</p>
          </div>
          
          <div className="flex gap-3">
            <Button 
              onClick={() => {
                setEditingPrompt(null)
                setShowCreatePrompt(true)
              }}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Prompt
            </Button>
            <Button 
              onClick={() => setShowCreateJob(true)}
              variant="outline"
              className="flex items-center gap-2"
              disabled={!prompts || prompts.length === 0}
              title={!prompts || prompts.length === 0 ? "Create evaluation prompts first" : "Run evaluation on your agent's conversations"}
            >
              <Eye className="w-4 h-4" />
              Run Evaluation
            </Button>
          </div>
        </div>

        {/* Metrics Dashboard */}
        {!promptsLoading && !resultsLoading && !jobsLoading && (evaluationResults?.length > 0 || evaluationJobs?.length > 0) && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Evaluation Metrics
            </h2>
            
            {(() => {
              const metrics = calculateMetrics(evaluationResults, evaluationSummaries, prompts, evaluationJobs)
              return (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Total Evaluations</p>
                          <p className="text-2xl font-bold text-gray-900">{metrics.totalEvaluations}</p>
                        </div>
                        <Activity className="w-8 h-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Completed</p>
                          <p className="text-2xl font-bold text-green-600">{metrics.completedEvaluations}</p>
                        </div>
                        <CheckCircle className="w-8 h-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Success Rate</p>
                          <p className="text-2xl font-bold text-green-600">{metrics.successRate}%</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-green-500" />
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Average Score</p>
                          <p className="text-2xl font-bold text-purple-600">{metrics.averageScore}</p>
                        </div>
                        <Target className="w-8 h-8 text-purple-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Score Range</p>
                          <p className="text-2xl font-bold text-indigo-600">{metrics.minScore} - {metrics.maxScore}</p>
                        </div>
                        <BarChart3 className="w-8 h-8 text-indigo-500" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Active Prompts</p>
                          <p className="text-2xl font-bold text-blue-600">{metrics.activePrompts}</p>
                        </div>
                        <Brain className="w-8 h-8 text-blue-500" />
                      </div>
                    </CardContent>
                  </Card>

                  {metrics.failedEvaluations > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600">Failed</p>
                            <p className="text-2xl font-bold text-red-600">{metrics.failedEvaluations}</p>
                          </div>
                          <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {metrics.pendingEvaluations > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600">Pending</p>
                            <p className="text-2xl font-bold text-yellow-600">{metrics.pendingEvaluations}</p>
                          </div>
                          <Clock className="w-8 h-8 text-yellow-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Recent (7 days)</p>
                          <p className="text-2xl font-bold text-orange-600">{metrics.recentEvaluations}</p>
                        </div>
                        <Clock className="w-8 h-8 text-orange-500" />
                      </div>
                    </CardContent>
                  </Card>

                  {metrics.totalJobs > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600">Evaluation Jobs</p>
                            <p className="text-2xl font-bold text-cyan-600">{metrics.completedJobs}/{metrics.totalJobs}</p>
                          </div>
                          <Users className="w-8 h-8 text-cyan-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Content */}
        <div className="space-y-6">
          {(promptsLoading || resultsLoading || jobsLoading) ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">Loading evaluation data...</p>
              </div>
            </div>
          ) : prompts?.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No evaluation prompts yet</h3>
                <p className="text-gray-600 mb-4">Create your first evaluation prompt to start analyzing your voice agent conversations.</p>
                <Button onClick={() => setShowCreatePrompt(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Prompt
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-600" />
                  Evaluation Prompts
                </h2>
                <span className="text-sm text-gray-500">{prompts.length} prompt{prompts.length !== 1 ? 's' : ''} configured</span>
              </div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {prompts?.map((prompt: EvaluationPrompt) => (
                <Card key={prompt.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{prompt.name}</CardTitle>
                        <Badge className={`text-xs ${getEvaluationTypeColor(prompt.evaluation_type)}`}>
                          {prompt.evaluation_type}
                        </Badge>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditPrompt(prompt)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicatePrompt(prompt)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePreviewPrompt(prompt)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeletePrompt(prompt)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                      {prompt.description}
                    </p>
                    
                    {/* Evaluation Stats for this prompt */}
                    {(() => {
                      const promptResults = evaluationResults?.filter(r => r.prompt_id === prompt.id) || []
                      const completedResults = promptResults.filter(r => r.status === 'completed')
                      const avgScore = completedResults.length > 0 
                        ? (completedResults.reduce((sum, r) => sum + (Number(r.evaluation_score?.score) || 0), 0) / completedResults.length)
                        : 0
                      
                      if (promptResults.length > 0) {
                        return (
                          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-blue-900">Evaluation Stats</span>
                              <Users className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-blue-700">Total:</span> {promptResults.length}
                              </div>
                              <div>
                                <span className="text-blue-700">Completed:</span> {completedResults.length}
                              </div>
                              <div>
                                <span className="text-blue-700">Avg Score:</span> {avgScore > 0 ? formatScore(avgScore, prompt.scoring_output_type) : 'N/A'}
                              </div>
                              <div>
                                <span className="text-blue-700">Success:</span> {promptResults.length > 0 ? Math.round(completedResults.length / promptResults.length * 100) : 0}%
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()}
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Provider: {getProviderDisplayName(prompt.llm_provider)}</span>
                        <span>Model: {prompt.model}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Output: {getScoringOutputTypeInfo(prompt.scoring_output_type || 'float').label}</span>
                        <span>Temp: {prompt.temperature}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className={`px-2 py-1 rounded-full ${prompt.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {prompt.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className="text-gray-400">
                          Created {new Date(prompt.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Evaluation Results Section */}
        {evaluationResults && evaluationResults.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                Recent Evaluation Results
              </h2>
              <Badge variant="outline" className="text-blue-600">
                {evaluationResults.length} results
              </Badge>
            </div>
            
            <div className="grid gap-4">
              {evaluationResults
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 10) // Show only the 10 most recent results
                .map((result: any) => (
                  <Card key={result.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200">
                              {result.evaluation_score?.evaluation_type || 'Unknown'}
                            </Badge>
                            <Badge variant={result.status === 'completed' ? 'default' : result.status === 'failed' ? 'destructive' : 'secondary'}>
                              {result.status}
                            </Badge>
                            {result.status === 'completed' && (
                              <Badge variant="outline" className="text-green-700 bg-green-50">
                                Score: {result.evaluation_score?.overall_score ? Number(result.evaluation_score.overall_score).toFixed(1) : 'N/A'}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                            <div>
                              <div className="text-sm text-gray-500">Call ID</div>
                              <div className="font-medium text-sm">{result.call_id || result.trace_id || 'N/A'}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Evaluated</div>
                              <div className="font-medium text-sm">{new Date(result.created_at).toLocaleDateString()}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Execution Time</div>
                              <div className="font-medium text-sm">{result.execution_time_ms ? `${result.execution_time_ms}ms` : 'N/A'}</div>
                            </div>
                          </div>

                          {result.evaluation_reasoning && (
                            <div className="bg-gray-50 rounded-lg p-3 mb-3">
                              <div className="text-sm text-gray-600 line-clamp-2">
                                {result.evaluation_reasoning}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="ml-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex items-center gap-2"
                            onClick={() => handleViewTranscript(result.call_id)}
                          >
                            <Eye className="w-4 h-4" />
                            View Transcript
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* Transcript Dialog */}
        <Dialog 
          open={!!selectedTranscript} 
          onOpenChange={(open) => {
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
      </div>
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Evaluation Prompt' : 'Create Evaluation Prompt'}</DialogTitle>
        </DialogHeader>
        
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
              onValueChange={(value) => setFormData({ ...formData, scoring_output_type: value })}
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
      </DialogContent>
    </Dialog>
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