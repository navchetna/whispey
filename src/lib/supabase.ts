"use client"
import { Pool } from 'pg'

// PostgreSQL connection configuration for on-premise deployment
const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'whispey',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
}

let pool: Pool | null = null

// Create connection pool (singleton pattern)
function getPool() {
  if (!pool) {
    pool = new Pool(dbConfig)
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err)
    })
  }
  return pool
}

// Simplified client interface to replace Supabase
export const supabase = {
  from: (table: string) => ({
    select: (columns?: string) => ({
      eq: (column: string, value: any) => executeQuery(
        `SELECT ${columns || '*'} FROM ${table} WHERE ${column} = $1`,
        [value]
      ),
      in: (column: string, values: any[]) => executeQuery(
        `SELECT ${columns || '*'} FROM ${table} WHERE ${column} = ANY($1)`,
        [values]
      ),
      order: (column: string, options?: { ascending?: boolean }) => executeQuery(
        `SELECT ${columns || '*'} FROM ${table} ORDER BY ${column} ${options?.ascending === false ? 'DESC' : 'ASC'}`
      ),
      limit: (count: number) => executeQuery(
        `SELECT ${columns || '*'} FROM ${table} LIMIT $1`,
        [count]
      ),
      range: (from: number, to: number) => executeQuery(
        `SELECT ${columns || '*'} FROM ${table} LIMIT ${to - from + 1} OFFSET ${from}`
      ),
    }),
    insert: (data: any) => executeQuery(
      `INSERT INTO ${table} (${Object.keys(data).join(', ')}) VALUES (${Object.keys(data).map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      Object.values(data)
    ),
    update: (data: any) => ({
      eq: (column: string, value: any) => executeQuery(
        `UPDATE ${table} SET ${Object.keys(data).map((key, i) => `${key} = $${i + 1}`).join(', ')} WHERE ${column} = $${Object.keys(data).length + 1} RETURNING *`,
        [...Object.values(data), value]
      ),
    }),
    delete: () => ({
      eq: (column: string, value: any) => executeQuery(
        `DELETE FROM ${table} WHERE ${column} = $1 RETURNING *`,
        [value]
      ),
    }),
    upsert: (data: any) => executeQuery(
      `INSERT INTO ${table} (${Object.keys(data).join(', ')}) VALUES (${Object.keys(data).map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT DO UPDATE SET ${Object.keys(data).map((key, i) => `${key} = EXCLUDED.${key}`).join(', ')} RETURNING *`,
      Object.values(data)
    ),
  }),
  rpc: (functionName: string, params?: any) => executeRpc(functionName, params),
  auth: {
    getSession: () => ({ data: { session: null }, error: null }),
    signIn: () => ({ data: null, error: { message: 'Authentication disabled for on-premise deployment' } }),
    signOut: () => ({ error: null }),
  }
}

// Execute query with proper error handling
async function executeQuery(query: string, params: any[] = []) {
  try {
    const client = await getPool().connect()
    try {
      const result = await client.query(query, params)
      return { data: result.rows, error: null, count: result.rowCount }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Database query error:', error)
    return { data: null, error: { message: (error as Error).message }, count: null }
  }
}

// Execute RPC (stored procedure) calls
async function executeRpc(functionName: string, params: any = {}) {
  try {
    const client = await getPool().connect()
    try {
      const paramKeys = Object.keys(params)
      const paramValues = Object.values(params)
      const paramPlaceholders = paramKeys.map((_, i) => `$${i + 1}`).join(', ')
      
      const query = `SELECT * FROM ${functionName}(${paramPlaceholders})`
      const result = await client.query(query, paramValues)
      return { data: result.rows, error: null }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('RPC call error:', error)
    return { data: null, error: { message: (error as Error).message } }
  }
}
