import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/client/lib/cn'

type SliderProps = Omit<SliderPrimitive.Root.Props<number>, 'children' | 'className'> & {
  className?: string
  marks?: number
  getAriaLabel?: SliderPrimitive.Thumb.Props['getAriaLabel']
  getAriaValueText?: SliderPrimitive.Thumb.Props['getAriaValueText']
}

function Slider({
  className,
  marks = 0,
  getAriaLabel,
  getAriaValueText,
  min = 0,
  max = 100,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('w-full', className)}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex h-8 w-full touch-none items-center select-none data-disabled:opacity-50"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-7 w-full grow overflow-hidden rounded-lg bg-muted"
        />
        {marks > 0 && (
          <div
            className="pointer-events-none absolute inset-x-3 flex items-center justify-between"
            aria-hidden="true"
          >
            {Array.from({ length: marks }, (_, index) => (
              <span key={index} className="size-1 rounded-full bg-muted-foreground" />
            ))}
          </div>
        )}
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className="relative block size-6 shrink-0 rounded-full bg-background shadow-sm ring-1 ring-border transition-[box-shadow] after:absolute after:-inset-2 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          getAriaLabel={getAriaLabel}
          getAriaValueText={getAriaValueText}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
