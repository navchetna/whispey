import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/postgres'
import 'server-only'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agentId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!agentId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Missing required parameters: agentId, dateFrom, dateTo' },
        { status: 400 }
      )
    }

    // Query audio files stats from pype_voice_audio_files table
    const audioFilesResult = await query(
      `SELECT 
        DATE(COALESCE(upload_date, created_at)) as upload_date,
        COUNT(*) as total_files,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_files,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_files,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_files,
        COALESCE(SUM(file_size_bytes), 0) as total_size_bytes
      FROM pype_voice_audio_files
      WHERE agent_id = $1
        AND DATE(COALESCE(upload_date, created_at)) >= $2
        AND DATE(COALESCE(upload_date, created_at)) <= $3
      GROUP BY DATE(COALESCE(upload_date, created_at))
      ORDER BY upload_date ASC`,
      [agentId, dateFrom, dateTo]
    )

    // Query call logs created from audio uploads (for duration and transcription status)
    const callLogsResult = await query(
      `SELECT 
        DATE(COALESCE(call_started_at, created_at)) as call_date,
        COUNT(*) as total_calls,
        COUNT(CASE WHEN call_ended_reason = 'completed' THEN 1 END) as transcribed_calls,
        COUNT(CASE WHEN call_ended_reason = 'pending' THEN 1 END) as pending_calls,
        COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
        COALESCE(SUM(duration_seconds) / 60.0, 0) as total_minutes,
        COUNT(DISTINCT customer_number) as unique_files
      FROM pype_voice_call_logs
      WHERE agent_id = $1
        AND DATE(COALESCE(call_started_at, created_at)) >= $2
        AND DATE(COALESCE(call_started_at, created_at)) <= $3
      GROUP BY DATE(COALESCE(call_started_at, created_at))
      ORDER BY call_date ASC`,
      [agentId, dateFrom, dateTo]
    )

    // Combine data for daily stats (use call_logs for daily data since it has transcription status)
    const dailyData = callLogsResult.rows.map((row: any) => ({
      call_date: row.call_date,
      calls: parseInt(row.total_calls) || 0,
      total_minutes: parseFloat(row.total_minutes) || 0,
      successful_calls: parseInt(row.transcribed_calls) || 0,
      pending_calls: parseInt(row.pending_calls) || 0,
      avg_latency: 0, // Audio uploads don't have latency
      unique_customers: parseInt(row.unique_files) || 0,
      success_rate: row.total_calls > 0 
        ? Math.round((parseInt(row.transcribed_calls) / parseInt(row.total_calls)) * 100 * 100) / 100 
        : 0,
      total_cost: 0 // Audio uploads don't have LLM/TTS/STT costs
    }))

    // Calculate aggregate stats from audio files
    const aggregateStats = {
      total_audio_files: audioFilesResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.total_files), 0),
      processed_files: audioFilesResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.processed_files), 0),
      pending_files: audioFilesResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.pending_files), 0),
      failed_files: audioFilesResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.failed_files), 0),
      total_size_bytes: audioFilesResult.rows.reduce((sum: number, row: any) => sum + parseInt(row.total_size_bytes), 0)
    }

    return NextResponse.json({
      data: dailyData,
      audioStats: aggregateStats,
      isAudioUpload: true
    })
  } catch (error) {
    console.error('Error fetching audio overview data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch audio overview data' },
      { status: 500 }
    )
  }
}
