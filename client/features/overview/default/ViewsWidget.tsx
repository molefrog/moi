import { IconPlus, type TablerIcon } from '@tabler/icons-react'

import { getViewIcon, getViewLabel } from '@/client/features/views/view-presentation'
import { cn } from '@/client/lib/cn'
import type { ViewBuilder, ViewInfo } from '@/lib/types'

type ViewButtonProps = {
  variant?: 'default' | 'secondary' | 'outline'
  Icon: TablerIcon
  label: string
  ariaLabel: string
  onClick: () => void
}

function ViewButton({ variant = 'default', Icon, label, ariaLabel, onClick }: ViewButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        'group flex w-20 shrink-0 cursor-pointer flex-col items-center gap-2 text-sm',
        variant === 'secondary' ? 'text-muted-foreground' : 'text-foreground'
      )}
    >
      <div
        className={cn(
          'size-16 rounded-2xl',
          variant === 'outline' && 'shadow-xs',
          variant !== 'secondary' &&
            'transition-shadow duration-300 ease-out group-hover:shadow-2xl'
        )}
      >
        <div
          className={cn(
            'flex size-full items-center justify-center rounded-2xl',
            variant === 'default'
              ? 'bg-primary text-primary-foreground inset-shadow-[0_0_10px_color-mix(in_oklab,var(--color-white)_30%,transparent)]'
              : variant === 'outline'
                ? 'bg-card text-foreground'
                : 'bg-accent'
          )}
          data-vivid={variant === 'default' || undefined}
        >
          <Icon size={32} stroke={1} />
        </div>
      </div>
      <span className="line-clamp-2 w-full text-xs leading-snug font-medium text-ellipsis">
        {label}
      </span>
    </button>
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
          className="pointer-events-none absolute inset-0 texture-checker [mask-image:linear-gradient(to_right,transparent_40%,black)]"
          aria-hidden
        />
      )}
      <h2 className="relative pr-6 pl-12 text-2xl font-semibold text-foreground">Views</h2>
      <div className="relative no-scrollbar flex scroll-fade-x gap-2 overflow-x-auto px-6 pt-4 [--scroll-fade-reveal:16px]">
        {views.map(view => {
          const Icon = getViewIcon(view, builders)
          const label = getViewLabel(view)
          return (
            <ViewButton
              key={view.id}
              Icon={Icon}
              label={label}
              ariaLabel={`Open ${label}`}
              onClick={() => onOpenView(view.id)}
            />
          )
        })}
        <ViewButton
          variant={empty ? 'outline' : 'secondary'}
          Icon={IconPlus}
          label="New view"
          ariaLabel="Create new view"
          onClick={onCreateView}
        />
      </div>
      {empty && showOnboarding && (
        <p className="relative mr-8 ml-auto max-w-56 text-right text-sm text-muted-foreground">
          Create new views when you need separate pages for focused tasks
        </p>
      )}
    </div>
  )
}
