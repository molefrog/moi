import { basename } from 'node:path'
import type { ScratchOp, ViewInfo } from '@/lib/types'
import { currentRemoteWorkspace } from '../remote/workspace'
import { requestWorkspace } from '../workspaces/api'
import { assembleTabRows } from '../workspaces/tabs'
import { readScratchpadImage, readScratchpadShapes } from '../scratchpad/document'
import type { WorkspaceConfig } from '../workspaces/config'

type ScratchCliOp = ScratchOp | { kind: 'read' } | { kind: 'read-image'; name: string }

// These commands keep parsing, local file IO and output on the caller. Only
// shared data crosses the owner API. Browser rendering stays on visitor control.
export async function remoteControl(
  path: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  if (!['config', 'scratch', 'tabs'].includes(String(payload.type))) return
  const op = payload.op as ScratchCliOp | undefined
  if (payload.type === 'scratch' && op?.kind === 'view') return
  const remote = await currentRemoteWorkspace(path)
  if (!remote) return
  const workspace = { remote }
  const request = (suffix: string, init?: RequestInit) => requestWorkspace(workspace, suffix, init)
  if (payload.type === 'tabs') {
    const { views }: { views: ViewInfo[] } = await (
      await request('/views?includePending=true')
    ).json()
    return { tabs: assembleTabRows(views, 'overview') }
  }
  if (payload.type === 'config') {
    if (typeof payload.iconPath === 'string') {
      const file = Bun.file(payload.iconPath)
      if (!(await file.exists())) throw new Error('Local icon file not found')
      return { ok: true, ...(await (await request('/icon', { method: 'PUT', body: file })).json()) }
    }
    if (payload.clearIcon) {
      await request('/icon', { method: 'DELETE' })
      return { ok: true, clearedIcon: true }
    }
    if (payload.name !== undefined || payload.clearName) {
      const result = await (
        await request('/config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: payload.clearName ? null : payload.name })
        })
      ).json()
      return { ...result, ok: true, clearedName: payload.clearName === true }
    }
    const config: WorkspaceConfig = await (await request('/config')).json()
    return { ...config, hasIcon: !!config.icon }
  }
  if (!op) throw new Error('Missing scratch operation')
  if (op.kind === 'read') return { shapes: await readScratchpadShapes(workspace) }
  if (op.kind === 'read-image') return readScratchpadImage(workspace, op.name)
  const body = new FormData()
  if (op.kind.startsWith('add-') && 'name' in op && !op.name)
    op.name = `s_${crypto.randomUUID().slice(0, 8)}`
  if (op.kind === 'add-image') {
    const file = Bun.file(op.path)
    if (!(await file.exists())) throw new Error('Local image file not found')
    body.set('image', file)
    // The owner receives bytes, never a caller's filesystem path.
    body.set('op', JSON.stringify({ ...op, path: basename(op.path) }))
  } else body.set('op', JSON.stringify(op))
  return {
    ok: true,
    result: await (await request('/scratchpad/ops', { method: 'POST', body })).json()
  }
}
