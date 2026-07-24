import { IconFolderExclamation, IconLoader2, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { cn } from '@/client/lib/cn'

export type WorkspaceSkillUpdateAction = 'auto' | 'once'

export type WorkspaceSkillUpdateBannerProps = {
  error: string | null
  pendingAction: WorkspaceSkillUpdateAction | null
  onUpdate: (action: WorkspaceSkillUpdateAction) => void
  onDismiss: () => void
}

export function WorkspaceSkillUpdateBanner({
  error,
  pendingAction,
  onUpdate,
  onDismiss
}: WorkspaceSkillUpdateBannerProps) {
  const pending = pendingAction !== null

  return (
    <div
      role={error ? 'alert' : 'status'}
      className={cn(
        'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 p-2 text-sm',
        '@xl:flex @xl:items-center @xl:px-2 @xl:pl-3',
        error && 'text-destructive'
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5 @xl:order-1 @xl:flex-1 @xl:items-center">
        <IconFolderExclamation size={20} stroke={1.5} className="shrink-0" />
        {error ? (
          <span className="wrap-break-word">{`Update failed: ${error}`}</span>
        ) : (
          <span className="wrap-break-word">This workspace is using old moi skills</span>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onDismiss}
        className="col-start-2 row-start-1 -mt-1 -mr-1 text-muted-foreground hover:text-foreground @xl:order-4 @xl:m-0"
        aria-label="Dismiss skill update"
      >
        <IconX stroke={1.75} />
      </Button>

      <div className="col-span-2 flex flex-wrap gap-1.5 @xl:contents">
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => onUpdate('auto')}
          disabled={pending}
          className="@xl:order-2"
        >
          {pendingAction === 'auto' && <IconLoader2 stroke={1.75} className="animate-spin" />}
          {pendingAction === 'auto' ? 'Updating…' : 'Auto-update'}
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onUpdate('once')}
          disabled={pending}
          className="@xl:order-3"
        >
          {pendingAction === 'once' && <IconLoader2 stroke={1.75} className="animate-spin" />}
          {pendingAction === 'once' ? 'Updating…' : 'Update once'}
        </Button>
      </div>
    </div>
  )
}
