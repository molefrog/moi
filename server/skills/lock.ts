import { Mutex } from 'async-mutex'
import { realpath } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

const locks = new Map<string, { mutex: Mutex; users: number }>()

// Resolve existing ancestors too, so a new installation and a symlinked path
// to that installation share a lock before the skill directory exists.
async function resolveLockPath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return join(await resolveLockPath(dirname(path)), basename(path))
  }
}

// Coordinates this process only; independent CLI processes need their own lock.
export async function withSkillLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const key = await resolveLockPath(resolve(path))
  const entry = locks.get(key) ?? { mutex: new Mutex(), users: 0 }
  locks.set(key, entry)
  entry.users++
  try {
    return await entry.mutex.runExclusive(run)
  } finally {
    if (--entry.users === 0) locks.delete(key)
  }
}
