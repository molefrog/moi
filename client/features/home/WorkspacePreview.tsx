import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/client/lib/cn'
import {
  getWorkspaceThemeColorStyle,
  getWorkspaceThemeStyle
} from '@/client/runtime/workspace-theme'

import { useWorkspacePreview } from './api'

type WorkspacePreviewProps = {
  workspaceId: string
}

const FOLDER = {
  width: 320,
  height: 180,
  radius: 32,
  topLeftRadius: 18,
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

// Bottom-to-top treatment for up to three applet thumbnails. The frame stays
// opaque while only the image fades.
const THUMBNAIL_STYLES = [
  {
    frame: cn(
      '-translate-x-3 translate-y-3 -rotate-6',
      'group-focus-within:translate-y-2 group-hover:translate-y-2'
    ),
    img: 'opacity-40'
  },
  {
    frame: cn(
      'translate-x-3 translate-y-2 rotate-5',
      'group-focus-within:translate-y-1 group-hover:translate-y-1'
    ),
    img: 'opacity-50'
  },
  {
    frame: cn(
      '-translate-x-1 translate-y-1 -rotate-2',
      'group-focus-within:-translate-y-2 group-hover:-translate-y-2'
    ),
    img: 'opacity-100'
  }
] as const

export function WorkspacePreview({ workspaceId }: WorkspacePreviewProps) {
  const query = useWorkspacePreview(workspaceId)
  const thumbnails = query.data ? [...query.data.thumbnails].reverse() : []
  const slots = THUMBNAIL_STYLES.slice(THUMBNAIL_STYLES.length - thumbnails.length)
  const firstUserMessage = query.data?.firstUserMessage
  const theme = query.data?.theme
  const { ref, horizontalRadiusScale } = useFolderRadiusScale()
  const backdropPath = folderBackdropPath(horizontalRadiusScale)
  const noiseFilterId = `folder-noise-${workspaceId}`
  const themeStyle = getWorkspaceThemeStyle(theme)
  const folderThemeStyle = getWorkspaceThemeColorStyle(theme)

  return (
    <div ref={ref} style={folderThemeStyle} className="relative h-45 w-full">
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
        <path d={backdropPath} filter={`url(#${noiseFilterId})`} className="fill-accent" />
      </svg>

      {thumbnails.map((src, index) => (
        <div
          key={src}
          className={cn(
            'absolute top-[12%] left-[14%] w-fit max-w-[72%] overflow-hidden rounded-[calc(var(--radius-2xl)*0.4)] bg-background shadow-xs [corner-shape:superellipse(1.2)]',
            'animate-in duration-300 ease-out fade-in',
            slots[index].frame
          )}
        >
          <img
            src={src}
            alt=""
            loading="lazy"
            className={cn(
              'block h-auto max-h-32 w-auto max-w-full object-contain',
              slots[index].img
            )}
          />
        </div>
      ))}

      {thumbnails.length === 0 && firstUserMessage && (
        <div className="absolute inset-x-[12%] top-[22%] flex justify-end">
          <div
            aria-hidden="true"
            style={themeStyle}
            className={cn(
              'w-max max-w-40 origin-center rounded-lg bg-card px-3 py-2 font-sans shadow-xs',
              'animate-in transition-transform duration-300 ease-out fade-in',
              '-translate-x-1 translate-y-1 -rotate-2',
              'group-focus-within:translate-y-0.5 group-hover:translate-y-0.5'
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
          'absolute inset-x-2 top-[40%] bottom-2 rounded-2xl bg-[color-mix(in_oklch,var(--accent),var(--foreground)_5%)]',
          'mask-[linear-gradient(to_bottom,rgba(0,0,0,0.9)_0%,black_50%)] backdrop-blur-lg',
          'inset-shadow-[0_0_12px_color-mix(in_oklab,var(--background)_20%,transparent)]'
        )}
      />
    </div>
  )
}
