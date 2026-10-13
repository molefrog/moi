import { Button } from '@/client/components/ui/button'
import { CreateWorkspaceDialog } from '@/client/features/setup/workspace/create-workspace-dialog'

import { OnboardingLayout } from './onboarding-layout'

export function WorkspaceStep() {
  return (
    <OnboardingLayout
      title="Create your first workspace"
      description="A workspace brings your chats, files, and views together."
    >
      {/* Reuse the current dialog until the inline setup form is designed. */}
      <div>
        <CreateWorkspaceDialog trigger={<Button>Create workspace</Button>} />
      </div>
    </OnboardingLayout>
  )
}
