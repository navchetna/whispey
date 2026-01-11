'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Info, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface MetricEditPageProps {
  params: { projectid: string; agentid: string; metricid: string }
}

interface MetricData {
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
}

// Default prompt sections
const DEFAULT_CONTEXT = `Please evaluate the following customer service conversation for overall quality.`

const DEFAULT_TRANSCRIPT_PLACEHOLDER = `**Conversation Transcript:**
{{transcript}}`

const DEFAULT_EVALUATION_CRITERIA = `- Overall conversation quality (1-10)
- Agent professionalism and helpfulness
- Problem resolution effectiveness
- Communication clarity`

const DEFAULT_DECISION_LOGIC = `Analyze the conversation based on the evaluation criteria above.
Consider the following when scoring:
- How well did the agent handle the customer's concerns?
- Was the communication professional and clear?
- Was the issue resolved effectively?`

const DEFAULT_OUTPUT_FORMAT = `{
  "score": <overall_score_from_1_to_10>,
  "reasoning": "<detailed_explanation_of_your_evaluation>"
}

Provide only the JSON response, nothing else.`

// Helper function to parse existing prompt into sections
function parsePromptIntoSections(template: string): { context: string; criteria: string; decisionLogic: string; outputFormat: string } {
  // Default values
  let context = DEFAULT_CONTEXT
  let criteria = DEFAULT_EVALUATION_CRITERIA
  let decisionLogic = DEFAULT_DECISION_LOGIC
  let outputFormat = DEFAULT_OUTPUT_FORMAT

  if (!template) {
    return { context, criteria, decisionLogic, outputFormat }
  }

  // Split by known section headers
  const transcriptMatch = template.match(/\*\*Conversation Transcript:\*\*[\s\S]*?\{\{transcript\}\}/i)
  const criteriaMatch = template.match(/\*\*Evaluation Criteria:\*\*([\s\S]*?)(?=\*\*Instructions:\*\*|\*\*Decision Logic:\*\*|$)/i)
  const instructionsMatch = template.match(/\*\*Instructions:\*\*([\s\S]*?)(?=\{[\s\S]*?"score"|$)/i)
  const outputMatch = template.match(/(\{[\s\S]*?"score"[\s\S]*?\}[\s\S]*$)/i)

  // Extract context (everything before transcript or evaluation criteria)
  let contextEnd = template.length
  if (transcriptMatch && transcriptMatch.index !== undefined) {
    contextEnd = transcriptMatch.index
  } else if (criteriaMatch && criteriaMatch.index !== undefined) {
    contextEnd = criteriaMatch.index
  }
  const extractedContext = template.substring(0, contextEnd).trim()
  if (extractedContext) {
    context = extractedContext
  }

  // Extract evaluation criteria
  if (criteriaMatch && criteriaMatch[1]) {
    criteria = criteriaMatch[1].trim()
  }

  // Extract decision logic / instructions
  if (instructionsMatch && instructionsMatch[1]) {
    decisionLogic = instructionsMatch[1].trim()
  }

  // Extract output format (JSON block and any following text)
  if (outputMatch && outputMatch[1]) {
    outputFormat = outputMatch[1].trim()
  }

  return { context, criteria, decisionLogic, outputFormat }
}

// Helper function to combine sections into a full prompt
function combineSectionsIntoPrompt(context: string, criteria: string, decisionLogic: string, outputFormat: string): string {
  return `${context}

${DEFAULT_TRANSCRIPT_PLACEHOLDER}

**Evaluation Criteria:**
${criteria}

**Instructions:**
${decisionLogic}

${outputFormat}`
}

export default function MetricEditPage({ params }: MetricEditPageProps) {
  const router = useRouter()
  const { projectid, agentid, metricid } = params
  const isNewMetric = metricid === 'new'

  const [loading, setLoading] = useState(!isNewMetric)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('context')

  // Basic metric info
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [evaluationType, setEvaluationType] = useState('quality')
  
  // LLM settings
  const [llmProvider, setLlmProvider] = useState('openai')
  const [model, setModel] = useState('gpt-4o-mini')
  const [apiUrl, setApiUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [temperature, setTemperature] = useState(0)
  const [maxTokens, setMaxTokens] = useState(1000)
  
  // Scoring settings
  const [scoringOutputType, setScoringOutputType] = useState('float')
  const [successCriteria, setSuccessCriteria] = useState('higher_is_better')

  // Prompt sections
  const [contextSection, setContextSection] = useState(DEFAULT_CONTEXT)
  const [criteriaSection, setCriteriaSection] = useState(DEFAULT_EVALUATION_CRITERIA)
  const [decisionLogicSection, setDecisionLogicSection] = useState(DEFAULT_DECISION_LOGIC)
  const [outputFormatSection, setOutputFormatSection] = useState(DEFAULT_OUTPUT_FORMAT)

  // Fetch metric data if editing
  useEffect(() => {
    if (!isNewMetric) {
      fetchMetric()
    }
  }, [metricid, isNewMetric])

  const fetchMetric = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/evaluations/prompts/${metricid}`)
      if (!response.ok) throw new Error('Failed to fetch metric')
      
      const result = await response.json()
      const data = result.data || result
      
      // Set basic info
      setName(data.name || '')
      setDescription(data.description || '')
      setEvaluationType(data.evaluation_type || 'quality')
      
      // Set LLM settings
      setLlmProvider(data.llm_provider || 'openai')
      setModel(data.model || 'gpt-4o-mini')
      setApiUrl(data.api_url || 'https://api.openai.com/v1')
      setApiKey(data.api_key || '')
      setTemperature(data.temperature || 0)
      setMaxTokens(data.max_tokens || 1000)
      
      // Set scoring settings
      setScoringOutputType(data.scoring_output_type || 'float')
      setSuccessCriteria(data.success_criteria || 'higher_is_better')
      
      // Parse prompt into sections
      const sections = parsePromptIntoSections(data.prompt_template || '')
      setContextSection(sections.context)
      setCriteriaSection(sections.criteria)
      setDecisionLogicSection(sections.decisionLogic)
      setOutputFormatSection(sections.outputFormat)
    } catch (error) {
      console.error('Error fetching metric:', error)
      alert('Failed to load metric')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Please enter a metric name')
      return
    }

    try {
      setSaving(true)
      
      // Combine sections into full prompt
      const fullPrompt = combineSectionsIntoPrompt(
        contextSection,
        criteriaSection,
        decisionLogicSection,
        outputFormatSection
      )

      const payload = {
        project_id: projectid,
        agent_id: agentid,
        name,
        description,
        evaluation_type: evaluationType,
        prompt_template: fullPrompt,
        llm_provider: llmProvider,
        model,
        api_url: apiUrl,
        api_key: apiKey,
        scoring_output_type: scoringOutputType,
        success_criteria: successCriteria,
        temperature,
        max_tokens: maxTokens
      }

      const url = isNewMetric ? '/api/evaluations/prompts' : `/api/evaluations/prompts/${metricid}`
      const method = isNewMetric ? 'POST' : 'PUT'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to save metric')
      }

      router.push(`/${projectid}/agents/${agentid}/evals-metrics`)
    } catch (error: any) {
      console.error('Error saving metric:', error)
      alert(error.message || 'Failed to save metric')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/${projectid}/agents/${agentid}/evals-metrics`)}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Metrics
              </Button>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {isNewMetric ? 'Create New Metric' : 'Edit Metric'}
              </h1>
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Metric'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Basic Info & Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  Basic Information
                </CardTitle>
                <CardDescription>Name and describe your metric</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Metric Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Quality Score"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what this metric evaluates..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="evaluationType">Evaluation Type</Label>
                  <Select value={evaluationType} onValueChange={setEvaluationType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quality">Quality</SelectItem>
                      <SelectItem value="accuracy">Accuracy</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Scoring Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Scoring Settings</CardTitle>
                <CardDescription>Define how results are interpreted</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="scoringType">Output Type</Label>
                  <Select value={scoringOutputType} onValueChange={setScoringOutputType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="float">Numeric (Float)</SelectItem>
                      <SelectItem value="int">Numeric (Integer)</SelectItem>
                      <SelectItem value="bool">Boolean</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="successCriteria">Success Criteria</Label>
                  <Select value={successCriteria} onValueChange={setSuccessCriteria}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scoringOutputType === 'bool' ? (
                        <>
                          <SelectItem value="true">True is Success</SelectItem>
                          <SelectItem value="false">False is Success</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="higher_is_better">Higher is Better</SelectItem>
                          <SelectItem value="lower_is_better">Lower is Better</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* LLM Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  LLM Settings
                </CardTitle>
                <CardDescription>Configure the model for evaluation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="llmProvider">Provider</Label>
                  <Select value={llmProvider} onValueChange={setLlmProvider}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    placeholder="gpt-4o-mini"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiUrl">API URL</Label>
                  <Input
                    id="apiUrl"
                    placeholder="https://api.openai.com/v1"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="temperature">Temperature</Label>
                    <Input
                      id="temperature"
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxTokens">Max Tokens</Label>
                    <Input
                      id="maxTokens"
                      type="number"
                      min={100}
                      max={4000}
                      value={maxTokens}
                      onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Prompt Editor with Sections */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg">Prompt Builder</CardTitle>
                <CardDescription>
                  Build your evaluation prompt in sections. The transcript will be automatically inserted between Context and Evaluation Criteria.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="context">Context</TabsTrigger>
                    <TabsTrigger value="criteria">Evaluation Criteria</TabsTrigger>
                    <TabsTrigger value="decision">Decision Logic</TabsTrigger>
                    <TabsTrigger value="output">Output Format</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="context" className="mt-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          The <strong>Context</strong> section sets up the evaluation task. It tells the LLM what kind of evaluation to perform and provides any necessary background information.
                        </p>
                      </div>
                      <Textarea
                        placeholder="Enter the context for your evaluation..."
                        value={contextSection}
                        onChange={(e) => setContextSection(e.target.value)}
                        rows={12}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="criteria" className="mt-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <Info className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-green-700 dark:text-green-300">
                          The <strong>Evaluation Criteria</strong> section defines what specific aspects should be evaluated. List the criteria as bullet points or numbered items.
                        </p>
                      </div>
                      <Textarea
                        placeholder="List your evaluation criteria..."
                        value={criteriaSection}
                        onChange={(e) => setCriteriaSection(e.target.value)}
                        rows={12}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="decision" className="mt-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <Info className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          The <strong>Decision Logic</strong> section provides instructions on how to analyze and score the conversation. Include any specific considerations or weighting.
                        </p>
                      </div>
                      <Textarea
                        placeholder="Describe how to analyze and make decisions..."
                        value={decisionLogicSection}
                        onChange={(e) => setDecisionLogicSection(e.target.value)}
                        rows={12}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="output" className="mt-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                        <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          The <strong>Output Format</strong> section defines the expected response structure. Use JSON format with "score" and "reasoning" fields for proper parsing.
                        </p>
                      </div>
                      <Textarea
                        placeholder="Define the output format (JSON recommended)..."
                        value={outputFormatSection}
                        onChange={(e) => setOutputFormatSection(e.target.value)}
                        rows={12}
                        className="font-mono text-sm"
                      />
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Preview Section */}
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900 dark:text-white">Full Prompt Preview</h3>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                      {combineSectionsIntoPrompt(contextSection, criteriaSection, decisionLogicSection, outputFormatSection)}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
