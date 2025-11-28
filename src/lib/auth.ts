// Local authentication utilities for on-premise deployment
import { Pool } from 'pg'
import { compare, hash } from 'bcryptjs'
import { sign, verify } from 'jsonwebtoken'
import crypto from 'crypto';
import { updateKeyLastUsed } from './api-key-management';
import { TokenVerificationResult } from '../types/logs';

const dbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DATABASE || 'whispey',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
const pool = new Pool(dbConfig)

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  isAdmin: boolean
  isActive: boolean
}

export interface Session {
  user: User
  token: string
  expiresAt: Date
}

// Hash password for storage
export async function hashPassword(password: string): Promise<string> {
  return await hash(password, 12)
}

// Verify password
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return await compare(password, hashedPassword)
}

// Create JWT token
export function createToken(userId: string, email: string): string {
  return sign(
    { userId, email },
    JWT_SECRET,
    { expiresIn: '24h' }
  )
}

// Verify JWT token
export function verifyJWTToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = verify(token, JWT_SECRET) as any
    return { userId: decoded.userId, email: decoded.email }
  } catch (error) {
    return null
  }
}

// Authenticate user
export async function authenticateUser(email: string, password: string): Promise<Session | null> {
  try {
    const client = await pool.connect()
    try {
      const result = await client.query(
        'SELECT id, email, first_name, last_name, password_hash, is_admin, is_active FROM pype_voice_users WHERE email = $1 AND is_active = true',
        [email]
      )

      if (result.rows.length === 0) {
        return null
      }

      const user = result.rows[0]
      const isValidPassword = await verifyPassword(password, user.password_hash)

      if (!isValidPassword) {
        return null
      }

      const token = createToken(user.id, user.email)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      // Create session in database
      await client.query(
        'INSERT INTO pype_voice_user_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
        [user.id, token, expiresAt]
      )

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          isAdmin: user.is_admin,
          isActive: user.is_active,
        },
        token,
        expiresAt,
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Authentication error:', error)
    return null
  }
}

// Get user by session token
export async function getUserBySession(token: string): Promise<User | null> {
  try {
    const decoded = verifyJWTToken(token)
    if (!decoded) {
      return null
    }

    const client = await pool.connect()
    try {
      const result = await client.query(`
        SELECT u.id, u.email, u.first_name, u.last_name, u.is_admin, u.is_active
        FROM pype_voice_users u
        JOIN pype_voice_user_sessions s ON u.id = s.user_id
        WHERE s.session_token = $1 AND s.expires_at > NOW() AND u.is_active = true
      `, [token])

      if (result.rows.length === 0) {
        return null
      }

      const user = result.rows[0]
      return {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: user.is_admin,
        isActive: user.is_active,
      }
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Session validation error:', error)
    return null
  }
}

export const verifyToken = async (token: string, environment: string = 'dev'): Promise<TokenVerificationResult> => {
  try {
    console.log('🔍 Verifying token:', {
      token: token ? `${token.substring(0, 10)}...` : 'null',
      environment,
      tokenLength: token?.length || 0
    });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    console.log('🔍 Token hash:', tokenHash);

    const client = await pool.connect()
    try {
      // First, check the new API keys table
      const newApiKeyResult = await client.query(
        'SELECT project_id, last_used FROM pype_voice_api_keys WHERE token_hash = $1',
        [tokenHash]
      )

      if (newApiKeyResult.rows.length > 0) {
        const newApiKey = newApiKeyResult.rows[0]
        
        // Update last used timestamp asynchronously
        updateKeyLastUsed(tokenHash).catch(err => 
          console.error('Failed to update key last used:', err)
        );

        return { 
          valid: true, 
          token: { id: newApiKey.project_id },
          project_id: newApiKey.project_id,
          source: 'new_system'
        };
      }

      // Fallback to old system
      const projectResult = await client.query(
        'SELECT * FROM pype_voice_projects WHERE token_hash = $1',
        [tokenHash]
      )

      if (projectResult.rows.length === 0) {
        console.error('❌ No project found with token hash:', tokenHash);
        return { valid: false, error: 'Invalid or expired token' };
      }

      const project = projectResult.rows[0]

      console.log('✅ Token verification successful for project:', project.name);
      return { 
        valid: true, 
        token: project, 
        project_id: project.id, 
        source: 'old_system'
      };
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('❌ Token verification error:', error);
    return { valid: false, error: 'Token verification failed' };
  }
};