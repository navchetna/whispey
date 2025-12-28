'use client'

import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSupabaseQuery } from '@/hooks/useApi'
import { 
  BarChart3, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  Target,
  Award,
  Phone,
  Star,
  Sparkles,
  ChevronRight,
  PieChart
} from 'lucide-react'

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
    const cleaned = value.replace(/%/g, '').trim()
    const parsed = parseFloat(cleaned)
    return isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return 0
}

// Helper function to get scoring output type information
const getScoringOutputTypeInfo = (type: string) => {
  switch (type) {
    case 'bool':
      return {
        label: 'Boolean (True/False)',
        format: (value: any) => parseBooleanScore(value) ? '✅ Pass' : '❌ Fail'
      }
    case 'int':
      return {
        label: 'Integer',
        format: (value: any) => `${Math.round(parseNumericScore(value))}`
      }
    case 'percentage':
      return {
        label: 'Percentage',
        format: (value: any) => `${Math.round(parseNumericScore(value))}%`
      }
    case 'float':
      return {
        label: 'Float',
        format: (value: any) => `${parseNumericScore(value).toFixed(1)}`
      }
    default:
      return {
        label: 'Raw Value',
        format: (value: any) => String(value || 'N/A')
      }
  }
}

// Donut Chart Component
const DonutChart = ({ 
  percentage, 
  size = 180, 
  strokeWidth = 20,
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

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
          className="opacity-30"
        />
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
        <span className="text-4xl font-bold text-gray-900 dark:text-gray-100">
          {percentage.toFixed(1)}%
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          Pass Rate
        </span>
      </div>
    </div>
  )
}

// Individual Metric Cell Component - Shows only the final score value
const MetricCell = ({ 
  value, 
  isPassing 
}: { 
  value: any
  isPassing: boolean 
}) => {
  // Format the display value - only show the score, not reasoning
  const displayValue = () => {
    if (typeof value === 'boolean') return value ? 'True' : 'False'
    if (typeof value === 'number') return value.toFixed(2)
    if (typeof value === 'string') {
      // Try to parse as number for clean display
      const num = parseFloat(value)
      if (!isNaN(num)) return num.toFixed(2)
      return value
    }
    return String(value ?? 'N/A')
  }

  return (
    <div 
      className={`
        px-3 py-2 rounded-lg text-center font-medium text-sm
        transition-all duration-200
        ${isPassing 
          ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        }
      `}
    >
      <span>{displayValue()}</span>
    </div>
  )
}

// Final Result Badge Component
const FinalResultBadge = ({ isPassing }: { isPassing: boolean }) => {
  return (
    <div 
      className={`
        px-4 py-2 rounded-lg font-semibold text-sm
        flex items-center justify-center gap-2
        ${isPassing 
          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' 
          : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
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

// Get score icon
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
  if (percentage >= 60) return <TrendingUp className="w-4 h-4 text-yellow-600" />
  return <XCircle className="w-4 h-4 text-red-600" />
}

// Get score value
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

// Format score
const formatScore = (score: any, outputType: string = 'float') => {
  if (score === null || score === undefined) return 'N/A'
  const formatter = getScoringOutputTypeInfo(outputType)
  return formatter.format(score)
}

// Get evaluation type color
const getEvaluationTypeColor = (type: string) => {
  switch (type?.toLowerCase()) {
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

interface EvalsSummaryPageProps {
  params: Promise<{ projectid: string; agentid: string }>
}

interface EvaluationResult {
  id: string
  trace_id: string
  call_id: string
  prompt_id: string
  evaluation_score: {
    overall_score?: number | boolean
    parsed_scores?: any
    evaluation_type?: string
  }
  evaluation_reasoning: string
  status: string
  created_at: string
}

export default function EvalsSummaryPage({ params }: EvalsSummaryPageProps) {
  const resolvedParams = use(params)
  const router = useRouter()

  // Fetch all evaluation prompts for this project
  const { data: allPrompts, loading: promptsLoading } = useSupabaseQuery('pype_voice_evaluation_prompts', {
    select: '*',
    filters: [{ column: 'project_id', operator: 'eq', value: resolvedParams.projectid }],
    orderBy: { column: 'created_at', ascending: false }
  })

  // Fetch all evaluation results for this agent
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
      status,
      created_at
    `,
    filters: [{ column: 'agent_id', operator: 'eq', value: resolvedParams.agentid }],
    orderBy: { column: 'created_at', ascending: true }
  })

  // Calculate overall pass rate and metrics - BASED ON PER CALL (not individual evaluation runs)
  const overallMetrics = useMemo(() => {
    if (!results || results.length === 0) {
      return { passRate: 0, passed: 0, failed: 0, total: 0 }
    }

    // Group results by call_id
    const callGroups: Record<string, EvaluationResult[]> = {}
    
    results.forEach((result: EvaluationResult) => {
      if (result.status !== 'completed') return
      const callId = result.call_id || result.trace_id || result.id
      if (!callGroups[callId]) {
        callGroups[callId] = []
      }
      callGroups[callId].push(result)
    })

    let passed = 0
    let failed = 0

    // For each call, determine if ALL evaluations pass
    Object.values(callGroups).forEach((callResults: EvaluationResult[]) => {
      const allPassingForCall = callResults.every((result: EvaluationResult) => {
        const score = result.evaluation_score?.overall_score
        const prompt = allPrompts?.find((p: any) => p.id === result.prompt_id)
        const scoringType = prompt?.scoring_output_type || 'bool'
        
        if (scoringType === 'bool') {
          return parseBooleanScore(score)
        } else {
          const numScore = parseNumericScore(score)
          return scoringType === 'percentage' ? numScore >= 70 : numScore >= 0.7
        }
      })

      if (allPassingForCall) {
        passed++
      } else {
        failed++
      }
    })

    const totalCalls = Object.keys(callGroups).length
    return {
      passRate: totalCalls > 0 ? (passed / totalCalls) * 100 : 0,
      passed,
      failed,
      total: totalCalls
    }
  }, [results, allPrompts])

  // Get metric columns from evaluation prompts (not from parsed_scores)
  const metricColumns = useMemo(() => {
    if (!allPrompts || allPrompts.length === 0) return []
    return allPrompts.map((prompt: any) => ({
      id: prompt.id,
      name: prompt.name,
      scoringType: prompt.scoring_output_type || 'bool'
    }))
  }, [allPrompts])

  // Process results for the metrics table - group by call_id and show score per metric
  const processedResults = useMemo(() => {
    if (!results || results.length === 0 || !allPrompts || allPrompts.length === 0) return []

    // Group results by call_id
    const callGroups: Record<string, EvaluationResult[]> = {}
    results.forEach((result: EvaluationResult) => {
      if (result.status !== 'completed') return
      const callId = result.call_id || result.trace_id || result.id
      if (!callGroups[callId]) {
        callGroups[callId] = []
      }
      callGroups[callId].push(result)
    })

    // Convert to array with scores per metric
    return Object.entries(callGroups).map(([callId, callResults], index) => {
      const scores: Record<string, { value: any; isPassing: boolean }> = {}
      
      // For each metric (prompt), find the result and extract the score
      metricColumns.forEach((metric: { id: string; name: string; scoringType: string }) => {
        const resultForMetric = callResults.find((r: EvaluationResult) => r.prompt_id === metric.id)
        if (resultForMetric) {
          const score = resultForMetric.evaluation_score?.overall_score
          const scoringType = metric.scoringType
          
          let isPassing = false
          if (scoringType === 'bool') {
            isPassing = parseBooleanScore(score)
          } else {
            const numScore = parseNumericScore(score)
            isPassing = scoringType === 'percentage' ? numScore >= 70 : numScore >= 0.7
          }
          
          scores[metric.id] = { value: score, isPassing }
        } else {
          scores[metric.id] = { value: 'N/A', isPassing: false }
        }
      })
      
      // Final result is PASS only if all metrics pass
      const finalResult = Object.values(scores).every(s => s.value !== 'N/A' && s.isPassing)
      
      return {
        id: callId,
        callId: callId,
        scores,
        finalResult,
        createdAt: callResults[0]?.created_at
      }
    })
  }, [results, metricColumns, allPrompts])

  // Summary statistics per metric
  const metricSummaries = useMemo(() => {
    if (!processedResults || processedResults.length === 0) return {}
    
    const summaries: Record<string, { passed: number; failed: number; passRate: number }> = {}
    
    metricColumns.forEach((metric: { id: string; name: string; scoringType: string }) => {
      const validResults = processedResults.filter(r => r.scores[metric.id]?.value !== 'N/A')
      const passed = validResults.filter(r => r.scores[metric.id]?.isPassing).length
      const failed = validResults.length - passed
      summaries[metric.id] = {
        passed,
        failed,
        passRate: validResults.length > 0 ? (passed / validResults.length) * 100 : 0
      }
    })
    
    return summaries
  }, [processedResults, metricColumns])

  if (promptsLoading || resultsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">Loading evaluation summary...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-600 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Evaluation Summary
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">
                  Quality assessment overview for all evaluations
                </p>
              </div>
            </div>
          </div>
          
          <Button
            onClick={() => router.push(`/${resolvedParams.projectid}/agents/${resolvedParams.agentid}/evals-results`)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            View All Results
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Main Overview Card with Donut Chart */}
        <Card className="mb-8 overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
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
                  size={200}
                  strokeWidth={24}
                  color="#22c55e"
                  bgColor="#ef4444"
                />
              </div>
              
              {/* Stats Grid */}
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Passed</span>
                  </div>
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {overallMetrics.passed}
                  </div>
                  <div className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">
                    calls passed
                  </div>
                </div>
                
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                    <XCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Failed</span>
                  </div>
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                    {overallMetrics.failed}
                  </div>
                  <div className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
                    calls need attention
                  </div>
                </div>
                
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                    <Phone className="w-5 h-5" />
                    <span className="text-sm font-medium">Total Calls</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {overallMetrics.total}
                  </div>
                  <div className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
                    calls evaluated
                  </div>
                </div>
                
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-medium">Success Rate</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                    {overallMetrics.passRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-purple-600/70 dark:text-purple-400/70 mt-1">
                    overall quality
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results by Metric - Moved from EvalsResults */}
        {allPrompts && allPrompts.length > 0 && results && results.length > 0 && (
          <Card className="mb-8 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Star className="w-5 h-5 text-yellow-500" />
                Results by Metric
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {allPrompts.map((promptItem: any) => {
                  const promptResults = results.filter((r: EvaluationResult) => r.prompt_id === promptItem.id)
                  if (promptResults.length === 0) return null
                  
                  const completedResults = promptResults.filter((r: EvaluationResult) => r.status === 'completed')
                  const failedResults = promptResults.filter((r: EvaluationResult) => r.status === 'failed')
                  const scoringType = promptItem.scoring_output_type || 'float'
                  
                  let distribution: { [key: string]: number } = {}
                  let avgScore = 0
                  
                  if (scoringType === 'bool') {
                    const trueCount = completedResults.filter((r: EvaluationResult) => {
                      const score = r.evaluation_score?.overall_score
                      return parseBooleanScore(score)
                    }).length
                    const falseCount = completedResults.length - trueCount
                    distribution = { 'Pass (True)': trueCount, 'Fail (False)': falseCount }
                    avgScore = completedResults.length > 0 ? (trueCount / completedResults.length) * 100 : 0
                  } else {
                    const scores = completedResults.map((r: EvaluationResult) => 
                      parseNumericScore(r.evaluation_score?.overall_score)
                    ).filter((s: number) => !isNaN(s))
                    
                    if (scores.length > 0) {
                      avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length
                      
                      if (scoringType === 'percentage') {
                        distribution = {
                          '0-20%': scores.filter((s: number) => s >= 0 && s < 20).length,
                          '20-40%': scores.filter((s: number) => s >= 20 && s < 40).length,
                          '40-60%': scores.filter((s: number) => s >= 40 && s < 60).length,
                          '60-80%': scores.filter((s: number) => s >= 60 && s < 80).length,
                          '80-100%': scores.filter((s: number) => s >= 80).length
                        }
                      } else {
                        distribution = {
                          'Low (1-3)': scores.filter((s: number) => s >= 0 && s < 4).length,
                          'Medium (4-6)': scores.filter((s: number) => s >= 4 && s < 7).length,
                          'High (7-10)': scores.filter((s: number) => s >= 7).length
                        }
                      }
                    }
                  }
                  
                  return (
                    <Card key={promptItem.id} className="hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-medium text-gray-900 dark:text-gray-100">
                            {promptItem.name}
                          </CardTitle>
                          <Badge className={getEvaluationTypeColor(promptItem.evaluation_type)}>
                            {promptItem.evaluation_type}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Donut Chart for Pass/Fail or Score Distribution */}
                          <div className="flex items-center justify-center">
                            <DonutChart 
                              percentage={avgScore} 
                              size={120}
                              strokeWidth={16}
                              color="#22c55e"
                              bgColor="#ef4444"
                            />
                          </div>
                          
                          {/* Stats below donut */}
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                              <span className="text-gray-600 dark:text-gray-400">
                                {scoringType === 'bool' ? 'Pass' : 'Above Threshold'}
                              </span>
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {scoringType === 'bool' 
                                  ? distribution['Pass (True)'] || 0
                                  : Math.round(completedResults.length * avgScore / 100)
                                }
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                              <span className="text-gray-600 dark:text-gray-400">
                                {scoringType === 'bool' ? 'Fail' : 'Below Threshold'}
                              </span>
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {scoringType === 'bool' 
                                  ? distribution['Fail (False)'] || 0
                                  : completedResults.length - Math.round(completedResults.length * avgScore / 100)
                                }
                              </span>
                            </div>
                          </div>
                          
                          {/* Completed runs info */}
                          <div className="text-center pt-2 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {completedResults.length}/{promptResults.length}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Completed Runs</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detailed Metrics Table Card */}
        <Card className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
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
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                      Call ID
                    </th>
                    {metricColumns.map((metric: { id: string; name: string; scoringType: string }) => (
                      <th key={metric.id} className="px-4 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                        <div className="flex flex-col items-center gap-1">
                          <span>{metric.name}</span>
                          <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500">
                            ({metricSummaries[metric.id]?.passRate.toFixed(0) || 0}% pass)
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
                        colSpan={metricColumns.length + 2} 
                        className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <BarChart3 className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                          <p className="font-medium">No evaluation results yet</p>
                          <p className="text-sm">Results will appear here once evaluations complete.</p>
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
                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                              {index + 1}
                            </div>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 font-mono">
                              {result.callId.length > 12 
                                ? `${result.callId.slice(0, 6)}...${result.callId.slice(-4)}` 
                                : result.callId
                              }
                            </span>
                          </div>
                        </td>
                        {metricColumns.map((metric: { id: string; name: string; scoringType: string }) => (
                          <td key={metric.id} className="px-4 py-4">
                            <MetricCell 
                              value={result.scores[metric.id]?.value ?? 'N/A'} 
                              isPassing={result.scores[metric.id]?.isPassing ?? false} 
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
              <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-4">
                <div className="flex items-center gap-6 text-sm flex-wrap">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Summary:</span>
                  {metricColumns.map((metric: { id: string; name: string; scoringType: string }) => (
                    <div key={metric.id} className="flex items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-400">{metric.name}:</span>
                      <Badge 
                        variant="outline" 
                        className={`
                          ${(metricSummaries[metric.id]?.passRate || 0) >= 70 
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' 
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                          }
                        `}
                      >
                        {metricSummaries[metric.id]?.passed || 0}/{processedResults.length} ({(metricSummaries[metric.id]?.passRate || 0).toFixed(0)}%)
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
