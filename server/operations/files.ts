import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Mutex } from 'async-mutex'

export class OperationError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

// All file operations share this queue. Keep validation and replacement together
// so two requests through this listener cannot swap an ancestor during a write.
const writes = new Mutex()
function inside(root: string, path: string) {
  const rel = relative(root, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}
export async function workspaceFile(root: string, path: string, create = false): Promise<string> {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some(p => p === '..' || p === '.')
  )
    throw new OperationError('Use a file path relative to the workspace')
  root = await realpath(root)
  const target = resolve(root, path)
  if (!inside(root, target)) throw new OperationError('File is outside the workspace')
  let current = root
  const parts = relative(root, target).split(sep)
  for (const [i, part] of parts.entries()) {
    current = resolve(current, part)
    try {
      const info = await lstat(current)
      // Reject symlinks even if currently pointing inside: no check/use redirect.
      if (info.isSymbolicLink()) throw new OperationError('Symbolic links are not supported')
      if (i < parts.length - 1 && !info.isDirectory())
        throw new OperationError('Parent is not a directory')
      if (i === parts.length - 1 && !info.isFile()) throw new OperationError('Path is not a file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (!create) throw new OperationError('File not found', 404)
      if (i < parts.length - 1) await mkdir(current)
    }
  }
  return target
}

export async function writeWorkspaceFile(
  root: string,
  path: string,
  body: ReadableStream<Uint8Array>,
  patch?: (source: string) => string
) {
  return writes.runExclusive(async () => {
    const target = await workspaceFile(root, path, !patch)
    const temporary = resolve(dirname(target), `.moi-write-${crypto.randomUUID()}`)
    let mode = 0o664
    try {
      mode = (await lstat(target)).mode & 0o777
    } catch {}
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      mode
    )
    try {
      if (patch) {
        const source = new TextDecoder('utf-8', { fatal: true }).decode(
          await Bun.file(target).arrayBuffer()
        )
        await file.writeFile(patch(source))
      } else {
        for await (const chunk of body) await file.writeFile(chunk)
      }
      await file.close()
      // Recheck after streaming an upload; an external shell can change paths.
      if ((await workspaceFile(root, path, true)) !== target)
        throw new OperationError('File changed during upload', 409)
      await rename(temporary, target)
    } finally {
      await file.close().catch(() => {})
      await rm(temporary, { force: true })
    }
    return { ok: true, bytes: (await lstat(target)).size }
  })
}

/** Apply an exact unified diff to this file. No fuzzy matching or shell execution. */
export function applyUnifiedPatch(source: string, patch: string): string {
  const original = source ? source.split('\n') : []
  if (source.endsWith('\n')) original.pop()
  const output: string[] = []
  const lines = patch.split('\n')
  let cursor = 0,
    hunks = 0,
    newline = source.endsWith('\n')
  for (let i = 0; i < lines.length; i++) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(lines[i]!)
    if (!header) {
      if (lines[i] === '' || lines[i]?.startsWith('--- ') || lines[i]?.startsWith('+++ ')) continue
      throw new OperationError('Expected a unified diff', 422)
    }
    hunks++
    const oldCount = Number(header[2] ?? 1),
      newCount = Number(header[4] ?? 1)
    const start = Number(header[1]) - (oldCount ? 1 : 0)
    if (start < cursor || start > original.length)
      throw new OperationError('Patch does not match the file', 409)
    output.push(...original.slice(cursor, start))
    cursor = start
    if (Number(header[3]) - (newCount ? 1 : 0) !== output.length)
      throw new OperationError('Invalid patch position', 422)
    let removed = 0,
      added = 0
    while (removed < oldCount || added < newCount) {
      const line = lines[++i]
      if (line === undefined) throw new OperationError('Incomplete patch', 422)
      const prefix = line[0],
        value = line.slice(1)
      if (prefix === ' ' || prefix === '-') {
        if (original[cursor++] !== value)
          throw new OperationError('Patch does not match the file', 409)
        removed++
      }
      if (prefix === ' ' || prefix === '+') {
        output.push(value)
        added++
        newline = true
      }
      if (![' ', '+', '-'].includes(prefix ?? '') || removed > oldCount || added > newCount)
        throw new OperationError('Invalid patch hunk', 422)
      if (lines[i + 1] === '\\ No newline at end of file') {
        if (prefix !== '-') newline = false
        i++
      }
    }
  }
  if (!hunks) throw new OperationError('Patch has no hunks', 422)
  if (cursor < original.length) newline = source.endsWith('\n')
  output.push(...original.slice(cursor))
  return output.join('\n') + (output.length && newline ? '\n' : '')
}
