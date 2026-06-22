import { useRef, useState } from 'react'

import type { Icon } from '@tabler/icons-react'
import {
  IconActivity,
  IconApi,
  IconAtom,
  IconBell,
  IconBolt,
  IconBook,
  IconBrain,
  IconBriefcase,
  IconBug,
  IconBulb,
  IconCalendar,
  IconCamera,
  IconChartBar,
  IconCheck,
  IconChefHat,
  IconCircleOff,
  IconCloud,
  IconCode,
  IconCompass,
  IconCpu,
  IconCube,
  IconDatabase,
  IconDeviceGamepad2,
  IconDiamond,
  IconFeather,
  IconFile,
  IconFlame,
  IconFlask,
  IconFolder,
  IconGhost,
  IconGift,
  IconGlobe,
  IconHeart,
  IconHexagon,
  IconHome,
  IconKey,
  IconLeaf,
  IconLoader2,
  IconMail,
  IconMap,
  IconMessage,
  IconMoon,
  IconMountain,
  IconMusic,
  IconPalette,
  IconPaperclip,
  IconPhoto,
  IconPlanet,
  IconPlug,
  IconRobot,
  IconRocket,
  IconSettings,
  IconShield,
  IconShoppingCart,
  IconSnowflake,
  IconSparkles,
  IconStar,
  IconSun,
  IconTarget,
  IconTerminal2,
  IconTool,
  IconTrophy,
  IconUpload,
  IconUser,
  IconWand,
  IconWorld
} from '@tabler/icons-react'

import { useResetWorkspaceIcon, useSaveWorkspaceIcon } from '@/client/api/workspaces'
import { PROVIDER_ICON } from '@/client/components/layout/SidebarLayout'
import { Button } from '@/client/components/ui/button'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import {
  ICON_BACKGROUNDS,
  type IconBackground,
  renderEmojiIcon,
  renderGlyphIcon
} from '@/client/lib/render-icon'

type Mode = 'emoji' | 'icon' | 'upload'

// A curated set of the 64 most common Tabler glyphs — enough variety to brand a
// workspace without a search box. `id` keys selection; `Icon` renders the glyph.
const ICON_CHOICES: { id: string; Icon: Icon }[] = [
  { id: 'rocket', Icon: IconRocket },
  { id: 'sparkles', Icon: IconSparkles },
  { id: 'bolt', Icon: IconBolt },
  { id: 'flame', Icon: IconFlame },
  { id: 'star', Icon: IconStar },
  { id: 'heart', Icon: IconHeart },
  { id: 'diamond', Icon: IconDiamond },
  { id: 'trophy', Icon: IconTrophy },
  { id: 'target', Icon: IconTarget },
  { id: 'bulb', Icon: IconBulb },
  { id: 'brain', Icon: IconBrain },
  { id: 'robot', Icon: IconRobot },
  { id: 'wand', Icon: IconWand },
  { id: 'atom', Icon: IconAtom },
  { id: 'flask', Icon: IconFlask },
  { id: 'cpu', Icon: IconCpu },
  { id: 'code', Icon: IconCode },
  { id: 'terminal', Icon: IconTerminal2 },
  { id: 'api', Icon: IconApi },
  { id: 'database', Icon: IconDatabase },
  { id: 'cube', Icon: IconCube },
  { id: 'hexagon', Icon: IconHexagon },
  { id: 'plug', Icon: IconPlug },
  { id: 'tool', Icon: IconTool },
  { id: 'settings', Icon: IconSettings },
  { id: 'bug', Icon: IconBug },
  { id: 'activity', Icon: IconActivity },
  { id: 'chart', Icon: IconChartBar },
  { id: 'briefcase', Icon: IconBriefcase },
  { id: 'folder', Icon: IconFolder },
  { id: 'file', Icon: IconFile },
  { id: 'book', Icon: IconBook },
  { id: 'message', Icon: IconMessage },
  { id: 'mail', Icon: IconMail },
  { id: 'bell', Icon: IconBell },
  { id: 'paperclip', Icon: IconPaperclip },
  { id: 'key', Icon: IconKey },
  { id: 'shield', Icon: IconShield },
  { id: 'user', Icon: IconUser },
  { id: 'home', Icon: IconHome },
  { id: 'globe', Icon: IconGlobe },
  { id: 'world', Icon: IconWorld },
  { id: 'planet', Icon: IconPlanet },
  { id: 'compass', Icon: IconCompass },
  { id: 'map', Icon: IconMap },
  { id: 'calendar', Icon: IconCalendar },
  { id: 'cloud', Icon: IconCloud },
  { id: 'sun', Icon: IconSun },
  { id: 'moon', Icon: IconMoon },
  { id: 'snowflake', Icon: IconSnowflake },
  { id: 'leaf', Icon: IconLeaf },
  { id: 'mountain', Icon: IconMountain },
  { id: 'feather', Icon: IconFeather },
  { id: 'ghost', Icon: IconGhost },
  { id: 'music', Icon: IconMusic },
  { id: 'camera', Icon: IconCamera },
  { id: 'photo', Icon: IconPhoto },
  { id: 'palette', Icon: IconPalette },
  { id: 'gamepad', Icon: IconDeviceGamepad2 },
  { id: 'gift', Icon: IconGift },
  { id: 'cart', Icon: IconShoppingCart },
  { id: 'chef', Icon: IconChefHat },
  { id: 'heart2', Icon: IconHeart }
]

const EMOJI_CHOICES = [
  '🚀',
  '✨',
  '🔥',
  '⚡',
  '💡',
  '🧠',
  '🤖',
  '🪄',
  '🧪',
  '🔬',
  '⚙️',
  '🛠️',
  '💻',
  '📦',
  '🗂️',
  '📊',
  '📈',
  '📝',
  '📚',
  '🎯',
  '🏆',
  '💎',
  '⭐',
  '🌟',
  '❤️',
  '🌈',
  '🌙',
  '☀️',
  '🌍',
  '🪐',
  '🧭',
  '🗺️',
  '🎨',
  '🎵',
  '🎮',
  '📷',
  '🎁',
  '🛒',
  '🍕',
  '☕',
  '🌱',
  '🍃',
  '🐙',
  '👻',
  '🦄',
  '🐱',
  '🦊',
  '🐰'
]

type IconPickerProps = {
  // The currently-saved icon data URL, or null to show the provider default.
  icon: string | null
}

export function IconPicker({ icon }: IconPickerProps) {
  const { workspaceId, provider } = useWorkspaceLayoutCtx()
  const saveIcon = useSaveWorkspaceIcon(workspaceId)
  const resetIcon = useResetWorkspaceIcon(workspaceId)

  const [mode, setMode] = useState<Mode>('emoji')
  const [bg, setBg] = useState<IconBackground>('blue')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [iconId, setIconId] = useState<string | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const glyphRef = useRef<HTMLSpanElement>(null)
  const uploadBlob = useRef<Blob | null>(null)

  const selectedIcon = ICON_CHOICES.find(c => c.id === iconId)
  const bgPreset = ICON_BACKGROUNDS.find(b => b.id === bg)
  const onGradient = bg !== 'none'

  // Whether the current tab has a selection ready to apply.
  const hasSelection =
    (mode === 'emoji' && !!emoji) ||
    (mode === 'icon' && !!selectedIcon) ||
    (mode === 'upload' && !!uploadBlob.current)

  const saving = saveIcon.isPending || resetIcon.isPending

  const onFile = (file: File) => {
    setError(null)
    uploadBlob.current = file
    setMode('upload')
    setUploadPreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  const apply = async () => {
    setError(null)
    try {
      let blob: Blob
      if (mode === 'upload') {
        if (!uploadBlob.current) return
        blob = uploadBlob.current
      } else if (mode === 'emoji') {
        if (!emoji) return
        blob = await renderEmojiIcon(emoji, bg)
      } else {
        const svg = glyphRef.current?.querySelector('svg')
        if (!svg) return
        blob = await renderGlyphIcon(new XMLSerializer().serializeToString(svg), bg)
      }
      await saveIcon.mutateAsync(blob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save icon')
    }
  }

  // The live preview reflects the pending selection, falling back to the saved
  // icon (or provider default) when nothing is staged on the current tab.
  const previewKind: 'emoji' | 'glyph' | 'image' =
    mode === 'emoji' && emoji ? 'emoji' : mode === 'icon' && selectedIcon ? 'glyph' : 'image'
  const previewImage =
    mode === 'upload' && uploadPreview
      ? uploadPreview
      : (icon ?? PROVIDER_ICON[provider ?? 'claude-code'])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium">Icon</span>
        <span className="text-xs text-muted-foreground">
          Upload an image, or pick an emoji or glyph and a background.
        </span>
      </div>

      <div className="flex gap-5">
        {/* Live preview */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div
            className={cn(
              'flex size-20 items-center justify-center overflow-hidden rounded-[22px] ring-1 ring-border',
              previewKind !== 'image' && onGradient && bgPreset?.css,
              previewKind !== 'image' && !onGradient && 'bg-muted'
            )}
          >
            {previewKind === 'emoji' ? (
              <span className="text-[40px] leading-none">{emoji}</span>
            ) : previewKind === 'glyph' && selectedIcon ? (
              <selectedIcon.Icon
                stroke={1.75}
                className={cn('size-11', onGradient ? 'text-white' : 'text-foreground')}
              />
            ) : (
              <img src={previewImage} alt="" className="size-full object-cover" />
            )}
          </div>
          <button
            type="button"
            onClick={() => resetIcon.mutate()}
            disabled={saving}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Reset to default
          </button>
        </div>

        {/* Controls */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Mode tabs */}
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {(['emoji', 'icon', 'upload'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors',
                  mode === m
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Background swatches (emoji / icon only) */}
          {mode !== 'upload' && (
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Background</span>
              <button
                type="button"
                aria-label="No background"
                onClick={() => setBg('none')}
                className={cn(
                  'flex size-6 items-center justify-center rounded-md bg-muted ring-offset-1 ring-offset-background transition-all',
                  bg === 'none'
                    ? 'ring-2 ring-primary'
                    : 'ring-1 ring-border hover:ring-foreground/30'
                )}
              >
                <IconCircleOff size={13} stroke={1.75} className="text-muted-foreground" />
              </button>
              {ICON_BACKGROUNDS.map(b => (
                <button
                  key={b.id}
                  type="button"
                  aria-label={b.id}
                  onClick={() => setBg(b.id)}
                  className={cn(
                    'size-6 rounded-md ring-offset-1 ring-offset-background transition-all',
                    b.css,
                    bg === b.id ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-foreground/30'
                  )}
                />
              ))}
            </div>
          )}

          {/* Picker body */}
          {mode === 'emoji' ? (
            <div className="grid scrollbar-thin max-h-44 grid-cols-8 gap-1 overflow-y-auto pr-1">
              {EMOJI_CHOICES.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md text-lg transition-colors',
                    emoji === e ? 'bg-primary/10 ring-2 ring-primary' : 'hover:bg-muted'
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : mode === 'icon' ? (
            <div className="grid scrollbar-thin max-h-44 grid-cols-8 gap-1 overflow-y-auto pr-1">
              {ICON_CHOICES.map(({ id, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setIconId(id)}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-colors [&_svg]:size-5',
                    iconId === id
                      ? 'bg-primary/10 text-foreground ring-2 ring-primary'
                      : 'hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon stroke={1.75} />
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <IconUpload size={20} stroke={1.5} />
              <span className="text-xs">Click to upload PNG, JPG, GIF, or WebP</span>
            </button>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end">
            <Button size="sm" onClick={apply} disabled={!hasSelection || saving}>
              {saving ? <IconLoader2 className="animate-spin" /> : <IconCheck stroke={1.75} />}
              Apply icon
            </Button>
          </div>
        </div>
      </div>

      {/* Hidden file input + hidden glyph render used for rasterization. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <span ref={glyphRef} aria-hidden className="hidden">
        {selectedIcon && <selectedIcon.Icon stroke={1.75} />}
      </span>
    </div>
  )
}
