import { createElement, useId, useState } from 'react'
import { Badge } from '@/ui-components/badge'
import { cn } from '@/client/lib/cn'
import { resolveIdentityIcon } from '@/client/lib/identity-icon-registry'
import { resolveWorkspaceTheme } from '@/lib/themes'
import { getWorkspaceThemeStyle } from '@/client/runtime/workspace-theme'
import { WorkspaceIcon } from '@/client/components/shared/workspace-icon'
import type { OnboardingIdea, OnboardingViewPlan } from '@/lib/onboarding'

type OnboardingIdeaDiskProps = {
  idea: OnboardingIdea
  state: 'available' | 'chosen' | 'not-chosen'
  onSelect: () => void
}

export function OnboardingIdeaDisk({ idea, state, onSelect }: OnboardingIdeaDiskProps) {
  const theme = resolveWorkspaceTheme(idea.theme)
  const descriptionId = useId()

  return (
    <button
      type="button"
      aria-label={`Build ${idea.name}`}
      aria-describedby={descriptionId}
      aria-busy={state === 'chosen'}
      disabled={state !== 'available'}
      onClick={onSelect}
      style={getWorkspaceThemeStyle(theme)}
      className={cn(
        'relative mx-auto flex min-h-96 w-full max-w-sm min-w-0 flex-col rounded-2xl bg-transparent px-5 pb-6 text-center font-sans text-primary-foreground drop-shadow-sm outline-none lg:max-w-none',
        'lg:first:translate-y-6 lg:first:-rotate-4 lg:last:translate-y-5 lg:last:rotate-3',
        'focus-visible:ring-3 focus-visible:ring-ring/50 enabled:cursor-pointer enabled:hover:drop-shadow-lg',
        'motion-safe:transition-[translate,filter] motion-safe:duration-200 motion-safe:enabled:hover:-translate-y-1 motion-safe:enabled:active:translate-y-0',
        'lg:motion-safe:first:enabled:hover:translate-y-5 lg:motion-safe:last:enabled:hover:translate-y-4 lg:motion-safe:first:enabled:active:translate-y-3 lg:motion-safe:last:enabled:active:translate-y-3',
        'disabled:cursor-default',
        state === 'chosen' &&
          'motion-safe:animate-out motion-safe:ease-in-out motion-safe:animation-duration-1500 motion-safe:direction-alternate motion-safe:repeat-infinite motion-safe:[animation-composition:add] motion-safe:spin-out-3',
        state === 'not-chosen' && 'invisible'
      )}
    >
      <DiskBackground className="fill-primary" />
      <span
        aria-hidden="true"
        className="relative mb-4 ml-2 h-24 w-2/3 shrink-0 overflow-hidden rounded-b-xl"
      >
        <span className="absolute inset-x-0 -top-2 bottom-0 flex justify-end rounded-b-lg px-1.5 pt-2 pb-1.5 inset-shadow-[0_0_2px_1px] inset-shadow-foreground/15">
          <span className="relative w-3/4 rounded-b-lg bg-background/80">
            <span className="absolute inset-y-2 right-4 w-1/4 rounded-xs bg-primary" />
          </span>
        </span>
      </span>
      <span className="relative mx-2 my-2 flex flex-1 rounded-lg p-1.5 inset-shadow-[0_0_2px_1px] inset-shadow-foreground/15">
        <span className="relative flex flex-1 flex-col items-center justify-center gap-3 rounded-md bg-background px-4 py-8 text-foreground">
          <span className="flex max-w-full items-center justify-center gap-2">
            <WorkspaceIcon
              icon={{ type: 'glyph', value: idea.icon, background: 'theme' }}
              workspaceTheme={theme}
              className="size-5 rounded-sm"
            />
            <span className="min-w-0 text-lg font-semibold wrap-break-word">{idea.name}</span>
          </span>
          <span id={descriptionId} className="text-sm wrap-break-word">
            {idea.description}
          </span>
          {idea.views.map((view, index) => (
            <ViewSticker key={index} view={view} index={index} />
          ))}
        </span>
      </span>
    </button>
  )
}

type ViewStickerProps = { view: OnboardingViewPlan; index: number }

function ViewSticker({ view, index }: ViewStickerProps) {
  const Icon = resolveIdentityIcon(view.icon)
  const [rotation] = useState(() => {
    const angles = ['-rotate-3', '-rotate-2', '-rotate-1', 'rotate-1', 'rotate-2', 'rotate-3']
    return angles[Math.floor(Math.random() * angles.length)]
  })

  return (
    <Badge
      variant="outline"
      className={cn(
        'absolute h-8 max-w-1/2 min-w-0 gap-1.5 rounded-md border-0 bg-background px-2 py-1.5 text-xs font-normal ring-1 ring-border',
        rotation,
        index === 0 && 'top-0 right-8 -translate-y-1/2',
        index === 1 && 'bottom-0 -left-2 translate-y-1/2',
        index === 2 && '-right-2 bottom-0 translate-y-1/2'
      )}
    >
      {Icon &&
        createElement(Icon, { className: 'size-4 shrink-0', stroke: 1.75, 'aria-hidden': true })}
      <span className="truncate font-medium">{view.name}</span>
    </Badge>
  )
}

type DiskBackgroundProps = { className: string }

function DiskBackground({ className }: DiskBackgroundProps) {
  const shapeId = useId()
  const clipId = useId()

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 360 400"
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      <defs>
        <path
          id={shapeId}
          d="M12 0H324C328 0 330 1 333 4L356 27C359 30 360 32 360 36V388C360 394.63 354.63 400 348 400H12C5.37 400 0 394.63 0 388V12C0 5.37 5.37 0 12 0Z"
        />
        <clipPath id={clipId}>
          <use href={`#${shapeId}`} />
        </clipPath>
      </defs>
      <use href={`#${shapeId}`} />
      <foreignObject width="360" height="400" clipPath={`url(#${clipId})`}>
        <div className="size-full rounded-xl inset-shadow-[0_0_16px_color-mix(in_oklab,var(--color-white)_20%,transparent)]" />
      </foreignObject>
    </svg>
  )
}
