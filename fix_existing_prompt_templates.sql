-- SQL script to update existing evaluation prompts that don't include {{transcript}} variable
-- This should be run in your Supabase SQL Editor if you have existing prompts without transcript variables

-- First, let's see which prompts are missing the transcript variable
SELECT 
  id,
  name,
  prompt_template,
  CASE 
    WHEN prompt_template LIKE '%{{transcript}}%' THEN 'HAS_TRANSCRIPT'
    ELSE 'MISSING_TRANSCRIPT'
  END as transcript_status
FROM pype_voice_evaluation_prompts
WHERE prompt_template NOT LIKE '%{{transcript}}%';

-- Update prompts that don't have the transcript variable
-- This adds a transcript section to the end of existing templates
UPDATE pype_voice_evaluation_prompts 
SET prompt_template = prompt_template || '

**Conversation Transcript:**
{{transcript}}

Please evaluate the above conversation based on the criteria specified above and provide your analysis in the required format.'
WHERE prompt_template NOT LIKE '%{{transcript}}%'
AND prompt_template IS NOT NULL
AND prompt_template != '';

-- Verify the update
SELECT 
  id,
  name,
  prompt_template,
  CASE 
    WHEN prompt_template LIKE '%{{transcript}}%' THEN 'HAS_TRANSCRIPT'
    ELSE 'MISSING_TRANSCRIPT'
  END as transcript_status
FROM pype_voice_evaluation_prompts;