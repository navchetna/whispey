import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import AdmZip from 'adm-zip'
import axios from 'axios'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

/**
 * Creates a directory structure for audio files
 * Pattern: audios/{projectId}/{agentId}/
 */
export async function createAudioDirectory(projectId: string, agentId: string): Promise<string> {
  const baseDir = path.join(process.cwd(), 'audios')
  const projectDir = path.join(baseDir, projectId)
  const agentDir = path.join(projectDir, agentId)
  
  // Create directories recursively
  await fs.mkdir(agentDir, { recursive: true })
  
  return agentDir
}

/**
 * Extracts files from a zip archive to the specified directory
 */
export async function extractZipFile(
  zipBuffer: Buffer,
  destinationPath: string
): Promise<string[]> {
  const zip = new AdmZip(zipBuffer)
  const zipEntries = zip.getEntries()
  const extractedFiles: string[] = []
  
  for (const entry of zipEntries) {
    // Skip directories and hidden files
    if (entry.isDirectory || entry.entryName.startsWith('.') || entry.entryName.startsWith('__MACOSX')) {
      continue
    }
    
    // Only extract audio files (common audio formats)
    const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma', '.opus']
    const ext = path.extname(entry.entryName).toLowerCase()
    
    if (audioExtensions.includes(ext)) {
      const fileName = path.basename(entry.entryName)
      const filePath = path.join(destinationPath, fileName)
      
      // Extract the file
      await fs.writeFile(filePath, entry.getData())
      extractedFiles.push(fileName)
    }
  }
  
  return extractedFiles
}

/**
 * Downloads a file from a URL
 */
export async function downloadFileFromUrl(url: string, destinationPath: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 second timeout
    })
    
    // Get filename from URL or use a default
    const urlPath = new URL(url).pathname
    const fileName = path.basename(urlPath) || `audio_${Date.now()}.mp3`
    const filePath = path.join(destinationPath, fileName)
    
    await fs.writeFile(filePath, response.data)
    
    return fileName
  } catch (error) {
    console.error('Error downloading file from URL:', error)
    throw new Error(`Failed to download file from URL: ${url}`)
  }
}

/**
 * Gets the size of a file in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath)
  return stats.size
}

/**
 * Validates if a file is an audio file based on extension
 */
export function isAudioFile(fileName: string): boolean {
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac', '.wma', '.opus']
  const ext = path.extname(fileName).toLowerCase()
  return audioExtensions.includes(ext)
}

/**
 * Checks if a directory exists
 */
export function directoryExists(dirPath: string): boolean {
  return existsSync(dirPath)
}

/**
 * Deletes a directory and all its contents
 */
export async function deleteDirectory(dirPath: string): Promise<void> {
  if (existsSync(dirPath)) {
    await fs.rm(dirPath, { recursive: true, force: true })
  }
}

/**
 * Lists all files in a directory
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  if (!existsSync(dirPath)) {
    return []
  }
  
  const files = await fs.readdir(dirPath)
  return files.filter(file => !file.startsWith('.'))
}

/**
 * Uploads a file to S3 bucket
 */
export async function uploadFileToS3(
  filePath: string,
  s3Key: string,
  bucket?: string
): Promise<string> {
  const s3Client = new S3Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
    region: process.env.AWS_REGION || 'ap-south-1'
  })

  const bucketName = bucket || process.env.AWS_S3_BUCKET || 'pype-voice-recordings'
  
  // Read the file
  const fileContent = await fs.readFile(filePath)
  
  // Upload to S3
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: fileContent,
    ContentType: getContentType(path.extname(filePath))
  })
  
  await s3Client.send(command)
  
  // Return the S3 URI
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${s3Key}`
}

/**
 * Gets content type based on file extension
 */
function getContentType(ext: string): string {
  const contentTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.opus': 'audio/opus'
  }
  return contentTypes[ext.toLowerCase()] || 'application/octet-stream'
}
