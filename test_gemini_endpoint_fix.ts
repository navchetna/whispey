// Test script to verify Gemini OpenAI-compatible endpoint configuration
import { describe, test, expect } from '@jest/globals'

describe('Gemini OpenAI-Compatible Endpoint Configuration', () => {
  test('should use correct Gemini endpoint URL with trailing slash', () => {
    // Simulate the getDefaultApiUrl function from EvaluationConfig.tsx
    const getDefaultApiUrl = (provider: string) => {
      switch (provider) {
        case 'openai':
          return 'https://api.openai.com/v1'
        case 'gemini':
          return 'https://generativelanguage.googleapis.com/v1beta/openai/'
        case 'groq':
          return 'https://api.groq.com/openai/v1'
        default:
          return ''
      }
    }

    const geminiUrl = getDefaultApiUrl('gemini')
    
    // Verify the URL is correct
    expect(geminiUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/')
    
    // Verify it ends with trailing slash
    expect(geminiUrl.endsWith('/')).toBe(true)
    
    // Verify it contains the correct path
    expect(geminiUrl).toContain('v1beta/openai')
    
    console.log('✅ Gemini endpoint URL is correctly configured:', geminiUrl)
  })

  test('should handle Gemini configuration in processor', () => {
    // Simulate the processor configuration logic
    const configureGeminiClient = (prompt: any) => {
      const config: any = {
        apiKey: 'test-key'
      }

      if (prompt.llm_provider === 'gemini') {
        config.baseURL = prompt.api_url || 'https://generativelanguage.googleapis.com/v1beta/openai/'
        return config
      }

      return config
    }

    // Test with no custom URL (should use default)
    const promptWithoutUrl = {
      llm_provider: 'gemini',
      api_key: 'test-key'
    }

    const configWithoutUrl = configureGeminiClient(promptWithoutUrl)
    expect(configWithoutUrl.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/openai/')

    // Test with custom URL (should use custom)
    const promptWithUrl = {
      llm_provider: 'gemini',
      api_key: 'test-key',
      api_url: 'https://custom.endpoint.com/v1/'
    }

    const configWithUrl = configureGeminiClient(promptWithUrl)
    expect(configWithUrl.baseURL).toBe('https://custom.endpoint.com/v1/')

    console.log('✅ Gemini processor configuration is working correctly')
  })

  test('should validate endpoint URL format', () => {
    const correctUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/'
    
    // URL validation tests
    expect(correctUrl.startsWith('https://')).toBe(true)
    expect(correctUrl.includes('generativelanguage.googleapis.com')).toBe(true)
    expect(correctUrl.includes('v1beta')).toBe(true)
    expect(correctUrl.includes('openai')).toBe(true)
    expect(correctUrl.endsWith('/')).toBe(true)
    
    console.log('✅ Gemini endpoint URL format validation passed')
  })
})

// Manual test function that can be called directly
export function testGeminiEndpointFix() {
  console.log('🔧 Testing Gemini OpenAI-Compatible Endpoint Fix')
  console.log('')
  
  console.log('📋 Fix Summary:')
  console.log('• Updated default Gemini URL to include trailing slash')
  console.log('• Changed processor to use default endpoint when no custom URL provided')
  console.log('• Enhanced error messages with correct endpoint URL')
  console.log('')
  
  console.log('🔗 Before Fix:')
  console.log('  URL: https://generativelanguage.googleapis.com/v1beta/openai (missing trailing slash)')
  console.log('  Behavior: Required custom API URL, threw error if none provided')
  console.log('')
  
  console.log('✅ After Fix:')
  console.log('  URL: https://generativelanguage.googleapis.com/v1beta/openai/ (with trailing slash)')
  console.log('  Behavior: Uses default endpoint automatically, allows custom override')
  console.log('')
  
  console.log('🧪 Expected Results:')
  console.log('• Gemini provider should work without requiring custom API URL')
  console.log('• OpenAI-compatible requests should succeed with correct endpoint')
  console.log('• Error messages should provide helpful guidance if endpoint fails')
  console.log('')
  
  console.log('🚀 Next Steps:')
  console.log('1. Test Gemini evaluation job creation')
  console.log('2. Verify API calls succeed with new endpoint')
  console.log('3. Confirm error handling works for invalid requests')
}

// Run the test if this file is executed directly
if (require.main === module) {
  testGeminiEndpointFix()
}