import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, existsSync, statSync } from 'fs'
import { query } from '@/lib/postgres'
import path from 'path'
import { Readable } from 'stream'

/**
 * GET /api/audio-local
 * Serves audio files from local storage
 * 
 * Query params:
 * - path: The relative audio path (e.g., /audios/{projectId}/{agentId}/{filename})
 * - audio_file_id: Optional audio file ID to look up the path from database
 * - call_log_id: Optional call log ID to look up the path from metadata
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const audioPath = searchParams.get('path')
    const audioFileId = searchParams.get('audio_file_id')
    const callLogId = searchParams.get('call_log_id')
    
    let filePath: string | null = null
    
    // Method 1: Direct path provided
    if (audioPath) {
      // Convert relative path to absolute path
      // Path format: /audios/{projectId}/{agentId}/{filename}
      const relativePath = audioPath.replace(/^\/audios\//, '')
      filePath = path.join(process.cwd(), 'audios', relativePath)
    }
    
    // Method 2: Look up by audio_file_id
    if (!filePath && audioFileId) {
      const result = await query(
        'SELECT file_path FROM pype_voice_audio_files WHERE id = $1',
        [audioFileId]
      )
      if (result.rows.length > 0) {
        filePath = result.rows[0].file_path
      }
    }
    
    // Method 3: Look up by call_log_id (from metadata)
    if (!filePath && callLogId) {
      const result = await query(
        `SELECT metadata->>'local_path' as local_path FROM pype_voice_call_logs WHERE id = $1`,
        [callLogId]
      )
      if (result.rows.length > 0 && result.rows[0].local_path) {
        filePath = result.rows[0].local_path
      }
    }
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'Audio path not provided. Use path, audio_file_id, or call_log_id parameter.' },
        { status: 400 }
      )
    }
    
    // Security: Ensure the path is within the audios directory
    const normalizedPath = path.normalize(filePath)
    const audiosDir = path.join(process.cwd(), 'audios')
    
    // Allow both paths within audios dir and absolute paths that exist
    const isInAudiosDir = normalizedPath.startsWith(audiosDir)
    const isValidPath = existsSync(normalizedPath)
    
    if (!isValidPath) {
      console.error(`Audio file not found: ${normalizedPath}`)
      return NextResponse.json(
        { error: 'Audio file not found' },
        { status: 404 }
      )
    }
    
    // Get file stats
    const stat = statSync(normalizedPath)
    const fileSize = stat.size
    
    // Determine content type from extension
    const ext = path.extname(normalizedPath).toLowerCase()
    let contentType = 'audio/mpeg' // default to mp3
    switch (ext) {
      case '.wav':
        contentType = 'audio/wav'
        break
      case '.ogg':
        contentType = 'audio/ogg'
        break
      case '.m4a':
        contentType = 'audio/mp4'
        break
      case '.aac':
        contentType = 'audio/aac'
        break
      case '.flac':
        contentType = 'audio/flac'
        break
      case '.webm':
        contentType = 'audio/webm'
        break
    }
    
    // Support range requests for seeking
    const range = request.headers.get('range')
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1
      
      // Create read stream for the range
      const stream = createReadStream(normalizedPath, { start, end })
      
      // Convert Node stream to Web stream
      const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>
      
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }
    
    // Full file request
    const stream = createReadStream(normalizedPath)
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>
    
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      },
    })
    
  } catch (error) {
    console.error('Error serving audio file:', error)
    return NextResponse.json(
      { error: 'Failed to serve audio file' },
      { status: 500 }
    )
  }
}

/**
 * HEAD request to check if audio exists and get metadata
 */
export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const audioPath = searchParams.get('path')
    
    if (!audioPath) {
      return new NextResponse(null, { status: 400 })
    }
    
    const relativePath = audioPath.replace(/^\/audios\//, '')
    const filePath = path.join(process.cwd(), 'audios', relativePath)
    
    if (!existsSync(filePath)) {
      return new NextResponse(null, { status: 404 })
    }
    
    const stat = statSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    let contentType = 'audio/mpeg'
    switch (ext) {
      case '.wav': contentType = 'audio/wav'; break
      case '.ogg': contentType = 'audio/ogg'; break
      case '.m4a': contentType = 'audio/mp4'; break
    }
    
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Length': String(stat.size),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      },
    })
    
  } catch (error) {
    return new NextResponse(null, { status: 500 })
  }
}
