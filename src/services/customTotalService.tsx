// Custom totals service for on-premise deployment - API-based
import { CustomTotalConfig, CustomFilter, CustomTotalResult } from '../types/customTotals'

export class CustomTotalsService {
  // Save custom total configuration via API
  static async saveCustomTotal(
    config: CustomTotalConfig, 
    projectId: string, 
    agentId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/custom-totals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config, projectId, agentId })
      })

      const result = await response.json()
      
      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to save custom total' }
      }

      return { success: true }
    } catch (error: any) {
      console.error('Error saving custom total:', error)
      return { success: false, error: 'Failed to save custom total' }
    }
  }

  // Get all custom totals for an agent via API
  static async getCustomTotals(
    projectId: string, 
    agentId: string
  ): Promise<CustomTotalConfig[]> {
    try {
      const response = await fetch(`/api/custom-totals?projectId=${projectId}&agentId=${agentId}`)
      
      if (!response.ok) {
        console.error('Error fetching custom totals:', response.statusText)
        return []
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error fetching custom totals:', error)
      return []
    }
  }

  // Calculate custom total value via API
  static async calculateCustomTotal(
    config: CustomTotalConfig,
    agentId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<CustomTotalResult> {
    try {
      const response = await fetch('/api/custom-totals/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config,
          agentId,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        return {
          configId: config.id,
          value: 0,
          label: config.name,
          error: result.error || 'Calculation failed'
        }
      }

      return {
        configId: config.id,
        value: result.value || 0,
        label: config.name,
        error: result.error
      }
    } catch (error) {
      console.error('Error calculating custom total:', error)
      return {
        configId: config.id,
        value: 0,
        label: config.name,
        error: 'Calculation failed'
      }
    }
  }

  // Batch calculate multiple custom totals via API
  static async batchCalculateCustomTotals(
    configs: CustomTotalConfig[],
    agentId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<CustomTotalResult[]> {
    if (configs.length === 0) return []

    try {
      const response = await fetch('/api/custom-totals/batch-calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configs,
          agentId,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null
        })
      })

      const result = await response.json()

      if (!response.ok) {
        // Return error results for all configs
        return configs.map(config => ({
          configId: config.id,
          value: 0,
          label: config.name,
          error: result.error || 'Calculation failed'
        }))
      }

      return result.data || configs.map(config => ({
        configId: config.id,
        value: 0,
        label: config.name,
        error: 'No data returned'
      }))
    } catch (error) {
      console.error('Error batch calculating custom totals:', error)
      return configs.map(config => ({
        configId: config.id,
        value: 0,
        label: config.name,
        error: 'Calculation failed'
      }))
    }
  }

  // Get distinct values for a column via API
  static async getDistinctValues(
    agentId: string,
    columnName: string,
    jsonField?: string,
    limit = 100
  ): Promise<Array<{ value: string; count: number }>> {
    try {
      const params = new URLSearchParams({
        agentId,
        columnName,
        limit: limit.toString()
      })
      
      if (jsonField) {
        params.append('jsonField', jsonField)
      }

      const response = await fetch(`/api/custom-totals/distinct-values?${params}`)
      
      if (!response.ok) {
        console.error('Error getting distinct values:', response.statusText)
        return []
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error getting distinct values:', error)
      return []
    }
  }

  // Get available JSON fields via API
  static async getAvailableJsonFields(
    agentId: string,
    columnName: string,
    limit = 50
  ): Promise<Array<{ fieldName: string; sampleValue: string; occurrences: number }>> {
    try {
      const params = new URLSearchParams({
        agentId,
        columnName,
        limit: limit.toString()
      })

      const response = await fetch(`/api/custom-totals/json-fields?${params}`)
      
      if (!response.ok) {
        console.error('Error getting JSON fields:', response.statusText)
        return []
      }

      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.error('Error getting JSON fields:', error)
      return []
    }
  }

  // Delete custom total via API
  static async deleteCustomTotal(
    configId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`/api/custom-totals?configId=${configId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to delete custom total' }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: 'Failed to delete custom total' }
    }
  }

  // Update custom total via API
  static async updateCustomTotal(
    configId: string,
    updates: Partial<CustomTotalConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/custom-totals', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configId, updates })
      })

      const result = await response.json()

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to update custom total' }
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: 'Failed to update custom total' }
    }
  }
}