import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { IconSearch } from '@tabler/icons-react'
import { Button } from '@/client/components/ui/button'
import { Spinner } from '@/client/components/ui/spinner'
import { requestJson } from '@/client/api/http'
import type { WorkspaceEntry } from '@/lib/types'
import type { IdeaDiscovery, OnboardingHarness, OnboardingIdea } from '@/lib/onboarding'
import { useCreateWorkspace } from '@/client/features/workspace/add/api'
import { usePreloadWorkspaceFonts } from '@/client/runtime/workspace-theme'
import { OnboardingScreen } from './onboarding-screen'
import { OnboardingIdeaDisk } from './onboarding-idea-disk'
import { cancelDiscovery, useOnboardingJob } from './api'

type WorkspaceSetupStepProps = {
  harness: OnboardingHarness
  onFinish: (workspaceId?: string) => void
  finishing: boolean
  finishError?: string
}
export function WorkspaceSetupStep({
  harness,
  onFinish,
  finishing,
  finishError
}: WorkspaceSetupStepProps) {
  const [discovery, setDiscovery] = useState<IdeaDiscovery>()
  const [selection, setSelection] = useState<{ ideaId: string; operationId: string }>()
  const [retry, setRetry] = useState(false)
  const ideas = useOnboardingJob('discover', discovery)
  const build = useOnboardingJob(
    'create',
    discovery && selection ? { ...discovery, ...selection } : undefined,
    retry
  )
  useEffect(() => {
    if (!discovery) return
    return () => {
      void cancelDiscovery(discovery.runId).catch(() => {})
    }
  }, [discovery])
  const openedWorkspace = useRef<string | undefined>(undefined)
  const workspaceId = build.data?.status === 'done' ? build.data.workspaceId : undefined
  useEffect(() => {
    if (!workspaceId || openedWorkspace.current === workspaceId) return
    openedWorkspace.current = workspaceId
    onFinish(workspaceId)
  }, [workspaceId, onFinish])
  const createWorkspace = useCreateWorkspace()
  const emptyWorkspaceId = createWorkspace.data?.id
  const startFromScratch = useMutation({
    mutationFn: async () => {
      if (emptyWorkspaceId) return emptyWorkspaceId
      if (discovery) {
        await cancelDiscovery(discovery.runId)
        setDiscovery(undefined)
      }
      const workspaces = await requestJson<WorkspaceEntry[]>('/api/workspaces')
      if (workspaces.length > 0) return
      const entry = await createWorkspace.mutateAsync({ type: harness })
      return entry.id
    },
    onSuccess: id => onFinish(id)
  })
  const discoveryError = ideas.error?.message ?? ideas.data?.error
  const error =
    startFromScratch.error?.message ??
    build.error?.message ??
    build.data?.error ??
    (discoveryError
      ? 'We couldn’t find ideas this time. Try again, or skip the onboarding.'
      : undefined)
  function findIdeas() {
    startFromScratch.reset()
    setDiscovery({ harness, runId: crypto.randomUUID() })
  }
  function select(ideaId: string) {
    setSelection(current => current ?? { ideaId, operationId: crypto.randomUUID() })
  }
  const busy = finishing || startFromScratch.isPending
  const feedback = (
    <>
      {(error || finishError) && (
        <p role="alert" className="text-center text-sm text-destructive">
          {error || finishError}
        </p>
      )}
      {selection && (error || finishError) && (
        <Button
          size="lg"
          className="self-center"
          variant="secondary"
          disabled={busy || build.isFetching}
          onClick={() => {
            if (workspaceId) onFinish(workspaceId)
            else if (retry) void build.refetch()
            else setRetry(true)
          }}
        >
          Try again
        </Button>
      )}
    </>
  )
  const footer = !selection && (
    <Button size="lg" variant="ghost" disabled={busy} onClick={() => startFromScratch.mutate()}>
      {startFromScratch.isPending && <Spinner stroke={1.5} />}
      {startFromScratch.isPending ? 'Creating workspace…' : 'Skip the onboarding'}
    </Button>
  )
  if (!selection && (!discovery || error || busy))
    return (
      <DiscoveryIntro
        disabled={busy || !!emptyWorkspaceId}
        failed={!!discoveryError}
        onFindIdeas={findIdeas}
        feedback={feedback}
        footer={footer}
      />
    )
  if (ideas.data?.status === 'done')
    return (
      <IdeaOptions
        ideas={ideas.data.ideas ?? []}
        selectedIdeaId={selection?.ideaId}
        onSelect={select}
        feedback={feedback}
        footer={footer}
      />
    )
  return (
    <DiscoveryIntro
      loading
      progressMessage={ideas.data?.progress?.message}
      disabled={busy}
      failed={false}
      onFindIdeas={findIdeas}
      feedback={feedback}
      footer={footer}
    />
  )
}

type DiscoveryIntroProps = {
  loading?: boolean
  progressMessage?: string
  disabled: boolean
  failed: boolean
  onFindIdeas: () => void
  feedback: ReactNode
  footer: ReactNode
}
function DiscoveryIntro({
  loading = false,
  progressMessage,
  disabled,
  failed,
  onFindIdeas,
  feedback,
  footer
}: DiscoveryIntroProps) {
  return (
    <OnboardingScreen className="max-w-sm" footer={footer}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-medium">Choose a starting point</h1>
        <p className="text-sm text-muted-foreground">
          Moi can look through your recent conversations, emails, and connected apps to suggest
          ideas for you to build
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {loading ? (
          <DiscoveryProgress message={progressMessage} />
        ) : (
          <Button size="lg" disabled={disabled} onClick={onFindIdeas}>
            <IconSearch stroke={1.5} aria-hidden="true" />
            {failed ? 'Try again' : 'Find ideas'}
          </Button>
        )}
        {feedback}
      </div>
    </OnboardingScreen>
  )
}

type DiscoveryProgressProps = { message?: string }
function DiscoveryProgress({ message }: DiscoveryProgressProps) {
  return (
    <div
      role="status"
      aria-label="Finding ideas"
      className="flex h-9 max-w-full min-w-0 items-center text-sm text-muted-foreground"
    >
      <span className="shimmer truncate" title={message}>
        {message ?? 'Taking a first look…'}
      </span>
    </div>
  )
}

type IdeaOptionsProps = {
  ideas: OnboardingIdea[]
  selectedIdeaId?: string
  onSelect: (id: string) => void
  feedback: ReactNode
  footer: ReactNode
}
export function IdeaOptions({
  ideas,
  selectedIdeaId,
  onSelect,
  feedback,
  footer
}: IdeaOptionsProps) {
  usePreloadWorkspaceFonts()
  return (
    <OnboardingScreen className="max-w-6xl" footer={footer}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-xl font-medium">Choose a starting point</h1>
        <p className="text-sm text-muted-foreground">
          Pick an idea to build, you can change and add things as you go
        </p>
      </div>
      <div className="grid justify-items-stretch gap-10 px-3 pt-4 pb-8 lg:grid-cols-3 lg:gap-8">
        {ideas.map(idea => (
          <OnboardingIdeaDisk
            key={idea.id}
            idea={idea}
            state={
              !selectedIdeaId ? 'available' : selectedIdeaId === idea.id ? 'chosen' : 'not-chosen'
            }
            onSelect={() => onSelect(idea.id)}
          />
        ))}
      </div>
      {feedback}
    </OnboardingScreen>
  )
}
