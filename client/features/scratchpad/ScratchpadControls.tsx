import { Fragment, type ReactElement, useEffect, useState } from 'react'

import {
  type Editor,
  type StyleProp,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultSizeStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultVerticalAlignStyle,
  GeoShapeGeoStyle,
  react
} from 'tldraw'
import { motion } from 'motion/react'
import {
  IconArrowUpRight,
  IconEraser,
  IconHandStop,
  IconHighlight,
  IconLine,
  IconPointer2,
  IconSketching,
  IconSquare,
  IconSticker2,
  IconTypography
} from '@tabler/icons-react'

import { cn } from '@/client/lib/cn'

type IconC = typeof IconPointer2

// The curated left-bar entries, grouped by `sep` dividers. `tool` selects a
// tldraw tool; `geo` selects the geo tool (rectangle); `menu` is a placeholder
// (noop for now); `sep` is a divider.
type ToolEntry =
  | { kind: 'tool'; id: string; label: string; Icon: IconC }
  | { kind: 'geo'; label: string; Icon: IconC }
  | { kind: 'menu'; label: string; Icon: IconC }
  | { kind: 'sep' }

const TOOL_ENTRIES: ToolEntry[] = [
  { kind: 'tool', id: 'select', label: 'Select', Icon: IconPointer2 },
  { kind: 'tool', id: 'hand', label: 'Hand', Icon: IconHandStop },
  { kind: 'sep' },
  { kind: 'tool', id: 'draw', label: 'Pencil', Icon: IconSketching },
  { kind: 'geo', label: 'Rectangle', Icon: IconSquare },
  { kind: 'tool', id: 'note', label: 'Sticker', Icon: IconSticker2 },
  { kind: 'tool', id: 'text', label: 'Text', Icon: IconTypography },
  { kind: 'tool', id: 'line', label: 'Line', Icon: IconLine },
  { kind: 'tool', id: 'arrow', label: 'Arrow', Icon: IconArrowUpRight },
  { kind: 'sep' },
  { kind: 'tool', id: 'highlight', label: 'Highlighter', Icon: IconHighlight },
  { kind: 'tool', id: 'eraser', label: 'Eraser', Icon: IconEraser }
  // Temporarily hidden — `menu` kind + IconDots import kept for future use.
  // { kind: "menu", label: "Menu", Icon: IconDots },
]

type ToolButtonProps = {
  label: string
  active: boolean
  Icon: IconC
  onClick: () => void
}

function ToolButton({ label, active, Icon, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        active &&
          'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
      )}
    >
      <Icon size={20} stroke={1.5} />
    </button>
  )
}

type ScratchToolbarProps = { editor: Editor }

// tldraw shares style props (dash, size, font…) globally across tools, so a
// dashed pen would leak into a freshly-picked rect. On each tool activation we
// pin the styles that tool doesn't expose to fixed values, keeping every tool
// visually independent.
function applyToolLocks(editor: Editor, toolId: string) {
  if (toolId === 'geo') {
    // Rects: always a rough (hand-drawn) outline at a consistent stroke — never
    // inherit the pen's dashed/solid or its size.
    editor.setStyleForNextShapes(DefaultDashStyle, 'draw')
    editor.setStyleForNextShapes(DefaultSizeStyle, 'm')
  } else if (toolId === 'note') {
    editor.setStyleForNextShapes(DefaultFontStyle, 'draw')
    editor.setStyleForNextShapes(DefaultHorizontalAlignStyle, 'middle')
    editor.setStyleForNextShapes(DefaultVerticalAlignStyle, 'middle')
    ensurePaletteColor(editor, 'sticker', 'yellow')
  } else if (toolId === 'text') {
    editor.setStyleForNextShapes(DefaultFontStyle, 'draw')
    editor.setStyleForNextShapes(DefaultHorizontalAlignStyle, 'middle')
    editor.setStyleForNextShapes(DefaultVerticalAlignStyle, 'middle')
  } else if (toolId === 'highlight') {
    ensurePaletteColor(editor, 'highlight', 'yellow')
  } else if (toolId === 'arrow') {
    // Arrows don't expose dash — pin it rough to match the hand-drawn look and
    // never inherit a dashed/solid stroke from a previous tool.
    editor.setStyleForNextShapes(DefaultDashStyle, 'draw')
  } else if (toolId === 'draw' || toolId === 'line') {
    // Pen/line only offer rough or dashed — if we're arriving from a rect's
    // 'solid', fall back to rough so a valid dash is always selected.
    const dash = editor.getStyleForNextShape(DefaultDashStyle)
    if (dash !== 'draw' && dash !== 'dashed') {
      editor.setStyleForNextShapes(DefaultDashStyle, 'draw')
    }
  }
}

// Custom vertical tool bar, rendered as an overlay over the canvas (outside
// tldraw's own UI layout). Tracks the current tool reactively via `react`.
export function ScratchToolbar({ editor }: ScratchToolbarProps) {
  const [toolId, setToolId] = useState(() => editor.getCurrentToolId())

  useEffect(() => {
    setToolId(editor.getCurrentToolId())
    return react('scratch current tool', () => setToolId(editor.getCurrentToolId()))
  }, [editor])

  const activate = (toolId: string) => {
    editor.run(() => {
      applyToolLocks(editor, toolId)
      editor.setCurrentTool(toolId)
    })
  }

  const selectRectangle = () => {
    editor.run(() => {
      editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle')
      applyToolLocks(editor, 'geo')
      editor.setCurrentTool('geo')
    })
  }

  return (
    <div className="absolute top-1/2 left-3 z-10 -translate-y-1/2">
      <motion.div
        initial={{ x: -72, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4, duration: 0.55 }}
        className="flex flex-col gap-1 rounded-xl bg-background/95 p-1 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur"
      >
        {TOOL_ENTRIES.map((entry, i) => {
          if (entry.kind === 'sep') {
            return <div key={`sep-${i}`} className="mx-1 my-0.5 h-px bg-border" />
          }
          if (entry.kind === 'geo') {
            return (
              <ToolButton
                key="geo"
                label={entry.label}
                Icon={entry.Icon}
                active={toolId === 'geo'}
                onClick={selectRectangle}
              />
            )
          }
          if (entry.kind === 'menu') {
            return (
              <ToolButton
                key="menu"
                label={entry.label}
                Icon={entry.Icon}
                active={false}
                onClick={() => {}}
              />
            )
          }
          return (
            <ToolButton
              key={entry.id}
              label={entry.label}
              Icon={entry.Icon}
              active={toolId === entry.id}
              onClick={() => activate(entry.id)}
            />
          )
        })}
      </motion.div>
    </div>
  )
}

// --- Second bar: per-tool contextual style controls -----------------------
// Each tool exposes a different subset of controls (color/size/dash/fill). The
// sub-bar shows the active tool's set, or — when the Select tool has a selection
// — the union of the selected shapes' sets. Size maps small→'m', large→'xl'.
// Sticker & text also lock align=center and font=rough (set on mount, not shown).

type StyleControl = 'color' | 'size' | 'dash' | 'fill'
const CONTROL_ORDER: StyleControl[] = ['color', 'size', 'dash', 'fill']

// Controls exposed while a creating tool is active.
const CONTROLS_BY_TOOL: Record<string, StyleControl[]> = {
  draw: ['color', 'size', 'dash'],
  geo: ['color', 'fill'],
  note: ['color', 'size'],
  text: ['color', 'size'],
  line: ['color', 'dash', 'size'],
  highlight: ['color', 'size'],
  arrow: ['color', 'size']
}

// Controls exposed per selected shape type (Select tool with a selection).
const CONTROLS_BY_SHAPE: Record<string, StyleControl[]> = {
  draw: ['color', 'size', 'dash'],
  geo: ['color', 'fill'],
  note: ['color', 'size'],
  text: ['color', 'size'],
  line: ['color', 'dash', 'size'],
  highlight: ['color', 'size'],
  arrow: ['color', 'size']
}

// Three contextual color palettes (all subsets of tldraw's color enum):
// regular (most tools), highlighter-friendly, and sticky-note pastels.
type Swatch = { value: TLDefaultColorStyle; klass: string }
type PaletteKind = 'regular' | 'highlight' | 'sticker'
type Palette = { swatches: Swatch[] }

// Swatch display hexes are tldraw's actual light-theme colors, picked to match
// how each tool paints: regular → stroke `solid`, highlight → `highlightSrgb`,
// sticker → `noteFill`.
const PALETTES: Record<PaletteKind, Palette> = {
  regular: {
    swatches: [
      { value: 'black', klass: 'bg-[#1d1d1d]' },
      { value: 'red', klass: 'bg-[#e03131]' },
      { value: 'yellow', klass: 'bg-[#f1ac4b]' },
      { value: 'green', klass: 'bg-[#099268]' },
      { value: 'blue', klass: 'bg-[#4465e9]' },
      { value: 'grey', klass: 'bg-[#9fa8b2]' }
    ]
  },
  highlight: {
    swatches: [
      { value: 'yellow', klass: 'bg-[#fddd00]' },
      { value: 'green', klass: 'bg-[#00ffc8]' },
      { value: 'blue', klass: 'bg-[#10acff]' }
    ]
  },
  sticker: {
    swatches: [
      { value: 'yellow', klass: 'bg-[#fed49a]' },
      { value: 'blue', klass: 'bg-[#8aa3ff]' },
      { value: 'green', klass: 'bg-[#6fc896]' }
    ]
  }
}

// Which palette applies right now — by active creating tool, else by the single
// selected shape type, else regular.
function paletteKind(editor: Editor): PaletteKind {
  const toolId = editor.getCurrentToolId()
  if (toolId === 'highlight') return 'highlight'
  if (toolId === 'note') return 'sticker'
  if (CONTROLS_BY_TOOL[toolId]) return 'regular'

  const types = new Set(editor.getSelectedShapeIds().map(id => editor.getShape(id)?.type))
  if (types.size === 1) {
    if (types.has('highlight')) return 'highlight'
    if (types.has('note')) return 'sticker'
  }
  return 'regular'
}

// If the next-shape color isn't in `kind`'s palette, snap it to a sensible
// default so the swatch row always has an active selection.
function ensurePaletteColor(editor: Editor, kind: PaletteKind, fallback: TLDefaultColorStyle) {
  const values = PALETTES[kind].swatches.map(s => s.value)
  if (!values.includes(editor.getStyleForNextShape(DefaultColorStyle))) {
    editor.setStyleForNextShapes(DefaultColorStyle, fallback)
  }
}

// Two sizes only — small→'m', large→'xl'. Each option carries previews for the
// three size renderings (see sizeGlyphKind): `dot` blob for most tools, `stroke`
// pen icon for the pencil, `glyph` letter px for text.
const SIZE_OPTIONS: {
  value: TLDefaultSizeStyle
  label: string
  dot: string
  glyph: number
}[] = [
  { value: 'm', label: 'Small', dot: 'size-1.5', glyph: 16 },
  { value: 'xl', label: 'Large', dot: 'size-3', glyph: 24 }
]

// Rough (hand-drawn) vs dashed stroke.
const DASH_OPTIONS: { value: TLDefaultDashStyle; label: string; preview: string }[] = [
  { value: 'draw', label: 'Rough', preview: 'border-b-2 border-current' },
  { value: 'dashed', label: 'Dash', preview: 'border-b-2 border-dashed border-current' }
]

// Three fills: empty, full color, hatch. (tldraw's translucent 'semi' read as
// "stroke only", so we drop it — 'solid' is the fullest native color fill.)
const FILL_OPTIONS: { value: TLDefaultFillStyle; label: string; preview: string }[] = [
  // tldraw quirk (see defaultFills): fillStyle 'solid' paints the lighter "semi"
  // color, while 'fill' paints the true solid (body === border color).
  { value: 'none', label: 'None', preview: 'border border-foreground/50' },
  { value: 'solid', label: 'Semi', preview: 'border border-foreground/40 bg-foreground/25' },
  { value: 'fill', label: 'Solid', preview: 'border border-foreground bg-foreground' },
  {
    value: 'pattern',
    label: 'Pattern',
    preview:
      'border border-foreground/40 bg-[repeating-linear-gradient(45deg,currentColor_0,currentColor_1px,transparent_1px,transparent_3px)]'
  }
]

// Read the active value of a style: shared value across the selection, or the
// next-shape value when nothing is selected.
function readStyleValue<T>(editor: Editor, style: StyleProp<T>): T | undefined {
  if (editor.getSelectedShapeIds().length > 0) {
    return editor.getSharedStyles().getAsKnownValue(style)
  }
  return editor.getStyleForNextShape(style)
}

// Apply to the selection (if any) and make it the default for the next shape.
function applyStyle<T>(editor: Editor, style: StyleProp<T>, value: T) {
  editor.run(() => {
    editor.setStyleForNextShapes(style, value)
    if (editor.getSelectedShapeIds().length > 0) {
      editor.setStyleForSelectedShapes(style, value)
    }
  })
}

// Which controls the sub-bar should show right now: the active creating tool's
// set, else the union for the current selection, else none (bar hidden).
function activeControls(editor: Editor): StyleControl[] {
  const toolControls = CONTROLS_BY_TOOL[editor.getCurrentToolId()]
  if (toolControls) return toolControls

  const ids = editor.getSelectedShapeIds()
  if (ids.length === 0) return []
  const set = new Set<StyleControl>()
  for (const id of ids) {
    const shape = editor.getShape(id)
    if (!shape) continue
    for (const control of CONTROLS_BY_SHAPE[shape.type] ?? []) set.add(control)
  }
  return CONTROL_ORDER.filter(control => set.has(control))
}

// How the size control previews itself, matched to what "size" means for the
// active tool: the pencil's is a stroke weight (pen glyph at varying strokes),
// text's is a font size (a letter at varying sizes), everything else a plain blob.
// Keyed off the active tool, or a uniform selection under the Select tool.
function sizeGlyphKind(editor: Editor): 'pen' | 'letter' | 'dot' {
  const toolId = editor.getCurrentToolId()
  if (toolId === 'draw') return 'pen'
  if (toolId === 'text') return 'letter'
  const ids = editor.getSelectedShapeIds()
  const types = new Set(ids.map(id => editor.getShape(id)?.type))
  if (types.size === 1) {
    if (types.has('draw')) return 'pen'
    if (types.has('text')) return 'letter'
  }
  return 'dot'
}

type StyleBarState = {
  controls: StyleControl[]
  palette: Palette
  color: TLDefaultColorStyle | undefined
  size: TLDefaultSizeStyle | undefined
  sizeGlyph: 'pen' | 'letter' | 'dot'
  dash: TLDefaultDashStyle | undefined
  fill: TLDefaultFillStyle | undefined
}

function readStyleBarState(editor: Editor): StyleBarState {
  return {
    controls: activeControls(editor),
    palette: PALETTES[paletteKind(editor)],
    color: readStyleValue(editor, DefaultColorStyle),
    size: readStyleValue(editor, DefaultSizeStyle),
    sizeGlyph: sizeGlyphKind(editor),
    dash: readStyleValue(editor, DefaultDashStyle),
    fill: readStyleValue(editor, DefaultFillStyle)
  }
}

type ScratchStyleBarProps = { editor: Editor }

export function ScratchStyleBar({ editor }: ScratchStyleBarProps) {
  const [state, setState] = useState<StyleBarState>(() => readStyleBarState(editor))

  useEffect(() => {
    setState(readStyleBarState(editor))
    return react('scratch styles', () => setState(readStyleBarState(editor)))
  }, [editor])

  if (state.controls.length === 0) return null

  const groups: Record<StyleControl, ReactElement> = {
    color: (
      <div className="flex flex-col items-center gap-2 pt-1">
        {state.palette.swatches.map(c => (
          <button
            key={c.value}
            type="button"
            title={c.value}
            onClick={() => applyStyle(editor, DefaultColorStyle, c.value)}
            className={cn(
              'size-5.5 rounded-full ring-offset-1 ring-offset-background',
              c.klass,
              state.color === c.value ? 'ring-2 ring-primary' : 'ring-1 ring-black/15'
            )}
          />
        ))}
      </div>
    ),
    size: (
      <div className="flex flex-col items-center gap-1 text-foreground">
        {SIZE_OPTIONS.map(s => (
          <button
            key={s.value}
            type="button"
            title={s.label}
            onClick={() => applyStyle(editor, DefaultSizeStyle, s.value)}
            className={cn(
              'flex size-7.5 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground',
              state.size === s.value && 'bg-accent text-accent-foreground'
            )}
          >
            {state.sizeGlyph === 'pen' ? (
              <IconSketching size={20} stroke={1.5} />
            ) : state.sizeGlyph === 'letter' ? (
              <IconTypography size={s.glyph} stroke={s.glyph === 16 ? 1.75 : 1.5} />
            ) : (
              <span className={cn('rounded-full bg-current', s.dot)} />
            )}
          </button>
        ))}
      </div>
    ),
    dash: (
      <div className="flex flex-col items-center gap-1 text-foreground">
        {DASH_OPTIONS.map(d => (
          <button
            key={d.value}
            type="button"
            title={d.label}
            onClick={() => applyStyle(editor, DefaultDashStyle, d.value)}
            className={cn(
              'flex size-7.5 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground',
              state.dash === d.value && 'bg-accent text-accent-foreground'
            )}
          >
            <span className={cn('w-3.5', d.preview)} />
          </button>
        ))}
      </div>
    ),
    fill: (
      <div className="flex flex-col items-center gap-1 text-foreground">
        {FILL_OPTIONS.map(f => (
          <button
            key={f.value}
            type="button"
            title={f.label}
            onClick={() => applyStyle(editor, DefaultFillStyle, f.value)}
            className={cn(
              'flex size-7.5 items-center justify-center rounded-full hover:bg-accent hover:text-accent-foreground',
              state.fill === f.value && 'bg-accent text-accent-foreground'
            )}
          >
            <span className={cn('size-4.5 rounded-sm', f.preview)} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="absolute top-1/2 left-15 z-10 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-full bg-background/95 px-1 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur">
      {state.controls.map((control, i) => (
        <Fragment key={control}>
          {i > 0 && <div className="h-px w-5 bg-border" />}
          {groups[control]}
        </Fragment>
      ))}
    </div>
  )
}
