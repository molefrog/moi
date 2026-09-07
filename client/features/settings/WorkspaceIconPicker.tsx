import { type ComponentProps, createContext, useContext, useEffect, useRef, useState } from 'react'

import { IconArrowBack, IconLoader2, IconMoodSad, IconUpload } from '@tabler/icons-react'
import {
  EmojiPicker,
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps
} from 'frimousse'

import { Button } from '@/client/components/ui/button'
import { Checkbox } from '@/client/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs'
import { useUpdateWorkspaceIcon } from '@/client/features/settings/api'
import { useWorkspaceLayoutCtx } from '@/client/features/workspace/WorkspaceLayoutContext'
import { APP_ICON_CHOICES } from '@/client/lib/app-icon-registry'
import { cn } from '@/client/lib/cn'
import type { WorkspaceIcon } from '@/lib/types'
import { EMOJI_FONT, FAVORITE_EMOJI } from './icon-picker-options'

type IconSelection = Exclude<WorkspaceIcon, { type: 'upload' }>

const PICKER_ITEM_SIZE = 32
const PICKER_ITEM_GAP = 4
const PICKER_ROW_PADDING = 12
const GROUP_LABEL_CLASS =
  'flex pt-4 pb-2 items-center bg-background px-3 text-xs font-medium text-muted-foreground'
const SelectedEmojiContext = createContext<string | null>(null)

function withThemeBackground(icon: IconSelection, enabled: boolean): IconSelection {
  if (enabled) return { ...icon, background: 'theme' }
  if (icon.type === 'emoji') return { type: 'emoji', value: icon.value }
  return { type: 'glyph', value: icon.value }
}

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
  const selectedEmoji = useContext(SelectedEmojiContext)
  return (
    <PickerItem selected={selectedEmoji === emoji.emoji} className={EMOJI_FONT} {...props}>
      <span className="text-xl leading-none">{emoji.emoji}</span>
    </PickerItem>
  )
}

export function WorkspaceIconPicker() {
  const { layout, workspaceId } = useWorkspaceLayoutCtx()
  const { icon } = layout
  const updateIcon = useUpdateWorkspaceIcon(workspaceId)

  const [mode, setMode] = useState<WorkspaceIcon['type']>(icon?.type ?? 'glyph')
  const [useThemeBackground, setUseThemeBackground] = useState(
    !icon || (icon.type !== 'upload' && icon.background === 'theme')
  )
  const selection = icon?.type === 'upload' ? undefined : icon
  // Mirrors the emoji search input so the pinned favorites hide while the list
  // is showing filtered results.
  const [emojiSearch, setEmojiSearch] = useState('')
  const [emojiColumns, setEmojiColumns] = useState(13)
  const [emojiViewport, setEmojiViewport] = useState<HTMLDivElement | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  const selectIcon = (next: IconSelection) => {
    const icon = withThemeBackground(next, useThemeBackground)
    updateIcon.mutate({ kind: 'set', icon })
  }

  const selectFile = (file: File) => {
    updateIcon.mutate({ kind: 'upload', file })
  }

  const setThemeBackground = (checked: boolean) => {
    setUseThemeBackground(checked)
    if (selection) {
      const icon = withThemeBackground(selection, checked)
      updateIcon.mutate({ kind: 'set', icon })
    }
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
      onValueChange={value => setMode(value as WorkspaceIcon['type'])}
      className="min-w-0 gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <TabsList aria-label="Icon source">
          <TabsTrigger value="glyph">Icon</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        {icon && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setUseThemeBackground(true)
              updateIcon.mutate({ kind: 'reset' })
            }}
            className="text-muted-foreground"
          >
            <IconArrowBack data-icon="inline-start" stroke={1.5} />
            Reset
          </Button>
        )}
      </div>

      {/* Picker body — fixed height across tabs so the dialog never jumps. */}
      <TabsContent value="emoji" className="flex-none">
        <SelectedEmojiContext value={selection?.type === 'emoji' ? selection.value : null}>
          <EmojiPicker.Root
            onEmojiSelect={picked => selectIcon({ type: 'emoji', value: picked.emoji })}
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
                        onClick={() => selectIcon({ type: 'emoji', value: e })}
                        selected={selection?.type === 'emoji' && selection.value === e}
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
        </SelectedEmojiContext>
      </TabsContent>
      <TabsContent
        value="glyph"
        className="scrollbar-thin h-72 overflow-y-auto rounded-xl border border-border bg-background p-1.5"
      >
        <PickerItems>
          {APP_ICON_CHOICES.map(({ id, Icon }) => (
            <PickerItem
              key={id}
              aria-label={id}
              onClick={() => selectIcon({ type: 'glyph', value: id })}
              selected={selection?.type === 'glyph' && selection.value === id}
              className="text-muted-foreground aria-pressed:text-accent-foreground"
            >
              <Icon stroke={1.75} />
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

      {mode !== 'upload' && (
        <label
          htmlFor="workspace-icon-theme-background"
          className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium"
        >
          <Checkbox
            id="workspace-icon-theme-background"
            checked={useThemeBackground}
            onCheckedChange={setThemeBackground}
          />
          Use theme background
        </label>
      )}

      {updateIcon.error && (
        <p className="text-xs text-destructive" aria-live="polite">
          {updateIcon.error.message}
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
