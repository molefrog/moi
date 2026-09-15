import { parse } from '@babel/parser'
import type { ObjectExpression, ObjectProperty, StringLiteral } from '@babel/types'
import { basename } from 'node:path'

import { APP_ICON_IDS, isAppIconId } from '@/lib/app-icons'
import type { ViewConfig, WidgetConfig } from '@/lib/types'

const APP_ICON_NAMES: readonly string[] = APP_ICON_IDS

const DEFAULT_CONFIG: WidgetConfig = { rowSpan: 1, colSpan: 2 }
const VALID_SPANS = [1, 2, 3, 4] as const

type SourceRange = { start: number; end: number }
type SourceEdit = SourceRange & { text: string }
type ParsedConfig = {
  // undefined: no export; null: an export whose value isn't an object literal.
  object: ObjectExpression | null | undefined
  commas: number[]
}

// Static config analysis, shared by compilation and source editing. Never
// evaluate workspace code to resolve variables, spreads, or function calls.
// Parsed with @babel/parser: it handles TS + JSX with no peer dependencies, so
// it always resolves from moi's own tree. A parser that peer-depends on
// `typescript` breaks under bun's shared global tree, where another globally
// installed package controls which `typescript` sits at the hoisted root.
function parseConfig(source: string, editing = false): ParsedConfig {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
    tokens: editing
  })
  // Token positions distinguish separator commas from commas inside comments.
  const tokens: SourceRange[] = ast.tokens ?? []
  const commas = tokens
    .filter(token => token.end === token.start + 1 && source[token.start] === ',')
    .map(token => token.start)

  for (const node of ast.program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue
    if (node.declaration?.type !== 'VariableDeclaration') continue
    const decl = node.declaration.declarations.find(
      d => d.id.type === 'Identifier' && d.id.name === 'config'
    )
    if (!decl) continue

    let init = decl.init
    while (init?.type === 'TSAsExpression' || init?.type === 'TSSatisfiesExpression') {
      init = init.expression
    }
    return { object: init?.type === 'ObjectExpression' ? init : null, commas }
  }

  return { object: undefined, commas }
}

function findConfigProperties(source: string) {
  return parseConfig(source).object?.properties ?? null
}

function propertyName(property: ObjectExpression['properties'][number]): string | null {
  if (property.type === 'SpreadElement') return null
  if (property.key.type === 'StringLiteral') return property.key.value
  if (!property.computed && property.key.type === 'Identifier') return property.key.name
  return null
}

// `requiredEnv`: an array of string literals naming env vars the bundle needs.
// Advisory only — surfaced in the env UI, never enforced at build/load.
function readRequiredEnv(propValue: ObjectProperty['value']): string[] | undefined {
  if (propValue.type !== 'ArrayExpression') return undefined
  const names = propValue.elements
    .filter((el): el is StringLiteral => el?.type === 'StringLiteral')
    .map(el => el.value)
  return names.length ? names : undefined
}

export async function extractWidgetConfig(srcPath: string): Promise<WidgetConfig | null> {
  const source = await Bun.file(srcPath).text()
  const widgetName = basename(srcPath).replace(/\.tsx?$/, '')

  const properties = findConfigProperties(source)
  if (!properties) return null

  const result: Partial<WidgetConfig> = {}

  for (const prop of properties) {
    if (prop.type !== 'ObjectProperty') continue
    const key = propertyName(prop)

    if (key === 'requiredEnv') {
      const names = readRequiredEnv(prop.value)
      if (names) result.requiredEnv = names
      continue
    }

    if (key !== 'rowSpan' && key !== 'colSpan') continue
    if (prop.value.type !== 'NumericLiteral') continue

    const val = prop.value.value
    if (!(VALID_SPANS as readonly number[]).includes(val)) {
      console.warn(`[mei] "${widgetName}": config.${key}=${val} is out of 1–4 range, using default`)
      continue
    }
    result[key] = val as 1 | 2 | 3 | 4
  }

  return { ...DEFAULT_CONFIG, ...result }
}

// A view's config: `title` + app icon registry id + advisory `requiredEnv`.
// No sizing — views are full-screen. Returns null when no `config` export is present.
export async function extractViewConfig(srcPath: string): Promise<ViewConfig | null> {
  const source = await Bun.file(srcPath).text()

  const properties = findConfigProperties(source)
  if (!properties) return null

  const result: ViewConfig = {}

  for (const prop of properties) {
    if (prop.type !== 'ObjectProperty') continue
    const key = propertyName(prop)

    if (key === 'title') {
      if (prop.value.type === 'StringLiteral') {
        result.title = prop.value.value
      }
      continue
    }
    if (key === 'icon') {
      if (prop.value.type === 'StringLiteral') {
        const icon = prop.value.value
        if (!isAppIconId(icon)) {
          throw new Error(
            `Unknown view icon id "${icon}". Use one of: ${APP_ICON_NAMES.join(', ')}`
          )
        }
        result.icon = icon
      }
      continue
    }
    if (key === 'requiredEnv') {
      const names = readRequiredEnv(prop.value)
      if (names) result.requiredEnv = names
    }
  }

  return result
}

function nodeRange(node: { start?: number | null; end?: number | null }): SourceRange {
  const { start, end } = node
  if (start === null || start === undefined || end === null || end === undefined) {
    throw new Error('Could not locate the view config in its source')
  }
  return { start, end }
}

export function setViewSourceTitle(source: string, title: string): string {
  const { object, commas } = parseConfig(source, true)
  if (object === null) {
    throw new Error('View config must be an exported object literal to rename this view')
  }
  const value = JSON.stringify(title)
  if (object === undefined) {
    return `export const config = { title: ${value} }\n\n${source}`
  }

  // Find the last property that could determine the runtime title. A spread
  // or an unknown computed key can override an earlier explicit title.
  const lastOverride = [...object.properties]
    .reverse()
    .find(
      property =>
        property.type === 'SpreadElement' ||
        propertyName(property) === 'title' ||
        (property.computed && propertyName(property) === null)
    )
  if (lastOverride && propertyName(lastOverride) === 'title') {
    const replaceValue = lastOverride.type === 'ObjectProperty' && !lastOverride.shorthand
    const { start, end } = nodeRange(replaceValue ? lastOverride.value : lastOverride)
    return source.slice(0, start) + (replaceValue ? value : `title: ${value}`) + source.slice(end)
  }

  const edits: SourceEdit[] = []
  // Remove earlier title properties before appending the final one, avoiding
  // duplicate keys. Keep surrounding comments and other properties intact.
  for (let i = 0; i < object.properties.length; i++) {
    const property = object.properties[i]
    if (propertyName(property) !== 'title') continue
    const range = nodeRange(property)
    const next = nodeRange(object.properties[i + 1])
    const comma = commas.find(position => position >= range.end && position < next.start)
    if (comma === undefined) throw new Error('Could not locate the title separator')
    edits.push({ ...range, text: '' }, { start: comma, end: comma + 1, text: '' })
  }

  const { start, end } = nodeRange(object)
  const close = end - 1
  const lineStart = source.lastIndexOf('\n', close - 1) + 1
  const closingIndent = source.slice(lineStart, close)
  const multiline = lineStart > start && /^[\t ]*$/.test(closingIndent)
  const first = object.properties[0]
  const firstStart = first ? nodeRange(first).start : start
  const firstIndent = source.slice(source.lastIndexOf('\n', firstStart - 1) + 1, firstStart)
  const indent = /^[\t ]*$/.test(firstIndent) ? firstIndent : closingIndent + '  '
  const position = multiline ? lineStart : close
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  edits.push({
    start: position,
    end: position,
    text: multiline ? `${indent}title: ${value},${newline}` : ` title: ${value} `
  })

  const last = object.properties.at(-1)
  if (last && typeof object.extra?.trailingComma !== 'number') {
    const { end: lastEnd } = nodeRange(last)
    edits.push({ start: lastEnd, end: lastEnd, text: ',' })
  }
  // Apply from the end so the parser's offsets remain valid for every edit.
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  }
  return source
}
