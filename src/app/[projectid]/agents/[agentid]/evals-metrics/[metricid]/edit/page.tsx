import MetricEditPage from '@/components/evaluations/MetricEditPage'
import { use } from 'react'

interface MetricEditPageProps {
  params: Promise<{ projectid: string; agentid: string; metricid: string }>
}

export default function EditMetricPage({ params }: MetricEditPageProps) {
  const resolvedParams = use(params)
  return <MetricEditPage params={resolvedParams} />
}
