import {
  IconArticle,
  IconChartBar,
  IconFolder,
  IconGhost,
  IconLayout2,
  IconRepeat,
  IconSketching,
  type TablerIcon
} from '@tabler/icons-react'

import { ChatPromptBubbles, type ChatPromptBubble } from '@/client/features/chat/ChatPromptBubbles'

const PROMPTS = [
  { label: 'Track my daily habits', prompt: 'Track my daily habits.', icon: IconRepeat },
  {
    label: 'Work with my files',
    prompt: 'Work with my files.',
    icon: IconFolder
  },
  {
    label: 'Build a sales tool',
    prompt: 'Build a tool to manage my sales.',
    icon: IconChartBar
  }
] satisfies ChatPromptBubble[]

type ChatWelcomeProps = {
  onSelectPrompt: (prompt: string) => void
}

export function ChatWelcome({ onSelectPrompt }: ChatWelcomeProps) {
  return (
    <div className="flex max-w-md min-w-0 flex-col pb-2">
      <div className="prose prose-sm min-w-0 wrap-anywhere prose-inherit">
        <p>moi is the visual workspace for you and your agent.</p>
        <p>
          It can grow and adapt it to the work you're doing. Just describe what you want, and your
          agent will extend the workspace with small apps wired to your data.
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
      <ChatPromptBubbles prompts={PROMPTS} onSelect={onSelectPrompt} />
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
