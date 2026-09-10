import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import type { Tool, ToolDescriptor } from '@/lib/tools'
import { prepareTool } from '@/lib/tool-execution'
import type {
  ScratchArrowEnd,
  ScratchColor,
  ScratchFill,
  ScratchImageQuality,
  ScratchOp,
  ScratchSize,
  ScratchStyle,
  WorkspaceEntry
} from '@/lib/types'

import { readScratchpadImage, readScratchpadShapes } from './scratchpad'
import { scratchpadAssetExtension } from './scratchpad-assets'
import { executeScratchOp } from './scratchpad-executor'
import { relayScratchOp } from './scratchpad-relay'

type ScratchpadWorkspace = Pick<WorkspaceEntry, 'id' | 'path'>
type Point = { x: number; y: number }
type ShapeStyleArgs = { color?: string; fontSize?: 'regular' | 'big' }
type AddShapeArgs = ShapeStyleArgs & { id?: string; x: number; y: number }
type AddTextArgs = AddShapeArgs & { text: string }
type AddRectangleArgs = AddShapeArgs & {
  width: number
  height: number
  text?: string
  fill?: 'none' | 'semi' | 'pattern' | 'solid'
}
type AddArrowArgs = {
  from: string | Point
  to: string | Point
  id?: string
  color?: string
  stroke?: 'small' | 'large'
  elbow?: boolean
}
type AddImageArgs = {
  path: string
  x?: number
  y?: number
  id?: string
  quality?: ScratchImageQuality
}
type ShapeIdArgs = { id: string }
type OutputArgs = { outputPath?: string }

const COLORS = ['black', 'red', 'yellow', 'green', 'blue', 'grey'] as const
const COLOR_HEX: Record<ScratchColor, string> = {
  black: '#1d1d1d',
  red: '#e03131',
  yellow: '#f1ac4b',
  green: '#099268',
  blue: '#4465e9',
  grey: '#9fa8b2'
}
const FONT_SIZES: Record<NonNullable<ShapeStyleArgs['fontSize']>, ScratchSize> = {
  regular: 'm',
  big: 'xl'
}
const STROKE_SIZES: Record<NonNullable<AddArrowArgs['stroke']>, ScratchSize> = {
  small: 'm',
  large: 'xl'
}
const FILLS: Record<NonNullable<AddRectangleArgs['fill']>, ScratchFill> = {
  none: 'none',
  semi: 'solid',
  pattern: 'pattern',
  solid: 'fill'
}
const idProperty = { type: 'string', minLength: 1 }
const numberProperty = { type: 'number' }
const colorProperty = {
  oneOf: [
    { type: 'string', enum: COLORS },
    { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' }
  ],
  description: `One of ${COLORS.join(', ')}, or a hex color snapped to the nearest palette color`
}
const fontSizeProperty = { type: 'string', enum: ['regular', 'big'] }
const pointProperty = {
  type: 'object',
  properties: { x: numberProperty, y: numberProperty },
  required: ['x', 'y'],
  additionalProperties: false
}
const arrowEndProperty = { oneOf: [idProperty, pointProperty] }
const outputPathProperty = {
  type: 'string',
  minLength: 1,
  description: 'Output path, resolved from the workspace root; defaults to a temporary file'
}

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
})

// prepareTool validates arguments before invoking these handlers. This erases
// each handler's narrower argument type only when collecting the heterogeneous catalog.
const asTool = <T extends Record<string, unknown>>(tool: Tool<T>): Tool => tool as unknown as Tool

function hexToRgb(hex: string): [number, number, number] | null {
  let value = hex.trim().replace(/^#/, '')
  if (value.length === 3) value = value.replace(/(.)/g, '$1$1')
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ]
}

function parseColor(value: string): ScratchColor {
  const normalized = value.trim().toLowerCase()
  if ((COLORS as readonly string[]).includes(normalized)) return normalized as ScratchColor
  const rgb = hexToRgb(value)
  if (!rgb) throw new Error(`Unknown color "${value}".`)
  let nearest: ScratchColor = 'black'
  let nearestDistance = Infinity
  for (const color of COLORS) {
    const [r, g, b] = hexToRgb(COLOR_HEX[color])!
    const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2
    if (distance < nearestDistance) {
      nearest = color
      nearestDistance = distance
    }
  }
  return nearest
}

function shapeStyle(args: ShapeStyleArgs): ScratchStyle {
  return {
    ...(args.color ? { color: parseColor(args.color) } : {}),
    ...(args.fontSize ? { size: FONT_SIZES[args.fontSize] } : {})
  }
}

function shapeId(id: string | undefined): string {
  return id ?? `s_${crypto.randomUUID().slice(0, 8)}`
}

function arrowEnd(value: string | Point): ScratchArrowEnd {
  return typeof value === 'string' ? { id: value } : value
}

function outputPath(
  workspacePath: string,
  requested: string | undefined,
  fallback: string
): string {
  return requested ? resolve(workspacePath, requested) : join(tmpdir(), fallback)
}

function decodeDataUrl(src: string): { bytes: Buffer; mimeType: string } {
  const match = src.match(/^data:([^;,]+)(;base64)?,(.*)$/s)
  if (!match) throw new Error('Unrecognized image source.')
  const [, mimeType, base64, data] = match
  const bytes = base64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8')
  return { bytes, mimeType }
}

function definitions(workspace: ScratchpadWorkspace): Tool[] {
  const mutate = (op: ScratchOp) => executeScratchOp(workspace.path, workspace.id, op)
  const readOnly = { readOnlyHint: true }
  const consequential = { consequentialHint: true }

  return [
    asTool({
      name: 'read_canvas',
      description: 'Read every Scratchpad shape as structured JSON',
      inputSchema: schema({}),
      annotations: readOnly,
      execute: async () => ({ shapes: await readScratchpadShapes(workspace.path) })
    }),
    asTool<ShapeIdArgs & OutputArgs>({
      name: 'read_image',
      description: 'Save one Scratchpad image shape to a local file, or return its remote URL',
      inputSchema: schema({ id: idProperty, outputPath: outputPathProperty }, ['id']),
      annotations: readOnly,
      execute: async ({
        id,
        outputPath: requested
      }): Promise<{ path: string } | { url: string }> => {
        const image = await readScratchpadImage(workspace.path, id)
        if ('error' in image) throw new Error(image.error)
        if (/^https?:\/\//i.test(image.src)) return { url: image.src }
        const { bytes, mimeType } = decodeDataUrl(image.src)
        const path = outputPath(
          workspace.path,
          requested,
          `moi-scratch-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}.${scratchpadAssetExtension(mimeType)}`
        )
        await Bun.write(path, bytes)
        return { path }
      }
    }),
    asTool<OutputArgs>({
      name: 'render_canvas',
      description: 'Render the whole canvas to a PNG; requires an open Scratchpad tab',
      inputSchema: schema({ outputPath: outputPathProperty }),
      annotations: readOnly,
      execute: async ({ outputPath: requested }, options) => {
        const result = await relayScratchOp(workspace.id, { kind: 'view' }, options?.signal)
        if (!('image' in result)) throw new Error('No image returned.')
        const path = outputPath(workspace.path, requested, `moi-scratch-${Date.now()}.png`)
        await Bun.write(path, decodeDataUrl(result.image).bytes)
        return { path }
      }
    }),
    asTool<AddTextArgs>({
      name: 'add_text',
      description: 'Add a text shape to the Scratchpad',
      inputSchema: schema(
        {
          id: idProperty,
          x: numberProperty,
          y: numberProperty,
          text: { type: 'string' },
          color: colorProperty,
          fontSize: fontSizeProperty
        },
        ['x', 'y', 'text']
      ),
      annotations: consequential,
      execute: args =>
        mutate({
          kind: 'add-text',
          id: shapeId(args.id),
          x: args.x,
          y: args.y,
          text: args.text,
          ...shapeStyle(args)
        })
    }),
    asTool<AddRectangleArgs>({
      name: 'add_rectangle',
      description: 'Add a rectangle shape to the Scratchpad',
      inputSchema: schema(
        {
          id: idProperty,
          x: numberProperty,
          y: numberProperty,
          width: numberProperty,
          height: numberProperty,
          text: { type: 'string' },
          color: colorProperty,
          fill: { type: 'string', enum: ['none', 'semi', 'pattern', 'solid'], default: 'semi' },
          fontSize: fontSizeProperty
        },
        ['x', 'y', 'width', 'height']
      ),
      annotations: consequential,
      execute: args =>
        mutate({
          kind: 'add-rect',
          id: shapeId(args.id),
          x: args.x,
          y: args.y,
          w: args.width,
          h: args.height,
          ...(args.text !== undefined ? { text: args.text } : {}),
          ...shapeStyle(args),
          fill: FILLS[args.fill ?? 'semi']
        })
    }),
    asTool<AddTextArgs>({
      name: 'add_note',
      description: 'Add a sticky note to the Scratchpad',
      inputSchema: schema(
        {
          id: idProperty,
          x: numberProperty,
          y: numberProperty,
          text: { type: 'string' },
          color: colorProperty,
          fontSize: fontSizeProperty
        },
        ['x', 'y', 'text']
      ),
      annotations: consequential,
      execute: args =>
        mutate({
          kind: 'add-note',
          id: shapeId(args.id),
          x: args.x,
          y: args.y,
          text: args.text,
          ...shapeStyle(args)
        })
    }),
    asTool<AddArrowArgs>({
      name: 'add_arrow',
      description: 'Add an arrow between Scratchpad shapes or canvas points',
      inputSchema: schema(
        {
          id: idProperty,
          from: arrowEndProperty,
          to: arrowEndProperty,
          color: colorProperty,
          stroke: { type: 'string', enum: ['small', 'large'] },
          elbow: { type: 'boolean' }
        },
        ['from', 'to']
      ),
      annotations: consequential,
      execute: args =>
        mutate({
          kind: 'add-arrow',
          id: shapeId(args.id),
          from: arrowEnd(args.from),
          to: arrowEnd(args.to),
          ...(args.elbow ? { elbow: true } : {}),
          ...(args.color ? { color: parseColor(args.color) } : {}),
          ...(args.stroke ? { size: STROKE_SIZES[args.stroke] } : {})
        })
    }),
    asTool<AddImageArgs>({
      name: 'add_image',
      description: 'Add a local image file to the Scratchpad and resize it for the canvas',
      inputSchema: schema(
        {
          id: idProperty,
          path: { type: 'string', minLength: 1 },
          x: numberProperty,
          y: numberProperty,
          quality: { type: 'string', enum: ['lo', 'hi'], default: 'lo' }
        },
        ['path']
      ),
      annotations: consequential,
      execute: args =>
        mutate({
          kind: 'add-image',
          id: shapeId(args.id),
          x: args.x ?? 0,
          y: args.y ?? 0,
          path: resolve(workspace.path, args.path),
          quality: args.quality ?? 'lo'
        })
    }),
    asTool<ShapeIdArgs & Point>({
      name: 'move_shape',
      description: 'Move a Scratchpad shape to a new canvas position',
      inputSchema: schema({ id: idProperty, x: numberProperty, y: numberProperty }, [
        'id',
        'x',
        'y'
      ]),
      annotations: consequential,
      execute: args => mutate({ kind: 'move', id: args.id, x: args.x, y: args.y })
    }),
    asTool<ShapeIdArgs & { text: string }>({
      name: 'set_shape_text',
      description: 'Replace the text of a Scratchpad shape',
      inputSchema: schema({ id: idProperty, text: { type: 'string' } }, ['id', 'text']),
      annotations: consequential,
      execute: args => mutate({ kind: 'set', id: args.id, text: args.text })
    }),
    asTool<ShapeIdArgs>({
      name: 'delete_shape',
      description: 'Delete one Scratchpad shape',
      inputSchema: schema({ id: idProperty }, ['id']),
      annotations: consequential,
      execute: args => mutate({ kind: 'delete', id: args.id })
    }),
    asTool({
      name: 'clear_canvas',
      description: 'Delete every shape from the Scratchpad canvas',
      inputSchema: schema({}),
      annotations: consequential,
      execute: () => mutate({ kind: 'clear' })
    })
  ]
}

export function listScratchpadTools(workspace: ScratchpadWorkspace): ToolDescriptor[] {
  return definitions(workspace).map(tool => prepareTool(tool).descriptor)
}

export async function callScratchpadTool(
  workspace: ScratchpadWorkspace,
  name: string,
  args: unknown,
  signal?: AbortSignal
) {
  const tool = definitions(workspace).find(candidate => candidate.name === name)
  if (!tool) throw new Error(`Unknown tool "${name}" for scratchpad.`)
  const prepared = prepareTool(tool)
  return prepared.call(args, signal ?? new AbortController().signal)
}
