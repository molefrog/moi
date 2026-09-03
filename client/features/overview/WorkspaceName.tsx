import { useEffect, useState } from 'react'

import { InlineInput } from '@/client/components/ui/inline-input'
import { Popover, PopoverContent, PopoverTrigger } from '@/client/components/ui/popover'
import { workspaceProviderIcon } from '@/client/features/home/workspace-presentation'
import { useSaveWorkspaceName } from '@/client/features/settings/api'
import { WorkspaceIconPicker } from '@/client/features/settings/WorkspaceIconPicker'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'

export function WorkspaceName() {
  const { name, icon, provider, workspaceId } = useWorkspaceLayoutCtx()
  const workspaceName = name ?? 'Workspace'
  const workspaceIcon = icon ?? workspaceProviderIcon[provider ?? 'claude-code']
  const saveName = useSaveWorkspaceName(workspaceId)
  const [nameDraft, setNameDraft] = useState(workspaceName)

  useEffect(() => setNameDraft(workspaceName), [workspaceName])

  function commitName(value: string) {
    const next = value.trim()
    setNameDraft(next)
    if (next !== workspaceName) saveName.mutate(next === '' ? null : next)
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Change workspace icon"
              className="group shrink-0 cursor-pointer rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <img src={workspaceIcon} alt="" className="size-10 rounded-lg" />
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={8}
          className="w-[min(32rem,calc(100vw-2rem))] gap-4 rounded-2xl p-6"
        >
          <WorkspaceIconPicker />
        </PopoverContent>
      </Popover>
      <InlineInput
        aria-label="Workspace name"
        value={nameDraft}
        onValueChange={setNameDraft}
        onValueCommit={commitName}
        className="min-w-0 truncate text-3xl font-semibold md:text-3xl"
      />
    </div>
  )
}
