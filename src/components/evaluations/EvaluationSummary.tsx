'use client'

import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApiQuery } from '@/hooks/useApi'
import { 
  ArrowLeft, 
  BarChart3, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  Target,
  Award,
  Phone,
  Clock,
  Sparkles,
  ChevronRight,
  Timer
} from 'lucide-react'

// Helper function to get scoring output type information
const getScoringOutputTypeInfo = (type: string) => {
  switch (type) {
    case 'bool':
      return {
        label: 'Boolean (True/False)',
        format: (value: any) => value ? '✅ Pass' : '❌ Fail'
      }
    case 'int':
      return {
        label: 'Integer',
        format: (value: any) => `${Math.round(Number(value) || 0)}`
      }
    case 'percentage':
      return {
        label: 'Percentage',
        format: (value: any) => `${Math.round(Number(value) || 0)}%`
      }
    case 'float':
      return {
        label: 'Float',
        format: (value: any) => `${Number(value || 0).toFixed(1)}`
      }
    default:
      return {
        label: 'Raw Value',
        format: (value: any) => String(value || 'N/A')
      }
  }
}

interface EvaluationSummaryProps {
  params: { projectid: string; agentid: string; jobid: string }
}

interface EvaluationResult {
  id: string
  trace_id: string
  call_id: string
  evaluation_score: {
    overall_score?: number | boolean
    parsed_scores?: any
    evaluation_type?: string
    turn_latency?: {
      passed: boolean
      maxLatency: number | null
      avgLatency: number | null
      exceedingTurns: number
      totalTurns: number
    }
  }
  evaluation_reasoning: string
  status: string
  created_at: string
}

interface EvaluationSummary {
  evaluation_type: string
  avg_score: number
  min_score: number
  max_score: number
  total_evaluations: number
  pass_rate: number
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

// Donut Chart Component
const DonutChart = ({ 
  percentage, 
  size = 180, 
  strokeWidth = 40,
  color = '#22c55e',
  bgColor = '#ef4444'
}: { 
  percentage: number
  size?: number
  strokeWidth?: number
  color?: string
  bgColor?: string
}) => {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const center = size / 2
  
  // Dynamic font sizes based on chart size - smaller percentage font
  const percentageFontSize = Math.max(size / 7, 20)
  const labelFontSize = Math.max(size / 14, 12)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle (red for failed) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
          className="opacity-30"
        />
        {/* Progress circle (green for passed) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span 
          className="font-bold text-gray-900 dark:text-gray-100"
          style={{ fontSize: `${percentageFontSize}px` }}
        >
          {percentage.toFixed(1)}%
        </span>
        <span 
          className="text-gray-500 dark:text-gray-400 font-medium"
          style={{ fontSize: `${labelFontSize}px` }}
        >
          Pass Rate
        </span>
      </div>
    </div>
  )
}

// Individual Metric Cell Component
const MetricCell = ({ 
  value, 
  isPassing 
}: { 
  value: any
  isPassing: boolean 
}) => {
  return (
    <div 
      className={`
        px-3 py-2 rounded-lg text-center font-medium text-sm
        transition-all duration-200
        ${isPassing 
          ? 'bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 border border-green-200 dark:from-green-900/30 dark:to-emerald-900/30 dark:text-green-400 dark:border-green-800' 
          : 'bg-gradient-to-br from-red-50 to-rose-50 text-red-700 border border-red-200 dark:from-red-900/30 dark:to-rose-900/30 dark:text-red-400 dark:border-red-800'
        }
      `}
    >
      <div className="flex items-center justify-center gap-1.5">
        {isPassing ? (
          <CheckCircle className="w-3.5 h-3.5" />
        ) : (
          <XCircle className="w-3.5 h-3.5" />
        )}
        <span>{typeof value === 'boolean' ? (value ? 'Pass' : 'Fail') : value}</span>
      </div>
    </div>
  )
}

// Final Result Badge Component
const FinalResultBadge = ({ isPassing }: { isPassing: boolean }) => {
  return (
    <div 
      className={`
        px-4 py-2 rounded-xl font-semibold text-sm
        flex items-center justify-center gap-2
        shadow-sm
        ${isPassing 
          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' 
          : 'bg-gradient-to-r from-red-500 to-rose-500 text-white'
        }
      `}
    >
      {isPassing ? (
        <>
          <CheckCircle className="w-4 h-4" />
          <span>PASS</span>
        </>
      ) : (
        <>
          <XCircle className="w-4 h-4" />
          <span>FAIL</span>
        </>
      )}
    </div>
  )
}

export default function EvaluationSummary({ params }: EvaluationSummaryProps) {
  const router = useRouter()

  // Fetch project and agent info for header
  const { data: projectData, loading: projectLoading } = useApiQuery('projects', {
    select: 'id, name',
    filters: [{ column: 'id', operator: 'eq', value: params.projectid }],
    limit: 1
  })

  const { data: agentData, loading: agentLoading } = useApiQuery('pype_voice_agents', {
    select: 'id, name',
    filters: [{ column: 'id', operator: 'eq', value: params.agentid }],
    limit: 1
  })

  const projectName = projectData?.[0]?.name || 'Unknown Project'
  const agentName = agentData?.[0]?.name || 'Unknown Agent'

  // Fetch job details
  const { data: jobData, loading: jobLoading } = useApiQuery('pype_voice_evaluation_jobs', {
    select: '*',
    filters: [{ column: 'id', operator: 'eq', value: params.jobid }],
    limit: 1
  })

  // Fetch evaluation summaries
  const { data: summaries, loading: summariesLoading } = useApiQuery('pype_voice_evaluation_summaries', {
    select: '*',
    filters: [{ column: 'job_id', operator: 'eq', value: params.jobid }]
  })

  // Fetch prompt details for this job
  const { data: promptData, loading: promptLoading } = useApiQuery('pype_voice_evaluation_prompts', {
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

  // Fetch detailed results
  const { data: results, loading: resultsLoading } = useApiQuery('pype_voice_evaluation_results', {
    select: `
      id,
      job_id,
      prompt_id,
      trace_id,
      call_id,
      agent_id,
      evaluation_score,
      evaluation_reasoning,
      status,
      created_at
    `,
    filters: [{ column: 'job_id', operator: 'eq' as const, value: params.jobid }],
    orderBy: { column: 'created_at', ascending: true }
  })

  const job = jobData?.[0] as EvaluationJob
  const prompt = promptData?.[0]

  // Calculate overall pass rate and metrics
  const overallMetrics = useMemo(() => {
    if (!results || results.length === 0) {
      return { passRate: 0, passed: 0, failed: 0, total: 0 }
    }

    const scoringType = prompt?.scoring_output_type || 'bool'
    let passed = 0
    let failed = 0

    results.forEach((result: EvaluationResult) => {
      const score = result.evaluation_score?.overall_score
      
      // Determine if this result passes
      let isPassing = false
      if (scoringType === 'bool') {
        isPassing = score === true || String(score) === 'true' || score === 1
      } else {
        // For numeric types, consider passing if score >= 70%
        const numScore = Number(score) || 0
        isPassing = scoringType === 'percentage' ? numScore >= 70 : numScore >= 0.7
      }

      if (isPassing) {
        passed++
      } else {
        failed++
      }
    })

    return {
      passRate: results.length > 0 ? (passed / results.length) * 100 : 0,
      passed,
      failed,
      total: results.length
    }
  }, [results, prompt])

  // Static metric - Turn Latency threshold (default 5 seconds)
  const turnLatencyThreshold = 5

  // Get unique metric keys from all results (including Turn Latency static metric)
  const metricKeys = useMemo(() => {
    if (!results || results.length === 0) return []
    
    const keys = new Set<string>()
    results.forEach((result: EvaluationResult) => {
      const parsedScores = result.evaluation_score?.parsed_scores
      if (parsedScores && typeof parsedScores === 'object') {
        Object.keys(parsedScores).forEach(key => keys.add(key))
      }
    })
    
    // If no parsed scores, check if there's an overall_score
    if (keys.size === 0) {
      keys.add('overall_score')
    }
    
    // Add Turn Latency as a static metric
    keys.add('turn_latency')
    
    return Array.from(keys)
  }, [results])

  // Process results for the metrics table
  const processedResults = useMemo(() => {
    if (!results || results.length === 0) return []

    return results.map((result: EvaluationResult, index: number) => {
      const parsedScores = result.evaluation_score?.parsed_scores || {}
      const overallScore = result.evaluation_score?.overall_score
      
      // Create scores object with all metrics
      const scores: Record<string, { value: any; isPassing: boolean }> = {}
      
      if (Object.keys(parsedScores).length > 0) {
        metricKeys.forEach(key => {
          // Skip turn_latency here, we'll add it separately
          if (key === 'turn_latency') return
          
          const value = parsedScores[key]
          // Skip turn_latency here as we handle it separately below
          if (key === 'turn_latency') return
          
          const isPassing = value === true || String(value) === 'true' || value === 1 || 
                           (typeof value === 'number' && value >= 0.7) ||
                           (typeof value === 'string' && parseFloat(value) >= 70)
          scores[key] = { value, isPassing }
        })
      } else {
        // Use overall_score if no parsed scores
        const isPassing = overallScore === true || String(overallScore) === 'true' || overallScore === 1
        scores['overall_score'] = { value: overallScore, isPassing }
      }
      
      // Add Turn Latency static metric from the evaluation score
      // The new format stores turn_latency as an object with passed, maxLatency, avgLatency, etc.
      const turnLatencyData = result.evaluation_score?.turn_latency || parsedScores['turn_latency']
      
      if (turnLatencyData && typeof turnLatencyData === 'object' && 'passed' in turnLatencyData) {
        // New format: { passed: boolean, maxLatency: number, avgLatency: number, exceedingTurns: number, totalTurns: number }
        const displayValue = turnLatencyData.maxLatency !== null 
          ? `${turnLatencyData.maxLatency.toFixed(1)}s (max)` 
          : '✓'
        scores['turn_latency'] = { 
          value: displayValue, 
          isPassing: turnLatencyData.passed 
        }
      } else if (turnLatencyData !== undefined) {
        // Old format: numeric or string value
        const latencyValue = turnLatencyData
        const isPassing = typeof latencyValue === 'number' ? latencyValue < turnLatencyThreshold : true
        scores['turn_latency'] = { 
          value: typeof latencyValue === 'number' ? `${latencyValue.toFixed(1)}s` : latencyValue, 
          isPassing 
        }
      } else {
        // Default: show as passing (no latency data means we assume it's fine)
        scores['turn_latency'] = { value: '✓', isPassing: true }
      }
      
      // Calculate final result - FAIL if any metric fails
      const finalResult = Object.values(scores).every(s => s.isPassing)
      
      return {
        id: result.id,
        callId: result.call_id || `Call ${index + 1}`,
        scores,
        finalResult,
        createdAt: result.created_at
      }
    })
  }, [results, metricKeys, turnLatencyThreshold])

  // Summary statistics per metric
  const metricSummaries = useMemo(() => {
    if (!processedResults || processedResults.length === 0) return {}
    
    const summaries: Record<string, { passed: number; failed: number; passRate: number }> = {}
    
    metricKeys.forEach(key => {
      const passed = processedResults.filter(r => r.scores[key]?.isPassing).length
      const failed = processedResults.length - passed
      summaries[key] = {
        passed,
        failed,
        passRate: processedResults.length > 0 ? (passed / processedResults.length) * 100 : 0
      }
    })
    
    return summaries
  }, [processedResults, metricKeys])

  if (jobLoading || summariesLoading || resultsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Loading evaluation summary...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => router.back()}
                className="flex items-center justify-center w-9 h-9 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                {projectLoading ? 'Loading...' : projectName} / {agentLoading ? 'Loading...' : agentName}
              </h1>
            </div>
            <Button
              onClick={() => router.push(`/${params.projectid}/agents/${params.agentid}/evaluations/${params.jobid}`)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg"
            >
              View Details
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gradient-to-br from-gray-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto p-6">

        {/* Main Overview Card with Donut Chart */}
        <Card className="mb-8 overflow-hidden border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Target className="w-5 h-5 text-purple-600" />
              Overall Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row items-center gap-8">
              {/* Donut Chart */}
              <div className="flex-shrink-0">
                <DonutChart 
                  percentage={overallMetrics.passRate} 
                  size={280}
                  strokeWidth={30}
                  color="#22c55e"
                  bgColor="#ef4444"
                />
              </div>
              
              {/* Stats Grid */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-5 border border-green-100 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Passed</span>
                  </div>
                  <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                    {overallMetrics.passed}
                  </div>
                  <div className="text-sm text-green-600/70 dark:text-green-400/70 mt-1">
                    calls passed all criteria
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-2xl p-5 border border-red-100 dark:border-red-800">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                    <XCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Failed</span>
                  </div>
                  <div className="text-3xl font-bold text-red-700 dark:text-red-300">
                    {overallMetrics.failed}
                  </div>
                  <div className="text-sm text-red-600/70 dark:text-red-400/70 mt-1">
                    calls need attention
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-5 border border-blue-100 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                    <Phone className="w-5 h-5" />
                    <span className="text-sm font-medium">Total Calls</span>
                  </div>
                  <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                    {overallMetrics.total}
                  </div>
                  <div className="text-sm text-blue-600/70 dark:text-blue-400/70 mt-1">
                    evaluated in this job
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-2xl p-5 border border-purple-100 dark:border-purple-800">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-medium">Success Rate</span>
                  </div>
                  <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                    {overallMetrics.passRate.toFixed(1)}%
                  </div>
                  <div className="text-sm text-purple-600/70 dark:text-purple-400/70 mt-1">
                    overall quality score
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Metrics Table Card */}
        <Card className="border-0 shadow-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-gray-100 dark:border-gray-700">
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Call-by-Call Evaluation Results
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Each row represents a call evaluation. Final Result is FAIL if any metric fails.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                      Call ID
                    </th>
                    {metricKeys.map(key => (
                      <th key={key} className="px-4 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col items-center gap-1">
                          <span>{key.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                            ({metricSummaries[key]?.passRate.toFixed(0)}% pass)
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                      Final Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {processedResults.length === 0 ? (
                    <tr>
                      <td 
                        colSpan={metricKeys.length + 2} 
                        className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                          <p className="font-medium">No evaluation results yet</p>
                          <p className="text-sm">Results will appear here once the evaluation job completes.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    processedResults.map((result, index) => (
                      <tr 
                        key={result.id} 
                        className={`
                          transition-colors duration-150
                          ${index % 2 === 0 
                            ? 'bg-white dark:bg-gray-800' 
                            : 'bg-gray-50/50 dark:bg-gray-800/50'
                          }
                          hover:bg-blue-50/50 dark:hover:bg-blue-900/10
                        `}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono" title={result.callId}>
                              {result.callId.length > 16 
                                ? `...${result.callId.slice(-8)}` 
                                : result.callId
                              }
                            </span>
                          </div>
                        </td>
                        {metricKeys.map(key => (
                          <td key={key} className="px-4 py-4">
                            <MetricCell 
                              value={result.scores[key]?.value ?? 'N/A'} 
                              isPassing={result.scores[key]?.isPassing ?? false} 
                            />
                          </td>
                        ))}
                        <td className="px-6 py-4">
                          <FinalResultBadge isPassing={result.finalResult} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Metric Summary Footer */}
            {processedResults.length > 0 && (
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-750 px-6 py-4">
                <div className="flex items-center gap-6 text-sm">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Summary:</span>
                  {metricKeys.map(key => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}:</span>
                      <Badge 
                        variant="outline" 
                        className={`
                          ${metricSummaries[key]?.passRate >= 70 
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                          }
                        `}
                      >
                        {metricSummaries[key]?.passed}/{processedResults.length} ({metricSummaries[key]?.passRate.toFixed(0)}%)
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quality Insights */}
        {summaries && summaries.length > 0 && (
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {summaries.map((summary: EvaluationSummary) => (
              <Card key={summary.evaluation_type} className="border-0 shadow-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:shadow-xl transition-shadow duration-300">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Award className="w-5 h-5 text-amber-500" />
                    {summary.evaluation_type}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Average Score</span>
                      <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').format(summary.avg_score)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">Range</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').format(summary.min_score)} - {getScoringOutputTypeInfo(prompt?.scoring_output_type || 'float').format(summary.max_score)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-green-400 to-emerald-500 h-2 rounded-full transition-all duration-500" 
                        style={{ width: `${(summary.pass_rate || 0) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
                      Pass Rate: {((summary.pass_rate || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
