-- Whispey Database Setup Script with Proper Permissions
-- Run this script as PostgreSQL superuser (postgres) to set up the database and user

-- ==============================================
-- DATABASE AND USER SETUP
-- ==============================================

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE whispey'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'whispey')\gexec

-- Create user if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'whispey_user') THEN
        CREATE USER whispey_user WITH ENCRYPTED PASSWORD 'whispey_password_change_this';
    END IF;
END
$$;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE whispey TO whispey_user;

-- Connect to the whispey database
\c whispey

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO whispey_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO whispey_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO whispey_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO whispey_user;

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================
-- CLEANUP EXISTING OBJECTS
-- ==============================================

-- Drop existing materialized views
DROP MATERIALIZED VIEW IF EXISTS call_summary_materialized CASCADE;

-- Drop existing functions
DROP FUNCTION IF EXISTS refresh_call_summary() CASCADE;
DROP FUNCTION IF EXISTS batch_calculate_custom_totals(uuid, jsonb, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_available_json_fields(uuid, text, integer) CASCADE;
DROP FUNCTION IF EXISTS get_distinct_values(uuid, text, text, integer) CASCADE;
DROP FUNCTION IF EXISTS calculate_custom_total(uuid, text, text, text, jsonb, text, date, date) CASCADE;
DROP FUNCTION IF EXISTS build_single_filter_condition(jsonb) CASCADE;
DROP FUNCTION IF EXISTS update_evaluation_prompt_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_evaluation_job_completion() CASCADE;
DROP FUNCTION IF EXISTS get_evaluation_job_stats(uuid) CASCADE;
DROP FUNCTION IF EXISTS create_user_session(uuid, timestamp with time zone) CASCADE;
DROP FUNCTION IF EXISTS validate_user_session(text) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_sessions() CASCADE;

-- Drop existing views
DROP VIEW IF EXISTS evaluation_results_detailed CASCADE;

-- Drop existing evaluation tables (in reverse dependency order)
DROP TABLE IF EXISTS public.pype_voice_evaluation_results CASCADE;
DROP TABLE IF EXISTS public.pype_voice_evaluation_jobs CASCADE;
DROP TABLE IF EXISTS public.pype_voice_evaluation_prompts CASCADE;

-- Drop existing core tables (in reverse dependency order)
DROP TABLE IF EXISTS public.pype_voice_call_logs_with_context CASCADE;
DROP TABLE IF EXISTS public.pype_voice_call_logs_backup CASCADE;
DROP TABLE IF EXISTS public.pype_voice_spans CASCADE;
DROP TABLE IF EXISTS public.pype_voice_session_traces CASCADE;
DROP TABLE IF EXISTS public.pype_voice_custom_totals_configs CASCADE;
DROP TABLE IF EXISTS public.pype_voice_agent_call_log_views CASCADE;
DROP TABLE IF EXISTS public.pype_voice_api_keys CASCADE;
DROP TABLE IF EXISTS public.pype_voice_project_user_mapping CASCADE;
DROP TABLE IF EXISTS public.pype_voice_user_sessions CASCADE;
DROP TABLE IF EXISTS public.pype_voice_call_logs CASCADE;
DROP TABLE IF EXISTS public.pype_voice_metrics_logs CASCADE;
DROP TABLE IF EXISTS public.pype_voice_agents CASCADE;
DROP TABLE IF EXISTS public.pype_voice_projects CASCADE;
DROP TABLE IF EXISTS public.pype_voice_users CASCADE;
DROP TABLE IF EXISTS public.usd_to_inr_rate CASCADE;
DROP TABLE IF EXISTS public.gpt_api_pricing_inr CASCADE;
DROP TABLE IF EXISTS public.gpt_api_pricing CASCADE;
DROP TABLE IF EXISTS public.audio_api_pricing CASCADE;

-- ==============================================
-- CORE SYSTEM TABLES
-- ==============================================

-- Table for storing user information (local users for on-premise)
CREATE TABLE public.pype_voice_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    first_name text,
    last_name text,
    profile_image_url text,
    password_hash text NOT NULL,
    is_active boolean DEFAULT true,
    is_admin boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table for user sessions (local authentication)
CREATE TABLE public.pype_voice_user_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.pype_voice_users(id) ON DELETE CASCADE,
    session_token text UNIQUE NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Table for projects
CREATE TABLE public.pype_voice_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar NOT NULL,
    description text,
    environment varchar DEFAULT 'production',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    retry_configuration jsonb DEFAULT '{}',
    token_hash text,
    owner_user_id uuid REFERENCES public.pype_voice_users(id) ON DELETE CASCADE,
    campaign_config jsonb DEFAULT '{}'
);

-- Table for project-user mapping (replace email mapping)
CREATE TABLE public.pype_voice_project_user_mapping (
    id serial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES public.pype_voice_users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES public.pype_voice_projects(id) ON DELETE CASCADE,
    role text DEFAULT 'member',
    permissions jsonb DEFAULT '{}',
    added_by_user_id uuid REFERENCES public.pype_voice_users(id),
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    UNIQUE(user_id, project_id)
);

-- Table for agents
CREATE TABLE public.pype_voice_agents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.pype_voice_projects(id) ON DELETE CASCADE,
    name varchar NOT NULL,
    agent_type varchar,
    configuration jsonb DEFAULT '{}',
    environment varchar DEFAULT 'production',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    user_id uuid REFERENCES public.pype_voice_users(id),
    field_extractor boolean DEFAULT false,
    field_extractor_prompt text,
    field_extractor_keys jsonb DEFAULT '[]'
);

-- Table for API keys
CREATE TABLE public.pype_voice_api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.pype_voice_projects(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.pype_voice_users(id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    token_hash_master text NOT NULL,
    masked_key varchar(50) NOT NULL,
    created_at timestamp DEFAULT CURRENT_TIMESTAMP,
    last_used timestamp
);

-- Table for call logs
CREATE TABLE public.pype_voice_call_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id varchar,
    agent_id uuid REFERENCES public.pype_voice_agents(id) ON DELETE CASCADE,
    customer_number varchar,
    call_ended_reason varchar,
    transcript_type varchar,
    transcript_json jsonb DEFAULT '{}',
    metadata jsonb DEFAULT '{}',
    dynamic_variables jsonb DEFAULT '{}',
    environment varchar DEFAULT 'production',
    created_at timestamp with time zone DEFAULT now(),
    call_started_at timestamp with time zone,
    call_ended_at timestamp with time zone,
    duration_seconds int4,
    recording_url text,
    voice_recording_url text,
    avg_latency float8,
    transcription_metrics jsonb DEFAULT '{}',
    total_stt_cost float8 DEFAULT 0,
    total_tts_cost float8 DEFAULT 0,
    total_llm_cost float8 DEFAULT 0,
    complete_configuration jsonb DEFAULT '{}',
    telemetry_data jsonb DEFAULT '{}',
    telemetry_analytics jsonb DEFAULT '{}'
);

-- Table for metrics logs
CREATE TABLE public.pype_voice_metrics_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid,
    turn_id text,
    user_transcript text,
    agent_response text,
    stt_metrics jsonb DEFAULT '{}',
    llm_metrics jsonb DEFAULT '{}',
    tts_metrics jsonb DEFAULT '{}',
    eou_metrics jsonb DEFAULT '{}',
    lesson_day int4,
    created_at timestamp with time zone DEFAULT now(),
    unix_timestamp numeric,
    phone_number text,
    call_duration numeric,
    call_success boolean,
    lesson_completed boolean,
    trace_id text,
    trace_duration_ms int4,
    trace_cost_usd float8,
    turn_configuration jsonb DEFAULT '{}',
    bug_report boolean DEFAULT false,
    bug_details text,
    enhanced_data jsonb DEFAULT '{}',
    tool_calls jsonb DEFAULT '[]'
);

-- Table for agent call log views
CREATE TABLE public.pype_voice_agent_call_log_views (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id uuid REFERENCES public.pype_voice_agents(id) ON DELETE CASCADE,
    name text NOT NULL,
    filters jsonb DEFAULT '{}',
    visible_columns jsonb DEFAULT '[]',
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table for custom totals configurations
CREATE TABLE public.pype_voice_custom_totals_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid REFERENCES public.pype_voice_projects(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.pype_voice_agents(id) ON DELETE CASCADE,
    name varchar NOT NULL,
    description text,
    aggregation varchar NOT NULL,
    column_name varchar NOT NULL,
    json_field varchar,
    filters jsonb DEFAULT '[]'::jsonb,
    filter_logic varchar DEFAULT 'AND',
    icon varchar,
    color varchar,
    created_by varchar,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Table for session traces
CREATE TABLE public.pype_voice_session_traces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid,
    total_spans int4 DEFAULT 0,
    performance_summary jsonb DEFAULT '{}'::jsonb,
    span_summary jsonb DEFAULT '{}'::jsonb,
    session_start_time timestamp,
    session_end_time timestamp,
    total_duration_ms int4,
    created_at timestamp DEFAULT now(),
    trace_key varchar(255)
);

-- Table for spans
CREATE TABLE public.pype_voice_spans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    span_id text,
    trace_id text,
    name text,
    operation_type text,
    start_time_ns bigint,
    end_time_ns bigint,
    duration_ms int4,
    status jsonb DEFAULT '{}',
    attributes jsonb DEFAULT '{}',
    events jsonb DEFAULT '[]',
    metadata jsonb DEFAULT '{}',
    request_id text,
    parent_span_id text,
    created_at timestamp DEFAULT now(),
    duration_ns bigint,
    captured_at timestamp,
    context jsonb DEFAULT '{}',
    request_id_source text,
    trace_key varchar(255) NOT NULL
);

-- Backup and utility tables
CREATE TABLE public.pype_voice_call_logs_backup (
    id uuid,
    call_id varchar,
    agent_id uuid,
    customer_number varchar,
    call_ended_reason varchar,
    transcript_type varchar,
    transcript_json jsonb,
    metadata jsonb,
    dynamic_variables jsonb,
    environment varchar,
    created_at timestamp,
    call_started_at timestamp,
    call_ended_at timestamp,
    duration_seconds int4,
    recording_url text,
    voice_recording_url text,
    avg_latency float8,
    transcription_metrics jsonb,
    total_stt_cost float8,
    total_tts_cost float8,
    total_llm_cost float8,
    complete_configuration jsonb,
    telemetry_data jsonb,
    telemetry_analytics jsonb
);

CREATE TABLE public.pype_voice_call_logs_with_context (
    id uuid,
    call_id varchar,
    agent_id uuid,
    customer_number varchar,
    call_ended_reason varchar,
    transcript_type varchar,
    transcript_json jsonb,
    metadata jsonb,
    dynamic_variables jsonb,
    environment varchar,
    created_at timestamp,
    call_started_at timestamp,
    call_ended_at timestamp,
    duration_seconds int4,
    agent_name varchar,
    agent_type varchar,
    project_name varchar,
    project_id uuid
);

-- Pricing tables
CREATE TABLE public.audio_api_pricing (
    service_type text,
    provider text,
    model_or_plan text,
    unit text,
    cost_usd_per_unit numeric,
    valid_from date,
    source_url text
);

CREATE TABLE public.gpt_api_pricing (
    model_name text,
    input_usd_per_million numeric,
    output_usd_per_million numeric,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gpt_api_pricing_inr (
    model_name text,
    input_inr_per_million numeric,
    output_inr_per_million numeric,
    rate_date date,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.usd_to_inr_rate (
    as_of date,
    rate numeric,
    source text
);

-- ==============================================
-- EVALUATION SYSTEM TABLES
-- ==============================================

-- Table for storing evaluation prompts
CREATE TABLE public.pype_voice_evaluation_prompts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.pype_voice_projects(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    description text,
    evaluation_type varchar(100) DEFAULT 'custom',
    prompt_template text NOT NULL,
    llm_provider varchar(50) NOT NULL DEFAULT 'openai',
    model varchar(100) NOT NULL,
    api_url text,
    api_key text, -- Note: Store encrypted in production
    scoring_output_type varchar(20) DEFAULT 'float' CHECK (scoring_output_type IN ('bool', 'int', 'percentage', 'float')),
    success_criteria varchar(20) DEFAULT NULL CHECK (success_criteria IN ('true', 'false', 'higher_is_better', 'lower_is_better')),
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
    project_id uuid NOT NULL REFERENCES public.pype_voice_projects(id) ON DELETE CASCADE,
    agent_id uuid REFERENCES public.pype_voice_agents(id) ON DELETE CASCADE,
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

-- Grant permissions on all newly created tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whispey_user;

-- ==============================================
-- INDEXES FOR PERFORMANCE
-- ==============================================

-- Core table indexes
CREATE INDEX idx_users_email ON public.pype_voice_users(email);
CREATE INDEX idx_users_active ON public.pype_voice_users(is_active) WHERE is_active = true;
CREATE INDEX idx_user_sessions_token ON public.pype_voice_user_sessions(session_token);
CREATE INDEX idx_user_sessions_expires ON public.pype_voice_user_sessions(expires_at);

CREATE INDEX idx_projects_owner ON public.pype_voice_projects(owner_user_id);
CREATE INDEX idx_projects_active ON public.pype_voice_projects(is_active) WHERE is_active = true;

CREATE INDEX idx_project_mapping_user ON public.pype_voice_project_user_mapping(user_id);
CREATE INDEX idx_project_mapping_project ON public.pype_voice_project_user_mapping(project_id);

CREATE INDEX idx_agents_project ON public.pype_voice_agents(project_id);
CREATE INDEX idx_agents_active ON public.pype_voice_agents(is_active) WHERE is_active = true;

CREATE INDEX idx_call_logs_agent ON public.pype_voice_call_logs(agent_id);
CREATE INDEX idx_call_logs_created ON public.pype_voice_call_logs(created_at DESC);
CREATE INDEX idx_call_logs_call_id ON public.pype_voice_call_logs(call_id);

CREATE INDEX idx_metrics_session ON public.pype_voice_metrics_logs(session_id);
CREATE INDEX idx_metrics_trace ON public.pype_voice_metrics_logs(trace_id);
CREATE INDEX idx_metrics_created ON public.pype_voice_metrics_logs(created_at DESC);

CREATE INDEX idx_spans_trace ON public.pype_voice_spans(trace_id);
CREATE INDEX idx_spans_trace_key ON public.pype_voice_spans(trace_key);

-- Evaluation system indexes
CREATE INDEX idx_evaluation_prompts_project_id ON public.pype_voice_evaluation_prompts(project_id);
CREATE INDEX idx_evaluation_prompts_active ON public.pype_voice_evaluation_prompts(is_active) WHERE is_active = true;
CREATE INDEX idx_evaluation_prompts_provider ON public.pype_voice_evaluation_prompts(llm_provider);
CREATE INDEX idx_evaluation_prompts_created_at ON public.pype_voice_evaluation_prompts(created_at DESC);

CREATE INDEX idx_evaluation_jobs_project_id ON public.pype_voice_evaluation_jobs(project_id);
CREATE INDEX idx_evaluation_jobs_agent_id ON public.pype_voice_evaluation_jobs(agent_id);
CREATE INDEX idx_evaluation_jobs_status ON public.pype_voice_evaluation_jobs(status);
CREATE INDEX idx_evaluation_jobs_created_at ON public.pype_voice_evaluation_jobs(created_at DESC);

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
-- MATERIALIZED VIEWS
-- ==============================================

CREATE MATERIALIZED VIEW call_summary_materialized AS
SELECT
  agent_id,
  DATE(created_at) AS call_date,
  COUNT(*) AS calls,
  SUM(duration_seconds) AS total_seconds,
  ROUND(SUM(duration_seconds)::numeric / 60, 0) AS total_minutes,
  AVG(avg_latency) AS avg_latency,
  COUNT(DISTINCT call_id) AS unique_customers,
  COUNT(*) FILTER (WHERE call_ended_reason = 'completed') AS successful_calls,
  ROUND(
    (COUNT(*) FILTER (WHERE call_ended_reason = 'completed')::numeric / NULLIF(COUNT(*), 0)) * 100,
    2
  ) AS success_rate,
  -- Telecom cost only for completed calls (₹ 0.70 per started minute)
  SUM(
    CEIL(duration_seconds::numeric / 60)
  ) FILTER (WHERE call_ended_reason = 'completed') * 0.70 AS telecom_cost,
  -- Total LLM+TTS+STT cost only for completed calls
  (
    COALESCE(SUM(total_llm_cost) FILTER (WHERE call_ended_reason = 'completed'), 0)
    + COALESCE(SUM(total_tts_cost) FILTER (WHERE call_ended_reason = 'completed'), 0)
    + COALESCE(SUM(total_stt_cost) FILTER (WHERE call_ended_reason = 'completed'), 0)
    + SUM(CEIL(duration_seconds::numeric / 60)) FILTER (WHERE call_ended_reason = 'completed') * 0.70
  )::numeric(16, 2) AS total_cost
FROM pype_voice_call_logs
GROUP BY agent_id, DATE(created_at);

CREATE UNIQUE INDEX call_summary_agent_date_idx
  ON call_summary_materialized (agent_id, call_date);

-- ==============================================
-- VIEWS
-- ==============================================

-- View for easy access to evaluation results with prompt and job details
CREATE VIEW evaluation_results_detailed AS
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

-- Grant permissions on views
GRANT ALL ON evaluation_results_detailed TO whispey_user;
GRANT ALL ON call_summary_materialized TO whispey_user;

-- ==============================================
-- UTILITY FUNCTIONS
-- ==============================================

-- Helper function to build individual filter conditions
CREATE OR REPLACE FUNCTION build_single_filter_condition(filter_obj JSONB)
RETURNS TEXT AS $$
DECLARE
  column_name TEXT;
  json_field TEXT;
  operation TEXT;
  filter_value TEXT;
  condition TEXT := '';
BEGIN
  -- Extract filter properties
  column_name := filter_obj->>'column';
  json_field := filter_obj->>'jsonField';
  operation := filter_obj->>'operation';
  filter_value := filter_obj->>'value';

  -- Normalize empty strings to NULL
  IF json_field = '' OR json_field = 'null' THEN
    json_field := NULL;
  END IF;

  -- Validate required fields
  IF column_name IS NULL OR operation IS NULL THEN
    RETURN '';
  END IF;

  -- Build condition based on operation
  CASE operation
    WHEN 'equals', 'json_equals' THEN
      IF json_field IS NOT NULL THEN
        condition := quote_ident(column_name) || '->>' || quote_literal(json_field) || ' = ' || quote_literal(filter_value);
      ELSE
        condition := quote_ident(column_name) || ' = ' || quote_literal(filter_value);
      END IF;
    
    WHEN 'contains', 'json_contains' THEN
      IF json_field IS NOT NULL THEN
        condition := quote_ident(column_name) || '->>' || quote_literal(json_field) || ' ILIKE ' || quote_literal('%' || filter_value || '%');
      ELSE
        condition := quote_ident(column_name) || ' ILIKE ' || quote_literal('%' || filter_value || '%');
      END IF;
    
    WHEN 'starts_with' THEN
      IF json_field IS NOT NULL THEN
        condition := quote_ident(column_name) || '->>' || quote_literal(json_field) || ' ILIKE ' || quote_literal(filter_value || '%');
      ELSE
        condition := quote_ident(column_name) || ' ILIKE ' || quote_literal(filter_value || '%');
      END IF;
    
    WHEN 'greater_than', 'json_greater_than' THEN
      IF json_field IS NOT NULL THEN
        condition := '(' || quote_ident(column_name) || '->>' || quote_literal(json_field) || ')::NUMERIC > ' || quote_literal(filter_value) || '::NUMERIC';
      ELSE
        condition := quote_ident(column_name) || ' > ' || quote_literal(filter_value) || '::NUMERIC';
      END IF;
    
    WHEN 'less_than', 'json_less_than' THEN
      IF json_field IS NOT NULL THEN
        condition := '(' || quote_ident(column_name) || '->>' || quote_literal(json_field) || ')::NUMERIC < ' || quote_literal(filter_value) || '::NUMERIC';
      ELSE
        condition := quote_ident(column_name) || ' < ' || quote_literal(filter_value) || '::NUMERIC';
      END IF;
    
    WHEN 'json_exists' THEN
      IF json_field IS NOT NULL THEN
        condition := quote_ident(column_name) || '->>' || quote_literal(json_field) || ' IS NOT NULL AND ' ||
                    quote_ident(column_name) || '->>' || quote_literal(json_field) || ' != ''''';
      ELSE
        condition := quote_ident(column_name) || ' IS NOT NULL';
      END IF;
    
    ELSE
      condition := '';
  END CASE;

  RETURN condition;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Main function to calculate custom totals
CREATE OR REPLACE FUNCTION calculate_custom_total(
    p_agent_id UUID,
    p_aggregation TEXT,
    p_column_name TEXT,
    p_json_field TEXT DEFAULT NULL,
    p_filters JSONB DEFAULT '[]'::jsonb,
    p_filter_logic TEXT DEFAULT 'AND',
    p_date_from DATE DEFAULT NULL,
    p_date_to DATE DEFAULT NULL
)
RETURNS TABLE(
    result NUMERIC,
    error_message TEXT
) AS $$
DECLARE
    base_query TEXT;
    where_conditions TEXT[] := ARRAY[]::TEXT[];
    filter_conditions TEXT[] := ARRAY[]::TEXT[];
    final_where TEXT := '';
    result_value NUMERIC := 0;
    error_msg TEXT := NULL;
    rec RECORD;
    filter_item JSONB;
    filter_condition TEXT;
BEGIN
    -- Normalize p_json_field
    IF p_json_field = '' OR p_json_field = 'null' THEN
        p_json_field := NULL;
    END IF;

    -- Build base query
    IF p_aggregation = 'COUNT' THEN
        base_query := 'SELECT COUNT(*) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        
    ELSIF p_aggregation = 'COUNT_DISTINCT' THEN
        IF p_json_field IS NOT NULL THEN
            base_query := 'SELECT COUNT(DISTINCT (' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ')) as result FROM pype_voice_call_logs WHERE agent_id = $1 AND ' || 
                         quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' IS NOT NULL AND ' ||
                         quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' != ''''';
        ELSE
            base_query := 'SELECT COUNT(DISTINCT ' || quote_ident(p_column_name) || ') as result FROM pype_voice_call_logs WHERE agent_id = $1 AND ' || quote_ident(p_column_name) || ' IS NOT NULL';
        END IF;
        
    ELSIF p_aggregation = 'SUM' THEN
        IF p_json_field IS NOT NULL THEN
            base_query := 'SELECT COALESCE(SUM(CASE WHEN ' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ')::NUMERIC ELSE 0 END), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        ELSE
            base_query := 'SELECT COALESCE(SUM(' || quote_ident(p_column_name) || '), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        END IF;
        
    ELSIF p_aggregation = 'AVG' THEN
        IF p_json_field IS NOT NULL THEN
            base_query := 'SELECT COALESCE(AVG(CASE WHEN ' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ')::NUMERIC ELSE NULL END), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        ELSE
            base_query := 'SELECT COALESCE(AVG(' || quote_ident(p_column_name) || '), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        END IF;
        
    ELSIF p_aggregation = 'MIN' THEN
        IF p_json_field IS NOT NULL THEN
            base_query := 'SELECT COALESCE(MIN(CASE WHEN ' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ')::NUMERIC ELSE NULL END), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        ELSE
            base_query := 'SELECT COALESCE(MIN(' || quote_ident(p_column_name) || '), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        END IF;
        
    ELSIF p_aggregation = 'MAX' THEN
        IF p_json_field IS NOT NULL THEN
            base_query := 'SELECT COALESCE(MAX(CASE WHEN ' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (' || quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ')::NUMERIC ELSE NULL END), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        ELSE
            base_query := 'SELECT COALESCE(MAX(' || quote_ident(p_column_name) || '), 0) as result FROM pype_voice_call_logs WHERE agent_id = $1';
        END IF;
        
    ELSE
        error_msg := 'Unsupported aggregation type: ' || p_aggregation;
        RETURN QUERY SELECT NULL::NUMERIC, error_msg;
        RETURN;
    END IF;

    -- Add date range conditions
    IF p_date_from IS NOT NULL THEN
        where_conditions := array_append(where_conditions, 
            'call_started_at >= ' || quote_literal(p_date_from || ' 00:00:00'));
    END IF;
    
    IF p_date_to IS NOT NULL THEN
        where_conditions := array_append(where_conditions, 
            'call_started_at <= ' || quote_literal(p_date_to || ' 23:59:59.999'));
    END IF;

    -- For COUNT operations with JSON fields, add the field existence check
    IF p_aggregation = 'COUNT' AND p_json_field IS NOT NULL THEN
        where_conditions := array_append(where_conditions,
            quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' IS NOT NULL AND ' ||
            quote_ident(p_column_name) || '->>' || quote_literal(p_json_field) || ' != ''''');
    END IF;

    -- Process custom filters
    FOR filter_item IN SELECT * FROM jsonb_array_elements(p_filters)
    LOOP
        filter_condition := build_single_filter_condition(filter_item);
        IF filter_condition IS NOT NULL AND filter_condition != '' THEN
            filter_conditions := array_append(filter_conditions, filter_condition);
        END IF;
    END LOOP;

    -- Build final WHERE clause
    final_where := '';
    IF array_length(where_conditions, 1) > 0 THEN
        final_where := ' AND ' || array_to_string(where_conditions, ' AND ');
    END IF;

    IF array_length(filter_conditions, 1) > 0 THEN
        IF p_filter_logic = 'OR' THEN
            final_where := final_where || ' AND (' || array_to_string(filter_conditions, ' OR ') || ')';
        ELSE
            final_where := final_where || ' AND (' || array_to_string(filter_conditions, ' AND ') || ')';
        END IF;
    END IF;

    base_query := base_query || final_where;

    -- Execute the query
    BEGIN
        EXECUTE base_query INTO rec USING p_agent_id;
        result_value := rec.result;
        RETURN QUERY SELECT COALESCE(result_value, 0), error_msg;
    EXCEPTION WHEN OTHERS THEN
        error_msg := 'Query execution error: ' || SQLERRM || ' | Query: ' || base_query;
        RETURN QUERY SELECT NULL::NUMERIC, error_msg;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get distinct values
CREATE OR REPLACE FUNCTION get_distinct_values(
  p_agent_id uuid,
  p_column_name text,
  p_json_field text DEFAULT NULL::text,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(distinct_value text, count_occurrences bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query_text TEXT;
BEGIN
  IF p_json_field IS NOT NULL THEN
    query_text := format('
      SELECT DISTINCT %I->>%L as distinct_value, 
             COUNT(*) as count_occurrences
      FROM pype_voice_call_logs 
      WHERE agent_id = $1 
        AND %I->>%L IS NOT NULL
      GROUP BY %I->>%L
      ORDER BY count_occurrences DESC, distinct_value
      LIMIT $2',
      p_column_name, p_json_field,
      p_column_name, p_json_field,
      p_column_name, p_json_field);
  ELSE
    query_text := format('
      SELECT DISTINCT %I::TEXT as distinct_value,
             COUNT(*) as count_occurrences
      FROM pype_voice_call_logs 
      WHERE agent_id = $1 
        AND %I IS NOT NULL
      GROUP BY %I
      ORDER BY count_occurrences DESC, distinct_value
      LIMIT $2',
      p_column_name,
      p_column_name,
      p_column_name);
  END IF;

  RETURN QUERY EXECUTE query_text USING p_agent_id, p_limit;
END;
$$;

-- Function to get available JSON fields
CREATE OR REPLACE FUNCTION get_available_json_fields(
  p_agent_id uuid,
  p_column_name text,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(field_name text, sample_value text, occurrences bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query_text TEXT;
BEGIN
  query_text := format('
    WITH json_keys AS (
      SELECT jsonb_object_keys(%I) as key_name, %I->>jsonb_object_keys(%I) as sample_val
      FROM pype_voice_call_logs 
      WHERE agent_id = $1 AND %I IS NOT NULL
      LIMIT 1000
    )
    SELECT 
      key_name as field_name,
      sample_val as sample_value,
      COUNT(*) as occurrences
    FROM json_keys
    GROUP BY key_name, sample_val
    ORDER BY occurrences DESC, key_name
    LIMIT $2',
    p_column_name, p_column_name, p_column_name, p_column_name);

  RETURN QUERY EXECUTE query_text USING p_agent_id, p_limit;
END;
$$;

-- Function to batch calculate custom totals
CREATE OR REPLACE FUNCTION batch_calculate_custom_totals(
  p_agent_id uuid,
  p_configs jsonb,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date
)
RETURNS TABLE(config_id text, result numeric, error_message text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  config_item JSONB;
  aggregation TEXT;
  column_name TEXT;
  json_field TEXT;
  filters JSONB;
  filter_logic TEXT;
  calc_result RECORD;
BEGIN
  FOR config_item IN SELECT * FROM jsonb_array_elements(p_configs)
  LOOP
    aggregation := config_item->>'aggregation';
    column_name := config_item->>'column';
    json_field := config_item->>'jsonField';
    filters := COALESCE(config_item->'filters', '[]'::jsonb);
    filter_logic := COALESCE(config_item->>'filterLogic', 'AND');

    SELECT * INTO calc_result
    FROM calculate_custom_total(
      p_agent_id,
      aggregation,
      column_name,
      json_field,
      filters,
      filter_logic,
      p_date_from,
      p_date_to
    );

    RETURN QUERY SELECT 
      config_item->>'id',
      calc_result.result,
      calc_result.error_message;
  END LOOP;
END;
$$;

-- Function to refresh call summary
CREATE OR REPLACE FUNCTION refresh_call_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY call_summary_materialized;
END;
$$;

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
-- USER AND SESSION MANAGEMENT FUNCTIONS
-- ==============================================

-- Function to create a new user session
CREATE OR REPLACE FUNCTION create_user_session(p_user_id uuid, p_expires_at timestamp with time zone)
RETURNS text AS $$
DECLARE
    session_token text;
BEGIN
    session_token := encode(gen_random_bytes(32), 'hex');
    
    INSERT INTO public.pype_voice_user_sessions (user_id, session_token, expires_at)
    VALUES (p_user_id, session_token, p_expires_at);
    
    RETURN session_token;
END;
$$ LANGUAGE plpgsql;

-- Function to validate a user session
CREATE OR REPLACE FUNCTION validate_user_session(p_session_token text)
RETURNS TABLE(user_id uuid, email text, is_admin boolean) AS $$
BEGIN
    RETURN QUERY
    SELECT u.id, u.email, u.is_admin
    FROM public.pype_voice_user_sessions s
    JOIN public.pype_voice_users u ON s.user_id = u.id
    WHERE s.session_token = p_session_token
    AND s.expires_at > now()
    AND u.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS integer AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM public.pype_voice_user_sessions 
    WHERE expires_at < now();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO whispey_user;

-- ==============================================
-- TRIGGERS
-- ==============================================

-- Trigger to automatically update updated_at on prompt changes
CREATE TRIGGER trigger_update_evaluation_prompt_updated_at
    BEFORE UPDATE ON public.pype_voice_evaluation_prompts
    FOR EACH ROW
    EXECUTE FUNCTION update_evaluation_prompt_updated_at();

-- Trigger to automatically update completion timestamp
CREATE TRIGGER trigger_update_evaluation_job_completion
    BEFORE UPDATE ON public.pype_voice_evaluation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_evaluation_job_completion();

-- ==============================================
-- INITIAL DATA
-- ==============================================

-- Create default admin user (password: admin123)
-- Note: In production, use a proper password hashing library
INSERT INTO public.pype_voice_users (email, first_name, last_name, password_hash, is_admin)
VALUES ('admin@whispey.local', 'Admin', 'User', crypt('admin123', gen_salt('bf')), true)
ON CONFLICT (email) DO NOTHING;

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW call_summary_materialized;

-- ==============================================
-- FINAL PERMISSIONS
-- ==============================================

-- Grant all permissions to whispey_user on all created objects
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO whispey_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO whispey_user;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO whispey_user;

-- ==============================================
-- SETUP COMPLETE
-- ==============================================

-- Display setup completion message
DO $$
BEGIN
    RAISE NOTICE 'Whispey database schema setup completed successfully!';
    RAISE NOTICE 'Default admin user created: admin@whispey.local / admin123';
    RAISE NOTICE 'Please change the default password after first login.';
    RAISE NOTICE 'Database user: whispey_user';
    RAISE NOTICE 'Remember to update the password in your .env.local file!';
END $$;