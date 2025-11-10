import 'server-only'
import { Pool, PoolConfig } from 'pg'

// PostgreSQL connection configuration
const config: PoolConfig = {
  user: process.env.POSTGRES_USER || 'admin',
  password: process.env.POSTGRES_PASSWORD || 'admin123',
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'whispey',
  max: 10, // maximum number of connections in the pool
  idleTimeoutMillis: 30000, // close idle connections after 30 seconds
  connectionTimeoutMillis: 2000, // return error after 2 seconds if connection could not be established
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
}

// Create a pool instance
let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(config)
    
    // Handle pool errors
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
    console.log('Executed query:', { text, duration, rows: res.rowCount })
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