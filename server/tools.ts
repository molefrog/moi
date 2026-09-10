import { parse, stringify } from 'devalue'
import { readToolDescriptors } from '@/lib/tool-execution'
import { parseCallAddress } from '@/lib/call-address'
import { isRecord, isJsonValue, toolInfo, type ToolDescriptor, type JsonValue } from '@/lib/tools'
import { callToolWorker } from './functions'
import { viewToolRelay } from './view-tool-relay'

function moduleFor(viewId: string) {
  if (!parseCallAddress(`view:${viewId}`) || viewId.includes('/'))
    throw new Error('Invalid view ID.')
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

// Resolve once. A failure at the selected location is returned without retrying
// the operation elsewhere. Raw server functions are deliberately outside this API.
export async function callTool(
  workspace: { id: string; path: string },
  address: string,
  args: unknown = {},
  signal?: AbortSignal
) {
  const target = parseCallAddress(address)
  if (!target)
    throw new Error('Use view:<name> to discover tools or view:<name>/<tool> to call one.')
  const { viewId, name } = target
  if (!isRecord(args) || !isJsonValue(args))
    throw new Error('Tool arguments must be a JSON object.')
  const serverTools = await listServerTools(workspace.path, viewId, signal)
  const duplicate = (toolName: string) =>
    new Error(
      `Duplicate tool: view:${viewId}/${toolName} is defined on both the server and the UI.`
    )
  if (name) {
    if (serverTools.some(tool => tool.name === name)) {
      if (viewToolRelay.hasTool(workspace.id, viewId, name)) throw duplicate(name)
      return callServerTool(workspace.path, viewId, name, args, signal)
    }
    return viewToolRelay.call(workspace.id, viewId, name, args, signal)
  }
  const ui = viewToolRelay.availability(workspace.id, viewId)
  const uiTools =
    ui === 'available'
      ? readToolDescriptors(await viewToolRelay.list(workspace.id, viewId, signal))
      : []
  for (const tool of uiTools)
    if (serverTools.some(server => server.name === tool.name)) throw duplicate(tool.name)
  return {
    tools: [
      ...serverTools.map(tool => toolInfo(viewId, tool, 'server')),
      ...uiTools.map(tool => toolInfo(viewId, tool, 'ui'))
    ],
    ui,
    ...(ui === 'unavailable'
      ? {
          message: `UI tools require an open view. Use moi tab focus view:${viewId}, then discover again.`
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
