import { useEffect, useState } from 'react'

import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '@/client/lib/cn'

function Slider({
  children,
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const [animationReady, setAnimationReady] = useState(false)
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  // Let Base UI measure the initial positions before transitions are enabled.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimationReady(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <SliderPrimitive.Root
      className={cn('data-horizontal:w-full data-vertical:h-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className={cn(
              'bg-primary select-none data-horizontal:h-full data-vertical:w-full',
              animationReady && 'transition-[width] duration-150 ease-in-out'
            )}
          />
        </SliderPrimitive.Track>
        {children}
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              'relative block size-3 shrink-0 cursor-ew-resize rounded-full border border-ring bg-white ring-ring/50 select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50',
              animationReady &&
                'transition-[inset-inline-start,color,box-shadow] duration-150 ease-in-out'
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

type SliderMarksProps = {
  activeIndex: number
  className?: string
  count: number
}

function SliderMarks({ activeIndex, className, count }: SliderMarksProps) {
  return (
    <span
      data-slot="slider-marks"
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-1.5 flex items-center justify-between',
        className
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={cn(
            'size-1 rounded-full transition-colors',
            index <= activeIndex ? 'bg-primary-foreground/30' : 'bg-foreground/30'
          )}
        />
      ))}
    </span>
  )
}

export { Slider, SliderMarks }
