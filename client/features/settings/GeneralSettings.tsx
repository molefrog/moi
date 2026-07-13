import { useState } from 'react'

import { IconLoader2 } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { useRemoveWorkspace } from '@/client/features/workspaces/api'

import { useSaveWorkspaceName } from './api'
import { IconPicker } from './IconPicker'
import { SettingsPage, SettingsRow, SettingsSection } from './SettingsLayout'

export function GeneralSettings() {
  const { name, icon, cwd, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  const saveName = useSaveWorkspaceName(workspaceId)
  const removeWorkspace = useRemoveWorkspace()
  const [draft, setDraft] = useState(name ?? '')

  const commit = () => {
    const next = draft.trim()
    if (next === (name ?? '')) return
    saveName.mutate(next === '' ? null : next)
  }

  const remove = () => {
    const label = name ?? cwd ?? 'this space'
    const message = `Remove "${label}" from your spaces?\n\nThis only removes it from your list. The folder and its sessions stay on disk. You can add it back any time.`
    if (!window.confirm(message)) return
    removeWorkspace.mutate(workspaceId, { onSuccess: () => navigate('/') })
  }

  return (
    <SettingsPage title="General" description="Basic details for this space.">
      <SettingsSection>
        <SettingsRow
          title="Name"
          description="Shown in the sidebar and the space header."
          control={
            <Input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={event => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              placeholder="Space name"
              className="w-56"
            />
          }
        />
        <div className="flex flex-col gap-4 px-3.5 py-3.5">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Icon</span>
            <span className="text-xs text-muted-foreground">
              Pick an emoji or a glyph on a generated background, or upload an image.
            </span>
          </div>
          <IconPicker icon={icon} />
        </div>
      </SettingsSection>

      <SettingsSection label="Danger zone">
        <SettingsRow
          title="Remove space"
          description="Remove this space from Moi. Its folder and sessions stay on disk."
          control={
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={remove}
              disabled={removeWorkspace.isPending}
            >
              {removeWorkspace.isPending && (
                <IconLoader2 data-icon="inline-start" stroke={1.75} className="animate-spin" />
              )}
              Remove
            </Button>
          }
        />
        {removeWorkspace.isError && (
          <p className="px-3.5 py-3 text-xs text-destructive">{removeWorkspace.error.message}</p>
        )}
      </SettingsSection>
    </SettingsPage>
  )
}
