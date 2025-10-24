import EvaluationResults from '@/components/evaluations/EvaluationResults'
import { use } from 'react'

interface EvaluationResultsPageProps {
  params: Promise<{ projectid: string; agentid: string; jobid: string }>
}

export default function EvaluationResultsPage({ params }: EvaluationResultsPageProps) {
  const resolvedParams = use(params)
  return <EvaluationResults params={resolvedParams} />
}