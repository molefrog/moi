import { IconCircleCheckFilled } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'
import type { WorkspaceType } from '@/lib/types'
import { harnessLabel, harnessIcon } from './harness-presentation'

export type HarnessOption = {
  type: WorkspaceType
  description: string
  disabled: boolean
  disabledReason?: string
  disabledCommand?: string
}

type HarnessSelectorProps = {
  mode?: 'select' | 'action'
  cardClassName?: string
  disabled: boolean
  options: HarnessOption[]
  selectedType?: WorkspaceType
  onTypeChange: (type: WorkspaceType) => void
}

export function HarnessSelector({
  mode = 'select',
  cardClassName,
  disabled,
  options,
  selectedType,
  onTypeChange
}: HarnessSelectorProps) {
  return (
    <fieldset
      disabled={disabled}
      aria-label="Agent"
      className="flex min-w-0 flex-wrap justify-center gap-2"
    >
      {options.map(option => (
        <HarnessOptionButton
          key={option.type}
          option={option}
          className={cardClassName}
          selected={mode === 'select' ? selectedType === option.type : undefined}
          onSelect={onTypeChange}
        />
      ))}
    </fieldset>
  )
}

type HarnessOptionButtonProps = {
  className?: string
  option: HarnessOption
  selected?: boolean
  onSelect: (type: WorkspaceType) => void
}

function HarnessOptionButton({ option, selected, onSelect, className }: HarnessOptionButtonProps) {
  const showDisabledTooltip = Boolean(option.disabledReason)
  const button = (
    <button
      type="button"
      disabled={option.disabled && !showDisabledTooltip}
      aria-disabled={option.disabled || undefined}
      aria-pressed={selected}
      onClick={event => {
        if (option.disabled) {
          event.preventDefault()
          return
        }
        onSelect(option.type)
      }}
      className={cn(
        'relative flex h-32 min-w-32 flex-1 flex-col items-start justify-between gap-6 rounded-xl bg-card p-4 text-left ring-1 ring-border transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        (selected === false || option.disabled) && 'opacity-70',
        !selected && !option.disabled && 'cursor-pointer hover:opacity-100',
        option.disabled && 'cursor-not-allowed',
        className
      )}
    >
      <span className="relative inline-flex">
        <img src={harnessIcon[option.type]} alt="" className="size-8 shrink-0" />
        {selected && (
          <IconCircleCheckFilled
            size={16}
            stroke={1.75}
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5"
          />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{harnessLabel[option.type]}</span>
        <span className="text-xs leading-4 text-muted-foreground">{option.description}</span>
      </span>
    </button>
  )

  if (!showDisabledTooltip) return button

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent className="max-w-[calc(100vw-2rem)] leading-5 sm:max-w-96">
        <span className="text-center">
          {option.disabledReason}
          {option.disabledCommand && (
            <>
              <br />
              <code className="rounded-xs bg-accent px-1 py-0.5 font-mono wrap-anywhere">
                {option.disabledCommand}
              </code>
            </>
          )}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
