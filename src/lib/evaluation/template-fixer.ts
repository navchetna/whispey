import { createClient } from '@supabase/supabase-js'

// This utility function can be used to fix existing prompt templates
// that don't include the {{transcript}} variable

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function fixPromptTemplates() {
  console.log('🔧 Starting prompt template fix process...')
  
  try {
    // Get all prompts that don't have the transcript variable
    const { data: problematicPrompts, error: fetchError } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('*')
      .not('prompt_template', 'like', '%{{transcript}}%')
    
    if (fetchError) {
      throw new Error(`Failed to fetch prompts: ${fetchError.message}`)
    }
    
    console.log(`Found ${problematicPrompts?.length || 0} prompts missing transcript variable`)
    
    if (!problematicPrompts || problematicPrompts.length === 0) {
      console.log('✅ All prompts already have transcript variable')
      return { fixed: 0, total: 0 }
    }
    
    let fixedCount = 0
    
    for (const prompt of problematicPrompts) {
      console.log(`🔧 Fixing prompt: ${prompt.name} (${prompt.id})`)
      
      const fixedTemplate = prompt.prompt_template + `

**Conversation Transcript:**
{{transcript}}

Please evaluate the above conversation based on the criteria specified above and provide your analysis in the required format.`
      
      const { error: updateError } = await supabase
        .from('pype_voice_evaluation_prompts')
        .update({ prompt_template: fixedTemplate })
        .eq('id', prompt.id)
      
      if (updateError) {
        console.error(`❌ Failed to fix prompt ${prompt.id}:`, updateError)
      } else {
        console.log(`✅ Fixed prompt: ${prompt.name}`)
        fixedCount++
      }
    }
    
    console.log(`🎯 Fixed ${fixedCount}/${problematicPrompts.length} prompts`)
    
    return { 
      fixed: fixedCount, 
      total: problematicPrompts.length,
      prompts: problematicPrompts.map(p => ({ id: p.id, name: p.name }))
    }
    
  } catch (error) {
    console.error('💥 Error fixing prompt templates:', error)
    throw error
  }
}

// Validation function to check if a template is valid
export function validatePromptTemplate(template: string): { isValid: boolean, issues: string[], fixed?: string } {
  const issues: string[] = []
  let isValid = true
  let fixedTemplate = template
  
  // Check for transcript variable
  if (!template.includes('{{transcript}}')) {
    isValid = false
    issues.push('Missing {{transcript}} variable - conversation content will not be included')
    
    // Auto-fix by adding transcript section
    fixedTemplate = template + `

**Conversation Transcript:**
{{transcript}}

Please evaluate the above conversation and provide your analysis.`
  }
  
  // Check for basic JSON response instruction
  if (!template.toLowerCase().includes('json') && !template.includes('{') && !template.includes('}')) {
    issues.push('Template should include instructions for JSON response format')
  }
  
  // Check for scoring instruction
  if (!template.toLowerCase().includes('score') && !template.toLowerCase().includes('rating')) {
    issues.push('Template should include scoring or rating instructions')
  }
  
  return { isValid, issues, fixed: isValid ? undefined : fixedTemplate }
}

// Function to validate and optionally fix a single prompt template
export async function validateAndFixPrompt(promptId: string, autoFix: boolean = false) {
  try {
    const { data: prompt, error: fetchError } = await supabase
      .from('pype_voice_evaluation_prompts')
      .select('*')
      .eq('id', promptId)
      .single()
    
    if (fetchError || !prompt) {
      throw new Error(`Prompt not found: ${fetchError?.message || 'No data'}`)
    }
    
    const validation = validatePromptTemplate(prompt.prompt_template)
    
    if (!validation.isValid && autoFix && validation.fixed) {
      console.log(`🔧 Auto-fixing prompt: ${prompt.name}`)
      
      const { error: updateError } = await supabase
        .from('pype_voice_evaluation_prompts')
        .update({ prompt_template: validation.fixed })
        .eq('id', promptId)
      
      if (updateError) {
        throw new Error(`Failed to update prompt: ${updateError.message}`)
      }
      
      console.log(`✅ Successfully fixed prompt: ${prompt.name}`)
      return { ...validation, fixed: true, prompt: { ...prompt, prompt_template: validation.fixed } }
    }
    
    return { ...validation, fixed: false, prompt }
    
  } catch (error) {
    console.error('💥 Error validating prompt:', error)
    throw error
  }
}