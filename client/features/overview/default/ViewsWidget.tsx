import { IconBrowserPlus } from '@tabler/icons-react'

import { Button } from '@/client/components/ui/button'
import { getViewIcon, getViewLabel } from '@/client/features/views/view-presentation'
import type { ViewBuilder, ViewInfo } from '@/lib/types'

type ViewsWidgetProps = {
  views: ViewInfo[]
  builders: ViewBuilder[]
  onOpenView: (viewId: string) => void
  onCreateView: () => void
}

export function ViewsWidget({ views, builders, onOpenView, onCreateView }: ViewsWidgetProps) {
  return (
    <div className="flex size-full items-center bg-background">
      {views.length === 0 ? (
        <div className="flex size-full items-center justify-center bg-muted texture-checker">
          <div className="flex size-full max-w-(--column-w) items-center justify-center bg-radial from-background from-40% to-transparent to-80%">
            <Button type="button" variant="secondary" onClick={onCreateView}>
              <IconBrowserPlus data-icon="inline-start" stroke={1.5} />
              New view
            </Button>
          </div>
        </div>
      ) : (
        <div className="no-scrollbar w-full min-w-0 scroll-fade-x overflow-x-auto overflow-y-hidden [--scroll-fade-reveal:16px]">
          <div className="flex w-max items-center gap-1 px-2">
            {views.map(view => {
              const Icon = getViewIcon(view, builders)
              const label = getViewLabel(view)
              return (
                <button
                  key={view.id}
                  type="button"
                  title={label}
                  aria-label={`Open ${label}`}
                  onClick={() => onOpenView(view.id)}
                  className="group/view flex w-20 shrink-0 flex-col items-center gap-2 rounded-lg p-2 text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground shadow-xs transition-shadow duration-100 group-hover/view:shadow-sm">
                    <Icon size={24} stroke={1.5} />
                  </span>
                  <span className="w-full truncate">{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
