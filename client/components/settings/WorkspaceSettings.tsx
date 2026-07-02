import { useState } from 'react'

import { IconKey, IconSettings, IconX } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/client/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'

import { EnvironmentSettings, GeneralSettings } from './SettingsPages'

type SettingsNav = 'general' | 'environment'

const NAV: { id: SettingsNav; label: string; icon: typeof IconSettings }[] = [
  { id: 'general', label: 'General', icon: IconSettings },
  { id: 'environment', label: 'Environment', icon: IconKey }
]

export function WorkspaceSettings() {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<SettingsNav>('general')

  return (
    <>
      <Tooltip delay={50}>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Workspace settings"
              className="size-7 text-primary [&_svg]:size-[20px]"
              onClick={() => setOpen(true)}
            >
              <IconSettings stroke={1.75} />
            </Button>
          }
        />
        <TooltipContent>Workspace settings</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(680px,90vh)] w-[880px] max-w-[94vw]">
          <DialogTitle className="sr-only">Workspace settings</DialogTitle>

          {/* Sidebar nav — top padding lines the "Settings" label up with the
              page title across the divider. */}
          <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border bg-muted/30 p-3">
            <p className="px-2.5 pt-4 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
              Settings
            </p>
            {NAV.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setPage(item.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors [&_svg]:size-[18px]',
                  page === item.id
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <item.icon stroke={1.75} />
                {item.label}
              </button>
            ))}
          </nav>

          {/* Page */}
          <div className="relative scrollbar-thin min-w-0 flex-1 overflow-y-auto">
            <DialogClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close"
                  className="absolute top-3 right-3 z-10 size-7 text-muted-foreground"
                >
                  <IconX stroke={1.5} />
                </Button>
              }
            />
            <div className="px-8 py-7">
              {page === 'general' ? <GeneralSettings /> : <EnvironmentSettings />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
