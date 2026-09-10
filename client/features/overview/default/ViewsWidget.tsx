import { useState } from 'react'

import {
  IconDots,
  IconEdit,
  IconLoader2,
  IconPlus,
  IconTrash,
  type TablerIcon
} from '@tabler/icons-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/client/components/ui/alert-dialog'
import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { InlineInput } from '@/client/components/ui/inline-input'
import { toast } from '@/client/components/ui/toast'
import { useDeleteView, useRenameView } from '@/client/features/views/api'
import { getViewIcon, getViewLabel } from '@/client/features/views/view-presentation'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import type { ViewBuilder, ViewInfo } from '@/lib/types'

type NewViewButtonProps = {
  outlined: boolean
  onClick: () => void
}

function NewViewButton({ outlined, onClick }: NewViewButtonProps) {
  return (
    <button
      type="button"
      aria-label="Create new view"
      onClick={onClick}
      className={cn(
        'group flex w-20 shrink-0 cursor-pointer flex-col items-center gap-2 text-sm',
        outlined ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      <div
        className={cn(
          'size-16 rounded-2xl squircle',
          outlined && 'shadow-xs transition-shadow duration-300 ease-out group-hover:shadow-2xl'
        )}
      >
        <div
          className={cn(
            'flex size-full items-center justify-center rounded-2xl squircle',
            outlined ? 'bg-background text-foreground' : 'bg-accent'
          )}
        >
          <IconPlus size={32} stroke={1.25} />
        </div>
      </div>
      <span className="line-clamp-2 w-full text-xs leading-snug font-medium text-ellipsis">
        New view
      </span>
    </button>
  )
}

type ViewItemProps = {
  view: ViewInfo
  Icon: TablerIcon
  onOpen: () => void
}

function ViewItem({ view, Icon, onOpen }: ViewItemProps) {
  const { workspaceId } = useWorkspaceLayoutCtx()
  const renameView = useRenameView(workspaceId)
  const deleteView = useDeleteView(workspaceId)
  const label = getViewLabel(view)
  const [editing, setEditing] = useState(false)

  function startRename() {
    setEditing(true)
  }

  function commitRename(value: string) {
    const title = value.trim()
    if (!title || title === label) return

    renameView.mutate(
      { viewId: view.id, title },
      {
        onError: error => {
          toast.add({
            title: 'Couldn’t rename view',
            description: error.message,
            type: 'error'
          })
        }
      }
    )
  }

  return (
    <div className="group/item relative w-20 shrink-0">
      <button
        type="button"
        aria-label={`Open ${label}`}
        onClick={onOpen}
        className="group flex w-20 cursor-pointer flex-col items-center gap-2 text-sm text-foreground"
      >
        <div className="size-16 rounded-2xl transition-shadow duration-300 ease-out squircle group-hover:shadow-2xl group-hover/item:shadow-2xl">
          <div
            data-vivid
            className="flex size-full items-center justify-center rounded-2xl bg-primary text-primary-foreground inset-shadow-[0_0_10px_color-mix(in_oklab,var(--color-white)_30%,transparent)] squircle"
          >
            <Icon size={32} stroke={1.25} />
          </div>
        </div>
        <span className="line-clamp-2 w-full text-xs leading-snug font-medium text-ellipsis">
          {editing ? '' : label}
        </span>
      </button>

      {editing && (
        <InlineInput
          autoFocus
          selectOnFocus
          aria-label={`Rename ${label}`}
          defaultValue={label}
          onBlur={() => setEditing(false)}
          onValueCommit={commitRename}
          className="absolute top-18 left-0 m-0 h-auto w-20 max-w-20 min-w-0 rounded-xs px-1 py-0 text-center text-xs leading-snug font-medium"
        />
      )}

      <AlertDialog>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={`View actions for ${label}`}
                className="absolute -top-1 right-1 border-0 opacity-0 shadow-xs transition-opacity group-hover/item:opacity-100 group-hover/item:delay-50 group-hover/item:duration-0 focus-visible:opacity-100 data-popup-open:opacity-100"
              >
                <IconDots stroke={1.75} />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-32">
            <DropdownMenuItem onClick={startRename} disabled={renameView.isPending}>
              <IconEdit stroke={1.75} />
              Rename
            </DropdownMenuItem>
            <AlertDialogTrigger
              render={
                <DropdownMenuItem
                  disabled={deleteView.isPending}
                  onClick={() => deleteView.reset()}
                />
              }
            >
              <IconTrash stroke={1.75} />
              Delete
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the view and its source code. Related data and shared files stay in the
              workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteView.isError && (
            <p className="text-xs text-destructive">{deleteView.error.message}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteView.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={deleteView.isPending}
              onClick={() => deleteView.mutate(view.id)}
            >
              {deleteView.isPending && (
                <IconLoader2 data-icon="inline-start" stroke={1.75} className="animate-spin" />
              )}
              Delete view
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type ViewsWidgetProps = {
  views: ViewInfo[]
  builders: ViewBuilder[]
  onOpenView: (viewId: string) => void
  onCreateView: () => void
  showOnboarding: boolean
}

export function ViewsWidget({
  views,
  builders,
  onOpenView,
  onCreateView,
  showOnboarding
}: ViewsWidgetProps) {
  const empty = views.length === 0

  return (
    <div className="relative no-scrollbar flex size-full items-center overflow-hidden bg-muted">
      {empty && (
        <div
          className="pointer-events-none absolute inset-0 texture-checker [mask-image:linear-gradient(to_right,transparent_40%,black_80%)]"
          aria-hidden
        />
      )}
      <h2 className="relative pr-6 pl-12 text-2xl font-semibold text-foreground">Views</h2>
      <div className="relative no-scrollbar flex scroll-fade-x gap-2 overflow-x-auto px-6 pt-4 [--scroll-fade-reveal:16px]">
        {views.map(view => (
          <ViewItem
            key={view.id}
            view={view}
            Icon={getViewIcon(view, builders)}
            onOpen={() => onOpenView(view.id)}
          />
        ))}
        <NewViewButton outlined={empty} onClick={onCreateView} />
      </div>
      {empty && showOnboarding && (
        <p className="relative mr-8 ml-auto max-w-56 text-right text-sm text-muted-foreground">
          Create new views when you need separate pages for focused tasks
        </p>
      )}
    </div>
  )
}
