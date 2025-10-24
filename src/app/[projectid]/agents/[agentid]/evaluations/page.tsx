import EvaluationConfig from '@/components/evaluations/EvaluationConfig'
import { use } from 'react'

interface EvaluationPageProps {
  params: Promise<{ projectid: string; agentid: string }>
}

export default function EvaluationPage({ params }: EvaluationPageProps) {
  const resolvedParams = use(params)
  return <EvaluationConfig params={resolvedParams} />
}