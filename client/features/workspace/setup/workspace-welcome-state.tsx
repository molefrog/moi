import { useEffect, useState } from 'react'

// A one-time handoff from creation to the first visit. Never persisted.
let newlyCreatedWorkspaceId: string | undefined

export function welcomeNewWorkspace(workspaceId: string) {
  newlyCreatedWorkspaceId = workspaceId
}

export function useWorkspaceWelcome(workspaceId: string, ready: boolean) {
  const [phase, setPhase] = useState<'welcome' | 'waiting' | 'done'>(() =>
    newlyCreatedWorkspaceId === workspaceId ? 'welcome' : 'done'
  )

  useEffect(() => {
    if (newlyCreatedWorkspaceId === workspaceId) newlyCreatedWorkspaceId = undefined
    if (phase !== 'welcome') return
    const timer = setTimeout(() => setPhase('waiting'), 3000)
    return () => clearTimeout(timer)
  }, [workspaceId, phase])

  if (phase === 'waiting' && ready) setPhase('done')

  return { welcoming: phase === 'welcome', entering: phase !== 'done' }
}

export function WorkspaceWelcomeState() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center">
      <h1 className="text-xl font-medium">Welcome to your workspace</h1>
    </div>
  )
}
