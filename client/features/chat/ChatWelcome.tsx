import {
  IconArticle,
  IconBriefcase,
  IconGhost,
  IconLayout2,
  IconPiano,
  IconSketching,
  IconUmbrella2,
  type TablerIcon
} from '@tabler/icons-react'

import { ChatPromptBubbles, type ChatPromptBubble } from '@/client/features/chat/ChatPromptBubbles'

const PROMPTS = [
  {
    label: "What's the weather?",
    prompt:
      "Build me a set of weather widgets that surface current conditions, today's hourly forecast, and a simple weekly outlook at a glance",
    icon: IconUmbrella2
  },
  {
    label: 'Build a fun sythesizer',
    prompt:
      'Build me a view with a simple, playful synthesizer featuring a keyboard, five sound controls, and the ability to record, save, and load music files from the workspace',
    icon: IconPiano
  },
  {
    label: 'Make a job tracker',
    prompt:
      'Build me a view with a visual job search board where I can add opportunities by pasting a job link, automatically extract the details, move opportunities through stages, and keep notes and related files in the workspace',
    icon: IconBriefcase
  }
] satisfies ChatPromptBubble[]

type ChatWelcomeProps = {
  onSelectPrompt: (prompt: string) => void
}

export function ChatWelcome({ onSelectPrompt }: ChatWelcomeProps) {
  return (
    <div className="flex min-h-full max-w-md min-w-0 flex-col items-center justify-center self-center pb-2">
      <div className="prose prose-sm min-w-0 wrap-anywhere prose-inherit">
        <p>moi is the visual workspace for you and your agent.</p>
        <p>
          It can grow and adapt it to the work you're doing. Just describe what you want, and the
          agent will build small apps in the workspace.
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
