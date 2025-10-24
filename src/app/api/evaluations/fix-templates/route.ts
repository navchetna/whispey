// app/api/evaluations/fix-templates/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fixPromptTemplates, validateAndFixPrompt } from '@/lib/evaluation/template-fixer'

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
    const { action, promptId } = body

    if (action === 'fix-all') {
      // Fix all templates that don't have transcript variable
      const result = await fixPromptTemplates()
      
      return NextResponse.json({
        success: true,
        message: `Fixed ${result.fixed}/${result.total} prompt templates`,
        data: result
      })
      
    } else if (action === 'fix-single' && promptId) {
      // Fix a single template
      const result = await validateAndFixPrompt(promptId, true)
      
      return NextResponse.json({
        success: true,
        message: result.fixed ? 'Prompt template fixed successfully' : 'Prompt template is already valid',
        data: result
      })
      
    } else if (action === 'validate' && promptId) {
      // Just validate without fixing
      const result = await validateAndFixPrompt(promptId, false)
      
      return NextResponse.json({
        success: true,
        message: result.isValid ? 'Prompt template is valid' : 'Prompt template has issues',
        data: result
      })
      
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "fix-all", "fix-single", or "validate"' },
        { status: 400 }
      )
    }

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Return information about template fixing
    return NextResponse.json({
      success: true,
      message: 'Template fixer API is available',
      endpoints: {
        'POST /api/evaluations/fix-templates': {
          'fix-all': 'Fix all templates missing {{transcript}} variable',
          'fix-single': 'Fix a specific template by ID',
          'validate': 'Validate a template without fixing'
        }
      },
      examples: {
        'fix-all': { action: 'fix-all' },
        'fix-single': { action: 'fix-single', promptId: 'prompt-id-here' },
        'validate': { action: 'validate', promptId: 'prompt-id-here' }
      }
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}