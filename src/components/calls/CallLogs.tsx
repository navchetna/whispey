"use client"

import type React from "react"
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Phone, Clock, CheckCircle, XCircle, Loader2, AlertCircle, RefreshCw, Play, Pause, User, Bot, ExternalLink, Languages, Trash2 } from "lucide-react"
import { useInfiniteScroll } from "../../hooks/useApi"
import CallFilter, { FilterRule } from "../CallFilter"
import ColumnSelector from "../shared/ColumnSelector"
import AudioUploadDialog from "./AudioUploadDialog"
import { cn } from "@/lib/utils"
import { CostTooltip } from "../tool-tip/costToolTip"
import { CallLog } from "../../types/logs"
import Papa from 'papaparse'
import { useLocalUser } from "../../lib/local-auth"
import { useRouter } from "next/navigation"
import { SlidePanel, SlidePanelSection } from "@/components/ui/slide-panel"
import AudioPlayer from "@/components/AudioPlayer"
import { extractS3Key } from "@/utils/s3"

interface CallLogsProps {
  project: any
  agent: any
  onBack: () => void
  isLoading?: boolean
}

// Skeleton for the filter header
function FilterHeaderSkeleton() {
  return (
    <div className="flex-none p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted animate-pulse rounded w-48"></div>
        <div className="flex items-center gap-2">
          <div className="h-8 bg-muted animate-pulse rounded w-24"></div>
          <div className="h-8 bg-muted animate-pulse rounded w-24"></div>
          <div className="h-8 bg-muted animate-pulse rounded w-8"></div>
        </div>
      </div>
    </div>
  )
}

// Skeleton for table structure
function TableSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="h-full overflow-x-auto overflow-y-hidden">
        <div className="h-full overflow-y-auto" style={{ minWidth: "1020px" }}>
          <Table className="w-full">
            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b-2">
              <TableRow className="bg-muted/80 hover:bg-muted/80">
                <TableHead className="font-semibold text-foreground min-w-[120px]">Customer Number</TableHead>
                <TableHead className="font-semibold text-foreground min-w-[120px]">Call ID</TableHead>
                <TableHead className="font-semibold text-foreground min-w-[120px]">Call Status</TableHead>
                <TableHead className="font-semibold text-foreground min-w-[120px]">Duration</TableHead>
                <TableHead className="font-semibold text-foreground min-w-[120px]">Start Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Table row skeletons */}
              {Array.from({ length: 8 }).map((_, index) => (
                <TableRow key={index} className="border-b border-border/50">
                  <TableCell className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-muted animate-pulse rounded-full"></div>
                      <div className="h-5 w-24 bg-muted animate-pulse rounded"></div>
                    </div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="h-6 w-16 bg-muted animate-pulse rounded-md"></div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="h-6 w-20 bg-muted animate-pulse rounded-full"></div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="h-5 w-12 bg-muted animate-pulse rounded"></div>
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="h-5 w-32 bg-muted animate-pulse rounded"></div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function flattenAndPickColumns(
  row: CallLog,
  basic: string[],
  metadata: string[],
  transcription: string[]
): Record<string, any> {
  const flat: Record<string, any> = {};

  // Basic columns (skip "total_cost")
  for (const key of basic) {
    if (key in row) {
      flat[key] = row[key as keyof CallLog];
    }
  }

  // Metadata columns
  if (row.metadata && typeof row.metadata === "object") {
    for (const key of metadata) flat[key] = row.metadata[key];
  }

  // Transcription metrics columns
  if (row.transcription_metrics && typeof row.transcription_metrics === "object") {
    for (const key of transcription) flat[key] = row.transcription_metrics[key];
  }

  return flat;
}

const TruncatedText: React.FC<{ 
  text: string; 
  maxLength?: number;
  className?: string;
}> = ({ text, maxLength = 30, className = "" }) => {
  const truncated = text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("break-words", className)}>
          {truncated}
        </span>
      </TooltipTrigger>
      {text.length > maxLength && (
        <TooltipContent
          sideOffset={6}
          className="pointer-events-auto max-w-[420px] max-h-64 overflow-auto break-words"
        >
          {text}
        </TooltipContent>
      )}
    </Tooltip>
  )
}

// Dynamic JSON Cell Component
const DynamicJsonCell: React.FC<{ 
  data: any; 
  fieldKey: string;
  maxWidth?: string;
}> = ({ data, fieldKey, maxWidth = "180px" }) => {
  if (!data || typeof data !== 'object') {
    return <span className="text-muted-foreground text-xs">-</span>
  }

  const value = data[fieldKey]
  
  if (value === undefined || value === null) {
    return <span className="text-muted-foreground text-xs">-</span>
  }

  // Handle different data types
  if (typeof value === 'object') {
    const jsonString = JSON.stringify(value, null, 2)
    const truncatedJson = jsonString.length > 80 ? jsonString.substring(0, 80) + '...' : jsonString
    
    return (
      <div 
        className="w-full max-w-full overflow-hidden border rounded-md bg-muted/20"
        style={{ maxWidth }}
      >
        <div className="p-1.5 w-full overflow-hidden">
          <Tooltip>
            <TooltipTrigger asChild>
              <pre 
                className="text-xs font-mono text-foreground whitespace-pre-wrap break-all overflow-hidden w-full"
                style={{ 
                  wordBreak: 'break-all',
                  overflowWrap: 'break-word',
                  maxWidth: '100%'
                }}
              >
                {truncatedJson}
              </pre>
            </TooltipTrigger>
            <TooltipContent
              sideOffset={6}
              className="pointer-events-auto max-w-[520px] max-h-64 overflow-auto whitespace-pre-wrap break-words"
            >
              {jsonString}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    )
  }

  // Handle primitive values - truncate long strings
  const stringValue = String(value)
  const shouldTruncate = stringValue.length > 25
  const displayValue = shouldTruncate ? stringValue.substring(0, 25) + '...' : stringValue

  return (
    <div 
      className="text-xs w-full overflow-hidden" 
      style={{ maxWidth }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span 
            className="text-foreground font-medium block w-full overflow-hidden"
            style={{ 
              wordBreak: 'break-all',
              overflowWrap: 'break-word',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {displayValue}
          </span>
        </TooltipTrigger>
        {shouldTruncate && (
          <TooltipContent
            sideOffset={6}
            className="pointer-events-auto max-w-[420px] max-h-64 overflow-auto break-words"
          >
            {stringValue}
          </TooltipContent>
        )}
      </Tooltip>
    </div>
  )
}

const CallLogs: React.FC<CallLogsProps> = ({ project, agent, onBack, isLoading: parentLoading }) => {
  const router = useRouter()

  // Convert string to camelCase
  function toCamelCase(str: string) {
    return str
      .replace(/[^\w\s]/g, '')
      .replace(/\s+(.)/g, (_, c) => c.toUpperCase())
      .replace(/^./, c => c.toLowerCase())
  }

  const basicColumns = useMemo(
    () => [
      { key: "customer_number", label: "Customer Number" },
      { key: "call_id", label: "Call ID" },
      { key: "call_ended_reason", label: "Call Status" },
      { key: "duration_seconds", label: "Duration (min)" },
      {
        key: "total_cost",
        label: "Total Cost (₹)",
      },
      { key: "call_started_at", label: "Start Time" },
      { key: "avg_latency", label: "Avg Latency (ms)", hidden: true },
      { key: "total_llm_cost", label: "LLM Cost (₹)", hidden: true },
      { key: "total_tts_cost", label: "TTS Cost (₹)", hidden: true },
      { key: "total_stt_cost", label: "STT Cost (₹)", hidden: true }
    ],
    [],
  )

  const ROLE_RESTRICTIONS = {
    user: [
      'total_cost',
      'total_llm_cost', 
      'total_tts_cost',
      'total_stt_cost',
      'avg_latency'
    ],
  }

  const isColumnVisibleForRole = (columnKey: string, role: string | null): boolean => {
    if (!role) return false
    
    const restrictedColumns = ROLE_RESTRICTIONS[role as keyof typeof ROLE_RESTRICTIONS]
    if (!restrictedColumns) return true
    
    return !restrictedColumns.includes(columnKey)
  }

  const dynamicColumnsKey = (() => {
    if (!agent?.field_extractor_prompt) return []
    try {
      const prompt = agent.field_extractor_prompt;
      if (typeof prompt === 'string') {
        const parsed = JSON.parse(prompt);
        return Array.isArray(parsed) ? parsed.map((item: any) => toCamelCase(item.key)) : [];
      } else if (Array.isArray(prompt)) {
        return prompt.map((item: any) => toCamelCase(item.key));
      }
      return [];
    } catch (error) {
      console.error('Error parsing field_extractor_prompt:', error);
      return [];
    }
  })();

  const [roleLoading, setRoleLoading] = useState(true)
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null)
  const [slidePanelOpen, setSlidePanelOpen] = useState(false)
  const [activeFilters, setActiveFilters] = useState<FilterRule[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<{
    basic: string[]
    metadata: string[]
    transcription_metrics: string[]
  }>({
    basic: basicColumns.filter(col => !col.hidden).map(col => col.key),
    metadata: [],
    transcription_metrics: []
  })
  
  // Column order state with localStorage persistence
  const [columnOrder, setColumnOrder] = useState<{
    basic: string[]
    metadata: string[]
    transcription_metrics: string[]
  }>(() => {
    // Initialize from localStorage if available
    if (typeof window !== 'undefined' && project?.id) {
      try {
        const stored = localStorage.getItem(`column-order-${project.id}`)
        if (stored) {
          return JSON.parse(stored)
        }
      } catch (e) {
        console.error('Failed to load column order from localStorage:', e)
      }
    }
    return {
      basic: basicColumns.filter(col => !col.hidden).map(col => col.key),
      metadata: [],
      transcription_metrics: []
    }
  })

  // Handle column order changes
  const handleColumnOrderChange = useCallback((type: "basic" | "metadata" | "transcription_metrics", newOrder: string[]) => {
    setColumnOrder(prev => {
      const updated = { ...prev, [type]: newOrder }
      // Persist to localStorage
      if (project?.id) {
        try {
          localStorage.setItem(`column-order-${project.id}`, JSON.stringify(updated))
        } catch (e) {
          console.error('Failed to persist column order:', e)
        }
      }
      return updated
    })
  }, [project?.id])

  // Handle opening call details in slide panel
  const handleCallClick = useCallback((call: CallLog) => {
    setSelectedCall(call)
    setSlidePanelOpen(true)
  }, [])

  // Handle closing slide panel
  const handleCloseSidePanel = useCallback(() => {
    setSlidePanelOpen(false)
    setSelectedCall(null)
  }, [])

  const getFilteredBasicColumns = useMemo(() => {
    return basicColumns.filter(col => 
      !col.hidden && isColumnVisibleForRole(col.key, role)
    )
  }, [role])

  const { user } = useLocalUser()
  const userEmail = user?.email

  // Load user role first
  useEffect(() => {
    if (userEmail && project?.id) {
      const getUserRole = async () => {
        setRoleLoading(true)
        try {
          const response = await fetch(`/api/user/role?email=${encodeURIComponent(userEmail)}&projectId=${encodeURIComponent(project.id)}`)
          if (!response.ok) throw new Error('Failed to fetch role')
          const userRole = await response.json()
          setRole(userRole.role)
        } catch (error) {
          console.error('Failed to load user role:', error)
          setRole('user')
        } finally {
          setRoleLoading(false)
        }
      }
      getUserRole()
    } else {
      setRoleLoading(false)
      setRole('user')
    }
  }, [userEmail, project?.id])

  // Update visible columns when role changes
  useEffect(() => {
    if (role !== null) {
      const allowedBasicColumns = getFilteredBasicColumns.map(col => col.key)
      setVisibleColumns(prev => ({
        ...prev,
        basic: allowedBasicColumns
      }))
    }
  }, [role, getFilteredBasicColumns])

  // Convert FilterRule[] to Supabase filter format
  const convertToSupabaseFilters = (filters: FilterRule[]): Array<{
    column: string
    operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in'
    value: any
  }> => {
    if (!agent?.id) return []
    
    const supabaseFilters: Array<{
      column: string
      operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in'
      value: any
    }> = [{ column: "agent_id", operator: "eq", value: agent.id }]
    
    filters.forEach(filter => {
      const getColumnName = (forTextOperation = false) => {
        if (!filter.jsonField) return filter.column
        
        if (forTextOperation) {
          return `${filter.column}->>${filter.jsonField}`
        } else {
          return `${filter.column}->${filter.jsonField}`
        }
      }
      
      switch (filter.operation) {
        case 'equals':
          if (filter.column === 'call_started_at') {
            const startOfDay = `${filter.value} 00:00:00`
            const endOfDay = `${filter.value} 23:59:59.999`
            supabaseFilters.push({ 
              column: filter.column, 
              operator: 'gte', 
              value: startOfDay
            })
            supabaseFilters.push({ 
              column: filter.column, 
              operator: 'lte', 
              value: endOfDay
            })
          } else {
            supabaseFilters.push({ 
              column: getColumnName(false), 
              operator: 'eq', 
              value: filter.value 
            })
          }
          break
          
        case 'contains':
          supabaseFilters.push({ 
            column: getColumnName(true),
            operator: 'ilike', 
            value: `%${filter.value}%` 
          })
          break
          
        case 'starts_with':
          supabaseFilters.push({ 
            column: getColumnName(true),
            operator: 'ilike', 
            value: `${filter.value}%` 
          })
          break
          
        case 'greater_than':
          if (filter.column === 'call_started_at') {
            const nextDay = new Date(filter.value)
            nextDay.setDate(nextDay.getDate() + 1)
            const nextDayStr = nextDay.toISOString().split('T')[0]
            supabaseFilters.push({ 
              column: filter.column, 
              operator: 'gte', 
              value: `${nextDayStr} 00:00:00`
            })
          } else {
            supabaseFilters.push({ 
              column: getColumnName(false), 
              operator: 'gt', 
              value: filter.value 
            })
          }
          break
          
        case 'less_than':
          if (filter.column === 'call_started_at') {
            supabaseFilters.push({ 
              column: filter.column, 
              operator: 'lt', 
              value: `${filter.value} 00:00:00`
            })
          } else {
            supabaseFilters.push({ 
              column: getColumnName(false), 
              operator: 'lt', 
              value: filter.value 
            })
          }
          break

        case 'json_equals':
          supabaseFilters.push({ 
            column: getColumnName(true),
            operator: 'eq', 
            value: filter.value 
          })
          break
          
        case 'json_contains':
          supabaseFilters.push({ 
            column: getColumnName(true),
            operator: 'ilike', 
            value: `%${filter.value}%` 
          })
          break
          
        case 'json_greater_than':
          supabaseFilters.push({ 
            column: `${getColumnName(false)}::numeric`, 
            operator: 'gt', 
            value: parseFloat(filter.value) 
          })
          break
          
        case 'json_less_than':
          supabaseFilters.push({ 
            column: `${getColumnName(false)}::numeric`, 
            operator: 'lt', 
            value: parseFloat(filter.value) 
          })
          break
          
        case 'json_exists':
          supabaseFilters.push({ 
            column: getColumnName(false),
            operator: 'neq', 
            value: null 
          })
          break
          
        default:
          console.warn(`Unknown filter operation: ${filter.operation}`)
          break
      }
    })
    
    return supabaseFilters
  }

  const queryOptions = useMemo(() => {
    if (!agent?.id || !role) return undefined

    // Build select clause based on role permissions
    let selectColumns = [
      'id',
      'agent_id',
      'call_id',
      'customer_number',
      'call_ended_reason',
      'call_started_at',
      'call_ended_at',
      'duration_seconds',
      'recording_url',
      'metadata',
      'environment',
      'transcript_type',
      'transcript_json',
      'created_at',
      'transcription_metrics'
    ]

    // Add role-restricted columns only if user has permission
    if (isColumnVisibleForRole('avg_latency', role)) {
      selectColumns.push('avg_latency')
    }
    
    if (isColumnVisibleForRole('total_llm_cost', role)) {
      selectColumns.push('total_llm_cost', 'total_tts_cost', 'total_stt_cost')
    }

    if (!agent?.id) return {}

    return {
      select: selectColumns.join(','),
      filters: convertToSupabaseFilters(activeFilters),
      orderBy: { column: "created_at", ascending: false },
      limit: 50,
    }
  }, [agent?.id, activeFilters, role])

  const { data: calls, loading, hasMore, error, loadMore, refresh } = useInfiniteScroll(
    "pype_voice_call_logs", 
    queryOptions,
  )

  // Extract all unique keys from metadata and transcription_metrics across all calls
  const dynamicColumns = useMemo(() => {
    const metadataKeys = new Set<string>()
    const transcriptionKeys = new Set<string>()

    calls.forEach((call: CallLog) => {
      if (call.metadata && typeof call.metadata === 'object') {
        Object.keys(call.metadata).forEach(key => metadataKeys.add(key))
      }

      if (call.transcription_metrics && typeof call.transcription_metrics === 'object') {
        Object.keys(call.transcription_metrics).forEach(key => transcriptionKeys.add(key))
      }
    })

    return {
      metadata: Array.from(metadataKeys).sort(),
      transcription_metrics: Array.from(transcriptionKeys).sort()
    }
  }, [calls])

  // Initialize visible columns when dynamic columns change
  useEffect(() => {
    setVisibleColumns((prev) => ({
      basic: prev.basic ?? basicColumns.map((col) => col.key),
      metadata: Array.from(
        new Set(
          (prev.metadata.length === 0 ? dynamicColumns.metadata : prev.metadata.filter((col) => dynamicColumns.metadata.includes(col)))
        )
      ),
      transcription_metrics: dynamicColumnsKey
    }))
  }, [dynamicColumns, basicColumns, JSON.stringify(dynamicColumnsKey)])

  const handleColumnChange = (type: 'basic' | 'metadata' | 'transcription_metrics', column: string, visible: boolean) => {
    setVisibleColumns(prev => ({
      ...prev,
      [type]: visible 
        ? [...prev[type], column]
        : prev[type].filter(col => col !== column)
    }))
  }
    
  const handleSelectAll = (type: 'basic' | 'metadata' | 'transcription_metrics', visible: boolean) => {
    setVisibleColumns(prev => ({
      ...prev,
      [type]: visible
        ? (type === "basic" ? basicColumns.map(col => col.key) : dynamicColumns[type])
        : []
    }))
  }

  const handleDownloadCSV = async () => {
    if (!agent?.id) return
    
    const { basic, metadata, transcription_metrics } = visibleColumns;

    const selectColumns = [
      'id',
      'agent_id',
      ...basic.filter(col => col !== "total_cost"),
      ...(metadata.length > 0 ? ['metadata'] : []),
      ...(transcription_metrics.length > 0 ? ['transcription_metrics'] : []),
    ];

    try {
      // Fetch all data using the API
      const params = new URLSearchParams()
      params.append('agent_id', agent.id)
      params.append('limit', '10000') // Large limit to get all data
      params.append('orderBy', 'created_at')
      params.append('order', 'desc')

      const response = await fetch(`/api/call-logs?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch data for export')
      }

      const result = await response.json()
      const allData: CallLog[] = result.data || []

      if (allData.length === 0) {
        alert("No data found to export");
        return;
      }

      const csvData = allData.map((row) => {
        const flattened = flattenAndPickColumnsFixed(row, basic, metadata, transcription_metrics);
        return flattened;
      });

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `call_logs_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Download error:', error);
      alert("Failed to download CSV: " + (error as Error).message);
    }
  };

  function flattenAndPickColumnsFixed(
    row: CallLog,
    basic: string[],
    metadata: string[],
    transcription: string[]
  ): Record<string, any> {
    const flat: Record<string, any> = {};

    for (const key of basic) {
      if (key in row && key !== 'total_cost') {
        flat[key] = row[key as keyof CallLog];
      }
    }

    if (basic.includes('total_cost')) {
      const totalCost = (row.total_llm_cost || 0) + (row.total_tts_cost || 0) + (row.total_stt_cost || 0);
      flat['total_cost'] = totalCost;
    }

    if (row.metadata && typeof row.metadata === "object" && metadata.length > 0) {
      for (const key of metadata) {
        const value = row.metadata[key];
        flat[`metadata_${key}`] = value !== undefined && value !== null 
          ? (typeof value === 'object' ? JSON.stringify(value) : String(value))
          : '';
      }
    } else if (metadata.length > 0) {
      for (const key of metadata) {
        flat[`metadata_${key}`] = '';
      }
    }

    if (row.transcription_metrics && typeof row.transcription_metrics === "object" && transcription.length > 0) {
      for (const key of transcription) {
        const value = row.transcription_metrics[key];
        flat[`transcription_${key}`] = value !== undefined && value !== null 
          ? (typeof value === 'object' ? JSON.stringify(value) : String(value))
          : '';
      }
    } else if (transcription.length > 0) {
      for (const key of transcription) {
        flat[`transcription_${key}`] = '';
      }
    }

    return flat;
  }

  const totalVisibleColumns = visibleColumns.metadata.length + visibleColumns.transcription_metrics.length
  const baseWidth = 1020
  const dynamicWidth = totalVisibleColumns * 200
  const minTableWidth = baseWidth + dynamicWidth

  const loadMoreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (queryOptions) {
      refresh()
    }
  }, [activeFilters, queryOptions])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 },
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loading, loadMore])

  const handleFiltersChange = (filters: FilterRule[]) => {
    setActiveFilters(filters)
  }

  const handleClearFilters = () => {
    setActiveFilters([])
  }

  const handleRefresh = () => {
    if (queryOptions) {
      refresh()
    }
  }

  const formatDuration = (seconds: number) => {
    // Round to whole seconds (no decimals)
    const roundedSeconds = Math.round(seconds)
    const mins = Math.floor(roundedSeconds / 60)
    const secs = roundedSeconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const formatToIndianDateTime = (timestamp: any) => {
    const date = new Date(timestamp)
    const indianTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000))
    
    return indianTime.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  // Show skeleton while parent is loading OR role is loading
  if (parentLoading || roleLoading || !agent || !project || loading) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <FilterHeaderSkeleton />
        <TableSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-none p-4 border-b bg-background/95 dark:bg-gray-900/95">
          <div className="flex items-center justify-between">
            <div className="h-8 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 rounded-lg flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Unable to load calls
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Unable to load calls</h3>
            <p className="text-gray-600 dark:text-gray-400">{error?.message}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Project/Agent Header */}
      <div className="px-4 pt-4 pb-2 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-800 dark:text-slate-200">{project?.name || 'Unknown Project'}</span>
          <span>/</span>
          <span className="font-medium text-slate-800 dark:text-slate-200">{agent?.name || 'Unknown Agent'}</span>
        </div>
      </div>

      {/* Header with Filters and Column Selector - Now shows immediately */}
      <div className="flex-none p-4 border-b border-gray-200 dark:border-gray-700 bg-background/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between">
          <CallFilter 
            onFiltersChange={handleFiltersChange}
            onClear={handleClearFilters}
            availableMetadataFields={dynamicColumns.metadata}
            availableTranscriptionFields={dynamicColumnsKey}
            activeFilters={activeFilters}
          />
          
          <div className="flex items-center gap-2">
            <AudioUploadDialog
              projectId={project?.id}
              agentId={agent?.id}
              onUploadComplete={handleRefresh}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadCSV}
              disabled={loading || !agent?.id}
              className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Download CSV
            </Button>
            <ColumnSelector
              basicColumns={basicColumns.map((col) => col.key)}
              basicColumnLabels={Object.fromEntries(basicColumns.filter(col => !col.hidden).map((col) => [col.key, col.label]))}
              metadataColumns={dynamicColumns.metadata}
              transcriptionColumns={dynamicColumnsKey}
              visibleColumns={visibleColumns}
              columnOrder={columnOrder}
              projectId={project?.id}
              onColumnChange={handleColumnChange}
              onSelectAll={handleSelectAll}
              onColumnOrderChange={handleColumnOrderChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading}
              className="gap-2 h-8 w-8 p-0 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-y-auto min-h-0">
          <div className="h-full overflow-x-auto overflow-y-hidden">
            <div className="h-full overflow-y-auto" style={{ minWidth: `${minTableWidth}px` }}>
              <Table className="w-full">
                <TableHeader className="sticky top-0 z-10 bg-background/95 dark:bg-gray-900/95 backdrop-blur-sm border-b-2">
                  <TableRow className="bg-muted/80 dark:bg-gray-800/80 hover:bg-muted/80 dark:hover:bg-gray-800/80">
                    {/* Fixed Columns - use columnOrder for ordering */}
                    {(columnOrder.basic.length > 0 ? columnOrder.basic : visibleColumns.basic)
                      .filter(key => visibleColumns.basic.includes(key))
                      .map((key) => {
                        const col = basicColumns.find((c) => c.key === key)
                        return (
                          <TableHead key={`basic-${key}`} className="font-semibold text-foreground dark:text-gray-100 min-w-[120px]">
                            {col?.label ?? key}
                          </TableHead>
                        )
                      })}

                    {/* Dynamic Metadata Columns - use columnOrder for ordering */}
                    {(columnOrder.metadata.length > 0 ? columnOrder.metadata : visibleColumns.metadata)
                      .filter(key => visibleColumns.metadata.includes(key))
                      .map((key) => (
                        <TableHead 
                          key={`metadata-${key}`} 
                          className="w-[200px] font-semibold text-foreground dark:text-gray-100 bg-blue-50/50 dark:bg-blue-950/20 border-r border-blue-200/50 dark:border-blue-800/50"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm">{key}</span>
                          </div>
                        </TableHead>
                      ))}
                    
                    {/* Dynamic Transcription Metrics Columns - use columnOrder for ordering */}
                    {(columnOrder.transcription_metrics.length > 0 ? columnOrder.transcription_metrics : visibleColumns.transcription_metrics)
                      .filter(key => visibleColumns.transcription_metrics.includes(key))
                      .map((key, index) => (
                        <TableHead 
                          key={`transcription-${key}`} 
                          className={cn(
                            "w-[200px] font-semibold text-foreground dark:text-gray-100 bg-blue-50/50 dark:bg-blue-950/20",
                            index === 0 && visibleColumns.metadata.length === 0 && "border-l-2 border-primary/30 dark:border-primary/40",
                            index < visibleColumns.transcription_metrics.length - 1 && "border-r border-blue-200/50 dark:border-blue-800/50"
                          )}
                        >
                          <div className="flex flex-col">
                            <span className="text-sm">{key}</span>
                          </div>
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="overflow-auto">
                  {calls.map((call: CallLog) => (
                    <TableRow
                      key={call.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/30 dark:hover:bg-gray-800/50 transition-all duration-200 border-b border-border/50 dark:border-gray-700/50",
                        selectedCall?.id === call.id && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500",
                      )}
                      onClick={() => handleCallClick(call)}
                    >
                      {(columnOrder.basic.length > 0 ? columnOrder.basic : visibleColumns.basic)
                        .filter(key => visibleColumns.basic.includes(key))
                        .map((key) => {
                          let value: React.ReactNode = "-"

                          switch (key) {
                            case "customer_number":
                              value = (
                                <div className="flex w-full items-center gap-3">
                                  <div className="w-10 h-8 rounded-full flex items-center justify-center">
                                    <Phone className="w-4 h-4 text-primary dark:text-primary" />
                                </div>
                                <span className="font-medium text-gray-900 dark:text-gray-100">{call.customer_number}</span>
                              </div>
                            )
                            break
                          case "call_id":
                            value = (
                              <code className="text-xs bg-muted/60 dark:bg-gray-700/60 px-3 py-1.5 rounded-md font-mono text-gray-900 dark:text-gray-100">
                                {call.call_id}
                              </code>
                            )
                            break
                          case "call_ended_reason":
                            value = (
                              <Badge
                                variant={call.call_ended_reason === "completed" ? "default" : "destructive"}
                                className="text-xs font-medium px-2.5 py-1"
                              >
                                {call.call_ended_reason === "completed" ? (
                                  <CheckCircle className="w-3 h-3 mr-1.5" />
                                ) : (
                                  <XCircle className="w-3 h-3 mr-1.5" />
                                )}
                                {call.call_ended_reason}
                              </Badge>
                            )
                            break
                          case "duration_seconds":
                            value = (
                              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <Clock className="w-3 h-3 text-muted-foreground dark:text-gray-400" />
                                {formatDuration(call.duration_seconds)}
                              </div>
                            )
                            break
                          case "call_started_at":
                            value = <span className="text-gray-900 dark:text-gray-100">{formatToIndianDateTime(call.call_started_at)}</span>
                            break
                          case "total_cost":
                            value = call?.total_llm_cost || call?.total_tts_cost || call?.total_stt_cost ? (
                              <CostTooltip call={call}/>
                            ) : "-"
                            break
                        }

                        return (
                          <TableCell key={`basic-${call.id}-${key}`} className="py-4">
                            {value}
                          </TableCell>
                        )
                      })}
                      
                      {/* Dynamic Metadata Columns - use columnOrder for ordering */}
                      {(columnOrder.metadata.length > 0 ? columnOrder.metadata : visibleColumns.metadata)
                        .filter(key => visibleColumns.metadata.includes(key))
                        .map((key) => (
                          <TableCell 
                            key={`metadata-${call.id}-${key}`} 
                            className="py-4 bg-blue-50/30 dark:bg-blue-950/10 border-r border-blue-200/50 dark:border-blue-800/50"
                          >
                            <DynamicJsonCell 
                              data={call.metadata} 
                              fieldKey={key}
                              maxWidth="180px"
                            />
                          </TableCell>
                        ))}

                      {/* Dynamic Transcription Metrics Columns - use columnOrder for ordering */}
                      {(columnOrder.transcription_metrics.length > 0 ? columnOrder.transcription_metrics : visibleColumns.transcription_metrics)
                        .filter(key => visibleColumns.transcription_metrics.includes(key))
                        .map((key, index) => (
                          <TableCell 
                            key={`transcription-${call.id}-${key}`} 
                            className={cn(
                              "py-4 bg-blue-50/30 dark:bg-blue-950/10",
                              index === 0 && visibleColumns.metadata.length === 0 && "border-l-2 border-primary/30 dark:border-primary/40",
                              index < visibleColumns.transcription_metrics.length - 1 && "border-r border-blue-200/50 dark:border-blue-800/50"
                            )}
                          >
                            <DynamicJsonCell 
                              data={call.transcription_metrics} 
                              fieldKey={key}
                              maxWidth="180px"
                            />
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Load More Trigger */}
              {hasMore && (
                <div ref={loadMoreRef} className="py-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  {loading && <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />}
                </div>
              )}

              {/* End of List */}
              {!hasMore && calls.length > 0 && (
                <div className="py-4 text-muted-foreground dark:text-gray-400 text-sm border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center">
                  All calls loaded ({calls.length} total)
                </div>
              )}
            </div>
          </div>
      </div>

      {/* Call Details Slide Panel */}
      <CallDetailSlidePanel
        open={slidePanelOpen}
        onClose={handleCloseSidePanel}
        selectedCall={selectedCall}
        project={project}
        formatDuration={formatDuration}
        formatToIndianDateTime={formatToIndianDateTime}
      />
    </div>
  )
}

// Separate component for Call Detail Slide Panel with audio sync
interface CallDetailSlidePanelProps {
  open: boolean
  onClose: () => void
  selectedCall: CallLog | null
  project: any
  formatDuration: (seconds: number) => string
  formatToIndianDateTime: (timestamp: any) => string
  onDelete?: (callId: string) => void
}

interface TranscriptTurn {
  id: string
  turnId: string
  role: 'user' | 'agent'
  content: string
  translatedText?: string
  startTime: number
  endTime: number
  duration: number
  latency?: number
}

function CallDetailSlidePanel({
  open,
  onClose,
  selectedCall,
  project,
  formatDuration,
  formatToIndianDateTime,
  onDelete
}: CallDetailSlidePanelProps) {
  const router = useRouter()
  const [currentAudioTime, setCurrentAudioTime] = useState(0)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const transcriptRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})
  const transcriptContainerRef = useRef<HTMLDivElement>(null)

  // Handle delete call
  const handleDeleteCall = async () => {
    if (!selectedCall || !onDelete) return
    
    const isUploadedAudio = selectedCall.call_id?.startsWith('uploaded-')
    const confirmMessage = isUploadedAudio
      ? `Are you sure you want to delete this uploaded audio and its call log? This will also remove any associated evaluation results.`
      : `Are you sure you want to delete this call log? This will also remove any associated metrics and evaluation results.`
    
    if (!confirm(confirmMessage)) return
    
    setIsDeleting(true)
    try {
      const response = await fetch(
        `/api/call-logs?id=${selectedCall.id}&agent_id=${selectedCall.agent_id}`,
        { method: 'DELETE' }
      )
      
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete call log')
      }
      
      onDelete(selectedCall.id)
      onClose()
    } catch (error) {
      console.error('Error deleting call log:', error)
      alert(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Parse transcript into structured turns
  const parsedTranscript = useMemo((): TranscriptTurn[] => {
    if (!selectedCall?.transcript_json) return []

    try {
      const transcriptJson = typeof selectedCall.transcript_json === 'string'
        ? JSON.parse(selectedCall.transcript_json)
        : selectedCall.transcript_json

      // Handle diarized format with turns array
      if (transcriptJson?.turns && Array.isArray(transcriptJson.turns)) {
        return transcriptJson.turns.map((turn: any, index: number) => {
          const isNewFormat = 'role' in turn && 'content' in turn
          const isUser = isNewFormat
            ? turn.role === 'user'
            : turn.speaker === 'Speaker 1' || turn.speaker === 'user'
          const textContent = isNewFormat ? turn.content : turn.text

          return {
            id: `turn-${index}`,
            turnId: `Turn ${index + 1}`,
            role: isUser ? 'user' : 'agent',
            content: textContent || '',
            translatedText: turn.translated_text || turn.translation || null,
            startTime: turn.start_time || 0,
            endTime: turn.end_time || turn.start_time || 0,
            duration: turn.duration || ((turn.end_time || 0) - (turn.start_time || 0)),
            latency: turn.latency || null
          }
        })
      }

      // Handle array format
      if (Array.isArray(transcriptJson)) {
        let cumulativeTime = 0
        return transcriptJson.map((turn: any, index: number) => {
          const isUser = turn.role === 'user' || turn.user_transcript
          const content = turn.content || turn.user_transcript || turn.agent_response || ''
          const duration = turn.duration || content.length * 0.05 // Estimate ~50ms per character
          const startTime = turn.start_time ?? cumulativeTime
          const endTime = turn.end_time ?? (startTime + duration)
          cumulativeTime = endTime + 0.5 // Add small gap between turns

          return {
            id: `turn-${index}`,
            turnId: `Turn ${index + 1}`,
            role: isUser ? 'user' : 'agent',
            content,
            translatedText: turn.translated_text || turn.translation || null,
            startTime,
            endTime,
            duration: endTime - startTime,
            latency: turn.latency || null
          }
        })
      }

      return []
    } catch (e) {
      console.error('Error parsing transcript:', e)
      return []
    }
  }, [selectedCall])

  // Handle audio time updates
  const handleAudioTimeUpdate = useCallback((time: number) => {
    setCurrentAudioTime(time)
  }, [])

  // Handle audio play state changes
  const handleAudioPlayStateChange = useCallback((playing: boolean) => {
    setIsAudioPlaying(playing)
    if (!playing) {
      setActiveTranscriptId(null)
    }
  }, [])

  // Find active transcript based on audio time
  const activeTranscript = useMemo(() => {
    if (!isAudioPlaying || !currentAudioTime || !parsedTranscript.length) return null
    return parsedTranscript.find(turn =>
      currentAudioTime >= turn.startTime && currentAudioTime <= turn.endTime
    )
  }, [currentAudioTime, isAudioPlaying, parsedTranscript])

  // Auto-scroll to active transcript
  useEffect(() => {
    if (!isAudioPlaying) {
      setActiveTranscriptId(null)
      return
    }

    if (!activeTranscript) return

    if (activeTranscript.id !== activeTranscriptId) {
      setActiveTranscriptId(activeTranscript.id)

      const element = transcriptRefs.current[activeTranscript.id]
      if (element && transcriptContainerRef.current) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })
      }
    }
  }, [activeTranscript, isAudioPlaying, activeTranscriptId])

  const formatTime = (seconds: number) => {
    if (seconds < 0) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatLatency = (latency: number | null | undefined) => {
    if (latency === null || latency === undefined) return '-'
    if (latency < 1) return `${Math.round(latency * 1000)}ms`
    return `${latency.toFixed(2)}s`
  }

  if (!selectedCall) return null

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Call Details"
      width="2xl"
    >
      <div className="space-y-4">
        {/* Action Buttons - At Top */}
        <div className="pb-2 border-b border-slate-200 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              router.push(`/${project?.id}/agents/${selectedCall.agent_id}/observability?session_id=${selectedCall.id}`)
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View Full Observability Details
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200 hover:border-red-300"
              onClick={handleDeleteCall}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        {/* Compact Call Info & Audio Section */}
        <div className="bg-slate-50 rounded-lg p-3 space-y-3">
          {/* Call Info - Compact horizontal layout */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-medium text-slate-900">{selectedCall.customer_number || 'N/A'}</span>
            </div>
            <Badge
              variant={selectedCall.call_ended_reason === "completed" ? "default" : "destructive"}
              className="text-[10px] px-1.5 py-0"
            >
              {selectedCall.call_ended_reason === "completed" ? (
                <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
              ) : (
                <XCircle className="w-2.5 h-2.5 mr-0.5" />
              )}
              {selectedCall.call_ended_reason}
            </Badge>
            <div className="flex items-center gap-1 text-slate-600">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(selectedCall.duration_seconds)}</span>
            </div>
            <span className="text-slate-500 text-xs">{formatToIndianDateTime(selectedCall.call_started_at)}</span>
            <code className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600">
              {selectedCall.call_id}
            </code>
          </div>

          {/* Audio Player - Compact */}
          {selectedCall.recording_url && (
            <div className="pt-2 border-t border-slate-200">
              <AudioPlayer
                s3Key={extractS3Key(selectedCall.recording_url)}
                url={selectedCall.recording_url}
                callId={selectedCall.id}
                onTimeUpdate={handleAudioTimeUpdate}
                onPlayStateChange={handleAudioPlayStateChange}
              />
              {isAudioPlaying && (
                <div className="flex items-center gap-1.5 text-[10px] text-blue-600 mt-1">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Audio synced to transcript</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transcript with detailed turn info - Expanded section */}
        <SlidePanelSection title={`Transcript (${parsedTranscript.length} turns)`}>
          <div
            ref={transcriptContainerRef}
            className="max-h-[calc(100vh-320px)] min-h-[400px] overflow-y-auto space-y-3 pr-2"
          >
            {parsedTranscript.length > 0 ? (
              parsedTranscript.map((turn) => (
                <div
                  key={turn.id}
                  ref={(el) => { transcriptRefs.current[turn.id] = el }}
                  className={cn(
                    "p-4 rounded-lg border transition-all duration-300",
                    turn.role === 'user'
                      ? "bg-blue-50 border-blue-200"
                      : "bg-slate-50 border-slate-200",
                    activeTranscriptId === turn.id && "ring-2 ring-blue-500 shadow-lg"
                  )}
                >
                  {/* Turn Header with metrics */}
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200/50">
                    <div className="flex items-center gap-2">
                      {turn.role === 'user' ? (
                        <>
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-3 h-3 text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-blue-700">User</span>
                        </>
                      ) : (
                        <>
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center">
                            <Bot className="w-3 h-3 text-slate-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-700">Assistant</span>
                        </>
                      )}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {turn.turnId}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <div className="flex items-center gap-1" title="Start Time">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(turn.startTime)}</span>
                      </div>
                      <div className="flex items-center gap-1" title="Duration">
                        <span className="text-slate-400">|</span>
                        <span>{turn.duration.toFixed(2)}s</span>
                      </div>
                      {turn.latency !== null && turn.latency !== undefined && (
                        <div className="flex items-center gap-1 text-orange-600" title="Latency">
                          <AlertCircle className="w-3 h-3" />
                          <span>{formatLatency(turn.latency)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Turn Content */}
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {turn.content}
                  </p>

                  {/* Translated Text */}
                  {turn.translatedText && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Languages className="w-3 h-3 text-purple-500" />
                        <span className="text-[10px] font-medium text-purple-600 uppercase tracking-wide">Translation</span>
                      </div>
                      <p className="text-sm text-purple-700 italic">
                        {turn.translatedText}
                      </p>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500 italic text-center py-8">
                No transcript available for this call
              </div>
            )}
          </div>
        </SlidePanelSection>
      </div>
    </SlidePanel>
  )
}

export default CallLogs