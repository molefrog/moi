import type { ObjectExpression, ObjectProperty } from '@babel/types'
import { realpath, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { analyzeAppletDependencies, collectDependencies, MODULE_FILE_RE } from './dependencies'
import { findConfigObject } from './build-applet'

type ViewSource = {
  path: string
  source: string
}

function nodeRange(node: { start?: number | null; end?: number | null }): [number, number] {
  const { start, end } = node
  if (start === null || start === undefined || end === null || end === undefined) {
    throw new Error('Could not locate the view config in its source')
  }
  return [start, end]
}

function insertTitle(source: string, object: ObjectExpression, title: string): string {
  const literal = `title: ${JSON.stringify(title)}`
  const [objectStart, objectEnd] = nodeRange(object)
  const first = object.properties[0]

  if (!first) {
    return `${source.slice(0, objectStart + 1)} ${literal} ${source.slice(objectEnd - 1)}`
  }

  const [firstStart] = nodeRange(first)
  const lineStart = source.lastIndexOf('\n', firstStart - 1) + 1
  const indent = source.slice(lineStart, firstStart)
  const multiline = lineStart > objectStart
  const insertion = multiline ? `${literal},\n${indent}` : `${literal}, `
  return `${source.slice(0, firstStart)}${insertion}${source.slice(firstStart)}`
}

export function setViewSourceTitle(source: string, title: string): string {
  const object = findConfigObject(source)
  if (object === null) {
    throw new Error('View config must be an exported object literal to rename this view')
  }
  if (object === undefined) {
    return `export const config = { title: ${JSON.stringify(title)} }\n\n${source}`
  }

  const titleProperty = [...object.properties]
    .reverse()
    .find(
      (property): property is ObjectProperty =>
        property.type === 'ObjectProperty' &&
        property.key.type === 'Identifier' &&
        property.key.name === 'title'
    )
  if (!titleProperty) return insertTitle(source, object, title)

  const [valueStart, valueEnd] = nodeRange(titleProperty.value)
  return `${source.slice(0, valueStart)}${JSON.stringify(title)}${source.slice(valueEnd)}`
}

export async function readViewSource(
  workspacePath: string,
  viewId: string
): Promise<ViewSource | null> {
  const directory = join(workspacePath, '.moi', 'views')
  for (const extension of ['.tsx', '.ts']) {
    const path = join(directory, `${viewId}${extension}`)
    const file = Bun.file(path)
    if (await file.exists()) return { path, source: await file.text() }
  }
  return null
}

export class ViewSourceInUseError extends Error {}

function isCleanupSource(moiRoot: string, path: string): boolean {
  if (!path.startsWith(moiRoot + sep) || !MODULE_FILE_RE.test(path)) return false
  // Keep data, installed UI components, packages, and generated/hidden files.
  return !relative(moiRoot, path)
    .split(sep)
    .some(part => part.startsWith('.') || ['data', 'ui', 'node_modules'].includes(part))
}

export async function deleteViewSourceFiles(workspacePath: string, viewId: string): Promise<void> {
  const workspaceRoot = await realpath(workspacePath)
  const moiRoot = join(workspaceRoot, '.moi')
  const directory = join(moiRoot, 'views')
  const sources = ['tsx', 'ts'].map(extension => join(directory, `${viewId}.${extension}`))
  const roots = new Set([...sources, join(directory, `${viewId}.server.ts`)])
  const remove = new Set(sources)
  const graph = await analyzeAppletDependencies(workspaceRoot).catch(() => null)

  if (graph?.complete) {
    // A symlink can give one module several identities. Leave helpers behind
    // in that case rather than guessing ownership or doing a more costly scan.
    const canonical = await Promise.all(
      [...graph.modules.keys()].map(async path => (await realpath(path).catch(() => null)) === path)
    )
    if (canonical.every(Boolean)) {
      const candidates = collectDependencies(graph, roots)
      const retained = collectDependencies(graph, [
        ...[...graph.entrypoints].filter(path => !roots.has(path)),
        ...[...candidates].filter(path => !isCleanupSource(moiRoot, path))
      ])
      if (sources.some(path => retained.has(path))) {
        throw new ViewSourceInUseError(
          'Another applet imports this view. Remove that import before deleting it.'
        )
      }
      for (const path of candidates) {
        if (!retained.has(path) && isCleanupSource(moiRoot, path)) remove.add(path)
      }
    }
  }

  await Promise.all([...remove].map(path => rm(path, { force: true })))
}
