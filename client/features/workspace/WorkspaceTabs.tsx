import { IconPlus, IconRobotFace, IconX } from '@tabler/icons-react'

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
  Icon: typeof IconRobotFace
  label: string
  closable?: boolean
}

export type CreateWorkspaceTabItem = {
  key: string
  Icon: typeof IconRobotFace
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

const tabClass = (active: boolean) =>
  cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    active && 'bg-accent text-accent-foreground'
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

type TabButtonProps = {
  tab: WorkspaceTabItem
  active: boolean
  state: ReorderableRenderState
  onSelect: (tab: WorkspaceTabId) => void
  onClose: (tab: WorkspaceTabId) => void
}

function TabButton({ tab, active, state, onSelect, onClose }: TabButtonProps) {
  const className = cn(tabClass(active), 'min-w-0', state.isDragging && 'invisible')

  if (!tab.closable) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onSelect(tab.key)}
        {...state.dragHandleProps}
      >
        <tab.Icon stroke={1.75} />
        <span className="truncate">{tab.label}</span>
      </button>
    )
  }

  return (
    <div className={cn(className, 'group/close relative overflow-hidden')}>
      <button
        type="button"
        className="flex min-w-0 items-center gap-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => onSelect(tab.key)}
        {...state.dragHandleProps}
      >
        <tab.Icon stroke={1.75} />
        <span className="truncate">{tab.label}</span>
      </button>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end rounded-r-xs bg-linear-to-l from-accent via-accent/95 via-55% to-transparent pr-1.5 opacity-0 transition-opacity duration-150 group-hover/close:opacity-100 group-focus-within/close:opacity-100"
      />
      <button
        type="button"
        aria-label={`Close ${tab.label}`}
        className="absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-xs text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/close:opacity-100 group-focus-within/close:opacity-100"
        onClick={() => onClose(tab.key)}
      >
        <IconX className="size-3!" stroke={1.75} />
      </button>
    </div>
  )
}

function TabDragPreview({ tab, active }: { tab: WorkspaceTabItem; active: boolean }) {
  return (
    <div className={cn(tabClass(active), 'cursor-grabbing shadow-lg ring-1 ring-border')}>
      <tab.Icon stroke={1.75} />
      {tab.label}
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
      <div className="scroll-fade-x scrollbar-none min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        <ReorderableList
          items={tabs}
          getId={tab => tab.key}
          className="flex w-max items-center gap-1"
          onReorder={ordered => onReorder(ordered as WorkspaceTabId[])}
          renderPlaceholder={() => (
            <div className="pointer-events-none absolute inset-0 rounded-xs bg-muted" />
          )}
          renderOverlay={tab => <TabDragPreview tab={tab} active={active === tab.key} />}
          renderItem={(tab, state) => (
            <TabButton
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
