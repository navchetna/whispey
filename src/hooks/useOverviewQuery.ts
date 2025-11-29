import { useState, useEffect } from 'react'

interface OverviewData {
  totalCalls: number
  totalMinutes: number
  successfulCalls: number
  successRate: number
  averageLatency: number
  totalCost: number
  uniqueCustomers: number
  dailyData: Array<{
    date: string
    dateKey: string
    calls: number
    minutes: number
  }>
  // Audio upload specific fields
  isAudioUpload?: boolean
  audioStats?: {
    totalAudioFiles: number
    processedFiles: number
    pendingFiles: number
    failedFiles: number
    totalSizeBytes: number
  }
}

interface UseOverviewQueryProps {
  agentId: string
  dateFrom: string // 'YYYY-MM-DD'
  dateTo: string   // 'YYYY-MM-DD'
  agentType?: string // 'audio_upload' or other types
}

export const useOverviewQuery = ({ agentId, dateFrom, dateTo }: UseOverviewQueryProps) => {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchOverviewData = async () => {
      try {
        setLoading(true)
        setError(null)
    
        // Fetch overview data via API
        const response = await fetch(`/api/overview?agentId=${agentId}&dateFrom=${dateFrom}&dateTo=${dateTo}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch overview data')
        }

        const { data: dailyStats } = await response.json()
            
        const totalCalls = dailyStats?.reduce((sum: number, day: any) => sum + parseInt(day.calls || 0), 0) || 0
        const successfulCalls = dailyStats?.reduce((sum: number, day: any) => sum + parseInt(day.successful_calls || 0), 0) || 0
        const totalCost = dailyStats?.reduce((sum: number, day: any) => sum + parseFloat(day.total_cost || 0), 0) || 0
        const uniqueCustomers = dailyStats?.reduce((sum: number, day: any) => sum + parseInt(day.unique_customers || 0), 0) || 0


    
        const typedData: OverviewData = {
          totalCalls,
          totalCost,
          totalMinutes: Math.round(dailyStats?.reduce((sum: number, day: any) => sum + parseFloat(day.total_minutes || 0), 0) || 0),
          successfulCalls,
          successRate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0,
          averageLatency: dailyStats && dailyStats.length > 0
            ? dailyStats.reduce((sum: number, day: any) => sum + parseFloat(day.avg_latency || 0), 0) / dailyStats.length
            : 0,
          uniqueCustomers,
          dailyData: dailyStats?.map((day: any) => ({
            date: day.call_date,
            dateKey: day.call_date,
            calls: parseInt(day.calls) || 0,
            minutes: Math.round(parseFloat(day.total_minutes) || 0),
            avg_latency: day.avg_latency
          })) || []
          
        }
    
        setData(typedData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    

    if (agentId && dateFrom && dateTo) {
      fetchOverviewData()
    }
  }, [agentId, dateFrom, dateTo])

  return { data, loading, error }
}