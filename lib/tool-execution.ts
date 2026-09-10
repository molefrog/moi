import Ajv from 'ajv/dist/2020'
import { isJsonValue, isRecord, isToolName, type Tool, type ToolDescriptor } from './tools'

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })

export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Tool call cancelled. State may already have changed.'))
    if (signal.aborted) {
      void promise.catch(() => {})
      return abort()
    }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function prepareTool(value: unknown) {
  if (
    !isRecord(value) ||
    !isToolName(value.name) ||
    typeof value.description !== 'string' ||
    !value.description.trim() ||
    !isRecord(value.inputSchema) ||
    !isJsonValue(value.inputSchema) ||
    typeof value.execute !== 'function'
  ) {
    throw new Error(
      'A tool needs a valid name, description, JSON inputSchema and execute function.'
    )
  }
  const tool = value as Tool
  const descriptor: ToolDescriptor = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }
  if (value.annotations !== undefined) {
    if (
      !isRecord(value.annotations) ||
      !Object.entries(value.annotations).every(
        ([key, hint]) =>
          ['readOnlyHint', 'untrustedContentHint', 'consequentialHint'].includes(key) &&
          typeof hint === 'boolean'
      )
    )
      throw new Error(`Invalid annotations for tool ${tool.name}.`)
    descriptor.annotations = tool.annotations
  }
  const validate = ajv.compile(tool.inputSchema)
  ajv.removeSchema(tool.inputSchema)
  return {
    descriptor,
    async call(args: unknown, signal: AbortSignal) {
      signal.throwIfAborted()
      if (!isRecord(args) || !isJsonValue(args) || !validate(args))
        throw new Error(`Invalid tool arguments: ${ajv.errorsText(validate.errors)}`)
      const result = await abortable(
        Promise.resolve().then(() => {
          signal.throwIfAborted()
          return tool.execute(args, { signal })
        }),
        signal
      )
      if (!isJsonValue(result)) throw new Error('Tools must return a JSON-serializable result.')
      return result
    }
  }
}

// Metadata crosses the browser socket and HTTP boundary without executable code.
export function readToolDescriptors(value: unknown): ToolDescriptor[] {
  if (!Array.isArray(value)) throw new Error('Expected a tool descriptor array.')
  const names = new Set<string>()
  return value.map(item => {
    if (!isRecord(item)) throw new Error('Invalid tool descriptor.')
    const { descriptor } = prepareTool({ ...item, execute: async () => null })
    if (names.has(descriptor.name)) throw new Error(`Duplicate tool: ${descriptor.name}`)
    names.add(descriptor.name)
    return descriptor
  })
}
