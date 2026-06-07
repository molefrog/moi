import { useState } from 'react'

import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

import { SidebarLayout } from './SidebarLayout'

// Test route for the sidebar layout shell. The panel content here is just a
// placeholder — the shell is the component under test.
export function SidebarLayoutPage() {
  const [collapsed, setCollapsed] = useState(false)
  const Icon = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse

  return (
    <SidebarLayout collapsed={collapsed}>
      <div className="flex h-full flex-col">
        <header className="border-border flex h-12 shrink-0 items-center gap-2.5 border-b px-3">
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(c => !c)}
            className={cn(
              'text-muted-foreground hover:bg-muted hover:text-foreground flex size-7 items-center justify-center rounded-sm',
              collapsed ? 'cursor-e-resize' : 'cursor-w-resize'
            )}
          >
            <Icon size={20} strokeWidth={1.5} />
          </button>
          <span className="text-foreground text-sm font-medium">Home</span>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <span className="text-muted-foreground text-sm">Main content area</span>
        </div>
      </div>
    </SidebarLayout>
  )
}
