// app/api/evaluations/test-connection/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import OpenAI from 'openai'

// Handle Gemini API test using native API format
async function testGeminiAPI(apiKey: string, model: string, baseURL: string) {
  try {
    // Prepare Gemini API request
    const geminiRequestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello! This is a test message to verify the API connection.' }]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 10
      }
    }

    // Make direct HTTP request to Gemini API
    const response = await fetch(`${baseURL}models/${model}:generateContent?key=${apiKey}`, {
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
    
    // Validate response format
    if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
      const candidate = geminiResponse.candidates[0]
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return {
          success: true,
          response: {
            model: model,
            usage: {
              prompt_tokens: geminiResponse.usageMetadata?.promptTokenCount || 0,
              completion_tokens: geminiResponse.usageMetadata?.candidatesTokenCount || 0,
              total_tokens: geminiResponse.usageMetadata?.totalTokenCount || 0
            },
            content: candidate.content.parts[0].text
          }
        }
      }
    }
    
    throw new Error('Unexpected Gemini API response format')
    
  } catch (error) {
    console.error('Gemini API test failed:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { llm_provider, model, api_key, api_url } = body

    if (!llm_provider || !model || !api_key) {
      return NextResponse.json(
        { error: 'Missing required fields: llm_provider, model, api_key' },
        { status: 400 }
      )
    }

    // Validate API key format
    if (llm_provider === 'openai' && !api_key.startsWith('sk-')) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key format. Keys should start with "sk-"' },
        { status: 400 }
      )
    }

    if (llm_provider === 'groq' && !api_key.startsWith('gsk_')) {
      return NextResponse.json(
        { error: 'Invalid Groq API key format. Keys should start with "gsk_"' },
        { status: 400 }
      )
    }

    if (llm_provider === 'gemini' && !api_key.startsWith('AIza')) {
      return NextResponse.json(
        { error: 'Invalid Gemini API key format. Keys should start with "AIza"' },
        { status: 400 }
      )
    }

    // Create client configuration
    const config: any = { apiKey: api_key }

    // Set base URL based on provider
    if (llm_provider === 'openai') {
      config.baseURL = api_url || 'https://api.openai.com/v1'
    } else if (llm_provider === 'groq') {
      config.baseURL = api_url || 'https://api.groq.com/openai/v1'
    } else if (llm_provider === 'gemini') {
      // Gemini uses native API, not OpenAI-compatible interface
      config.baseURL = api_url || 'https://generativelanguage.googleapis.com/v1beta/'
    } else {
      // Custom provider
      if (!api_url) {
        return NextResponse.json(
          { error: `Custom provider ${llm_provider} requires an API URL` },
          { status: 400 }
        )
      }
      config.baseURL = api_url
    }

    // Create OpenAI client
    const client = new OpenAI(config)

    try {
      let testResult

      if (llm_provider === 'gemini') {
        // Use native Gemini API testing
        testResult = await testGeminiAPI(api_key, model, config.baseURL)
        
        return NextResponse.json({
          success: true,
          message: 'Gemini API connection test successful',
          response: {
            model: testResult.response.model,
            usage: testResult.response.usage,
            provider: llm_provider,
            content_preview: testResult.response.content.substring(0, 100)
          }
        })
      } else {
        // Use OpenAI client for OpenAI and Groq
        const response = await client.chat.completions.create({
          model: model,
          messages: [
            {
              role: 'user',
              content: 'Hello! This is a test message to verify the API connection.'
            }
          ],
          max_tokens: 10,
          temperature: 0
        })

        // If we get here, the connection worked
        return NextResponse.json({
          success: true,
          message: 'Connection test successful',
          response: {
            model: response.model,
            usage: response.usage,
            provider: llm_provider
          }
        })
      }

    } catch (apiError: any) {
      console.error('API test failed:', apiError)
      
      let errorMessage = 'API connection failed'
      let status = 400
      
      if (apiError.message) {
        errorMessage = apiError.message
      }

      // Handle specific error types for different providers
      if (llm_provider === 'gemini') {
        if (apiError.message && apiError.message.includes('403')) {
          errorMessage = 'Invalid Gemini API key - authentication failed'
          status = 401
        } else if (apiError.message && apiError.message.includes('404')) {
          errorMessage = 'Gemini model not found - check your model name (e.g., gemini-1.5-flash, gemini-1.5-pro)'
          status = 404
        } else if (apiError.message && apiError.message.includes('429')) {
          errorMessage = 'Gemini API rate limit exceeded - your API key is working but you\'ve hit usage limits'
          status = 429
        }
      } else {
        // Handle OpenAI/Groq errors
        if (apiError.status === 401) {
          errorMessage = 'Invalid API key - authentication failed'
          status = 401
        } else if (apiError.status === 404) {
          errorMessage = 'API endpoint not found - check your API URL or model name'
          status = 404
        } else if (apiError.status === 429) {
          errorMessage = 'Rate limit exceeded - your API key is working but you\'ve hit usage limits'
          status = 429
        }
      }

      return NextResponse.json(
        { 
          error: errorMessage,
          details: {
            status: apiError.status || status,
            provider: llm_provider,
            model: model,
            baseURL: config.baseURL
          }
        },
        { status }
      )
    }

  } catch (error) {
    console.error('Test connection error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}