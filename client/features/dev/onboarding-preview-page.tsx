import { useState } from 'react'
import { ScreenShell } from '@/client/components/shared/screen-shell'
import { Button } from '@/client/components/ui/button'
import { IdeaOptions } from '@/client/features/onboarding/workspace-setup-step'
import type { OnboardingIdea, OnboardingViewPlan } from '@/lib/onboarding'

// Fixed preview data. These actions never call discovery or create a workspace.
function view(name: string, icon: OnboardingViewPlan['icon']): OnboardingViewPlan {
  return { name, icon, description: name, features: [name] }
}

const ideas: OnboardingIdea[] = [
  {
    id: 'review-desk',
    name: 'Moi review desk',
    icon: 'palette',
    theme: { font: 'geometric', color: 'mint' },
    description:
      'Keep Moi’s product reviews, visual checks, and design decisions together. A focused place to turn ongoing development into clear next steps.',
    views: [
      view('Review queue', 'code'),
      view('Visual checks', 'photo'),
      view('Design decisions', 'bulb')
    ],
    widgets: []
  },
  {
    id: 'tool-notebook',
    name: 'Agent tool notebook',
    icon: 'flask',
    theme: { font: 'mono', color: 'lavender' },
    description:
      'Keep tool invites, hands-on trials, and useful product ideas in one place. Fits your ongoing exploration of agent software and personal computing.',
    views: [
      view('Access tracker', 'key'),
      view('Trial bench', 'flask'),
      view('Useful patterns', 'brain')
    ],
    widgets: []
  },
  {
    id: 'berlin-plans',
    name: 'Berlin plans',
    icon: 'compass',
    theme: { font: 'rounded', color: 'sand' },
    description:
      'Turn Berlin guides and cinema emails into a short list of places and plans. Keep booked outings handy and save interesting finds for later.',
    views: [
      view('Saved places', 'map'),
      view('Outing planner', 'calendar'),
      view('Tickets', 'file')
    ],
    widgets: []
  }
]

export function OnboardingPreviewPage() {
  const [selectedIdeaId, setSelectedIdeaId] = useState<string>()
  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <ScreenShell>
        <IdeaOptions
          ideas={ideas}
          selectedIdeaId={selectedIdeaId}
          onSelect={setSelectedIdeaId}
          feedback={null}
          footer={
            <Button size="lg" variant="ghost" onClick={() => setSelectedIdeaId(undefined)}>
              {selectedIdeaId ? 'Reset preview' : 'Start from scratch'}
            </Button>
          }
        />
      </ScreenShell>
    </main>
  )
}
