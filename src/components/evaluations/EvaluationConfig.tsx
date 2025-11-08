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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { AlertCircle, Plus, Settings, Play, MoreHorizontal, Edit2, Trash2, Copy, Eye, Brain, CheckCircle, Clock, XCircle, RefreshCw, Bug } from 'lucide-react'
import { query } from "../../lib/postgres"

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
}

interface EvaluationConfigProps {
  params: { projectid: string; agentid: string }
}

export default function EvaluationConfig({ params }: EvaluationConfigProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'prompts' | 'jobs'>('prompts')
  const [showCreatePrompt, setShowCreatePrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<EvaluationPrompt | null>(null)
  const [showEditPrompt, setShowEditPrompt] = useState(false)
  const [showCreateJob, setShowCreateJob] = useState(false)
  const [selectedPrompts, setSelectedPrompts] = useState<string[]>([])
  
  // Fetch evaluation prompts
  const { data: prompts, loading: promptsLoading, error: promptsError, refetch: refetchPrompts } = useSupabaseQuery('pype_voice_evaluation_prompts', {
    select: '*',
    filters: [{ column: 'project_id', operator: 'eq', value: params.projectid }],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Fetch evaluation jobs
  const { data: jobs, loading: jobsLoading, error: jobsError, refetch: refetchJobs } = useSupabaseQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: [
      { column: 'project_id', operator: 'eq', value: params.projectid },
      { column: 'agent_id', operator: 'eq', value: params.agentid }
    ],
    orderBy: { column: 'created_at', ascending: false }
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'running':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'running':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
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
      refetchJobs()
    } catch (error) {
      console.error('Failed to create evaluation job:', error)
      // TODO: Add proper error handling/toast notification
      alert(`Failed to create evaluation job: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleRerunJob = async (job: EvaluationJob) => {
    try {
      // For re-run, we'll use the default "all" traces mode since we don't have the original config
      const rerunJobData = {
        name: `${job.name} (Re-run)`,
        description: job.description ? `${job.description} [Re-run from ${new Date().toLocaleDateString()}]` : `Re-run from ${new Date().toLocaleDateString()}`,
        trace_selection_mode: 'all', // Default to all traces
        trace_selection_config: {},
        scheduled_at: new Date().toISOString()
      }

      // We need to get the original job's prompt IDs from the database
      const jobDetailsResponse = await fetch(`/api/evaluations/jobs/${job.id}`)
      const jobDetails = await jobDetailsResponse.json()
      
      if (!jobDetailsResponse.ok) {
        throw new Error('Failed to fetch job details for re-run')
      }

      const response = await fetch('/api/evaluations/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rerunJobData,
          project_id: params.projectid,
          agent_id: params.agentid,
          prompt_ids: jobDetails.data.prompt_ids || []
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to re-run evaluation job')
      }
      
      console.log('Evaluation job re-run successfully:', result.data)
      refetchJobs()
      alert(`Job "${job.name}" has been re-run successfully!`)
    } catch (error) {
      console.error('Failed to re-run evaluation job:', error)
      alert(`Failed to re-run evaluation job: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDeletePrompt = async (prompt: EvaluationPrompt) => {
    try {
      const confirmDelete = confirm(`Are you sure you want to delete the prompt "${prompt.name}"? This action cannot be undone.`)
      if (!confirmDelete) return

      const response = await fetch(`/api/evaluations/prompts/${prompt.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete prompt')
      }
      
      console.log('Prompt deleted successfully:', result.message)
      refetchPrompts()
      alert(result.message)
    } catch (error) {
      console.error('Failed to delete prompt:', error)
      alert(`Failed to delete prompt: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleEditPrompt = (prompt: EvaluationPrompt) => {
    setEditingPrompt(prompt)
    setShowEditPrompt(true)
  }

  const handleDeleteJob = async (job: EvaluationJob) => {
    try {
      const confirmDelete = confirm(`Are you sure you want to delete the job "${job.name}"? This will also delete all evaluation results. This action cannot be undone.`)
      if (!confirmDelete) return

      const response = await fetch(`/api/evaluations/jobs/${job.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete job')
      }
      
      console.log('Job deleted successfully:', result.message)
      refetchJobs()
      alert(result.message)
    } catch (error) {
      console.error('Failed to delete job:', error)
      alert(`Failed to delete job: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleProcessJob = async (job: EvaluationJob) => {
    try {
      const response = await fetch(`/api/evaluations/jobs/${job.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start job processing')
      }
      
      console.log('Job processing started:', result.message)
      alert(`Job "${job.name}" processing started!`)
      refetchJobs() // Refresh to show updated status
    } catch (error) {
      console.error('Failed to start job processing:', error)
      alert(`Failed to start job processing: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDebugJob = async (job: EvaluationJob) => {
    try {
      const response = await fetch(`/api/evaluations/jobs/${job.id}/debug`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get debug info')
      }
      
      console.log('Debug info for job:', job.name, result.debug)
      
      // Create a formatted debug message
      const debugInfo = result.debug
      const message = `Debug Info for "${job.name}":

Job Status: ${debugInfo.job.status}
Agent ID: ${debugInfo.job.agent_id}
Project ID: ${debugInfo.job.project_id}
Total Traces: ${debugInfo.job.total_traces}
Completed: ${debugInfo.job.completed_traces}
Failed: ${debugInfo.job.failed_traces}
Error: ${debugInfo.job.error_message || 'None'}

Prompts: ${debugInfo.prompts.count} prompts configured
Call Logs: ${debugInfo.callLogs.total_for_agent} total, ${debugInfo.callLogs.filtered_available} available for evaluation
Evaluation Results: ${debugInfo.evaluationResults.count} results

Environment: OpenAI Key ${debugInfo.environment.has_openai_key ? 'Available' : 'Missing'}`

      alert(message)
    } catch (error) {
      console.error('Failed to get debug info:', error)
      alert(`Failed to get debug info: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleDiagnoseJob = async (job: EvaluationJob) => {
    try {
      const response = await fetch(`/api/evaluations/jobs/${job.id}/diagnose`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get diagnostics')
      }
      
      console.log('Diagnostics for job:', job.name, result.diagnostics)
      
      // Create a formatted diagnostic message
      const diag = result.diagnostics
      const message = `Call Log Diagnostics for "${job.name}":

📊 CALL LOG COUNTS:
• Total for agent: ${diag.callLogCounts.total_for_agent}
• After project filter: ${diag.callLogCounts.after_project_filter}  
• After completion filter: ${diag.callLogCounts.after_completion_filter}
• After transcript filter: ${diag.callLogCounts.after_transcript_filter}

🎯 JOB CONFIG:
• Agent ID: ${diag.job.agent_id}
• Project ID: ${diag.job.project_id}
• Filters: ${JSON.stringify(diag.job.filter_criteria || 'None')}

🤖 AGENT: ${diag.agent?.name || 'Not found'}

📝 SAMPLE LOGS: ${diag.sampleCallLogs.all.length} samples
${diag.sampleCallLogs.all.map((log: any) => `• ${log.id}: ${log.call_ended_reason}, transcript=${log.has_transcript}`).join('\n')}

❗ ISSUES: ${Object.values(diag.errors).filter(Boolean).join(', ') || 'None'}`

      alert(message)
    } catch (error) {
      console.error('Failed to get diagnostics:', error)
      alert(`Failed to get diagnostics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleTestJob = async (job: EvaluationJob) => {
    try {
      const response = await fetch(`/api/evaluations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id })
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('Test job failed:', result)
        alert(`Test failed: ${result.details || result.error || 'Unknown error'}`)
      } else {
        console.log('Test job completed:', result)
        alert(`Test completed successfully for "${job.name}"!`)
        refetchJobs() // Refresh to show updated status
      }
    } catch (error) {
      console.error('Failed to test job:', error)
      alert(`Failed to test job: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Brain className="w-8 h-8 text-blue-600" />
              LLM Evaluation Center
            </h1>
            <p className="text-gray-600 mt-2">
              Configure and run AI-powered evaluations on your voice agent transcripts
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button 
              onClick={() => setShowCreatePrompt(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Prompt
            </Button>
            <Button 
              onClick={() => setShowCreateJob(true)}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Run Evaluation
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-200 p-1 rounded-lg mb-6 w-fit">
          <button
            onClick={() => setActiveTab('prompts')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'prompts'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Evaluation Prompts
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'jobs'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Evaluation Jobs
          </button>
        </div>

        {/* Content */}
        {activeTab === 'prompts' && (
          <div className="space-y-6">
            {promptsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
                            <DropdownMenuItem>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem>
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
                          <span>Success: {getSuccessCriteriaDisplayText(prompt.success_criteria)}</span>
                          <span className={`px-2 py-1 rounded-full ${prompt.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {prompt.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-6">
            {jobsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : jobs?.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Play className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No evaluation jobs yet</h3>
                  <p className="text-gray-600 mb-4">Run your first evaluation to analyze conversation quality and performance.</p>
                  <Button onClick={() => setShowCreateJob(true)}>
                    <Play className="w-4 h-4 mr-2" />
                    Run First Evaluation
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {jobs?.map((job: EvaluationJob) => (
                  <Card key={job.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {getStatusIcon(job.status)}
                            <h3 className="text-lg font-semibold">{job.name}</h3>
                            <Badge className={`text-xs ${getStatusColor(job.status)}`}>
                              {job.status}
                            </Badge>
                          </div>
                          <p className="text-gray-600 mb-4">{job.description}</p>
                          
                          <div className="flex items-center gap-6 text-sm text-gray-500">
                            <span>Total: {job.total_traces}</span>
                            <span>Completed: {job.completed_traces}</span>
                            {job.failed_traces > 0 && (
                              <span className="text-red-600">Failed: {job.failed_traces}</span>
                            )}
                            <span>Created: {new Date(job.created_at).toLocaleDateString()}</span>
                          </div>
                          
                          {job.status === 'running' && (
                            <div className="mt-4">
                              <div className="flex justify-between text-sm text-gray-600 mb-1">
                                <span>Progress</span>
                                <span>{Math.round((job.completed_traces / job.total_traces) * 100)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{ width: `${(job.completed_traces / job.total_traces) * 100}%` }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/${params.projectid}/agents/${params.agentid}/evaluations/${job.id}`)}
                          >
                            View Results
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDiagnoseJob(job)}>
                                <Bug className="w-4 h-4 mr-2" />
                                Diagnose Call Logs
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDebugJob(job)}>
                                <Bug className="w-4 h-4 mr-2" />
                                Debug Info
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleTestJob(job)}>
                                <Play className="w-4 h-4 mr-2" />
                                Test Job
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {job.status === 'pending' && (
                                <DropdownMenuItem onClick={() => handleProcessJob(job)}>
                                  <Play className="w-4 h-4 mr-2" />
                                  Start Processing
                                </DropdownMenuItem>
                              )}
                              {(job.status === 'completed' || job.status === 'failed') && (
                                <DropdownMenuItem onClick={() => handleRerunJob(job)}>
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Re-run Evaluation
                                </DropdownMenuItem>
                              )}
                              {job.status === 'running' && (
                                <DropdownMenuItem className="text-red-600">
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Cancel Job
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => handleDeleteJob(job)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Prompt Dialog */}
      <CreatePromptDialog 
        open={showCreatePrompt}
        onOpenChange={setShowCreatePrompt}
        projectId={params.projectid}
        onSuccess={refetchPrompts}
      />

      {/* Edit Prompt Dialog */}
      <CreatePromptDialog 
        open={showEditPrompt}
        onOpenChange={setShowEditPrompt}
        projectId={params.projectid}
        onSuccess={() => {
          refetchPrompts()
          setEditingPrompt(null)
          setShowEditPrompt(false)
        }}
        editPrompt={editingPrompt}
        isEdit={true}
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
  )
}

// Create/Edit Prompt Dialog Component
function CreatePromptDialog({ open, onOpenChange, projectId, onSuccess, editPrompt = null, isEdit = false }: any) {
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
          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
          { value: 'gemini-pro', label: 'Gemini Pro' }
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

          {/* Success Criteria Field - Debug version */}
          {formData.scoring_output_type && (
            <div>
              <Label htmlFor="success_criteria">
                {getScoringOutputTypeInfo(formData.scoring_output_type).successCriteriaLabel || 'Success Criteria'}
              </Label>
              <Select 
                value={formData.success_criteria} 
                onValueChange={(value) => setFormData({ ...formData, success_criteria: value })}
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
                <div><span className="text-blue-700">Success Criteria:</span> {getSuccessCriteriaDisplayText(formData.success_criteria)}</div>
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
      date_range: 'last_30_days',  // Expanded from 7 days to 30 days
      min_duration: 10,            // Reduced from 30 seconds to 10 seconds  
      call_status: 'completed',
      start_date: '',              // Custom date range start
      end_date: ''                 // Custom date range end
    }
  })

  const [traces, setTraces] = useState<any[]>([])
  const [tracesLoading, setTracesLoading] = useState(false)
  const [tracesError, setTracesError] = useState<string | null>(null)

  // Fetch available traces when dialog opens or trace selection changes to manual/date_filtered
  React.useEffect(() => {
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