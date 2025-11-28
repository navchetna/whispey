import { Pool, PoolConfig } from 'pg'

// PostgreSQL connection configuration
const config: PoolConfig = {
  user: process.env.POSTGRES_USER || 'whispey_user',
  password: process.env.POSTGRES_PASSWORD || 'whispey123',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'whispey',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
}

// Create a pool instance
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(config)
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client:', err)
    })
  }
  
  return pool
}

// Helper function to execute queries
export async function query(text: string, params?: any[]) {
  const pool = getPool()
  const start = Date.now()
  
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log('Executed query:', { text: text.substring(0, 100), duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error('Database query error:', error)
    throw error
  }
}

// Helper function to get a single client from the pool
export async function getClient() {
  const pool = getPool()
  return pool.connect()
}

// Close the pool (useful for graceful shutdown)
export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}

// Transaction helper
export async function withTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await getClient()
  
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// Database service functions
export class DatabaseService {
  // Generic select with conditions
  static async select(table: string, options: {
    columns?: string[]
    where?: Record<string, any>
    orderBy?: { column: string, direction?: 'ASC' | 'DESC' }
    limit?: number
    offset?: number
  } = {}) {
    const {
      columns = ['*'],
      where = {},
      orderBy,
      limit,
      offset
    } = options

    let sql = `SELECT ${columns.join(', ')} FROM ${table}`
    const params: any[] = []
    let paramIndex = 1

    // WHERE clause
    if (Object.keys(where).length > 0) {
      const whereConditions = Object.entries(where).map(([key, value]) => {
        if (Array.isArray(value)) {
          const placeholders = value.map(() => `$${paramIndex++}`).join(', ')
          params.push(...value)
          return `${key} IN (${placeholders})`
        } else {
          params.push(value)
          return `${key} = $${paramIndex++}`
        }
      })
      sql += ` WHERE ${whereConditions.join(' AND ')}`
    }

    // ORDER BY clause
    if (orderBy) {
      sql += ` ORDER BY ${orderBy.column} ${orderBy.direction || 'ASC'}`
    }

    // LIMIT clause
    if (limit) {
      sql += ` LIMIT $${paramIndex++}`
      params.push(limit)
    }

    // OFFSET clause
    if (offset) {
      sql += ` OFFSET $${paramIndex++}`
      params.push(offset)
    }

    try {
      const result = await query(sql, params)
      return { data: result.rows, error: null, count: result.rowCount }
    } catch (error) {
      return { data: null, error, count: 0 }
    }
  }

  // Insert data
  static async insert(table: string, data: Record<string, any> | Record<string, any>[]) {
    try {
      if (Array.isArray(data)) {
        // Bulk insert
        if (data.length === 0) return { data: [], error: null }
        
        const keys = Object.keys(data[0])
        const values: any[] = []
        let valueIndex = 1
        
        const valuePlaceholders = data.map(row => {
          const rowPlaceholders = keys.map(() => `$${valueIndex++}`).join(', ')
          values.push(...keys.map(key => row[key]))
          return `(${rowPlaceholders})`
        }).join(', ')

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${valuePlaceholders} RETURNING *`
        const result = await query(sql, values)
        return { data: result.rows, error: null }
      } else {
        // Single insert
        const keys = Object.keys(data)
        const values = Object.values(data)
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
        
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
        const result = await query(sql, values)
        return { data: result.rows[0], error: null }
      }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Update data
  static async update(table: string, data: Record<string, any>, where: Record<string, any>) {
    try {
      const updateKeys = Object.keys(data)
      const updateValues = Object.values(data)
      const whereKeys = Object.keys(where)
      const whereValues = Object.values(where)
      
      const setClause = updateKeys.map((key, i) => `${key} = $${i + 1}`).join(', ')
      const whereClause = whereKeys.map((key, i) => `${key} = $${updateKeys.length + i + 1}`).join(' AND ')
      
      const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`
      const result = await query(sql, [...updateValues, ...whereValues])
      return { data: result.rows, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Delete data
  static async delete(table: string, where: Record<string, any>) {
    try {
      const keys = Object.keys(where)
      const values = Object.values(where)
      const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ')
      
      const sql = `DELETE FROM ${table} WHERE ${whereClause} RETURNING *`
      const result = await query(sql, values)
      return { data: result.rows, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Upsert (INSERT ... ON CONFLICT)
  static async upsert(table: string, data: Record<string, any>, conflictColumns: string[]) {
    try {
      const keys = Object.keys(data)
      const values = Object.values(data)
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
      const updateClause = keys
        .filter(key => !conflictColumns.includes(key))
        .map(key => `${key} = EXCLUDED.${key}`)
        .join(', ')
      
      const sql = `
        INSERT INTO ${table} (${keys.join(', ')}) 
        VALUES (${placeholders}) 
        ON CONFLICT (${conflictColumns.join(', ')}) 
        DO UPDATE SET ${updateClause} 
        RETURNING *
      `
      const result = await query(sql, values)
      return { data: result.rows[0], error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Execute stored procedure/function
  static async rpc(functionName: string, params: Record<string, any> = {}) {
    try {
      const paramKeys = Object.keys(params)
      const paramValues = Object.values(params)
      const paramPlaceholders = paramKeys.map((_, i) => `$${i + 1}`).join(', ')
      
      const sql = `SELECT * FROM ${functionName}(${paramPlaceholders})`
      const result = await query(sql, paramValues)
      return { data: result.rows, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  // Count records
  static async count(table: string, where: Record<string, any> = {}) {
    try {
      let sql = `SELECT COUNT(*) as count FROM ${table}`
      const params: any[] = []
      
      if (Object.keys(where).length > 0) {
        const whereConditions = Object.entries(where).map(([key, value], index) => {
          params.push(value)
          return `${key} = $${index + 1}`
        })
        sql += ` WHERE ${whereConditions.join(' AND ')}`
      }
      
      const result = await query(sql, params)
      return { data: parseInt(result.rows[0].count), error: null }
    } catch (error) {
      return { data: 0, error }
    }
  }
}