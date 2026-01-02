import AgentPersonas from '@/components/agent-personas/AgentPersonas'
import { use } from 'react'

interface AgentPersonasPageProps {
  params: Promise<{ projectid: string; agentid: string }>
}

export default function AgentPersonasPage({ params }: AgentPersonasPageProps) {
  const resolvedParams = use(params)
  return <AgentPersonas params={resolvedParams} />
}
