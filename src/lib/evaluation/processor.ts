import { DatabaseService } from "@/lib/database"
import { query } from "@/lib/postgres"
import OpenAI from 'openai'

// This would typically be run as a background job/worker

// Type definitions
interface EvaluationJob {
  id: string
  name: string
  agent_id: string
  project_id: string
  prompt_ids: string[]
  status: string
  total_traces?: number
  completed_traces?: number
  failed_traces?: number
  error_message?: string
  created_at: string
  started_at?: string
  completed_at?: string
  selected_traces?: string[] | null
  filter_criteria?: {
    date_range?: string
    min_duration?: number
    call_status?: string
    start_date?: string
    end_date?: string
  }
}

interface EvaluationPrompt {
  id: string
  name: string
  llm_provider: string
  model: string
  api_key?: string
  api_url?: string
  prompt_template: string
  scoring_output_type: string
  temperature?: number
  max_tokens?: number
  created_at: string
}

interface CallLog {
  id: string
  call_id: string
  agent_id: string
  transcript_json: any
  duration_seconds?: number
  call_ended_reason: string
  created_at: string
}

interface EvaluationResult {
  id?: string
  job_id: string
  prompt_id: string
  call_id: string
  status: string
  overall_score?: number
  detailed_scores?: any
  llm_response?: string
  error_message?: string
  created_at?: string
}
export class EvaluationProcessor {

  constructor() {
  }

  // Create LLM client based on provider configuration
  private createLLMClient(prompt: any): OpenAI {
    console.log(`Creating LLM client for provider: ${prompt.llm_provider}`)
    
    const apiKey = prompt.api_key || process.env.OPENAI_API_KEY
    
    // Enhanced API key validation
    if (!apiKey || apiKey === 'None' || apiKey === 'none' || apiKey === '') {
      console.error(`API key validation failed:`, {
        promptApiKey: prompt.api_key ? 'provided' : 'missing',
        envApiKey: process.env.OPENAI_API_KEY ? 'set' : 'missing',
        promptId: prompt.id,
        provider: prompt.llm_provider
      })
      throw new Error(`No valid API key available for provider ${prompt.llm_provider}. Please ensure the API key is set in the prompt configuration. Current state: prompt key=${!!prompt.api_key}, env key=${!!process.env.OPENAI_API_KEY}`)
    }
    
    // Validate API key format
    if (prompt.llm_provider === 'openai' && !apiKey.startsWith('sk-')) {
      throw new Error(`Invalid OpenAI API key format. OpenAI keys should start with 'sk-'`)
    }
    
    if (prompt.llm_provider === 'groq' && !apiKey.startsWith('gsk_')) {
      throw new Error(`Invalid Groq API key format. Groq keys should start with 'gsk_'`)
    }

    const config: any = {
      apiKey: apiKey
    }

    // Set base URL for different providers
    if (prompt.llm_provider === 'gemini') {
      // Gemini requires native API calls, not OpenAI-compatible endpoint
      // We'll handle this specially in the callGeminiAPI method
      config.baseURL = prompt.api_url || 'https://generativelanguage.googleapis.com/v1beta/'
      console.log(`Using Gemini native API endpoint: ${config.baseURL}`)
    } else if (prompt.llm_provider === 'groq') {
      config.baseURL = prompt.api_url || 'https://api.groq.com/openai/v1'
      // Validate Groq model
      const validGroqModels = [
        // Most Popular Models
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'openai/gpt-oss-120b',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        
        // Keep for backward compatibility
        'gemma-7b-it',
        'llama-guard-3-8b',
        'llama3-groq-70b-8192-tool-use-preview',
        'llama3-groq-8b-8192-tool-use-preview'
      ]
      if (!validGroqModels.includes(prompt.model)) {
        console.warn(`Model ${prompt.model} may not be valid for Groq. Valid models: ${validGroqModels.join(', ')}`)
      }
    } else if (prompt.llm_provider === 'openai') {
      config.baseURL = prompt.api_url || 'https://api.openai.com/v1'
      // Validate OpenAI model
      const validOpenAIModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo']
      if (!validOpenAIModels.includes(prompt.model)) {
        console.warn(`Model ${prompt.model} may not be valid for OpenAI. Valid models: ${validOpenAIModels.join(', ')}`)
      }
    } else {
      // Custom provider
      if (!prompt.api_url) {
        throw new Error(`Custom provider ${prompt.llm_provider} requires an API URL`)
      }
      config.baseURL = prompt.api_url
    }

    console.log(`LLM client config:`, { 
      provider: prompt.llm_provider, 
      baseURL: config.baseURL,
      model: prompt.model,
      hasApiKey: !!config.apiKey,
      apiKeyPrefix: config.apiKey?.substring(0, 10) + '...'
    })

    return new OpenAI(config)
  }

  // Handle Gemini API calls using native Gemini API format
  private async callGeminiAPI(client: OpenAI, params: any) {
    try {
      console.log(`Attempting Gemini native API call with base URL: ${client.baseURL}`)
      
      // Convert OpenAI format to Gemini native format
      const geminiMessages = params.messages.map((msg: any) => {
        if (msg.role === 'system') {
          // Gemini doesn't have system role, prepend to user message
          return null
        } else if (msg.role === 'user') {
          return {
            role: 'user',
            parts: [{ text: msg.content }]
          }
        } else if (msg.role === 'assistant') {
          return {
            role: 'model',
            parts: [{ text: msg.content }]
          }
        }
        return null
      }).filter(Boolean)
      
      // If there was a system message, prepend it to the first user message
      const systemMessage = params.messages.find((msg: any) => msg.role === 'system')
      if (systemMessage && geminiMessages.length > 0) {
        const firstUserMessage = geminiMessages.find((msg: any) => msg.role === 'user')
        if (firstUserMessage) {
          firstUserMessage.parts[0].text = `${systemMessage.content}\n\n${firstUserMessage.parts[0].text}`
        }
      }

      // Prepare Gemini API request
      const geminiRequestBody = {
        contents: geminiMessages,
        generationConfig: {
          temperature: params.temperature || 0.7,
          maxOutputTokens: params.max_tokens || 1000
        }
      }

      // Make direct HTTP request to Gemini API
      const response = await fetch(`${client.baseURL}models/${params.model}:generateContent?key=${client.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(geminiRequestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error (${response.status}): ${errorText}`)
      }

      const geminiResponse = await response.json()
      
      // Convert Gemini response back to OpenAI format
      if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
        const candidate = geminiResponse.candidates[0]
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          return {
            choices: [{
              message: {
                role: 'assistant',
                content: candidate.content.parts[0].text
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
              completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
              total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0
            }
          }
        }
      }
      
      throw new Error('Unexpected Gemini API response format')
      
    } catch (error) {
      console.error('Gemini native API call failed:', {
        error: error instanceof Error ? error.message : error,
        baseURL: client.baseURL,
        model: params.model
      })
      
      if (error instanceof Error && error.message.includes('404')) {
        throw new Error(`Gemini API endpoint not found. Please verify your API key and model name. Using endpoint: ${client.baseURL}`)
      }
      
      if (error instanceof Error && error.message.includes('403')) {
        throw new Error(`Gemini API access denied. Please check your API key permissions.`)
      }
      
      throw error
    }
  }

  async processEvaluationJob(jobId: string) {
    console.log(`Starting evaluation job processing for job ID: ${jobId}`)
    
    try {
      // Get job details
      const jobResult = await query(
        'SELECT * FROM pype_voice_evaluation_jobs WHERE id = $1',
        [jobId]
      )

      if (jobResult.rows.length === 0) {
        throw new Error('Failed to fetch job: Job not found')
      }

      const job = jobResult.rows[0] as EvaluationJob

      console.log(`Job details:`, {
        id: job.id,
        name: job.name,
        agent_id: job.agent_id,
        project_id: job.project_id,
        prompt_ids: job.prompt_ids
      })

      // Get prompts for this job
      const promptsResult = await query(
        'SELECT * FROM pype_voice_evaluation_prompts WHERE id = ANY($1::uuid[])',
        [job.prompt_ids]
      )

      if (promptsResult.rows.length === 0) {
        throw new Error('Failed to fetch prompts: No prompts found')
      }

      const prompts = promptsResult.rows as EvaluationPrompt[]

      console.log(`Found ${prompts.length} prompts for evaluation`)
      
      // Debug: Log prompt configurations (without revealing full API keys)
      prompts.forEach(prompt => {
        console.log(`Prompt ${prompt.id} config:`, {
          name: prompt.name,
          provider: prompt.llm_provider,
          model: prompt.model,
          api_url: prompt.api_url,
          hasApiKey: !!prompt.api_key,
          apiKeyLength: prompt.api_key?.length || 0,
          apiKeyPrefix: prompt.api_key?.substring(0, 8) + '...' || 'none'
        })
      })

      // Get call logs based on filter criteria
      const callLogs = await this.getFilteredCallLogs(job)

      if (callLogs.length === 0) {
        console.warn(`No call logs found for job ${jobId}. Check filters and data availability.`)
        // Mark job as completed but with zero traces
        await query(
          `UPDATE pype_voice_evaluation_jobs 
           SET status = $1, completed_at = $2, total_traces = $3, completed_traces = $4
           WHERE id = $5`,
          ['completed', new Date().toISOString(), 0, 0, jobId]
        )
        return []
      }

      console.log(`Found ${callLogs.length} call logs to evaluate`)

      // Update job status to running
      await query(
        `UPDATE pype_voice_evaluation_jobs 
         SET status = $1, started_at = $2, total_traces = $3
         WHERE id = $4`,
        ['running', new Date().toISOString(), callLogs.length, jobId]
      )

      // Process each call log with each prompt
      const results: EvaluationResult[] = []
      let completedCount = 0
      let failedCount = 0

      for (const callLog of callLogs) {
        for (const prompt of prompts) {
          try {
            console.log(`Evaluating call log ${callLog.id} with prompt ${prompt.id}`)
            const result = await this.evaluateCallLog(callLog, prompt, jobId)
            results.push(result)
            completedCount++
            
            // Update progress
            if (completedCount % 5 === 0) { // Update every 5 evaluations
              await query(
                `UPDATE pype_voice_evaluation_jobs 
                 SET completed_traces = $1, failed_traces = $2
                 WHERE id = $3`,
                [completedCount, failedCount, jobId]
              )
            }
          } catch (error) {
            console.error('Error evaluating call log:', callLog.id, 'with prompt:', prompt.id, error)
            failedCount++
            await this.recordFailedEvaluation(jobId, prompt.id, callLog.id, error)
          }
        }
      }

      // Generate summaries
      await this.generateEvaluationSummaries(jobId, prompts)

      // Mark job as completed
      await query(
        `UPDATE pype_voice_evaluation_jobs 
         SET status = $1, completed_at = $2
         WHERE id = $3`,
        ['completed', new Date().toISOString(), jobId]
      )

      return results
    } catch (error) {
      console.error('Error processing evaluation job:', error)
      
      // Mark job as failed
      await query(
        `UPDATE pype_voice_evaluation_jobs 
         SET status = $1, error_message = $2
         WHERE id = $3`,
        ['failed', error instanceof Error ? error.message : 'Unknown error', jobId]
      )
      
      throw error
    }
  }

  private async processCallLogsWithTranscripts(callLogsData: any[]): Promise<CallLog[]> {
    console.log(`Processing ${callLogsData.length} call logs with transcript data`)
    const callLogsWithTranscripts: CallLog[] = []

    for (const callLog of callLogsData) {
      try {
        // Get transcript data from metrics logs table
        // Use the call log ID as session_id to find related transcript turns
        const transcriptResult = await query(
          `SELECT user_transcript, agent_response, turn_id, created_at 
           FROM pype_voice_metrics_logs 
           WHERE session_id = $1 
           ORDER BY unix_timestamp ASC`,
          [callLog.id]
        )

        const transcriptTurns = transcriptResult.rows

        // Check if we have meaningful transcript data
        const hasValidTranscript = transcriptTurns && transcriptTurns.length > 0 && 
          transcriptTurns.some((turn: any) => turn.user_transcript || turn.agent_response)

        if (hasValidTranscript) {
          // Format the transcript data to match existing CallLog interface
          const formattedTranscript = transcriptTurns
            .filter((turn: any) => turn.user_transcript || turn.agent_response)
            .map((turn: any) => ({
              turn_id: turn.turn_id,
              user_transcript: turn.user_transcript || '',
              agent_response: turn.agent_response || '',
              created_at: turn.created_at
            }))

          callLogsWithTranscripts.push({
            id: callLog.id,
            call_id: callLog.call_id,
            agent_id: callLog.agent_id,
            transcript_json: formattedTranscript, // Store the formatted transcript turns
            duration_seconds: callLog.duration_seconds,
            call_ended_reason: callLog.call_ended_reason,
            created_at: callLog.created_at
          })
          console.log(`✅ Processed transcript for call ${callLog.id}: ${formattedTranscript.length} turns`)
        } else {
          console.warn(`⚠️ No valid transcript found for call ${callLog.id}`)
        }
      } catch (error) {
        console.warn(`Error processing transcript for call ${callLog.id}:`, error)
        continue
      }
    }

    console.log(`Processed transcripts: ${callLogsWithTranscripts.length}/${callLogsData.length} call logs have valid transcripts`)
    return callLogsWithTranscripts
  }

  private async getFilteredCallLogs(job: EvaluationJob): Promise<CallLog[]> {
    console.log(`Getting filtered call logs for job:`, {
      jobId: job.id,
      agentId: job.agent_id,
      projectId: job.project_id,
      filterCriteria: job.filter_criteria,
      selectedTraces: job.selected_traces
    })

    // Check if specific traces are selected
    if (job.selected_traces && job.selected_traces.length > 0) {
      console.log(`🎯 Using SPECIFIC TRACE SELECTION: ${job.selected_traces.length} traces selected`)
      console.log(`Selected trace IDs:`, job.selected_traces)
      
      // For selected traces, we fetch call logs by their IDs directly
      const selectedResult = await query(
        `SELECT id, call_id, agent_id, call_ended_reason, created_at, duration_seconds 
         FROM pype_voice_call_logs 
         WHERE id = ANY($1::uuid[]) AND agent_id = $2`,
        [job.selected_traces, job.agent_id]
      )

      const selectedCallLogs = selectedResult.rows

      console.log(`✅ Found ${selectedCallLogs.length} call logs for selected traces`)
      
      if (selectedCallLogs.length === 0) {
        console.warn(`⚠️ No call logs found for selected traces. This might indicate:`)
        console.warn(`- Selected trace IDs don't exist: ${job.selected_traces}`)
        console.warn(`- Selected traces don't belong to agent ${job.agent_id}`)
        return []
      }

      // Process the selected call logs with transcript data
      return await this.processCallLogsWithTranscripts(selectedCallLogs)
    }

    // Continue with the existing "all traces" logic
    console.log(`📊 Using ALL TRACES mode with filters`)

    // First, let's check if there are any call logs at all for this agent
    const allLogsResult = await query(
      `SELECT id, agent_id, call_ended_reason, created_at, duration_seconds 
       FROM pype_voice_call_logs 
       WHERE agent_id = $1`,
      [job.agent_id]
    )

    const allCallLogs = allLogsResult.rows

    console.log(`Total call logs for agent ${job.agent_id}:`, allCallLogs.length)
    
    if (allCallLogs.length > 0) {
      console.log(`Sample call logs:`, allCallLogs.slice(0, 3).map((log: any) => ({
        id: log.id,
        agent_id: log.agent_id,
        call_ended_reason: log.call_ended_reason,
        created_at: log.created_at
      })))
    }

    // Verify agent belongs to project
    const agentResult = await query(
      'SELECT project_id FROM pype_voice_agents WHERE id = $1',
      [job.agent_id]
    )

    if (agentResult.rows.length === 0 || agentResult.rows[0].project_id !== job.project_id) {
      console.error(`Agent validation failed:`, { agent: agentResult.rows[0], expectedProjectId: job.project_id })
      return []
    }

    const agent = agentResult.rows[0]
    console.log(`Agent validation passed - agent belongs to project ${job.project_id}`)

    // Step 1: Build query conditions
    let queryConditions = ['agent_id = $1']
    let queryParams: any[] = [job.agent_id]
    let paramIndex = 2

    // Apply call status filter
    if (job.filter_criteria?.call_status && job.filter_criteria.call_status !== 'all') {
      queryConditions.push(`call_ended_reason = $${paramIndex}`)
      queryParams.push(job.filter_criteria.call_status)
      paramIndex++
      console.log(`Applied specific call_ended_reason filter: ${job.filter_criteria.call_status}`)
    } else {
      // Apply completion filter - be more flexible with call status (default behavior)
      queryConditions.push(`call_ended_reason = ANY($${paramIndex}::text[])`)
      queryParams.push(['completed', 'ended', 'finished', 'success'])
      paramIndex++
      console.log(`Applied default call_ended_reason filter: ['completed', 'ended', 'finished', 'success']`)
    }

    // Check what call logs exist before applying additional filters
    const beforeFiltersQuery = `
      SELECT id, call_ended_reason, duration_seconds, created_at 
      FROM pype_voice_call_logs 
      WHERE ${queryConditions.join(' AND ')}
      ORDER BY created_at DESC
    `
    const beforeFiltersResult = await query(beforeFiltersQuery, queryParams)
    const beforeFilters = beforeFiltersResult.rows
    
    console.log(`Call logs after completion filter: ${beforeFilters.length}`)
    
    if (beforeFilters.length > 0) {
      console.log(`Sample call logs before additional filters:`, beforeFilters.slice(0, 3).map((log: any) => ({
        id: log.id,
        call_ended_reason: log.call_ended_reason,
        duration_seconds: log.duration_seconds,
        created_at: log.created_at,
        age_hours: Math.round((Date.now() - new Date(log.created_at).getTime()) / (1000 * 60 * 60))
      })))
    }

    // Apply filters with better error handling and logging
    if (job.filter_criteria?.date_range && job.filter_criteria.date_range !== 'all') {
      const now = new Date()
      let startDate: Date | null = null
      let endDate: Date | null = null
      
      switch (job.filter_criteria.date_range) {
        case 'last_24_hours':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case 'last_7_days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'last_30_days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case 'last_90_days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        case 'custom':
          if (job.filter_criteria.start_date) {
            startDate = new Date(job.filter_criteria.start_date)
          }
          if (job.filter_criteria.end_date) {
            endDate = new Date(job.filter_criteria.end_date)
            // Add 1 day to include the entire end date
            endDate.setDate(endDate.getDate() + 1)
          }
          break
        default:
          console.warn(`Unknown date range: ${job.filter_criteria.date_range}, skipping date filter`)
      }
      
      if (startDate) {
        try {
          queryConditions.push(`created_at >= $${paramIndex}`)
          queryParams.push(startDate.toISOString())
          paramIndex++
          console.log(`Applied start date filter: >= ${startDate.toISOString()}`)
          console.log(`Date filter explanation: Looking for calls newer than ${job.filter_criteria.date_range}`)
        } catch (dateError) {
          console.warn(`Start date filter failed, skipping:`, dateError)
        }
      }

      if (endDate) {
        try {
          queryConditions.push(`created_at < $${paramIndex}`)
          queryParams.push(endDate.toISOString())
          paramIndex++
          console.log(`Applied end date filter: < ${endDate.toISOString()}`)
        } catch (dateError) {
          console.warn(`End date filter failed, skipping:`, dateError)
        }
      }
    }

    if (job.filter_criteria?.min_duration && job.filter_criteria.min_duration > 0) {
      try {
        queryConditions.push(`duration_seconds >= $${paramIndex}`)
        queryParams.push(job.filter_criteria.min_duration)
        paramIndex++
        console.log(`Applied duration filter: >= ${job.filter_criteria.min_duration} seconds`)
        console.log(`Duration filter explanation: Only calls longer than ${job.filter_criteria.min_duration} seconds`)
      } catch (durationError) {
        console.warn(`Duration filter failed, skipping:`, durationError)
      }
    } else {
      console.log(`No duration filter applied - including calls of any length`)
    }

    // Execute the call logs query
    const finalQuery = `
      SELECT id, call_id, agent_id, call_ended_reason, created_at, duration_seconds 
      FROM pype_voice_call_logs 
      WHERE ${queryConditions.join(' AND ')}
      ORDER BY created_at DESC
    `
    const callLogsResult = await query(finalQuery, queryParams)
    const callLogsData = callLogsResult.rows
    
    console.log(`Raw query returned: ${callLogsData.length} call logs`)

    // If no results, provide helpful debugging information
    if (!callLogsData || callLogsData.length === 0) {
      console.log(`⚠️  NO CALL LOGS FOUND AFTER FILTERS`)
      console.log(`Debugging information:`)
      console.log(`- Agent ID: ${job.agent_id}`)
      console.log(`- Project ID: ${job.project_id}`)
      console.log(`- Filter criteria:`, job.filter_criteria)
      
      if (beforeFilters && beforeFilters.length > 0) {
        console.log(`- Call logs exist (${beforeFilters.length}) but were filtered out by:`)
        if (job.filter_criteria?.date_range) {
          const oldestIncluded = beforeFilters.find((log: any) => new Date(log.created_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          console.log(`  - Date filter: ${job.filter_criteria.date_range} (${oldestIncluded ? 'some calls match' : 'no calls match date range'})`)
        }
        if (job.filter_criteria?.min_duration) {
          const longEnough = beforeFilters.filter((log: any) => (log.duration_seconds || 0) >= (job.filter_criteria?.min_duration || 0))
          console.log(`  - Duration filter: >= ${job.filter_criteria.min_duration}s (${longEnough.length} calls match)`)
        }
        console.log(`💡 Consider relaxing filters or checking if calls exist in the expected time range`)
      } else {
        console.log(`- No completed calls found for this agent`)
        console.log(`💡 Check if agent has any completed calls or if call_ended_reason values are different`)
      }
      
      return []
    }

    // Step 2: Process call logs with transcript data using the shared method
    const callLogsWithTranscripts = await this.processCallLogsWithTranscripts(callLogsData)

    console.log(`After transcript validation: ${callLogsWithTranscripts.length} valid call logs`)
    console.log(`Final filtered call logs count: ${callLogsWithTranscripts.length}`)
    
    if (callLogsWithTranscripts.length > 0) {
      console.log(`Sample filtered logs:`, callLogsWithTranscripts.slice(0, 2).map((log: any) => ({
        id: log.id,
        call_id: log.call_id,
        agent_id: log.agent_id,
        has_transcript: Array.isArray(log.transcript_json) && log.transcript_json.length > 0,
        transcript_turns: Array.isArray(log.transcript_json) ? log.transcript_json.length : 0,
        duration_seconds: log.duration_seconds,
        created_at: log.created_at
      })))
    } else {
      console.log(`No call logs found for job ${job.id}. Check filters and data availability.`)
    }

    return callLogsWithTranscripts
  }

  private async evaluateCallLog(callLog: any, prompt: any, jobId: string) {
    const startTime = Date.now()

    try {
      // Extract transcript from call log
      const transcript = this.extractTranscript(callLog)
      
      console.log(`🔍 [EVALUATION DEBUG] Processing call log ${callLog.id}:`)
      console.log(`📄 [TRANSCRIPT] Length: ${transcript.length}`)
      console.log(`📄 [TRANSCRIPT] Preview: ${transcript.substring(0, 200)}${transcript.length > 200 ? '...' : ''}`)
      console.log(`📝 [PROMPT] Template length: ${prompt.prompt_template?.length || 0}`)
      console.log(`📝 [PROMPT] Template preview: ${prompt.prompt_template?.substring(0, 100)}${(prompt.prompt_template?.length || 0) > 100 ? '...' : ''}`)
      
      // Prepare the evaluation prompt
      const evaluationPrompt = this.buildEvaluationPrompt(prompt.prompt_template, {
        transcript,
        callId: callLog.call_id,
        duration: callLog.duration_seconds,
        customerNumber: callLog.customer_number,
        callMetadata: callLog.metadata
      })

      console.log(`🔧 [PROMPT BUILD] Final prompt length: ${evaluationPrompt.length}`)
      console.log(`🔧 [PROMPT BUILD] Final prompt preview: ${evaluationPrompt.substring(0, 300)}${evaluationPrompt.length > 300 ? '...' : ''}`)
      console.log(`🔧 [PROMPT BUILD] Contains transcript? ${evaluationPrompt.includes(transcript.substring(0, 50))}`)
      
      // Create LLM client for this prompt's provider configuration
      console.log(`Creating LLM client for prompt ${prompt.id}, provider: ${prompt.llm_provider}, model: ${prompt.model}`)
      const llmClient = this.createLLMClient(prompt)

      const model = prompt.model || 'gpt-4o-mini'
      const temperature = prompt.temperature || 0.0
      const max_tokens = prompt.max_tokens || 1000

      console.log(`Making API call with:`, {
        model,
        temperature,
        max_tokens,
        provider: prompt.llm_provider
      })

      // Call LLM API (OpenAI-compatible)
      let response
      if (prompt.llm_provider === 'gemini') {
        // Handle Gemini API calls differently since it's not truly OpenAI compatible
        response = await this.callGeminiAPI(llmClient, {
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert evaluator of customer service conversations. Provide objective, consistent evaluations based on the given criteria.'
            },
            {
              role: 'user',
              content: evaluationPrompt
            }
          ],
          temperature,
          max_tokens
        })
      } else {
        // Standard OpenAI-compatible call
        console.log(`🤖 [LLM CALL] Making standard OpenAI-compatible call`)
        console.log(`🤖 [LLM CALL] System message: You are an expert evaluator of customer service conversations...`)
        console.log(`🤖 [LLM CALL] User message length: ${evaluationPrompt.length}`)
        console.log(`🤖 [LLM CALL] User message preview: ${evaluationPrompt.substring(0, 200)}...`)
        
        response = await llmClient.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert evaluator of customer service conversations. Provide objective, consistent evaluations based on the given criteria.'
            },
            {
              role: 'user',
              content: evaluationPrompt
            }
          ],
          temperature,
          max_tokens
        })
      }

      const llmResponse = response.choices[0]?.message?.content || ''
      const tokensUsed = response.usage?.total_tokens || 0
      const costUsd = this.calculateCost(response.usage, prompt.model)

      console.log(`🤖 [LLM RESPONSE] Response length: ${llmResponse.length}`)
      console.log(`🤖 [LLM RESPONSE] Response preview: ${llmResponse.substring(0, 300)}...`)
      console.log(`🤖 [LLM RESPONSE] Tokens used: ${tokensUsed}`)
      
      // Check if response looks like it's ready vs actual evaluation
      if (llmResponse.toLowerCase().includes('ready to evaluate') && !llmResponse.includes('score')) {
        console.warn(`⚠️ [LLM RESPONSE] WARNING: LLM response appears to be a readiness statement rather than evaluation`)
        console.log(`🔍 [LLM RESPONSE] Full response: ${llmResponse}`)
      }

      // Parse the response to extract scores
      const parsedScores = this.parseEvaluationResponse(llmResponse, prompt)
      const overallScore = this.extractOverallScore(parsedScores, prompt)
      const reasoning = this.extractReasoning(llmResponse)
      
      console.log(`📊 [SCORING] Parsed scores:`, parsedScores)
      console.log(`📊 [SCORING] Overall score: ${overallScore}`)
      console.log(`📊 [SCORING] Reasoning length: ${reasoning?.length || 0}`)

      // Save the result - using correct schema column names
      const insertResult = await query(
        `INSERT INTO pype_voice_evaluation_results 
         (job_id, prompt_id, trace_id, call_id, agent_id, evaluation_score, evaluation_reasoning, 
          raw_llm_response, execution_time_ms, llm_cost_usd, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         RETURNING *`,
        [
          jobId,
          prompt.id,
          callLog.call_id || callLog.id, // Use call_id from call log as trace_id
          callLog.call_id, // For easier querying
          callLog.agent_id,
          JSON.stringify({
            overall_score: overallScore,
            parsed_scores: parsedScores,
            evaluation_type: prompt.evaluation_type
          }), // Store as jsonb
          reasoning,
          llmResponse,
          Date.now() - startTime,
          costUsd,
          'completed'
        ]
      )

      if (insertResult.rows.length === 0) {
        throw new Error(`Failed to save evaluation result`)
      }

      return insertResult.rows[0]
    } catch (error) {
      console.error(`Error evaluating call log ${callLog.id} with prompt ${prompt.id}:`, {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        prompt: {
          id: prompt.id,
          provider: prompt.llm_provider,
          model: prompt.model
        },
        callLog: {
          id: callLog.id,
          call_id: callLog.call_id
        }
      })
      
      await this.recordFailedEvaluation(jobId, prompt.id, callLog.id, error)
      throw error
    }
  }

  private extractTranscript(callLog: any): string {
    console.log(`🔍 [TRANSCRIPT EXTRACT] Processing call log ${callLog.id}`)
    console.log(`📊 [TRANSCRIPT EXTRACT] transcript_json type: ${typeof callLog.transcript_json}`)
    console.log(`📊 [TRANSCRIPT EXTRACT] transcript_json is array: ${Array.isArray(callLog.transcript_json)}`)
    console.log(`📊 [TRANSCRIPT EXTRACT] transcript_json length: ${Array.isArray(callLog.transcript_json) ? callLog.transcript_json.length : 'N/A'}`)
    
    if (!callLog.transcript_json) {
      console.warn(`❌ [TRANSCRIPT EXTRACT] No transcript_json found for call log ${callLog.id}`)
      return 'No transcript available'
    }
    
    try {
      if (Array.isArray(callLog.transcript_json)) {
        console.log(`📋 [TRANSCRIPT EXTRACT] Processing array format, ${callLog.transcript_json.length} items`)
        console.log(`📋 [TRANSCRIPT EXTRACT] Sample item structure:`, JSON.stringify(callLog.transcript_json[0], null, 2))
        
        const extractedLines = callLog.transcript_json
          .flatMap((item: any) => {
            const messages: string[] = []
            
            // Handle role-based format (role + content)
            if (item.role && item.content) {
              const role = item.role === 'assistant' ? 'AGENT' : 'USER'
              const text = Array.isArray(item.content) ? item.content.join(' ') : item.content
              messages.push(`${role}: ${text}`)
              console.log(`📝 [TRANSCRIPT EXTRACT] Extracted role-based: ${role}: ${text.substring(0, 50)}...`)
            }
            
            // Handle turn-based format (user_transcript + agent_response)
            if (item.user_transcript && item.user_transcript.trim()) {
              messages.push(`USER: ${item.user_transcript}`)
              console.log(`📝 [TRANSCRIPT EXTRACT] Extracted user: ${item.user_transcript.substring(0, 50)}...`)
            }
            if (item.agent_response && item.agent_response.trim()) {
              messages.push(`AGENT: ${item.agent_response}`)
              console.log(`📝 [TRANSCRIPT EXTRACT] Extracted agent: ${item.agent_response.substring(0, 50)}...`)
            }
            
            return messages
          })
          
        const finalTranscript = extractedLines.join('\n')
        console.log(`✅ [TRANSCRIPT EXTRACT] Final transcript length: ${finalTranscript.length}`)
        console.log(`✅ [TRANSCRIPT EXTRACT] Final transcript preview: ${finalTranscript.substring(0, 200)}...`)
        return finalTranscript
      } else if (typeof callLog.transcript_json === 'object') {
        // Handle object format
        console.log(`📋 [TRANSCRIPT EXTRACT] Processing object format`)
        const objectString = JSON.stringify(callLog.transcript_json, null, 2)
        console.log(`✅ [TRANSCRIPT EXTRACT] Object transcript length: ${objectString.length}`)
        return objectString
      }
      
      const stringTranscript = String(callLog.transcript_json)
      console.log(`✅ [TRANSCRIPT EXTRACT] String transcript length: ${stringTranscript.length}`)
      return stringTranscript
    } catch (error) {
      console.error(`💥 [TRANSCRIPT EXTRACT] Error extracting transcript for call log ${callLog.id}:`, error)
      return 'Error extracting transcript'
    }
  }

  private buildEvaluationPrompt(template: string, variables: any): string {
    console.log(`🔧 [PROMPT BUILD] Building evaluation prompt`)
    console.log(`🔧 [PROMPT BUILD] Template length: ${template?.length || 0}`)
    console.log(`🔧 [PROMPT BUILD] Variables:`, Object.keys(variables))
    console.log(`🔧 [PROMPT BUILD] Transcript length in variables: ${variables.transcript?.length || 0}`)
    
    let prompt = template || ''
    
    // Check if template contains the transcript variable
    if (!template.includes('{{transcript}}')) {
      console.error(`❌ [PROMPT BUILD] CRITICAL ERROR: Template does not contain {{transcript}} variable!`)
      console.log(`🔧 [PROMPT BUILD] Template content: ${template.substring(0, 200)}...`)
      
      // Instead of throwing an error, let's try to fix it by appending the transcript
      console.warn(`🔧 [PROMPT BUILD] ATTEMPTING AUTO-FIX: Adding transcript to the end of template`)
      
      const transcriptSection = `\n\n**Conversation Transcript:**\n{{transcript}}\n\nPlease evaluate the above conversation and provide your analysis.`
      prompt = template + transcriptSection
      
      console.log(`🔧 [PROMPT BUILD] Auto-fixed template now includes transcript variable`)
    }
    
    // Replace variables in the template
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g')
      const valueStr = String(value || '')
      const replacements = prompt.match(regex)?.length || 0
      
      console.log(`🔧 [PROMPT BUILD] Replacing {{${key}}} (${replacements} occurrences) with value of length ${valueStr.length}`)
      if (key === 'transcript' && valueStr.length > 0) {
        console.log(`🔧 [PROMPT BUILD] Transcript preview: ${valueStr.substring(0, 100)}...`)
      }
      
      prompt = prompt.replace(regex, valueStr)
    })

    console.log(`🔧 [PROMPT BUILD] Final prompt length: ${prompt.length}`)
    
    // Check if transcript was actually included
    const transcriptInFinal = variables.transcript && prompt.includes(variables.transcript.substring(0, 50))
    console.log(`🔧 [PROMPT BUILD] Transcript appears in final prompt: ${transcriptInFinal}`)
    
    if (!transcriptInFinal && variables.transcript) {
      console.warn(`⚠️ [PROMPT BUILD] WARNING: Transcript not found in final prompt! Check template variables.`)
      console.log(`🔧 [PROMPT BUILD] Template contains {{transcript}}: ${template.includes('{{transcript}}')}`)
      console.log(`🔧 [PROMPT BUILD] Template snippet: ${template.substring(0, 200)}...`)
    } else if (transcriptInFinal) {
      console.log(`✅ [PROMPT BUILD] SUCCESS: Transcript successfully included in final prompt`)
    }

    // Ensure the final prompt actually contains meaningful transcript content
    if (variables.transcript && variables.transcript !== 'No transcript available' && variables.transcript !== 'Error extracting transcript') {
      if (!prompt.includes('USER:') && !prompt.includes('AGENT:')) {
        console.warn(`⚠️ [PROMPT BUILD] WARNING: Final prompt may not contain actual conversation content`)
      } else {
        console.log(`✅ [PROMPT BUILD] SUCCESS: Final prompt contains conversation content (USER/AGENT detected)`)
      }
    }

    return prompt
  }

  private parseEvaluationResponse(response: string, prompt: any): any {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/\{[\s\S]*\}/)
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0])
      }

      // Fallback: extract score patterns
      const scorePattern = /score[:\s]*(\d+(?:\.\d+)?)/i
      const scoreMatch = response.match(scorePattern)
      
      if (scoreMatch) {
        return { score: parseFloat(scoreMatch[1]) }
      }

      return { raw_response: response }
    } catch (error) {
      console.error('Error parsing evaluation response:', error)
      return { raw_response: response, parse_error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private extractOverallScore(parsedScores: any, prompt: any): number {
    if (parsedScores.score !== undefined) {
      return parsedScores.score
    }
    
    if (parsedScores.overall_score !== undefined) {
      return parsedScores.overall_score
    }

    // Try to extract from other common score fields
    const scoreFields = ['quality_score', 'rating', 'evaluation_score']
    for (const field of scoreFields) {
      if (parsedScores[field] !== undefined) {
        return parsedScores[field]
      }
    }

    // Default fallback
    return 0
  }

  private extractReasoning(response: string): string {
    // Try to extract reasoning from common patterns
    const reasoningPatterns = [
      /reasoning[:\s]*(.*?)(?:\n|$)/i,
      /explanation[:\s]*(.*?)(?:\n|$)/i,
      /analysis[:\s]*(.*?)(?:\n|$)/i
    ]

    for (const pattern of reasoningPatterns) {
      const match = response.match(pattern)
      if (match && match[1]) {
        return match[1].trim()
      }
    }

    // Fallback to first sentence or paragraph
    const sentences = response.split(/[.!?]\s+/)
    return sentences[0] || response.substring(0, 200) + '...'
  }

  private calculateCost(usage: any, model: string): number {
    if (!usage) return 0

    // Rough cost calculation - adjust based on actual OpenAI pricing
    const costPer1kTokens = {
      'gpt-4o': 0.03,
      'gpt-4o-mini': 0.0015,
      'gpt-3.5-turbo': 0.002
    }

    const rate = costPer1kTokens[model as keyof typeof costPer1kTokens] || 0.002
    return (usage.total_tokens / 1000) * rate
  }

  private async recordFailedEvaluation(jobId: string, promptId: string, callLogId: string, error: any) {
    await query(
      `INSERT INTO pype_voice_evaluation_results 
       (job_id, prompt_id, trace_id, call_id, evaluation_score, status, error_message, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        jobId,
        promptId,
        callLogId, // Use as trace_id
        callLogId, // Also store as call_id for easier querying
        JSON.stringify({}), // Empty jsonb object for failed evaluations
        'failed',
        error instanceof Error ? error.message : 'Unknown error',
        new Date().toISOString()
      ]
    )
  }

  private async generateEvaluationSummaries(jobId: string, prompts: any[]) {
    for (const prompt of prompts) {
      const resultsQuery = await query(
        `SELECT evaluation_score FROM pype_voice_evaluation_results 
         WHERE job_id = $1 AND prompt_id = $2 AND status = $3`,
        [jobId, prompt.id, 'completed']
      )
      const results = resultsQuery.rows

      if (!results || results.length === 0) continue

      // Extract overall_score from the evaluation_score jsonb field
      const scores = results
        .map((r: any) => r.evaluation_score?.overall_score)
        .filter((s: any) => s !== null && s !== undefined)
      
      if (scores.length === 0) continue

      const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / scores.length
      const minScore = Math.min(...scores)
      const maxScore = Math.max(...scores)

      // Calculate score distribution
      const distribution: { [key: string]: number } = {}
      scores.forEach((score: number) => {
        const bucket = Math.floor(score).toString()
        distribution[bucket] = (distribution[bucket] || 0) + 1
      })

      // Calculate pass rate (assuming > 3.0 is passing)
      const passingScores = scores.filter((s: number) => s > 3.0)
      const passRate = passingScores.length / scores.length

      await query(
        `INSERT INTO pype_voice_evaluation_summaries 
         (job_id, evaluation_type, avg_score, min_score, max_score, total_evaluations, score_distribution, pass_rate) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          jobId,
          prompt.evaluation_type,
          avgScore,
          minScore,
          maxScore,
          results.length,
          JSON.stringify(distribution),
          passRate
        ]
      )
      // TODO: Extract top_issues from parsed_scores
      // TODO: Generate recommendations based on patterns
    }
  }
}

// Example usage in an API endpoint or background job
export async function processEvaluationJobById(jobId: string) {
  const processor = new EvaluationProcessor()
  return await processor.processEvaluationJob(jobId)
}