import { IconPlus, IconCircleXFilled, type TablerIcon } from '@tabler/icons-react'
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
  [buttonVariants({ variant: 'ghost', size: 'sm' }), 'group/tab relative min-w-0 overflow-hidden'],
  {
    variants: {
      active: {
        true: 'bg-accent text-accent-foreground'
      },
      closable: {
        false: 'px-2!'
      },
      dragging: {
        true: 'invisible'
      },
      preview: {
        true: 'cursor-grabbing shadow-lg ring-1 ring-border'
      }
    }
  }
)

const workspaceTabStyles = {
  closeButton:
    'absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-xs text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/tab:opacity-100 group-focus-within/tab:opacity-100'
} as const

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

type WorkspaceTabContentProps = {
  tab: WorkspaceTabItem
}

function WorkspaceTabContent({ tab }: WorkspaceTabContentProps) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <tab.Icon stroke={1.75} />
      <span className="truncate">{tab.label}</span>
    </div>
  )
}

type WorkspaceTabProps = {
  tab: WorkspaceTabItem
  active: boolean
  state: ReorderableRenderState
  onSelect: (tab: WorkspaceTabId) => void
  onClose: (tab: WorkspaceTabId) => void
}

function WorkspaceTab({ tab, active, state, onSelect, onClose }: WorkspaceTabProps) {
  return (
    <button
      type="button"
      className={workspaceTabVariants({
        active,
        closable: Boolean(tab.closable),
        dragging: state.isDragging
      })}
      onClick={() => onSelect(tab.key)}
      {...state.dragHandleProps}
    >
      <WorkspaceTabContent tab={tab} />
      {tab.closable && (
        <button
          type="button"
          aria-label={`Close ${tab.label}`}
          className={workspaceTabStyles.closeButton}
          onClick={() => onClose(tab.key)}
        >
          <IconCircleXFilled className="size-3!" stroke={1.75} />
        </button>
      )}
    </button>
  )
}

type WorkspaceTabPreviewProps = {
  tab: WorkspaceTabItem
  active: boolean
}

function WorkspaceTabPreview({ tab, active }: WorkspaceTabPreviewProps) {
  return (
    <div
      className={workspaceTabVariants({
        active,
        closable: Boolean(tab.closable),
        preview: true
      })}
    >
      <WorkspaceTabContent tab={tab} />
      {tab.closable && <IconX className="size-3!" stroke={1.75} />}
    </div>
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
      <div className="scrollbar-none min-w-0 scroll-fade-x overflow-x-auto overflow-y-hidden">
        <ReorderableList
          items={tabs}
          getId={tab => tab.key}
          className="flex w-max items-center gap-1"
          onReorder={ordered => onReorder(ordered as WorkspaceTabId[])}
          renderPlaceholder={() => (
            <div className="pointer-events-none absolute inset-0 rounded-xs bg-muted" />
          )}
          renderOverlay={tab => <WorkspaceTabPreview tab={tab} active={active === tab.key} />}
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
