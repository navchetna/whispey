'use client'

import { usePathname } from 'next/navigation'
import { ReactNode, useEffect, useState } from 'react'
import { useLocalUser } from '@/lib/local-auth'
import { useMobile } from '@/hooks/use-mobile'
import { canViewApiKeys } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useApiQuery } from '@/hooks/useApi'

interface SidebarWrapperProps {
  children: ReactNode
}

const ENHANCED_PROJECT_ID = '371c4bbb-76db-4c61-9926-bd75726a1cda'

// All your existing route pattern definitions and configurations
interface RoutePattern {
  pattern: string
  exact?: boolean
}

interface SidebarRoute {
  patterns: RoutePattern[]
  getSidebarConfig: (params: RouteParams, context: SidebarContext) => SidebarConfig | null
  priority?: number
}

interface RouteParams {
  [key: string]: string
}

interface SidebarContext {
  isEnhancedProject: boolean
  userCanViewApiKeys: boolean
  projectId?: string
  agentType?: string
}

interface NavigationItem {
  id: string
  name: string
  icon: string
  path: string
  group?: string
  external?: boolean
}

export interface SidebarConfig {
  type: string
  context: Record<string, any>
  navigation: NavigationItem[]
  showBackButton: boolean
  backPath?: string
  backLabel?: string
}

// Keep all your existing route matching and configuration logic
const matchRoute = (pathname: string, pattern: string): RouteParams | null => {
  if (pattern.endsWith('*')) {
    const basePattern = pattern.slice(0, -1)
    if (!pathname.startsWith(basePattern)) {
      return null
    }
    
    const paramNames: string[] = []
    const regexPattern = basePattern
      .replace(/:[^/]+/g, (match) => {
        paramNames.push(match.slice(1))
        return '([^/]+)'
      })

    const regex = new RegExp(`^${regexPattern}`)
    const match = pathname.match(regex)

    if (!match) return null

    const params: RouteParams = {}
    paramNames.forEach((name, index) => {
      params[name] = match[index + 1]
    })

    return params
  }

  const paramNames: string[] = []
  const regexPattern = pattern
    .replace(/:[^/]+/g, (match) => {
      paramNames.push(match.slice(1))
      return '([^/]+)'
    })

  const regex = new RegExp(`^${regexPattern}$`)
  const match = pathname.match(regex)

  if (!match) return null

  const params: RouteParams = {}
  paramNames.forEach((name, index) => {
    params[name] = match[index + 1]
  })

  return params
}

const sidebarRoutes: SidebarRoute[] = [
  {
    patterns: [
      { pattern: '/sign*' },
      { pattern: '/docs*' }
    ],
    getSidebarConfig: () => null,
    priority: 100
  },
  {
    patterns: [
      { pattern: '/:projectId/agents' },
      { pattern: '/:projectId/agents/api-keys' },
      { pattern: '/:projectId/webpages' },
    ],
    getSidebarConfig: (params, context) => {
      const { projectId } = params
      const { userCanViewApiKeys } = context

      const baseNavigation = [
        {
          id: 'agent-list', 
          name: 'Agent List', 
          icon: 'Activity', 
          path: `/${projectId}/agents`, 
          group: 'Agents' 
        },
        {
          id: 'webpages', 
          name: 'Webpages', 
          icon: 'Globe', 
          path: `/${projectId}/webpages`, 
          group: 'Content' 
        }
      ]

      const configurationItems = []
      if (userCanViewApiKeys) {
        configurationItems.push({
          id: 'api-keys',
          name: 'Project API Key',
          icon: 'Key',
          path: `/${projectId}/agents/api-keys`,
          group: 'configuration'
        })
      }

      return {
        type: 'project-agents',
        context: { projectId },
        navigation: [...baseNavigation, ...configurationItems],
        showBackButton: true,
        backPath: '/',
        backLabel: 'Back to Workspaces'
      }
    },
    priority: 95
  },
  {
    patterns: [
      { pattern: '/:projectId/agents/:agentId' },
      { pattern: '/:projectId/agents/:agentId/config' },
      { pattern: '/:projectId/agents/:agentId/observability' },
      { pattern: '/:projectId/agents/:agentId/phone-call-config' },
      { pattern: '/:projectId/agents/:agentId/evaluations/:jobId' },
      { pattern: '/:projectId/agents/:agentId/evals-metrics' },
      { pattern: '/:projectId/agents/:agentId/evals-results' },
    ],
    getSidebarConfig: (params, context) => {
      const { projectId, agentId } = params
      const { isEnhancedProject, agentType } = context

      const reservedPaths = ['api-keys', 'settings', 'config', 'observability', 'evaluations', 'evals-metrics', 'evals-results'];
      if (reservedPaths.includes(agentId)) {
        return null;
      }

      const baseNavigation = [
        { 
          id: 'overview', 
          name: 'Overview', 
          icon: 'Activity', 
          path: `/${projectId}/agents/${agentId}?tab=overview`,
          group: 'LOGS' 
        },
        { 
          id: 'logs', 
          name: 'Call Logs', 
          icon: 'List', 
          path: `/${projectId}/agents/${agentId}?tab=logs`,
          group: 'LOGS' 
        }
      ]

      // Configuration items
      const configItems = []
      // Show Agent Config for all agents, not just pype_agent
      configItems.push({ 
        id: 'agent-config', 
        name: 'Agent Config', 
        icon: 'Brain', 
        path: `/${projectId}/agents/${agentId}/config`, 
        group: 'agent config' 
      })

      // Call items
      const callItems = []
      if (agentType === 'pype_agent') {
        callItems.push({
          id: 'phone-call',
          name: 'Phone Calls',
          icon: 'Phone',
          path: `/${projectId}/agents/${agentId}/phone-call-config`,
          group: 'call configuration'
        })
      }

      // Enhanced project items
      const enhancedItems = []
      if (isEnhancedProject) {
        enhancedItems.push({ 
          id: 'campaign-logs', 
          name: 'Campaign Logs', 
          icon: 'BarChart3', 
          path: `/${projectId}/agents/${agentId}?tab=campaign-logs`, 
          group: 'Batch Calls' 
        })
      }

      // Evaluation items
      const evaluationItems = [
        { 
          id: 'evals-metrics', 
          name: 'Evals Metrics', 
          icon: 'TrendingUp', 
          path: `/${projectId}/agents/${agentId}/evals-metrics`, 
          group: 'Evaluation Suite' 
        },
        { 
          id: 'evals-results', 
          name: 'Evals Results', 
          icon: 'BarChart3', 
          path: `/${projectId}/agents/${agentId}/evals-results`, 
          group: 'Evaluation Suite' 
        }
      ]

      // Combine all navigation items
      const navigation = [
        ...baseNavigation,
        ...configItems,
        // ...callItems,
        ...enhancedItems,
        ...evaluationItems
      ]

      // Debug: Log the final navigation to see if Agent Config is included
      console.log('🔍 SidebarWrapper navigation for agent:', agentId, navigation)
      console.log('🔍 Agent type:', agentType)
      console.log('🔍 Config items:', configItems)

      return {
        type: 'agent-detail',
        context: { agentId, projectId },
        navigation,
        showBackButton: true,
        backPath: `/${projectId}/agents`,
        backLabel: 'Back to Agents list'
      }
    },
    priority: 90
  },
  {
    patterns: [
      { pattern: '/', exact: true },
      { pattern: '*' }
    ],
    getSidebarConfig: () => ({
      type: 'workspaces',
      context: {},
      navigation: [
        { 
          id: 'workspaces', 
          name: 'Workspaces', 
          icon: 'Home', 
          path: '/' 
        },
        { 
          id: 'docs', 
          name: 'Documentation', 
          icon: 'FileText', 
          path: '/docs', 
          external: true, 
          group: 'resources' 
        }
      ],
      showBackButton: false
    }),
    priority: 1
  }
]

const getSidebarConfig = (
  pathname: string, 
  context: SidebarContext
): SidebarConfig | null => {
  const sortedRoutes = [...sidebarRoutes].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  for (const route of sortedRoutes) {
    for (const { pattern, exact } of route.patterns) {
      let params: RouteParams | null = null

      if (exact) {
        if (pathname === pattern) {
          params = {}
        }
      } else if (pattern.endsWith('*')) {
        params = matchRoute(pathname, pattern)
      } else {
        params = matchRoute(pathname, pattern)
      }

      if (params !== null) {
        const config = route.getSidebarConfig(params, context)
        return config
      }
    }
  }

  return null
}

export default function SidebarWrapper({ children }: SidebarWrapperProps) {
  const pathname = usePathname()
  const { user } = useLocalUser()
  
  const { isMobile, mounted } = useMobile(768)
  // Initialize state from localStorage only on client to avoid hydration mismatch
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedState = localStorage.getItem('voice-evals-sidebar-collapsed')
      return savedState !== null ? JSON.parse(savedState) : false
    }
    return false
  })
  const [userCanViewApiKeys, setUserCanViewApiKeys] = useState<boolean>(false)
  const [permissionsLoading, setPermissionsLoading] = useState<boolean>(true)
  
  const projectId = pathname.match(/^\/([^/]+)/)?.[1]
  const agentId = pathname.match(/^\/[^/]+\/agents\/([^/?]+)/)?.[1]
  
  const { data: projects } = useApiQuery('pype_voice_projects', 
    projectId && projectId !== 'sign' && projectId !== 'docs' ? {
      select: 'id, name',
      filters: [{ column: 'id', operator: 'eq', value: projectId }]
    } : {}
  )

  const { data: agents } = useApiQuery('pype_voice_agents', 
    agentId && projectId && projectId !== 'sign' && projectId !== 'docs' ? {
      select: 'id, agent_type',
      filters: [{ column: 'id', operator: 'eq', value: agentId }]
    } : {}
  )
  
  // Save collapse preference to localStorage
  const handleDesktopToggle = () => {
    const newState = !isDesktopCollapsed
    setIsDesktopCollapsed(newState)
    if (typeof window !== 'undefined') {
      localStorage.setItem('voice-evals-sidebar-collapsed', JSON.stringify(newState))
    }
  }

  // Fetch user role and permissions (keep your existing logic)
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.email || !projectId || projectId === 'sign' || projectId === 'docs') {
        setPermissionsLoading(false)
        return
      }

      try {
        const response = await fetch(`/api/user/role?email=${encodeURIComponent(user.email)}&projectId=${encodeURIComponent(projectId)}`)
        
        if (!response.ok) {
          throw new Error('Failed to fetch user role')
        }
        
        const { role } = await response.json()
        setUserCanViewApiKeys(canViewApiKeys(role))
      } catch (error) {
        setUserCanViewApiKeys(false)
      } finally {
        setPermissionsLoading(false)
      }
    }

    fetchUserRole()
  }, [user, projectId])
  
  const project = projects?.[0]
  const agent = agents?.[0]
  const isEnhancedProject = project?.id === ENHANCED_PROJECT_ID
  
  const sidebarContext: SidebarContext = {
    isEnhancedProject,
    userCanViewApiKeys,
    projectId,
    agentType: agent?.agent_type
  }
  
  const sidebarConfig = getSidebarConfig(pathname, sidebarContext)

  if (!sidebarConfig) {
    return <div className="min-h-screen">{children}</div>
  }

  // Prevent hydration mismatch by rendering consistent content until mounted
  if (!mounted) {
    return (
      <div className="h-screen flex">
        <div className="relative">
          <Sidebar 
            config={sidebarConfig} 
            currentPath={pathname}
            isCollapsed={isDesktopCollapsed}
            onToggleCollapse={handleDesktopToggle}
            isMobile={false}
          />
        </div>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    )
  }

  return (
    <div className="h-screen flex">
      {/* Mobile: Sheet-based sidebar */}
      {isMobile ? (
        <>
          {/* Mobile Header */}
          <div className="fixed top-0 left-0 right-0 h-14 bg-white dark:bg-gray-800 border-b flex items-center justify-between px-4 z-50 md:hidden">
            <div className="flex items-center gap-2">
              <img src="https://cdn.brandfetch.io/idTGhLyv09/theme/dark/idShZPpM6F.svg?c=1bxid64Mup7aczewSAYMX&t=1676261444243" alt="Voice Evals Observability" className="w-6 h-6" />
              <span className="font-semibold text-sm">Voice Evals Observability</span>
            </div>
            
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="p-2">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <VisuallyHidden>
                  <SheetTitle>Navigation Menu</SheetTitle>
                </VisuallyHidden>
                <Sidebar 
                  config={sidebarConfig} 
                  currentPath={pathname}
                  isCollapsed={false}
                  isMobile={true}
                />
              </SheetContent>
            </Sheet>
          </div>
          
          {/* Mobile Main Content */}
          <main className="flex-1 pt-14 overflow-auto">
            {children}
          </main>
        </>
      ) : (
        /* Desktop: Fixed sidebar */
        <>
          <div className="relative">
            <Sidebar 
              config={sidebarConfig} 
              currentPath={pathname}
              isCollapsed={isDesktopCollapsed}
              onToggleCollapse={handleDesktopToggle}
              isMobile={false}
            />
          </div>
          
          {/* Desktop Main Content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </>
      )}
    </div>
  )
}