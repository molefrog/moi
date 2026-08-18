import { Fragment } from 'react'
import { Link } from 'wouter'

import { cn } from '@/client/lib/cn'
import { getWorkspaceThemeStyle } from '@/client/runtime/workspace-theme'
import { COLOR_THEMES, DEFAULT_WORKSPACE_THEME } from '@/lib/themes'
import type { ColorTheme, WorkspaceTheme } from '@/lib/themes'

const TEXTURES = [
  { label: 'Checker', className: 'texture-checker' },
  { label: 'Grid', className: 'texture-grid' },
  { label: 'Noise', className: 'texture-noise' },
  { label: 'Linear gradient', className: 'texture-gradient-linear' },
  { label: 'Inset shadow', className: 'texture-inset-shadow' }
] as const

type SurfaceMode = 'base' | 'dark' | 'widget' | 'vivid'

type SurfaceConfig = {
  mode: SurfaceMode
  label: string
  description: string
}

const SURFACES: SurfaceConfig[] = [
  { mode: 'base', label: 'Base', description: 'Workspace tokens' },
  { mode: 'dark', label: 'Dark', description: 'Dark variant' },
  { mode: 'widget', label: 'Widget', description: 'Redefined tokens' },
  { mode: 'vivid', label: 'Vivid', description: 'data-vivid' }
]

const COLOR_THEME_KEYS = Object.keys(COLOR_THEMES) as ColorTheme[]

type TexturePreviewProps = {
  color: ColorTheme
  mode: SurfaceMode
  textureClassName: string
  textureLabel: string
}

function TexturePreview({ color, mode, textureClassName, textureLabel }: TexturePreviewProps) {
  const theme: WorkspaceTheme = { ...DEFAULT_WORKSPACE_THEME, color }
  const style = getWorkspaceThemeStyle(theme, mode === 'widget' ? 'widget' : 'workspace')
  const isVivid = mode === 'vivid'

  return (
    <div className={cn('h-full', mode === 'dark' && 'dark')} style={style}>
      <div
        data-vivid={isVivid ? true : undefined}
        aria-label={`${COLOR_THEMES[color].label}, ${textureLabel}, ${mode}`}
        className={cn(
          'relative h-28 overflow-hidden rounded-lg border p-3',
          isVivid ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground',
          textureClassName
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium">Aa 123</span>
          <span
            className={cn(
              'rounded-md px-2 py-1 text-[10px] font-medium',
              isVivid ? 'bg-background text-foreground' : 'bg-primary text-primary-foreground'
            )}
          >
            Primary
          </span>
        </div>
        <div className="absolute right-3 bottom-3 left-3 flex items-center gap-2">
          <span className="h-2 flex-1 rounded-full bg-muted" />
          <span className="size-4 rounded-full border bg-accent" />
          <span className="size-4 rounded-full border bg-primary" />
        </div>
      </div>
    </div>
  )
}

export function TextureLabPage() {
  return (
    <main className="mx-auto w-full max-w-[96rem] px-6 py-10">
      <Link href="/dev" className="text-sm text-muted-foreground hover:text-foreground">
        ← Dev pages
      </Link>

      <div className="mt-5 max-w-2xl">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Playground
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Texture lab</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Every texture across every color theme. Each row compares the base surface, dark variant,
          widget token derivation, and a vivid container.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {COLOR_THEME_KEYS.map(color => (
          <section key={color}>
            <div className="mb-3 flex items-center gap-2">
              <span
                style={getWorkspaceThemeStyle({ ...DEFAULT_WORKSPACE_THEME, color })}
                className="size-3 rounded-full bg-primary"
              />
              <h2 className="text-lg font-medium">{COLOR_THEMES[color].label}</h2>
              <span className="font-mono text-xs text-muted-foreground">{color}</span>
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <div className="grid min-w-[56rem] grid-cols-[9rem_repeat(4,minmax(10rem,1fr))] gap-px bg-border">
                <div className="bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                  Texture
                </div>
                {SURFACES.map(surface => (
                  <div key={surface.mode} className="bg-muted px-3 py-2">
                    <p className="text-xs font-medium">{surface.label}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {surface.description}
                    </p>
                  </div>
                ))}

                {TEXTURES.map(texture => (
                  <Fragment key={texture.className}>
                    <div className="bg-background px-3 py-3">
                      <p className="text-sm font-medium">{texture.label}</p>
                      <p className="mt-1 font-mono text-[10px] leading-4 break-all text-muted-foreground">
                        {texture.className}
                      </p>
                    </div>
                    {SURFACES.map(surface => (
                      <div key={surface.mode} className="bg-background p-2">
                        <TexturePreview
                          color={color}
                          mode={surface.mode}
                          textureClassName={texture.className}
                          textureLabel={texture.label}
                        />
                      </div>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
