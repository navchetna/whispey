import EvaluationSummary from '@/components/evaluations/EvaluationSummary'
import { use } from 'react'

interface EvaluationSummaryPageProps {
  params: Promise<{ projectid: string; agentid: string; jobid: string }>
}

export default function EvaluationSummaryPage({ params }: EvaluationSummaryPageProps) {
  const resolvedParams = use(params)
  return <EvaluationSummary params={resolvedParams} />
}
