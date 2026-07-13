import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'

const clientRoot = import.meta.dir
const repoRoot = resolve(clientRoot, '..')
const importPattern = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g

function resolveModule(from: string, specifier: string) {
  const base = specifier.startsWith('@/')
    ? resolve(repoRoot, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : null
  if (!base) return null

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`
  ]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function sourceFiles() {
  const glob = new Bun.Glob('**/*.{ts,tsx}')
  return Array.fromAsync(glob.scan({ cwd: clientRoot, absolute: true, onlyFiles: true }))
}

async function dependencyGraph() {
  const files = await sourceFiles()
  const graph = new Map<string, string[]>()
  for (const file of files) {
    const source = await Bun.file(file).text()
    const dependencies: string[] = []
    for (const match of source.matchAll(importPattern)) {
      const dependency = resolveModule(file, match[1])
      if (dependency) dependencies.push(dependency)
    }
    graph.set(file, dependencies)
  }
  return graph
}

describe('client architecture', () => {
  test('has no source import cycles', async () => {
    const graph = await dependencyGraph()
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const stack: string[] = []
    const cycles: string[] = []

    const visit = (file: string) => {
      if (visited.has(file)) return
      if (visiting.has(file)) {
        const start = stack.indexOf(file)
        cycles.push(
          [...stack.slice(start), file].map(item => relative(clientRoot, item)).join(' → ')
        )
        return
      }
      visiting.add(file)
      stack.push(file)
      for (const dependency of graph.get(file) ?? []) visit(dependency)
      stack.pop()
      visiting.delete(file)
      visited.add(file)
    }

    for (const file of graph.keys()) visit(file)
    expect(cycles).toEqual([])
  })

  test('keeps shared components independent from app features', async () => {
    const graph = await dependencyGraph()
    const sharedRoots = [
      resolve(clientRoot, 'components/ui'),
      resolve(clientRoot, 'components/shared')
    ]
    const forbiddenRoots = [resolve(clientRoot, 'features'), resolve(clientRoot, 'app')]
    const violations: string[] = []

    for (const [file, dependencies] of graph) {
      if (!sharedRoots.some(root => file.startsWith(`${root}/`))) continue
      for (const dependency of dependencies) {
        if (forbiddenRoots.some(root => dependency.startsWith(`${root}/`))) {
          violations.push(`${relative(clientRoot, file)} → ${relative(clientRoot, dependency)}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
