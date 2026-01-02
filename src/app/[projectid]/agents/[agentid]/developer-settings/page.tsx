'use client'

import React, { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useApiQuery } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { 
  SettingsIcon, 
  Mic, 
  Volume2,
  Loader2,
  MessageSquare,
  User,
  Brain,
  HelpCircle,
  Rocket,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import ModelSelector from '@/components/agents/AgentConfig/ModelSelector'
import SelectTTS from '@/components/agents/AgentConfig/SelectTTSDialog'
import SelectSTT from '@/components/agents/AgentConfig/SelectSTTDialog'
import { useLocalUser } from '@/lib/local-auth'

interface AzureConfig {
  endpoint: string
  apiVersion: string
}

interface DeveloperSettings {
  id: string
  // LLM Configuration
  llm_provider: string
  llm_model: string
  llm_temperature: number
  llm_base_url: string | null
  llm_api_key: string | null
  // STT Configuration
  stt_provider: string
  stt_model: string
  stt_language: string
  stt_base_url: string | null
  stt_api_key: string | null
  stt_config: Record<string, unknown>
  // TTS Configuration
  tts_provider: string
  tts_model: string | null
  tts_voice: string | null
  tts_base_url: string | null
  tts_api_key: string | null
  tts_voice_config: Record<string, unknown>
  // VAD Settings
  vad_provider: string
  vad_min_silence_duration: number
  // Interruption Settings
  allow_interruptions: boolean
  min_interruption_duration: number
  // Filler Words
  enable_filler_words: boolean
  general_fillers: string[]
  // Deployment
  deployment_agent_name: string | null
  deployment_agent_description: string | null
  deployment_language: string
  // Session Behavior
  preemptive_generation: string
  turn_detection: string
  // Azure Config
  azure_config: AzureConfig
  // Metadata
  created_at: string
  updated_at: string
}

export default function DeveloperSettingsPage({ params }: { params: Promise<{ projectid: string; agentid: string }> }) {
  const resolvedParams = use(params)
  const { projectid, agentid } = resolvedParams
  const router = useRouter()
  const { user } = useLocalUser()
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  
  // Form state
  const [settings, setSettings] = useState<Partial<DeveloperSettings>>({
    llm_provider: 'openai',
    llm_model: 'gpt-4o',
    llm_temperature: 0.7,
    llm_base_url: '',
    llm_api_key: '',
    stt_provider: 'deepgram',
    stt_model: 'nova-2',
    stt_language: 'en',
    stt_base_url: '',
    stt_api_key: '',
    stt_config: {},
    tts_provider: 'elevenlabs',
    tts_model: null,
    tts_voice: null,
    tts_base_url: '',
    tts_api_key: '',
    tts_voice_config: {},
    vad_provider: 'webrtc',
    vad_min_silence_duration: 1000,
    allow_interruptions: false,
    min_interruption_duration: 500,
    enable_filler_words: false,
    general_fillers: ['um', 'uh', 'like', 'you know'],
    deployment_agent_name: '',
    deployment_agent_description: '',
    deployment_language: 'english',
    preemptive_generation: 'enabled',
    turn_detection: 'multilingual',
    azure_config: { endpoint: '', apiVersion: '' }
  })

  // Fetch global developer settings
  const { data: developerSettings, loading: isLoading, refetch } = useApiQuery<DeveloperSettings>(
    'pype_voice_developer_settings',
    {
      select: '*',
      limit: 1
    }
  )

  // Load settings when data is fetched
  useEffect(() => {
    if (developerSettings && developerSettings.length > 0) {
      const data = developerSettings[0]
      setSettings({
        ...data,
        llm_base_url: data.llm_base_url || '',
        llm_api_key: data.llm_api_key || '',
        stt_base_url: data.stt_base_url || '',
        stt_api_key: data.stt_api_key || '',
        tts_base_url: data.tts_base_url || '',
        tts_api_key: data.tts_api_key || '',
        deployment_agent_name: data.deployment_agent_name || '',
        deployment_agent_description: data.deployment_agent_description || '',
        azure_config: data.azure_config || { endpoint: '', apiVersion: '' }
      })
    }
  }, [developerSettings])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    
    try {
      const settingsId = (developerSettings && developerSettings.length > 0) 
        ? developerSettings[0].id 
        : '00000000-0000-0000-0000-000000000001'
      
      const response = await fetch('/api/developer-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: settingsId,
          llm_provider: settings.llm_provider,
          llm_model: settings.llm_model,
          llm_temperature: settings.llm_temperature,
          llm_base_url: settings.llm_base_url || null,
          llm_api_key: settings.llm_api_key || null,
          stt_provider: settings.stt_provider,
          stt_model: settings.stt_model,
          stt_language: settings.stt_language,
          stt_base_url: settings.stt_base_url || null,
          stt_api_key: settings.stt_api_key || null,
          stt_config: settings.stt_config || {},
          tts_provider: settings.tts_provider,
          tts_model: settings.tts_model || null,
          tts_voice: settings.tts_voice || null,
          tts_base_url: settings.tts_base_url || null,
          tts_api_key: settings.tts_api_key || null,
          tts_voice_config: settings.tts_voice_config || {},
          vad_provider: settings.vad_provider,
          vad_min_silence_duration: settings.vad_min_silence_duration,
          allow_interruptions: settings.allow_interruptions,
          min_interruption_duration: settings.min_interruption_duration,
          enable_filler_words: settings.enable_filler_words,
          general_fillers: settings.general_fillers,
          deployment_agent_name: settings.deployment_agent_name || null,
          deployment_agent_description: settings.deployment_agent_description || null,
          deployment_language: settings.deployment_language,
          preemptive_generation: settings.preemptive_generation,
          turn_detection: settings.turn_detection,
          azure_config: settings.azure_config || {},
          updated_by: user?.id || null
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save settings')
      }
      
      setSaveSuccess(true)
      refetch()
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save developer settings:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  // Handler functions for model selectors
  const handleProviderChange = (provider: string) => {
    setSettings(prev => ({ ...prev, llm_provider: provider }))
  }

  const handleModelChange = (model: string) => {
    setSettings(prev => ({ ...prev, llm_model: model }))
  }

  const handleTemperatureChange = (temp: number) => {
    setSettings(prev => ({ ...prev, llm_temperature: temp }))
  }

  const handleAzureConfigChange = (config: AzureConfig) => {
    setSettings(prev => ({ ...prev, azure_config: config }))
  }

  const handleSTTSelect = (provider: string, model: string, config?: Record<string, unknown>) => {
    setSettings(prev => ({
      ...prev,
      stt_provider: provider,
      stt_model: model,
      stt_config: config || prev.stt_config,
      stt_language: (config as { language?: string })?.language || prev.stt_language
    }))
  }

  const handleVoiceSelect = (voice: string, provider?: string, model?: string, config?: Record<string, unknown>) => {
    setSettings(prev => ({
      ...prev,
      tts_voice: voice,
      tts_provider: provider || prev.tts_provider,
      tts_model: model || prev.tts_model,
      tts_voice_config: config || prev.tts_voice_config
    }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading developer settings...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <SettingsIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Advanced Developer Settings
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Global settings applied to all agents
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {saveSuccess && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Saved successfully
                </Badge>
              )}
              {saveError && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {saveError}
                </Badge>
              )}
              <Button 
                onClick={handleSave} 
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                  Global Configuration
                </h3>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  These settings configure the <strong>evaluator/tester bots</strong> that assess and interact with your System Under Test voice bots. 
                  Changes here apply to <strong>all agents</strong> across your workspace - edit once, apply everywhere.
                </p>
              </div>
            </div>
          </div>

          {/* Model Configuration Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Brain className="w-5 h-5 text-green-600" />
                Model Configuration
              </CardTitle>
              <CardDescription>Configure LLM, STT, and TTS providers and models</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LLM Configuration */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-green-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Large Language Model</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <ModelSelector
                      selectedProvider={settings.llm_provider || 'openai'}
                      selectedModel={settings.llm_model || 'gpt-4o'}
                      temperature={settings.llm_temperature || 0.7}
                      onProviderChange={handleProviderChange}
                      onModelChange={handleModelChange}
                      onTemperatureChange={handleTemperatureChange}
                      azureConfig={settings.azure_config || { endpoint: '', apiVersion: '' }}
                      onAzureConfigChange={handleAzureConfigChange}
                    />
                    
                    {/* Provider Configuration */}
                    <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider Configuration</Label>
                      <Input
                        placeholder="Base URL (optional)"
                        value={settings.llm_base_url || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, llm_base_url: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="password"
                        placeholder="API Key (optional)"
                        value={settings.llm_api_key || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, llm_api_key: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* STT Configuration */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Mic className="w-4 h-4 text-blue-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Speech-to-Text</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <SelectSTT 
                      selectedProvider={settings.stt_provider || 'deepgram'}
                      selectedModel={settings.stt_model || 'nova-2'}
                      selectedLanguage={settings.stt_language}
                      initialConfig={settings.stt_config}
                      onSTTSelect={handleSTTSelect}
                    />
                    
                    {/* Provider Configuration */}
                    <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider Configuration</Label>
                      <Input
                        placeholder="Base URL (optional)"
                        value={settings.stt_base_url || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, stt_base_url: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="password"
                        placeholder="API Key (optional)"
                        value={settings.stt_api_key || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, stt_api_key: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* TTS Configuration */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Volume2 className="w-4 h-4 text-purple-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Text-to-Speech</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <SelectTTS 
                      selectedVoice={settings.tts_voice || ''}
                      initialProvider={settings.tts_provider || 'elevenlabs'}
                      initialModel={settings.tts_model || ''}
                      initialConfig={settings.tts_voice_config}
                      onVoiceSelect={handleVoiceSelect}
                    />
                    
                    {/* Provider Configuration */}
                    <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider Configuration</Label>
                      <Input
                        placeholder="Base URL (optional)"
                        value={settings.tts_base_url || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, tts_base_url: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Input
                        type="password"
                        placeholder="API Key (optional)"
                        value={settings.tts_api_key || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, tts_api_key: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Behavior Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-blue-600" />
                Advanced Behavior Settings
              </CardTitle>
              <CardDescription>Configure VAD, interruptions, fillers, and session behavior</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Voice Activity Detection */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Mic className="w-4 h-4 text-blue-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Voice Activity Detection</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">VAD Provider</Label>
                      <Select 
                        value={settings.vad_provider || 'webrtc'} 
                        onValueChange={(value) => setSettings(prev => ({ ...prev, vad_provider: value }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="webrtc">WebRTC</SelectItem>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="silero">Silero</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Min Silence Duration: {settings.vad_min_silence_duration || 1000}ms
                      </Label>
                      <Slider
                        value={[settings.vad_min_silence_duration || 1000]}
                        onValueChange={(value) => setSettings(prev => ({ ...prev, vad_min_silence_duration: value[0] }))}
                        min={100}
                        max={3000}
                        step={100}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Interruption Settings */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="w-4 h-4 text-green-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Interruption Control</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Allow Interruptions</Label>
                      <Switch
                        checked={settings.allow_interruptions || false}
                        onCheckedChange={(checked) => setSettings(prev => ({ ...prev, allow_interruptions: checked }))}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Min Duration: {settings.min_interruption_duration || 500}ms
                      </Label>
                      <Slider
                        value={[settings.min_interruption_duration || 500]}
                        onValueChange={(value) => setSettings(prev => ({ ...prev, min_interruption_duration: value[0] }))}
                        min={100}
                        max={2000}
                        step={50}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Filler Words Settings */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-purple-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filler Words & Natural Speech</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Enable Filler Words</Label>
                      <Switch
                        checked={settings.enable_filler_words || false}
                        onCheckedChange={(checked) => setSettings(prev => ({ ...prev, enable_filler_words: checked }))}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">General Fillers</Label>
                      <Input
                        placeholder="um, uh, like, you know..."
                        value={(settings.general_fillers || []).join(', ')}
                        onChange={(e) => {
                          const fillers = e.target.value.split(',').map(f => f.trim()).filter(f => f)
                          setSettings(prev => ({ ...prev, general_fillers: fillers }))
                        }}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Deployment Configuration */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-blue-600" />
                      <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Deployment Configuration</h5>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-sm">
                              Default deployment settings used when deploying agents.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Default Agent Name</Label>
                      <Input
                        placeholder="Enter agent name for deployment"
                        value={settings.deployment_agent_name || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, deployment_agent_name: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Default Agent Description</Label>
                      <Textarea
                        placeholder="Enter agent description for deployment"
                        value={settings.deployment_agent_description || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, deployment_agent_description: e.target.value }))}
                        className="text-xs min-h-[60px]"
                        rows={3}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Language</Label>
                      <Select 
                        value={settings.deployment_language || 'english'} 
                        onValueChange={(value) => setSettings(prev => ({ ...prev, deployment_language: value }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="english">English</SelectItem>
                          <SelectItem value="hindi">Hindi</SelectItem>
                          <SelectItem value="spanish">Spanish</SelectItem>
                          <SelectItem value="french">French</SelectItem>
                          <SelectItem value="german">German</SelectItem>
                          <SelectItem value="italian">Italian</SelectItem>
                          <SelectItem value="portuguese">Portuguese</SelectItem>
                          <SelectItem value="russian">Russian</SelectItem>
                          <SelectItem value="chinese">Chinese</SelectItem>
                          <SelectItem value="japanese">Japanese</SelectItem>
                          <SelectItem value="korean">Korean</SelectItem>
                          <SelectItem value="arabic">Arabic</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Session Behavior */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-orange-600" />
                    <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Session Behavior</h5>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Preemptive Generation</Label>
                      <Select 
                        value={settings.preemptive_generation || 'enabled'} 
                        onValueChange={(value) => setSettings(prev => ({ ...prev, preemptive_generation: value }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Turn Detection</Label>
                      <Select 
                        value={settings.turn_detection || 'multilingual'} 
                        onValueChange={(value) => setSettings(prev => ({ ...prev, turn_detection: value }))}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="multilingual">Multilingual</SelectItem>
                          <SelectItem value="english">English Only</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Last Updated Info */}
          {developerSettings && developerSettings.length > 0 && developerSettings[0].updated_at && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              Last updated: {new Date(developerSettings[0].updated_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
