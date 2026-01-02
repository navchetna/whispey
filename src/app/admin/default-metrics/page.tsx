'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocalUser } from '@/lib/local-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { 
  Plus, MoreHorizontal, Edit2, Trash2, Shield, TrendingUp, 
  ArrowLeft, CheckCircle, AlertCircle, FileText
} from 'lucide-react'

interface DefaultMetric {
  id: string
  name: string
  description: string
  metric_type: string
  evaluation_type: string
  prompt_template: string
  scoring_output_type: string
  success_criteria: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Utility functions
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

const getScoringOutputTypeInfo = (type: string) => {
  switch (type) {
    case 'bool':
      return {
        label: 'Boolean (True/False)',
        description: 'Simple pass/fail evaluation',
        successCriteriaOptions: ['true', 'false'],
        successCriteriaLabel: 'Success Value'
      }
    case 'int':
      return {
        label: 'Integer (Whole Numbers)',
        description: 'Discrete scoring with whole numbers',
        successCriteriaOptions: ['higher_is_better', 'lower_is_better'],
        successCriteriaLabel: 'Success Direction'
      }
    case 'percentage':
      return {
        label: 'Percentage (0-100%)',
        description: 'Percentage-based scoring',
        successCriteriaOptions: ['higher_is_better', 'lower_is_better'],
        successCriteriaLabel: 'Success Direction'
      }
    case 'float':
    default:
      return {
        label: 'Float (Decimal Numbers)',
        description: 'Precise scoring with decimal values',
        successCriteriaOptions: ['higher_is_better', 'lower_is_better'],
        successCriteriaLabel: 'Success Direction'
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

export default function AdminDefaultMetricsPage() {
  const router = useRouter()
  const { user, isLoaded, isSignedIn } = useLocalUser()
  const [metrics, setMetrics] = useState<DefaultMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingMetric, setEditingMetric] = useState<DefaultMetric | null>(null)

  // Check if user is admin
  const isAdmin = user?.isAdmin === true

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    if (isSignedIn) {
      fetchMetrics()
    }
  }, [isSignedIn])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/default-metrics')
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch metrics')
      }
      
      setMetrics(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteMetric = async (metric: DefaultMetric) => {
    if (!confirm(`Are you sure you want to delete "${metric.name}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/default-metrics/${metric.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to delete metric')
      }

      fetchMetrics()
    } catch (err) {
      alert(`Failed to delete metric: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleEditMetric = (metric: DefaultMetric) => {
    setEditingMetric(metric)
    setShowCreateDialog(true)
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Shield className="w-8 h-8 text-purple-600" />
                Default Metrics
                <Badge variant="outline" className="text-purple-600 border-purple-300 ml-2">
                  Admin Portal
                </Badge>
              </h1>
              <p className="text-gray-600 mt-2">
                Manage global evaluation metrics that can be imported by all users
              </p>
            </div>
          </div>
          
          {isAdmin && (
            <Button 
              onClick={() => {
                setEditingMetric(null)
                setShowCreateDialog(true)
              }}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4" />
              New Default Metric
            </Button>
          )}
        </div>

        {/* Admin Only Warning */}
        {!isAdmin && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="text-amber-800">
                <strong>View Only:</strong> Only administrators can create, edit, or delete default metrics.
                You can view available metrics and import them to your projects.
              </p>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Metrics</p>
                  <p className="text-2xl font-bold text-gray-900">{metrics.length}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Metrics</p>
                  <p className="text-2xl font-bold text-green-600">
                    {metrics.filter(m => m.is_active).length}
                  </p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Metric Types</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {new Set(metrics.map(m => m.evaluation_type)).size}
                  </p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading default metrics...</p>
            </div>
          </div>
        ) : error ? (
          <Card className="text-center py-12">
            <CardContent>
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading metrics</h3>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={fetchMetrics}>Retry</Button>
            </CardContent>
          </Card>
        ) : metrics.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No default metrics yet</h3>
              <p className="text-gray-600 mb-4">
                {isAdmin 
                  ? 'Create your first default metric to provide pre-configured evaluation templates for all users.'
                  : 'No default metrics have been configured yet. Please contact an administrator.'}
              </p>
              {isAdmin && (
                <Button onClick={() => setShowCreateDialog(true)} className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Metric
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map((metric) => (
              <Card key={metric.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">{metric.name}</CardTitle>
                      <Badge className={`text-xs ${getEvaluationTypeColor(metric.evaluation_type)}`}>
                        {metric.evaluation_type}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditMetric(metric)}>
                            <Edit2 className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={() => handleDeleteMetric(metric)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                    {metric.description || 'No description provided'}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Output: {getScoringOutputTypeInfo(metric.scoring_output_type).label}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Success: {getSuccessCriteriaDisplayText(metric.success_criteria)}</span>
                      <span className={`px-2 py-1 rounded-full ${metric.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {metric.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Updated {new Date(metric.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <DefaultMetricDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          metric={editingMetric}
          onSuccess={() => {
            fetchMetrics()
            setEditingMetric(null)
          }}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  )
}

// Dialog Component for Create/Edit
function DefaultMetricDialog({ 
  open, 
  onOpenChange, 
  metric, 
  onSuccess,
  isAdmin
}: { 
  open: boolean
  onOpenChange: (open: boolean) => void
  metric: DefaultMetric | null
  onSuccess: () => void
  isAdmin: boolean
}) {
  const isEdit = !!metric?.id
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    metric_type: 'llm',
    evaluation_type: 'quality',
    prompt_template: '',
    scoring_output_type: 'float',
    success_criteria: 'higher_is_better',
    is_active: true
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (metric && open) {
      setFormData({
        name: metric.name || '',
        description: metric.description || '',
        metric_type: metric.metric_type || 'llm',
        evaluation_type: metric.evaluation_type || 'quality',
        prompt_template: metric.prompt_template || '',
        scoring_output_type: metric.scoring_output_type || 'float',
        success_criteria: metric.success_criteria || 'higher_is_better',
        is_active: metric.is_active !== undefined ? metric.is_active : true
      })
    } else if (!metric && open) {
      setFormData({
        name: '',
        description: '',
        metric_type: 'llm',
        evaluation_type: 'quality',
        prompt_template: `Please evaluate the following conversation for quality.

**Conversation Transcript:**
{{transcript}}

**Evaluation Criteria:**
- Overall quality (1-10)
- Key aspects to evaluate

**Instructions:**
Provide your evaluation in JSON format:

{
  "score": <score>,
  "reasoning": "<detailed_explanation>"
}`,
        scoring_output_type: 'float',
        success_criteria: 'higher_is_better',
        is_active: true
      })
    }
  }, [metric, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isAdmin) {
      alert('Only administrators can create or edit default metrics')
      return
    }

    if (!formData.name?.trim()) {
      alert('Please enter a metric name')
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

    setSubmitting(true)

    try {
      const endpoint = isEdit ? `/api/default-metrics/${metric?.id}` : '/api/default-metrics'
      const method = isEdit ? 'PUT' : 'POST'
      
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Failed to ${isEdit ? 'update' : 'create'} metric`)
      }

      onOpenChange(false)
      onSuccess()
    } catch (err) {
      alert(`Failed to ${isEdit ? 'update' : 'create'} metric: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Default Metric' : 'Create Default Metric'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Metric Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Customer Satisfaction Check"
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
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of what this metric evaluates"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scoring_output_type">Scoring Output Type</Label>
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
              <Label htmlFor="success_criteria">Success Criteria</Label>
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
            <Label htmlFor="prompt_template">Prompt Template</Label>
            <Textarea
              id="prompt_template"
              value={formData.prompt_template}
              onChange={(e) => setFormData({ ...formData, prompt_template: e.target.value })}
              placeholder="Enter the evaluation prompt template..."
              rows={12}
              className="font-mono text-sm"
              required
            />
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <p className="font-semibold text-amber-800 mb-1">💡 Template Variables:</p>
              <ul className="text-amber-700 space-y-1 text-xs">
                <li><code className="bg-amber-100 px-1 rounded">{'{{transcript}}'}</code> - The conversation transcript (Required)</li>
                <li><code className="bg-amber-100 px-1 rounded">{'{{callId}}'}</code> - Unique call identifier</li>
              </ul>
              <p className="text-amber-700 mt-2 text-xs">
                <strong>Note:</strong> Users will add their own LLM configuration when importing this metric.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={submitting}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {submitting ? 'Saving...' : (isEdit ? 'Update Metric' : 'Create Metric')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
