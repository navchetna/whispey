import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import { 
  createAudioDirectory, 
  extractZipFile, 
  downloadFileFromUrl, 
  getFileSize,
  isAudioFile
} from '@/utils/fileUtils'
import path from 'path'
import fs from "fs"

interface AudioFileRecord {
  file_name: string
  file_path: string
  file_size_bytes: number
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    // Extract form data
    const projectId = formData.get('project_id') as string
    const agentId = formData.get('agent_id') as string
    const uploadType = formData.get('upload_type') as string // 'zip' or 'url'
    
    // Validation
    if (!projectId || !agentId) {
      return NextResponse.json(
        { error: 'Project ID and Agent ID are required' },
        { status: 400 }
      )
    }

    // Validate that project and agent exist
    const projectResult = await query(
      'SELECT id FROM pype_voice_projects WHERE id = $1',
      [projectId]
    )
    
    if (projectResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const agentResult = await query(
      'SELECT id FROM pype_voice_agents WHERE id = $1 AND project_id = $2',
      [agentId, projectId]
    )
    
    if (agentResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Agent not found for this project' },
        { status: 404 }
      )
    }

    // Create directory structure: audio_files/{projectId}/{agentId}/
    const audioDirectory = await createAudioDirectory(projectId, agentId)
    console.log(`Created audio directory: ${audioDirectory}`)

    const audioFiles: AudioFileRecord[] = []
    let uploadedCount = 0

    if (uploadType === 'zip') {
      // Handle ZIP file upload
      const zipFile = formData.get('file') as File
      
      if (!zipFile) {
        return NextResponse.json(
          { error: 'ZIP file is required when upload_type is "zip"' },
          { status: 400 }
        )
      }

      console.log(`Processing ZIP file: ${zipFile.name} (${zipFile.size} bytes)`)

      // Read the ZIP file as buffer
      const zipBuffer = Buffer.from(await zipFile.arrayBuffer())
      
      // Extract audio files from ZIP
      const extractedFiles = await extractZipFile(zipBuffer, audioDirectory)
      console.log(`Extracted ${extractedFiles.length} audio files from ZIP`)

      // Process each extracted file
      for (const fileName of extractedFiles) {
        const filePath = path.join(audioDirectory, fileName)
        const fileSize = await getFileSize(filePath)
        
        audioFiles.push({
          file_name: fileName,
          file_path: filePath,
          file_size_bytes: fileSize
        })
      }

      uploadedCount = extractedFiles.length

    } else if (uploadType === 'audio') {
      // Handle direct audio file upload
      const audioFile = formData.get('file') as File
      
      if (!audioFile) {
        return NextResponse.json(
          { error: 'Audio file is required when upload_type is "audio"' },
          { status: 400 }
        )
      }

      // Validate file is an audio file
      if (!isAudioFile(audioFile.name)) {
        return NextResponse.json(
          { error: 'Invalid file type. Please upload an audio file (MP3, WAV, M4A, OGG, FLAC, AAC, WMA, OPUS)' },
          { status: 400 }
        )
      }

      console.log(`Processing audio file: ${audioFile.name} (${audioFile.size} bytes)`)

      try {
        // Read the file as buffer and save to disk
        const fileBuffer = Buffer.from(await audioFile.arrayBuffer())
        const fileName = audioFile.name
        const filePath = path.join(audioDirectory, fileName)
        
        // Write file to disk
        await fs.promises.writeFile(filePath, fileBuffer)
        const fileSize = await getFileSize(filePath)
        
        audioFiles.push({
          file_name: fileName,
          file_path: filePath,
          file_size_bytes: fileSize
        })

        uploadedCount = 1
      } catch (error) {
        console.error('Failed to save audio file:', error)
        return NextResponse.json(
          { error: `Failed to save audio file: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }

    } else if (uploadType === 'url') {
      // Handle URL download
      const fileUrl = formData.get('file_url') as string
      
      if (!fileUrl) {
        return NextResponse.json(
          { error: 'File URL is required when upload_type is "url"' },
          { status: 400 }
        )
      }

      console.log(`Downloading audio file from URL: ${fileUrl}`)

      try {
        const fileName = await downloadFileFromUrl(fileUrl, audioDirectory)
        const filePath = path.join(audioDirectory, fileName)
        const fileSize = await getFileSize(filePath)
        
        audioFiles.push({
          file_name: fileName,
          file_path: filePath,
          file_size_bytes: fileSize
        })

        uploadedCount = 1
      } catch (error) {
        console.error('Failed to download file from URL:', error)
        return NextResponse.json(
          { error: `Failed to download file from URL: ${error instanceof Error ? error.message : 'Unknown error'}` },
          { status: 500 }
        )
      }

    } else {
      return NextResponse.json(
        { error: 'Invalid upload_type. Must be "zip", "audio", or "url"' },
        { status: 400 }
      )
    }

    // Insert audio file records into database and create call logs
    const insertedRecords = []
    for (const audioFile of audioFiles) {
      try {
        // Insert into audio_files table (local storage only)
        const audioFileResult = await query(
          `INSERT INTO pype_voice_audio_files 
          (project_id, agent_id, file_name, file_path, file_size_bytes, status, upload_date, metadata) 
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7) 
          RETURNING *`,
          [
            projectId,
            agentId,
            audioFile.file_name,
            audioFile.file_path,
            audioFile.file_size_bytes,
            'pending',
            JSON.stringify({ local_path: audioFile.file_path })
          ]
        )
        
        const audioFileRecord = audioFileResult.rows[0]
        
        // Create a call log entry for this audio file
        // Use local file path as recording URL
        const localFileUrl = `/audios/${projectId}/${agentId}/${audioFile.file_name}`
        
        // Create call log immediately with 'pending' status
        // Status will be updated to 'completed' after transcription completes
        // call_started_at is set to NOW() - the upload date/time
        const callLogResult = await query(
          `INSERT INTO pype_voice_call_logs 
          (call_id, agent_id, recording_url, voice_recording_url, customer_number, 
           call_ended_reason, transcript_type, environment, created_at, call_started_at, metadata) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9) 
          RETURNING *`,
          [
            `uploaded-${audioFileRecord.id}`,
            agentId,
            localFileUrl,
            localFileUrl,
            'uploaded',
            'pending', // Will be updated to 'completed' after transcription
            'uploaded',
            'production',
            JSON.stringify({ 
              audio_file_id: audioFileRecord.id,
              original_filename: audioFile.file_name,
              upload_source: uploadType,
              local_path: audioFile.file_path
            })
          ]
        )
        
        insertedRecords.push({
          audio_file: audioFileRecord,
          call_log: callLogResult.rows[0]
        })
        
        console.log(`Created call log for: ${audioFile.file_name}`)
      } catch (error) {
        console.error(`Failed to process ${audioFile.file_name}:`, error)
      }
    }

    console.log(`Successfully uploaded ${uploadedCount} audio files to local storage`)

    // Trigger transcription for all uploaded audio files asynchronously
    if (insertedRecords.length > 0) {
      console.log(`Starting transcription for ${insertedRecords.length} audio file(s)...`)
      
      // Trigger transcription in background - don't await
      insertedRecords.forEach((record) => {
        // Call transcription API internally using the request context
        const formData = new FormData();

        const fileBuffer = fs.readFileSync(record.audio_file.file_path);  // read from disk
        const blob = new Blob([fileBuffer]);                              // convert to Blob
        formData.append('audio_file', blob, record.audio_file.file_name);

        formData.append('audio_file_id', String(record.audio_file.id));

        fetch(`http://localhost:${process.env.PORT || 3000}/api/transcribe`, {
          method: 'POST',
          body: formData, // No headers – fetch sets them automatically
        }).then(async (response) => {
          if (response.ok) {
            const result = await response.json()
            console.log(`Transcription completed for: ${record.audio_file.file_name}`)
          } else {
            const errorText = await response.text()
            console.error(`Failed transcription for: ${record.audio_file.file_name}`)
            console.error(`Status: ${response.status}, Response: ${errorText}`)
          }
        }).catch((error) => {
          console.error(`❌ Error in transcription for ${record.audio_file.file_name}:`, error)
        })
      })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${uploadedCount} audio file(s). Transcription started in background.`,
      uploaded_count: uploadedCount,
      files: insertedRecords.map(record => ({
        id: record.audio_file.id,
        file_name: record.audio_file.file_name,
        status: record.audio_file.status,
        upload_date: record.audio_file.upload_date,
        call_log_id: record.call_log.id,
        local_path: record.audio_file.file_path
      })),
      project_id: projectId,
      agent_id: agentId,
      directory: audioDirectory
    }, { status: 200 })

  } catch (error) {
    console.error('Error uploading audio files:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve audio files for a project/agent
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')
    const agentId = searchParams.get('agent_id')
    const status = searchParams.get('status')

    if (!projectId || !agentId) {
      return NextResponse.json(
        { error: 'Project ID and Agent ID are required' },
        { status: 400 }
      )
    }

    let queryText = `
      SELECT 
        id, 
        project_id, 
        agent_id, 
        file_name, 
        file_size_bytes, 
        status, 
        upload_date, 
        processed_at,
        metadata
      FROM pype_voice_audio_files 
      WHERE project_id = $1 AND agent_id = $2
    `
    const params: any[] = [projectId, agentId]

    if (status) {
      queryText += ` AND status = $3`
      params.push(status)
    }

    queryText += ` ORDER BY upload_date DESC`

    const result = await query(queryText, params)

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      files: result.rows
    }, { status: 200 })

  } catch (error) {
    console.error('Error fetching audio files:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
