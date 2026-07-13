import { useEffect, useRef, useState } from 'react'

import type { Icon } from '@tabler/icons-react'
import {
  IconActivity,
  IconApi,
  IconArrowsShuffle,
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
  IconMoodSad,
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
import {
  EmojiPicker,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps
} from 'frimousse'

import { useResetWorkspaceIcon, useSaveWorkspaceIcon } from '@/client/api/workspaces'
import { PROVIDER_ICON } from '@/client/components/layout/SidebarLayout'
import { useWorkspaceLayoutCtx } from '@/client/lib/WorkspaceLayoutContext'
import { cn } from '@/client/lib/cn'
import {
  GRADIENT_PRESETS,
  type IconGradient,
  gradientCss,
  randomGradient,
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
  { id: 'chef', Icon: IconChefHat }
]

// The selected background: a preset id (or 'shuffle'), and its gradient — null
// means transparent. Only the rasterized result is persisted.
type IconBg = { id: string; gradient: IconGradient | null }

// Force a color-emoji font: the default UI stack can fall back to monochrome
// outline glyphs (notably on Linux), while the canvas rasterizer already pins
// these families — this keeps the DOM preview true to the saved icon.
const EMOJI_FONT = 'font-[Apple_Color_Emoji,Segoe_UI_Emoji,Noto_Color_Emoji,sans-serif]'

// Hand-picked workspace-flavored emoji pinned above the full list — the full
// emojibase catalog opens with smileys, which are rarely what a project icon
// wants. Two rows of 13, matching the picker's column count.
const FAVORITE_EMOJI = [
  '🚀',
  '✨',
  '🔥',
  '⚡',
  '💡',
  '🧠',
  '🤖',
  '🪄',
  '🧪',
  '⚙️',
  '🛠️',
  '💻',
  '📦',
  '📊',
  '📈',
  '📝',
  '📚',
  '🎯',
  '🏆',
  '💎',
  '🪐',
  '🌍',
  '🧭',
  '🎨',
  '🎮',
  '☕'
]

// ── Frimousse list parts (module-level so the virtualized list keeps stable
// component identities across re-renders) ───────────────────────────────────

function EmojiCategoryHeader({ category, ...props }: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      className="bg-background px-2.5 pt-2.5 pb-1 text-xs font-medium text-muted-foreground"
      {...props}
    >
      {category.label}
    </div>
  )
}

function EmojiRow({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div className="scroll-my-1 px-1.5" {...props}>
      {children}
    </div>
  )
}

function EmojiButton({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <button
      className={cn(
        'flex size-9 items-center justify-center rounded-lg text-[22px] transition-colors duration-75 data-[active]:bg-muted',
        EMOJI_FONT
      )}
      {...props}
    >
      {emoji.emoji}
    </button>
  )
}

type IconPickerProps = {
  // The currently-saved icon data URL, or null to show the provider default.
  icon: string | null
}

export function IconPicker({ icon }: IconPickerProps) {
  const { workspaceId, provider } = useWorkspaceLayoutCtx()
  const { isPending: savePending, mutateAsync: saveIcon } = useSaveWorkspaceIcon(workspaceId)
  const { isPending: resetPending, mutate: resetIcon } = useResetWorkspaceIcon(workspaceId)

  const [mode, setMode] = useState<Mode>('emoji')
  const [bg, setBg] = useState<IconBg>({ id: 'sunrise', gradient: GRADIENT_PRESETS[0].gradient })
  // The last shuffled gradient sticks around as its own swatch, so switching to
  // a preset and back doesn't lose a roll you liked.
  const [shuffled, setShuffled] = useState<IconGradient | null>(null)
  const [emoji, setEmoji] = useState<string | null>(null)
  // Mirrors the emoji search input so the pinned favorites hide while the list
  // is showing filtered results.
  const [emojiSearch, setEmojiSearch] = useState('')
  const [iconId, setIconId] = useState<string | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const glyphRef = useRef<HTMLSpanElement>(null)
  const uploadBlob = useRef<Blob | null>(null)

  const selectedIcon = ICON_CHOICES.find(c => c.id === iconId)
  const onGradient = bg.gradient !== null
  const saving = savePending || resetPending

  const shuffle = () => {
    const gradient = randomGradient()
    setShuffled(gradient)
    setBg({ id: 'shuffle', gradient })
  }

  const onFile = (file: File) => {
    setError(null)
    uploadBlob.current = file
    setMode('upload')
    setUploadPreview(URL.createObjectURL(file))
  }

  useEffect(() => {
    let cancelled = false

    const save = async () => {
      let blob: Blob
      if (mode === 'upload') {
        if (!uploadBlob.current) return
        blob = uploadBlob.current
      } else if (mode === 'emoji') {
        if (!emoji) return
        blob = await renderEmojiIcon(emoji, bg.gradient)
      } else {
        const svg = glyphRef.current?.querySelector('svg')
        if (!svg) return
        blob = await renderGlyphIcon(new XMLSerializer().serializeToString(svg), bg.gradient)
      }

      if (!cancelled) await saveIcon(blob)
    }

    setError(null)
    // Collapse quick swatch/emoji changes before rasterizing. Requests that have
    // already started are serialized by the shared mutation scope in the API
    // hooks, so an older image can never overwrite the final choice.
    const timer = window.setTimeout(() => {
      void save().catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to save icon')
      })
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bg.gradient, emoji, mode, saveIcon, selectedIcon, uploadPreview])

  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    }
  }, [uploadPreview])

  const reset = () => {
    uploadBlob.current = null
    setEmoji(null)
    setIconId(null)
    setUploadPreview(null)
    setError(null)
    resetIcon()
  }

  // The live preview reflects the current selection, falling back to the saved
  // icon (or provider default) when the current tab has no selection.
  const previewKind: 'emoji' | 'glyph' | 'image' =
    mode === 'emoji' && emoji ? 'emoji' : mode === 'icon' && selectedIcon ? 'glyph' : 'image'
  const previewImage =
    mode === 'upload' && uploadPreview
      ? uploadPreview
      : (icon ?? PROVIDER_ICON[provider ?? 'claude-code'])

  return (
    <div className="flex gap-6">
      {/* Live preview */}
      <div className="flex w-24 shrink-0 flex-col items-center gap-2.5">
        <div
          className={cn(
            'flex size-24 items-center justify-center overflow-hidden rounded-[24px] shadow-sm ring-1 ring-border',
            // Checkerboard hints at transparency when no background is chosen.
            previewKind !== 'image' &&
              !onGradient &&
              'bg-[repeating-conic-gradient(#0000000d_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]'
          )}
          // Gradient colors are generated at runtime (shuffle), so they can't be
          // static Tailwind classes — set the composed background inline.
          style={
            previewKind !== 'image' && bg.gradient
              ? { background: gradientCss(bg.gradient) }
              : undefined
          }
        >
          {previewKind === 'emoji' ? (
            <span
              className={cn('leading-none', EMOJI_FONT, onGradient ? 'text-[64px]' : 'text-[86px]')}
            >
              {emoji}
            </span>
          ) : previewKind === 'glyph' && selectedIcon ? (
            <selectedIcon.Icon
              stroke={1.5}
              className={cn(onGradient ? 'size-14 text-white' : 'size-18 text-foreground')}
            />
          ) : (
            <img src={previewImage} alt="" className="size-full object-cover" />
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Reset to default
        </button>
      </div>

      {/* Controls */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Mode tabs */}
        <div className="flex gap-1 self-start rounded-lg bg-muted p-0.5">
          {(['emoji', 'icon', 'upload'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-md px-3.5 py-1 text-xs font-medium capitalize transition-colors',
                mode === m
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Background swatches — disabled (not hidden) on the upload tab so the
            layout doesn't jump between tabs. */}
        <div
          className={cn(
            'flex items-center gap-2',
            mode === 'upload' && 'pointer-events-none opacity-35'
          )}
        >
          <span className="text-xs font-medium text-muted-foreground">Background</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="No background"
              onClick={() => setBg({ id: 'none', gradient: null })}
              className={cn(
                'flex size-7 items-center justify-center rounded-full bg-muted ring-offset-2 ring-offset-card transition-shadow',
                bg.id === 'none'
                  ? 'ring-2 ring-primary'
                  : 'ring-1 ring-border hover:ring-muted-foreground/30'
              )}
            >
              <IconCircleOff size={16} stroke={1.75} className="text-muted-foreground" />
            </button>
            {GRADIENT_PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                aria-label={`${preset.id} background`}
                onClick={() => setBg({ id: preset.id, gradient: preset.gradient })}
                // Preset colors live in data (shared with the canvas), so the
                // swatch fill is inline rather than a per-preset class.
                style={{ background: gradientCss(preset.gradient) }}
                className={cn(
                  'size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow',
                  bg.id === preset.id
                    ? 'ring-2 ring-primary'
                    : 'hover:ring-2 hover:ring-muted-foreground/30'
                )}
              />
            ))}
            <button
              type="button"
              aria-label="Random background"
              title="Surprise me"
              onClick={shuffle}
              style={shuffled ? { background: gradientCss(shuffled) } : undefined}
              className={cn(
                'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow',
                shuffled ? 'text-white' : 'bg-muted text-muted-foreground ring-1 ring-border',
                bg.id === 'shuffle'
                  ? 'ring-2 ring-primary'
                  : 'hover:ring-2 hover:ring-muted-foreground/30'
              )}
            >
              <IconArrowsShuffle size={16} stroke={1.75} />
            </button>
          </div>
        </div>

        {/* Picker body — fixed height across tabs so the dialog never jumps. */}
        {mode === 'emoji' ? (
          <EmojiPicker.Root
            onEmojiSelect={picked => setEmoji(picked.emoji)}
            // Same-origin emojibase data (vendored under client/vendor/emojibase,
            // served by server/vendor.ts) — the picker works fully offline.
            emojibaseUrl="/vendor/emojibase"
            columns={13}
            className="isolate flex h-72 flex-col overflow-hidden rounded-lg border border-border bg-background"
          >
            <div className="flex items-center gap-1.5 p-1.5 pb-0">
              <EmojiPicker.Search
                placeholder="Search emoji…"
                onChange={e => setEmojiSearch(e.target.value)}
                className="h-8 min-w-0 flex-1 appearance-none rounded-md bg-muted px-2.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <EmojiPicker.SkinToneSelector className="size-8 shrink-0 rounded-md text-lg hover:bg-accent" />
            </div>
            <EmojiPicker.Viewport className="relative scrollbar-thin flex-1 overflow-y-auto outline-none">
              <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <IconLoader2 size={16} stroke={1.75} className="animate-spin" />
                Loading emoji…
              </EmojiPicker.Loading>
              {/* Pinned workspace favorites — rendered inside the scroll area so
                  they read as the first category; hidden while searching so
                  results stay on top. */}
              {emojiSearch.trim() === '' && (
                <div className="border-b border-dashed border-border pb-1.5">
                  <p className="px-2.5 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">
                    Favorites
                  </p>
                  {/* Fixed 13 columns to mirror the frimousse rows below — the
                      26 favorites always land as two clean rows. */}
                  <div className="grid grid-cols-13 justify-items-start px-1.5">
                    {FAVORITE_EMOJI.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-lg text-[22px] transition-colors duration-75',
                          EMOJI_FONT,
                          emoji === e ? 'bg-primary/10' : 'hover:bg-accent'
                        )}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <EmojiPicker.Empty className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                <IconMoodSad size={20} stroke={1.5} />
                No emoji found
              </EmojiPicker.Empty>
              <EmojiPicker.List
                className="pb-1.5 select-none"
                components={{
                  CategoryHeader: EmojiCategoryHeader,
                  Row: EmojiRow,
                  Emoji: EmojiButton
                }}
              />
            </EmojiPicker.Viewport>
          </EmojiPicker.Root>
        ) : mode === 'icon' ? (
          <div className="grid scrollbar-thin h-72 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] content-start gap-1 overflow-y-auto rounded-lg border border-border bg-background p-1.5">
            {ICON_CHOICES.map(({ id, Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={id}
                onClick={() => setIconId(id)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg text-muted-foreground transition-colors [&_svg]:size-5',
                  iconId === id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon stroke={1.5} />
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files?.[0]
              if (file) onFile(file)
            }}
            className={cn(
              'flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed transition-colors',
              dragOver
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
            )}
          >
            <IconUpload size={24} stroke={1.5} />
            <span className="text-xs font-medium">Click or drop an image</span>
            <span className="text-[11px] text-muted-foreground/70">PNG, JPG, GIF, or WebP</span>
          </button>
        )}

        <div className="min-h-4" aria-live="polite">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : saving ? (
            <p className="text-xs text-muted-foreground">Saving…</p>
          ) : null}
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
        {selectedIcon && <selectedIcon.Icon stroke={1.5} />}
      </span>
    </div>
  )
}
