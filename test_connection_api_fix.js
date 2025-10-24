// Test script for the updated test-connection API
const testConnectionAPI = async () => {
  console.log('🧪 Testing Updated Test-Connection API')
  console.log('=' .repeat(50))

  const baseUrl = 'http://localhost:3000'
  const endpoint = '/api/evaluations/test-connection'

  // Test cases for different providers
  const testCases = [
    {
      name: 'OpenAI Connection Test',
      data: {
        llm_provider: 'openai',
        model: 'gpt-3.5-turbo',
        api_key: 'sk-test-key-here',
        api_url: 'https://api.openai.com/v1'
      }
    },
    {
      name: 'Groq Connection Test',
      data: {
        llm_provider: 'groq',
        model: 'mixtral-8x7b-32768',
        api_key: 'gsk_test-key-here',
        api_url: 'https://api.groq.com/openai/v1'
      }
    },
    {
      name: 'Gemini Connection Test (Default URL)',
      data: {
        llm_provider: 'gemini',
        model: 'gemini-1.5-flash',
        api_key: 'AIza-test-key-here'
        // No api_url - should use default
      }
    },
    {
      name: 'Gemini Connection Test (Custom URL)',
      data: {
        llm_provider: 'gemini',
        model: 'gemini-1.5-pro',
        api_key: 'AIza-test-key-here',
        api_url: 'https://generativelanguage.googleapis.com/v1beta/'
      }
    }
  ]

  console.log('📋 Test Cases:')
  testCases.forEach((test, index) => {
    console.log(`${index + 1}. ${test.name}`)
    console.log(`   Provider: ${test.data.llm_provider}`)
    console.log(`   Model: ${test.data.model}`)
    console.log(`   API URL: ${test.data.api_url || 'default'}`)
    console.log('')
  })

  console.log('🔧 Expected Behavior Changes:')
  console.log('• OpenAI: Uses OpenAI client interface (unchanged)')
  console.log('• Groq: Uses OpenAI client interface (unchanged)')
  console.log('• Gemini: Uses native Gemini API with fetch() calls')
  console.log('• Gemini: No longer requires custom API URL')
  console.log('• Gemini: Proper error handling for 403/404/429 errors')

  console.log('\n📊 API Request Format for Gemini:')
  console.log('URL: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=API_KEY')
  console.log('Method: POST')
  console.log('Headers: { "Content-Type": "application/json" }')
  console.log('Body:')
  console.log(JSON.stringify({
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
  }, null, 2))

  console.log('\n📈 Success Response Format:')
  console.log(JSON.stringify({
    success: true,
    message: 'Gemini API connection test successful',
    response: {
      model: 'gemini-1.5-flash',
      usage: {
        prompt_tokens: 15,
        completion_tokens: 8,
        total_tokens: 23
      },
      provider: 'gemini',
      content_preview: 'Hello! Nice to meet you. How can I help you today?'
    }
  }, null, 2))

  console.log('\n❌ Error Response Examples:')
  
  console.log('\nInvalid API Key (403):')
  console.log(JSON.stringify({
    error: 'Invalid Gemini API key - authentication failed',
    details: {
      status: 401,
      provider: 'gemini',
      model: 'gemini-1.5-flash',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/'
    }
  }, null, 2))

  console.log('\nInvalid Model (404):')
  console.log(JSON.stringify({
    error: 'Gemini model not found - check your model name (e.g., gemini-1.5-flash, gemini-1.5-pro)',
    details: {
      status: 404,
      provider: 'gemini',
      model: 'invalid-model',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/'
    }
  }, null, 2))

  console.log('\n🚀 Testing Instructions:')
  console.log('1. Start the development server: npm run dev')
  console.log('2. Navigate to the evaluations page')
  console.log('3. Create a new prompt with Gemini provider')
  console.log('4. Click "Test Connection" button')
  console.log('5. Verify that it no longer shows 404 errors')
  console.log('6. Test with valid Gemini API key to confirm functionality')

  console.log('\n✅ Fix Summary:')
  console.log('• Removed requirement for custom API URL for Gemini')
  console.log('• Implemented native Gemini API integration in test-connection')
  console.log('• Added proper Gemini API key validation (starts with "AIza")')
  console.log('• Enhanced error handling for Gemini-specific error codes')
  console.log('• Maintained compatibility with OpenAI and Groq providers')
}

// Run the test explanation
testConnectionAPI().catch(console.error)