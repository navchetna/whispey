'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, File, RefreshCw, Link as LinkIcon, CheckCircle, Clock, XCircle, AlertCircle, Trash2 } from 'lucide-react'

interface AudioUploadProps {
  projectId: string
  agentId: string
}

interface AudioFile {
  id: string
  file_name: string
  file_size_bytes: number
  status: 'pending' | 'processing' | 'processed' | 'failed'
  upload_date: string
  processed_at?: string
  metadata?: {
    s3_url?: string
  }
}

export default function AudioUpload({ projectId, agentId }: AudioUploadProps) {
  const [uploadType, setUploadType] = useState<'zip' | 'url'>('zip')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileUrl, setFileUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([])
  const [loadingAudioFiles, setLoadingAudioFiles] = useState(false)
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null)

  useEffect(() => {
    fetchAudioFiles()
  }, [projectId, agentId])

  const fetchAudioFiles = async () => {
    setLoadingAudioFiles(true)
    try {
      const response = await fetch(`/api/audio-upload?project_id=${projectId}&agent_id=${agentId}`)
      const result = await response.json()
      
      if (response.ok) {
        setAudioFiles(result.files || [])
      } else {
        console.error('Failed to fetch audio files:', result.error)
      }
    } catch (error) {
      console.error('Error fetching audio files:', error)
    } finally {
      setLoadingAudioFiles(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleAudioUpload = async () => {
    if (uploadType === 'zip' && !selectedFile) {
      alert('Please select a ZIP file to upload')
      return
    }

    if (uploadType === 'url' && !fileUrl) {
      alert('Please provide a file URL')
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('project_id', projectId)
      formData.append('agent_id', agentId)
      formData.append('upload_type', uploadType)

      if (uploadType === 'zip' && selectedFile) {
        formData.append('file', selectedFile)
      } else if (uploadType === 'url') {
        formData.append('file_url', fileUrl)
      }

      const response = await fetch('/api/audio-upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload audio files')
      }

      alert(`Successfully uploaded ${result.uploaded_count} audio file(s)!`)
      
      // Reset form
      setSelectedFile(null)
      setFileUrl('')
      
      // Refresh audio files list
      fetchAudioFiles()
    } catch (error) {
      console.error('Error uploading audio files:', error)
      alert(`Failed to upload audio files: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
    return <span className={`${baseClasses} bg-blue-100 text-blue-700`}>Uploaded</span>
  }

  const handleDeleteAudio = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"? This will also remove any associated call logs and evaluation results.`)) {
      return
    }

    setDeletingFileId(fileId)
    try {
      const response = await fetch(
        `/api/audio-upload?id=${fileId}&project_id=${projectId}&agent_id=${agentId}`,
        { method: 'DELETE' }
      )
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete audio file')
      }
      
      // Remove from local state
      setAudioFiles(prev => prev.filter(f => f.id !== fileId))
      console.log(`Deleted audio file: ${fileName}`)
    } catch (error) {
      console.error('Error deleting audio file:', error)
      alert(`Failed to delete audio file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeletingFileId(null)
    }
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Audio Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Type Selection */}
          <div className="flex gap-4">
            <button
              onClick={() => setUploadType('zip')}
              className={`flex-1 p-4 border-2 rounded-lg transition-all ${
                uploadType === 'zip'
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <File className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <div className="font-medium">Upload ZIP File</div>
              <div className="text-sm text-gray-500">Upload a ZIP containing audio files</div>
            </button>
            <button
              onClick={() => setUploadType('url')}
              className={`flex-1 p-4 border-2 rounded-lg transition-all ${
                uploadType === 'url'
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <LinkIcon className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <div className="font-medium">Download from URL</div>
              <div className="text-sm text-gray-500">Provide a direct link to audio file</div>
            </button>
          </div>

          {/* Upload Form */}
          {uploadType === 'zip' ? (
            <div className="space-y-2">
              <Label htmlFor="zipFile">Select ZIP File</Label>
              <Input
                id="zipFile"
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                disabled={uploading}
              />
              {selectedFile && (
                <p className="text-sm text-gray-600">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fileUrl">Audio File URL</Label>
              <Input
                id="fileUrl"
                type="url"
                placeholder="https://example.com/audio.mp3"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                disabled={uploading}
              />
            </div>
          )}

          <Button
            onClick={handleAudioUpload}
            disabled={uploading || (uploadType === 'zip' && !selectedFile) || (uploadType === 'url' && !fileUrl)}
            className="w-full"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload Audio Files
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Audio Files List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Uploaded Audio Files</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAudioFiles}
              disabled={loadingAudioFiles}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingAudioFiles ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAudioFiles ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : audioFiles.length === 0 ? (
            <div className="text-center py-12">
              <File className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No audio files uploaded yet</h3>
              <p className="text-gray-600 dark:text-gray-400">Upload audio files to start processing them for evaluation.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {audioFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <File className="w-5 h-5 text-gray-400" />
                    <div className="flex-1">
                      <div className="font-medium">{file.file_name}</div>
                      <div className="text-sm text-gray-500">
                        {(file.file_size_bytes / 1024 / 1024).toFixed(2)} MB • 
                        Uploaded {new Date(file.upload_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(file.status)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAudio(file.id, file.file_name)}
                      disabled={deletingFileId === file.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      {deletingFileId === file.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
