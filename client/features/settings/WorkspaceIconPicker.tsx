import { type ComponentProps, useEffect, useRef, useState } from 'react'

import {
  IconArrowBack,
  IconArrowsShuffle,
  IconCircleOff,
  IconLoader2,
  IconMoodSad,
  IconUpload
} from '@tabler/icons-react'
import {
  EmojiPicker,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps
} from 'frimousse'

import { Button } from '@/client/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { useUpdateWorkspaceIcon } from '@/client/features/settings/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { APP_ICON_CHOICES } from '@/client/lib/app-icon-registry'
import { cn } from '@/client/lib/cn'
import {
  GRADIENT_PRESETS,
  type IconGradient,
  gradientCss,
  randomGradient
} from '@/client/features/settings/render-icon'
import { EMOJI_FONT, FAVORITE_EMOJI } from './icon-picker-options'

type Mode = 'emoji' | 'icon' | 'upload'
type GeneratedIcon = { kind: 'emoji'; emoji: string } | { kind: 'icon'; id: string; svg: string }

// The selected background: a preset id (or 'shuffle'), and its gradient — null
// means transparent. Only the rasterized result is persisted.
type IconBg = { id: string; gradient: IconGradient | null }

const PICKER_ITEM_SIZE = 32
const PICKER_ITEM_GAP = 4
const PICKER_ROW_PADDING = 12
const GROUP_LABEL_CLASS =
  'flex pt-4 pb-2 items-center bg-background px-3 text-xs font-medium text-muted-foreground'

// ── Frimousse list parts (module-level so the virtualized list keeps stable
// component identities across re-renders) ───────────────────────────────────

function EmojiCategoryHeader({
  category,
  className,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div {...props} className={cn(GROUP_LABEL_CLASS, className)}>
      {category.label}
    </div>
  )
}

type PickerItemsProps = ComponentProps<'div'>

function PickerItems({ className, ...props }: PickerItemsProps) {
  return <div className={cn('flex flex-wrap content-start gap-1', className)} {...props} />
}

type PickerItemProps = Omit<ComponentProps<typeof Button>, 'size' | 'type' | 'variant'> & {
  selected?: boolean
}

function PickerItem({ className, selected = false, ...props }: PickerItemProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={selected}
      className={cn('shrink-0 data-active:bg-accent', selected && 'bg-accent', className)}
      {...props}
    />
  )
}

function EmojiRow({ children, className, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className={cn('flex h-8 gap-1 px-1.5', className)}>
      {children}
    </div>
  )
}

function EmojiButton({ emoji, ...props }: EmojiPickerListEmojiProps) {
  return (
    <PickerItem className={EMOJI_FONT} {...props}>
      <span className="text-xl leading-none">{emoji.emoji}</span>
    </PickerItem>
  )
}

export function WorkspaceIconPicker() {
  const { icon, workspaceId } = useWorkspaceLayoutCtx()
  const updateIcon = useUpdateWorkspaceIcon(workspaceId)

  const [mode, setMode] = useState<Mode>('emoji')
  const [bg, setBg] = useState<IconBg>({ id: 'sunrise', gradient: GRADIENT_PRESETS[0].gradient })
  const [selection, setSelection] = useState<GeneratedIcon | null>(null)
  // Mirrors the emoji search input so the pinned favorites hide while the list
  // is showing filtered results.
  const [emojiSearch, setEmojiSearch] = useState('')
  const [emojiColumns, setEmojiColumns] = useState(13)
  const [emojiViewport, setEmojiViewport] = useState<HTMLDivElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const saveGenerated = (next: GeneratedIcon, background = bg) => {
    updateIcon.mutate(
      next.kind === 'emoji'
        ? { kind: 'emoji', emoji: next.emoji, background: background.gradient }
        : { kind: 'icon', svg: next.svg, background: background.gradient }
    )
  }

  const selectGenerated = (next: GeneratedIcon) => {
    setSelection(next)
    saveGenerated(next)
  }

  const selectBackground = (next: IconBg) => {
    setBg(next)
    if (selection) saveGenerated(selection, next)
  }

  const selectFile = (file: File) => {
    setSelection(null)
    updateIcon.mutate({ kind: 'upload', file })
  }

  useEffect(() => {
    if (!emojiViewport) return

    const updateColumns = (width: number) => {
      const columns = Math.max(
        1,
        Math.floor(
          (width - PICKER_ROW_PADDING + PICKER_ITEM_GAP) / (PICKER_ITEM_SIZE + PICKER_ITEM_GAP)
        )
      )
      setEmojiColumns(current => (current === columns ? current : columns))
    }

    updateColumns(emojiViewport.clientWidth)
    const observer = new ResizeObserver(([entry]) => {
      updateColumns(entry?.contentRect.width ?? emojiViewport.clientWidth)
    })
    observer.observe(emojiViewport)
    return () => observer.disconnect()
  }, [emojiViewport])

  return (
    <Tabs
      value={mode}
      onValueChange={value => {
        if (value === 'emoji' || value === 'icon' || value === 'upload') setMode(value)
      }}
      className="min-w-0 gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <TabsList aria-label="Icon source">
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icon">Icon</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        {icon !== null && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setSelection(null)
              updateIcon.mutate({ kind: 'reset' })
            }}
          >
            <IconArrowBack data-icon="inline-start" stroke={1.5} />
            Reset
          </Button>
        )}
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
            onClick={() => selectBackground({ id: 'none', gradient: null })}
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
              onClick={() => selectBackground({ id: preset.id, gradient: preset.gradient })}
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
            onClick={() => selectBackground({ id: 'shuffle', gradient: randomGradient() })}
            style={
              bg.id === 'shuffle' && bg.gradient
                ? { background: gradientCss(bg.gradient) }
                : undefined
            }
            className={cn(
              'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow',
              bg.id === 'shuffle'
                ? 'text-white ring-2 ring-primary'
                : 'bg-muted text-muted-foreground ring-1 ring-border hover:ring-2 hover:ring-muted-foreground/30'
            )}
          >
            <IconArrowsShuffle size={16} stroke={1.75} />
          </button>
        </div>
      </div>

      {/* Picker body — fixed height across tabs so the dialog never jumps. */}
      <TabsContent value="emoji" className="flex-none">
        <EmojiPicker.Root
          onEmojiSelect={picked => selectGenerated({ kind: 'emoji', emoji: picked.emoji })}
          // Same-origin emojibase data (vendored under client/vendor/emojibase,
          // served by server/vendor.ts) — the picker works fully offline.
          emojibaseUrl="/vendor/emojibase"
          columns={emojiColumns}
          className="isolate flex h-72 flex-col overflow-hidden rounded-xl border border-border bg-background"
        >
          <div className="flex items-center gap-1.5 p-1.5 pb-0">
            <EmojiPicker.Search
              placeholder="Search emoji"
              onChange={e => setEmojiSearch(e.target.value)}
              className="h-8 min-w-0 flex-1 appearance-none rounded-md bg-muted px-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <EmojiPicker.SkinToneSelector className="size-8 shrink-0 rounded-lg text-lg hover:bg-accent" />
          </div>
          <EmojiPicker.Viewport
            ref={setEmojiViewport}
            className="relative scrollbar-thin flex-1 overflow-y-auto outline-none"
          >
            <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <IconLoader2 size={16} stroke={1.75} className="animate-spin" />
              Loading emoji…
            </EmojiPicker.Loading>
            {/* Pinned workspace favorites — rendered inside the scroll area so
                  they read as the first category; hidden while searching so
                  results stay on top. */}
            {emojiSearch.trim() === '' && (
              <div className="border-b border-dashed border-border">
                <p className={cn('sticky top-0', GROUP_LABEL_CLASS)}>Favorites</p>
                <PickerItems className="px-1.5 pb-1.5">
                  {FAVORITE_EMOJI.map(e => (
                    <PickerItem
                      key={e}
                      onClick={() => selectGenerated({ kind: 'emoji', emoji: e })}
                      selected={selection?.kind === 'emoji' && selection.emoji === e}
                      className={EMOJI_FONT}
                    >
                      <span className="text-xl leading-none">{e}</span>
                    </PickerItem>
                  ))}
                </PickerItems>
              </div>
            )}
            <EmojiPicker.Empty className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
              <IconMoodSad size={20} stroke={1.5} />
              No emoji found
            </EmojiPicker.Empty>
            <EmojiPicker.List
              className="select-none"
              components={{
                CategoryHeader: EmojiCategoryHeader,
                Row: EmojiRow,
                Emoji: EmojiButton
              }}
            />
          </EmojiPicker.Viewport>
        </EmojiPicker.Root>
      </TabsContent>
      <TabsContent
        value="icon"
        className="scrollbar-thin h-72 overflow-y-auto rounded-xl border border-border bg-background p-1.5"
      >
        <PickerItems>
          {APP_ICON_CHOICES.map(({ id, Icon }) => (
            <PickerItem
              key={id}
              aria-label={id}
              onClick={event => {
                const svg = event.currentTarget.querySelector('svg')?.outerHTML
                if (svg) selectGenerated({ kind: 'icon', id, svg })
              }}
              selected={selection?.kind === 'icon' && selection.id === id}
              className="text-muted-foreground aria-pressed:text-accent-foreground"
            >
              <Icon stroke={1.5} />
            </PickerItem>
          ))}
        </PickerItems>
      </TabsContent>
      <TabsContent value="upload" className="flex-none">
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
            if (file) selectFile(file)
          }}
          className={cn(
            'flex h-72 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors',
            dragOver
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
          )}
        >
          <IconUpload size={24} stroke={1.5} />
          <span className="text-xs font-medium">Click or drop an image</span>
          <span className="text-[11px] text-muted-foreground/70">PNG, JPG, GIF, or WebP</span>
        </button>
      </TabsContent>

      {(updateIcon.error || updateIcon.isPending) && (
        <p
          className={cn('text-xs', updateIcon.error ? 'text-destructive' : 'text-muted-foreground')}
          aria-live="polite"
        >
          {updateIcon.error?.message ?? 'Saving…'}
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) selectFile(file)
          e.target.value = ''
        }}
      />
    </Tabs>
  )
}
