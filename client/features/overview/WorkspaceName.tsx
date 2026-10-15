import { useEffect, useState } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/client/components/ui/popover'
import { WorkspaceIdentity } from '@/client/features/workspace/workspace-identity'
import { useSaveWorkspaceName } from '@/client/features/settings/api'
import { WorkspaceIconPicker } from '@/client/features/settings/WorkspaceIconPicker'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'

export function WorkspaceName() {
  const { layout, name, provider, workspaceId } = useWorkspaceLayoutCtx()
  const workspaceName = name ?? 'Workspace'
  const saveName = useSaveWorkspaceName(workspaceId)
  const [nameDraft, setNameDraft] = useState(workspaceName)

  useEffect(() => setNameDraft(workspaceName), [workspaceName])

  function commitName(value: string) {
    const next = value.trim()
    setNameDraft(next)
    if (next !== workspaceName) saveName.mutate(next === '' ? null : next)
  }

  return (
    <WorkspaceIdentity
      name={nameDraft}
      icon={layout.icon}
      workspaceType={provider}
      workspaceTheme={layout.theme}
      onNameChange={setNameDraft}
      onNameCommit={commitName}
      renderIcon={icon => (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Change workspace icon"
                className="group inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg p-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {icon}
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
      )}
    />
  )
}
