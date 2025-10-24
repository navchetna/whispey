import EvaluationAnalytics from '@/components/evaluation/EvaluationAnalytics'
import { use } from 'react'

interface EvaluationAnalyticsPageProps {
  params: Promise<{ projectid: string; agentid: string }>
}

export default function EvaluationAnalyticsPage({ params }: EvaluationAnalyticsPageProps) {
  const resolvedParams = use(params)
  return <EvaluationAnalytics params={resolvedParams} />
}