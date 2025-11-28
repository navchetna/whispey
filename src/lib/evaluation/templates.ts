// Example evaluation prompt templates for common use cases

export const EVALUATION_TEMPLATES = {
  quality: {
    name: "Conversation Quality Assessment",
    description: "Evaluates overall conversation quality, clarity, and professionalism",
    evaluation_type: "quality",
    prompt_template: `
Please evaluate the following customer service conversation for overall quality on a scale of 1-5.

CONVERSATION TRANSCRIPT:
{{transcript}}

EVALUATION CRITERIA:
- Clarity and coherence of responses
- Professionalism and tone
- Helpfulness and problem resolution
- Agent's listening skills and empathy
- Overall customer experience

Please provide your evaluation in the following JSON format:
\`\`\`json
{
  "score": [1-5],
  "clarity_score": [1-5],
  "professionalism_score": [1-5],
  "helpfulness_score": [1-5],
  "empathy_score": [1-5],
  "reasoning": "Detailed explanation of the scores",
  "key_strengths": ["list", "of", "strengths"],
  "areas_for_improvement": ["list", "of", "improvements"]
}
\`\`\`
`,
    expected_output_format: {
      type: "json",
      schema: {
        score: "number",
        clarity_score: "number",
        professionalism_score: "number",
        helpfulness_score: "number",
        empathy_score: "number",
        reasoning: "string",
        key_strengths: "array",
        areas_for_improvement: "array"
      }
    },
    scoring_criteria: {
      scale: "1-5",
      type: "numeric",
      pass_threshold: 3.0
    }
  },

  sentiment: {
    name: "Customer Sentiment Analysis",
    description: "Analyzes customer sentiment throughout the conversation",
    evaluation_type: "sentiment",
    prompt_template: `
Analyze the customer sentiment in this conversation and track how it changes throughout the interaction.

CONVERSATION TRANSCRIPT:
{{transcript}}

CALL DETAILS:
- Call ID: {{callId}}
- Duration: {{duration}} seconds
- Customer: {{customerNumber}}

Please evaluate:
1. Initial customer sentiment
2. Final customer sentiment
3. Sentiment progression throughout the call
4. Key moments that affected sentiment
5. Agent's impact on customer sentiment

Provide your analysis in JSON format:
\`\`\`json
{
  "score": [1-5],
  "initial_sentiment": "positive|neutral|negative",
  "final_sentiment": "positive|neutral|negative",
  "sentiment_trajectory": "improving|stable|declining",
  "sentiment_score": [1-5],
  "key_turning_points": ["list of moments that changed sentiment"],
  "agent_effectiveness": [1-5],
  "reasoning": "Detailed analysis of sentiment patterns"
}
\`\`\`
`,
    expected_output_format: {
      type: "json",
      schema: {
        score: "number",
        initial_sentiment: "string",
        final_sentiment: "string",
        sentiment_trajectory: "string",
        sentiment_score: "number",
        key_turning_points: "array",
        agent_effectiveness: "number",
        reasoning: "string"
      }
    },
    scoring_criteria: {
      scale: "1-5",
      type: "numeric",
      pass_threshold: 3.0
    }
  },

  compliance: {
    name: "Compliance and Policy Adherence",
    description: "Checks adherence to company policies and regulatory requirements",
    evaluation_type: "compliance",
    prompt_template: `
Review this customer service conversation for compliance with standard policies and procedures.

CONVERSATION TRANSCRIPT:
{{transcript}}

COMPLIANCE CHECKLIST:
- Did the agent properly identify themselves?
- Was customer information handled securely?
- Were appropriate disclaimers provided?
- Was escalation offered when needed?
- Were company policies followed?
- Was the conversation professional throughout?

Rate compliance on a scale of 1-5 and identify any violations:

\`\`\`json
{
  "score": [1-5],
  "identification_compliance": true/false,
  "security_compliance": true/false,
  "disclaimer_compliance": true/false,
  "escalation_compliance": true/false,
  "policy_compliance": true/false,
  "professionalism_compliance": true/false,
  "violations": ["list", "of", "any", "violations"],
  "recommendations": ["list", "of", "compliance", "improvements"],
  "reasoning": "Detailed compliance analysis"
}
\`\`\`
`,
    expected_output_format: {
      type: "json",
      schema: {
        score: "number",
        identification_compliance: "boolean",
        security_compliance: "boolean",
        disclaimer_compliance: "boolean",
        escalation_compliance: "boolean",
        policy_compliance: "boolean",
        professionalism_compliance: "boolean",
        violations: "array",
        recommendations: "array",
        reasoning: "string"
      }
    },
    scoring_criteria: {
      scale: "1-5",
      type: "numeric",
      pass_threshold: 4.0
    }
  },

  accuracy: {
    name: "Information Accuracy Assessment",
    description: "Evaluates the accuracy and correctness of information provided",
    evaluation_type: "accuracy",
    prompt_template: `
Evaluate the accuracy of information provided by the agent in this conversation.

CONVERSATION TRANSCRIPT:
{{transcript}}

ASSESSMENT CRITERIA:
- Factual accuracy of statements
- Consistency of information provided
- Appropriate use of technical terms
- Clarity of explanations
- Completeness of answers

Rate the information accuracy on a scale of 1-5:

\`\`\`json
{
  "score": [1-5],
  "factual_accuracy": [1-5],
  "consistency_score": [1-5],
  "technical_accuracy": [1-5],
  "explanation_clarity": [1-5],
  "completeness_score": [1-5],
  "inaccuracies_found": ["list", "of", "any", "inaccuracies"],
  "missing_information": ["list", "of", "missing", "details"],
  "reasoning": "Detailed accuracy assessment"
}
\`\`\`
`,
    expected_output_format: {
      type: "json",
      schema: {
        score: "number",
        factual_accuracy: "number",
        consistency_score: "number",
        technical_accuracy: "number",
        explanation_clarity: "number",
        completeness_score: "number",
        inaccuracies_found: "array",
        missing_information: "array",
        reasoning: "string"
      }
    },
    scoring_criteria: {
      scale: "1-5",
      type: "numeric",
      pass_threshold: 4.0
    }
  },

  resolution: {
    name: "Issue Resolution Effectiveness",
    description: "Evaluates how effectively the agent resolved the customer's issue",
    evaluation_type: "resolution",
    prompt_template: `
Assess how effectively the agent resolved the customer's issue in this conversation.

CONVERSATION TRANSCRIPT:
{{transcript}}

EVALUATION FOCUS:
- Problem identification and understanding
- Solution appropriateness and effectiveness
- Follow-up and next steps
- Customer satisfaction with resolution
- Time to resolution efficiency

Provide resolution assessment:

\`\`\`json
{
  "score": [1-5],
  "problem_understanding": [1-5],
  "solution_effectiveness": [1-5],
  "follow_up_quality": [1-5],
  "customer_satisfaction": [1-5],
  "resolution_efficiency": [1-5],
  "issue_fully_resolved": true/false,
  "resolution_method": "description of how issue was resolved",
  "outstanding_items": ["list", "of", "unresolved", "items"],
  "reasoning": "Detailed resolution analysis"
}
\`\`\`
`,
    expected_output_format: {
      type: "json",
      schema: {
        score: "number",
        problem_understanding: "number",
        solution_effectiveness: "number",
        follow_up_quality: "number",
        customer_satisfaction: "number",
        resolution_efficiency: "number",
        issue_fully_resolved: "boolean",
        resolution_method: "string",
        outstanding_items: "array",
        reasoning: "string"
      }
    },
    scoring_criteria: {
      scale: "1-5",
      type: "numeric",
      pass_threshold: 3.5
    }
  }
}

// Helper function to get template by type
export function getEvaluationTemplate(type: keyof typeof EVALUATION_TEMPLATES) {
  return EVALUATION_TEMPLATES[type]
}

// Helper function to get all available templates
export function getAllEvaluationTemplates() {
  return Object.values(EVALUATION_TEMPLATES)
}