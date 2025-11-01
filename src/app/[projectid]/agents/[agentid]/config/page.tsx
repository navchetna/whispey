'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useSupabaseQuery } from '@/hooks/useSupabase'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  CopyIcon, 
  CheckIcon, 
  SettingsIcon, 
  TypeIcon, 
  SlidersHorizontal, 
  PhoneIcon, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Volume2,
  Play,
  Square,
  Loader2,
  MessageSquare,
  User,
  Bot,
  MoreVertical,
  Save,
  X,
  Brain,
  ChevronDown,
  HelpCircle,
  Edit,
  Lock,
  Rocket
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { languageOptions, firstMessageModes } from '@/utils/constants'
import { useFormik } from 'formik'
import ModelSelector from '@/components/agents/AgentConfig/ModelSelector'
import SelectTTS from '@/components/agents/AgentConfig/SelectTTSDialog'
import SelectSTT from '@/components/agents/AgentConfig/SelectSTTDialog'
import AgentAdvancedSettings from '@/components/agents/AgentConfig/AgentAdvancedSettings'
import { usePromptSettings } from '@/hooks/usePromptSettings'
import { buildFormValuesFromAgent, getDefaultFormValues, useAgentConfig, useAgentMutations } from '@/hooks/useAgentConfig'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import TalkToAssistant from '@/components/agents/TalkToAssistant'

// Agent status service - you'll need to implement this
const agentStatusService = {
  checkAgentStatus: async (agentName: string): Promise<AgentStatus> => {
    try {
      if (!agentName) {
        console.warn('⚠️ Agent name is empty or undefined')
        return { status: 'error' as const, error: 'Agent name is required' }
      }

      const url = `${process.env.NEXT_PUBLIC_PYPEAI_API_URL}/agent_status/${encodeURIComponent(agentName)}`
      console.log('🔍 Checking agent status:', url)
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'pype-api-v1'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('✅ Raw agent status response:', data)
        
        // Properly typed status mapping
        const status: AgentStatus['status'] = data.is_active && data.worker_running ? 'running' : 'stopped'
        
        const mappedStatus: AgentStatus = {
          status,
          pid: data.worker_pid,
          error: !data.is_active ? 'Agent not active' : 
                 !data.worker_running ? 'Worker not running' : 
                 !data.inbound_ready ? 'Inbound not ready' : undefined,
          raw: data
        }
        
        console.log('🔄 Mapped agent status:', mappedStatus)
        return mappedStatus
      }
      
      console.error('❌ Agent status request failed:', response.status, response.statusText)
      return { 
        status: 'error' as const, 
        error: `Failed to check status: ${response.status} ${response.statusText}` 
      }
    } catch (error) {
      console.error('❌ Agent status connection error:', error)
      return { status: 'error' as const, error: 'Connection error' }
    }
  },
  
  startAgent: async (agentName: string): Promise<AgentStatus> => {
    try {
      if (!agentName) {
        return { status: 'error' as const, error: 'Agent name is required' }
      }

      console.log('🚀 Starting agent via API:', agentName)
      
      // Fixed: Use the correct path that matches your API route
      const response = await fetch('/api/agents/start_agent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agent_name: agentName })
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('✅ Start agent response:', data)
        
        return {
          status: 'starting' as const,
          message: data.message || 'Agent start initiated',
          raw: data
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        return { 
          status: 'error' as const, 
          error: errorData.error || `Failed to start agent: ${response.status}` 
        }
      }
    } catch (error) {
      console.error('❌ Start agent error:', error)
      return { status: 'error' as const, error: 'Failed to start agent' }
    }
  },
  
  stopAgent: async (agentName: string): Promise<AgentStatus> => {
    try {
      if (!agentName) {
        return { status: 'error' as const, error: 'Agent name is required' }
      }

      console.log('🛑 Stopping agent via API:', agentName)
      
      // This one was already correct in your code
      const response = await fetch('/api/agents/stop_agent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agent_name: agentName })
      })
      
      if (response.ok) {
        const data = await response.json()
        console.log('✅ Stop agent response:', data)
        
        return {
          status: 'stopping' as const,
          message: data.message || 'Agent stop initiated',
          raw: data
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        return { 
          status: 'error' as const, 
          error: errorData.error || `Failed to stop agent: ${response.status}` 
        }
      }
    } catch (error) {
      console.error('❌ Stop agent error:', error)
      return { status: 'error' as const, error: 'Failed to stop agent' }
    }
  },
  
  startStatusPolling: (
    agentName: string, 
    onStatusUpdate: (status: AgentStatus) => void, 
    interval: number = 15000
  ) => {
    if (!agentName) {
      console.warn('⚠️ Cannot start polling: agent name is required')
      return () => {}
    }

    console.log('📊 Starting status polling for agent:', agentName, 'interval:', interval)
    
    const pollStatus = async () => {
      const status = await agentStatusService.checkAgentStatus(agentName)
      onStatusUpdate(status)
    }
    
    pollStatus()
    
    const intervalId = setInterval(pollStatus, interval)
    
    return () => {
      console.log('🧹 Stopping status polling for agent:', agentName)
      clearInterval(intervalId)
    }
  }
}

interface AzureConfig {
  endpoint: string
  apiVersion: string
}

interface AgentStatus {
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error'
  pid?: number
  error?: string
  message?: string
  raw?: any // Allow for flexible API response data
}

interface WebSession {
  room_name: string
  token: string
  url: string
  participant_identity: string
}

interface Transcript {
  id: string
  speaker: 'user' | 'agent'
  text: string
  timestamp: Date
  isFinal: boolean
  participantIdentity?: string
}

export default function AgentConfig() {
  const { agentid, projectid } = useParams()
  const router = useRouter()
  const [isCopied, setIsCopied] = useState(false)
  const [isAdvancedSettingsOpen, setIsAdvancedSettingsOpen] = useState(false)
  const [isTalkToAssistantOpen, setIsTalkToAssistantOpen] = useState(false)
  const [isAdvancedDeveloperSettingsCollapsed, setIsAdvancedDeveloperSettingsCollapsed] = useState(false)
  const [isServiceProviderEditMode, setIsServiceProviderEditMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedConfig, setLastSavedConfig] = useState<any>(null)
  
  // Agent status state
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({ status: 'stopped' })
  const [isAgentLoading, setIsAgentLoading] = useState(false)

  const { getTextareaStyles, settings, setFontSize } = usePromptSettings()

  // Azure config state for ModelSelector
  const [azureConfig, setAzureConfig] = useState<AzureConfig>({
    endpoint: '',
    apiVersion: ''
  })

  const [tempAzureConfig, setTempAzureConfig] = useState<AzureConfig>({
    endpoint: '',
    apiVersion: ''
  })

  const [hasExternalChanges, setHasExternalChanges] = useState(false)

  // Deployment state
  const [showDeploymentPopup, setShowDeploymentPopup] = useState(false)
  const [deploymentResponse, setDeploymentResponse] = useState<any>(null)
  const [deploymentError, setDeploymentError] = useState<string | null>(null)

  const [ttsConfig, setTtsConfig] = useState({
    provider: '',
    model: '',
    config: {}
  })

  const [sttConfig, setSTTConfig] = useState({
    provider: '',
    model: '',
    config: {}
  })

  // Enhanced configuration state
  const [sarvamConfig, setSarvamConfig] = useState({
    agentName: '',
    selectedProvider: 'sarvam', // Default to Sarvam
    medium: 'web', // 'web' or 'phone'
    webUrl: '',
    phoneNumber: '',
    statementOfPurpose: '',
    serviceProviders: {
      asr: { baseUrl: '', modelName: '', apiKey: '' },
      llm: { baseUrl: '', modelName: '', apiKey: '' },
      tts: { baseUrl: '', modelName: '', apiKey: '' }
    },
    testingBots: [
      { id: 1, name: 'Customer Support Bot', prompt: 'You are a helpful customer support agent. Be friendly and professional.' },
      { id: 2, name: 'Sales Assistant', prompt: 'You are an enthusiastic sales assistant. Help customers find the right products.' }
    ]
  })

  const [isTestingBotsOpen, setIsTestingBotsOpen] = useState(false)

  // Get agent data from Supabase
  const { data: agentDataResponse, loading: agentLoading } = useSupabaseQuery("pype_voice_agents", {
    select: "id, name, agent_type, configuration, vapi_api_key_encrypted, vapi_project_key_encrypted",
    filters: [{ column: "id", operator: "eq", value: agentid }],
    limit: 1
  })

  const agentName = agentDataResponse?.[0]?.name

  // Use React Query for agent config
  const { 
    data: agentConfigData, 
    isLoading: isConfigLoading, 
    error: configError,
    isError: isConfigError,
    refetch: refetchConfig 
  } = useAgentConfig(agentName)

  // Use mutations for save operations
  const { saveDraft, saveAndDeploy } = useAgentMutations(agentName)

  // Check agent status on load and set up polling
  useEffect(() => {
    if (!agentName) return
    
    // Initial status check
    checkAgentStatus()
    
    // Set up polling for status updates
    const stopPolling = agentStatusService.startStatusPolling(
      agentName,
      (status) => {
        setAgentStatus(status)
        
        // Log status changes
        if (status.status !== agentStatus.status) {
          console.log(`🔄 Agent status changed: ${agentStatus.status} → ${status.status}`)
        }
      },
      15000 // Poll every 15 seconds
    )
    
    // Cleanup polling on unmount or agent name change
    return stopPolling
  }, [agentName])

  const checkAgentStatus = async () => {
    if (!agentName) return
    
    const status = await agentStatusService.checkAgentStatus(agentName)
    setAgentStatus(status) // Now properly typed
  }
  
  const startAgent = async () => {
    if (!agentName) return
    
    setIsAgentLoading(true)
    setAgentStatus({ status: 'starting' } as AgentStatus) // Type assertion for immediate state
    
    try {
      const status = await agentStatusService.startAgent(agentName)
      setAgentStatus(status) // Properly typed return
    } finally {
      setIsAgentLoading(false)
    }
  }
  
  const stopAgent = async () => {
    if (!agentName) return
    
    setIsAgentLoading(true)
    setAgentStatus({ status: 'stopping' } as AgentStatus) // Type assertion for immediate state
    
    try {
      const status = await agentStatusService.stopAgent(agentName)
      setAgentStatus(status) // Properly typed return  
    } finally {
      setIsAgentLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(formik.values.prompt)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
      const textArea = document.createElement('textarea')
      textArea.value = formik.values.prompt
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  }

  // Formik form state management
  const formik = useFormik({
    initialValues: useMemo(() => {
      if (agentConfigData?.agent?.assistant?.[0]) {
        return buildFormValuesFromAgent(agentConfigData.agent.assistant[0])
      }
      return getDefaultFormValues()
    }, [agentConfigData]),
    enableReinitialize: true,
    onSubmit: (values) => {
      console.log('Form submitted:', values)
    }
  })

  // Handle the agent config data when it loads
  useEffect(() => {
    if (agentConfigData?.agent?.assistant?.[0]) {
      const assistant = agentConfigData.agent.assistant[0]
      
      // Only handle the external state that's not in Formik
      const formValues = buildFormValuesFromAgent(assistant)
      
      setTtsConfig({
        provider: formValues.ttsProvider,
        model: formValues.ttsModel,
        config: formValues.ttsVoiceConfig
      })
      
      setSTTConfig({
        provider: assistant.stt?.name || assistant.stt?.provider || 'openai',            
        model: assistant.stt?.model || 'whisper-1',
        config: {
          language: assistant.stt?.language || 'en',
          ...assistant.stt?.config || {}
        }
      })
      
      // Set Azure config if it's an Azure provider
      const llmConfig = assistant.llm || {}
      const providerValue = llmConfig.provider || llmConfig.name || 'openai'
      let mappedProvider = providerValue
      if (providerValue === 'groq') {
        mappedProvider = 'groq'
      } else if (providerValue === 'azure') {
        mappedProvider = 'azure_openai' 
      } else if (llmConfig.model?.includes('claude')) {
        mappedProvider = 'anthropic'
      } else if (llmConfig.model?.includes('cerebras')) {
        mappedProvider = 'cerebras'
      }
      
      if (mappedProvider === 'azure_openai' && assistant.llm) {
        const azureConfigData = {
          endpoint: assistant.llm.azure_endpoint || '',
          apiVersion: assistant.llm.api_version || ''
        }
        setAzureConfig(azureConfigData)
        setTempAzureConfig(azureConfigData)
      }
    }
  }, [agentConfigData])

  const handleSaveDraft = () => {
    // Only save service provider configuration to database
    const serviceProviderConfig = {
      azureConfig: formik.values.selectedProvider === 'azure_openai' ? azureConfig : null,
      sarvamConfig: {
        selectedProvider: sarvamConfig.selectedProvider,
        medium: sarvamConfig.medium,
        webUrl: sarvamConfig.webUrl,
        phoneNumber: sarvamConfig.phoneNumber,
        statementOfPurpose: sarvamConfig.statementOfPurpose,
        serviceProviders: sarvamConfig.serviceProviders,
        testingBots: sarvamConfig.testingBots
      },
      basicConfiguration: {
        selectedProvider: formik.values.selectedProvider
        // Only saving service provider, not TTS/STT/other configs
      },
      metadata: {
        agentId: agentid,
        agentName: agentName,
        timestamp: new Date().toISOString(),
        action: 'SAVE_SERVICE_PROVIDER_CONFIG'
      }
    }
    
    console.log('💾 SAVE DRAFT - Service Provider Configuration Only:', serviceProviderConfig)
    saveDraft.mutate(serviceProviderConfig)
  }

  const handleSaveAndDeploy = async () => {
    // Extract required data directly from form (no caching)
    const deploymentData = {
      agent_name: formik.values.deploymentAgentName || '',
      agent_description: formik.values.deploymentAgentDescription || '',
      llm_provisioner: formik.values.selectedProvider || 'openai',
      llm_model: formik.values.selectedModel || 'gpt-4',
      stt_provisioner: sttConfig.provider || 'openai',
      stt_model: sttConfig.model || 'whisper-1',
      tts_provisioner: formik.values.ttsProvider || ttsConfig.provider || 'openai',
      tts_model: formik.values.ttsModel || ttsConfig.model || 'tts-1',
      tts_speaker: formik.values.selectedVoice || 'alloy',
      language: formik.values.deploymentLanguage || 'english'
    }
    
    // Validation before deployment
    console.log('🔍 VALIDATION DEBUG:', {
      deploymentAgentName: formik.values.deploymentAgentName,
      deploymentAgentDescription: formik.values.deploymentAgentDescription,
      selectedProvider: formik.values.selectedProvider,
      selectedModel: formik.values.selectedModel,
      deploymentData
    })
    
    const isValid = !!(
      deploymentData.llm_provisioner &&
      deploymentData.llm_model
    )
    
    if (!isValid) {
      console.warn('⚠️ SAVE & DEPLOY - Validation Failed:', deploymentData)
      setDeploymentError('Please fill in all required fields: LLM configuration.')
      return
    }
    
    console.log('🚀 SAVE & DEPLOY - Deployment Data:', deploymentData)
    
    try {
      // Call the backend service directly
      const response = await fetch('http://localhost:8000/create-agent-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(deploymentData)
      })
      
      const responseData = await response.json()
      
      if (response.ok) {
        setDeploymentResponse(responseData)
        setShowDeploymentPopup(true)
        setDeploymentError(null)
        console.log('✅ Deployment successful:', responseData)
      } else {
        throw new Error(responseData.error || 'Deployment failed')
      }
    } catch (error) {
      console.error('❌ Deployment error:', error)
      setDeploymentError(error instanceof Error ? error.message : 'Deployment failed')
    }
  }

  const handleCancel = () => {
    formik.resetForm()
    setHasExternalChanges(false)
  }

  const handleVoiceSelect = (voiceId: string, provider: string, model?: string, config?: any) => {
    console.log('TTS Configuration received:', { voiceId, provider, model, config })
    
    formik.setFieldValue('selectedVoice', voiceId)
    formik.setFieldValue('ttsProvider', provider)
    formik.setFieldValue('ttsModel', model || '')
    formik.setFieldValue('ttsVoiceConfig', config || {})
    
    setTtsConfig({
      provider: provider,
      model: model || '',
      config: config || {}
    })
    
    console.log('✅ TTS config stored successfully')
  }

  const handleSTTSelect = (provider: string, model: string, config: any) => {
    console.log('STT Configuration received:', { provider, model, config })
    
    formik.setFieldValue('sttProvider', provider)
    formik.setFieldValue('sttModel', model)
    formik.setFieldValue('sttConfig', config)
    
    setSTTConfig({ provider, model, config })
  }
  
  // Handlers for ModelSelector
  const handleProviderChange = (provider: string) => {
    formik.setFieldValue('selectedProvider', provider)
  }

  const handleModelChange = (model: string) => {
    formik.setFieldValue('selectedModel', model)
  }

  const handleTemperatureChange = (temperature: number) => {
    formik.setFieldValue('temperature', temperature)
  }

  const handleAzureConfigChange = (config: AzureConfig) => {
    setAzureConfig(config)
    setHasExternalChanges(true)
  }

  // Initialize provider config from agent data when it loads
  useEffect(() => {
    if (agentDataResponse?.[0]?.configuration?.provider_config) {
      const providerConfig = agentDataResponse[0].configuration.provider_config
      console.log('🔄 Initializing provider config from agent data:', providerConfig)
      
      setSarvamConfig(prev => ({
        ...prev,
        selectedProvider: providerConfig.provider || 'sarvam',
        medium: providerConfig.configuration?.medium?.type || 'web',
        webUrl: providerConfig.configuration?.medium?.type === 'web' ? providerConfig.configuration?.medium?.endpoint || '' : '',
        phoneNumber: providerConfig.configuration?.medium?.type === 'phone' ? providerConfig.configuration?.medium?.endpoint || '' : '',
        statementOfPurpose: providerConfig.configuration?.prompt?.statementOfPurpose || '',
        serviceProviders: providerConfig.configuration?.serviceProviders || prev.serviceProviders,
        testingBots: providerConfig.configuration?.testingBots || prev.testingBots
      }))
      
      console.log('✅ Provider config initialized from agent data')
    }
  }, [agentDataResponse])

  // Load saved configuration on component mount
  useEffect(() => {
    const loadSavedConfiguration = async () => {
      try {
        const response = await fetch(`/api/agents/provider-config?agentId=${agentid}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        })
        
        if (response.ok) {
          const result = await response.json()
          const savedConfig = result.data
          console.log('📋 Loaded saved configuration:', savedConfig)
          
          if (savedConfig && savedConfig.configuration) {
            // Update sarvamConfig with saved data
            setSarvamConfig(prev => ({
              ...prev,
              selectedProvider: savedConfig.provider || 'sarvam',
              medium: savedConfig.configuration.medium?.type || 'web',
              webUrl: savedConfig.configuration.medium?.type === 'web' ? savedConfig.configuration.medium?.endpoint || '' : '',
              phoneNumber: savedConfig.configuration.medium?.type === 'phone' ? savedConfig.configuration.medium?.endpoint || '' : '',
              statementOfPurpose: savedConfig.configuration.prompt?.statementOfPurpose || '',
              serviceProviders: savedConfig.configuration.serviceProviders || prev.serviceProviders,
              testingBots: savedConfig.configuration.testingBots || prev.testingBots
            }))
            
            // Only populate the service provider related form fields
            if (savedConfig.configuration.basicConfiguration) {
              const basicConfig = savedConfig.configuration.basicConfiguration
              
              // Only restore service provider selection
              formik.setValues({
                ...formik.values,
                selectedProvider: basicConfig.selectedProvider || formik.values.selectedProvider
              })
            }
            
            setLastSavedConfig(savedConfig)
            // Data exists, so start in view mode (edit disabled)
            setIsServiceProviderEditMode(false)
            console.log('✅ Service Provider configuration loaded and applied - starting in view mode')
          }
        } else if (response.status === 404) {
          console.log('📝 No saved configuration found - starting in edit mode')
          // No data exists, so start in edit mode (allow direct entry)
          setIsServiceProviderEditMode(true)
        }
      } catch (error) {
        console.error('❌ Failed to load saved configuration:', error)
        // On error, default to edit mode to allow configuration
        setIsServiceProviderEditMode(true)
      }
    }
    
    if (agentid) {
      loadSavedConfiguration()
    }
  }, [agentid])

  // Enhanced save configuration handler
  const saveSarvamConfig = async () => {
    try {
      setIsSaving(true)
      console.log('💾 Saving service provider configuration:', sarvamConfig)
      
      // Validate configuration based on selected provider
      const validationResults = {
        hasProvider: !!sarvamConfig.selectedProvider,
        hasMedium: !!sarvamConfig.medium,
        hasEndpoint: sarvamConfig.medium === 'web' ? !!sarvamConfig.webUrl : !!sarvamConfig.phoneNumber,
        hasPurpose: !!sarvamConfig.statementOfPurpose?.trim(),
        isComplete: false
      }
      
      validationResults.isComplete = validationResults.hasProvider && 
                                   validationResults.hasMedium && 
                                   validationResults.hasEndpoint && 
                                   validationResults.hasPurpose
      
      if (!validationResults.isComplete) {
        console.warn('⚠️ Configuration validation failed:', validationResults)
        // Remove alert popup - just log the error
        return
      }
      
      // Use the same structure as handleSaveDraft for service provider config
      const serviceProviderConfig = {
        azureConfig: formik.values.selectedProvider === 'azure_openai' ? azureConfig : null,
        sarvamConfig: {
          selectedProvider: sarvamConfig.selectedProvider,
          medium: sarvamConfig.medium,
          webUrl: sarvamConfig.webUrl,
          phoneNumber: sarvamConfig.phoneNumber,
          statementOfPurpose: sarvamConfig.statementOfPurpose,
          serviceProviders: sarvamConfig.serviceProviders,
          testingBots: sarvamConfig.testingBots
        },
        basicConfiguration: {
          selectedProvider: formik.values.selectedProvider,
          selectedModel: formik.values.selectedModel,
          temperature: formik.values.temperature,
          selectedVoice: formik.values.selectedVoice,
          ttsProvider: formik.values.ttsProvider || ttsConfig.provider,
          ttsModel: formik.values.ttsModel || ttsConfig.model,
          ttsVoiceConfig: formik.values.ttsVoiceConfig || ttsConfig.config,
          sttProvider: sttConfig.provider,
          sttModel: sttConfig.model,
          sttConfig: sttConfig.config,
          selectedLanguage: formik.values.selectedLanguage,
          prompt: formik.values.prompt
        },
        metadata: {
          agentId: agentid,
          agentName: agentName,
          timestamp: new Date().toISOString(),
          action: 'SAVE_SARVAM_CONFIG'
        }
      }
      
      // Use the save-draft API instead of provider-config
      const response = await fetch('/api/agents/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serviceProviderConfig)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Failed to save configuration: ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Service provider configuration saved successfully:', result)
      
      // Update last saved config and exit edit mode (no popup)
      setLastSavedConfig(serviceProviderConfig)
      setIsServiceProviderEditMode(false)
      
      // Only log success - no popup alert
      console.log(`✅ ${sarvamConfig.selectedProvider} configuration saved successfully!`)
      
    } catch (error) {
      console.error('❌ Failed to save enhanced agent configuration:', error)
      // Only log error - no popup alert
    } finally {
      setIsSaving(false)
    }
  }

  const getAgentStatusColor = () => {
    switch (agentStatus.status) {
      case 'running': return 'bg-green-500'
      case 'starting': return 'bg-yellow-500'
      case 'stopping': return 'bg-orange-500'
      case 'stopped': return 'bg-gray-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getAgentStatusText = () => {
    switch (agentStatus.status) {
      case 'running': return 'Agent Running'
      case 'starting': return 'Starting...'
      case 'stopping': return 'Stopping...'
      case 'stopped': return 'Agent Stopped'
      case 'error': return 'Agent Error'
      default: return 'Unknown'
    }
  }

  const getMobileAgentStatusText = () => {
    switch (agentStatus.status) {
      case 'running': return 'Running'
      case 'starting': return 'Starting...'
      case 'stopping': return 'Stopping...'
      case 'stopped': return 'Stopped'
      case 'error': return 'Error'
      default: return 'Unknown'
    }
  }

  const isFormDirty = formik.dirty || hasExternalChanges

  // Loading state
  if (agentLoading || isConfigLoading) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-64"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-96"></div>
            <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (isConfigError) {
    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center shadow-lg">
            {/* Icon */}
            <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
  
            {/* Title */}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Agent Not Found in Command Center
            </h3>
  
            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
              This agent exists in your workspace but couldn't be found in the current command center environment. 
              It might be deployed to a different environment or needs to be created.
            </p>
  
            {/* Environment Info */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 mb-6 text-left">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">Current Environment:</span>
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300">
                  {process.env.NODE_ENV === 'development' ? 'Development' : 'Production'}
                </code>
              </div>
            </div>
  
            {/* Actions */}
            <div className="space-y-3">
              <Button 
                onClick={() => refetchConfig()} 
                variant="outline"
                className="w-full"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => window.history.back()} 
                variant="ghost"
                size="sm"
                className="w-full text-gray-600 dark:text-gray-400"
              >
                Go Back
              </Button>
            </div>
  
            {/* Help Text */}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
              Need help? Check if the agent was deployed to the correct environment.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* Mobile Header (< lg) */}
      <div className="lg:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Agent Status */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getAgentStatusColor()}`}></div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {agentName || 'Loading...'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {getMobileAgentStatusText()}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Agent Control - Always visible */}
            {agentStatus.status === 'stopped' || agentStatus.status === 'error' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={startAgent}
                disabled={isAgentLoading || !agentName}
              >
                {isAgentLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
            ) : agentStatus.status === 'running' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={stopAgent}
                disabled={isAgentLoading}
              >
                {isAgentLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                disabled
              >
                <Loader2 className="w-4 h-4 animate-spin" />
              </Button>
            )}

            {/* Save & Deploy - Show when dirty */}
            {isFormDirty && (
              <Button 
                size="sm" 
                className="h-8 px-3" 
                onClick={handleSaveAndDeploy}
                disabled={saveAndDeploy.isPending}
              >
                {saveAndDeploy.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
              </Button>
            )}

            {/* Save Configuration - Enhanced */}
            {isServiceProviderEditMode && (
              <Button 
                size="sm" 
                variant="outline"
                className="h-8 px-3" 
                onClick={saveSarvamConfig}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center mr-2 ${
                    sarvamConfig.selectedProvider === 'sarvam' ? 'bg-purple-600' :
                    sarvamConfig.selectedProvider === 'vapi' ? 'bg-green-600' :
                    sarvamConfig.selectedProvider === 'vaani' ? 'bg-blue-600' :
                    sarvamConfig.selectedProvider === 'smallest' ? 'bg-yellow-600' :
                    sarvamConfig.selectedProvider === 'bolna' ? 'bg-orange-600' :
                    'bg-gray-600'
                  }`}>
                    {sarvamConfig.selectedProvider === 'sarvam' && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" className="text-white">
                        <path d="M12 2L3.09 8.26L4 9L12 4L20 9L20.91 8.26L12 2Z" fill="currentColor"/>
                        <path d="M12 6L3.09 12.26L4 13L12 8L20 13L20.91 12.26L12 6Z" fill="currentColor"/>
                        <path d="M12 10L3.09 16.26L4 17L12 12L20 17L20.91 16.26L12 10Z" fill="currentColor"/>
                      </svg>
                    )}
                    {sarvamConfig.selectedProvider === 'vapi' && <span className="text-white text-xs">V</span>}
                    {sarvamConfig.selectedProvider === 'vaani' && <span className="text-white text-xs">VA</span>}
                    {sarvamConfig.selectedProvider === 'smallest' && <span className="text-white text-xs">⚡</span>}
                    {sarvamConfig.selectedProvider === 'bolna' && <span className="text-white text-xs">B</span>}
                  </div>
                )}
                {isSaving ? 'Saving...' : `Save ${sarvamConfig.selectedProvider?.charAt(0).toUpperCase() + sarvamConfig.selectedProvider?.slice(1)}`}
              </Button>
            )}

            {/* Three Dot Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuGroup>
                  {/* Talk to Assistant */}
                  <DropdownMenuItem 
                    onSelect={() => setIsTalkToAssistantOpen(true)}
                    disabled={!agentName}
                  >
                    <PhoneIcon className="w-4 h-4 mr-2" />
                    Talk to Assistant
                  </DropdownMenuItem>
                </DropdownMenuGroup>

                {isFormDirty && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {/* Cancel */}
                      <DropdownMenuItem onSelect={handleCancel}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel Changes
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Desktop Header (>= lg) */}
      <div className="hidden lg:block bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-2 h-2 rounded-full ${getAgentStatusColor()}`}></div>
            <div className="flex flex-col">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {agentName || 'Loading...'}
              </span>
              <span className="text-xs text-gray-500">
                {getAgentStatusText()}
                {agentStatus.pid && ` (PID: ${agentStatus.pid})`}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Agent Controls */}
            {agentStatus.status === 'stopped' || agentStatus.status === 'error' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={startAgent}
                disabled={isAgentLoading || !agentName}
              >
                {isAgentLoading ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 mr-1" />
                )}
                Start Agent
              </Button>
            ) : agentStatus.status === 'running' ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={stopAgent}
                disabled={isAgentLoading}
              >
                {isAgentLoading ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Square className="w-3 h-3 mr-1" />
                )}
                Stop Agent
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled
              >
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                {agentStatus.status === 'starting' ? 'Starting...' : 'Stopping...'}
              </Button>
            )}

            {/* Talk to Assistant Button */}
            <Sheet open={isTalkToAssistantOpen} onOpenChange={setIsTalkToAssistantOpen}>
              <SheetHeader className="sr-only">
                <SheetTitle>Talk to Assistant</SheetTitle>
              </SheetHeader>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!agentName}
                >
                  <PhoneIcon className="w-3 h-3 mr-1" />
                  Talk to Assistant
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:w-96 p-0">
                <TalkToAssistant
                  agentName={agentName || ''}
                  isOpen={isTalkToAssistantOpen}
                  onClose={() => setIsTalkToAssistantOpen(false)}
                  agentStatus={agentStatus}
                />
              </SheetContent>
            </Sheet>

            {/* Cancel Button */}
            {isFormDirty && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            
            {/* Save & Deploy Button */}
            <Button 
              size="sm" 
              className="h-8 text-xs" 
              onClick={handleSaveAndDeploy}
              disabled={saveAndDeploy.isPending || !isFormDirty}
            >
              {saveAndDeploy.isPending ? 'Deploying...' : 'Save & Deploy'}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Responsive Layout */}
      <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full p-4">
        <div className="h-full flex gap-4">
          
          {/* Left Side - Main Configuration */}
          <div className="flex-1 min-w-0 flex flex-col space-y-3">
            
            {/* Service Provider Selection */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-blue-600" />
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Service Provider Configuration</h3>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <p className="text-sm">
                          Configure the voice bot that will be evaluated or tested. This is your <strong>System Under Test (SUT)</strong> - the main agent being assessed by evaluator bots.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Status Indicator */}
                  {lastSavedConfig && !isServiceProviderEditMode && (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Lock className="w-3 h-3" />
                      <span>Service Provider Saved</span>
                    </div>
                  )}
                  
                  {/* First-time setup indicator */}
                  {!lastSavedConfig && isServiceProviderEditMode && (
                    <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                      <Edit className="w-3 h-3" />
                      <span>Setup Service Provider</span>
                    </div>
                  )}
                  
                  {/* Edit/Save/Cancel Buttons - Only show Edit button if data exists */}
                  {!isServiceProviderEditMode && lastSavedConfig ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsServiceProviderEditMode(true)}
                      className="h-8 text-xs"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  ) : isServiceProviderEditMode ? (
                    <div className="flex gap-2">
                      {/* Only show Cancel button if there's saved config to revert to */}
                      {lastSavedConfig && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Reset to last saved service provider config only
                            setSarvamConfig(prev => ({
                              ...prev,
                              selectedProvider: lastSavedConfig.provider || 'sarvam',
                              medium: lastSavedConfig.configuration.medium?.type || 'web',
                              webUrl: lastSavedConfig.configuration.medium?.type === 'web' ? lastSavedConfig.configuration.medium?.endpoint || '' : '',
                              phoneNumber: lastSavedConfig.configuration.medium?.type === 'phone' ? lastSavedConfig.configuration.medium?.endpoint || '' : '',
                              statementOfPurpose: lastSavedConfig.configuration.prompt?.statementOfPurpose || '',
                              serviceProviders: lastSavedConfig.configuration.serviceProviders || prev.serviceProviders,
                              testingBots: lastSavedConfig.configuration.testingBots || prev.testingBots
                            }))
                            
                            // Only reset service provider selection in form
                            if (lastSavedConfig.configuration.basicConfiguration) {
                              const basicConfig = lastSavedConfig.configuration.basicConfiguration
                              formik.setFieldValue('selectedProvider', basicConfig.selectedProvider || formik.initialValues.selectedProvider)
                            }
                            
                            setIsServiceProviderEditMode(false)
                          }}
                          className="h-8 text-xs"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={saveSarvamConfig}
                        disabled={isSaving}
                        className="h-8 text-xs"
                      >
                        {isSaving ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Save className="w-3 h-3 mr-1" />
                        )}
                        {isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Service Provider Selection Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { 
                    id: 'sarvam', 
                    name: 'Sarvam', 
                    icon: '🟣',
                    color: 'purple',
                    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
                    borderColor: 'border-purple-200 dark:border-purple-700',
                    textColor: 'text-purple-700 dark:text-purple-300'
                  },
                  { 
                    id: 'vapi', 
                    name: 'Vapi', 
                    icon: '🟢',
                    color: 'green',
                    bgColor: 'bg-green-50 dark:bg-green-900/20',
                    borderColor: 'border-green-200 dark:border-green-700',
                    textColor: 'text-green-700 dark:text-green-300'
                  },
                  { 
                    id: 'vaani', 
                    name: 'Vaani', 
                    icon: '🔵',
                    color: 'blue',
                    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
                    borderColor: 'border-blue-200 dark:border-blue-700',
                    textColor: 'text-blue-700 dark:text-blue-300'
                  },
                  { 
                    id: 'smallest', 
                    name: 'Smallest.ai', 
                    icon: '⚡',
                    color: 'yellow',
                    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
                    borderColor: 'border-yellow-200 dark:border-yellow-700',
                    textColor: 'text-yellow-700 dark:text-yellow-300'
                  },
                  { 
                    id: 'bolna', 
                    name: 'Bolna', 
                    icon: '🟠',
                    color: 'orange',
                    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
                    borderColor: 'border-orange-200 dark:border-orange-700',
                    textColor: 'text-orange-700 dark:text-orange-300'
                  }
                ].map((provider) => (
                  <button
                    key={provider.id}
                    onClick={() => isServiceProviderEditMode && setSarvamConfig(prev => ({ ...prev, selectedProvider: provider.id }))}
                    disabled={!isServiceProviderEditMode}
                    className={`
                      relative p-3 rounded-lg border-2 transition-all duration-200 text-center
                      ${sarvamConfig.selectedProvider === provider.id 
                        ? `${provider.bgColor} ${provider.borderColor} shadow-md` 
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                      ${!isServiceProviderEditMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">{provider.icon}</span>
                      <span className={`text-xs font-medium ${
                        sarvamConfig.selectedProvider === provider.id 
                          ? provider.textColor 
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {provider.name}
                      </span>
                    </div>
                    {sarvamConfig.selectedProvider === provider.id && (
                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                        <CheckIcon className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Medium Selection */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Communication Medium</span>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => isServiceProviderEditMode && setSarvamConfig(prev => ({ ...prev, medium: 'web' }))}
                    disabled={!isServiceProviderEditMode}
                    className={`
                      flex-1 p-3 rounded-lg border-2 transition-all duration-200
                      ${sarvamConfig.medium === 'web' 
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300' 
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                      ${!isServiceProviderEditMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9m0 9c-5 0-9-4-9-9s4-9 9-9" />
                      </svg>
                      <span className="text-sm font-medium">Web URL</span>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => isServiceProviderEditMode && setSarvamConfig(prev => ({ ...prev, medium: 'phone' }))}
                    disabled={!isServiceProviderEditMode}
                    className={`
                      flex-1 p-3 rounded-lg border-2 transition-all duration-200
                      ${sarvamConfig.medium === 'phone' 
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300' 
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }
                      ${!isServiceProviderEditMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <PhoneIcon className="w-6 h-6" />
                      <span className="text-sm font-medium">Phone Number</span>
                    </div>
                  </button>
                </div>

                {/* URL/Phone Input based on selection */}
                {sarvamConfig.medium && (
                  <div className="mt-3">
                    <Input
                      placeholder={sarvamConfig.medium === 'web' ? 'Enter web URL...' : 'Enter phone number...'}
                      value={sarvamConfig.medium === 'web' ? sarvamConfig.webUrl || '' : sarvamConfig.phoneNumber || ''}
                      onChange={(e) => isServiceProviderEditMode && setSarvamConfig(prev => ({
                        ...prev,
                        ...(sarvamConfig.medium === 'web' 
                          ? { webUrl: e.target.value } 
                          : { phoneNumber: e.target.value }
                        )
                      }))}
                      disabled={!isServiceProviderEditMode}
                      className="h-9 text-sm"
                      type={sarvamConfig.medium === 'phone' ? 'tel' : 'url'}
                    />
                  </div>
                )}
              </div>

              {/* Statement of Purpose / Prompt Configuration */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Statement of Purpose</span>
                </div>
                
                <Textarea
                  placeholder="Define your agent's purpose, behavior, and how it should interact with users..."
                  value={sarvamConfig.statementOfPurpose || ''}
                  onChange={(e) => isServiceProviderEditMode && setSarvamConfig(prev => ({ ...prev, statementOfPurpose: e.target.value }))}
                  disabled={!isServiceProviderEditMode}
                  className="min-h-[100px] text-sm resize-none border-gray-200 dark:border-gray-700"
                />
                
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {(sarvamConfig.statementOfPurpose || '').length.toLocaleString()} characters
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!isServiceProviderEditMode) return
                        const templates = [
                          "You are a helpful customer service agent. Be professional, empathetic, and solution-oriented.",
                          "You are a sales assistant. Be enthusiastic, knowledgeable about products, and help customers make informed decisions.",
                          "You are a technical support specialist. Be patient, detail-oriented, and guide users through troubleshooting steps.",
                          "You are a personal assistant. Be organized, proactive, and help users manage their tasks and schedule efficiently."
                        ]
                        const randomTemplate = templates[Math.floor(Math.random() * templates.length)]
                        setSarvamConfig(prev => ({ ...prev, statementOfPurpose: randomTemplate }))
                      }}
                      disabled={!isServiceProviderEditMode}
                      className="h-7 text-xs"
                    >
                      Use Template
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Advanced Developer Settings */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <Collapsible open={!isAdvancedDeveloperSettingsCollapsed} onOpenChange={(open) => setIsAdvancedDeveloperSettingsCollapsed(!open)}>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Advanced Developer Settings</h3>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">
                            Configure the <strong>evaluator/tester bots</strong> that will assess and interact with your System Under Test voice bot. These settings control how the testing agents behave during evaluation.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isAdvancedDeveloperSettingsCollapsed ? '' : 'rotate-180'}`} />
                </CollapsibleTrigger>
                
                <CollapsibleContent className="space-y-4 mt-4">
                  {/* Model Configuration Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Model Configuration</h4>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* LLM Configuration */}
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4 text-green-600" />
                      <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Large Language Model</h5>
                    </div>
                    
                    <div className="space-y-3">
                      <ModelSelector
                        selectedProvider={formik.values.selectedProvider}
                        selectedModel={formik.values.selectedModel}
                        temperature={formik.values.temperature}
                        onProviderChange={handleProviderChange}
                        onModelChange={handleModelChange}
                        onTemperatureChange={handleTemperatureChange}
                        azureConfig={azureConfig}
                        onAzureConfigChange={handleAzureConfigChange}
                      />
                      
                      {/* Service Provider Details */}
                      <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider Configuration</Label>
                        <Input
                          placeholder="Base URL (optional)"
                          value={sarvamConfig.serviceProviders.llm.baseUrl}
                          onChange={(e) => setSarvamConfig(prev => ({
                            ...prev,
                            serviceProviders: {
                              ...prev.serviceProviders,
                              llm: { ...prev.serviceProviders.llm, baseUrl: e.target.value }
                            }
                          }))}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="password"
                          placeholder="API Key (optional)"
                          value={sarvamConfig.serviceProviders.llm.apiKey}
                          onChange={(e) => setSarvamConfig(prev => ({
                            ...prev,
                            serviceProviders: {
                              ...prev.serviceProviders,
                              llm: { ...prev.serviceProviders.llm, apiKey: e.target.value }
                            }
                          }))}
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
                        selectedProvider={formik.values.sttProvider}
                        selectedModel={formik.values.sttModel}
                        selectedLanguage={formik.values.sttConfig?.language}   
                        initialConfig={formik.values.sttConfig}                
                        onSTTSelect={handleSTTSelect}
                      />
                      
                      {/* Service Provider Details */}
                      <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider Configuration</Label>
                        <Input
                          placeholder="Base URL (optional)"
                          value={sarvamConfig.serviceProviders.asr.baseUrl}
                          onChange={(e) => setSarvamConfig(prev => ({
                            ...prev,
                            serviceProviders: {
                              ...prev.serviceProviders,
                              asr: { ...prev.serviceProviders.asr, baseUrl: e.target.value }
                            }
                          }))}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="password"
                          placeholder="API Key (optional)"
                          value={sarvamConfig.serviceProviders.asr.apiKey}
                          onChange={(e) => setSarvamConfig(prev => ({
                            ...prev,
                            serviceProviders: {
                              ...prev.serviceProviders,
                              asr: { ...prev.serviceProviders.asr, apiKey: e.target.value }
                            }
                          }))}
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
                        selectedVoice={formik.values.selectedVoice}
                        initialProvider={formik.values.ttsProvider}
                        initialModel={formik.values.ttsModel}
                        initialConfig={formik.values.ttsVoiceConfig}
                        onVoiceSelect={handleVoiceSelect}
                      />
                      
                      {/* Service Provider Details */}
                      <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Provider Configuration</Label>
                        <Input
                          placeholder="Base URL (optional)"
                          value={sarvamConfig.serviceProviders.tts.baseUrl}
                          onChange={(e) => setSarvamConfig(prev => ({
                            ...prev,
                            serviceProviders: {
                              ...prev.serviceProviders,
                              tts: { ...prev.serviceProviders.tts, baseUrl: e.target.value }
                            }
                          }))}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="password"
                          placeholder="API Key (optional)"
                          value={sarvamConfig.serviceProviders.tts.apiKey}
                          onChange={(e) => setSarvamConfig(prev => ({
                            ...prev,
                            serviceProviders: {
                              ...prev.serviceProviders,
                              tts: { ...prev.serviceProviders.tts, apiKey: e.target.value }
                            }
                          }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Behavior Settings */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Advanced Behavior Settings</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          value={formik.values.advancedSettings?.vad?.vadProvider || 'webrtc'} 
                          onValueChange={(value) => formik.setFieldValue('advancedSettings.vad.vadProvider', value)}
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
                          Min Silence Duration: {formik.values.advancedSettings?.vad?.minSilenceDuration || 1000}ms
                        </Label>
                        <Slider
                          value={[formik.values.advancedSettings?.vad?.minSilenceDuration || 1000]}
                          onValueChange={(value) => formik.setFieldValue('advancedSettings.vad.minSilenceDuration', value[0])}
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
                          checked={formik.values.advancedSettings?.interruption?.allowInterruptions || false}
                          onCheckedChange={(checked) => formik.setFieldValue('advancedSettings.interruption.allowInterruptions', checked)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Min Duration: {formik.values.advancedSettings?.interruption?.minInterruptionDuration || 500}ms
                        </Label>
                        <Slider
                          value={[formik.values.advancedSettings?.interruption?.minInterruptionDuration || 500]}
                          onValueChange={(value) => formik.setFieldValue('advancedSettings.interruption.minInterruptionDuration', value[0])}
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
                          checked={formik.values.advancedSettings?.fillers?.enableFillerWords || false}
                          onCheckedChange={(checked) => formik.setFieldValue('advancedSettings.fillers.enableFillerWords', checked)}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">General Fillers</Label>
                        <Input
                          placeholder="um, uh, like, you know..."
                          value={formik.values.advancedSettings?.fillers?.generalFillers?.join(', ') || ''}
                          onChange={(e) => {
                            const fillers = e.target.value.split(',').map(f => f.trim()).filter(f => f)
                            formik.setFieldValue('advancedSettings.fillers.generalFillers', fillers)
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
                                Deployment fields are used directly when you click <strong>"Save and Deploy"</strong>.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Agent Name</Label>
                        <Input
                          placeholder="Enter agent name for deployment"
                          value={formik.values.deploymentAgentName || ''}
                          onChange={(e) => {
                            formik.setFieldValue('deploymentAgentName', e.target.value)
                          }}
                          className="h-8 text-xs"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Agent Description</Label>
                        <Textarea
                          placeholder="Enter agent description for deployment"
                          value={formik.values.deploymentAgentDescription || ''}
                          onChange={(e) => {
                            formik.setFieldValue('deploymentAgentDescription', e.target.value)
                          }}
                          className="text-xs min-h-[60px]"
                          rows={3}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Language</Label>
                        <Select 
                          value={formik.values.deploymentLanguage || 'english'} 
                          onValueChange={(value) => {
                            formik.setFieldValue('deploymentLanguage', value)
                          }}
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
                      
                      {deploymentError && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                          <p className="text-xs text-red-600 dark:text-red-400">{deploymentError}</p>
                        </div>
                      )}
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
                          value={formik.values.advancedSettings?.session?.preemptiveGeneration || 'enabled'} 
                          onValueChange={(value) => formik.setFieldValue('advancedSettings.session.preemptiveGeneration', value)}
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
                          value={formik.values.advancedSettings?.session?.turn_detection || 'multilingual'} 
                          onValueChange={(value) => formik.setFieldValue('advancedSettings.session.turn_detection', value)}
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
              </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

        </div>
      </div>

      {/* Mobile Sheets for Talk to Assistant */}
      <Sheet open={isTalkToAssistantOpen} onOpenChange={setIsTalkToAssistantOpen}>
        <SheetContent side="right" className="w-full sm:w-96 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Talk to Assistant</SheetTitle>
          </SheetHeader>
          <TalkToAssistant
            agentName={agentName || ''}
            isOpen={isTalkToAssistantOpen}
            onClose={() => setIsTalkToAssistantOpen(false)}
            agentStatus={agentStatus}
          />
        </SheetContent>
      </Sheet>

      {/* Testing Bot Profiles Dialog */}
      <Dialog open={isTestingBotsOpen} onOpenChange={setIsTestingBotsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-purple-600" />
              Testing Bot Profiles
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {sarvamConfig.testingBots.map((bot) => (
              <div key={bot.id} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-blue-600" />
                    <Input
                      value={bot.name}
                      onChange={(e) => setSarvamConfig(prev => ({
                        ...prev,
                        testingBots: prev.testingBots.map(b => 
                          b.id === bot.id ? { ...b, name: e.target.value } : b
                        )
                      }))}
                      className="h-8 text-sm font-medium"
                      placeholder="Bot name..."
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSarvamConfig(prev => ({
                      ...prev,
                      testingBots: prev.testingBots.filter(b => b.id !== bot.id)
                    }))}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Custom Prompt</Label>
                  <Textarea
                    value={bot.prompt}
                    onChange={(e) => setSarvamConfig(prev => ({
                      ...prev,
                      testingBots: prev.testingBots.map(b => 
                        b.id === bot.id ? { ...b, prompt: e.target.value } : b
                      )
                    }))}
                    placeholder="Define this bot's behavior and personality..."
                    className="min-h-[80px] text-sm resize-none"
                  />
                  <div className="text-xs text-gray-400">
                    {bot.prompt.length} characters
                  </div>
                </div>
              </div>
            ))}
            
            {/* Add New Bot Button */}
            <Button
              variant="outline"
              onClick={() => {
                const newId = Math.max(...sarvamConfig.testingBots.map(b => b.id), 0) + 1
                setSarvamConfig(prev => ({
                  ...prev,
                  testingBots: [
                    ...prev.testingBots,
                    {
                      id: newId,
                      name: `Testing Bot ${newId}`,
                      prompt: 'You are a helpful assistant. Be professional and engaging.'
                    }
                  ]
                }))
              }}
              className="w-full border-dashed border-2 h-12 text-sm"
            >
              <Bot className="w-4 h-4 mr-2" />
              Add New Testing Bot
            </Button>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestingBotsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deployment Response Popup */}
      <Dialog open={showDeploymentPopup} onOpenChange={setShowDeploymentPopup}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-green-600" />
              Agent Deployed Successfully!
            </DialogTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your agent is now live and ready to use. View the deployment details below.
            </p>
          </DialogHeader>
          
          <div className="space-y-4">
            {deploymentResponse && (
              <div className="space-y-4">
                {/* Deployment Success Summary */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-green-700 dark:text-green-300 mb-2">
                    🎉 Agent Successfully Deployed
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {deploymentResponse.agent_name && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Agent Name:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{deploymentResponse.agent_name}</p>
                      </div>
                    )}
                    {deploymentResponse.status && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Status:</span>
                        <p className="font-medium text-green-600 dark:text-green-400 capitalize">{deploymentResponse.status}</p>
                      </div>
                    )}
                    {deploymentResponse.created_at && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Deployed At:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(deploymentResponse.created_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {deploymentResponse.language && (
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">Language:</span>
                        <p className="font-medium text-gray-900 dark:text-gray-100 capitalize">{deploymentResponse.language}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Technical Details (Collapsible) */}
                <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Technical Response</h4>
                  <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(deploymentResponse, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            
            {deploymentError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Deployment Error</h4>
                <p className="text-sm text-red-600 dark:text-red-400">{deploymentError}</p>
              </div>
            )}
            
            {deploymentResponse?.deployment_url && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">Quick Links</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Deployment URL:</span>
                    <br />
                    <a 
                      href={deploymentResponse.deployment_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                    >
                      {deploymentResponse.deployment_url}
                    </a>
                  </div>
                  {deploymentResponse.webhook_url && (
                    <div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Webhook URL:</span>
                      <br />
                      <span className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                        {deploymentResponse.webhook_url}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeploymentPopup(false)
                setDeploymentResponse(null)
                setDeploymentError(null)
              }}
            >
              Close
            </Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                // Close popup and navigate to agent overview dashboard
                setShowDeploymentPopup(false)
                setDeploymentResponse(null)
                setDeploymentError(null)
                router.push(`/${projectid}/agents/${agentid}`)
              }}
            >
              <Rocket className="w-4 h-4 mr-2" />
              Go to Agent Overview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}