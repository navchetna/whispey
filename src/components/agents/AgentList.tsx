import React, { useState, useEffect } from 'react'
import AgentListItem from './AgentListItem'
import { useMobile } from '@/hooks/use-mobile'

interface Agent {
  id: string
  name: string
  agent_type: string
  configuration: any
  environment: string
  created_at: string
  is_active: boolean
  project_id: string
}

interface RunningAgent {
  agent_name: string
  pid: number
  status: string
}

interface AgentListProps {
  agents: Agent[]
  viewMode: 'grid' | 'list'
  selectedAgent: string | null
  copiedAgentId: string | null
  projectId: string
  onCopyAgentId: (agentId: string, e: React.MouseEvent) => void
  onDeleteAgent: (agent: Agent) => void
  showRunningCounter?: boolean
}

const AgentList: React.FC<AgentListProps> = ({
  agents,
  viewMode,
  selectedAgent,
  copiedAgentId,
  projectId,
  onCopyAgentId,
  onDeleteAgent,
  showRunningCounter = true
}) => {
  const { isMobile } = useMobile(768)

  // Mobile-first approach: always use optimized list view on mobile
  if (isMobile) {
    return (
      <div className="space-y-3">
        {agents.map((agent, index) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            viewMode="mobile"
            isSelected={selectedAgent === agent.id}
            isCopied={copiedAgentId === agent.id}
            isLastItem={index === agents.length - 1}
            projectId={projectId}
            runningAgents={[]}
            onCopyId={(e) => onCopyAgentId(agent.id, e)}
            onDelete={() => onDeleteAgent(agent)}
            onStartAgent={() => {}}
            onStopAgent={() => {}}
            isStartingAgent={false}
            isStoppingAgent={false}
            isMobile={true}
          />
        ))}
      </div>
    )
  }

  // Desktop view modes
  if (viewMode === 'list') {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
        {agents.map((agent, index) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            viewMode="list"
            isSelected={selectedAgent === agent.id}
            isCopied={copiedAgentId === agent.id}
            isLastItem={index === agents.length - 1}
            projectId={projectId}
            runningAgents={[]}
            onCopyId={(e) => onCopyAgentId(agent.id, e)}
            onDelete={() => onDeleteAgent(agent)}
            onStartAgent={() => {}}
            onStopAgent={() => {}}
            isStartingAgent={false}
            isStoppingAgent={false}
            isMobile={false}
          />
        ))}
      </div>
    )
  }

  // Desktop grid view
  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentListItem
          key={agent.id}
          agent={agent}
          viewMode="grid"
          isSelected={selectedAgent === agent.id}
          isCopied={copiedAgentId === agent.id}
          isLastItem={false}
          projectId={projectId}
          runningAgents={[]}
          onCopyId={(e) => onCopyAgentId(agent.id, e)}
          onDelete={() => onDeleteAgent(agent)}
          onStartAgent={() => {}}
          onStopAgent={() => {}}
          isStartingAgent={false}
          isStoppingAgent={false}
          isMobile={false}
        />
      ))}
    </div>
  )
}

export default AgentList