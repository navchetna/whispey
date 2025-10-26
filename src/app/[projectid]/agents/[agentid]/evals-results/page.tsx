import EvalsResults from '@/components/evaluations/EvalsResults'
import { use } from 'react'

interface EvalsResultsPageProps {
  params: Promise<{ projectid: string; agentid: string }>
}

export default function EvalsResultsPage({ params }: EvalsResultsPageProps) {
  const resolvedParams = use(params)
  return <EvalsResults params={resolvedParams} />
}