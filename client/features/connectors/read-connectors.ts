import type { McpServer } from '@/lib/types'

export async function readConnectors(
  response: Response,
  onProgress: (connectors: McpServer[]) => void
): Promise<McpServer[]> {
  if (!response.ok || !response.body) throw new Error('Could not load connectors')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error('Connector discovery ended before completion')
      buffer += chunk.value
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (!line.trim()) continue
        const frame = JSON.parse(line) as {
          connectors?: McpServer[]
          done?: boolean
          error?: string
        }
        if (frame.error) throw new Error(frame.error)
        if (!frame.connectors) continue
        if (frame.done) return frame.connectors
        onProgress(frame.connectors)
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
