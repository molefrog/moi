import type { ObjectExpression, ObjectProperty } from '@babel/types'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { findConfigObject } from './bundler/build-applet'

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

export async function deleteViewSourceFiles(workspacePath: string, viewId: string): Promise<void> {
  const directory = join(workspacePath, '.moi', 'views')
  await Promise.all(
    ['tsx', 'ts', 'server.ts'].map(suffix =>
      rm(join(directory, `${viewId}.${suffix}`), { force: true })
    )
  )
}
