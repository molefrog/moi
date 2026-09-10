import { parse, stringify } from 'devalue'
import { readToolDescriptors } from '@/lib/tool-execution'
import { parseToolTarget } from '@/lib/tool-target'
import {
  isRecord,
  isJsonValue,
  isToolName,
  toolInfo,
  type ToolDescriptor,
  type JsonValue
} from '@/lib/tools'
import { callToolWorker } from './functions'
import { viewToolRelay } from './view-tool-relay'

function moduleFor(viewId: string) {
  if (!parseToolTarget(`view:${viewId}`)) throw new Error('Invalid view ID.')
  return `views/${viewId}`
}

export async function listServerTools(
  workspacePath: string,
  viewId: string,
  signal?: AbortSignal
): Promise<ToolDescriptor[]> {
  return readToolDescriptors(
    parse(await callToolWorker(workspacePath, moduleFor(viewId), 'list-tools', '', '', signal))
  )
}

export async function callServerTool(
  workspacePath: string,
  viewId: string,
  name: string,
  args: unknown,
  signal?: AbortSignal
): Promise<JsonValue> {
  return parse(
    await callToolWorker(
      workspacePath,
      moduleFor(viewId),
      'call-tool',
      name,
      stringify(args),
      signal
    )
  ) as JsonValue
}

function viewIdFor(target: string): string {
  const parsed = parseToolTarget(target)
  if (!parsed) throw new Error('Use a view target such as view:orders.')
  return parsed.viewId
}

export async function listTools(
  workspace: { id: string; path: string },
  target: string,
  signal?: AbortSignal
) {
  const viewId = viewIdFor(target)
  const serverTools = await listServerTools(workspace.path, viewId, signal)
  const duplicate = (toolName: string) =>
    new Error(`Duplicate tool "${toolName}" for view:${viewId}: defined on the server and UI.`)
  const ui = viewToolRelay.availability(workspace.id, viewId)
  const uiTools = ui === 'available' ? viewToolRelay.list(workspace.id, viewId) : []
  for (const tool of uiTools)
    if (serverTools.some(server => server.name === tool.name)) throw duplicate(tool.name)
  return {
    target,
    tools: [
      ...serverTools.map(tool => toolInfo(tool, 'server')),
      ...uiTools.map(tool => toolInfo(tool, 'ui'))
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
  workspace: { id: string; path: string },
  target: string,
  name: string,
  args: unknown = {},
  signal?: AbortSignal
) {
  const viewId = viewIdFor(target)
  if (!isToolName(name))
    throw new Error('Use a tool name containing only letters, numbers, "_", "-", or ".".')
  if (!isRecord(args) || !isJsonValue(args))
    throw new Error('Tool arguments must be a JSON object.')
  const serverTools = await listServerTools(workspace.path, viewId, signal)
  if (serverTools.some(tool => tool.name === name)) {
    if (viewToolRelay.hasTool(workspace.id, viewId, name))
      throw new Error(`Duplicate tool "${name}" for ${target}: defined on the server and UI.`)
    return callServerTool(workspace.path, viewId, name, args, signal)
  }
  return viewToolRelay.call(workspace.id, viewId, name, args, signal)
}
