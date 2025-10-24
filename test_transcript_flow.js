// Test script to verify transcript flow in evaluation prompts
console.log('🔍 Testing Transcript Flow in Evaluation Prompts')
console.log('=' .repeat(60))

// Test the evaluation prompt building logic
function buildEvaluationPrompt(template, variables) {
  let prompt = template
  
  // Replace variables in the template
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{${key}}}`, 'g')
    prompt = prompt.replace(regex, String(value))
  })

  return prompt
}

// Test the transcript extraction logic
function extractTranscript(callLog) {
  if (!callLog.transcript_json) {
    console.warn(`No transcript_json found for call log ${callLog.id}`)
    return 'No transcript available'
  }
  
  try {
    if (Array.isArray(callLog.transcript_json)) {
      return callLog.transcript_json
        .flatMap((item) => {
          const messages = []
          
          // Handle role-based format (role + content)
          if (item.role && item.content) {
            const role = item.role === 'assistant' ? 'AGENT' : 'USER'
            const text = Array.isArray(item.content) ? item.content.join(' ') : item.content
            messages.push(`${role}: ${text}`)
          }
          
          // Handle turn-based format (user_transcript + agent_response)
          if (item.user_transcript && item.user_transcript.trim()) {
            messages.push(`USER: ${item.user_transcript}`)
          }
          if (item.agent_response && item.agent_response.trim()) {
            messages.push(`AGENT: ${item.agent_response}`)
          }
          
          return messages
        })
        .join('\n')
    } else if (typeof callLog.transcript_json === 'object') {
      return JSON.stringify(callLog.transcript_json, null, 2)
    }
    
    return String(callLog.transcript_json)
  } catch (error) {
    console.error(`Error extracting transcript for call log ${callLog.id}:`, error)
    return 'Error extracting transcript'
  }
}

// Sample test data
const sampleCallLog = {
  id: 'test-call-123',
  call_id: 'call-456',
  transcript_json: [
    {
      user_transcript: 'नमस्कार, मुझे अपने आधार कार्ड के बारे में जानकारी चाहिए',
      agent_response: 'नमस्कार! मैं आपकी आधार कार्ड संबंधी समस्या में आपकी मदद कर सकती हूं। कृपया बताएं कि आपको क्या जानकारी चाहिए?'
    },
    {
      user_transcript: 'मेरा आधार कार्ड गुम हो गया है',
      agent_response: 'मैं समझ गई। आधार कार्ड खो जाने पर आप डुप्लिकेट आधार कार्ड के लिए आवेदन कर सकते हैं। इसके लिए आपको निकटतम आधार सेवा केंद्र जाना होगा।'
    }
  ]
}

// Sample evaluation prompt template
const sampleTemplate = `
आप एक विशेषज्ञ कॉल गुणवत्ता मूल्यांकनकर्ता हैं। निम्नलिखित ग्राहक सेवा बातचीत का मूल्यांकन करें।

**बातचीत का ट्रांसक्रिप्ट:**
{{transcript}}

**कॉल विवरण:**
- कॉल ID: {{callId}}
- अवधि: {{duration}} सेकंड
- ग्राहक नंबर: {{customerNumber}}

**मूल्यांकन मानदंड:**
कृपया इस बातचीत का निम्नलिखित पहलुओं पर मूल्यांकन करें:

1. **एजेंट की विनम्रता** (1-5): क्या एजेंट विनम्र, पेशेवर और शिष्ट था?
2. **समस्या समाधान** (1-5): क्या एजेंट ने ग्राहक की जरूरतों को प्रभावी रूप से संबोधित किया?
3. **संवाद स्पष्टता** (1-5): क्या एजेंट का संवाद स्पष्ट और समझने योग्य था?
4. **प्रतिक्रिया समय** (1-5): क्या एजेंट ने ग्राहक के प्रश्नों का तुरंत जवाब दिया?
5. **समग्र संतुष्टि** (1-5): ग्राहक सेवा बातचीत की समग्र गुणवत्ता?

**निर्देश:**
- प्रत्येक मानदंड के लिए स्कोर प्रदान करें (1-5 स्केल)
- एक समग्र स्कोर दें (सभी मानदंडों का औसत)
- अपने मूल्यांकन के लिए विस्तृत तर्क प्रदान करें
- अपनी प्रतिक्रिया JSON प्रारूप में वापस करें

{
  "overall_score": <संख्या>,
  "evaluation_type": "quality",
  "criteria_scores": {
    "professionalism": <संख्या>,
    "problem_resolution": <संख्या>,
    "communication_clarity": <संख्या>,
    "response_time": <संख्या>,
    "satisfaction": <संख्या>
  },
  "reasoning": "<विस्तृत व्याख्या>"
}
`

console.log('\n📝 TESTING TRANSCRIPT EXTRACTION:')
const extractedTranscript = extractTranscript(sampleCallLog)
console.log('Extracted Transcript:')
console.log(extractedTranscript)

console.log('\n🏗️ TESTING PROMPT BUILDING:')
const variables = {
  transcript: extractedTranscript,
  callId: sampleCallLog.call_id,
  duration: 180,
  customerNumber: '+91-9876543210'
}

const finalPrompt = buildEvaluationPrompt(sampleTemplate, variables)
console.log('Final Evaluation Prompt:')
console.log(finalPrompt)

console.log('\n✅ VERIFICATION CHECKS:')
console.log('1. Transcript extracted successfully:', extractedTranscript.includes('USER:') && extractedTranscript.includes('AGENT:'))
console.log('2. Transcript includes Hindi content:', extractedTranscript.includes('नमस्कार'))
console.log('3. Variables replaced in template:', finalPrompt.includes('call-456') && !finalPrompt.includes('{{transcript}}'))
console.log('4. Template contains actual conversation:', finalPrompt.includes('आधार कार्ड गुम हो गया है'))

if (finalPrompt.includes('USER: नमस्कार, मुझे अपने आधार कार्ड के बारे में जानकारी चाहिए')) {
  console.log('\n🎉 SUCCESS: Transcript is properly flowing to evaluation prompts!')
  console.log('✅ The evaluation system is receiving complete conversation context')
} else {
  console.log('\n❌ ERROR: Transcript not found in final prompt')
  console.log('🔧 Check the variable replacement logic')
}

console.log('\n🔍 LLM EVALUATION CONTEXT:')
console.log('The LLM will receive:')
console.log('- Complete conversation transcript in Hindi')
console.log('- Call metadata (ID, duration, customer number)')
console.log('- Structured evaluation criteria')
console.log('- Clear instructions for scoring and reasoning')
console.log('')
console.log('This ensures accurate, context-aware evaluations! 🎯')