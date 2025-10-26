import EvalsMetrics from '@/components/evaluations/EvalsMetrics'
import { use } from 'react'

interface EvalsMetricsPageProps {
  params: Promise<{ projectid: string; agentid: string }>
}

export default function EvalsMetricsPage({ params }: EvalsMetricsPageProps) {
  const resolvedParams = use(params)
  return <EvalsMetrics params={resolvedParams} />
}