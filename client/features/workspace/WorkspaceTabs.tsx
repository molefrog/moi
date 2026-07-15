import { IconPlus, IconX, type TablerIcon } from '@tabler/icons-react'
import { cva } from 'class-variance-authority'

import { ReorderableList } from '@/client/components/shared/ReorderableList'
import type { ReorderableRenderState } from '@/client/components/shared/ReorderableList'
import { Button, buttonVariants } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import type { WorkspaceTabId } from '@/lib/types'

export type WorkspaceTabItem = {
  key: WorkspaceTabId
  Icon: TablerIcon
  label: string
  closable?: boolean
}

export type CreateWorkspaceTabItem = {
  key: string
  Icon: TablerIcon
  label: string
  onClick: () => void
}

type WorkspaceTabsProps = {
  tabs: WorkspaceTabItem[]
  active: WorkspaceTabId
  createItems: CreateWorkspaceTabItem[]
  onSelect: (tab: WorkspaceTabId) => void
  onClose: (tab: WorkspaceTabId) => void
  onReorder: (ordered: WorkspaceTabId[]) => void
}

const workspaceTabVariants = cva(
  [buttonVariants({ variant: 'ghost', size: 'sm' }), 'group/tab min-w-0'],
  {
    variants: {
      active: {
        true: 'bg-accent text-accent-foreground'
      },
      dragging: {
        true: 'invisible'
      },
      preview: {
        true: 'cursor-grabbing ring-1 ring-border'
      }
    },
    compoundVariants: [{ preview: true }]
  }
)

function CreateTabMenu({ items }: { items: CreateWorkspaceTabItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Create tab"
          >
            <IconPlus stroke={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          {items.map(({ key, Icon, label, onClick }) => (
            <DropdownMenuItem key={key} onClick={onClick}>
              <Icon stroke={1.75} />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type WorkspaceTabBaseProps = {
  tab: WorkspaceTabItem
  active: boolean
}

type WorkspaceTabProps = WorkspaceTabBaseProps &
  (
    | {
        preview: true
        state?: never
        onSelect?: never
        onClose?: never
      }
    | {
        preview?: false
        state: ReorderableRenderState
        onSelect: (tab: WorkspaceTabId) => void
        onClose: (tab: WorkspaceTabId) => void
      }
  )

function WorkspaceTab(props: WorkspaceTabProps) {
  const { tab, active } = props
  const preview = props.preview === true

  return (
    <button
      type="button"
      aria-hidden={preview || undefined}
      aria-label={tab.label}
      disabled={preview}
      tabIndex={preview ? -1 : undefined}
      onClick={props.preview ? undefined : () => props.onSelect(tab.key)}
      className={workspaceTabVariants({
        active,
        dragging: props.preview ? false : props.state.isDragging,
        preview
      })}
      {...(props.preview ? {} : props.state.dragHandleProps)}
    >
      <div
        className={cn(
          'flex items-center gap-1 overflow-hidden',
          tab.closable && 'group-hover/tab:mr-3'
        )}
      >
        <tab.Icon data-icon="inline-start" stroke={1.75} />
        <span
          className={cn(
            'truncate',
            tab.closable &&
              'group-hover/tab:-mr-3 group-hover/tab:mask-r-from-[calc(100%-24px)] group-hover/tab:mask-r-to-[calc(100%-12px)]'
          )}
        >
          {tab.label}
        </span>
      </div>
      {tab.closable && (
        <div
          aria-label={`Close ${tab.label}`}
          tabIndex={preview ? -1 : undefined}
          className={cn(
            'absolute right-2 hidden size-3 items-center justify-center text-muted-foreground group-hover/tab:flex hover:text-foreground',
            preview && 'pointer-events-none'
          )}
          onClick={
            props.preview
              ? undefined
              : event => {
                  event.stopPropagation()
                  props.onClose(tab.key)
                }
          }
        >
          <IconX stroke={1.75} />
        </div>
      )}
    </button>
  )
}

export function WorkspaceTabs({
  tabs,
  active,
  createItems,
  onSelect,
  onClose,
  onReorder
}: WorkspaceTabsProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <div className="no-scrollbar min-w-0 scroll-fade-x overflow-x-auto overflow-y-hidden [--scroll-fade-reveal:16px]">
        <ReorderableList
          items={tabs}
          getId={tab => tab.key}
          className="flex w-max items-center gap-1"
          onReorder={ordered => onReorder(ordered as WorkspaceTabId[])}
          renderPlaceholder={() => (
            <div className="pointer-events-none absolute inset-0 rounded-xs bg-muted" />
          )}
          renderOverlay={tab => <WorkspaceTab tab={tab} active={active === tab.key} preview />}
          renderItem={(tab, state) => (
            <WorkspaceTab
              tab={tab}
              active={active === tab.key}
              state={state}
              onSelect={onSelect}
              onClose={onClose}
            />
          )}
        />
      </div>
      <div className="shrink-0">
        <CreateTabMenu items={createItems} />
      </div>
    </div>
  )
}
