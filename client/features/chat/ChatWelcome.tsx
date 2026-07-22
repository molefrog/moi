import {
  IconArticle,
  IconGhost,
  IconLayout2,
  IconSketching,
  type TablerIcon
} from '@tabler/icons-react'

import { ChatPromptBubbles, type ChatPromptBubble } from '@/client/features/chat/ChatPromptBubbles'

const PROMPTS = [
  { label: '“Track my daily habits.”', prompt: 'Track my daily habits.' },
  {
    label: '“Help me work with my project files.”',
    prompt: 'Help me work with my project files.'
  },
  { label: '“Build a tool to manage my sales.”', prompt: 'Build a tool to manage my sales.' }
] satisfies ChatPromptBubble[]

type ChatWelcomeProps = {
  onSelectPrompt: (prompt: string) => void
}

export function ChatWelcome({ onSelectPrompt }: ChatWelcomeProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 pb-2">
      <div className="prose prose-sm max-w-full min-w-0 wrap-anywhere prose-inherit">
        <p>moi is the UI for your AI.</p>
        <p>
          Build functional, reusable interfaces for your workspace. moi makes it easy to create apps
          that work with your data, manage workspace files, connect to external services, and adapt
          to your specific needs. Describe what you want, and your agent builds it directly inside
          the workspace.
        </p>
        <p>
          You start in <WelcomeTerm Icon={IconGhost}>Chat</WelcomeTerm>, where you can build with
          your agent and ask any questions. <WelcomeTerm Icon={IconLayout2}>Widgets</WelcomeTerm>{' '}
          are small apps on the Widgets tab that surface information and provide quick actions. For
          more complex tools, you can build <WelcomeTerm Icon={IconArticle}>Views</WelcomeTerm> that
          open in their own tabs. <WelcomeTerm Icon={IconSketching}>Scratchpad</WelcomeTerm> is a
          shared canvas for exploring and shaping ideas with your agent.
        </p>
        <p>
          As your needs evolve, you can add new tools, refine existing ones, and keep shaping the
          workspace around the way you work. You can also use your existing Claude or ChatGPT
          subscription directly in moi.
        </p>
        <p>What would you like to create first?</p>
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
    <strong className="inline-flex items-center gap-1 font-medium">
      <Icon size={16} stroke={1.75} aria-hidden />
      {children}
    </strong>
  )
}
