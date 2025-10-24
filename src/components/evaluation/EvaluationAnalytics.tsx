'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart3, TrendingUp, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

// Mock trace data with different scores
const mockTraces = [
  {
    id: '1',
    traceId: 'trace_001',
    timestamp: '2024-10-11T10:30:00Z',
    agentResponse: 'Hello! How can I help you today?',
    evaluationScore: 8.5,
    category: 'Quality',
    status: 'completed',
    metrics: {
      relevance: 9.0,
      accuracy: 8.2,
      completeness: 8.3
    }
  },
  {
    id: '2',
    traceId: 'trace_002',
    timestamp: '2024-10-11T10:25:00Z',
    agentResponse: 'I understand your concern about the billing issue. Let me help you resolve this.',
    evaluationScore: 9.2,
    category: 'Accuracy',
    status: 'completed',
    metrics: {
      relevance: 9.5,
      accuracy: 9.0,
      completeness: 9.1
    }
  },
  {
    id: '3',
    traceId: 'trace_003',
    timestamp: '2024-10-11T10:20:00Z',
    agentResponse: 'Sorry, I don\'t have information about that specific product.',
    evaluationScore: 6.8,
    category: 'Completeness',
    status: 'completed',
    metrics: {
      relevance: 7.0,
      accuracy: 6.5,
      completeness: 6.9
    }
  },
  {
    id: '4',
    traceId: 'trace_004',
    timestamp: '2024-10-11T10:15:00Z',
    agentResponse: 'Thank you for contacting us. Your request has been processed successfully.',
    evaluationScore: 8.9,
    category: 'Sentiment',
    status: 'completed',
    metrics: {
      relevance: 8.8,
      accuracy: 9.1,
      completeness: 8.8
    }
  },
  {
    id: '5',
    traceId: 'trace_005',
    timestamp: '2024-10-11T10:10:00Z',
    agentResponse: 'I need more details to provide you with accurate assistance.',
    evaluationScore: 7.4,
    category: 'Quality',
    status: 'completed',
    metrics: {
      relevance: 7.8,
      accuracy: 7.2,
      completeness: 7.2
    }
  },
  {
    id: '6',
    traceId: 'trace_006',
    timestamp: '2024-10-11T10:05:00Z',
    agentResponse: 'Based on your query, here are the top 3 recommendations for your needs.',
    evaluationScore: 9.5,
    category: 'Accuracy',
    status: 'completed',
    metrics: {
      relevance: 9.7,
      accuracy: 9.4,
      completeness: 9.4
    }
  }
]

interface EvaluationAnalyticsProps {
  params: { projectid: string; agentid: string }
}

export default function EvaluationAnalytics({ params }: EvaluationAnalyticsProps) {
  const getScoreColor = (score: number) => {
    if (score >= 9) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 8) return 'text-blue-600 bg-blue-50 border-blue-200'
    if (score >= 7) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'quality':
        return 'bg-purple-50 text-purple-700 border-purple-200'
      case 'sentiment':
        return 'bg-pink-50 text-pink-700 border-pink-200'
      case 'accuracy':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'completeness':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-500" />
    }
  }

  const averageScore = mockTraces.reduce((sum, trace) => sum + trace.evaluationScore, 0) / mockTraces.length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              Evaluation
            </h1>
            <p className="text-gray-600 mt-2">Agent trace evaluation analytics and performance metrics</p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Traces</p>
                  <p className="text-2xl font-bold text-gray-900">{mockTraces.length}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Average Score</p>
                  <p className="text-2xl font-bold text-gray-900">{averageScore.toFixed(1)}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">High Scores (≥9)</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {mockTraces.filter(t => t.evaluationScore >= 9).length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Low Scores (&lt;7)</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {mockTraces.filter(t => t.evaluationScore < 7).length}
                  </p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Traces List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Recent Trace Evaluations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockTraces.map((trace) => (
                <div key={trace.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(trace.status)}
                      <div>
                        <p className="font-medium text-gray-900">{trace.traceId}</p>
                        <p className="text-sm text-gray-500">
                          {new Date(trace.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getCategoryColor(trace.category)}>
                        {trace.category}
                      </Badge>
                      <Badge className={`${getScoreColor(trace.evaluationScore)} font-semibold`}>
                        {trace.evaluationScore.toFixed(1)}
                      </Badge>
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className="text-gray-700 text-sm bg-gray-50 p-3 rounded border">
                      &quot;{trace.agentResponse}&quot;
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Relevance:</span>
                      <span className="font-medium">{trace.metrics.relevance}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Accuracy:</span>
                      <span className="font-medium">{trace.metrics.accuracy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completeness:</span>
                      <span className="font-medium">{trace.metrics.completeness}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}