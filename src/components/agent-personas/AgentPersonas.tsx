'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabaseQuery } from '@/hooks/useApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { 
  User,
  Users,
  Brain,
  Sparkles,
  Copy,
  Check,
  Edit2,
  Trash2,
  Plus,
  Save,
  X,
  ChevronRight,
  MessageSquare,
  Heart,
  Shield,
  Zap,
  RefreshCw,
  Eye,
  Settings,
  AlertCircle,
  CheckCircle,
  Info
} from 'lucide-react'

interface AgentPersonasProps {
  params: { projectid: string; agentid: string }
}

interface PersonaTemplate {
  id: string
  name: string
  description: string
  category: string
  persona_name: string
  persona_role: string
  persona_background: string
  tone: string
  communication_style: string
  behavioral_guidelines: string
  do_list: string[]
  dont_list: string[]
  empathy_level: string
  patience_level: string
  system_prompt_template: string
  is_default: boolean
  is_active: boolean
  tags: string[]
  created_at: string
}

interface AgentPersona {
  id: string
  agent_id: string
  project_id: string
  template_id: string | null
  name: string | null
  description: string | null
  persona_name: string | null
  persona_role: string | null
  persona_background: string | null
  tone: string | null
  communication_style: string | null
  behavioral_guidelines: string | null
  do_list: string[] | null
  dont_list: string[] | null
  empathy_level: string | null
  patience_level: string | null
  system_prompt: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', icon: '👔' },
  { value: 'friendly', label: 'Friendly', icon: '😊' },
  { value: 'formal', label: 'Formal', icon: '📋' },
  { value: 'casual', label: 'Casual', icon: '🎉' },
  { value: 'empathetic', label: 'Empathetic', icon: '💙' }
]

const LEVEL_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
]

const CATEGORY_COLORS: Record<string, string> = {
  customer_service: 'bg-blue-100 text-blue-700 border-blue-200',
  sales: 'bg-green-100 text-green-700 border-green-200',
  support: 'bg-purple-100 text-purple-700 border-purple-200',
  healthcare: 'bg-red-100 text-red-700 border-red-200',
  general: 'bg-gray-100 text-gray-700 border-gray-200'
}

export default function AgentPersonas({ params }: AgentPersonasProps) {
  const router = useRouter()
  const [selectedTemplate, setSelectedTemplate] = useState<PersonaTemplate | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showTemplatePreview, setShowTemplatePreview] = useState(false)
  const [activeTab, setActiveTab] = useState('templates')
  
  // Form state for creating/editing persona
  const [formData, setFormData] = useState<Partial<AgentPersona>>({
    template_id: null,
    name: '',
    description: '',
    persona_name: '',
    persona_role: '',
    persona_background: '',
    tone: 'professional',
    communication_style: '',
    behavioral_guidelines: '',
    do_list: [],
    dont_list: [],
    empathy_level: 'medium',
    patience_level: 'high',
    system_prompt: ''
  })

  // Temporary state for list items
  const [newDoItem, setNewDoItem] = useState('')
  const [newDontItem, setNewDontItem] = useState('')

  // Fetch persona templates
  const { data: templates, loading: templatesLoading, refetch: refetchTemplates } = useSupabaseQuery(
    'pype_voice_agent_persona_templates',
    {
      select: '*',
      filters: [{ column: 'is_active', operator: 'eq', value: true }],
      orderBy: { column: 'is_default', ascending: false }
    }
  )

  // Fetch current agent's persona
  const { data: agentPersonas, loading: personaLoading, refetch: refetchPersona } = useSupabaseQuery(
    'pype_voice_agent_personas',
    {
      select: '*',
      filters: [{ column: 'agent_id', operator: 'eq', value: params.agentid }],
      limit: 1
    }
  )

  // Fetch agent details
  const { data: agentData, loading: agentLoading } = useSupabaseQuery(
    'pype_voice_agents',
    {
      select: 'id, name, agent_type, configuration',
      filters: [{ column: 'id', operator: 'eq', value: params.agentid }],
      limit: 1
    }
  )

  const currentPersona = agentPersonas?.[0] as AgentPersona | undefined
  const agent = agentData?.[0]

  // Get the effective persona (merged template + overrides)
  const effectivePersona = useMemo(() => {
    if (!currentPersona) return null
    
    const template = templates?.find((t: PersonaTemplate) => t.id === currentPersona.template_id)
    
    return {
      ...template,
      ...Object.fromEntries(
        Object.entries(currentPersona).filter(([_, v]) => v !== null)
      )
    }
  }, [currentPersona, templates])

  // Load form data when editing
  useEffect(() => {
    if (currentPersona && isEditMode) {
      setFormData({
        template_id: currentPersona.template_id,
        name: currentPersona.name || '',
        description: currentPersona.description || '',
        persona_name: currentPersona.persona_name || '',
        persona_role: currentPersona.persona_role || '',
        persona_background: currentPersona.persona_background || '',
        tone: currentPersona.tone || 'professional',
        communication_style: currentPersona.communication_style || '',
        behavioral_guidelines: currentPersona.behavioral_guidelines || '',
        do_list: currentPersona.do_list || [],
        dont_list: currentPersona.dont_list || [],
        empathy_level: currentPersona.empathy_level || 'medium',
        patience_level: currentPersona.patience_level || 'high',
        system_prompt: currentPersona.system_prompt || ''
      })
    }
  }, [currentPersona, isEditMode])

  // Handle template selection
  const handleTemplateSelect = (template: PersonaTemplate) => {
    setSelectedTemplate(template)
    setFormData({
      template_id: template.id,
      name: template.name,
      description: template.description,
      persona_name: template.persona_name,
      persona_role: template.persona_role,
      persona_background: template.persona_background,
      tone: template.tone,
      communication_style: template.communication_style,
      behavioral_guidelines: template.behavioral_guidelines,
      do_list: template.do_list || [],
      dont_list: template.dont_list || [],
      empathy_level: template.empathy_level,
      patience_level: template.patience_level,
      system_prompt: template.system_prompt_template
    })
    setIsCreateDialogOpen(true)
  }

  // Handle creating a new persona from scratch
  const handleCreateFromScratch = () => {
    setSelectedTemplate(null)
    setFormData({
      template_id: null,
      name: '',
      description: '',
      persona_name: '',
      persona_role: '',
      persona_background: '',
      tone: 'professional',
      communication_style: '',
      behavioral_guidelines: '',
      do_list: [],
      dont_list: [],
      empathy_level: 'medium',
      patience_level: 'high',
      system_prompt: ''
    })
    setIsCreateDialogOpen(true)
  }

  // Handle adding do/dont items
  const handleAddDoItem = () => {
    if (newDoItem.trim()) {
      setFormData(prev => ({
        ...prev,
        do_list: [...(prev.do_list || []), newDoItem.trim()]
      }))
      setNewDoItem('')
    }
  }

  const handleAddDontItem = () => {
    if (newDontItem.trim()) {
      setFormData(prev => ({
        ...prev,
        dont_list: [...(prev.dont_list || []), newDontItem.trim()]
      }))
      setNewDontItem('')
    }
  }

  const handleRemoveDoItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      do_list: (prev.do_list || []).filter((_, i) => i !== index)
    }))
  }

  const handleRemoveDontItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      dont_list: (prev.dont_list || []).filter((_, i) => i !== index)
    }))
  }

  // Save persona
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload = {
        agent_id: params.agentid,
        project_id: params.projectid,
        template_id: formData.template_id,
        name: formData.name || null,
        description: formData.description || null,
        persona_name: formData.persona_name || null,
        persona_role: formData.persona_role || null,
        persona_background: formData.persona_background || null,
        tone: formData.tone || null,
        communication_style: formData.communication_style || null,
        behavioral_guidelines: formData.behavioral_guidelines || null,
        do_list: formData.do_list?.length ? formData.do_list : null,
        dont_list: formData.dont_list?.length ? formData.dont_list : null,
        empathy_level: formData.empathy_level || null,
        patience_level: formData.patience_level || null,
        system_prompt: formData.system_prompt || null,
        is_active: true
      }

      const method = currentPersona ? 'PATCH' : 'POST'
      const url = currentPersona 
        ? `/api/agent-personas?id=${currentPersona.id}`
        : '/api/agent-personas'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save persona')
      }

      await refetchPersona()
      setIsCreateDialogOpen(false)
      setIsEditMode(false)
    } catch (error) {
      console.error('Error saving persona:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Delete persona
  const handleDelete = async () => {
    if (!currentPersona) return
    
    try {
      const response = await fetch(
        `/api/agent-personas?id=${currentPersona.id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete persona')
      }

      await refetchPersona()
    } catch (error) {
      console.error('Error deleting persona:', error)
    }
  }

  const isLoading = templatesLoading || personaLoading || agentLoading

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <User className="w-8 h-8 text-blue-600" />
              Agent Personas
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Configure the personality, tone, and behavior of your voice agent
              {agent && <span className="font-medium"> - {agent.name}</span>}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push(`/${params.projectid}/agents/${params.agentid}/developer-settings`)}
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Developer Settings
          </Button>
        </div>

        {/* Current Persona Card */}
        {currentPersona ? (
          <Card className="mb-8 border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                    <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {effectivePersona?.persona_name || effectivePersona?.name || 'Agent Persona'}
                    </CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {effectivePersona?.persona_role || 'Custom Configuration'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={handleDelete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Personality Overview */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    Personality
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Tone</span>
                      <Badge variant="secondary" className="capitalize">
                        {effectivePersona?.tone || 'Professional'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Empathy Level</span>
                      <Badge variant="secondary" className="capitalize">
                        {effectivePersona?.empathy_level || 'Medium'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Patience Level</span>
                      <Badge variant="secondary" className="capitalize">
                        {effectivePersona?.patience_level || 'High'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Inherited From */}
                {currentPersona.template_id && (
                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Copy className="w-4 h-4 text-blue-500" />
                      Inherited From
                    </h3>
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border">
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {templates?.find((t: PersonaTemplate) => t.id === currentPersona.template_id)?.name}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Base template with customizations applied
                      </p>
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-500" />
                    Guidelines
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>{effectivePersona?.do_list?.length || 0} Do's configured</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <X className="w-4 h-4 text-red-500" />
                      <span>{effectivePersona?.dont_list?.length || 0} Don'ts configured</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* System Prompt Preview */}
              {effectivePersona?.system_prompt && (
                <div className="mt-6 pt-6 border-t">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-purple-500" />
                    System Prompt Preview
                  </h3>
                  <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm font-mono text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                    {effectivePersona.system_prompt}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* No Persona Configured */
          <Card className="mb-8 border-2 border-dashed border-gray-300 dark:border-gray-700">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <User className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Persona Configured
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                Configure a persona to define how your agent should behave, communicate, and interact with users.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={handleCreateFromScratch} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Create from Scratch
                </Button>
                <Button onClick={() => setActiveTab('templates')}>
                  <Copy className="w-4 h-4 mr-2" />
                  Use Template
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Templates Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Predefined Persona Templates
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Choose from our library of pre-built personas or use them as a starting point for customization.
          </p>

          {templatesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-6 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates?.map((template: PersonaTemplate) => (
                <Card 
                  key={template.id}
                  className={`cursor-pointer transition-all hover:shadow-lg hover:border-blue-300 ${
                    currentPersona?.template_id === template.id ? 'border-2 border-blue-500' : ''
                  }`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-800 dark:to-purple-800 flex items-center justify-center">
                          <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {template.name}
                          </h3>
                          <p className="text-xs text-gray-500">{template.persona_name}</p>
                        </div>
                      </div>
                      {template.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Default
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                      {template.description}
                    </p>

                    <div className="flex items-center gap-2 mb-4">
                      <Badge 
                        variant="outline" 
                        className={CATEGORY_COLORS[template.category] || CATEGORY_COLORS.general}
                      >
                        {template.category.replace('_', ' ')}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {template.tone}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" />
                          {template.empathy_level}
                        </span>
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          {template.patience_level}
                        </span>
                      </div>
                      <Button size="sm" variant="ghost">
                        Use <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Create Custom Card */}
              <Card 
                className="cursor-pointer transition-all hover:shadow-lg border-dashed border-2 hover:border-blue-300"
                onClick={handleCreateFromScratch}
              >
                <CardContent className="p-6 flex flex-col items-center justify-center min-h-[200px] text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                    <Plus className="w-6 h-6 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Create Custom Persona
                  </h3>
                  <p className="text-sm text-gray-500">
                    Build a persona from scratch
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateDialogOpen || isEditMode} onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false)
            setIsEditMode(false)
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                {currentPersona && isEditMode ? 'Edit Agent Persona' : 'Configure Agent Persona'}
              </DialogTitle>
              <DialogDescription>
                {selectedTemplate 
                  ? `Customizing "${selectedTemplate.name}" template`
                  : 'Create a custom persona for your agent'}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="basic" className="mt-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="communication">Communication</TabsTrigger>
                <TabsTrigger value="behavior">Behavior</TabsTrigger>
                <TabsTrigger value="prompt">System Prompt</TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="persona_name">Persona Name</Label>
                    <Input
                      id="persona_name"
                      placeholder="e.g., Alex, Sarah, Morgan"
                      value={formData.persona_name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, persona_name: e.target.value }))}
                    />
                    <p className="text-xs text-gray-500">The name your AI agent will identify as</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="persona_role">Role</Label>
                    <Input
                      id="persona_role"
                      placeholder="e.g., Customer Service Representative"
                      value={formData.persona_role || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, persona_role: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Configuration Name</Label>
                  <Input
                    id="name"
                    placeholder="Internal name for this configuration"
                    value={formData.name || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this persona..."
                    value={formData.description || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="persona_background">Background Story</Label>
                  <Textarea
                    id="persona_background"
                    placeholder="Background context for the persona..."
                    value={formData.persona_background || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, persona_background: e.target.value }))}
                    rows={3}
                  />
                  <p className="text-xs text-gray-500">Helps the AI understand its character and context</p>
                </div>
              </TabsContent>

              {/* Communication Tab */}
              <TabsContent value="communication" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select 
                      value={formData.tone || 'professional'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, tone: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TONE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.icon} {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Empathy Level</Label>
                    <Select 
                      value={formData.empathy_level || 'medium'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, empathy_level: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Patience Level</Label>
                    <Select 
                      value={formData.patience_level || 'high'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, patience_level: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEVEL_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="communication_style">Communication Style Guidelines</Label>
                  <Textarea
                    id="communication_style"
                    placeholder="Describe how the agent should communicate..."
                    value={formData.communication_style || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, communication_style: e.target.value }))}
                    rows={4}
                  />
                </div>
              </TabsContent>

              {/* Behavior Tab */}
              <TabsContent value="behavior" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="behavioral_guidelines">Behavioral Guidelines</Label>
                  <Textarea
                    id="behavioral_guidelines"
                    placeholder="General guidelines for agent behavior..."
                    value={formData.behavioral_guidelines || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, behavioral_guidelines: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  {/* Do's List */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      Things to Do
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a guideline..."
                        value={newDoItem}
                        onChange={(e) => setNewDoItem(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddDoItem()}
                      />
                      <Button size="sm" onClick={handleAddDoItem}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {formData.do_list?.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-sm flex-1">{item}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRemoveDoItem(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Don'ts List */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-red-600">
                      <X className="w-4 h-4" />
                      Things NOT to Do
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a restriction..."
                        value={newDontItem}
                        onChange={(e) => setNewDontItem(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddDontItem()}
                      />
                      <Button size="sm" onClick={handleAddDontItem}>
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {formData.dont_list?.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                          <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-sm flex-1">{item}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => handleRemoveDontItem(index)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* System Prompt Tab */}
              <TabsContent value="prompt" className="space-y-4 mt-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-start gap-2">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    The system prompt is the core instruction that defines your agent's behavior. 
                    It will be sent to the LLM with every conversation.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="system_prompt">System Prompt</Label>
                  <Textarea
                    id="system_prompt"
                    placeholder="You are [persona_name], a [persona_role]..."
                    value={formData.system_prompt || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Generate system prompt from other fields
                      const prompt = `You are ${formData.persona_name || '[Name]'}, a ${formData.persona_role || '[Role]'}.

${formData.persona_background ? `Background: ${formData.persona_background}\n` : ''}
${formData.communication_style ? `Communication Style: ${formData.communication_style}\n` : ''}
${formData.behavioral_guidelines ? `Guidelines: ${formData.behavioral_guidelines}\n` : ''}
${formData.do_list?.length ? `\nAlways:\n${formData.do_list.map(d => `- ${d}`).join('\n')}\n` : ''}
${formData.dont_list?.length ? `\nNever:\n${formData.dont_list.map(d => `- ${d}`).join('\n')}\n` : ''}
Maintain a ${formData.tone || 'professional'} tone with ${formData.empathy_level || 'medium'} empathy and ${formData.patience_level || 'high'} patience.`
                      setFormData(prev => ({ ...prev, system_prompt: prompt.trim() }))
                    }}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Generate from Fields
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false)
                  setIsEditMode(false)
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Persona
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
