'use client'

import { useEffect, useState, useCallback } from 'react'

interface Filter {
  column: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in'
  value: any
}

interface QueryOptions {
  select?: string
  filters?: Filter[]
  orderBy?: string | { column: string; ascending?: boolean }
  limit?: number
  offset?: number
}

interface QueryResult<T> {
  data: T[] | null
  loading: boolean
  error: Error | null
  refetch: () => void
}

// Map table names to API endpoints
const tableToEndpoint = (table: string): string => {
  const mapping: Record<string, string> = {
    'pype_voice_agents': '/api/agents',
    'pype_voice_projects': '/api/projects',
    'pype_voice_call_logs': '/api/call-logs',
    'pype_voice_metrics_logs': '/api/metrics-logs',
    'pype_voice_evaluation_jobs': '/api/evaluations/jobs',
    'pype_voice_evaluation_prompts': '/api/evaluations/prompts',
    'pype_voice_evaluation_results': '/api/evaluations/results',
    'pype_voice_evaluation_summaries': '/api/evaluations/summaries',
  }
  return mapping[table] || `/api/${table.replace('pype_voice_', '')}`
}

// Build query parameters from options
const buildQueryParams = (options: QueryOptions = {}): string => {
  const params = new URLSearchParams()

  // Handle filters
  if (options.filters && options.filters.length > 0) {
    options.filters.forEach(filter => {
      if (filter.operator === 'eq') {
        params.append(filter.column, String(filter.value))
      }
    })
  }

  // Handle ordering
  if (options.orderBy) {
    if (typeof options.orderBy === 'string') {
      params.append('orderBy', options.orderBy)
      params.append('order', 'desc')
    } else {
      params.append('orderBy', options.orderBy.column)
      params.append('order', options.orderBy.ascending ? 'asc' : 'desc')
    }
  }

  // Handle pagination
  if (options.limit) {
    params.append('limit', String(options.limit))
  }
  if (options.offset) {
    params.append('offset', String(options.offset))
  }

  return params.toString()
}

export function useApiQuery<T = any>(
  table: string,
  options: QueryOptions = {}
): QueryResult<T> {
  const [data, setData] = useState<T[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const endpoint = tableToEndpoint(table)
      const queryParams = buildQueryParams(options)
      const url = queryParams ? `${endpoint}?${queryParams}` : endpoint

      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const result = await response.json()
      
      // Handle different response formats
      if (result.data) {
        setData(result.data)
      } else if (Array.isArray(result)) {
        setData(result)
      } else {
        setData([result])
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [table, JSON.stringify(options)])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    loading,
    error,
    refetch: fetchData
  }
}

// Infinite scroll hook
interface InfiniteScrollResult<T> {
  data: T[]
  loading: boolean
  hasMore: boolean
  error: Error | null
  loadMore: () => void
  refresh: () => void
}

export function useInfiniteScroll<T = any>(
  table: string,
  options: QueryOptions = {},
  pageSize: number = 50
): InfiniteScrollResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [offset, setOffset] = useState(0)

  const fetchData = useCallback(async (currentOffset: number, append: boolean = false) => {
    try {
      setLoading(true)
      setError(null)

      const endpoint = tableToEndpoint(table)
      const queryOptions = { ...options, limit: pageSize, offset: currentOffset }
      const queryParams = buildQueryParams(queryOptions)
      const url = queryParams ? `${endpoint}?${queryParams}` : endpoint

      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const result = await response.json()
      const newData = result.data || (Array.isArray(result) ? result : [result])

      if (append) {
        setData(prev => [...prev, ...newData])
      } else {
        setData(newData)
      }

      setHasMore(newData.length === pageSize)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
      if (!append) {
        setData([])
      }
    } finally {
      setLoading(false)
    }
  }, [table, JSON.stringify(options), pageSize])

  useEffect(() => {
    setOffset(0)
    fetchData(0, false)
  }, [fetchData])

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const newOffset = offset + pageSize
      setOffset(newOffset)
      fetchData(newOffset, true)
    }
  }, [loading, hasMore, offset, pageSize, fetchData])

  const refresh = useCallback(() => {
    setOffset(0)
    fetchData(0, false)
  }, [fetchData])

  return {
    data,
    loading,
    hasMore,
    error,
    loadMore,
    refresh
  }
}

// Backward compatibility alias
export const useSupabaseQuery = useApiQuery
