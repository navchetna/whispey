'use client'

import React, { useState, useEffect } from 'react'
import { useLocalUser } from '@/lib/local-auth'
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
import { 
  User,
  Users,
  Brain,
  Sparkles,
  Edit2,
  Trash2,
  Plus,
  Save,
  X,
  ChevronRight,
  Heart,
  Shield,
  RefreshCw,
  Eye,
  Settings,
  AlertCircle,
  CheckCircle,
  Info,
  Lock
} from 'lucide-react'

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

const CATEGORY_OPTIONS = [
  { value: 'customer_service', label: 'Customer Service' },
  { value: 'sales', label: 'Sales' },
  { value: 'support', label: 'Technical Support' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'general', label: 'General' }
]

const CATEGORY_COLORS: Record<string, string> = {
  customer_service: 'bg-blue-100 text-blue-700 border-blue-200',
  sales: 'bg-green-100 text-green-700 border-green-200',
  support: 'bg-purple-100 text-purple-700 border-purple-200',
  healthcare: 'bg-red-100 text-red-700 border-red-200',
  general: 'bg-gray-100 text-gray-700 border-gray-200'
}

export default function AdminPersonaTemplatesPage() {
  const { user, isLoaded } = useLocalUser()
  const isAdmin = user?.isAdmin || false

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PersonaTemplate | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState<Partial<PersonaTemplate>>({
    name: '',
    description: '',
    category: 'general',
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
    system_prompt_template: '',
    is_default: false,
    is_active: true,
    tags: []
  })

  // Temporary state for list items
  const [newDoItem, setNewDoItem] = useState('')
  const [newDontItem, setNewDontItem] = useState('')

  // Fetch persona templates
  const { data: templates, loading: templatesLoading, refetch: refetchTemplates } = useSupabaseQuery(
    'pype_voice_agent_persona_templates',
    {
      select: '*',
      orderBy: { column: 'created_at', ascending: false }
    }
  )

  // Reset form when dialog opens/closes
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: 'general',
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
      system_prompt_template: '',
      is_default: false,
      is_active: true,
      tags: []
    })
    setNewDoItem('')
    setNewDontItem('')
  }

  // Load template data when editing
  useEffect(() => {
    if (editingTemplate) {
      setFormData({
        name: editingTemplate.name,
        description: editingTemplate.description,
        category: editingTemplate.category,
        persona_name: editingTemplate.persona_name,
        persona_role: editingTemplate.persona_role,
        persona_background: editingTemplate.persona_background,
        tone: editingTemplate.tone,
        communication_style: editingTemplate.communication_style,
        behavioral_guidelines: editingTemplate.behavioral_guidelines,
        do_list: editingTemplate.do_list || [],
        dont_list: editingTemplate.dont_list || [],
        empathy_level: editingTemplate.empathy_level,
        patience_level: editingTemplate.patience_level,
        system_prompt_template: editingTemplate.system_prompt_template,
        is_default: editingTemplate.is_default,
        is_active: editingTemplate.is_active,
        tags: editingTemplate.tags || []
      })
    }
  }, [editingTemplate])

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

  // Save template
  const handleSave = async () => {
    if (!isAdmin) {
      alert('Only administrators can create or edit persona templates')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        category: formData.category,
        persona_name: formData.persona_name,
        persona_role: formData.persona_role,
        persona_background: formData.persona_background,
        tone: formData.tone,
        communication_style: formData.communication_style,
        behavioral_guidelines: formData.behavioral_guidelines,
        do_list: formData.do_list,
        dont_list: formData.dont_list,
        empathy_level: formData.empathy_level,
        patience_level: formData.patience_level,
        system_prompt_template: formData.system_prompt_template,
        is_default: formData.is_default,
        is_active: formData.is_active,
        tags: formData.tags
      }

      const method = editingTemplate ? 'PATCH' : 'POST'
      const url = editingTemplate 
        ? `/api/persona-templates?id=${editingTemplate.id}`
        : '/api/persona-templates'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save template')
      }

      await refetchTemplates()
      setIsCreateDialogOpen(false)
      setEditingTemplate(null)
      resetForm()
    } catch (error) {
      console.error('Error saving template:', error)
      alert(error instanceof Error ? error.message : 'Failed to save template')
    } finally {
      setIsSaving(false)
    }
  }

  // Delete template
  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      alert('Only administrators can delete persona templates')
      return
    }

    try {
      const response = await fetch(
        `/api/persona-templates?id=${id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete template')
      }

      await refetchTemplates()
      setDeleteConfirmId(null)
    } catch (error) {
      console.error('Error deleting template:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete template')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              Agent Persona Templates
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage predefined persona templates that can be inherited by agents
            </p>
          </div>
          
          {isAdmin && (
            <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true) }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Template
            </Button>
          )}
        </div>

        {/* Admin Notice */}
        {!isAdmin && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-yellow-600" />
                <p className="text-yellow-800 dark:text-yellow-200">
                  <strong>View Only:</strong> Only administrators can create, edit, or delete persona templates.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Templates Grid */}
        {templatesLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
            <p className="ml-3 text-gray-600">Loading templates...</p>
          </div>
        ) : !templates || templates.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No persona templates yet</h3>
              <p className="text-gray-600 mb-4">
                {isAdmin 
                  ? 'Create your first persona template to get started.'
                  : 'No persona templates have been configured yet. Please contact an administrator.'}
              </p>
              {isAdmin && (
                <Button onClick={() => { resetForm(); setIsCreateDialogOpen(true) }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template: PersonaTemplate) => (
              <Card 
                key={template.id}
                className={`transition-all hover:shadow-lg ${!template.is_active ? 'opacity-60' : ''}`}
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
                    <div className="flex items-center gap-1">
                      {template.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Default
                        </Badge>
                      )}
                      {!template.is_active && (
                        <Badge variant="outline" className="text-xs text-gray-500">
                          Inactive
                        </Badge>
                      )}
                    </div>
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
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => { setEditingTemplate(template); setIsCreateDialogOpen(true) }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteConfirmId(template.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false)
            setEditingTemplate(null)
            resetForm()
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                {editingTemplate ? 'Edit Persona Template' : 'Create Persona Template'}
              </DialogTitle>
              <DialogDescription>
                {editingTemplate 
                  ? 'Update the persona template configuration'
                  : 'Create a new persona template that can be used by agents'}
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
                    <Label htmlFor="name">Template Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Professional Customer Service Agent"
                      value={formData.name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select 
                      value={formData.category || 'general'}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="persona_name">Persona Name</Label>
                    <Input
                      id="persona_name"
                      placeholder="e.g., Alex, Sarah, Morgan"
                      value={formData.persona_name || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, persona_name: e.target.value }))}
                    />
                    <p className="text-xs text-gray-500">The name the AI will identify as</p>
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
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of this persona template..."
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
                </div>

                <div className="flex items-center gap-6 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_default"
                      checked={formData.is_default || false}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_default: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="is_default" className="cursor-pointer">Mark as Default Template</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active !== false}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="is_active" className="cursor-pointer">Active</Label>
                  </div>
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
                    The system prompt template will be used when agents inherit from this template. 
                    Users can customize it for their specific needs.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="system_prompt_template">System Prompt Template</Label>
                  <Textarea
                    id="system_prompt_template"
                    placeholder="You are [persona_name], a [persona_role]..."
                    value={formData.system_prompt_template || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, system_prompt_template: e.target.value }))}
                    rows={12}
                    className="font-mono text-sm"
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const prompt = `You are ${formData.persona_name || '[Name]'}, a ${formData.persona_role || '[Role]'}.

${formData.persona_background ? `Background: ${formData.persona_background}\n` : ''}
${formData.communication_style ? `Communication Style: ${formData.communication_style}\n` : ''}
${formData.behavioral_guidelines ? `Guidelines: ${formData.behavioral_guidelines}\n` : ''}
${formData.do_list?.length ? `\nAlways:\n${formData.do_list.map(d => `- ${d}`).join('\n')}\n` : ''}
${formData.dont_list?.length ? `\nNever:\n${formData.dont_list.map(d => `- ${d}`).join('\n')}\n` : ''}
Maintain a ${formData.tone || 'professional'} tone with ${formData.empathy_level || 'medium'} empathy and ${formData.patience_level || 'high'} patience.`
                    setFormData(prev => ({ ...prev, system_prompt_template: prompt.trim() }))
                  }}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate from Fields
                </Button>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateDialogOpen(false)
                  setEditingTemplate(null)
                  resetForm()
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving || !formData.name}>
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                Delete Persona Template
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this persona template? This action cannot be undone.
                Agents using this template will retain their configurations but will no longer be linked to the template.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
