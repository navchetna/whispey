'use client'

import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, File, Link as LinkIcon, RefreshCw, X, FileAudio, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AudioUploadDialogProps {
  projectId: string
  agentId: string
  onUploadComplete?: () => void
}

type UploadType = 'files' | 'zip' | 'url'

export default function AudioUploadDialog({ projectId, agentId, onUploadComplete }: AudioUploadDialogProps) {
  const [open, setOpen] = useState(false)
  const [uploadType, setUploadType] = useState<UploadType>('files')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [fileUrl, setFileUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setSelectedFiles(Array.from(files))
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const resetForm = () => {
    setSelectedFiles([])
    setFileUrl('')
    setUploadProgress('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (uploadType === 'files' && selectedFiles.length === 0) {
      alert('Please select audio files to upload')
      return
    }

    if (uploadType === 'zip' && selectedFiles.length === 0) {
      alert('Please select a ZIP file to upload')
      return
    }

    if (uploadType === 'url' && !fileUrl) {
      alert('Please provide a file URL')
      return
    }

    setUploading(true)
    setUploadProgress('Preparing upload...')

    try {
      if (uploadType === 'files') {
        // Upload individual audio files using the 'audio' upload type
        setUploadProgress(`Uploading ${selectedFiles.length} file(s)...`)
        
        let successCount = 0
        const errors: string[] = []
        
        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i]
          setUploadProgress(`Uploading file ${i + 1} of ${selectedFiles.length}: ${file.name}`)
          
          const formData = new FormData()
          formData.append('project_id', projectId)
          formData.append('agent_id', agentId)
          formData.append('upload_type', 'audio') // Using audio upload type for single files
          formData.append('file', file)
          
          const response = await fetch('/api/audio-upload', {
            method: 'POST',
            body: formData
          })
          
          if (response.ok) {
            successCount++
          } else {
            const error = await response.json()
            console.error(`Failed to upload ${file.name}:`, error)
            errors.push(`${file.name}: ${error.error || 'Unknown error'}`)
          }
        }
        
        if (successCount > 0) {
          setUploadProgress(`Successfully uploaded ${successCount} of ${selectedFiles.length} file(s)!`)
          setTimeout(() => {
            resetForm()
            setOpen(false)
            onUploadComplete?.()
          }, 1500)
        } else {
          throw new Error(errors.length > 0 ? errors.join('\n') : 'No files were uploaded successfully')
        }
        
      } else if (uploadType === 'zip') {
        // Upload ZIP file
        const zipFile = selectedFiles[0]
        setUploadProgress(`Uploading ZIP file: ${zipFile.name}`)
        
        const formData = new FormData()
        formData.append('project_id', projectId)
        formData.append('agent_id', agentId)
        formData.append('upload_type', 'zip')
        formData.append('file', zipFile)
        
        const response = await fetch('/api/audio-upload', {
          method: 'POST',
          body: formData
        })
        
        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to upload ZIP file')
        }
        
        setUploadProgress(`Successfully uploaded ${result.uploaded_count} audio file(s)!`)
        setTimeout(() => {
          resetForm()
          setOpen(false)
          onUploadComplete?.()
        }, 1500)
        
      } else if (uploadType === 'url') {
        // Upload from URL
        setUploadProgress('Downloading audio from URL...')
        
        const formData = new FormData()
        formData.append('project_id', projectId)
        formData.append('agent_id', agentId)
        formData.append('upload_type', 'url')
        formData.append('file_url', fileUrl)
        
        const response = await fetch('/api/audio-upload', {
          method: 'POST',
          body: formData
        })
        
        const result = await response.json()
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to download from URL')
        }
        
        setUploadProgress('Successfully uploaded audio file!')
        setTimeout(() => {
          resetForm()
          setOpen(false)
          onUploadComplete?.()
        }, 1500)
      }
      
    } catch (error) {
      console.error('Error uploading audio files:', error)
      setUploadProgress('')
      alert(`Failed to upload: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  const getAcceptTypes = () => {
    if (uploadType === 'zip') return '.zip'
    return 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.wma'
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) resetForm()
    }}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <Upload className="h-4 w-4" />
          Upload Audio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Audio Files
          </DialogTitle>
          <DialogDescription>
            Upload audio files for transcription and analysis.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {/* Upload Type Selection */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                setUploadType('files')
                resetForm()
              }}
              disabled={uploading}
              className={cn(
                "flex flex-col items-center p-2.5 border-2 rounded-lg transition-all text-center",
                uploadType === 'files'
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                uploading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <FileAudio className="w-4 h-4 mb-1 text-primary" />
              <span className="text-xs font-medium">Audio Files</span>
            </button>
            <button
              onClick={() => {
                setUploadType('zip')
                resetForm()
              }}
              disabled={uploading}
              className={cn(
                "flex flex-col items-center p-2.5 border-2 rounded-lg transition-all text-center",
                uploadType === 'zip'
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                uploading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Archive className="w-4 h-4 mb-1 text-primary" />
              <span className="text-xs font-medium">ZIP File</span>
            </button>
            <button
              onClick={() => {
                setUploadType('url')
                resetForm()
              }}
              disabled={uploading}
              className={cn(
                "flex flex-col items-center p-2.5 border-2 rounded-lg transition-all text-center",
                uploadType === 'url'
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                uploading && 'opacity-50 cursor-not-allowed'
              )}
            >
              <LinkIcon className="w-4 h-4 mb-1 text-primary" />
              <span className="text-xs font-medium">From URL</span>
            </button>
          </div>

          {/* File Input for Audio Files and ZIP */}
          {(uploadType === 'files' || uploadType === 'zip') && (
            <div className="space-y-2">
              <Label htmlFor="audioFiles" className="text-sm">
                {uploadType === 'files' ? 'Select Audio Files' : 'Select ZIP File'}
              </Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                  "hover:border-primary/50 hover:bg-primary/5",
                  selectedFiles.length > 0 && "border-primary/30 bg-primary/5"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  id="audioFiles"
                  type="file"
                  accept={getAcceptTypes()}
                  multiple={uploadType === 'files'}
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                {selectedFiles.length === 0 ? (
                  <>
                    <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      {uploadType === 'files' 
                        ? 'Click to select audio files'
                        : 'Click to select a ZIP file'
                      }
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {uploadType === 'files'
                        ? 'MP3, WAV, OGG, M4A, FLAC, AAC'
                        : 'ZIP with audio files'
                      }
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-primary font-medium">
                    {selectedFiles.length} file(s) selected
                  </p>
                )}
              </div>
              
              {/* Selected Files List */}
              {selectedFiles.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1.5 border rounded-md p-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs"
                    >
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-muted-foreground flex-shrink-0">
                          ({formatFileSize(file.size)})
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 ml-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFile(index)
                        }}
                        disabled={uploading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* URL Input */}
          {uploadType === 'url' && (
            <div className="space-y-2">
              <Label htmlFor="fileUrl" className="text-sm">Audio File URL</Label>
              <Input
                id="fileUrl"
                type="url"
                placeholder="https://example.com/audio.mp3"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                disabled={uploading}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Direct link to an audio file (MP3, WAV, etc.)
              </p>
            </div>
          )}

          {/* Upload Progress */}
          {uploadProgress && (
            <div className="flex items-center gap-2 p-2.5 bg-primary/10 rounded-lg">
              {uploading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary flex-shrink-0" />}
              <span className="text-xs text-primary">{uploadProgress}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetForm()
              setOpen(false)
            }}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={
              uploading ||
              (uploadType !== 'url' && selectedFiles.length === 0) ||
              (uploadType === 'url' && !fileUrl)
            }
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
