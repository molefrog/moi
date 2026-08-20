import {
  IconArticle,
  IconFileSearch,
  IconLayout2,
  IconMessages,
  IconPiano,
  IconSketching,
  IconTableSpark,
  IconUmbrella2,
  IconWallet,
  type TablerIcon
} from '@tabler/icons-react'

import {
  ChatPromptBubble,
  ChatPromptBubbles,
  type ChatPromptBubble as ChatPrompt
} from '@/client/features/chat/ChatPromptBubbles'
import { cn } from '@/client/lib/cn'

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

export type ChatEmptyStateKind = 'view-builder' | 'chat-welcome' | 'workspace-welcome' | 'empty'
export type ChatWelcomeDestination = 'agent' | 'widgets' | 'views' | 'scratchpad'

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
  if (!hasSentMessageFromMoi) return 'chat-welcome'
  if (isWorkspacePendingAnalysis) return 'workspace-welcome'
  return 'empty'
}

const EMPTY_STATE_STYLES = cn('flex flex-1 flex-col items-center justify-center self-center')

type ChatEmptyStateProps = {
  kind: ChatEmptyStateKind
  hasWorkspaceApplets: boolean
  disabled?: boolean
  onSelectPrompt: (prompt: ChatPrompt) => void
  onNavigate: (destination: ChatWelcomeDestination) => void
}

export function ChatEmptyState({
  kind,
  hasWorkspaceApplets,
  disabled = false,
  onSelectPrompt,
  onNavigate
}: ChatEmptyStateProps) {
  switch (kind) {
    case 'view-builder':
      return <ViewBuilderChatEmptyState />
    case 'chat-welcome':
      return (
        <ChatWelcome
          disabled={disabled}
          showExamples={!hasWorkspaceApplets}
          onSelectPrompt={onSelectPrompt}
          onNavigate={onNavigate}
        />
      )
    case 'workspace-welcome':
      return <ChatWorkspaceWelcome disabled={disabled} onSelectPrompt={onSelectPrompt} />
    case 'empty':
      return <EmptyState />
  }
}

function ViewBuilderChatEmptyState() {
  return (
    <div className={cn(EMPTY_STATE_STYLES, 'gap-2 text-center text-muted-foreground')}>
      <IconTableSpark size={56} stroke={0.5} />
      <p className="mx-auto max-w-xs px-8 text-sm">
        Describe the content, data, and key actions you need in the view
      </p>
    </div>
  )
}

type WelcomeProps = {
  disabled?: boolean
  onSelectPrompt: (prompt: ChatPrompt) => void
}

type ChatWelcomeProps = WelcomeProps & {
  showExamples?: boolean
  onNavigate: (destination: ChatWelcomeDestination) => void
}

export function ChatWelcome({
  disabled = false,
  showExamples = true,
  onSelectPrompt,
  onNavigate
}: ChatWelcomeProps) {
  return (
    <div className={cn(EMPTY_STATE_STYLES, '@container w-full max-w-md min-w-0')}>
      <div className="prose prose-sm min-w-0 wrap-anywhere prose-inherit">
        <p>
          moi is the visual workspace for you and your agent. It grows and adapts to the work you're
          doing.
        </p>
        <p>
          Ask{' '}
          <WelcomeTerm Icon={IconMessages} destination="agent" onNavigate={onNavigate}>
            Agent
          </WelcomeTerm>{' '}
          to build{' '}
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
  )
}

export function ChatWorkspaceWelcome({ disabled = false, onSelectPrompt }: WelcomeProps) {
  return (
    <div className={cn(EMPTY_STATE_STYLES, 'gap-2')}>
      <div className="prose prose-sm max-w-xs min-w-0 text-center wrap-anywhere prose-inherit">
        <p className="font-medium text-foreground">Start with what’s already here</p>
        <p className="text-muted-foreground">
          Your agent can explore this workspace and suggest useful widgets and views based on its
          contents.
        </p>
      </div>
      <ChatPromptBubble
        prompt={WORKSPACE_ANALYSIS_PROMPT}
        disabled={disabled}
        onSelect={onSelectPrompt}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div className={cn(EMPTY_STATE_STYLES, 'gap-2 text-center text-muted-foreground')}>
      <IconMessages size={56} stroke={0.5} aria-hidden />
      <p className="mx-auto max-w-sm px-8 text-sm">
        Chat with your agent, create widgets and views, and manage your workspace context from here
      </p>
    </div>
  )
}

type WelcomeTermProps = {
  children: string
  destination: ChatWelcomeDestination
  Icon: TablerIcon
  onNavigate: (destination: ChatWelcomeDestination) => void
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
