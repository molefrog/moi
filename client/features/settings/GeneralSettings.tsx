import { IconLoader2 } from '@tabler/icons-react'
import { useLocation } from 'wouter'

import { useAppConfig } from '@/client/api/app-config'
import { Button } from '@/client/components/ui/button'
import { Input } from '@/client/components/ui/input'
import { useRemoveWorkspace } from '@/client/features/home/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'

import { SettingsPage, SettingsRow, SettingsSection } from './SettingsLayout'

export function GeneralSettings() {
  const { cloudDemo } = useAppConfig()
  const { name, cwd, workspaceId } = useWorkspaceLayoutCtx()
  const [, navigate] = useLocation()
  const removeWorkspace = useRemoveWorkspace()

  const remove = () => {
    const label = name ?? cwd ?? 'this space'
    const message = `Remove "${label}" from your workspaces?\n\nThis only removes it from your list. The folder and its sessions stay on disk. You can add it back any time.`
    if (!window.confirm(message)) return
    removeWorkspace.mutate(workspaceId, { onSuccess: () => navigate('/') })
  }

  return (
    <SettingsPage title="General" description="Basic details for this space.">
      <SettingsSection>
        <SettingsRow
          title="Path"
          control={
            <Input
              value={cwd ?? ''}
              readOnly
              aria-label="Workspace path"
              title={cwd ?? undefined}
              className="w-56"
            />
          }
        />
      </SettingsSection>

      {!cloudDemo && (
        <SettingsSection label="Danger zone">
          <SettingsRow
            title="Remove space"
            description="Remove this space from moi. Its folder and sessions stay on disk."
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
      )}
    </SettingsPage>
  )
}
