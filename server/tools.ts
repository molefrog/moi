import { parse, stringify } from 'devalue'
import { readToolDescriptors } from '@/lib/tool-execution'
import { isRecord, isJsonValue, isToolName, type ToolDescriptor, type JsonValue } from '@/lib/tools'
import { parseWorkspaceTab, viewIdFromTab } from '@/lib/workspace-tabs'
import { callToolWorker } from './functions'
import { callScratchpadTool, listScratchpadTools } from './scratchpad-tools'
import { viewToolRelay } from './view-tool-relay'

const moduleFor = (viewId: string) => (/^[A-Za-z0-9_$-]+$/.test(viewId) ? `views/${viewId}` : null)
type ToolWorkspace = { id: string; path: string }
type ToolTarget = { kind: 'scratchpad' } | { kind: 'view'; viewId: string }

export async function listServerTools(
  workspacePath: string,
  viewId: string,
  signal?: AbortSignal
): Promise<ToolDescriptor[]> {
  const module = moduleFor(viewId)
  if (!module) return []
  return readToolDescriptors(
    parse(await callToolWorker(workspacePath, module, 'list-tools', '', '', signal))
  )
}

export async function callServerTool(
  workspacePath: string,
  viewId: string,
  name: string,
  args: unknown,
  signal?: AbortSignal
): Promise<JsonValue> {
  const module = moduleFor(viewId)
  if (!module) throw new Error('Invalid server-tool view ID.')
  return parse(
    await callToolWorker(workspacePath, module, 'call-tool', name, stringify(args), signal)
  ) as JsonValue
}

function parseToolTarget(target: string): ToolTarget {
  const tab = parseWorkspaceTab(target)
  if (tab === 'scratchpad') return { kind: 'scratchpad' }
  const viewId = tab ? viewIdFromTab(tab) : null
  if (!viewId) throw new Error('Use a tool target such as scratchpad or view:orders.')
  return { kind: 'view', viewId }
}

export async function listTargetServerTools(
  workspace: ToolWorkspace,
  target: string,
  signal?: AbortSignal
): Promise<ToolDescriptor[]> {
  const parsed = parseToolTarget(target)
  return parsed.kind === 'scratchpad'
    ? listScratchpadTools(workspace)
    : listServerTools(workspace.path, parsed.viewId, signal)
}

export async function callTargetServerTool(
  workspace: ToolWorkspace,
  target: string,
  name: string,
  args: unknown,
  signal?: AbortSignal
): Promise<JsonValue> {
  const parsed = parseToolTarget(target)
  return parsed.kind === 'scratchpad'
    ? callScratchpadTool(workspace, name, args, signal)
    : callServerTool(workspace.path, parsed.viewId, name, args, signal)
}

export async function listTools(workspace: ToolWorkspace, target: string, signal?: AbortSignal) {
  const parsed = parseToolTarget(target)
  if (parsed.kind === 'scratchpad') {
    return {
      target,
      tools: listScratchpadTools(workspace).map(tool => ({ ...tool, runtime: 'server' as const }))
    }
  }
  const { viewId } = parsed
  const serverTools = await listServerTools(workspace.path, viewId, signal)
  const ui = viewToolRelay.availability(workspace.id, viewId)
  const uiTools = ui === 'available' ? viewToolRelay.list(workspace.id, viewId) : []
  for (const tool of uiTools)
    if (serverTools.some(server => server.name === tool.name))
      throw new Error(`Duplicate tool "${tool.name}" for ${target}: defined on the server and UI.`)
  return {
    target,
    tools: [
      ...serverTools.map(tool => ({ ...tool, runtime: 'server' as const })),
      ...uiTools.map(tool => ({ ...tool, runtime: 'ui' as const }))
    ],
    ui,
    ...(ui === 'unavailable'
      ? {
          message: `UI tools require the active view. Use moi tab focus view:${viewId}, then discover again.`
        }
      : {}),
    ...(ui === 'ambiguous'
      ? {
          message:
            'UI tools are available in multiple browser clients. Leave the view open in one client to discover or call them.'
        }
      : {})
  }
}

// Resolve once. A failure at the selected location is returned without retrying
// the operation elsewhere. Raw server functions are deliberately outside this API.
export async function callTool(
  workspace: ToolWorkspace,
  target: string,
  name: string,
  args: unknown = {},
  signal?: AbortSignal
) {
  if (!isToolName(name))
    throw new Error('Use a tool name containing only letters, numbers, "_", "-", or ".".')
  if (!isRecord(args) || !isJsonValue(args))
    throw new Error('Tool arguments must be a JSON object.')
  const parsed = parseToolTarget(target)
  if (parsed.kind === 'scratchpad') return callScratchpadTool(workspace, name, args, signal)
  const { viewId } = parsed
  const serverTools = await listServerTools(workspace.path, viewId, signal)
  if (serverTools.some(tool => tool.name === name)) {
    if (viewToolRelay.hasTool(workspace.id, viewId, name))
      throw new Error(`Duplicate tool "${name}" for ${target}: defined on the server and UI.`)
    return callServerTool(workspace.path, viewId, name, args, signal)
  }
  return viewToolRelay.call(workspace.id, viewId, name, args, signal)
}
