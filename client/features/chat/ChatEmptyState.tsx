import type { ReactNode } from 'react'

import {
  IconArticle,
  IconFileSearch,
  IconLayout2,
  IconPiano,
  IconSketching,
  IconUmbrella2,
  IconWallet,
  type TablerIcon
} from '@tabler/icons-react'

import { AgentBlobatar } from '@/client/components/shared/AgentBlobatar'
import {
  ChatPromptBubble,
  ChatPromptBubbles,
  type ChatPromptBubble as ChatPrompt
} from '@/client/features/chat/ChatPromptBubbles'
import { cn } from '@/client/lib/cn'
import type { AgentTheme } from '@/lib/types'

const ONBOARDING_HANDOFF_DIRECTIVE =
  'Keep the final reply brief and user-facing. Do not include file or storage links, file paths, or bundle, test, and runtime-log summaries.'

export const CHAT_WELCOME_PROMPTS = [
  {
    label: 'Check the weather',
    prompt:
      "Build me a set of weather widgets that surface current conditions, today's hourly forecast, and a simple weekly outlook at a glance",
    context: [
      'Build this onboarding example immediately without asking follow-up questions.',
      "Create three separate widgets: current conditions, today's hourly forecast, and a seven-day outlook.",
      'Use one shared Open-Meteo server function with no API key and use Berlin as the default location.',
      'Give each widget an appropriate grid size and a compact, visually distinct layout with loading, error, and last-updated states.',
      'Bundle all three widgets, smoke-test the shared weather function, and check runtime logs before finishing.',
      ONBOARDING_HANDOFF_DIRECTIVE
    ],
    icon: IconUmbrella2
  },
  {
    label: 'Track my finances',
    prompt:
      'Build me a personal finance view for tracking income, expenses, monthly budgets, spending trends, and savings, with an agent action that can add sample transactions',
    context: [
      "Build this onboarding example immediately without asking follow-up questions, and don't use external services or bank connections.",
      'Create a responsive View with a month selector, income, spending, and savings summaries, an income-versus-spending trend, category breakdowns, budget progress, and recent transactions.',
      'Support adding, editing, and deleting income and expense transactions, categories, and monthly category budgets.',
      'Persist transactions, categories, and budgets in a workspace-local SQLite database accessed through server functions. Store monetary amounts as integer cents and seed realistic sample data only when the database is empty.',
      'Add an “Add with agent” action that imports `sendChatMessage` from `moi` and sends a concise request for the agent to generate and insert a realistic batch of sample transactions into the same database.',
      'Provide a small documented workspace script the agent can use to validate and append transactions safely, then refresh the View data after the agent updates the database.',
      'Include loading, empty, and error states, then bundle the View and smoke-test its SQLite persistence and transaction mutations before finishing.',
      ONBOARDING_HANDOFF_DIRECTIVE
    ],
    icon: IconWallet
  },
  {
    label: 'Build a playful synthesizer',
    prompt:
      'Build me a view with a simple, playful synthesizer featuring a keyboard, five sound controls, and the ability to record, save, and load music files from the workspace',
    context: [
      "Build this onboarding example immediately without asking follow-up questions, and don't use external services.",
      "Create a responsive View that uses the browser's audio capabilities, with an onscreen piano and computer-keyboard controls.",
      'Include five clearly labeled sound controls for waveform, attack, release, filter cutoff, and volume.',
      'Let the user record timed note events, play and stop recordings, give them names, and save and load them as JSON music files in a workspace music folder.',
      'Include clear empty and error states, then bundle the View and check runtime logs before finishing.',
      ONBOARDING_HANDOFF_DIRECTIVE
    ],
    icon: IconPiano
  }
] satisfies ChatPrompt[]

export const WORKSPACE_ANALYSIS_PROMPT = {
  label: 'Explore the workspace',
  prompt: 'Explore this workspace and suggest what moi can build based on its content',
  context: [
    'Explore the existing workspace files before making suggestions.',
    'Briefly explain what the workspace appears to be for and which content informed your ideas.',
    'Propose a focused set of useful widgets or views that fit the work already here.',
    'Wait for me to choose before building anything.'
  ],
  icon: IconFileSearch
} satisfies ChatPrompt

export type ChatEmptyStateKind = 'view-builder' | 'welcome' | 'explore-workspace' | 'empty'
export type WelcomeDestination = 'agent' | 'widgets' | 'views' | 'scratchpad'

type ResolveChatEmptyStateOptions = {
  isViewBuilderDraft: boolean
  hasSentMessageFromMoi: boolean
  isWorkspacePendingAnalysis: boolean
}

export function resolveChatEmptyState({
  isViewBuilderDraft,
  hasSentMessageFromMoi,
  isWorkspacePendingAnalysis
}: ResolveChatEmptyStateOptions): ChatEmptyStateKind {
  if (isViewBuilderDraft) return 'view-builder'
  if (!hasSentMessageFromMoi) return 'welcome'
  if (isWorkspacePendingAnalysis) return 'explore-workspace'
  return 'empty'
}

type ChatEmptyStateProps = {
  agent: AgentTheme
  kind: ChatEmptyStateKind
  hasWorkspaceApplets: boolean
  disabled?: boolean
  onSelectPrompt: (prompt: ChatPrompt) => void
  onNavigate: (destination: WelcomeDestination) => void
}

export function ChatEmptyState({
  agent,
  kind,
  hasWorkspaceApplets,
  disabled = false,
  onSelectPrompt,
  onNavigate
}: ChatEmptyStateProps) {
  switch (kind) {
    case 'view-builder':
      return <ViewBuilderState agent={agent} />
    case 'welcome':
      return (
        <WelcomeState
          agent={agent}
          disabled={disabled}
          showExamples={!hasWorkspaceApplets}
          onSelectPrompt={onSelectPrompt}
          onNavigate={onNavigate}
        />
      )
    case 'explore-workspace':
      return (
        <ExploreWorkspaceState agent={agent} disabled={disabled} onSelectPrompt={onSelectPrompt} />
      )
    case 'empty':
      return <EmptyState agent={agent} />
  }
}

type EmptyStateFrameProps = {
  agent: AgentTheme
  children: ReactNode
  className?: string
}

function EmptyStateFrame({ agent, children, className }: EmptyStateFrameProps) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center self-center', className)}>
      <AgentBlobatar preset={agent} color="secondary" expression="idle" className="mb-2" animated />

      {children}
    </div>
  )
}

type AgentStateProps = {
  agent: AgentTheme
}

function ViewBuilderState({ agent }: AgentStateProps) {
  return (
    <EmptyStateFrame agent={agent} className="text-center text-muted-foreground">
      <p className="mx-auto max-w-xs px-8 text-sm">
        Describe the content, data, and key actions you need in the view
      </p>
    </EmptyStateFrame>
  )
}

type PromptStateProps = {
  agent: AgentTheme
  disabled?: boolean
  onSelectPrompt: (prompt: ChatPrompt) => void
}

type WelcomeStateProps = PromptStateProps & {
  showExamples?: boolean
  onNavigate: (destination: WelcomeDestination) => void
}

function WelcomeState({
  agent,
  disabled = false,
  showExamples = true,
  onSelectPrompt,
  onNavigate
}: WelcomeStateProps) {
  return (
    <EmptyStateFrame agent={agent} className="@container w-full max-w-md min-w-0">
      <div className="mt-2 flex flex-col gap-4">
        <div className="prose prose-sm min-w-0 wrap-anywhere prose-inherit">
          <p>
            moi is the visual workspace for you and your agent. It grows and adapts to the work
            you're doing.
          </p>
          <p>
            Ask agent to build{' '}
            <WelcomeTerm Icon={IconLayout2} destination="widgets" onNavigate={onNavigate}>
              Widgets
            </WelcomeTerm>{' '}
            that surface information and quick actions, or entire{' '}
            <WelcomeTerm Icon={IconArticle} destination="views" onNavigate={onNavigate}>
              Views
            </WelcomeTerm>{' '}
            for more complex tools. Use{' '}
            <WelcomeTerm Icon={IconSketching} destination="scratchpad" onNavigate={onNavigate}>
              Scratchpad
            </WelcomeTerm>{' '}
            for exploring and shaping ideas with your agent.
          </p>
          {showExamples && <p>Try an example:</p>}
        </div>
        {showExamples && (
          <ChatPromptBubbles
            prompts={CHAT_WELCOME_PROMPTS}
            disabled={disabled}
            onSelect={onSelectPrompt}
          />
        )}
      </div>
    </EmptyStateFrame>
  )
}

function ExploreWorkspaceState({ agent, disabled = false, onSelectPrompt }: PromptStateProps) {
  return (
    <EmptyStateFrame agent={agent}>
      <div className="flex flex-col items-center gap-4">
        <div className="prose prose-sm max-w-xs min-w-0 text-center wrap-anywhere prose-inherit">
          <p>
            Your agent can explore this workspace and suggest useful widgets and views based on
            what’s already here
          </p>
        </div>
        <ChatPromptBubble
          prompt={WORKSPACE_ANALYSIS_PROMPT}
          disabled={disabled}
          onSelect={onSelectPrompt}
        />
      </div>
    </EmptyStateFrame>
  )
}

function EmptyState({ agent }: AgentStateProps) {
  return (
    <EmptyStateFrame agent={agent} className="text-center text-muted-foreground">
      <p className="mx-auto max-w-sm px-8 text-sm">
        Chat with your agent, create widgets and views, and manage your workspace context from here
      </p>
    </EmptyStateFrame>
  )
}

type WelcomeTermProps = {
  children: string
  destination: WelcomeDestination
  Icon: TablerIcon
  onNavigate: (destination: WelcomeDestination) => void
}

function WelcomeTerm({ Icon, children, destination, onNavigate }: WelcomeTermProps) {
  return (
    <button
      type="button"
      data-welcome-destination={destination}
      onClick={() => onNavigate(destination)}
      className="-mx-0.5 inline-flex cursor-pointer items-center gap-0.5 rounded-xs px-0.5 align-bottom font-medium text-foreground hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      <Icon size={16} stroke={1.75} aria-hidden />
      {children}
    </button>
  )
}
