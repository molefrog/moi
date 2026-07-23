import {
  IconArticle,
  IconBriefcase,
  IconFileSearch,
  IconGhost,
  IconLayout2,
  IconPiano,
  IconSketching,
  IconUmbrella2,
  type TablerIcon
} from '@tabler/icons-react'

import {
  ChatPromptBubble,
  ChatPromptBubbles,
  type ChatPromptBubble as ChatPrompt
} from '@/client/features/chat/ChatPromptBubbles'
import { cn } from '@/client/lib/cn'

export const CHAT_WELCOME_PROMPTS = [
  {
    label: "What's the weather?",
    prompt:
      "Build me a set of weather widgets that surface current conditions, today's hourly forecast, and a simple weekly outlook at a glance",
    context: [
      'Build this onboarding example immediately without asking follow-up questions.',
      "Create three separate widgets: current conditions, today's hourly forecast, and a seven-day outlook.",
      'Use one shared Open-Meteo server function with no API key and use Berlin as the default location.',
      'Give each widget an appropriate grid size and a compact, visually distinct layout with loading, error, and last-updated states.',
      'Bundle all three widgets, smoke-test the shared weather function, and check runtime logs before finishing.'
    ],
    icon: IconUmbrella2
  },
  {
    label: 'Build a fun synthesizer',
    prompt:
      'Build me a view with a simple, playful synthesizer featuring a keyboard, five sound controls, and the ability to record, save, and load music files from the workspace',
    context: [
      "Build this onboarding example immediately without asking follow-up questions, and don't use external services.",
      "Create a responsive View that uses the browser's audio capabilities, with an onscreen piano and computer-keyboard controls.",
      'Include five clearly labeled sound controls for waveform, attack, release, filter cutoff, and volume.',
      'Let the user record timed note events, play and stop recordings, give them names, and save and load them as JSON music files in a workspace music folder.',
      'Include clear empty and error states, then bundle the View and check runtime logs before finishing.'
    ],
    icon: IconPiano
  },
  {
    label: 'Make a job tracker',
    prompt:
      'Build me a view with a visual job search board where I can add opportunities by pasting a job link, automatically extract the details, move opportunities through stages, and keep notes and related files in the workspace',
    context: [
      'Build this onboarding example immediately without asking follow-up questions.',
      'Create a visual View with Saved, Applied, Interviewing, Offer, and Closed stages.',
      'Let the user add a job by pasting its URL, and use a server function to parse public metadata for the title, company, and location.',
      'When a page blocks parsing or lacks metadata, keep the URL and provide editable manual fields.',
      'Support moving opportunities between stages, editing their details and notes, and referencing related workspace files.',
      'Persist the board in a workspace-local JSON file and include loading, empty, and error states.',
      'Bundle the View and smoke-test its persistence and parsing functions before finishing.'
    ],
    icon: IconBriefcase
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

export type ChatEmptyStateKind = 'chat-welcome' | 'workspace-welcome' | 'empty'

type ResolveChatEmptyStateOptions = {
  hasSentMessageFromMoi: boolean
  isWorkspacePendingAnalysis: boolean
}

export function resolveChatEmptyState({
  hasSentMessageFromMoi,
  isWorkspacePendingAnalysis
}: ResolveChatEmptyStateOptions): ChatEmptyStateKind {
  if (!hasSentMessageFromMoi) return 'chat-welcome'
  if (isWorkspacePendingAnalysis) return 'workspace-welcome'
  return 'empty'
}

const EMPTY_STATE_STYLES = cn('flex flex-1 flex-col items-center justify-center')

type ChatEmptyStateProps = {
  kind: ChatEmptyStateKind
  disabled?: boolean
  onSelectPrompt: (prompt: ChatPrompt) => void
}

export function ChatEmptyState({ kind, disabled = false, onSelectPrompt }: ChatEmptyStateProps) {
  if (kind === 'chat-welcome') {
    return <ChatWelcome disabled={disabled} onSelectPrompt={onSelectPrompt} />
  }
  if (kind === 'workspace-welcome') {
    return <ChatWorkspaceWelcome disabled={disabled} onSelectPrompt={onSelectPrompt} />
  }
  return <EmptyState />
}

type WelcomeProps = {
  disabled?: boolean
  onSelectPrompt: (prompt: ChatPrompt) => void
}

export function ChatWelcome({ disabled = false, onSelectPrompt }: WelcomeProps) {
  return (
    <div className={cn(EMPTY_STATE_STYLES, 'max-w-md min-w-0')}>
      <div className="prose prose-sm min-w-0 wrap-anywhere prose-inherit">
        <p>moi is the visual workspace for you and your agent.</p>
        <p>
          It can grow and adapt to the work you're doing. Just describe what you want, and the agent
          will build small apps in the workspace.
        </p>
        <p>
          You start chatting with <WelcomeTerm Icon={IconGhost}>Agent</WelcomeTerm>, where you can
          ask questions and build anything. <WelcomeTerm Icon={IconLayout2}>Widgets</WelcomeTerm>{' '}
          are small apps that surface information and provide quick actions. For more complex tools,
          you can build <WelcomeTerm Icon={IconArticle}>Views</WelcomeTerm> that open in their own
          tabs. <WelcomeTerm Icon={IconSketching}>Scratchpad</WelcomeTerm> is a shared canvas for
          exploring and shaping ideas with your agent.
        </p>
        <p>Give it a try:</p>
      </div>
      <ChatPromptBubbles
        prompts={CHAT_WELCOME_PROMPTS}
        disabled={disabled}
        onSelect={onSelectPrompt}
      />
    </div>
  )
}

export function ChatWorkspaceWelcome({ disabled = false, onSelectPrompt }: WelcomeProps) {
  return (
    <div className={cn(EMPTY_STATE_STYLES, 'gap-2')}>
      <div className="prose prose-sm max-w-60 min-w-0 text-center wrap-anywhere text-muted-foreground prose-inherit">
        <p>See what moi can build for you</p>
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
    <div className={cn(EMPTY_STATE_STYLES, 'gap-1 text-center')}>
      <p className="mx-auto max-w-sm text-sm text-muted-foreground">
        Chat with your agent, create widgets and views, and manage your workspace context from here
      </p>
    </div>
  )
}

type WelcomeTermProps = {
  Icon: TablerIcon
  children: string
}

function WelcomeTerm({ Icon, children }: WelcomeTermProps) {
  return (
    <strong className="inline-flex items-center gap-0.5 align-bottom font-medium">
      <Icon size={16} stroke={2} aria-hidden />
      {children}
    </strong>
  )
}
