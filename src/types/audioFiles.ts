/**
 * Audio file types for the Whispey evaluation system
 */

export interface AudioFile {
  id: string
  project_id: string
  agent_id: string
  file_name: string
  file_path: string
  file_size_bytes: number
  status: 'pending' | 'processed' | 'failed'
  transcript?: string
  upload_date: string
  processed_at?: string
  error_message?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface AudioUploadRequest {
  project_id: string
  agent_id: string
  upload_type: 'zip' | 'url'
  file?: File
  file_url?: string
}

export interface AudioUploadResponse {
  success: boolean
  message: string
  uploaded_count: number
  files: Array<{
    id: string
    file_name: string
    status: string
    upload_date: string
  }>
  project_id: string
  agent_id: string
  directory: string
}

export interface AudioFilesListResponse {
  success: boolean
  count: number
  files: AudioFile[]
}
