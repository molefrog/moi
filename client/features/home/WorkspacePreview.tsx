import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/client/lib/cn'
import type { ResolvedWorkspacePreview } from './api'

type WorkspacePreviewProps = {
  workspaceId: string
  preview: ResolvedWorkspacePreview
}

const FOLDER = {
  width: 320,
  height: 160,
  radius: 24,
  topLeftRadius: 12,
  bodyTop: 24,
  tabEnd: 124,
  shoulder: {
    width: 48,
    roundness: 20
  }
} as const

function folderBackdropPath(horizontalRadiusScale: number): string {
  const {
    width,
    height,
    radius: radiusY,
    topLeftRadius: topLeftRadiusY,
    bodyTop,
    tabEnd,
    shoulder
  } = FOLDER
  const radiusX = Math.min(width / 2, radiusY * horizontalRadiusScale)
  const topLeftRadiusX = Math.min(width / 2, topLeftRadiusY * horizontalRadiusScale)
  const shoulderWidth = Math.max(0, shoulder.width)
  const bodyStart = tabEnd + shoulderWidth
  const roundness = Math.max(0, Math.min(shoulder.roundness, shoulderWidth / 2))

  return [
    `M ${topLeftRadiusX} 0`,
    `H ${tabEnd}`,
    `C ${tabEnd + roundness} 0 ${bodyStart - roundness} ${bodyTop} ${bodyStart} ${bodyTop}`,
    `H ${width - radiusX}`,
    `Q ${width} ${bodyTop} ${width} ${bodyTop + radiusY}`,
    `V ${height - radiusY}`,
    `Q ${width} ${height} ${width - radiusX} ${height}`,
    `H ${radiusX}`,
    `Q 0 ${height} 0 ${height - radiusY}`,
    `V ${topLeftRadiusY}`,
    `Q 0 0 ${topLeftRadiusX} 0`,
    'Z'
  ].join(' ')
}

function useFolderRadiusScale() {
  const ref = useRef<HTMLDivElement>(null)
  const [horizontalRadiusScale, setHorizontalRadiusScale] = useState(1)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const update = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      const scaleX = width / FOLDER.width
      const scaleY = height / FOLDER.height
      const nextScale = scaleY / scaleX
      setHorizontalRadiusScale(current =>
        Math.abs(current - nextScale) < 0.001 ? current : nextScale
      )
    }

    const bounds = element.getBoundingClientRect()
    update(bounds.width, bounds.height)

    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, horizontalRadiusScale }
}

// Bottom-to-top placement for up to three widget screenshots. Each card peeks
// out of the folder at a slightly different angle and lifts on card hover.
const STACK = [
  cn(
    'opacity-40',
    '-translate-x-3 translate-y-3 -rotate-6',
    'group-hover:translate-y-2 group-focus-visible:translate-y-2'
  ),
  cn(
    'opacity-50',
    'translate-x-3 translate-y-2 rotate-5',
    'group-hover:translate-y-1 group-focus-visible:translate-y-1'
  ),
  cn(
    'opacity-100',
    '-translate-x-1 translate-y-1 -rotate-2',
    'group-hover:-translate-y-2 group-focus-visible:-translate-y-2'
  )
]

export function WorkspacePreview({ workspaceId, preview }: WorkspacePreviewProps) {
  const thumbnails = [...preview.thumbnails].reverse()
  const slots = STACK.slice(STACK.length - thumbnails.length)
  const firstUserMessage = preview.firstUserMessage
  const { ref, horizontalRadiusScale } = useFolderRadiusScale()
  const backdropPath = folderBackdropPath(horizontalRadiusScale)
  const noiseFilterId = `folder-noise-${workspaceId}`

  return (
    <div ref={ref} className="relative h-40 w-full">
      <svg
        viewBox={`0 0 ${FOLDER.width} ${FOLDER.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <filter
            id={noiseFilterId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.5"
              numOctaves="3"
              seed="7"
              result="noise"
            />
            <feColorMatrix in="noise" type="saturate" values="0" result="monochromeNoise" />
            <feComponentTransfer in="monochromeNoise" result="faintNoise">
              <feFuncA type="linear" slope="0.24" />
            </feComponentTransfer>
            <feComposite in="faintNoise" in2="SourceAlpha" operator="in" result="clippedNoise" />
            <feBlend in="SourceGraphic" in2="clippedNoise" mode="soft-light" />
          </filter>
        </defs>
        <path
          d={backdropPath}
          filter={`url(#${noiseFilterId})`}
          className="mask-[linear-gradient(to_bottom,rgba(0,0,0,0.5),black_40%)] fill-accent"
        />
      </svg>

      {thumbnails.map((src, index) => (
        <img
          key={index}
          src={src}
          alt=""
          loading="lazy"
          className={cn(
            'absolute top-[12%] left-[14%] aspect-4/3 w-[72%] rounded-sm object-cover object-top shadow-xs',
            'animate-in transition-transform duration-300 ease-out fade-in',
            slots[index]
          )}
        />
      ))}

      {thumbnails.length === 0 && firstUserMessage && (
        <div className="absolute inset-x-[12%] top-[20%] flex justify-end">
          <div
            aria-hidden="true"
            className={cn(
              'w-max max-w-40 origin-center rounded-sm bg-card px-3 py-2 shadow-xs',
              'animate-in transition-transform duration-300 ease-out fade-in',
              STACK[STACK.length - 1],
              'group-hover:translate-y-0.5 group-focus-visible:translate-y-0.5'
            )}
          >
            <p className="line-clamp-3 text-sm leading-normal whitespace-normal">
              {firstUserMessage}
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          'absolute inset-x-2 top-[40%] bottom-2 rounded-lg bg-accent',
          'mask-[linear-gradient(to_bottom,rgba(0,0,0,0.9)_0%,black_50%)] backdrop-blur-lg',
          'inset-shadow-[0_0_12px_color-mix(in_oklab,var(--background)_20%,transparent)]'
        )}
      />
    </div>
  )
}
