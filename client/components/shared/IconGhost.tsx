import { forwardRef } from 'react'

import { motion, useReducedMotion } from 'motion/react'

import { IconGhost as TablerIconGhost, type IconProps } from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

type IconGhostProps = IconProps & {
  animated?: boolean
}

type Point = {
  x: number
  y: number
}

const bodyPath =
  'M5 11a7 7 0 0 1 14 0v7a1.78 1.78 0 0 1 -3.1 1.4a1.65 1.65 0 0 0 -2.6 0a1.65 1.65 0 0 1 -2.6 0a1.65 1.65 0 0 0 -2.6 0a1.78 1.78 0 0 1 -3.1 -1.4v-7'

const animatedEdgeY = 18.85

function formatPoint(value: number): string {
  return value.toFixed(3)
}

function smoothPath(points: Point[]): string {
  let path = ''

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const afterNext = points[index + 2] ?? next
    const firstControl =
      index === 0
        ? { x: current.x, y: current.y + 0.4 }
        : {
            x: current.x + (next.x - previous.x) / 6,
            y: current.y + (next.y - previous.y) / 6
          }
    const secondControl =
      index === points.length - 2
        ? { x: next.x, y: next.y + 0.4 }
        : {
            x: next.x - (afterNext.x - current.x) / 6,
            y: next.y - (afterNext.y - current.y) / 6
          }

    path += `C${formatPoint(firstControl.x)} ${formatPoint(firstControl.y)} ${formatPoint(secondControl.x)} ${formatPoint(secondControl.y)} ${formatPoint(next.x)} ${formatPoint(next.y)}`
  }

  return path
}

function bodyPathAt(progress: number): string {
  const phase = progress * Math.PI * 2
  const verticalProgress = 1 - Math.abs(progress * 2 - 1)
  const verticalOffset = verticalProgress * 1.55
  const edgeY = animatedEdgeY + verticalOffset
  const points = Array.from({ length: 13 }, (_, index): Point => {
    const horizontalProgress = index / 12
    const envelope = Math.sin(Math.PI * horizontalProgress) ** 0.35
    const baseline = edgeY + 0.3 * envelope
    const wave = 0.55 * envelope * Math.sin(5 * Math.PI * horizontalProgress - phase)

    return {
      x: 5 + 14 * horizontalProgress,
      y: baseline + wave
    }
  })
  const sideLength = edgeY - 11

  return `M5 11a7 7 0 0 1 14 0v${formatPoint(sideLength)}${smoothPath(points.reverse())}v-${formatPoint(sideLength)}`
}

const animatedBodyPaths = Array.from({ length: 17 }, (_, index) => bodyPathAt(index / 16))

const IconGhost = forwardRef<SVGSVGElement, IconGhostProps>(function IconGhost(
  {
    animated = false,
    color = 'currentColor',
    size = 24,
    stroke = 2,
    title,
    className,
    children,
    ...props
  },
  ref
) {
  const prefersReducedMotion = useReducedMotion()
  const shouldAnimate = animated && !prefersReducedMotion

  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('tabler-icon tabler-icon-ghost', className)}
      {...props}
    >
      {title && <title>{title}</title>}
      {shouldAnimate ? (
        <motion.path
          d={animatedBodyPaths[0]}
          animate={{ d: animatedBodyPaths }}
          transition={{ duration: 2, ease: 'linear', repeat: Infinity }}
        />
      ) : (
        <path d={bodyPath} />
      )}
      <path d="M10 10l.01 0" />
      <path d="M14 10l.01 0" />
      <path d="M10 14a3.5 3.5 0 0 0 4 0" />
      {children}
    </svg>
  )
})

IconGhost.displayName = TablerIconGhost.displayName

export { IconGhost }
