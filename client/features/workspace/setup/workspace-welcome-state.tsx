import { useEffect, useState } from 'react'

import { WorkspaceIdentity, type WorkspaceIdentityProps } from '../workspace-identity'
import { APP_ICON_IDS } from '@/client/lib/app-icon-registry'

const greetings = [
  'Welcome to',
  'This is',
  'Make yourself at home in',
  'A fresh start in',
  'Good to see you in'
]

export type WorkspaceWelcomeStateProps = Omit<
  WorkspaceIdentityProps,
  'onNameChange' | 'onNameCommit' | 'renderIcon'
>

// A one-time handoff from creation to the first visit. Never persisted.
let newlyCreatedWorkspaceId: string | undefined

export function welcomeNewWorkspace(workspaceId: string) {
  newlyCreatedWorkspaceId = workspaceId
}

export function useWorkspaceWelcome(workspaceId: string) {
  const [welcoming, setWelcoming] = useState(() => newlyCreatedWorkspaceId === workspaceId)

  useEffect(() => {
    if (newlyCreatedWorkspaceId === workspaceId) newlyCreatedWorkspaceId = undefined
    if (!welcoming) return
    const timer = setTimeout(() => setWelcoming(false), 3000)
    return () => clearTimeout(timer)
  }, [workspaceId, welcoming])

  return welcoming
}

export function WorkspaceWelcomeState({
  name = 'Workspace',
  icon,
  ...iconProps
}: WorkspaceWelcomeStateProps) {
  const [greeting] = useState(() => greetings[Math.floor(Math.random() * greetings.length)])
  const [icons] = useState(() => {
    const choices = [...APP_ICON_IDS]
    return Array.from(
      { length: 4 },
      () => choices.splice(Math.floor(Math.random() * choices.length), 1)[0]!
    )
  })
  const [step, setStep] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 4
      : 0
  )

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const timers = [500, 1000, 1500, 2000].map((delay, index) =>
      setTimeout(() => setStep(index + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <div
      aria-label="Workspace welcome"
      className="flex flex-1 items-center justify-center p-6 text-center"
    >
      <div className="flex min-w-0 flex-col items-center gap-1">
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <WorkspaceIdentity
          {...iconProps}
          name={name}
          icon={step < 4 ? { type: 'glyph', value: icons[step]! } : icon}
        />
      </div>
    </div>
  )
}
