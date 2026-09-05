import { useEffect, useState } from 'react'

import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from './utils'

type SliderProps = SliderPrimitive.Root.Props & {
  /** Animate movement between discrete values, including while dragging. */
  animate?: boolean
}

function Slider({
  animate = false,
  children,
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderProps) {
  const [animationReady, setAnimationReady] = useState(false)
  const _values = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min]

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
              animate &&
                animationReady &&
                'transition-[width,height,inset-inline-start,bottom] duration-100 ease-in-out'
            )}
          />
        </SliderPrimitive.Track>
        {children}
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(
              'relative block size-3 shrink-0 rounded-xs bg-primary-foreground shadow-xs ring-ring/50 select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50 data-horizontal:cursor-ew-resize data-vertical:cursor-ns-resize',
              animate &&
                animationReady &&
                'transition-[inset-inline-start,bottom,color,box-shadow] duration-100 ease-in-out'
            )}
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
