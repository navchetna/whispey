'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CalendarDays } from 'lucide-react'

interface DateRange {
  from: Date | undefined
  to?: Date | undefined
}

interface PeriodFilterProps {
  onDateRangeChange?: (dateRange: { from: string; to: string }) => void
  className?: string
  isMobile?: boolean
  // Controlled props
  quickFilter?: string
  dateRange?: DateRange
  isCustomRange?: boolean
  onQuickFilterChange?: (filterId: string) => void
  onDateRangeSelect?: (range: DateRange | undefined) => void
}

// Date utility functions
export const subDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}

export const formatDateISO = (date: Date) => {
  return date.toISOString().split('T')[0]
}

export const quickFilters = [
  { id: '1d', label: '1D', days: 1 },
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 }
]

// Original hook with local state only (for backward compatibility)
export function usePeriodFilter(initialFilter: string = '7d') {
  const [quickFilter, setQuickFilter] = useState(initialFilter)
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), quickFilters.find(f => f.id === initialFilter)?.days || 7),
    to: new Date()
  })
  const [isCustomRange, setIsCustomRange] = useState(false)

  const apiDateRange = useMemo(() => {
    if (isCustomRange && dateRange.from && dateRange.to) {
      return {
        from: formatDateISO(dateRange.from),
        to: formatDateISO(dateRange.to)
      }
    }
    
    const days = quickFilters.find(f => f.id === quickFilter)?.days || 7
    const endDate = new Date()
    const startDate = subDays(endDate, days)
    return {
      from: formatDateISO(startDate),
      to: formatDateISO(endDate)
    }
  }, [quickFilter, dateRange, isCustomRange])

  const handleQuickFilter = useCallback((filterId: string) => {
    setQuickFilter(filterId)
    setIsCustomRange(false)
    
    const days = quickFilters.find(f => f.id === filterId)?.days || 7
    const endDate = new Date()
    const startDate = subDays(endDate, days)
    setDateRange({ from: startDate, to: endDate })
  }, [])

  const handleDateRangeSelect = useCallback((range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setDateRange(range)
      setIsCustomRange(true)
      setQuickFilter('')
    }
  }, [])

  return {
    quickFilter,
    dateRange,
    isCustomRange,
    apiDateRange,
    handleQuickFilter,
    handleDateRangeSelect
  }
}

// New hook that persists filter state in URL search params (for consistency across pages)
export function usePeriodFilterWithURL(defaultFilter: string = '7d') {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  // Read initial values from URL or use defaults
  const urlPeriod = searchParams.get('period')
  const urlDateFrom = searchParams.get('date_from')
  const urlDateTo = searchParams.get('date_to')
  
  // Determine initial state from URL
  const initialQuickFilter = urlPeriod || (urlDateFrom && urlDateTo ? '' : defaultFilter)
  const initialIsCustom = !urlPeriod && urlDateFrom && urlDateTo
  
  const [quickFilter, setQuickFilter] = useState(initialQuickFilter)
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    if (urlDateFrom && urlDateTo) {
      return {
        from: new Date(urlDateFrom),
        to: new Date(urlDateTo)
      }
    }
    const days = quickFilters.find(f => f.id === initialQuickFilter)?.days || 7
    return {
      from: subDays(new Date(), days),
      to: new Date()
    }
  })
  const [isCustomRange, setIsCustomRange] = useState(!!initialIsCustom)

  // Update URL when filter changes
  const updateURL = useCallback((period: string, fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (period) {
      params.set('period', period)
      params.delete('date_from')
      params.delete('date_to')
    } else if (fromDate && toDate) {
      params.delete('period')
      params.set('date_from', fromDate)
      params.set('date_to', toDate)
    }
    
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  const apiDateRange = useMemo(() => {
    if (isCustomRange && dateRange.from && dateRange.to) {
      return {
        from: formatDateISO(dateRange.from),
        to: formatDateISO(dateRange.to)
      }
    }
    
    const days = quickFilters.find(f => f.id === quickFilter)?.days || 7
    const endDate = new Date()
    const startDate = subDays(endDate, days)
    return {
      from: formatDateISO(startDate),
      to: formatDateISO(endDate)
    }
  }, [quickFilter, dateRange, isCustomRange])

  const handleQuickFilter = useCallback((filterId: string) => {
    setQuickFilter(filterId)
    setIsCustomRange(false)
    
    const days = quickFilters.find(f => f.id === filterId)?.days || 7
    const endDate = new Date()
    const startDate = subDays(endDate, days)
    setDateRange({ from: startDate, to: endDate })
    
    // Update URL
    updateURL(filterId)
  }, [updateURL])

  const handleDateRangeSelect = useCallback((range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      setDateRange(range)
      setIsCustomRange(true)
      setQuickFilter('')
      
      // Update URL with custom date range
      updateURL('', formatDateISO(range.from), formatDateISO(range.to))
    }
  }, [updateURL])

  // Sync state when URL changes (e.g., navigating between pages)
  useEffect(() => {
    const urlPeriod = searchParams.get('period')
    const urlDateFrom = searchParams.get('date_from')
    const urlDateTo = searchParams.get('date_to')
    
    if (urlPeriod && urlPeriod !== quickFilter) {
      setQuickFilter(urlPeriod)
      setIsCustomRange(false)
      const days = quickFilters.find(f => f.id === urlPeriod)?.days || 7
      setDateRange({
        from: subDays(new Date(), days),
        to: new Date()
      })
    } else if (urlDateFrom && urlDateTo && !urlPeriod) {
      const fromDate = new Date(urlDateFrom)
      const toDate = new Date(urlDateTo)
      if (formatDateISO(fromDate) !== formatDateISO(dateRange.from!) || 
          formatDateISO(toDate) !== formatDateISO(dateRange.to!)) {
        setDateRange({ from: fromDate, to: toDate })
        setIsCustomRange(true)
        setQuickFilter('')
      }
    }
  }, [searchParams])

  return {
    quickFilter,
    dateRange,
    isCustomRange,
    apiDateRange,
    handleQuickFilter,
    handleDateRangeSelect
  }
}

// Controlled Period Filter component that uses props from usePeriodFilter hook
export const PeriodFilterControlled: React.FC<{
  quickFilter: string
  dateRange: DateRange
  isCustomRange: boolean
  onQuickFilterChange: (filterId: string) => void
  onDateRangeSelect: (range: DateRange | undefined) => void
  className?: string
  isMobile?: boolean
}> = ({ 
  quickFilter,
  dateRange,
  isCustomRange,
  onQuickFilterChange,
  onDateRangeSelect,
  className = '',
  isMobile = false
}) => {
  if (isMobile) {
    return (
      <div className={className}>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Period</div>
        <div className="flex flex-wrap gap-2">
          {quickFilters.map((filter) => (
            <button
              key={filter.id}
              onClick={() => onQuickFilterChange(filter.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                quickFilter === filter.id && !isCustomRange
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
              }`}
            >
              {filter.label}
            </button>
          ))}
          
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${
                  isCustomRange 
                    ? 'bg-blue-500 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                Custom
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={onDateRangeSelect}
                numberOfMonths={1}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Period</span>
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {quickFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onQuickFilterChange(filter.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
              quickFilter === filter.id && !isCustomRange
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-700/50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`px-4 py-2 text-sm font-medium rounded-lg border-gray-200 dark:border-gray-700 transition-all duration-200 ${
              isCustomRange 
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30' 
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            Custom
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-gray-200 dark:border-gray-700 shadow-xl rounded-xl" align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={onDateRangeSelect}
            numberOfMonths={2}
            className="rounded-xl"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

// Self-contained Period Filter with internal state
export const PeriodFilter: React.FC<PeriodFilterProps> = ({ 
  onDateRangeChange,
  className = '',
  isMobile = false
}) => {
  const {
    quickFilter,
    dateRange,
    isCustomRange,
    apiDateRange,
    handleQuickFilter,
    handleDateRangeSelect
  } = usePeriodFilter()

  // Call the callback when date range changes
  React.useEffect(() => {
    onDateRangeChange?.(apiDateRange)
  }, [apiDateRange, onDateRangeChange])

  return (
    <PeriodFilterControlled
      quickFilter={quickFilter}
      dateRange={dateRange}
      isCustomRange={isCustomRange}
      onQuickFilterChange={handleQuickFilter}
      onDateRangeSelect={handleDateRangeSelect}
      className={className}
      isMobile={isMobile}
    />
  )
}

export default PeriodFilter
