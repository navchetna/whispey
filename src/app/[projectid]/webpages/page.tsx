import WebpagesView from '@/components/webpages/WebpagesView'
import { use } from 'react'

interface WebpagesPageProps {
  params: Promise<{ projectid: string }>
}

export default function WebpagesPage({ params }: WebpagesPageProps) {
  const resolvedParams = use(params)
  return <WebpagesView projectId={resolvedParams.projectid} />
}