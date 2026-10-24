import { parse, stringify } from 'devalue'

import { isJsonValue, isRecord, isToolName, type JsonValue, type ToolDescriptor } from '@/lib/tools'

import { callToolWorker } from './functions'

function moduleFor(target: string): string {
  const match = /^view:([A-Za-z0-9_$-]+)$/.exec(target)
  if (!match) throw new Error('Use a tool target such as view:orders')
  return `views/${match[1]}`
}

export async function listTools(workspacePath: string, target: string, signal?: AbortSignal) {
  // The worker validates descriptors before returning them.
  return parse(
    await callToolWorker(workspacePath, moduleFor(target), 'list-tools', '', '', signal)
  ) as ToolDescriptor[]
}

export async function callTool(
  workspacePath: string,
  target: string,
  name: string,
  args: unknown = {},
  signal?: AbortSignal
): Promise<JsonValue> {
  const module = moduleFor(target)
  if (!isToolName(name)) throw new Error('Invalid tool name')
  if (!isRecord(args) || !isJsonValue(args)) throw new Error('Tool arguments must be a JSON object')
  return parse(
    await callToolWorker(workspacePath, module, 'call-tool', name, stringify(args), signal)
  ) as JsonValue
}
