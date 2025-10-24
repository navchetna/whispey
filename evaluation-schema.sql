-- Evaluation System Database Schema
-- Run this script in Supabase SQL Editor to set up the evaluation system tables
-- This script is idempotent - can be run multiple times safely

-- ==============================================
-- CLEANUP EXISTING EVALUATION OBJECTS
-- ==============================================

-- Drop existing evaluation tables (in reverse dependency order)
DROP TABLE IF EXISTS public.pype_voice_evaluation_results CASCADE;
DROP TABLE IF EXISTS public.pype_voice_evaluation_jobs CASCADE;
DROP TABLE IF EXISTS public.pype_voice_evaluation_prompts CASCADE;

-- Drop existing evaluation functions
DROP FUNCTION IF EXISTS update_evaluation_prompt_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_evaluation_job_completion() CASCADE;

-- ==============================================
-- EVALUATION SYSTEM TABLES
-- ==============================================

-- Table for storing evaluation prompts
CREATE TABLE public.pype_voice_evaluation_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    name varchar(255) NOT NULL,
    description text,
    evaluation_type varchar(100) DEFAULT 'custom',
    prompt_template text NOT NULL,
    llm_provider varchar(50) NOT NULL DEFAULT 'openai',
    model varchar(100) NOT NULL,
    api_url text,
    api_key text, -- Note: In production, this should be encrypted
    scoring_output_type varchar(20) DEFAULT 'float' CHECK (scoring_output_type IN ('bool', 'int', 'percentage', 'float')),
    temperature decimal(3,2) DEFAULT 0.0 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens integer DEFAULT 1000 CHECK (max_tokens > 0),
    expected_output_format jsonb DEFAULT '{}',
    scoring_criteria jsonb DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_by varchar(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table for storing evaluation jobs
CREATE TABLE public.pype_voice_evaluation_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL,
    agent_id uuid,
    name varchar(255) NOT NULL,
    description text,
    prompt_ids jsonb NOT NULL, -- Array of prompt UUIDs
    selected_traces jsonb, -- Array of trace IDs if manually selected, null for all traces
    filter_criteria jsonb DEFAULT '{}',
    status varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    total_traces integer DEFAULT 0,
    completed_traces integer DEFAULT 0,
    failed_traces integer DEFAULT 0,
    created_by varchar(255),
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text
);

-- Table for storing individual evaluation results
CREATE TABLE public.pype_voice_evaluation_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.pype_voice_evaluation_jobs(id) ON DELETE CASCADE,
    prompt_id uuid NOT NULL REFERENCES public.pype_voice_evaluation_prompts(id) ON DELETE CASCADE,
    trace_id varchar(255) NOT NULL, -- References the original trace/call ID
    call_id varchar(255), -- For easier querying
    agent_id uuid,
    evaluation_score jsonb NOT NULL, -- Stores the actual score based on output type
    evaluation_reasoning text,
    raw_llm_response text,
    execution_time_ms integer,
    llm_cost_usd decimal(10,6),
    status varchar(20) DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'skipped')),
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);

-- ==============================================
-- EVALUATION SYSTEM INDEXES
-- ==============================================

-- Indexes for evaluation prompts
CREATE INDEX idx_evaluation_prompts_project_id ON public.pype_voice_evaluation_prompts(project_id);
CREATE INDEX idx_evaluation_prompts_active ON public.pype_voice_evaluation_prompts(is_active) WHERE is_active = true;
CREATE INDEX idx_evaluation_prompts_provider ON public.pype_voice_evaluation_prompts(llm_provider);
CREATE INDEX idx_evaluation_prompts_created_at ON public.pype_voice_evaluation_prompts(created_at DESC);

-- Indexes for evaluation jobs
CREATE INDEX idx_evaluation_jobs_project_id ON public.pype_voice_evaluation_jobs(project_id);
CREATE INDEX idx_evaluation_jobs_agent_id ON public.pype_voice_evaluation_jobs(agent_id);
CREATE INDEX idx_evaluation_jobs_status ON public.pype_voice_evaluation_jobs(status);
CREATE INDEX idx_evaluation_jobs_created_at ON public.pype_voice_evaluation_jobs(created_at DESC);

-- Indexes for evaluation results
CREATE INDEX idx_evaluation_results_job_id ON public.pype_voice_evaluation_results(job_id);
CREATE INDEX idx_evaluation_results_prompt_id ON public.pype_voice_evaluation_results(prompt_id);
CREATE INDEX idx_evaluation_results_trace_id ON public.pype_voice_evaluation_results(trace_id);
CREATE INDEX idx_evaluation_results_call_id ON public.pype_voice_evaluation_results(call_id);
CREATE INDEX idx_evaluation_results_agent_id ON public.pype_voice_evaluation_results(agent_id);
CREATE INDEX idx_evaluation_results_status ON public.pype_voice_evaluation_results(status);
CREATE INDEX idx_evaluation_results_created_at ON public.pype_voice_evaluation_results(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_evaluation_results_job_status ON public.pype_voice_evaluation_results(job_id, status);
CREATE INDEX idx_evaluation_results_agent_prompt ON public.pype_voice_evaluation_results(agent_id, prompt_id);

-- ==============================================
-- EVALUATION SYSTEM RLS POLICIES
-- ==============================================

-- Enable RLS on evaluation tables
ALTER TABLE public.pype_voice_evaluation_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pype_voice_evaluation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pype_voice_evaluation_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for evaluation prompts (allow all operations for now - customize as needed)
CREATE POLICY "Allow all operations on evaluation prompts" ON public.pype_voice_evaluation_prompts
    FOR ALL USING (true) WITH CHECK (true);

-- Create RLS policies for evaluation jobs (allow all operations for now - customize as needed)
CREATE POLICY "Allow all operations on evaluation jobs" ON public.pype_voice_evaluation_jobs
    FOR ALL USING (true) WITH CHECK (true);

-- Create RLS policies for evaluation results (allow all operations for now - customize as needed)
CREATE POLICY "Allow all operations on evaluation results" ON public.pype_voice_evaluation_results
    FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- EVALUATION SYSTEM FUNCTIONS
-- ==============================================

-- Function to update the updated_at timestamp for prompts
CREATE OR REPLACE FUNCTION update_evaluation_prompt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on prompt changes
CREATE TRIGGER trigger_update_evaluation_prompt_updated_at
    BEFORE UPDATE ON public.pype_voice_evaluation_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_evaluation_prompt_updated_at();

-- Function to automatically update job completion timestamp
CREATE OR REPLACE FUNCTION update_evaluation_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('completed', 'failed', 'cancelled') AND OLD.status NOT IN ('completed', 'failed', 'cancelled') THEN
        NEW.completed_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update completion timestamp
CREATE TRIGGER trigger_update_evaluation_job_completion
    BEFORE UPDATE ON public.pype_voice_evaluation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_evaluation_job_completion();

-- Function to get evaluation statistics for a job
CREATE OR REPLACE FUNCTION get_evaluation_job_stats(job_uuid uuid)
RETURNS TABLE (
    total_evaluations bigint,
    completed_evaluations bigint,
    failed_evaluations bigint,
    avg_score numeric,
    avg_execution_time numeric,
    total_cost numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_evaluations,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_evaluations,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_evaluations,
        ROUND(AVG(CASE 
            WHEN status = 'completed' AND evaluation_score->>'score' IS NOT NULL 
            THEN (evaluation_score->>'score')::numeric 
            ELSE NULL 
        END), 2) as avg_score,
        ROUND(AVG(execution_time_ms::numeric), 0) as avg_execution_time,
        ROUND(SUM(COALESCE(llm_cost_usd, 0)), 6) as total_cost
    FROM public.pype_voice_evaluation_results
    WHERE job_id = job_uuid;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- EVALUATION SYSTEM VIEWS
-- ==============================================

-- View for easy access to evaluation results with prompt and job details
CREATE OR REPLACE VIEW evaluation_results_detailed AS
SELECT 
    r.id,
    r.job_id,
    r.prompt_id,
    r.trace_id,
    r.call_id,
    r.agent_id,
    r.evaluation_score,
    r.evaluation_reasoning,
    r.status as result_status,
    r.created_at as evaluated_at,
    r.execution_time_ms,
    r.llm_cost_usd,
    j.name as job_name,
    j.status as job_status,
    p.name as prompt_name,
    p.evaluation_type,
    p.llm_provider,
    p.model,
    p.scoring_output_type
FROM public.pype_voice_evaluation_results r
JOIN public.pype_voice_evaluation_jobs j ON r.job_id = j.id
JOIN public.pype_voice_evaluation_prompts p ON r.prompt_id = p.id;

-- ==============================================
-- INITIAL DATA / EXAMPLES
-- ==============================================

-- Example evaluation prompt (uncomment to insert sample data)
/*
INSERT INTO public.pype_voice_evaluation_prompts (
    project_id, name, description, evaluation_type, prompt_template,
    llm_provider, model, scoring_output_type, temperature, max_tokens
) VALUES (
    gen_random_uuid(), -- Replace with actual project_id
    'Sample Quality Evaluation',
    'Evaluates the quality of customer service interactions',
    'quality',
    'Please evaluate the following conversation for quality on a scale of 1-10. Consider factors like helpfulness, clarity, and professionalism.\n\nConversation:\n{transcript}\n\nProvide your response in JSON format with "score" (1-10) and "reasoning" fields.',
    'openai',
    'gpt-4o-mini',
    'int',
    0.3,
    500
);
*/