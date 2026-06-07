import { type ReactNode } from 'react'

import { AnimatePresence, motion } from 'motion/react'

import { IconHome, IconLayoutSidebar, IconPlus, IconSettings } from '@tabler/icons-react'

import { useWorkspaces } from '@/client/api/workspaces'
import claudeIcon from '@/client/assets/claude.svg'
import hermesIcon from '@/client/assets/hermes-nous.png'
import openclawIcon from '@/client/assets/openclaw.svg'
import { LedLogo } from '@/client/components/playground/LedLogo'
import { cn } from '@/client/lib/cn'
import type { WorkspaceEntry, WorkspaceType } from '@/lib/types'

const PROVIDER_ICON: Record<WorkspaceType, string> = {
  'claude-code': claudeIcon,
  openclaw: openclawIcon,
  hermes: hermesIcon
}

// Display name: explicit name → OpenClaw agentId → path basename.
function workspaceLabel(ws: WorkspaceEntry): string {
  if (ws.name) return ws.name
  if (ws.type === 'openclaw') return ws.agentId ?? 'OpenClaw agent'
  return ws.path.split('/').pop() || ws.path
}

const EXPANDED_WIDTH = 240
const COLLAPSED_WIDTH = 54

type SidebarLayoutProps = {
  children?: ReactNode
  collapsed?: boolean
}

// App shell: a sidebar beside an elevated white content panel.
// `children` renders inside the panel, so the same shell wraps any page.
export function SidebarLayout({ children, collapsed }: SidebarLayoutProps) {
  // Loaded once at this stable boundary — this component does NOT remount on
  // toggle (only the keyed <Sidebar> inside AnimatePresence does). The rows are
  // passed down ready, so they don't re-subscribe/refetch or flicker on collapse.
  const { data: workspaces } = useWorkspaces()

  return (
    <div className="flex h-dvh bg-[#f6f7f8]">
      {/* Width animates; the Sidebar crossfades on collapse via AnimatePresence.
          The two instances are absolutely positioned so they overlap. */}
      <motion.div
        className="relative shrink-0 overflow-hidden"
        initial={false}
        animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
        transition={{ type: 'spring', visualDuration: 0.2, bounce: 0 }}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={collapsed ? 'collapsed' : 'expanded'}
            className="absolute inset-y-0 left-0"
            // Per-version timing (each instance keeps its own props through exit):
            //   collapse: mini = instant,            full = fade out (no delay)
            //   expand:   full = fade in (no delay),  mini = hold then fade out
            // So one layer is always fully opaque over the shared icons → no dip.
            initial={collapsed ? false : { opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15, ease: 'easeOut' } }}
            exit={{
              opacity: 0,
              transition: collapsed
                ? { delay: 0.15, duration: 0.2, ease: 'easeIn' }
                : { duration: 0.2, ease: 'easeIn' }
            }}
          >
            <Sidebar collapsed={collapsed} workspaces={workspaces ?? []} />
          </motion.div>
        </AnimatePresence>
      </motion.div>
      <main className="bg-background min-w-0 flex-1 overflow-hidden rounded-l-md border-l border-gray-200 shadow-[1px_0px_3px_0px_rgba(0,0,0,0.1)]">
        {children}
      </main>
    </div>
  )
}

type SidebarProps = {
  // Collapsed keeps the sidebar's width: content is hidden in place (logo +
  // workspaces header stay invisible but occupy space) and rows drop their text.
  collapsed?: boolean
  workspaces: WorkspaceEntry[]
}

function Sidebar({ collapsed, workspaces }: SidebarProps) {
  return (
    <aside className={cn('flex h-full shrink-0 flex-col px-2.5', collapsed ? 'w-[54px]' : 'w-60')}>
      {/* Logo */}
      <div className={cn('mb-3.5 flex h-12 items-center px-1', collapsed && 'invisible')}>
        <LedLogo pixelSize={2.5} gap={1} mode="chaos" />
      </div>

      {/* Home */}
      <nav className="flex flex-col gap-0.5">
        <NavRow
          icon={<IconHome size={18} className="text-foreground shrink-0" />}
          label="Home"
          active
          collapsed={collapsed}
        />
      </nav>

      {/* Workspaces */}
      <div className="mt-5 flex flex-col gap-2">
        <div className={cn('flex items-center justify-between pl-2', collapsed && 'invisible')}>
          <span className="text-muted-foreground text-[13px] font-medium">Workspaces</span>
          <button
            type="button"
            aria-label="Add workspace"
            className="border-border bg-background text-foreground/60 hover:bg-muted hover:text-foreground flex size-6 items-center justify-center rounded-[6px] border"
          >
            <IconPlus size={16} />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5">
          {workspaces.map(ws => (
            <NavRow
              key={ws.id}
              icon={
                <img
                  src={PROVIDER_ICON[ws.type ?? 'claude-code']}
                  alt=""
                  className="size-[18px] shrink-0"
                />
              }
              label={workspaceLabel(ws)}
              collapsed={collapsed}
            />
          ))}
        </nav>
      </div>

      <div className="flex-1" />

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 py-3">
        <button
          type="button"
          className={cn(
            'hover:bg-foreground/[0.05] hover:text-foreground text-foreground flex h-8 items-center gap-2 rounded-[6px] pl-1.5 text-sm',
            collapsed ? 'pr-1.5' : 'pr-2.5'
          )}
        >
          <IconSettings size={18} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
        {/* Temporarily hidden */}
        <button
          type="button"
          aria-label="Toggle sidebar"
          className="text-foreground/45 hover:bg-foreground/[0.06] hover:text-foreground/80 hidden size-7 items-center justify-center rounded-[6px]"
        >
          <IconLayoutSidebar size={16} />
        </button>
      </div>
    </aside>
  )
}

type NavRowProps = {
  icon: ReactNode
  label: string
  active?: boolean
  collapsed?: boolean
}

function NavRow({ icon, label, active, collapsed }: NavRowProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'flex h-8 items-center gap-2.5 rounded-sm px-2 text-sm font-medium',
        active
          ? 'bg-foreground/[0.07] text-foreground'
          : 'text-foreground/65 hover:bg-foreground/[0.04] hover:text-foreground'
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}
